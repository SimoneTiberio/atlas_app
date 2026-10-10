import './setup-dom.js';
import React from 'react';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TechnicalExplorer from '../src/technical/TechnicalExplorer.jsx';
import { Markdown } from '../src/technical/ExplainDialog.jsx';

// Native modal APIs are provided by browsers; jsdom needs this test-only shim.
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; this.querySelector('button')?.focus(); };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };
afterEach(cleanup);
const click = name => fireEvent.click(screen.getByRole('button', { name }));
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const select = name => fireEvent.click(screen.getByRole('radio', { name }));
const metric = name => document.querySelector(`[data-metric="${name}"]`);
const size = value => { change(/Cluster size/, String(value)); fireEvent.blur(screen.getByLabelText(/Cluster size/)); };

test('default controls, confidence, top-three fabrics and show-all interaction are preserved', () => {
  render(<TechnicalExplorer />);
  const qualification = screen.getByLabelText('Catalog and calculation qualification').textContent;
  assert.match(qualification, /Atlas 2026-10-07.*partially verified/);
  assert.match(qualification, /typical\/selected-profile.*90%.*1.40 air \/ 1.20 liquid/);
  assert.match(qualification, /warning does not increase the facility estimate/);
  assert.equal(screen.getByLabelText(/Cluster size/).value, '10368');
  assert.equal(screen.getByLabelText('Storage').value, 'vast'); assert.equal(screen.getByLabelText('Front-end CPU').value, 'epyc-turin');
  click('confidence');
  assert.match(screen.getByRole('dialog').textContent, /inherited catalog labels, not verification of every field/);
  click('Close explanation');
  assert.equal(document.querySelectorAll('[data-fabric]').length, 3);
  assert.equal(document.querySelector('[data-fabric]').dataset.fabric, 'gb300-ib-xdr');
  assert.match(document.querySelector('.headline').textContent, /partner/);
  click('Show all 4 network options'); assert.equal(document.querySelectorAll('[data-fabric]').length, 4);
  click('Show the top 3 only'); assert.equal(document.querySelectorAll('[data-fabric]').length, 3);
  assert.equal(document.querySelectorAll('main, aside, header').length, 0, 'Explorer uses the shared shell');
});

test('vendor/workload eligibility, keyboard radio navigation and GPU/wafer unit changes', () => {
  render(<TechnicalExplorer />); click('AMD');
  assert.equal(screen.queryByRole('radio', { name: /GB300 NVL72/ }), null);
  change('Main workload', 'hpc'); assert.equal(screen.getByRole('radio', { name: /Helios/ }).disabled, true);
  const selected = screen.getByRole('radio', { name: /MI350X/ }); selected.focus(); fireEvent.keyDown(selected, { key: 'ArrowDown' });
  assert.equal(screen.getByRole('radio', { name: /MI355X/ }).getAttribute('aria-checked'), 'true');
  assert.equal(document.activeElement, screen.getByRole('radio', { name: /MI355X/ }));
  fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' }); assert.equal(screen.getByRole('radio', { name: /MI350X/ }).getAttribute('aria-checked'), 'true');
  change('Main workload', 'training'); click('Cerebras');
  assert.equal(screen.getByLabelText('Cluster size (wafers)').value, '8');
  assert.match(document.querySelector('.technical-results').textContent, /Network designed and supplied by Cerebras/);
  size(4096); assert.match(document.querySelector('.technical-results').textContent, /Above the published maximum/);
  click('NVIDIA'); assert.equal(screen.getByLabelText('Cluster size (GPUs)').value, '256');
  change('Main workload', 'digital_twin'); assert.ok(screen.getByText(/No platform in this reference fits digital twin/));
});

