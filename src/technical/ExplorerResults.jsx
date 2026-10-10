import React from 'react';
import { byId, explainLinks } from './engine.js';
import { unitWord, workloadLabels } from './explorerModel.js';

export const fmt = (x, digits = 0) => Number(x).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const mw = kw => fmt(kw / 1000, kw >= 10000 ? 1 : 2);

function Fact({ label, value, unit, children }) {
  return <div className="fact" data-metric={label}><div className="k">{label}</div><div className="v num">{value}{unit && <small>{unit}</small>}</div><div className="d">{children}</div></div>;
}

export function CeilingGauge({ requested, ceiling, unit, why, label = 'Two-layer limit' }) {
  const span = Math.max(requested, ceiling) * 1.15, x = value => value / span * 1000, over = requested > ceiling;
  return <div className="gauge"><svg viewBox="0 0 1000 56" preserveAspectRatio="none" role="img" aria-label={`${fmt(requested)} ${unit} requested, ${label.toLowerCase()} ${fmt(ceiling)}`}>
    <rect x="0" y="14" width="1000" height="14" rx="7" fill="#e3e9ed" />
    <rect x="0" y="14" width={Math.max(2, x(Math.min(requested, ceiling)))} height="14" rx="7" fill="var(--coolant)" />
    {over && <rect x={x(ceiling)} y="14" width={x(requested) - x(ceiling)} height="14" fill="var(--over)" />}
    <line x1={x(ceiling)} x2={x(ceiling)} y1="4" y2="38" stroke="var(--ink)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
  </svg><div className="cap num"><span>{fmt(requested)} {unit} requested</span><span>{label}: <strong>{fmt(ceiling)} {unit}</strong>{why}</span></div></div>;
}

function TopologyAlternative({ option, children }) {
  return <div className="alt"><h5>{option.label}</h5><p>{children}</p><dl className="num">
    <dt>Switches</dt><dd>{fmt(option.switches)}</dd><dt>Optics (800G-eq ends)</dt><dd>{fmt(option.transceiver_ends_800g_eq)}</dd><dt>Switch power</dt><dd>{fmt(option.switch_kw)} kW</dd>
  </dl></div>;
}

export function FabricOption({ run, best, selected, platform: p, data, why }) {
  const { f, plan, row } = run, links = explainLinks('fabric_option', f, data), topology = plan.network, unit = unitWord(p);
  const vendor = !f.switch, ceiling = f.limits.max_gpus_2tier;
  const family = vendor ? 'Cerebras network' : /InfiniBand/.test(f.fabric) ? 'InfiniBand' : /Spectrum-X/.test(f.fabric) ? 'Spectrum-X Ethernet' : 'Open Ethernet';
  const whyFabric = (id, label) => why(id, 'fabric_option', f, label);
  return <article className={`option${best ? ' best' : ''}${selected ? ' scenario-selected' : ''}`} data-fabric={f.id}>
    <div className="option-header"><h4>{family}</h4>{whyFabric(links.fabric, 'about')}
      {selected && <span className="tag rec">Scenario selection</span>}{f.recommended && <span className="tag rec">Recommended</span>}{p.vendor === 'NVIDIA' && !f.nvidia_validated && <span className="tag warn">Not NVIDIA-validated</span>}{f.note && <span className="tag est">Validate with vendor</span>}
    </div>
    <p className="tech">{f.tech}{f.planes > 1 && links.planes && <> · {f.planes} × {f.plane_gbps}G planes per {p.vendor === 'Cerebras' ? 'system' : 'GPU'}{whyFabric(links.planes)}</>}</p>
    {vendor ? <>
      {ceiling && <CeilingGauge requested={plan.gpus} ceiling={ceiling} unit={unit} label="Published maximum" why={whyFabric('cerebras-fabric')} />}
      <p className="verdict">{ceiling && plan.gpus > ceiling ? <><strong>Above the published maximum</strong> of {fmt(ceiling)} {unit} — discuss with Cerebras.</> : <><strong>Network designed and supplied by Cerebras.</strong> Sizing is done with the vendor.</>}{whyFabric('cerebras-fabric')}</p>
    </> : <>
      <CeilingGauge requested={plan.gpus} ceiling={ceiling} unit={unit} why={whyFabric(links.max_gpus_2tier)} />
      {links.warning && <p className="note warn">Single 800G planes on 51.2T switches stop at {fmt(ceiling)} GPUs.{whyFabric(links.warning)}</p>}
      {topology.chosen ? <>
        <p className="verdict"><strong>Fits in {topology.chosen.tiers === 1 ? 'one layer of switches' : 'a non-blocking two-layer network'}.</strong> {topology.chosen.tiers === 2 && <>{fmt(topology.chosen.per_plane.leaf)} leaf + {fmt(topology.chosen.per_plane.spine)} spine switches{f.planes > 1 ? ` in each of ${f.planes} planes` : ''}.</>}{whyFabric('non-blocking', 'non-blocking?')}</p>
        <div className="netgrid">
          <Fact label="Switches" value={fmt(topology.chosen.switches)}>{byId(data.switches, f.switch).name.split(' (')[0]}</Fact>
          <Fact label="Optics (800G-eq ends)" value={fmt(topology.chosen.transceiver_ends_800g_eq)}>{why('optics-count', 'reference_config', row, 'why count these?')}</Fact>
          <Fact label="Switch power" value={fmt(topology.chosen.switch_kw)} unit="kW">estimate, incl. optics</Fact>
          <Fact label="Room to grow" value={fmt(Math.max(0, ceiling - plan.gpus))}>{unit} before the limit</Fact>
        </div>
      </> : <>
        <p className="verdict"><strong>Exceeds the two-layer limit.</strong> Choose how to grow:{whyFabric('beyond-2tier')}</p>
        <div className="alts"><TopologyAlternative option={topology.alternatives[0]}>Cheapest. One job cannot span pods at full speed.</TopologyAlternative><TopologyAlternative option={topology.alternatives[1]}>One flat fabric for one giant job.{whyFabric('three-tier-cost', 'why it costs more')}</TopologyAlternative></div>
      </>}
      {plan.power.allowance_exceeded && <p className="note">Network, storage and CPU add up to {fmt(plan.power.bottom_up_net_storage_frontend_kw)} kW, above the {fmt(plan.power.network_and_peripherals_allowance_kw)} kW allowance of the 90/10 rule.{why('power-90-10', 'reference_config', row)}</p>}
    </>}
  </article>;
}

