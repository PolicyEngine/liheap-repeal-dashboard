/**
 * Validate local computeBenefit against the PolicyEngine API.
 * Uses the FIXED logic: valueAt() for parameter dates, MA-specific FPG, no HECS, no IL 2.0 cutoff.
 */

const API_URL = 'https://api.policyengine.org';

const SIM_YEAR = 2024;
const EVAL_DATE = `${SIM_YEAR}-01-01`;
const MA_FPG_DATE = `${SIM_YEAR - 1}-10-01`;

function valueAt(values, targetDate) {
  const dates = Object.keys(values).sort();
  let result = 0;
  for (const date of dates) {
    if (date <= targetDate) {
      result = values[date];
    } else {
      break;
    }
  }
  return result;
}

// ── API call ──
async function apiCall(state, income, expense, heatingType, householdSize = 1) {
  const year = SIM_YEAR;
  const people = { adult_1: { age: { [year]: 35 }, employment_income: { [year]: income } } };
  if (expense > 0) people.adult_1.heating_expense_person = { [year]: expense };
  const members = ['adult_1'];
  for (let i = 1; i < householdSize; i++) {
    const pid = i < 2 ? `adult_${i + 1}` : `child_${i - 1}`;
    people[pid] = { age: { [year]: i < 2 ? 40 : 5 + i * 3 } };
    members.push(pid);
  }
  const spm = { members };
  const isHeatInRent = heatingType === 'HEAT_IN_RENT' || heatingType === 'CASH';
  if (state === 'DC') {
    spm.dc_liheap_heating_type = { [year]: heatingType };
    spm.dc_liheap_housing_type = { [year]: 'MULTI_FAMILY' };
    spm.dc_liheap_eligible = { [year]: null };
    spm.dc_liheap_payment = { [year]: null };
  } else if (state === 'MA') {
    spm.ma_liheap_heating_type = { [year]: isHeatInRent ? 'ELECTRICITY' : heatingType };
    if (isHeatInRent) spm.heat_expense_included_in_rent = { [year]: true };
    spm.ma_liheap_eligible = { [year]: null };
    spm.ma_liheap = { [year]: null };
    spm.ma_liheap_standard_payment = { [year]: null };
  } else {
    spm.il_liheap_heating_type = { [year]: heatingType };
    spm.il_liheap_eligible = { [year]: null };
    spm.il_liheap = { [year]: null };
  }
  const household = {
    people,
    spm_units: { spm_unit: spm },
    tax_units: { tax_unit: { members } },
    families: { family: { members } },
    marital_units: { marital_unit: { members: members.slice(0, Math.min(2, members.length)) } },
    households: { household: { members, state_code: { [year]: state } } },
  };
  const res = await fetch(`${API_URL}/us/calculate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ household }),
  });
  const data = await res.json();
  const s = data.result?.spm_units?.spm_unit;
  if (state === 'DC') return { eligible: s?.dc_liheap_eligible?.[year], payment: s?.dc_liheap_payment?.[year] ?? 0 };
  if (state === 'MA') return { eligible: s?.ma_liheap_eligible?.[year], payment: s?.ma_liheap?.[year] ?? 0, standard: s?.ma_liheap_standard_payment?.[year] };
  return { eligible: s?.il_liheap_eligible?.[year], payment: s?.il_liheap?.[year] ?? 0 };
}

// ── Local computation (FIXED) ──
let liheapData = null;

async function fetchData() {
  console.log('Fetching metadata...');
  const res = await fetch(`${API_URL}/us/metadata`);
  const data = await res.json();
  const params = data.result?.parameters ?? {};
  const get = (key, date = EVAL_DATE) => {
    const p = params[key];
    if (!p?.values) return 0;
    return valueAt(p.values, date);
  };

  // FPL
  const fplFP = get('gov.hhs.fpg.first_person.CONTIGUOUS_US');
  const fplAP = get('gov.hhs.fpg.additional_person.CONTIGUOUS_US');
  const maFplFP = get('gov.hhs.fpg.first_person.CONTIGUOUS_US', MA_FPG_DATE);
  const maFplAP = get('gov.hhs.fpg.additional_person.CONTIGUOUS_US', MA_FPG_DATE);
  console.log(`FPL (2024): $${fplFP} + $${fplAP}/person`);
  console.log(`MA FPL (2023-10-01): $${maFplFP} + $${maFplAP}/person`);

  // DC
  const dcIncrement = get('gov.states.dc.doee.liheap.income_level_increment');
  const dcHIR = get('gov.states.dc.doee.liheap.payment.heat_in_rent');
  const dcOil = get('gov.states.dc.doee.liheap.payment.oil');
  const dcPay = {};
  for (const fuel of ['electricity', 'gas']) {
    const fk = fuel === 'electricity' ? 'ELECTRICITY' : 'GAS';
    dcPay[fk] = {};
    for (const h of ['MULTI_FAMILY', 'SINGLE_FAMILY']) {
      const m = [];
      for (let l = 1; l <= 10; l++) { const r = []; for (let s = 1; s <= 4; s++) r.push(get(`gov.states.dc.doee.liheap.payment.${fuel}.${h}.${l}.${s}`)); m.push(r); }
      dcPay[fk][h] = m;
    }
  }

  // MA standard
  const maStd = {};
  for (const sub of ['non_subsidized', 'subsidized']) {
    const lvls = [];
    for (let l = 1; l <= 6; l++) {
      lvls.push([
        get(`gov.states.ma.doer.liheap.standard.amount.${sub}.${l}.UTILITY_AND_HEAT_IN_RENT`),
        get(`gov.states.ma.doer.liheap.standard.amount.${sub}.${l}.DELIVERABLE_FUEL`),
      ]);
    }
    maStd[sub] = lvls;
  }
  console.log('MA standard (non_sub, utility):', maStd.non_subsidized.map(r => r[0]));

  // IL
  const ilMap = { ALL_ELECTRIC: 'all_electric', NAT_GAS_OTHER: 'nat_gas', PROPANE_FUEL_OIL: 'propane', CASH: 'cash' };
  const ilMat = {};
  for (const [fk, pf] of Object.entries(ilMap)) {
    const m = [];
    for (let b = 1; b <= 4; b++) { const r = []; for (let s = 1; s <= 6; s++) r.push(get(`gov.states.il.dceo.liheap.payment.matrix.${pf}.${b}.${s}`)); m.push(r); }
    ilMat[fk] = m;
  }
  const ilThr = [];
  for (let i = 0; i < 4; i++) ilThr.push(get(`gov.states.il.dceo.liheap.payment.income_bracket[${i}].threshold`));

  liheapData = {
    dc: { incomeIncrement: dcIncrement, heatInRent: dcHIR, oil: dcOil, payment: dcPay },
    ma: { standard: maStd, hecs: [] },
    il: { matrices: ilMat, bracketThresholds: ilThr },
    fpl: { firstPerson: fplFP, additionalPerson: fplAP, maFirstPerson: maFplFP, maAdditionalPerson: maFplAP },
  };
}

function getFPL(size, state) {
  const fp = state === 'MA' ? liheapData.fpl.maFirstPerson : liheapData.fpl.firstPerson;
  const ap = state === 'MA' ? liheapData.fpl.maAdditionalPerson : liheapData.fpl.additionalPerson;
  return fp + ap * (Math.max(1, size) - 1);
}

function localBenefit(state, income, expense, heatingType, householdSize = 1, housingType = 'MULTI_FAMILY', subsidized = false) {
  const d = liheapData;
  switch (state) {
    case 'DC': {
      if (heatingType === 'HEAT_IN_RENT') return d.dc.heatInRent;
      if (heatingType === 'OIL') return Math.min(d.dc.oil, expense);
      const lvl = income <= 0 ? 1 : Math.min(10, Math.ceil(income / d.dc.incomeIncrement));
      const si = Math.min(Math.max(1, householdSize), 4) - 1;
      const m = d.dc.payment[heatingType]?.[housingType];
      if (!m) return 0;
      return Math.min(m[lvl - 1][si], expense);
    }
    case 'MA': {
      const fpl = getFPL(householdSize, 'MA');
      const ratio = income / fpl;
      let level;
      if (ratio < 1.0) level = 1;
      else if (ratio < 1.25) level = 2;
      else if (ratio < 1.5) level = 3;
      else if (ratio < 1.75) level = 4;
      else if (ratio < 2.0) level = 5;
      else level = 6;
      const DELIV = ['HEATING_OIL_AND_PROPANE', 'KEROSENE', 'OTHER'];
      const fi = DELIV.includes(heatingType) ? 1 : 0;
      const table = subsidized ? d.ma.standard.subsidized : d.ma.standard.non_subsidized;
      const stdPay = table[level - 1][fi];
      // NO HECS in chart computation
      if (heatingType === 'HEAT_IN_RENT') return stdPay;
      return Math.min(stdPay, expense);
    }
    case 'IL': {
      // No hardcoded 2.0 cutoff — eligibility uses max(60% SMI, 200% FPL)
      const fpl = getFPL(householdSize, 'IL');
      const ratio = income / fpl;
      const thr = d.il.bracketThresholds;
      let bracket = 1;
      for (let i = thr.length - 1; i >= 0; i--) { if (ratio >= thr[i]) { bracket = i + 1; break; } }
      const si = Math.min(Math.max(1, householdSize), 6) - 1;
      const m = d.il.matrices[heatingType];
      if (!m) return 0;
      const amt = m[bracket - 1][si];
      if (heatingType === 'CASH') return amt;
      return Math.min(amt, expense);
    }
    default: return 0;
  }
}

// ── Run ──
async function run() {
  await fetchData();
  const expense = 3000;

  const tests = [
    { state: 'DC', ht: 'ELECTRICITY', incomes: [0, 5000, 10000, 15000, 20000, 25000, 30000, 40000] },
    { state: 'MA', ht: 'ELECTRICITY', incomes: [0, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000] },
    { state: 'IL', ht: 'ALL_ELECTRIC', incomes: [0, 5000, 10000, 15000, 20000, 25000, 30000, 35000] },
  ];

  for (const t of tests) {
    console.log(`\n=== ${t.state} / ${t.ht} / Size 1 / Expense $${expense} ===`);
    console.log(`${'Income'.padStart(8)}  ${'API Elig'.padStart(8)}  ${'API Pay'.padStart(8)}  ${'Local'.padStart(8)}  Match?`);
    console.log('-'.repeat(55));
    for (const inc of t.incomes) {
      const api = await apiCall(t.state, inc, expense, t.ht);
      const local = localBenefit(t.state, inc, expense, t.ht);
      const apiPay = api.eligible ? api.payment : 0;
      const match = Math.abs(apiPay - local) < 1;
      console.log(
        `$${inc.toLocaleString().padStart(7)}  ${String(api.eligible).padStart(8)}  $${apiPay.toLocaleString().padStart(7)}  $${local.toLocaleString().padStart(7)}  ${match ? 'OK' : `** MISMATCH ** (diff=${apiPay - local})`}`
      );
    }
  }

  // Expense variation test
  console.log(`\n=== DC / ELECTRICITY / Size 1 / Income $10000 / Varying expense ===`);
  for (const exp of [0, 100, 300, 500, 700, 1000, 2000, 3000]) {
    const api = await apiCall('DC', 10000, exp, 'ELECTRICITY');
    const local = localBenefit('DC', 10000, exp, 'ELECTRICITY');
    const apiPay = api.eligible ? api.payment : 0;
    const match = Math.abs(apiPay - local) < 1;
    console.log(`  Exp $${exp.toLocaleString().padStart(5)}: API=$${apiPay.toLocaleString().padStart(5)} Local=$${local.toLocaleString().padStart(5)}  ${match ? 'OK' : '** MISMATCH **'}`);
  }
}

run().catch(console.error);
