/**
 * Deep validation: dump parsed parameter values and compare with API.
 */
const API_URL = 'https://api.policyengine.org';

async function fetchAndDumpParams() {
  console.log('Fetching metadata (~60MB)...');
  const res = await fetch(`${API_URL}/us/metadata`);
  const data = await res.json();
  const params = data.result?.parameters ?? {};

  const get = (key) => {
    const p = params[key];
    if (!p?.values) return { value: 0, raw: null };
    const dates = Object.keys(p.values).sort();
    return { value: p.values[dates[dates.length - 1]], allDates: p.values, latestDate: dates[dates.length - 1] };
  };

  // ── MA standard payment table ──
  console.log('\n=== MA Standard Payment Table (non_subsidized) ===');
  console.log('Level | UTILITY_AND_HEAT_IN_RENT | DELIVERABLE_FUEL');
  for (let lvl = 1; lvl <= 6; lvl++) {
    const util = get(`gov.states.ma.doer.liheap.standard.amount.non_subsidized.${lvl}.UTILITY_AND_HEAT_IN_RENT`);
    const deliv = get(`gov.states.ma.doer.liheap.standard.amount.non_subsidized.${lvl}.DELIVERABLE_FUEL`);
    console.log(`  ${lvl}   | $${util.value} (${util.latestDate})  | $${deliv.value} (${deliv.latestDate})`);
  }

  console.log('\n=== MA Standard Payment Table (subsidized) ===');
  for (let lvl = 1; lvl <= 6; lvl++) {
    const util = get(`gov.states.ma.doer.liheap.standard.amount.subsidized.${lvl}.UTILITY_AND_HEAT_IN_RENT`);
    const deliv = get(`gov.states.ma.doer.liheap.standard.amount.subsidized.${lvl}.DELIVERABLE_FUEL`);
    console.log(`  ${lvl}   | $${util.value} (${util.latestDate})  | $${deliv.value} (${deliv.latestDate})`);
  }

  console.log('\n=== MA HECS Table (non_subsidized) ===');
  for (let lvl = 1; lvl <= 6; lvl++) {
    const hecs = get(`gov.states.ma.doer.liheap.hecs.amount.non_subsidized.${lvl}`);
    console.log(`  ${lvl}   | $${hecs.value} (${hecs.latestDate})`);
  }

  // Also check if there's subsidized HECS
  console.log('\n=== MA HECS Table (subsidized, check if exists) ===');
  for (let lvl = 1; lvl <= 6; lvl++) {
    const hecs = get(`gov.states.ma.doer.liheap.hecs.amount.subsidized.${lvl}`);
    console.log(`  ${lvl}   | $${hecs.value} (${hecs.latestDate || 'NOT FOUND'})`);
  }

  // ── DC income increment and eligibility ──
  console.log('\n=== DC Parameters ===');
  const dcInc = get('gov.states.dc.doee.liheap.income_level_increment');
  console.log(`Income increment: $${dcInc.value} (${dcInc.latestDate})`);
  console.log(`All dates:`, dcInc.allDates);

  // Check if there's a separate DC eligibility parameter
  console.log('\n=== Searching for DC eligibility parameters ===');
  const dcParams = Object.keys(params).filter(k => k.includes('dc') && k.includes('liheap') && k.includes('elig'));
  console.log(dcParams.length ? dcParams.join('\n') : 'None found with "elig" in path');

  const dcIncomeParams = Object.keys(params).filter(k => k.includes('dc') && k.includes('liheap') && k.includes('income'));
  console.log('\nDC LIHEAP income-related params:');
  for (const p of dcIncomeParams) {
    const v = get(p);
    console.log(`  ${p}: ${v.value} (${v.latestDate})`);
  }

  // ── IL eligibility threshold ──
  console.log('\n=== IL Parameters ===');
  const ilEligParams = Object.keys(params).filter(k => k.includes('il') && k.includes('liheap') && (k.includes('elig') || k.includes('threshold') || k.includes('income')));
  for (const p of ilEligParams) {
    const v = get(p);
    console.log(`  ${p}: ${v.value} (${v.latestDate})`);
  }

  // ── MA eligibility ──
  console.log('\n=== MA LIHEAP eligibility params ===');
  const maEligParams = Object.keys(params).filter(k => k.includes('ma') && k.includes('liheap') && (k.includes('elig') || k.includes('income') || k.includes('threshold') || k.includes('level') || k.includes('fpl')));
  for (const p of maEligParams) {
    const v = get(p);
    console.log(`  ${p}: ${v.value} (${v.latestDate})`);
  }

  // ── MA benefit level thresholds ──
  console.log('\n=== MA LIHEAP benefit level params ===');
  const maLevelParams = Object.keys(params).filter(k => k.includes('ma') && k.includes('liheap') && k.includes('benefit'));
  for (const p of maLevelParams) {
    const v = get(p);
    console.log(`  ${p}: ${JSON.stringify(v.value)} (${v.latestDate})`);
  }

  // Check ALL MA LIHEAP params
  console.log('\n=== ALL MA LIHEAP params ===');
  const allMA = Object.keys(params).filter(k => k.includes('ma') && k.includes('liheap'));
  for (const p of allMA) {
    const v = get(p);
    console.log(`  ${p}: ${v.value} (${v.latestDate})`);
  }
}

fetchAndDumpParams().catch(console.error);
