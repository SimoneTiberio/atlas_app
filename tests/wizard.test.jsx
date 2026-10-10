import './setup-dom.js';
import React from 'react';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import InfrastructureAdvisor from '../src/sales/InfrastructureAdvisor.jsx';

afterEach(cleanup);
const click = name => fireEvent.click(screen.getByRole('button', { name }));
const change = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const chooseB200 = () => change('Platform', 'nv-hgx-b200');
const facilityStep = () => { click(/^Continue/); click(/^Continue/); };

test('three-step navigation validates prerequisites, allows back and scopes platform choices', () => {
  render(<InfrastructureAdvisor />);
  const qualification = screen.getByLabelText('Catalog and calculation qualification').textContent;
  assert.match(qualification, /Atlas 2026-10-07.*partially verified/);
  assert.match(qualification, /different OEM configurations/);
  assert.match(qualification, /40U.*15%.*PUE 1.20/);
  assert.equal(document.querySelectorAll('main, aside, header').length, 0, 'Sales uses the shared application shell');
  chooseB200(); click(/^Continue/);
  change(/Minimum GPU count/, '0'); click(/3Facility & power/);
  assert.match(screen.getByRole('alert').textContent, /positive whole number/);
  assert.ok(screen.getByLabelText(/Minimum GPU count/));
  change(/Minimum GPU count/, '9'); click(/^Continue/);
  assert.ok(screen.getByLabelText('Available cooling'));
  click('Back'); click('Back'); click('AMD');
  assert.equal(screen.getByLabelText('Platform').value, 'Any');
  assert.ok(!Array.from(screen.getByLabelText('Platform').options).some(o => o.value === 'nv-hgx-b200'));
  click('Digital Twin'); assert.match(screen.getByRole('status').textContent, /No platform in Atlas/);
});

test('OEM overrides, results invalidation, platform/vendor reset and full Reset are preserved', () => {
  render(<InfrastructureAdvisor />); chooseB200(); facilityStep();
  change(/OEM full-server peak power/, '10'); change(/OEM server height/, '8'); change(/Maximum compute rack power/, '40');
  click(/^Show configurations/);
  assert.ok(screen.getByRole('button', { name: /^Export plan/ })); assert.ok(screen.getByText(/2.500 MW compute/));
  change(/Maximum facility power budget/, '3');
  assert.equal(screen.queryByRole('button', { name: /^Export plan/ }), null);
  click(/^Show configurations/); assert.ok(screen.getByText('No power-sized configuration'));
  click('Back'); click('Back'); change('Platform', 'nv-hgx-b300'); facilityStep();
  assert.equal(screen.getByLabelText(/OEM full-server peak power/).value, '');
  assert.equal(screen.getByLabelText(/OEM server height/).value, '');
  change(/OEM full-server peak power/, '12'); click('Back'); click('Back'); click('AMD');
  assert.equal(screen.getByLabelText('Platform').value, 'Any');
  change('Platform', 'amd-mi355x'); facilityStep(); assert.equal(screen.getByLabelText(/OEM full-server peak power/).value, '');
  click('Reset'); assert.equal(screen.getByLabelText('Platform').value, 'Any');
  assert.equal(screen.getByRole('button', { name: 'NVIDIA' }).getAttribute('aria-pressed'), 'true');
  facilityStep(); assert.equal(screen.getByLabelText(/Maximum facility power budget/).value, '');
  click('Back'); assert.equal(screen.getByLabelText(/Minimum GPU count/).value, '2000');
});

test('incomplete results support entering specifications, and cooling exclusions appear', () => {
  render(<InfrastructureAdvisor />); chooseB200(); facilityStep(); change(/Maximum compute racks/, '1'); click(/^Show configurations/);
  assert.ok(screen.getByText(/Needs power specifications/)); click('Enter specifications');
  assert.ok(screen.getByLabelText(/OEM server height/)); assert.equal(screen.queryByRole('button', { name: /^Export plan/ }), null);
  click('Reset'); change('Platform', 'nv-gb300-nvl72'); facilityStep(); change('Available cooling', 'air'); click(/^Show configurations/);
  assert.ok(screen.getByText('This platform requires direct liquid cooling.'));
});

test('Export plan downloads valid JSON with Atlas provenance and calculated results', async () => {
  let blob, downloadName, revoked;
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL, originalClick = window.HTMLAnchorElement.prototype.click;
  const originalTimer = globalThis.setTimeout;
  URL.createObjectURL = value => { blob = value; return 'blob:atlas-test'; };
  URL.revokeObjectURL = value => { revoked = value; };
  window.HTMLAnchorElement.prototype.click = function () { downloadName = this.download; };
  try {
    render(<InfrastructureAdvisor />); chooseB200(); click(/^Continue/); change(/Minimum GPU count/, '8'); click(/^Continue/); click(/^Show configurations/);
    globalThis.setTimeout = callback => { callback(); return 0; };
    click(/^Export plan/);
    const saved = JSON.parse(await blob.text());
    assert.equal(blob.type, 'application/json'); assert.equal(downloadName, 'atlas-sizing-summary.json'); assert.equal(revoked, 'blob:atlas-test');
    assert.equal(saved.inputs.gpuCount, '8'); assert.equal(saved.matches[0].unitKw, 14.3); assert.ok(Math.abs(saved.matches[0].facilityMw - .019734) < 1e-12);
    assert.equal(saved.matches[0].platform.source.id, 'nv-hgx-b200'); assert.equal(saved.assumptions.pue, 1.2); assert.equal(saved.source, 'data/atlas.json');
  } finally {
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; window.HTMLAnchorElement.prototype.click = originalClick; globalThis.setTimeout = originalTimer;
  }
});
