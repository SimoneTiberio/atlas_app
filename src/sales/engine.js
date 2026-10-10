import { catalog, workloads } from './catalog.js';
export const defaults = { vendor: 'NVIDIA', gpuModel: 'Any', workload: 'training', gpuCount: 2000, protocol: 'Any', speedGbps: '', cooling: 'unknown', maxMw: '', rackKw: '', maxRacks: '', unitKw: '', serverU: '' };
const present = v => v !== '' && v !== undefined && v !== null;
const positive = v => present(v) && String(v).trim() !== '' && Number.isFinite(Number(v)) && Number(v) > 0;
export function validateStep(input, step, data = catalog) {
  const errors = [];
  if (step === 0) {
    if (!['Any', 'NVIDIA', 'AMD'].includes(input.vendor)) errors.push('Select a GPU vendor.');
    if (!Object.hasOwn(workloads, input.workload)) errors.push('Select a workload.');
    if (input.gpuModel !== 'Any' && !data.platforms.some(p => p.id === input.gpuModel && (input.vendor === 'Any' || p.vendor === input.vendor))) errors.push('Select a platform for the chosen vendor.');
  }
  if (step === 1) {
    if (!positive(input.gpuCount) || !Number.isSafeInteger(Number(input.gpuCount))) errors.push('GPU count must be a positive whole number.');
    if (!['Any', 'InfiniBand', 'RoCE'].includes(input.protocol)) errors.push('Select a network protocol.');
    if (!['', 400, 800].includes(input.speedGbps)) errors.push('Select a network speed.');
  }
  if (step === 2) {
    if (!['unknown', 'air', 'liquid'].includes(input.cooling)) errors.push('Select facility cooling.');
    for (const key of ['maxMw', 'rackKw', 'maxRacks', 'unitKw', 'serverU']) {
      if (present(input[key]) && (!positive(input[key]) || (['maxRacks', 'serverU'].includes(key) && !Number.isSafeInteger(Number(input[key]))))) errors.push(`${{maxMw:'Facility power',rackKw:'Rack power',maxRacks:'Rack limit',unitKw:'OEM unit power',serverU:'Server height'}[key]} must be a positive${['maxRacks','serverU'].includes(key) ? ' whole' : ''} number.`);
    }
    if (input.gpuModel === 'Any' && (present(input.unitKw) || present(input.serverU))) errors.push('Select one platform before entering its OEM specifications.');
  }
  return errors;
}
export function evaluate(input, data = catalog) {
  const errors = [0,1,2].flatMap(step => validateStep(input, step, data));
  const result = { errors, matches: [], incomplete: [], rejected: [], pending: [], storage: data.storage[input.workload] ?? null };
  if (errors.length) return result;
  for (const platform of data.platforms.filter(p => (input.vendor === 'Any' || p.vendor === input.vendor) && (input.gpuModel === 'Any' || p.id === input.gpuModel))) {
    const reasons = [], reviews = [...(platform.mappingWarnings ?? [])];
    if (!platform.workloads.includes(input.workload)) reasons.push(`${workloads[input.workload]} is not listed for this platform in Atlas.`);
    if (platform.status === 'roadmap') {
      if (reasons.length) result.rejected.push({ platform, reasons });
      else result.pending.push({ platform, reasons: ['Final SKU, GPU count, networking and thermal specifications are unconfirmed.'] });
      continue;
    }
    if (!Number.isSafeInteger(platform.gpusPerUnit) || platform.gpusPerUnit <= 0 || !['server', 'rack'].includes(platform.unitType)) {
      if (reasons.length) result.rejected.push({ platform, reasons });
      else result.incomplete.push({ platform, gpuOnlyMw: null, reasons: ['Unit type or GPU count per unit is unconfirmed; sizing is unavailable.'] });
      continue;
    }
    const networks = platform.networks.filter(n => (input.protocol === 'Any' || n.protocol === input.protocol) && (!input.speedGbps || n.speedGbps >= input.speedGbps));
    if (!platform.networks.length) reviews.push('Scale-out protocol and speed require OEM confirmation; the requested network cannot yet be verified.');
    else if (!networks.length) reasons.push(`Atlas has no matching ${input.speedGbps || ''} Gbps ${input.protocol} network recommendation.`);
    if (platform.coolingType === 'liquid' && input.cooling === 'air') reasons.push('This platform requires direct liquid cooling.');
    else if (input.cooling === 'unknown' || platform.coolingType !== 'liquid') reviews.push(`Confirm cooling: ${platform.cooling}`);
    const units = Math.ceil(Number(input.gpuCount) / platform.gpusPerUnit);
    const provisionedGpus = units * platform.gpusPerUnit;
    if (!Number.isSafeInteger(provisionedGpus)) { result.rejected.push({platform, reasons:['Rounded GPU count exceeds the supported numeric range.']}); continue; }
    const hasOemPower = input.gpuModel === platform.id && positive(input.unitKw);
    const unitKw = hasOemPower ? Number(input.unitKw) : platform.power?.unitKw ?? null;
    const powerBasis = hasOemPower ? 'oem-input' : unitKw ? platform.power.basis : 'unknown';
    const gpuOnlyMw = platform.power?.gpuWatts ? provisionedGpus * platform.power.gpuWatts / 1000000 : null;
    if (powerBasis === 'rack-reference' || powerBasis === 'server-reference') reviews.push(`Power uses the Atlas ${platform.unitType} rating; confirm the OEM budget. This is not measured average consumption.`);
    if (gpuOnlyMw !== null) reviews.push('GPU-only rated power excludes host CPUs, RAM, NICs, fans and conversion losses; it is not full-server or facility demand.');
    const serverU = input.gpuModel === platform.id && positive(input.serverU) ? Number(input.serverU) : null;
    let racks = platform.unitType === 'rack' ? units : null;
    let perRack = platform.unitType === 'rack' ? 1 : null;
    if (platform.unitType === 'server' && unitKw && serverU && positive(input.rackKw)) {
      perRack = Math.min(Math.floor(data.assumptions.usableU / serverU), Math.floor(Number(input.rackKw) / unitKw));
      if (!perRack) reasons.push('A server exceeds the rack space or power limit.');
      else racks = Math.ceil(units / perRack);
    }
    if (racks === null) reviews.push('Rack count needs OEM server height, full-system power and a rack power limit.');
    if (!unitKw) reviews.push(`Provide OEM full-${platform.unitType} power to estimate facility demand.`);
    if (unitKw && positive(input.rackKw) && unitKw > Number(input.rackKw)) reasons.push(`${powerBasis === 'oem-input' ? 'OEM' : 'Reference'} unit power exceeds the rack power limit.`);
    const computeMw = unitKw ? units * unitKw / 1000 : null;
    const facilityMw = computeMw === null ? null : computeMw * (1 + data.assumptions.ancillaryFraction) * data.assumptions.pue;
    if (unitKw !== null && (!Number.isFinite(computeMw) || computeMw <= 0 || !Number.isFinite(facilityMw) || facilityMw <= 0)) {
      result.rejected.push({platform, reasons:['Calculated power is outside the supported numeric range. Check the GPU count and OEM unit power.']});
      continue;
    }
    if (positive(input.maxMw) && facilityMw !== null && facilityMw > Number(input.maxMw)) reasons.push(`Estimated facility demand ${facilityMw.toFixed(3)} MW exceeds the ${input.maxMw} MW power budget.`);
    if (positive(input.maxRacks) && racks !== null && racks > Number(input.maxRacks)) reasons.push('Compute rack count exceeds the rack limit.');
    reviews.push('Validate OEM NIC topology, fabric capacity and workload performance. The Sales engine does not enforce a cluster ceiling.');
    const missing = [];
    if (facilityMw === null) missing.push(`Enter OEM full-${platform.unitType} peak power in step 3. GPU-only ratings cannot confirm facility demand.`);
    if (positive(input.maxRacks) && racks === null) missing.push('Enter OEM server height and rack power capacity to check the rack-count limit.');
    const powerBudgetMw = positive(input.maxMw) ? Number(input.maxMw) : null;
    const powerHeadroomMw = powerBudgetMw !== null && facilityMw !== null ? powerBudgetMw - facilityMw : null;
    const rackPeakKw = perRack && unitKw ? perRack * unitKw : null;
    const entry = { platform, units, provisionedGpus, extraGpus: provisionedGpus - Number(input.gpuCount), racks, perRack, rackPeakKw, unitKw, powerBasis, gpuOnlyMw, computeMw, facilityMw, powerBudgetMw, powerHeadroomMw, powerStatus: facilityMw === null ? 'unconfirmed' : powerBudgetMw === null ? 'budget-not-provided' : powerHeadroomMw < 0 ? 'over-budget' : 'within-budget', networks, reviews, status: missing.length ? 'specifications-required' : 'engineering-review' };
    if (reasons.length) result.rejected.push({ ...entry, reasons });
    else if (missing.length) result.incomplete.push({ ...entry, reasons: missing });
    else result.matches.push(entry);
  }
  return result;
}
