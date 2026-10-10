import { catalog } from './catalog.js';
import { scenarioMetadata } from '../scenario/model.js';
import { catalogReview, calculationUnits, recordBasis } from '../catalogReview.js';

export const technicalAssumptions = {
  ...catalog.assumptions,
  note: 'Technical engine from the archived explorer: typical/selected profile power; cooling-based PUE; 90% compute share; vendor-provisioned Cerebras load where specified. Fabric options are calculated independently. Sales facility constraints and OEM overrides are context only.',
  storageSizing: 'Workload-based bandwidth and data capacity, rounded as in the explorer; Atlas performance blocks and object-capacity tiers.',
  cpuSizing: 'Atlas workload vCPU ratios plus the original fixed control-plane node allowance.',
  storageRules: catalog.storage_rules,
  frontendRules: catalog.frontend_rules,
};

export function serializeTechnicalPlan(state, runs, scenario = null, generatedAt = new Date().toISOString()) {
  const platform = catalog.platforms.find(p => p.id === state.platform);
  const rack = platform?.rack_options.find(r => r.id === (state.density || runs[0]?.plan.rack_option));
  return JSON.stringify({ engine: 'technical', generatedAt, catalogVersion: catalog.assumptions.data_as_of,
    source: 'data/atlas.json', assumptions: technicalAssumptions, inputs: state,
    catalogReview, units: calculationUnits,
    referenceBasis: {
      platform: { ...recordBasis(catalog, 'platforms', state.platform), typicalSystemKw: platform?.system_kw_typ ?? null,
        peakSystemKw: platform?.system_kw_peak ?? null, facilityProvisionKw: platform?.facility_provision_kw ?? null,
        chassisU: platform?.system_ru ?? null, rackOption: rack ?? null,
        oemConfiguration: null, note: 'OEM-specific chassis/power/NIC combination not established by a generic record.' },
      fabrics: runs.map(r => ({ ...recordBasis(catalog, 'fabric_options', r.f.id),
        validationClaim: r.f.nvidia_validated ?? null, validationEvidence: 'unverified for this exact configuration',
        switch: r.f.switch ? recordBasis(catalog, 'switches', r.f.switch) : null })),
      storage: [state.storage, catalog.storage_rules.capacity_tier_id].map(id => recordBasis(catalog, 'storage', id)),
      frontend: recordBasis(catalog, 'frontend', state.frontend),
    },
    limitations: ['Facility power uses the fixed IT allowance even when bottom-up ancillary load exceeds it.',
      'Vendor-defined fabric switch count/power is unknown; its zero contribution to the ancillary check is not a verified zero load.',
      'Clos counts and 800G-equivalent optics are planning estimates; a third-tier ceiling is not enforced.',
      'Storage/CPU ratios applied per accelerator (including wafer units) are planning policy, not vendor-approved Cerebras ancillary sizing.'],
    scenario: scenarioMetadata(scenario), results: runs.map(run => ({ fabricId: run.f.id, plan: run.plan })) }, null, 2);
}

export function downloadTechnicalPlan(state, runs, scenario) {
  const url = URL.createObjectURL(new Blob([serializeTechnicalPlan(state, runs, scenario)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'atlas-technical-plan.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
