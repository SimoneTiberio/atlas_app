// Adapted from Sales_App/tests/engine.test.js: preserve its behavior checks,
// replacing workbook expectations with Atlas identities and reference ratings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, evaluate, validateStep } from '../src/sales/engine.js';
import { catalog } from '../src/sales/catalog.js';

const run = changes => evaluate({ ...defaults, ...changes });
const b200 = 'nv-hgx-b200', gb300 = 'nv-gb300-nvl72';
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test('Atlas fleet rounds to whole servers and racks without invented blocks', () => {
  const server = run({ gpuModel: b200, gpuCount: 9 }).matches[0];
  assert.equal(server.units, 2); assert.equal(server.provisionedGpus, 16); assert.equal(server.extraGpus, 7);
  assert.equal(server.racks, null); near(server.facilityMw, 2 * 14.3 / 1000 * 1.15 * 1.2);
  const rack = run({ gpuModel: gb300 }).matches[0];
  assert.equal(rack.units, 28); assert.equal(rack.provisionedGpus, 2016); assert.equal(rack.racks, 28);
});

test('workload eligibility follows Atlas, including B200 HPC and Digital Twin unmatched', () => {
  assert.deepEqual(run({ vendor: 'Any', workload: 'hpc' }).matches.map(r => r.platform.id), [b200, 'amd-mi350x', 'amd-mi355x']);
  const twin = run({ vendor: 'Any', workload: 'digitalTwin' });
  assert.equal(twin.matches.length, 0); assert.equal(twin.storage.vendors, null);
  assert.ok(run({ gpuModel: gb300, workload: 'mixed' }).matches.length);
});

test('network constraints use connection speed and protocol, not aggregate bandwidth', () => {
  assert.equal(run({ gpuModel: b200, speedGbps: 800 }).matches.length, 0);
  const r = run({ gpuModel: gb300, protocol: 'RoCE', speedGbps: 400 }).matches[0];
  assert.ok(r.networks.every(n => n.speedGbps >= 400));
  assert.ok(!r.networks.some(n => n.id.endsWith('mp4')));
  const rubin = run({ gpuModel: 'nv-vr-nvl72', speedGbps: 800, protocol: 'InfiniBand' }).matches[0];
  assert.equal(rubin.networks[0].speedGbps, 800); assert.equal(rubin.networks[0].aggregateGbpsPerAccelerator, 1600);
  assert.equal(run({ vendor: 'AMD', gpuModel: 'amd-mi355x', speedGbps: 800, protocol: 'RoCE' }).matches.length, 0);
  const helios = run({ vendor: 'AMD', gpuModel: 'amd-mi455x-helios', protocol: 'RoCE', speedGbps: 800 }).matches[0];
  assert.equal(helios.networks.length, 0); assert.ok(helios.reviews.some(x => x.includes('cannot yet be verified')));
  assert.ok(helios.reviews.some(x => x.includes('UEC')));
});

test('announced platform stays unsized roadmap; ramping entries remain provisional', () => {
  const r = run({ vendor: 'AMD', gpuModel: 'amd-mi440x-8' });
  assert.equal(r.pending.length, 1); assert.equal(r.pending[0].units, undefined);
  assert.equal(run({ vendor: 'AMD', gpuModel: 'amd-mi440x-8', workload: 'hpc' }).pending.length, 0);
  assert.ok(run({ gpuModel: 'nv-vr-nvl72' }).matches[0].reviews.some(x => x.includes('ramping')));
});

test('cooling excludes all liquid-only systems from air-only facilities', () => {
  assert.deepEqual(run({ vendor: 'Any', cooling: 'air' }).matches.map(r => r.platform.id), [b200, 'nv-hgx-b300', 'amd-mi350x']);
  assert.equal(run({ gpuModel: gb300, cooling: 'air' }).matches.length, 0);
  assert.equal(run({ gpuModel: gb300, cooling: 'liquid' }).matches.length, 1);
});

test('OEM power and height preserve packing, overhead and exact boundary constraints', () => {
  const input = { gpuModel: b200, unitKw: 10, serverU: 8, rackKw: 40 };
  const r = run(input).matches[0];
  assert.equal(r.racks, 63); assert.equal(r.perRack, 4); assert.equal(r.rackPeakKw, 40);
  assert.equal(r.powerBasis, 'oem-input'); near(r.computeMw, 2.5); near(r.facilityMw, 3.45);
  assert.equal(run({ ...input, maxMw: r.facilityMw }).matches.length, 1);
  assert.equal(run({ ...input, maxMw: r.facilityMw - .001 }).matches.length, 0);
  for (const limits of [{ maxRacks: 62 }, { rackKw: 9 }, { serverU: 41 }]) assert.equal(run({ ...input, ...limits }).matches.length, 0);
  assert.equal(run({ gpuModel: gb300, maxRacks: 27 }).matches.length, 0);
});