test('density, power profiles, size normalization, storage and CPU controls recalculate', () => {
  render(<TechnicalExplorer />); select(/HGX \/ DGX B300/); size(32);
  change('Rack density', 'air-2'); assert.match(metric('Facility power').textContent, /PUE 1.4/);
  change('Rack density', 'dlc-8'); assert.match(metric('Facility power').textContent, /PUE 1.2/); assert.match(metric('Per rack').textContent, /116/);
  size(1024); const oldCpu = metric('Front-end CPU').textContent; change('Front-end CPU', 'nv-vera'); assert.notEqual(metric('Front-end CPU').textContent, oldCpu);
  change('Storage', 'weka'); assert.match(metric('Data').textContent, /WEKA/);
  size(0); assert.equal(screen.getByLabelText(/Cluster size/).value, '1'); size(1.5); assert.equal(screen.getByLabelText(/Cluster size/).value, '2');
  select(/Vera Rubin NVL72/); change('Power profile', 'max-p'); click('1 scalable unit');
  assert.match(metric('Per rack').textContent, /230/); select(/HGX \/ DGX B300/);
  assert.equal(screen.queryByLabelText('Power profile'), null); assert.equal(screen.getByLabelText('Rack density').value, 'air-4');
});

test('beyond-ceiling alternatives and why dialogs close with button, Escape and backdrop', () => {
  render(<TechnicalExplorer />); click('~131,000');
  assert.ok(screen.getAllByText('Exceeds the two-layer limit.').length);
  assert.ok(screen.getAllByText('Single 3-tier fat tree').length);
  const trigger = metric('Facility power').querySelector('button'); trigger.focus(); fireEvent.click(trigger);
  assert.ok(screen.getByRole('dialog')); assert.ok(screen.getByRole('heading', { name: /PUE/i }));
  assert.match(screen.getByRole('dialog').textContent, /1.2/); click('Close explanation');
  assert.equal(screen.queryByRole('dialog'), null); assert.equal(document.activeElement, trigger);
  fireEvent.click(trigger); fireEvent(screen.getByRole('dialog'), new window.Event('cancel', { bubbles: false, cancelable: true })); assert.equal(screen.queryByRole('dialog'), null);
  fireEvent.click(trigger); fireEvent.click(screen.getByRole('dialog')); assert.equal(screen.queryByRole('dialog'), null);
});

test('rendered headline metrics match the original explorer after representative control changes', () => {
  const original = new JSDOM(fs.readFileSync('reference/atlas-explorer.html', 'utf8'), { runScripts: 'dangerously' });
  const old = original.window.document;
  const originalChange = (id, value) => { old.getElementById(id).value = value; old.getElementById(id).dispatchEvent(new original.window.Event('change', { bubbles: true })); };
  const oldPlatform = id => old.querySelector(`[data-id="${id}"]`).click();
  const compare = () => {
    const reference = Array.from(old.querySelectorAll('.headline .fact')).map(f => [f.querySelector('.k').textContent, f.querySelector('.v').textContent]);
    const current = Array.from(document.querySelectorAll('.headline .fact')).map(f => [f.querySelector('.k').textContent, f.querySelector('.v').textContent]);
    assert.deepEqual(current, reference);
    assert.deepEqual(Array.from(document.querySelectorAll('.alt h5')).map(e => e.textContent), Array.from(old.querySelectorAll('.alt h5')).map(e => e.textContent));
  };
  try {
    render(<TechnicalExplorer />); compare();
    select(/HGX \/ DGX B300/); oldPlatform('nv-hgx-b300'); size(32); originalChange('size', '32');
    for (const density of ['air-2', 'air-4', 'dlc-8']) { change('Rack density', density); originalChange('density', density); compare(); }
    change('Storage', 'ddn'); originalChange('storage', 'ddn'); change('Front-end CPU', 'nv-vera'); originalChange('frontend', 'nv-vera'); compare();
    select(/Vera Rubin NVL72/); oldPlatform('nv-vr-nvl72');
    for (const profile of ['max-q', 'max-p', '']) { change('Power profile', profile); originalChange('profile', profile); compare(); }
    size(131072); originalChange('size', '131072'); compare();
  } finally { original.window.close(); }
});

test('explainer Markdown renders lists/tables/links and escapes raw HTML', () => {
  render(<Markdown text={'**Power** and *cooling* [vendor](https://example.com) <script>bad()</script>\n\n- first\n- second\n\n| Name | Value |\n| --- | --- |\n| PUE | 1.2 |'} />);
  assert.equal(document.querySelector('strong').textContent, 'Power'); assert.equal(document.querySelector('em').textContent, 'cooling');
  assert.equal(screen.getByRole('link', { name: 'vendor' }).href, 'https://example.com/');
  assert.equal(document.querySelectorAll('li').length, 2); assert.ok(screen.getByRole('table')); assert.equal(document.querySelector('script'), null);
});
