import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { catalog as atlas } from '../src/technical/catalog.js';
import { catalog as sales } from '../src/sales/catalog.js';
import { defaults, evaluate } from '../src/sales/engine.js';
import { planCluster, fabricLimits } from '../src/technical/engine.js';
import { serializePlan } from '../src/sales/exportPlan.js';
import { serializeTechnicalPlan } from '../src/technical/exportPlan.js';
import { calculateRuns, initialState } from '../src/technical/explorerModel.js';

test('audited Atlas snapshot has unique stable identities, consistent units and valid foreign keys', () => {
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync('data/atlas.json')).digest('hex'), '421f4c50d62f023d5572c629ea052a6a26f8c8a2d398a1e4faa2b4579788d246');
  for (const collection of ['platforms','fabric_options','switches','storage','frontend']) {
    assert.equal(new Set(atlas[collection].map(r => r.id)).size, atlas[collection].length, collection);
  }
  for (const p of atlas.platforms) {
    assert.ok(Number.isSafeInteger(p.accel_per_system) && p.accel_per_system > 0);
    assert.ok(p.system_kw_peak >= p.system_kw_typ, p.id);
    assert.equal(new Set(p.rack_options.map(r => r.id)).size, p.rack_options.length);
    assert.ok(p.rack_options.every(r => Number.isSafeInteger(r.systems_per_rack) && r.systems_per_rack > 0));
    assert.ok(Object.keys(p.workloads).every(w => atlas.workloads.includes(w)));
    for (const profile of p.power_profiles || []) assert.ok(p.form === 'rack' && p.rack_options.every(r => r.systems_per_rack === 1), `${p.id}: rack_kw profiles are only per-system power for a one-rack system`);
  }
  for (const f of atlas.fabric_options) {
    const p = atlas.platforms.find(p => p.id === f.platform), sw = atlas.switches.find(s => s.id === f.switch);
    assert.ok(p, f.id); assert.ok(!f.switch || sw, f.id);
    assert.equal(f.planes * f.plane_gbps, f.gbps_per_gpu, `${f.id}: connection versus aggregate speed`);
    assert.deepEqual(f.limits, fabricLimits(f, p, sw));
  }
  assert.ok(atlas.storage.some(s => s.id === atlas.storage_rules.capacity_tier_id && s.role === 'capacity'));
});

test('Sales field mapping preserves Atlas identity, unit ratings and workload flags without importing OEM geometry', () => {
  for (const mapped of sales.platforms) {
    const p = atlas.platforms.find(p => p.id === mapped.id);
    assert.equal(mapped.gpusPerUnit, p.accel_per_system); assert.equal(mapped.unitType, p.form === 'rack' ? 'rack' : 'server');
    assert.equal(mapped.power.typicalUnitKw, p.system_kw_typ); assert.equal(mapped.power.unitKw, Math.max(p.system_kw_peak, p.facility_provision_kw || 0));
    assert.equal(mapped.serverU, undefined); assert.equal(mapped.power.gpuWatts, null);
    for (const n of mapped.networks) {
      const f = atlas.fabric_options.find(f => f.id === n.id); assert.equal(f.platform, mapped.id);
      assert.equal(n.speedGbps, f.plane_gbps); assert.equal(n.aggregateGbpsPerAccelerator, f.gbps_per_gpu);
    }
  }
});

