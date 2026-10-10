import test from 'node:test';
import assert from 'node:assert/strict';
import atlas from '../data/atlas.json' with { type: 'json' };
import { adaptAtlas, salesAssumptions } from '../src/sales/catalogAdapter.js';
import { catalog, workloads } from '../src/sales/catalog.js';
import { defaults } from '../src/sales/engine.js';
import { getFleetGuidance } from '../src/sales/fleetGuidance.js';
import { serializePlan } from '../src/sales/exportPlan.js';
import { evaluate } from '../src/sales/engine.js';

test('stable identity survives catalog and fabric reordering without mutating Atlas', () => {
  const before = structuredClone(atlas);
  const reordered = adaptAtlas({ ...atlas, platforms: [...atlas.platforms].reverse(), fabric_options: [...atlas.fabric_options].reverse() });
  assert.deepEqual(atlas, before);
  for (const p of catalog.platforms) {
    const other = reordered.platforms.find(o => o.id === p.id);
    assert.equal(other.power.unitKw, p.power.unitKw); assert.equal(other.gpusPerUnit, p.gpusPerUnit);
    assert.deepEqual(other.networks.map(n => n.id).sort(), p.networks.map(n => n.id).sort());
  }
  assert.throws(() => adaptAtlas({ ...atlas, platforms: [atlas.platforms[0], atlas.platforms[0]] }), /duplicate/);
});

test('mapping uses Atlas coverage, sources, workload flags and independent Sales policy', () => {
  assert.equal(catalog.platforms.length, 9); assert.equal(catalog.mapping.excludedPlatforms.length, 2);
  for (const p of catalog.platforms) {
    const original = atlas.platforms.find(a => a.id === p.id);
    assert.equal(p.source.id, original.id); assert.deepEqual(p.source.links, original.sources);
    assert.equal(p.storage, null); assert.equal(p.source.file, 'data/atlas.json');
  }
  assert.ok(catalog.platforms.find(p => p.id === 'nv-hgx-b200').workloads.includes('hpc'));
  assert.ok(catalog.platforms.find(p => p.id === 'nv-hgx-b200').workloads.includes('tuning'));
  assert.deepEqual(catalog.assumptions, salesAssumptions); assert.notEqual(catalog.assumptions, atlas.assumptions);
});

test('unmappable and missing fields stay unknown; typical/TDP never substitute for peak', () => {
  const data = structuredClone(atlas);
  const p = data.platforms.find(p => p.id === 'nv-hgx-b200');
  delete p.system_kw_peak; delete p.facility_provision_kw; delete p.accel_per_system; delete p.hbm_gb_per_accel;
  p.rack_options = [];
  const mapped = adaptAtlas(data).platforms.find(p => p.id === 'nv-hgx-b200');
  assert.equal(mapped.power.unitKw, null); assert.equal(mapped.gpusPerUnit, null); assert.equal(mapped.memoryGbPerGpu, null); assert.equal(mapped.coolingType, null);
  const helios = catalog.platforms.find(p => p.id === 'amd-mi455x-helios');
  assert.equal(helios.networks.length, 0); assert.ok(helios.mappingWarnings.some(w => w.includes('UEC')));
});

test('workload storage guidance follows Atlas best_for without inventing Digital Twin vendors', () => {
  for (const workload of Object.keys(workloads)) {
    const g = getFleetGuidance({ ...defaults, workload });
    assert.ok(g.storage.considerations); assert.ok(g.storage.source);
    if (workload === 'digitalTwin') { assert.equal(g.storage.vendors, null); assert.equal(g.storage.reason, null); }
    else { assert.ok(g.storage.vendors); assert.ok(g.storage.reason); }
  }
});

test('guidance scopes platforms and preserves inputs', () => {
  const input = { ...defaults, vendor: 'AMD', workload: 'hpc' }, before = structuredClone(input);
  assert.deepEqual(getFleetGuidance(input).platforms.map(p => p.id), ['amd-mi350x', 'amd-mi355x']); assert.deepEqual(input, before);
  assert.equal(getFleetGuidance({ ...defaults, workload: 'digitalTwin' }).warnings.length, 1);
});

test('JSON export preserves assumptions, provenance, inputs, result categories and unknowns', () => {
  const inputs = { ...defaults, gpuModel: 'nv-hgx-b200', maxRacks: 1 };
  const result = evaluate(inputs), saved = JSON.parse(serializePlan(inputs, result, '2026-10-10T00:00:00.000Z'));
  assert.equal(saved.generatedAt, '2026-10-10T00:00:00.000Z'); assert.deepEqual(saved.inputs, inputs);
  assert.deepEqual(saved.assumptions, catalog.assumptions); assert.equal(saved.source, 'data/atlas.json');
  assert.equal(saved.incomplete[0].racks, null); assert.equal(saved.incomplete[0].platform.storage, null);
  assert.ok(saved.mapping.excludedPlatforms.length); assert.deepEqual(saved.incomplete[0].platform.source.links, atlas.platforms.find(p => p.id === inputs.gpuModel).sources);
  for (const key of ['errors', 'matches', 'incomplete', 'rejected', 'pending', 'storage']) assert.deepEqual(saved[key], result[key]);
});
