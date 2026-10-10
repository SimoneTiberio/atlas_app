import './setup-dom.js';
import React, { useState } from 'react';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime.js';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime.js';
import ApplicationShell from '../src/components/ApplicationShell.jsx';
import InfrastructureAdvisor from '../src/sales/InfrastructureAdvisor.jsx';
import TechnicalExplorer from '../src/technical/TechnicalExplorer.jsx';
import { atlas, SESSION_KEY, newScenario } from '../src/scenario/model.js';

afterEach(() => { cleanup(); window.sessionStorage.clear(); });
function Workspace({ initialPath = '/sales' }) {
  const [path, setPath] = useState(initialPath);
  const router = { pathname: path, asPath: path, isReady: true, beforePopState() {}, push: href => { setPath(href); return Promise.resolve(true); }, prefetch: () => Promise.resolve() };
  return <RouterContext.Provider value={router}><PathnameContext.Provider value={path}><ApplicationShell>{path === '/sales' ? <InfrastructureAdvisor /> : <TechnicalExplorer />}</ApplicationShell></PathnameContext.Provider></RouterContext.Provider>;
}
const click = name => fireEvent.click(screen.getByRole('button', { name }));
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const saved = () => JSON.parse(window.sessionStorage.getItem(SESSION_KEY));
const complete = () => {
  change('Platform', 'nv-hgx-b200'); click(/^Continue/); change(/Minimum GPU count/, '9'); click(/^Continue/);
  change('Available cooling', 'air'); change(/Maximum facility power budget/, '1'); change(/Maximum compute rack power/, '40'); change(/Maximum compute racks/, '1');
  change(/OEM full-server peak power/, '10'); change(/OEM server height/, '8'); click(/^Show configurations/);
};

test('selected configuration round trip preserves inputs and progress, carries explicit IDs, and refresh recovers both workflows', () => {
  let view = render(<Workspace />); complete();
  const fabric = atlas.fabric_options.filter(f => f.platform === 'nv-hgx-b200').at(-1).id;
  change('Fabric for Technical (optional)', fabric); change('Storage for Technical (optional)', 'weka');
  const sales = structuredClone(saved().sales);
  fireEvent.click(screen.getByRole('link', { name: 'Open in Technical' }));
  assert.equal(screen.getByLabelText(/Cluster size/).value, '9');
  assert.equal(screen.getByLabelText('Main workload').value, 'training');
  assert.equal(screen.getByLabelText('Selected fabric (optional)').value, fabric);
  assert.equal(screen.getByLabelText('Storage').value, 'weka');
  assert.match(screen.getByLabelText('Active scenario').textContent, /B200.*9 accelerators/);
  assert.match(screen.getByLabelText('Sales scenario context').textContent, /not applied to Technical calculations/);
  assert.ok(document.querySelector(`[data-fabric="${fabric}"].scenario-selected`));
  change('Rack density', 'air-4');
  // Read the actual CPU identifier rather than assuming a label or array position.
  const cpu = atlas.frontend.at(-1).id; change('Front-end CPU', cpu);
  const technical = structuredClone(saved().technical);
  view.unmount(); view = render(<Workspace initialPath="/technical" />);
  assert.equal(screen.getByLabelText('Rack density').value, 'air-4'); assert.equal(screen.getByLabelText('Front-end CPU').value, cpu);
  assert.deepEqual(saved().technical, technical);
  fireEvent.click(screen.getByRole('link', { name: 'Return to Sales' }));
  assert.ok(screen.getByRole('button', { name: /^Export plan/ }));
  assert.equal(screen.getByLabelText(/OEM full-server peak power/).value, '10');
  assert.deepEqual(saved().sales, sales);
  view.unmount(); render(<Workspace />);
  assert.ok(screen.getByRole('button', { name: /^Export plan/ }));
  assert.deepEqual(saved().sales, sales);
});

test('Any-platform Sales selection transfers the clicked stable platform, retaining the Any wizard input', () => {
  render(<Workspace />); click(/^Continue/); click(/^Continue/); click(/^Show configurations/);
  const handoff = screen.getAllByRole('link', { name: 'Open in Technical' }).at(-1);
  const platformId = atlas.platforms.find(p => p.name === handoff.closest('article').querySelector('h2').textContent).id;
  fireEvent.click(handoff);
  assert.equal(saved().technical.state.platform, platformId); assert.equal(saved().sales.input.gpuModel, 'Any');
  fireEvent.click(screen.getByRole('link', { name: 'Return to Sales' })); click('Back'); click('Back');
  assert.equal(screen.getByLabelText('Platform').value, 'Any');
});

test('in-progress Sales validation input and uncommitted Technical size draft survive refresh', () => {
  let view = render(<Workspace />); click(/^Continue/); change(/Minimum GPU count/, '0');
  view.unmount(); view = render(<Workspace />);
  assert.equal(screen.getByLabelText(/Minimum GPU count/).value, '0'); click(/^Continue/);
  assert.match(screen.getByRole('alert').textContent, /positive whole number/);
  fireEvent.click(screen.getByRole('link', { name: 'Technical' })); change(/Cluster size/, '117');
  assert.equal(saved().technical.state.gpus, 10368); assert.equal(saved().technical.state.sizeDraft, '117');
  view.unmount(); render(<Workspace initialPath="/technical" />);
  assert.equal(screen.getByLabelText(/Cluster size/).value, '117'); fireEvent.blur(screen.getByLabelText(/Cluster size/));
  assert.equal(saved().technical.state.gpus, 117); assert.equal(saved().technical.state.sizeDraft, null);
});

