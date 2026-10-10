import { catalog, workloads } from './catalog.js';
export function getFleetGuidance(input, data = catalog) {
 const platforms = data.platforms.filter(p => (input.vendor === 'Any' || p.vendor === input.vendor) && (input.gpuModel === 'Any' || p.id === input.gpuModel) && p.workloads.includes(input.workload));
 return {title:workloads[input.workload],platforms,storage:data.storage[input.workload],warnings:platforms.length ? [] : ['No platform in Atlas lists this workload for your selection. Engineering qualification is needed.']};
}