const comparisons = [
  ['nv-hgx-b200',32,'b200-ib-ndr','air-4',null,10,60,1,1,78.936,89],
  ['nv-hgx-b300',64,'b300-sx-sn5600','dlc-8',null,4,120,1,1,160.08,154.7],
  ['nv-gb300-nvl72',10368,'gb300-ib-xdr','nvl72',null,null,null,144,144,30801.6,25920],
  ['nv-vr-nvl72',72,'vr72-ib-xdr-2p','nvl72',null,null,null,1,1,317.4,253.3],
  ['nv-vr-nvl72',72,'vr72-ib-xdr-2p','nvl72','max-p',null,null,1,1,317.4,306.7],
  ['amd-mi350x',32,'mi350x-eth-th5','air-4',null,8,60,1,1,77.28,80.9],
  ['amd-mi355x',128,'mi355x-eth-th5','dlc-16',null,4,300,2,1,375.36,320],
  ['nv-hgx-b300',2056,'b300-sx-sn5600','air-4',null,10,60,65,65,5142.57,5796.8],
];
test('identical targets retain documented Sales/Technical assumption differences rather than forced parity', () => {
  for (const [id,gpus,fabric,rackOption,powerProfile,serverU,rackKw,sRacks,tRacks,sKw,tKw] of comparisons) {
    const p = atlas.platforms.find(p => p.id === id), ro = p.rack_options.find(r => r.id === rackOption);
    const s = evaluate({ ...defaults,vendor:p.vendor,gpuModel:id,gpuCount:gpus,cooling:/liquid|water/i.test(ro.cooling)?'liquid':'air',serverU:serverU??'',rackKw:rackKw??'' }).matches[0];
    const t = planCluster({ platform:id,gpus,fabric,rackOption,powerProfile:powerProfile||undefined,workload:'training',storage:'vast',frontend:'epyc-turin' }, atlas);
    assert.equal(s.provisionedGpus,t.gpus); assert.equal(s.racks,sRacks); assert.equal(t.compute_racks,tRacks);
    assert.ok(Math.abs(s.facilityMw*1000-sKw)<1e-8,id); assert.equal(t.power.facility_kw,tKw,id);
    assert.notEqual(s.facilityMw*1000,t.power.facility_kw,id);
    if (gpus===2056) { assert.equal(t.network.beyond_2tier,true); assert.equal(t.network.alternatives.length,2); }
  }
});

test('byte bandwidth, decimal capacity and logical CPU units are explicit in exports; no eightfold conversion', () => {
  const state={ ...initialState,platform:'nv-hgx-b200',gpus:32,density:'air-4',storage:'ibm-scale' };
  const runs=calculateRuns(state,atlas), plan=runs[0].plan;
  assert.equal(plan.storage.read_GBps,32); assert.equal(plan.storage.building_blocks,1);
  assert.equal(plan.storage.lake_PB,.32); assert.equal(plan.frontend.vcpu_required,128); assert.equal(plan.frontend.nodes,7);
  const exported=JSON.parse(serializeTechnicalPlan(state,runs));
  assert.match(exported.units.storageBandwidth,/GB\/s.*not network Gb\/s/);
  assert.match(exported.units.cpu,/Logical/); assert.match(exported.units.storageCapacity,/1000 TB/);
  assert.equal(exported.catalogVersion,atlas.assumptions.data_as_of);
  assert.equal(exported.catalogReview.status,'partially-verified'); assert.equal(exported.referenceBasis.platform.oemConfiguration,null);
  assert.equal(exported.referenceBasis.frontend.sources.length,0);
  assert.equal(exported.referenceBasis.fabrics[0].validationEvidence,'unverified for this exact configuration');
  assert.ok(exported.limitations.some(s=>s.includes('fixed IT allowance')));
  const sInput={...defaults,gpuModel:state.platform,gpuCount:32};
  const sExport=JSON.parse(serializePlan(sInput,evaluate(sInput)));
  assert.equal(sExport.catalogReview.status,'partially-verified'); assert.equal(sExport.assumptions.pue,1.2);
  assert.equal(sExport.matches[0].racks,null); assert.match(sExport.units.storageBandwidth,/GB\/s/);
});

test('ambiguous OEM density remains recorded and qualified; vendor-defined network power stays unknown', () => {
  const mi=atlas.platforms.find(p=>p.id==='amd-mi355x');
  assert.equal(mi.system_ru*mi.rack_options.find(r=>r.id==='dlc-16').systems_per_rack,64);
  const state={...initialState,vendor:'Cerebras',platform:'cerebras-cs3',gpus:32};
  const exported=JSON.parse(serializeTechnicalPlan(state,calculateRuns(state,atlas)));
  assert.equal(exported.referenceBasis.fabrics[0].switch,null);
  assert.match(exported.limitations[1],/unknown.*not a verified zero/);
  assert.equal(exported.results[0].plan.power.it_kw,947.2);
});
