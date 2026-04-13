"""Minimal local API server that mimics api.policyengine.org/us/calculate.

Uses the locally installed policyengine-us package.
Run: python scripts/local_api.py
"""

import json
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from policyengine_us import Simulation


def _find_null_vars(household):
    """Find all variables set to null (requested for computation)."""
    null_vars = []
    for entity_plural, entities in household.items():
        if not isinstance(entities, dict):
            continue
        for entity_id, entity_data in entities.items():
            if entity_id == "members":
                continue
            if not isinstance(entity_data, dict):
                continue
            for var_name, var_data in entity_data.items():
                if var_name == "members":
                    continue
                if isinstance(var_data, dict):
                    for period, value in var_data.items():
                        if value is None:
                            null_vars.append(
                                (entity_plural, entity_id, var_name, str(period))
                            )
    return null_vars


def compute(household):
    """Run Simulation and return results in the public API format."""
    sim = Simulation(situation=household)
    null_vars = _find_null_vars(household)

    # Build result by computing each requested variable
    result = {}
    for entity_plural, entity_id, var_name, period in null_vars:
        try:
            value = sim.calculate(var_name, period)
            # Single-entity situation: take first value
            val = value.tolist()[0] if hasattr(value, "tolist") else value
        except Exception:
            val = None

        result.setdefault(entity_plural, {}).setdefault(entity_id, {})
        result[entity_plural][entity_id].setdefault(var_name, {})[period] = val

    return result


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def do_POST(self):
        if self.path != "/us/calculate":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        household = body.get("household", {})

        try:
            result = compute(household)
            self.send_response(200)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps({"status": "ok", "result": result}).encode()
            )
        except Exception as e:
            traceback.print_exc()
            self.send_response(500)
            self._cors_headers()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps({"status": "error", "message": str(e)}).encode()
            )

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format, *args):
        print(f"[local-api] {args[0]}")


if __name__ == "__main__":
    port = 5100
    server = HTTPServer(("localhost", port), Handler)
    print(f"Local PolicyEngine API running at http://localhost:{port}")
    from importlib.metadata import version
    print(f"Using policyengine-us v{version('policyengine-us')}")
    print(f"POST http://localhost:{port}/us/calculate")
    server.serve_forever()
