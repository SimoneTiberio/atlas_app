import atlas from '../../data/atlas.json';
import { defaults, validateStep } from '../sales/engine.js';
import { workloadKeys } from '../sales/catalogAdapter.js';
import { initialState } from '../technical/explorerModel.js';

export const SESSION_KEY = 'atlas.scenario';
export const SCHEMA_VERSION = 1;
export const catalogVersion = atlas.assumptions.data_as_of;
const atlasWorkload = key => Object.keys(workloadKeys).find(id => workloadKeys[id] === key);
const positiveInteger = n => Number.isSafeInteger(Number(n)) && Number(n) > 0;
export const fabricProtocol = f => /InfiniBand/i.test(f.fabric) ? 'InfiniBand' : /RoCE/i.test(f.fabric) ? 'RoCE' : null;
export const meetsSalesNetwork = (f, input) => (input.protocol === 'Any' || input.protocol === fabricProtocol(f)) && (!input.speedGbps || Number(f.plane_gbps) >= Number(input.speedGbps));

export function newScenario() {
  return { schemaVersion: SCHEMA_VERSION, catalogVersion, id: null,
    sales: { input: { ...defaults }, step: 0, completed: false, selections: {} },
    technical: { state: { ...initialState, selectedFabric: null } }, handoff: null };
}

// Inputs only: never persist or transfer a calculated result.
export function mapSalesSelection(input, platformId, options = {}, data = atlas) {
  const errors = [], platform = data.platforms.find(p => p.id === platformId), workload = atlasWorkload(input.workload);
  if (!platform) errors.push(`Platform “${platformId}” is no longer in Atlas.`);
  else if (!platform.workloads[workload]) errors.push(`${platform.name} is not eligible for ${workload || input.workload} in Technical.`);
  if (!workload || !data.workloads.includes(workload)) errors.push(`Workload “${input.workload}” cannot be mapped to Technical.`);
  if (!positiveInteger(input.gpuCount)) errors.push('The accelerator target must be a positive, safe whole number.');
  if (options.fabric) {
    const fabric = data.fabric_options.find(f => f.id === options.fabric && f.platform === platformId);
    if (!fabric) errors.push(`Fabric “${options.fabric}” is not available for this platform.`);
    else if (!meetsSalesNetwork(fabric, input)) errors.push(`Fabric “${options.fabric}” no longer matches the Sales protocol or connection-speed requirement. Select a compatible fabric or explicitly clear the choice.`);
  }
  if (options.storage && !data.storage.some(s => s.id === options.storage && s.role === 'performance')) errors.push(`Storage “${options.storage}” cannot be sized by Technical; select an Atlas performance storage product.`);
  if (errors.length) return { errors };
  return { errors, state: { ...initialState, vendor: 'All', platform: platformId, workload, gpus: Number(input.gpuCount),
    storage: options.storage || initialState.storage, selectedFabric: options.fabric || null, showAll: !!options.fabric },
    handoff: { platformId, workload, acceleratorTarget: Number(input.gpuCount), fabricId: options.fabric || null, storageId: options.storage || null,
      context: Object.fromEntries(['vendor', 'protocol', 'speedGbps', 'cooling', 'maxMw', 'rackKw', 'maxRacks', 'unitKw', 'serverU'].map(k => [k, input[k]])) } };
}

export function handoffScenario(scenario, input, platformId, options, id) {
  const mapping = mapSalesSelection(input, platformId, options);
  if (mapping.errors.length) return mapping;
  return { errors: [], scenario: { ...scenario, id: scenario.id || id, catalogVersion,
    technical: { state: mapping.state }, handoff: mapping.handoff } };
}

