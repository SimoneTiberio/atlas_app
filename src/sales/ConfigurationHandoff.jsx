import React, { useState } from 'react';
import Link from 'next/link';
import { useScenario, useScenarioField } from '../scenario/ScenarioProvider.jsx';
import { atlas, meetsSalesNetwork } from '../scenario/model.js';

export default function ConfigurationHandoff({ input, configuration, storage }) {
  const context = useScenario(), [selections, setSelections] = useScenarioField('sales', 'selections', {}), [errors, setErrors] = useState([]);
  const id = configuration.platform.id, options = selections[id] || {};
  const fabrics = atlas.fabric_options.filter(f => f.platform === id && meetsSalesNetwork(f, input));
  const products = (storage?.products || []).filter(s => atlas.storage.some(a => a.id === s.id && a.role === 'performance'));
  const change = (key, value) => { setErrors([]); setSelections(old => ({ ...old, [id]: { ...old[id], [key]: value } })); };
  return <section className="scenario-panel" aria-label={`Handoff ${configuration.platform.name}`}>
    <h3>Explore this configuration</h3>
    <label>Fabric for Technical (optional)<select value={options.fabric || ''} onChange={e => change('fabric', e.target.value)}><option value="">Compare all fabric alternatives</option>{options.fabric && !fabrics.some(f => f.id === options.fabric) && <option value={options.fabric}>Incompatible selection: {options.fabric}</option>}{fabrics.map(f => <option key={f.id} value={f.id}>{f.tech}</option>)}</select></label>
    <label>Storage for Technical (optional)<select value={options.storage || ''} onChange={e => change('storage', e.target.value)}><option value="">Use Technical’s default storage</option>{options.storage && !products.some(p => p.id === options.storage) && <option value={options.storage}>Previous selection (outside workload shortlist): {options.storage}</option>}{products.map(p => <option key={p.id} value={p.id}>{p.vendor} — {p.product}</option>)}</select></label>
    <p>Transfers the requested {Number(input.gpuCount).toLocaleString('en-US')} accelerators, not Sales’ rounded result. Fabric and storage choices do not change Sales sizing. Technical recalculates using its own assumptions.</p>
    {context && <Link className="scenario-action" href="/technical" onClick={event => {
      const issues = context.openTechnical(input, id, options);
      if (issues.length) { event.preventDefault(); setErrors(issues); }
    }}>Open in Technical</Link>}
    {errors.length > 0 && <div role="alert"><strong>Unable to transfer these inputs</strong><ul>{errors.map(e => <li key={e}>{e}</li>)}</ul></div>}
  </section>;
}