export default function ExplorerResults({ data, state, platform: p, rack, runs, change, why }) {
  if (!runs.length) return <section className="technical-results" aria-live="polite"><div className="empty"><h2>No platform in this reference fits {workloadLabels[state.workload].toLowerCase()}</h2><p>Digital twins (NVIDIA Omniverse) run on RTX-class servers, which are not in this dataset yet. Pick another workload to see AI factory options.</p></div></section>;
  const { plan, row } = runs[0], links = explainLinks('platform', p, data), unit = unitWord(p), storage = byId(data.storage, state.storage);
  const rackPeak = Math.round(rack.systems_per_rack * (state.profile ? plan.rack_kw_typ / rack.systems_per_rack : p.system_kw_peak));
  const whyPlatform = (id, label) => why(id, 'platform', p, label);
  const whyRow = (id, label) => why(id, 'reference_config', row, label);
  return <section className="technical-results" aria-live="polite">
    <div className="headline"><h2>{p.name} · {fmt(plan.gpus)} {unit}</h2>
      <p className="sub">{workloadLabels[state.workload]} · {p.availability}{whyPlatform(links.family || links.form, 'what is it?')} · <span className={`tag${p.confidence === 'estimate' ? ' est' : ''}`}>Catalog label: {p.confidence === 'estimate' ? 'power figures estimated' : p.confidence}</span>{whyPlatform('status-and-confidence', 'confidence')}</p>
      <div className="facts">
        <Fact label="Compute racks" value={fmt(plan.compute_racks)}>{p.form === 'rack' ? 'one system per rack' : `${rack.systems_per_rack} ${p.vendor === 'Cerebras' ? 'systems' : 'servers'} per rack`}</Fact>
        <Fact label="Per rack" value={fmt(plan.rack_kw_typ)} unit="kW">{/liquid|water/i.test(rack.cooling) ? 'Liquid-cooled' : 'Air-cooled'}{whyPlatform(links.rack_kw_typ)}{whyPlatform(links.cooling, 'cooling')}{rackPeak > plan.rack_kw_typ && <><br />peak ~{fmt(rackPeak)} kW{whyPlatform('typical-vs-peak')}</>}</Fact>
        <Fact label="IT power" value={mw(plan.power.it_kw)} unit="MW">{p.cluster_provisioned_kw_per_system ? 'vendor-provisioned load' : 'compute ÷ 0.9'}{whyRow('power-90-10')}</Fact>
        <Fact label="Facility power" value={mw(plan.power.facility_kw)} unit="MW">PUE {plan.power.pue}{whyRow('pue')}</Fact>
        <Fact label="Storage read" value={fmt(plan.storage.read_GBps < 1000 ? plan.storage.read_GBps : plan.storage.read_GBps / 1000, 1)} unit={plan.storage.read_GBps < 1000 ? 'GB/s' : 'TB/s'}>{plan.storage.tier} tier{whyRow('storage-bandwidth')}</Fact>
        <Fact label="Data" value={plan.storage.lake_PB < 1 ? fmt(plan.storage.lake_PB * 1000) : fmt(plan.storage.lake_PB, plan.storage.lake_PB < 10 ? 1 : 0)} unit={plan.storage.lake_PB < 1 ? 'TB' : 'PB'}>{fmt(plan.storage.building_blocks)} {storage.vendor} {plan.storage.building_blocks === 1 ? 'block' : 'blocks'}{plan.storage.capacity_tier_units ? ` + ${fmt(plan.storage.capacity_tier_units)} object ${plan.storage.capacity_tier_units === 1 ? 'rack' : 'racks'}` : ''}{whyRow('storage-two-tiers')}</Fact>
        <Fact label="Front-end CPU" value={fmt(plan.frontend.nodes)} unit="servers">{fmt(plan.frontend.vcpu_required)} vCPU{whyRow('vcpu-per-gpu')}</Fact>
        <Fact label="Memory" value={fmt(p.hbm_gb_per_accel)} unit="GB">per {p.vendor === 'Cerebras' ? 'wafer (SRAM)' : 'GPU'}{whyPlatform(links.hbm_gb_per_accel)}</Fact>
      </div>
    </div>
    <div className="opts-head"><h3>Network options</h3><p>Best fit first. Power and storage above are the same for every option.</p></div>
    {runs.filter((run, index) => state.showAll || index < 3 || run.f.id === state.selectedFabric).map(run => <FabricOption key={run.f.id} run={run} best={run === runs[0]} selected={run.f.id === state.selectedFabric} platform={p} data={data} why={why} />)}
    {runs.length > 3 && <button type="button" className="more" onClick={() => change('showAll', !state.showAll)}>{state.showAll ? 'Show the top 3 only' : `Show all ${runs.length} network options`}</button>}
  </section>;
}
