import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { catalog } from '../src/technical/catalog.js';
import * as engine from '../src/technical/engine.js';
import { initialState, calculateRuns, updateState } from '../src/technical/explorerModel.js';
import { evaluate as salesEvaluate, defaults as salesDefaults } from '../src/sales/engine.js';

// Independent oracle: execute the archived scripts, including their original
// DATA, only in tests. Production imports the JSON catalog, never this HTML.
const html = fs.readFileSync('reference/atlas-explorer.html', 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const oracle = vm.runInNewContext(`${scripts[0]}\n${scripts[1]}\n({ DATA, planCluster, fabricLimits, rowFromPlan, explainLinks, renderExplainer })`);
const plain = value => JSON.parse(JSON.stringify(value));

test('sole Technical catalog equals the archived snapshot without mutating it', () => {
  assert.deepEqual(catalog, plain(oracle.DATA));
  const before = structuredClone(catalog);
  calculateRuns(initialState, catalog);
  assert.deepEqual(catalog, before);
});

test('all fabrics, eligible workloads, rack densities and power profiles match the embedded engine', t => {
  let cases = 0;
  for (const fabric of catalog.fabric_options) {
    const platform = engine.byId(catalog.platforms, fabric.platform);
    const sizes = [...new Set([1, platform.su_systems * platform.accel_per_system, (fabric.limits.max_gpus_2tier ?? 128) + platform.accel_per_system])];
    for (const workload of catalog.workloads.filter(w => platform.workloads[w])) {
      for (const rack of platform.rack_options) {
        for (const profile of [undefined, ...(platform.power_profiles ?? []).map(p => p.id)]) {
          for (const gpus of sizes) {
            const input = { platform: platform.id, fabric: fabric.id, workload, rackOption: rack.id, powerProfile: profile, gpus, storage: 'vast', frontend: 'epyc-turin' };
            const actual = engine.planCluster(input, catalog), expected = oracle.planCluster(input, oracle.DATA);
            assert.deepEqual(actual, plain(expected), JSON.stringify(input));
            assert.deepEqual(engine.rowFromPlan(input, actual, catalog), plain(oracle.rowFromPlan(input, expected, oracle.DATA)));
            cases++;
          }
        }
      }
    }
  }
  assert.ok(cases > 700, `Compared ${cases} configurations`);
  t.diagnostic(`Compared ${cases} configurations against the original embedded engine`);
});

test('every storage/CPU selection preserves performance, capacity and ancillary sizing', () => {
  for (const storage of catalog.storage.filter(s => s.role === 'performance')) for (const frontend of catalog.frontend) {
    const input = { platform: 'nv-hgx-b300', fabric: 'b300-sx-mp4', workload: 'inference', gpus: 9, rackOption: 'dlc-8', storage: storage.id, frontend: frontend.id };
    assert.deepEqual(engine.planCluster(input, catalog), plain(oracle.planCluster(input, oracle.DATA)));
  }
  const p = engine.planCluster({ platform: 'nv-hgx-b200', fabric: 'b200-ib-ndr', gpus: 9, workload: 'inference', storage: 'vast', frontend: 'epyc-turin' }, catalog);
  assert.equal(p.gpus, 16); assert.equal(p.storage.lake_PB, .032); assert.equal(p.storage.hot_PB, .016);
  assert.equal(p.frontend.nodes, 7); assert.equal(p.storage.building_blocks, 1);
});

test('air/liquid selection follows chosen density and leaves Sales assumptions independent', () => {
  const input = { platform: 'nv-hgx-b300', fabric: 'b300-ib-xdr', workload: 'training', gpus: 32, storage: 'vast', frontend: 'epyc-turin' };
  const air = engine.planCluster({ ...input, rackOption: 'air-2' }, catalog), denseAir = engine.planCluster({ ...input, rackOption: 'air-4' }, catalog), liquid = engine.planCluster({ ...input, rackOption: 'dlc-8' }, catalog);
  assert.equal(air.power.pue, 1.4); assert.equal(denseAir.power.pue, 1.4); assert.equal(liquid.power.pue, 1.2);
  assert.deepEqual([air.compute_racks, denseAir.compute_racks, liquid.compute_racks], [2, 1, 1]);
  assert.deepEqual([air.rack_kw_typ, denseAir.rack_kw_typ, liquid.rack_kw_typ], [29, 58, 116]);
  assert.equal(air.power.compute_kw_typ, 58); assert.equal(air.power.it_kw, 64.4); assert.equal(air.power.facility_kw, 90.2); assert.equal(liquid.power.facility_kw, 77.3);
  const sale = salesEvaluate({ ...salesDefaults, gpuModel: 'nv-hgx-b300', gpuCount: 32 }).matches[0];
  assert.ok(Math.abs(sale.facilityMw - .08004) < 1e-12);
});

test('power profiles preserve typical/peak behavior and vendor-provisioned Cerebras power', () => {
  const input = { platform: 'nv-vr-nvl72', fabric: 'vr72-ib-xdr-2p', gpus: 72, workload: 'training' };
  const typical = engine.planCluster(input, catalog), maxP = engine.planCluster({ ...input, powerProfile: 'max-p' }, catalog);
  assert.equal(typical.power.compute_kw_typ, 190); assert.equal(typical.power.compute_kw_peak, 230);
  assert.equal(maxP.rack_kw_typ, 230); assert.equal(maxP.power.compute_kw_typ, 230); assert.equal(maxP.power.compute_kw_peak, 230);
  const cs3 = engine.planCluster({ platform: 'cerebras-cs3', fabric: 'cs3-vendor', gpus: 32, workload: 'training' }, catalog);
  assert.equal(cs3.power.it_kw, 947.2); assert.equal(cs3.network.chosen.vendor_defined, true);
});

test('fabric boundary includes one/two tiers and beyond-ceiling alternatives with original counts', () => {
  const input = { platform: 'nv-hgx-b300', fabric: 'b300-sx-sn5600', workload: 'training' };
  assert.equal(engine.planCluster({ ...input, gpus: 64 }, catalog).network.chosen.tiers, 1);
  assert.equal(engine.planCluster({ ...input, gpus: 2048 }, catalog).network.chosen.tiers, 2);
  const result = engine.planCluster({ ...input, gpus: 2056 }, catalog).network;
  assert.equal(result.chosen, null); assert.equal(result.beyond_2tier, true);
  assert.equal(result.alternatives[0].pods, 2); assert.equal(result.alternatives[0].switches, 100);
  assert.equal(result.alternatives[1].tiers, 3); assert.equal(result.alternatives[1].switches, 163);
  assert.deepEqual(result.alternatives.map(a => a.transceiver_ends_800g_eq), [8224, 12336]);
});

test('explanation links and filled text match for every reference row and entity', () => {
  const reached = new Set();
  for (const [entity, rows] of [['platform', catalog.platforms], ['fabric_option', catalog.fabric_options], ['reference_config', catalog.reference_configs], ['storage_option', catalog.storage], ['frontend_option', catalog.frontend]]) {
    for (const row of rows) {
      const links = engine.explainLinks(entity, row, catalog);
      assert.deepEqual(links, plain(oracle.explainLinks(entity, row, oracle.DATA)));
      for (const id of Object.values(links)) {
        assert.deepEqual(engine.renderExplainer(id, entity, row, catalog), plain(oracle.renderExplainer(id, entity, row, oracle.DATA)), `${entity}:${row.id}:${id}`);
        reached.add(id);
      }
    }
  }
  assert.ok(reached.size >= 30, `Verified ${reached.size} explainer definitions`);
});

test('live explainers and option ranking stay identical beyond the ceiling and after density changes', () => {
  for (const state of [initialState, { ...initialState, gpus: 131072 }, { ...initialState, platform: 'nv-hgx-b300', density: 'dlc-8', gpus: 1024 }, { ...initialState, platform: 'nv-vr-nvl72', profile: 'max-p' }]) {
    const runs = calculateRuns(state, catalog);
    for (const { f, plan, row } of runs) {
      const expected = oracle.planCluster({ platform: state.platform, fabric: f.id, rackOption: state.density || engine.byId(catalog.platforms, state.platform).rack_options.find(o => o.default)?.id, workload: state.workload, gpus: state.gpus, powerProfile: state.profile || undefined, storage: state.storage, frontend: state.frontend }, oracle.DATA);
      assert.deepEqual(plan, plain(expected));
      for (const id of ['pue', 'power-90-10', 'storage-two-tiers', 'vcpu-per-gpu']) assert.deepEqual(engine.renderExplainer(id, 'reference_config', row, catalog), plain(oracle.renderExplainer(id, 'reference_config', row, oracle.DATA)));
    }
  }
  const ranked = calculateRuns(initialState, catalog); assert.equal(ranked[0].f.id, 'gb300-ib-xdr');
  assert.equal(calculateRuns(updateState(initialState, 'workload', 'digital_twin', catalog), catalog).length, 0);
});
