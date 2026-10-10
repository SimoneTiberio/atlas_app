import { byId, defaultRackOption, planCluster, rowFromPlan } from './engine.js';

export const workloadLabels = { training: 'Training', inference: 'Inference', fine_tuning: 'Fine-tuning', hpc: 'HPC (FP64 simulation)', digital_twin: 'Digital twin', mixed: 'Mixed' };
export const statusLabels = { shipping: ['Shipping', 'ship'], ramping: ['Ramping', 'ramp'], announced: ['Announced', 'ann'] };
export const initialState = { vendor: 'All', workload: 'training', platform: 'nv-gb300-nvl72', gpus: 10368, density: null, profile: null, storage: 'vast', frontend: 'epyc-turin', showAll: false };
export const unitWord = p => p.vendor === 'Cerebras' ? 'wafers' : 'GPUs';
export const visible = (p, state) => state.vendor === 'All' || p.vendor === state.vendor;
export const eligible = (p, state) => !!p.workloads[state.workload];
export const rackOption = (p, state) => p.rack_options.find(o => o.id === state.density) || defaultRackOption(p);
export const normalizeSize = value => Math.max(1, Math.round(+value || 1));

export function selectPlatform(state, id, data) {
  const before = byId(data.platforms, state.platform), p = byId(data.platforms, id);
  return { ...state, platform: id, density: null, profile: null,
    gpus: (before.vendor === 'Cerebras') !== (p.vendor === 'Cerebras') ? p.su_systems * p.accel_per_system : state.gpus };
}

export function updateState(state, field, value, data) {
  if (field === 'platform') return selectPlatform(state, value, data);
  const next = { ...state, [field]: field === 'gpus' ? normalizeSize(value) : value };
  if (field === 'vendor' || field === 'workload') {
    const p = byId(data.platforms, next.platform);
    if (!visible(p, next) || !eligible(p, next)) {
      const first = data.platforms.find(p => visible(p, next) && eligible(p, next)) || data.platforms.find(p => visible(p, next));
      if (first) return selectPlatform(next, first.id, data);
    }
  }
  return next;
}

export function sizePresets(p) {
  const su = p.su_systems * p.accel_per_system;
  return p.vendor === 'Cerebras'
    ? [[su, '1 scalable unit'], [32 * p.accel_per_system, `${32 * p.accel_per_system}`], [128 * p.accel_per_system, (128 * p.accel_per_system).toLocaleString('en-US')]]
    : [[su, '1 scalable unit'], [1024, '~1,000'], [10368, '~10,000'], [32768, '~32,000'], [131072, '~131,000']];
}

export function calculateRuns(state, data) {
  if (!data.platforms.some(p => visible(p, state) && eligible(p, state))) return [];
  const p = byId(data.platforms, state.platform), ro = rackOption(p, state);
  const base = { platform: p.id, gpus: state.gpus, rackOption: ro.id, workload: state.workload, storage: state.storage, frontend: state.frontend, powerProfile: state.profile || undefined };
  const runs = data.fabric_options.filter(f => f.platform === p.id).map(f => {
    const input = { ...base, fabric: f.id }, plan = planCluster(input, data);
    return { f, plan, row: rowFromPlan(input, plan, data), fits: !!plan.network.chosen };
  });
  // Preserve the archived explorer's fit/recommendation/power/ceiling ranking.
  runs.sort((a, b) => (b.fits - a.fits) || (b.f.recommended - a.f.recommended) ||
    ((a.plan.network.chosen?.switch_kw ?? 1e12) - (b.plan.network.chosen?.switch_kw ?? 1e12)) ||
    (b.f.limits.max_gpus_2tier ?? 0) - (a.f.limits.max_gpus_2tier ?? 0));
  return runs;
}