test('reference peak ratings and fixed Sales assumptions drive facility estimates', () => {
  for (const [gpuModel, vendor, kw] of [[b200, 'NVIDIA', 14.3], ['nv-hgx-b300', 'NVIDIA', 14.5], [gb300, 'NVIDIA', 155], ['amd-mi355x', 'AMD', 17], ['amd-mi455x-helios', 'AMD', 245]]) {
    const input = { gpuModel, vendor, gpuCount: 72, cooling: 'liquid' };
    const r = run(input).matches[0]; assert.equal(r.unitKw, kw);
    near(r.facilityMw, r.units * kw / 1000 * 1.15 * 1.2);
    assert.equal(run({ ...input, maxMw: r.facilityMw, rackKw: kw }).matches.length, 1);
    assert.equal(run({ ...input, maxMw: r.facilityMw - .0001 }).matches.length, 0);
    assert.equal(run({ ...input, rackKw: kw - 1 }).matches.length, 0);
    assert.equal(run({ ...input, unitKw: 10 }).matches[0].unitKw, 10);
  }
});

test('missing full-unit ratings never acquire invented power, even with a budget', () => {
  const data = structuredClone(catalog);
  const p = data.platforms.find(p => p.id === b200);
  p.power = { ...p.power, basis: 'gpu-only', unitKw: null, gpuWatts: 1000 };
  const r = evaluate({ ...defaults, gpuModel: b200, maxMw: 1, maxRacks: 1 }, data).incomplete[0];
  assert.equal(r.unitKw, null); assert.equal(r.facilityMw, null); assert.equal(r.racks, null); assert.equal(r.gpuOnlyMw, 2);
  const complete = evaluate({ ...defaults, gpuModel: b200, unitKw: 10, serverU: 8, rackKw: 40 }, data);
  assert.equal(complete.matches.length, 1);
});

test('supplied rack limit requires packing; unknown unit geometry stays incomplete', () => {
  const input = { gpuModel: b200, maxMw: 5, maxRacks: 70 };
  assert.equal(run(input).incomplete.length, 1);
  assert.equal(run({ ...input, unitKw: 10 }).incomplete.length, 1);
  assert.equal(run({ ...input, unitKw: 10, serverU: 8, rackKw: 40 }).matches.length, 1);
  const data = structuredClone(catalog); data.platforms.find(p => p.id === b200).gpusPerUnit = null;
  const r = evaluate({ ...defaults, gpuModel: b200 }, data);
  assert.equal(r.incomplete.length, 1); assert.equal(r.incomplete[0].units, undefined);
});

test('invalid fields and wrong-vendor selections are rejected at their owning step', () => {
  for (const gpuCount of ['', 0, -1, 1.5, Infinity, NaN, 'abc', Number.MAX_SAFE_INTEGER + 1]) assert.ok(run({ gpuCount }).errors.length);
  for (const maxMw of [0, -1, Infinity, ' ']) assert.ok(run({ maxMw }).errors.length);
  for (const value of [{ maxRacks: 1.5 }, { gpuModel: 'amd-mi355x' }, { unitKw: 10 }, { speedGbps: 100 }, { gpuModel: 'hgx-b200' }]) assert.ok(run(value).errors.length);
  assert.equal(validateStep({ ...defaults, gpuCount: 0 }, 0).length, 0);
  assert.ok(validateStep({ ...defaults, gpuCount: 0 }, 1).length);
});

test('budgets expose headroom and no-budget never means within-budget', () => {
  const r = run({ gpuModel: b200, gpuCount: 8, maxMw: .02 }).matches[0];
  near(r.facilityMw, .019734); near(r.powerHeadroomMw, .000266); assert.equal(r.powerStatus, 'within-budget');
  const rejected = run({ gpuModel: b200, gpuCount: 8, maxMw: .015 }).rejected[0];
  assert.equal(rejected.powerStatus, 'over-budget');
  assert.ok(run({}).matches.every(r => r.powerStatus === 'budget-not-provided'));
});

test('power overflow and underflow never export invalid matches', () => {
  for (const unitKw of [1e308, Number.MIN_VALUE]) {
    const result = run({ gpuModel: b200, unitKw });
    assert.equal(result.errors.length, 0); assert.equal(result.matches.length, 0); assert.equal(result.rejected.length, 1);
    assert.match(result.rejected[0].reasons[0], /supported numeric range/);
    assert.equal(JSON.parse(JSON.stringify(result)).rejected[0].facilityMw, undefined);
  }
});

test('recorded MVP baselines expose catalog-induced power and budget changes', () => {
  // Scalar comparison evidence only; no old catalog is application/test input.
  for (const [gpuModel, vendor, oldMw, atlasMw] of [
    [b200, 'NVIDIA', 2.76, 4.9335], ['nv-hgx-b300', 'NVIDIA', 3.864, 5.0025],
    [gb300, 'NVIDIA', 5.48688, 5.9892], ['amd-mi355x', 'AMD', 3.864, 5.865],
    ['amd-mi455x-helios', 'AMD', 4.6368, 9.4668],
  ]) {
    near(run({ gpuModel, vendor }).matches[0].facilityMw, atlasMw);
    assert.ok(atlasMw > oldMw);
    assert.equal(run({ gpuModel, vendor, maxMw: oldMw + .01 }).matches.length, 0);
  }
  assert.equal(run({ vendor: 'Any' }).matches.length, 8);
  assert.equal(run({ vendor: 'Any' }).pending[0].platform.id, 'amd-mi440x-8');
  assert.ok(!catalog.platforms.some(p => ['gb200-nvl72', 'mi325x', 'mi500x'].includes(p.id)));
});
