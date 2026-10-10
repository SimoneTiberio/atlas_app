import test from 'node:test';
import assert from 'node:assert/strict';
import { atlas, SCHEMA_VERSION, catalogVersion, newScenario, recoverScenario, mapSalesSelection, handoffScenario, scenarioMetadata } from '../src/scenario/model.js';
import { defaults, evaluate } from '../src/sales/engine.js';
import { calculateRuns } from '../src/technical/explorerModel.js';
import { serializePlan } from '../src/sales/exportPlan.js';
import { serializeTechnicalPlan } from '../src/technical/exportPlan.js';

const input = { ...defaults, gpuModel: 'nv-hgx-b200', gpuCount: 9, workload: 'tuning', cooling: 'air', maxMw: '1', rackKw: '40', maxRacks: '1', unitKw: '10', serverU: '8' };
const fabric = atlas.fabric_options.find(f => f.platform === input.gpuModel).id;
const options = { fabric, storage: 'weka' };

test('stable IDs and workload names map independently of catalog order, without transferring results', () => {
  const data = { ...atlas, platforms: [...atlas.platforms].reverse(), fabric_options: [...atlas.fabric_options].reverse(), storage: [...atlas.storage].reverse() };
  const mapped = mapSalesSelection(input, input.gpuModel, options, data);
  assert.deepEqual(mapped.errors, []);
  assert.equal(mapped.state.platform, input.gpuModel); assert.equal(mapped.state.workload, 'fine_tuning');
  assert.equal(mapped.state.gpus, 9); assert.equal(mapped.state.storage, 'weka'); assert.equal(mapped.state.selectedFabric, fabric);
  assert.equal(evaluate(input).matches[0].provisionedGpus, 16);
  assert.equal(mapped.state.unitKw, undefined); assert.equal(mapped.state.maxMw, undefined);
  assert.equal(mapped.handoff.context.unitKw, '10'); assert.equal(mapped.handoff.context.cooling, 'air');
  assert.equal(mapped.handoff.context.maxRacks, '1');
  const runs = calculateRuns(mapped.state, atlas);
  assert.ok(runs.length); assert.equal(runs[0].plan.power.pue, 1.4);
  assert.notEqual(runs[0].plan.power.facility_kw / 1000, evaluate(input).matches[0].facilityMw);
});

test('unmapped platform, workload, count, fabric and capacity storage produce explicit errors', () => {
  assert.match(mapSalesSelection(input, 'missing-platform').errors.join(), /missing-platform/);
  assert.match(mapSalesSelection({ ...input, workload: 'unmapped' }, input.gpuModel).errors.join(), /cannot be mapped/);
  assert.match(mapSalesSelection({ ...input, workload: 'digitalTwin' }, input.gpuModel).errors.join(), /not eligible/);
  assert.match(mapSalesSelection({ ...input, gpuCount: 0 }, input.gpuModel).errors.join(), /positive/);
  const otherFabric = atlas.fabric_options.find(f => f.platform !== input.gpuModel).id;
  assert.match(mapSalesSelection(input, input.gpuModel, { fabric: otherFabric }).errors.join(), /not available/);
  const capacityStorage = atlas.storage.find(s => s.role !== 'performance').id;
  assert.match(mapSalesSelection(input, input.gpuModel, { storage: capacityStorage }).errors.join(), /cannot be sized/);
  const s = newScenario(), before = structuredClone(s);
  assert.ok(handoffScenario(s, input, 'missing-platform', {}, 'test').errors.length);
  assert.deepEqual(s, before);
});

test('versioned recovery preserves wizard progress, explicit options and independent Technical settings', () => {
  const s = newScenario(); s.sales = { input, step: 2, completed: true, selections: { [input.gpuModel]: options } };
  const transferred = handoffScenario(s, input, input.gpuModel, options, 'test-scenario').scenario;
  transferred.technical.state.density = 'air-4';
  const restored = recoverScenario(JSON.stringify(transferred));
  assert.deepEqual(restored.errors, []); assert.deepEqual(restored.scenario, transferred);
  assert.equal(restored.scenario.schemaVersion, SCHEMA_VERSION); assert.equal(restored.scenario.catalogVersion, catalogVersion);
  assert.equal(restored.scenario.sales.step, 2); assert.equal(restored.scenario.sales.completed, true);
  assert.deepEqual(restored.scenario.sales.input, input);
  assert.equal(restored.scenario.technical.state.density, 'air-4');
});