export function technicalIssues(state, data = atlas) {
  const errors = [], p = data.platforms.find(p => p.id === state?.platform);
  if (!p) errors.push(`Unknown Technical platform “${state?.platform}”.`);
  if (!data.workloads.includes(state?.workload)) errors.push(`Unknown Technical workload “${state?.workload}”.`);
  if (!['All', ...new Set(data.platforms.map(p => p.vendor))].includes(state?.vendor)) errors.push('Unknown Technical vendor filter.');
  if (p && state.vendor !== 'All' && state.vendor !== p.vendor) errors.push('The saved platform does not match the Technical vendor filter.');
  // Preserve the explorer's legitimate no-eligible-platform empty state.
  if (p && !p.workloads[state.workload] && data.platforms.some(x => (state.vendor === 'All' || state.vendor === x.vendor) && x.workloads[state.workload])) errors.push(`${p.name} is not eligible for the saved Technical workload “${state.workload}”.`);
  if (!Number.isInteger(Number(state?.gpus)) || Number(state?.gpus) <= 0) errors.push('Invalid Technical accelerator target.');
  if (p && state.density && !p.rack_options.some(o => o.id === state.density)) errors.push(`Unknown rack density “${state.density}” for ${p.name}.`);
  if (p && state.profile && !p.power_profiles?.some(o => o.id === state.profile)) errors.push(`Unknown power profile “${state.profile}” for ${p.name}.`);
  if (state?.selectedFabric && !data.fabric_options.some(f => f.id === state.selectedFabric && f.platform === p?.id)) errors.push(`Unknown or incompatible fabric “${state.selectedFabric}”.`);
  if (!data.storage.some(s => s.id === state?.storage && s.role === 'performance')) errors.push(`Unknown or unsupported storage “${state?.storage}”.`);
  if (!data.frontend.some(f => f.id === state?.frontend)) errors.push(`Unknown CPU option “${state?.frontend}”.`);
  if (typeof state?.showAll !== 'boolean') errors.push('Invalid fabric display setting.');
  return errors;
}

export function recoverScenario(raw) {
  if (!raw) return { scenario: newScenario(), errors: [], warnings: [] };
  try {
    const s = JSON.parse(raw), errors = [];
    if (s.schemaVersion !== SCHEMA_VERSION) return { errors: [`Scenario version ${s.schemaVersion ?? 'unknown'} is unsupported. Your saved session has not been replaced.`], warnings: [] };
    if (!s.sales || !s.technical || !Number.isInteger(s.sales.step) || s.sales.step < 0 || s.sales.step > 2 || typeof s.sales.completed !== 'boolean' || !s.sales.selections || typeof s.sales.selections !== 'object') errors.push('The saved wizard progress is invalid.');
    if (!s.sales?.input || Object.keys(defaults).some(k => !Object.hasOwn(s.sales.input, k) || !['number', 'string'].includes(typeof s.sales.input[k]))) errors.push('The saved Sales inputs are incomplete.');
    else {
      // In-progress numeric validation errors are legitimate wizard state.
      errors.push(...validateStep(s.sales.input, 0));
      if (!['Any', 'InfiniBand', 'RoCE'].includes(s.sales.input.protocol) || !['', 400, 800].includes(s.sales.input.speedGbps) || !['unknown', 'air', 'liquid'].includes(s.sales.input.cooling)) errors.push('A saved Sales network or cooling option cannot be mapped.');
      if (s.sales.completed) errors.push(...[1, 2].flatMap(i => validateStep(s.sales.input, i)));
    }
    errors.push(...technicalIssues(s.technical?.state));
    for (const [id, selection] of Object.entries(s.sales?.selections || {})) {
      if (!atlas.platforms.some(p => p.id === id)) errors.push(`Saved Sales platform “${id}” is no longer in Atlas.`);
      if (selection?.fabric && !atlas.fabric_options.some(f => f.id === selection.fabric && f.platform === id)) errors.push(`Saved fabric “${selection.fabric}” is no longer compatible.`);
      if (selection?.storage && !atlas.storage.some(p => p.id === selection.storage && p.role === 'performance')) errors.push(`Saved storage “${selection.storage}” cannot be mapped.`);
    }
    if (s.handoff) {
      const h = s.handoff;
      const check = mapSalesSelection({ ...defaults, workload: workloadKeys[h.workload], gpuCount: h.acceleratorTarget }, h.platformId, { fabric: h.fabricId, storage: h.storageId });
      errors.push(...check.errors);
      if (!h.context || typeof h.context !== 'object') errors.push('Saved Sales scenario context is missing.');
    }
    return { scenario: errors.length ? undefined : s, errors, warnings: s.catalogVersion !== catalogVersion ? [`Catalog changed from ${s.catalogVersion} to ${catalogVersion}. Inputs were checked by identifier; results are recalculated.`] : [] };
  } catch { return { errors: ['The saved scenario could not be read. It has not been replaced.'], warnings: [] }; }
}

export function scenarioMetadata(scenario) {
  return scenario ? { schemaVersion: scenario.schemaVersion, id: scenario.id, handoff: scenario.handoff,
    salesSelections: scenario.sales.selections, note: 'Sales context is retained for review only. Each workflow recalculates using its own inputs and assumptions.' } : null;
}

export { atlas };
