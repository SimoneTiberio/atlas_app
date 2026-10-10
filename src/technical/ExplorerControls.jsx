import React from 'react';
import { defaultRackOption } from './engine.js';
import { eligible, visible, unitWord, workloadLabels, statusLabels, sizePresets, normalizeSize } from './explorerModel.js';

export default function ExplorerControls({ data, state, platform: p, rack, change }) {
  const size = state.sizeDraft ?? String(state.gpus);
  const platforms = data.platforms.filter(p => visible(p, state));
  const systems = Math.ceil(state.gpus / p.accel_per_system), racks = Math.ceil(systems / rack.systems_per_rack);
  const commitSize = () => change('gpus', normalizeSize(size));
  function movePlatform(event) {
    if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    const enabled = platforms.filter(p => eligible(p, state));
    const index = enabled.findIndex(p => p.id === state.platform);
    const next = enabled.at((index + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length);
    if (next) {
      event.preventDefault(); change('platform', next.id);
      event.currentTarget.querySelector(`[data-platform="${next.id}"]`).focus();
    }
  }
  return <section className="technical-inputs" aria-label="Customer requirements">
    <div className="field"><span className="label" id="technical-vendor-label">Vendor</span><div className="seg" role="group" aria-labelledby="technical-vendor-label">{['All', 'NVIDIA', 'AMD', 'Cerebras'].map(v => <button type="button" key={v} aria-pressed={state.vendor === v} onClick={() => change('vendor', v)}>{v}</button>)}</div></div>
    <div className="field"><label htmlFor="technical-workload">Main workload</label><select id="technical-workload" value={state.workload} onChange={e => change('workload', e.target.value)}>{data.workloads.map(w => <option key={w} value={w}>{workloadLabels[w]}</option>)}</select></div>
    <div className="field"><span className="label" id="technical-platform-label">Platform</span><div className="plist" role="radiogroup" aria-labelledby="technical-platform-label" onKeyDown={movePlatform}>
      {platforms.map((x, index) => {
        const [status, className] = statusLabels[x.status], ok = eligible(x, state), ro = defaultRackOption(x);
        return <React.Fragment key={x.id}>
          {x.vendor !== platforms[index - 1]?.vendor && <div className="vendor-head">{x.vendor}</div>}
          <button type="button" role="radio" className="pcard" data-platform={x.id} aria-checked={x.id === p.id} tabIndex={x.id === p.id ? 0 : -1} disabled={!ok} onClick={() => change('platform', x.id)}>
            <span className="pname">{x.name}</span><span>{x.confidence === 'estimate' && <span className="tag est">estimate</span>} <span className={`tag ${className}`}>{status}</span></span>
            <span className="pmeta">{ok ? `${x.accel_per_system} ${x.vendor === 'Cerebras' ? (x.accel_per_system > 1 ? 'wafers' : 'wafer') : 'GPUs'} per ${x.form === 'rack' ? 'rack' : 'system'} · ~${Math.round(ro.systems_per_rack * x.system_kw_typ)} kW per rack` : `Not listed for ${workloadLabels[state.workload].toLowerCase()} in Atlas`}</span>
          </button>
        </React.Fragment>;
      })}
    </div></div>
    <div className="field"><label htmlFor="technical-size">Cluster size ({unitWord(p)})</label><input id="technical-size" type="number" min="1" step={p.accel_per_system} inputMode="numeric" value={size} onChange={e => change('sizeDraft', e.target.value)} onBlur={commitSize} onKeyDown={e => { if (e.key === 'Enter') commitSize(); }} />
      <div className="presets">{sizePresets(p).map(([gpus, label], i) => <button type="button" key={`${gpus}-${i}`} onClick={() => { change('gpus', gpus); }}>{label}</button>)}</div>
      <div className="hint num">{p.form === 'rack' ? `${racks.toLocaleString('en-US')} ${racks === 1 ? 'rack' : 'racks'} of ${p.accel_per_system} (${(systems * p.accel_per_system).toLocaleString('en-US')} ${unitWord(p)})` : `${systems.toLocaleString('en-US')} ${p.vendor === 'Cerebras' ? 'systems' : 'servers'} in ${racks.toLocaleString('en-US')} racks`}</div>
    </div>
    {p.rack_options.length >= 2 && <div className="field"><label htmlFor="technical-density">Rack density</label><select id="technical-density" value={rack.id} onChange={e => change('density', e.target.value)}>{p.rack_options.map(o => <option value={o.id} key={o.id}>{o.systems_per_rack} per rack — {o.cooling} (~{Math.round(o.systems_per_rack * p.system_kw_typ)} kW)</option>)}</select></div>}
    {p.power_profiles && <div className="field"><label htmlFor="technical-profile">Power profile</label><select id="technical-profile" value={state.profile || ''} onChange={e => change('profile', e.target.value || null)}><option value="">Typical ({p.system_kw_typ} kW)</option>{p.power_profiles.map(x => <option key={x.id} value={x.id}>{x.id === 'max-q' ? 'Max-Q' : 'Max-P'} — {x.rack_kw} kW, {x.note.toLowerCase()}</option>)}</select></div>}
    <div className="field"><label htmlFor="technical-fabric">Selected fabric (optional)</label><select id="technical-fabric" value={state.selectedFabric || ''} onChange={e => change('selectedFabric', e.target.value || null)}><option value="">Compare all alternatives</option>{data.fabric_options.filter(f => f.platform === p.id).map(f => <option key={f.id} value={f.id}>{f.tech}</option>)}</select></div>
    <div className="field"><label htmlFor="technical-storage">Storage</label><select id="technical-storage" value={state.storage} onChange={e => change('storage', e.target.value)}>{data.storage.filter(s => s.role === 'performance').map(s => <option key={s.id} value={s.id}>{s.vendor} — {s.product.split(' — ')[0].split(' (')[0]}</option>)}</select></div>
    <div className="field"><label htmlFor="technical-frontend">Front-end CPU</label><select id="technical-frontend" value={state.frontend} onChange={e => change('frontend', e.target.value)}>{data.frontend.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
  </section>;
}
