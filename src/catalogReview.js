// Audit qualification only; all reference specifications remain in data/atlas.json.
export const catalogReview = {
  reviewedOn: '2026-10-10', report: 'DATA_REVIEW.md', status: 'partially-verified',
  readiness: 'Presales estimates only; unresolved OEM specifications and evidence prevent engineering approval.',
  confidencePolicy: 'Published/partner/estimate are inherited catalog labels, not verification of every field. Complete configurations, typical power, fabric validation and ancillary sizing remain unverified where field-level evidence is missing.',
  configurationPolicy: 'Generic platform, chassis, density, power and NIC specifications may describe different OEM configurations. Do not assume they are interchangeable.',
};

export const calculationUnits = {
  power: 'kW; Sales computeMw/facilityMw and facility budgets are MW (1 MW = 1000 kW)',
  network: 'Gb/s per connection; planes × plane_gbps is aggregate per accelerator, not connection speed',
  storageBandwidth: 'GB/s (gigabytes/s), including legacy read_gbps_per_gpu/read_gbps_per_unit fields; not network Gb/s',
  storageCapacity: 'Decimal TB/PB (1 PB = 1000 TB)',
  acceleratorTarget: 'GPUs for NVIDIA/AMD; wafers for Cerebras; systems rounded independently',
  cpu: 'Logical vCPU capacity per assumed front-end node; not physical cores or a performance guarantee',
  rack: 'U for chassis height; rack counts are compute racks, not total facility footprint',
};

export function recordBasis(data, collection, id) {
  const record = data[collection].find(r => r.id === id);
  return { file: 'data/atlas.json', collection, id, catalogConfidence: record?.confidence ?? null,
    evidenceStatus: 'unverified as a complete configuration; field-level findings in DATA_REVIEW.md',
    sources: record?.sources ?? [],
    sourceNote: record?.sources?.length ? 'Record citations are not proof of every field.' : 'No record-level sources; relevant explainer links provide context, not field-level proof.' };
}