test('recovery rejects future versions and corrupt/stale identifiers; no default replacement', () => {
  for (const raw of ['{broken', JSON.stringify({ ...newScenario(), schemaVersion: 999 }), 'null']) {
    const r = recoverScenario(raw); assert.ok(r.errors.length); assert.equal(r.scenario, undefined);
  }
  for (const [field, value] of [['platform', 'removed'], ['storage', 'removed'], ['frontend', 'removed'], ['density', 'unknown'], ['profile', 'unknown'], ['selectedFabric', fabric]]) {
    const s = newScenario(); s.technical.state[field] = value;
    const r = recoverScenario(JSON.stringify(s)); assert.ok(r.errors.length, field); assert.equal(r.scenario, undefined);
  }
  const s = newScenario(); s.sales.input.gpuModel = 'removed'; assert.ok(recoverScenario(JSON.stringify(s)).errors.length);
  s.sales.input.gpuModel = 'Any'; s.sales.selections = { removed: { storage: 'missing' } };
  assert.ok(recoverScenario(JSON.stringify(s)).errors.length);
});

test('catalog revision checks identities, warns and recalculates; incomplete numeric input is retained', () => {
  const s = newScenario(); s.catalogVersion = 'earlier'; s.sales.input.gpuCount = ''; s.sales.step = 1;
  const restored = recoverScenario(JSON.stringify(s)); assert.deepEqual(restored.errors, []);
  assert.match(restored.warnings[0], /Catalog changed/); assert.equal(restored.scenario.sales.input.gpuCount, '');
  assert.equal(restored.scenario.sales.completed, false);
});

test('incompatible saved workload/vendor and unknown Sales options are explained while valid empty states recover', () => {
  const s = newScenario(); s.technical.state.workload = 'hpc';
  assert.match(recoverScenario(JSON.stringify(s)).errors.join(), /not eligible/);
  s.technical.state.workload = 'digital_twin'; assert.deepEqual(recoverScenario(JSON.stringify(s)).errors, []);
  s.technical.state.workload = 'training'; s.technical.state.vendor = 'AMD';
  assert.match(recoverScenario(JSON.stringify(s)).errors.join(), /vendor filter/);
  s.technical.state.vendor = 'All'; s.sales.input.protocol = 'Unmapped';
  assert.match(recoverScenario(JSON.stringify(s)).errors.join(), /cannot be mapped/);
});

test('both exports identify the catalog, own assumptions and freshly calculated results', () => {
  const s = handoffScenario(newScenario(), input, input.gpuModel, options, 'export-scenario').scenario;
  const sales = JSON.parse(serializePlan(input, evaluate(input), 'fixed-time', scenarioMetadata(s)));
  const technical = JSON.parse(serializeTechnicalPlan(s.technical.state, calculateRuns(s.technical.state, atlas), s, 'fixed-time'));
  assert.equal(sales.engine, 'sales'); assert.equal(technical.engine, 'technical');
  assert.equal(sales.catalogVersion, catalogVersion); assert.equal(technical.catalogVersion, catalogVersion);
  assert.equal(sales.assumptions.pue, 1.2); assert.equal(technical.assumptions.pue.air, 1.4);
  assert.equal(sales.matches[0].provisionedGpus, 16); assert.equal(technical.inputs.gpus, 9);
  assert.equal(technical.scenario.handoff.context.unitKw, '10'); assert.equal(sales.scenario.id, 'export-scenario');
  assert.ok(technical.results.every(r => atlas.fabric_options.some(f => f.id === r.fabricId)));
  assert.equal(technical.matches, undefined); assert.equal(sales.results, undefined);
});
