// Structural mapping only. No Technical sizing formulas or Sales policy changes.
export const workloadKeys = Object.freeze({
  training: 'training', inference: 'inference', fine_tuning: 'tuning',
  hpc: 'hpc', digital_twin: 'digitalTwin', mixed: 'mixed',
});

export const salesAssumptions = Object.freeze({
  usableU: 40, pue: 1.20, ancillaryFraction: 0.15,
  note: 'Sales planning assumptions: 40U usable space, 15% ancillary IT allowance and PUE 1.20. Dedicated network/storage racks are excluded. These are engine policy, not Atlas specifications.',
});

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
const whole = value => Number.isSafeInteger(value) && value > 0 ? value : null;

function coolingType(platform) {
  const options = platform.rack_options ?? [];
  // Mixed air/RDHx/liquid options cannot imply one facility configuration.
  if (options.length && options.every(o => /liquid|water/i.test(o.cooling ?? '') && !/air/i.test(o.cooling ?? ''))) return 'liquid';
  if (options.length && options.every(o => /^air$/i.test(o.cooling ?? ''))) return 'air';
  return null;
}

function networkFor(fabric) {
  const protocol = /InfiniBand/i.test(fabric.fabric ?? '') ? 'InfiniBand' : /RoCE/i.test(fabric.fabric ?? '') ? 'RoCE' : null;
  const speedGbps = positive(fabric.plane_gbps);
  if (!protocol || !speedGbps) return null;
  return {
    id: fabric.id, protocol, speedGbps, planes: whole(fabric.planes),
    aggregateGbpsPerAccelerator: positive(fabric.gbps_per_gpu),
    description: fabric.tech ?? null,
  };
}

export function adaptAtlas(atlas) {
  const ids = new Set();
  for (const p of atlas.platforms) {
    if (!p.id || ids.has(p.id)) throw new Error(`Missing or duplicate Atlas platform ID: ${p.id}`);
    ids.add(p.id);
  }
  const storage = Object.fromEntries(Object.entries(workloadKeys).map(([atlasKey, salesKey]) => {
    const products = (atlas.storage ?? []).filter(s => s.best_for?.includes(atlasKey));
    return [salesKey, {
      vendors: products.length ? [...new Set(products.map(s => s.vendor).filter(Boolean))].join('; ') || null : null,
      reason: products.length ? products.map(s => `${s.product ?? s.id}: ${s.strengths ?? 'Suitability details unconfirmed.'}`).join('\n') : null,
      considerations: 'Atlas workload suitability is a reference shortlist. Confirm workload I/O, capacity, protocols and vendor support; Sales does not calculate storage building blocks.',
      products: products.map(s => ({ id: s.id, vendor: s.vendor ?? null, product: s.product ?? null, confidence: s.confidence ?? null })),
      source: { file: 'data/atlas.json', workload: atlasKey },
    }];
  }));
  const excludedPlatforms = atlas.platforms.filter(p => !['NVIDIA', 'AMD'].includes(p.vendor)).map(p => ({
    id: p.id, reason: 'The preserved Sales wizard supports NVIDIA/AMD GPU systems; wafer units and vendor-defined networking cannot be mapped reliably.',
  }));
  const platforms = atlas.platforms.filter(p => ['NVIDIA', 'AMD'].includes(p.vendor)).map(p => {
    const fabrics = (atlas.fabric_options ?? []).filter(f => f.platform === p.id);
    const networks = fabrics.map(networkFor).filter(Boolean);
    const unitType = p.form === 'rack' ? 'rack' : p.form === 'node' ? 'server' : null;
    const peak = positive(p.system_kw_peak), provision = positive(p.facility_provision_kw);
    const unitKw = peak !== null || provision !== null ? Math.max(peak ?? 0, provision ?? 0) : null;
    const mappingWarnings = [
      'Atlas does not specify a platform-specific storage shortlist; use the workload recommendations and confirm compatibility.',
      ...fabrics.filter(f => !networkFor(f)).map(f => `${f.id}: protocol or per-connection speed is unconfirmed for Sales; UEC alone does not establish RoCE compatibility.`),
      ...(p.status === 'ramping' ? [`Availability is ramping: ${p.availability ?? 'confirm allocation with vendor'}. Reference sizing remains provisional.`] : []),
    ];
    return {
      id: p.id, atlasId: p.id, vendor: p.vendor, name: p.name,
      status: p.status === 'announced' ? 'roadmap' : p.status === 'shipping' || p.status === 'ramping' ? p.status : 'roadmap',
      availability: p.availability ?? null,
      gpusPerUnit: whole(p.accel_per_system), unitType,
      memoryGbPerGpu: positive(p.hbm_gb_per_accel),
      memory: positive(p.hbm_gb_per_accel) ? `${p.hbm_gb_per_accel} GB HBM per GPU` : 'Unconfirmed',
      configuration: `${whole(p.accel_per_system) ?? 'Unconfirmed'} GPUs per ${unitType ?? 'unit'}; ${p.host_cpu ?? 'host CPU unconfirmed'}`,
      cooling: p.cooling ?? 'Unconfirmed', coolingType: coolingType(p),
      scalableUnit: p.scale_up?.tech ?? null,
      workloads: Object.entries(p.workloads ?? {}).filter(([key, enabled]) => enabled === true && workloadKeys[key]).map(([key]) => workloadKeys[key]),
      networks, network: p.scale_out_nic ?? 'Unconfirmed', storage: null,
      considerations: p.notes ?? 'Unconfirmed', mappingWarnings,
      power: {
        unitKw, basis: unitKw !== null && unitType ? `${unitType}-reference` : 'unknown',
        gpuWatts: null, acceleratorTdpWatts: positive(p.accel_tdp_w),
        typicalUnitKw: positive(p.system_kw_typ), peakUnitKw: peak, facilityProvisionKw: provision,
        description: unitKw !== null ? `Atlas peak/provisioning rating: ${unitKw} kW per ${unitType ?? 'unit'} (provisional). Typical: ${positive(p.system_kw_typ) ?? 'Unconfirmed'} kW.` : 'Full-unit peak/provisioning power unconfirmed; typical or accelerator TDP cannot substitute.',
        source: { file: 'data/atlas.json', id: p.id, fields: ['system_kw_peak', 'facility_provision_kw'], confidence: p.confidence ?? null },
      },
      source: { file: 'data/atlas.json', id: p.id, confidence: p.confidence ?? null, links: p.sources ?? [] },
    };
  });
  return {
    version: atlas.assumptions?.data_as_of ?? null, source: 'data/atlas.json',
    qualification: atlas.assumptions?.disclaimer ?? 'Reference estimates require engineering validation.',
    assumptions: { ...salesAssumptions }, platforms, storage,
    mapping: {
      excludedPlatforms,
      limitations: ['No platform-specific storage compatibility mapping.', 'UEC-only fabric protocol remains unknown.', 'OEM server height is still required for Sales rack packing; Atlas chassis/rack-density options are not an OEM override.', 'Announced platforms remain unsized roadmap entries; ramping platforms use provisional reference ratings.'],
    },
  };
}
