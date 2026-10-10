import React from 'react';
import Link from 'next/link';
import { useScenario } from './ScenarioProvider.jsx';
import { atlas } from './model.js';

const labels = { cooling: 'Available cooling', maxMw: 'Facility budget (MW)', rackKw: 'Rack limit (kW)', maxRacks: 'Rack count limit', unitKw: 'OEM full-unit peak (kW)', serverU: 'OEM server height (U)', protocol: 'Sales protocol requirement', speedGbps: 'Sales connection speed (Gbps)', vendor: 'Sales vendor preference' };

export default function TechnicalContext() {
  const context = useScenario(), h = context?.scenario.handoff;
  if (!h) return null;
  const p = atlas.platforms.find(p => p.id === h.platformId);
  return <section className="scenario-panel" aria-label="Sales scenario context">
    <div className="scenario-heading"><h2>Sales scenario context</h2><Link href="/sales" className="scenario-action">Return to Sales</Link></div>
    <p>Opened from {p.name} with {h.acceleratorTarget.toLocaleString('en-US')} requested accelerators. Returning restores the Sales inputs and wizard progress; Technical edits stay in Technical.</p>
    <p>Facility limits, cooling availability, OEM overrides and network requirements below are retained for review. They are not applied to Technical calculations. Technical uses its selected density, power profile and independent planning assumptions.</p>
    <dl className="scenario-context">{Object.entries(labels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{h.context[key] === '' || h.context[key] == null || h.context[key] === 'unknown' ? 'Unconfirmed' : String(h.context[key])}</dd></div>)}</dl>
    <p>{h.fabricId ? `Explicit fabric transferred: ${h.fabricId}. Alternatives remain visible.` : 'No explicit fabric selected in Sales: all alternatives are compared.'} {h.storageId ? `Explicit storage transferred: ${h.storageId}.` : 'No explicit storage selected in Sales: Technical starts with its VAST default.'} Rack density, power profile and CPU start at Technical’s defaults when opening a Sales configuration.</p>
  </section>;
}
