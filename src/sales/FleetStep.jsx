import React from 'react';
export function FleetNotices({guidance}) { return guidance.warnings.length > 0 && <div className="hint fleet-warning" role="status">{guidance.warnings.map(w=><p key={w}>{w}</p>)}</div>; }
export default function FleetStep({input,change,field,guidance}) {
 return <>
 {field('gpuCount','Minimum GPU count','Enter a target','GPUs')}
 <label className="field">Scale-out protocol<select value={input.protocol} onChange={e=>change('protocol',e.target.value)}><option value="Any">No preference</option><option>InfiniBand</option><option>RoCE</option></select></label>
 <label className="field">Minimum speed per connection<select value={input.speedGbps} onChange={e=>change('speedGbps',e.target.value ? Number(e.target.value) : '')}><option value="">Not specified</option><option value="400">400 Gbps</option><option value="800">800 Gbps</option></select></label>
 <FleetNotices guidance={guidance}/>
 </>;
}