test('stale fabric blocks handoff with an explanation and retains the Sales configuration', () => {
  const s = newScenario(); s.sales.selections = { 'nv-hgx-b200': { fabric: atlas.fabric_options.find(f => f.platform === 'nv-hgx-b200').id } };
  window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  render(<Workspace />); complete();
  // A changed protocol requirement can make a previously explicit choice incompatible.
  click('Back'); change('Scale-out protocol', 'RoCE'); click(/^Continue/); click(/^Show configurations/);
  fireEvent.click(screen.getByRole('link', { name: 'Open in Technical' }));
  assert.match(screen.getByRole('alert').textContent, /fabric|Fabric/);
  assert.equal(screen.getByRole('link', { name: 'Sales' }).getAttribute('aria-current'), 'page');
});

test('unsupported session version is explained, retained and recoverable by explicit reset', () => {
  const raw = JSON.stringify({ ...newScenario(), schemaVersion: 999 }); window.sessionStorage.setItem(SESSION_KEY, raw);
  render(<Workspace />);
  assert.match(screen.getByRole('alert').textContent, /unsupported/);
  assert.equal(window.sessionStorage.getItem(SESSION_KEY), raw);
  assert.equal(screen.queryByLabelText('Platform'), null);
  click('Start a new scenario'); assert.equal(screen.getByLabelText('Platform').value, 'Any');
  assert.equal(saved().schemaVersion, 1);
});

test('reset clears Sales selections and active handoff; platform change explains fabric incompatibility', () => {
  render(<Workspace />); complete();
  change('Fabric for Technical (optional)', atlas.fabric_options.find(f => f.platform === 'nv-hgx-b200').id);
  fireEvent.click(screen.getByRole('link', { name: 'Open in Technical' }));
  fireEvent.click(screen.getByRole('radio', { name: /DGX B300/ }));
  assert.match(screen.getByRole('status').textContent, /previous platform/); assert.equal(saved().technical.state.selectedFabric, null);
  fireEvent.click(screen.getByRole('link', { name: 'Return to Sales' })); click('Reset');
  assert.equal(saved().handoff, null); assert.deepEqual(saved().sales.selections, {});
  assert.match(screen.getByLabelText('Active scenario').textContent, /Current session/);
});

test('denied session storage is reported while handoff and return still work in memory', () => {
  const original = window.Storage.prototype.setItem;
  window.Storage.prototype.setItem = () => { throw new Error('Storage denied'); };
  try {
    render(<Workspace />); complete();
    assert.match(screen.getByRole('status').textContent, /could not be saved/);
    fireEvent.click(screen.getByRole('link', { name: 'Open in Technical' }));
    assert.equal(screen.getByLabelText(/Cluster size/).value, '9');
    fireEvent.click(screen.getByRole('link', { name: 'Return to Sales' }));
    assert.ok(screen.getByRole('button', { name: /^Export plan/ }));
    assert.equal(screen.getByLabelText(/OEM full-server peak power/).value, '10');
  } finally { window.Storage.prototype.setItem = original; }
});

test('Technical download exports current recalculated fabric alternatives and Sales context', async () => {
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL, originalClick = window.HTMLAnchorElement.prototype.click;
  const originalTimer = globalThis.setTimeout;
  let blob, filename, revoked;
  URL.createObjectURL = b => { blob = b; return 'blob:technical-test'; };
  URL.revokeObjectURL = url => { revoked = url; };
  window.HTMLAnchorElement.prototype.click = function () { filename = this.download; };
  try {
    render(<Workspace />); complete();
    fireEvent.click(screen.getByRole('link', { name: 'Open in Technical' }));
    change('Rack density', 'air-4');
    globalThis.setTimeout = callback => { callback(); return 0; };
    click('Export Technical plan');
    const plan = JSON.parse(await blob.text());
    assert.equal(filename, 'atlas-technical-plan.json'); assert.equal(revoked, 'blob:technical-test');
    assert.equal(plan.engine, 'technical'); assert.equal(plan.catalogVersion, atlas.assumptions.data_as_of);
    assert.equal(plan.inputs.density, 'air-4'); assert.equal(plan.inputs.gpus, 9);
    assert.equal(plan.assumptions.storageRules.write_ratio, atlas.storage_rules.write_ratio);
    assert.equal(plan.scenario.handoff.context.unitKw, '10');
    assert.ok(plan.results.every(r => r.plan.rack_option === 'air-4' && r.plan.gpus === 16));
    assert.equal(plan.matches, undefined);
  } finally {
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; window.HTMLAnchorElement.prototype.click = originalClick; globalThis.setTimeout = originalTimer;
  }
});
