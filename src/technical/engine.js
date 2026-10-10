// Ported verbatim from reference/atlas-explorer.html, excluding the catalog and DOM UI.
/* ===== Sizing and explanation engines (generated from src/sizing.mjs + src/explain.mjs) ===== */
// Atlas sizing engine — pure functions, no dependencies.
// Import from the webapp (Next.js / Vite / Node 18+):
//   import { planCluster, fabricLimits } from "./sizing.mjs";
//   import * as DATA from "./data.mjs";   // or load data/*.json from the DB

const ceil = Math.ceil;
const floor = Math.floor;
const r1 = (x) => Math.round(x * 10) / 10;

function byId(list, id) {
  const hit = list.find((x) => x.id === id);
  if (!hit) throw new Error(`Unknown id: ${id}`);
  return hit;
}

function defaultRackOption(platform) {
  return platform.rack_options.find((o) => o.default) || platform.rack_options[0];
}

/** Radix (ports) of a switch at a given logical port speed. */
function radix(sw, gbps) {
  const k = sw.radix[gbps];
  if (!k) throw new Error(`${sw.id} has no ${gbps}G port mode`);
  return k;
}

/**
 * Scale limits of one fabric option.
 * Non-blocking folded Clos, per plane:
 *   1-tier = k, 2-tier = k^2/2, 3-tier = k^3/4 endpoints.
 * Each GPU has one port on every plane, so GPU limit = per-plane endpoint limit.
 */
function fabricLimits(fo, platform, sw, rackOpt = defaultRackOption(platform)) {
  const accelPerRack = platform.accel_per_system * rackOpt.systems_per_rack;
  if (!sw) {
    const maxSys = fo.vendor_max_systems ?? null;
    return {
      k: null,
      vendor_defined: true,
      max_gpus_1tier: null,
      max_gpus_2tier: maxSys ? maxSys * platform.accel_per_system : null,
      max_gpus_3tier: null,
      max_systems_2tier: maxSys,
      max_racks_2tier: maxSys ? floor(maxSys / rackOpt.systems_per_rack) : null,
    };
  }
  const k = radix(sw, fo.plane_gbps);
  const g1 = k;
  const g2 = (k * k) / 2;
  const g3 = (k * k * k) / 4;
  const sys2 = floor(g2 / platform.accel_per_system);
  return {
    k,
    vendor_defined: false,
    max_gpus_1tier: g1,
    max_gpus_2tier: g2,
    max_gpus_3tier: g3,
    max_systems_2tier: sys2,
    max_racks_2tier: floor(g2 / accelPerRack),
    max_systems_3tier: floor(g3 / platform.accel_per_system),
  };
}

/** Switch / link counts for N GPUs on one fabric (all planes). */
function fabricBill(N, fo, sw, tiers) {
  const k = radix(sw, fo.plane_gbps);
  const P = fo.planes;
  let leaf = 0, agg = 0, spine = 0;
  if (tiers === 1) {
    leaf = ceil(N / k);
  } else if (tiers === 2) {
    leaf = ceil(N / (k / 2));
    spine = ceil(N / k);
  } else {
    leaf = ceil(N / (k / 2));
    agg = ceil(N / (k / 2));
    spine = ceil(N / k); // core / super-spine
  }
  const perPlane = { leaf, agg, spine, total: leaf + agg + spine };
  const switchesTotal = perPlane.total * P;
  // transceiver ends in 800G-equivalents: host link + one link layer per tier above leaf, 2 ends each
  const gpuGbps = P * fo.plane_gbps;
  const layers = tiers; // host->leaf, leaf->spine, spine->core
  const optics800 = ceil((2 * layers * N * gpuGbps) / 800);
  return {
    tiers,
    planes: P,
    per_plane: perPlane,
    switches: switchesTotal,
    switch_kw: r1(switchesTotal * sw.kw_with_optics),
    transceiver_ends_800g_eq: optics800,
  };
}

/** Pick the cheapest non-blocking topology for N GPUs and list the alternatives. */
function topologyFor(N, fo, platform, sw) {
  const lim = fabricLimits(fo, platform, sw);
  if (lim.vendor_defined) {
    return { chosen: { tiers: null, vendor_defined: true, note: fo.tech }, alternatives: [], limits: lim };
  }
  if (N <= lim.max_gpus_1tier) {
    return { chosen: fabricBill(N, fo, sw, 1), alternatives: [], limits: lim };
  }
  if (N <= lim.max_gpus_2tier) {
    return { chosen: fabricBill(N, fo, sw, 2), alternatives: [], limits: lim };
  }
  // Beyond 2-tier: (A) several independent 2-tier pods, (B) one 3-tier fabric
  const pods = ceil(N / lim.max_gpus_2tier);
  const perPod = fabricBill(ceil(N / pods), fo, sw, 2);
  const podsBill = {
    option: "A",
    label: `${pods} independent 2-tier pods`,
    tiers: 2,
    pods,
    switches: perPod.switches * pods,
    switch_kw: r1(perPod.switch_kw * pods),
    transceiver_ends_800g_eq: perPod.transceiver_ends_800g_eq * pods,
    tradeoff: "Cheapest. A single job cannot span pods at full bandwidth — good for multi-tenant / many jobs, not one giant training run.",
  };
  const three = fabricBill(N, fo, sw, 3);
  const threeBill = {
    option: "B",
    label: "Single 3-tier fat tree",
    ...three,
    tradeoff: "One flat fabric for one job. ~+67% switches and ~+50% optics per GPU vs 2-tier, +1 hop latency.",
  };
  return {
    chosen: null,
    beyond_2tier: true,
    alternatives: [podsBill, threeBill],
    limits: lim,
  };
}

/**
 * Full plan for a sales conversation.
 * input: { platform, fabric, units?, gpus?, rackOption?, workload, storage, frontend, powerProfile? }
 *   units = systems (nodes) for node platforms, racks for rack-scale platforms
 */
function planCluster(input, DATA) {
  const p = byId(DATA.platforms, input.platform);
  const fo = byId(DATA.fabric_options, input.fabric);
  if (fo.platform !== p.id) throw new Error(`${fo.id} is not a fabric for ${p.id}`);
  const sw = fo.switch ? byId(DATA.switches, fo.switch) : null;
  const rackOpt = input.rackOption ? byId(p.rack_options, input.rackOption) : defaultRackOption(p);
  const workload = input.workload || "mixed";

  const systems = input.units ?? ceil((input.gpus || 0) / p.accel_per_system);
  const gpus = systems * p.accel_per_system;
  const racks = ceil(systems / rackOpt.systems_per_rack);

  // ---- power ----
  let sysKw = p.system_kw_typ;
  if (input.powerProfile && p.power_profiles) sysKw = byId(p.power_profiles, input.powerProfile).rack_kw;
  const computeKwTyp = r1(systems * sysKw);
  const computeKwPeak = r1(systems * (input.powerProfile ? sysKw : p.system_kw_peak));
  const share = DATA.assumptions.compute_share_of_it_power;
  let itKw = r1(computeKwTyp / share);
  if (p.cluster_provisioned_kw_per_system) itKw = r1(Math.max(itKw, systems * p.cluster_provisioned_kw_per_system));
  const liquid = /liquid|water/i.test(rackOpt.cooling); // cooling of the chosen rack density, not the platform's options
  const pue = liquid ? DATA.assumptions.pue.liquid : DATA.assumptions.pue.air;

  // ---- network ----
  const topo = topologyFor(gpus, fo, p, sw);
  const netChosen = topo.chosen || topo.alternatives.find((a) => a.option === "B");

  // ---- storage: performance tier (chosen vendor) + capacity tier (object) ----
  const SR = DATA.storage_rules;
  const st = input.storage ? byId(DATA.storage, input.storage) : null;
  const tier = SR.tier_by_workload[workload];
  const readGBs = r1(gpus * SR.read_gbps_per_gpu[tier]);
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const lakePB = r3((gpus * SR.usable_tb_per_gpu[workload]) / 1000);
  const hotPB = r3((gpus * SR.hot_tb_per_gpu[workload]) / 1000);
  let storagePlan = { tier, read_GBps: readGBs, write_GBps: r1(readGBs * SR.write_ratio), hot_PB: hotPB, lake_PB: lakePB, usable_PB: lakePB };
  if (st) {
    const unitsPerf = ceil(readGBs / st.read_gbps_per_unit);
    const unitsCap = ceil(hotPB / st.usable_pb_per_unit);
    const units = Math.max(unitsPerf, unitsCap, 1);
    const cap = byId(DATA.storage, SR.capacity_tier_id);
    const coldPB = Math.max(0, lakePB - units * st.usable_pb_per_unit);
    const capUnits = st.id === cap.id ? 0 : ceil(coldPB / cap.usable_pb_per_unit);
    storagePlan = {
      ...storagePlan,
      vendor: st.vendor,
      product: st.product,
      building_blocks: units,
      sized_by: unitsPerf >= unitsCap ? "performance" : "capacity",
      performance_tier_kw: r1(units * st.kw_per_unit),
      capacity_tier_units: capUnits,
      capacity_tier_kw: r1(capUnits * cap.kw_per_unit),
      kw: r1(units * st.kw_per_unit + capUnits * cap.kw_per_unit),
    };
  }

  // ---- front-end CPU ----
  const fe = input.frontend ? byId(DATA.frontend, input.frontend) : null;
  const vcpu = gpus * DATA.frontend_rules.vcpu_per_gpu[workload];
  let fePlan = { vcpu_required: vcpu };
  if (fe) {
    const nodes = ceil(vcpu / fe.vcpu_per_node) + DATA.frontend_rules.control_plane_nodes;
    fePlan = { ...fePlan, cpu: fe.name, nodes, kw: r1(nodes * fe.node_kw) };
  }

  // ---- 90/10 power check ----
  const bottomUp = r1((netChosen?.switch_kw || 0) + (storagePlan.kw || 0) + (fePlan.kw || 0));
  const allowance = r1(itKw - computeKwTyp);

  return {
    platform: p.name,
    fabric: `${fo.fabric} — ${fo.tech}`,
    rack_option: rackOpt.id,
    systems,
    gpus,
    compute_racks: racks,
    rack_kw_typ: r1(rackOpt.systems_per_rack * sysKw),
    power: {
      compute_kw_typ: computeKwTyp,
      compute_kw_peak: computeKwPeak,
      network_and_peripherals_allowance_kw: allowance,
      bottom_up_net_storage_frontend_kw: bottomUp,
      allowance_exceeded: bottomUp > allowance,
      it_kw: itKw,
      pue,
      facility_kw: r1(itKw * pue),
      facility_mw: Math.round((itKw * pue) / 10) / 100,
    },
    network: topo,
    storage: storagePlan,
    frontend: fePlan,
    confidence: p.confidence,
  };
}

// Links each displayed field to an explainer, and fills the explainer's
// {placeholders} from the data row. Pure functions, no dependencies.
//
//   import { explainLinks, renderExplainer } from "./explain.mjs";
//   const links = explainLinks("fabric_option", row, DATA);    // { max_racks_2tier: "ceiling-2tier", ... }
//   const box   = renderExplainer(links.max_racks_2tier, "fabric_option", row, DATA);
//   // box = { id, title, summary, body (Markdown), links: [{label,url}] }



const n = (x) => (typeof x === "number" ? x.toLocaleString("en-US") : x);
const gbpsLabel = (g) => (g >= 1000 ? `${(g / 1000).toLocaleString("en-US")} Tb/s` : `${g} Gb/s`);
const plural = (w, c) => (c === 1 ? w : `${w}s`);
const WORDS = { 1: "one", 2: "two", 3: "three", 4: "four", 6: "six", 8: "eight", 12: "twelve" };
const word = (x) => WORDS[x] ?? String(x);
const times = (x) => (x === 2 ? "twice" : `${word(x)} times`);

// ------------------------------------------------------------------ contexts
function globalContext(DATA) {
  const SR = DATA.storage_rules, FR = DATA.frontend_rules;
  const turin = byId(DATA.frontend, "epyc-turin");
  const exVcpu = 1000 * FR.vcpu_per_gpu.inference;
  return {
    hot_training: SR.hot_tb_per_gpu.training,
    hot_inference: SR.hot_tb_per_gpu.inference,
    lake_training: SR.usable_tb_per_gpu.training,
    lake_inference: SR.usable_tb_per_gpu.inference,
    read_enhanced: SR.read_gbps_per_gpu.enhanced,
    read_standard: SR.read_gbps_per_gpu.standard,
    example_read_tbs: n((10000 * SR.read_gbps_per_gpu.enhanced) / 1000),
    control_plane_nodes: FR.control_plane_nodes,
    vcpu_inference: FR.vcpu_per_gpu.inference,
    vcpu_mixed: FR.vcpu_per_gpu.mixed,
    vcpu_fine_tuning: FR.vcpu_per_gpu.fine_tuning,
    vcpu_training: FR.vcpu_per_gpu.training,
    example_vcpu: n(exVcpu),
    example_nodes: Math.ceil(exVcpu / turin.vcpu_per_node),
    turin_vcpu: turin.vcpu_per_node,
  };
}

function platformContext(p, DATA) {
  const ro = defaultRackOption(p);
  const isWafer = p.vendor === "Cerebras";
  const accel = isWafer ? "wafer" : "GPU";
  const accelPerRack = p.accel_per_system * ro.systems_per_rack;
  const rackTyp = Math.round(ro.systems_per_rack * p.system_kw_typ);
  const rackPeak = Math.round(ro.systems_per_rack * (p.system_kw_peak ?? p.system_kw_typ));
  const liquid = /liquid|water/i.test(p.cooling) && !/^air/i.test(p.cooling);
  const memTB = (accelPerRack * (p.hbm_gb_per_accel || 0)) / 1000;
  const sysWord = p.form === "rack" ? "rack" : isWafer ? "system" : "server";
  return {
    ...globalContext(DATA),
    platform: p.name,
    vendor: p.vendor,
    accel_label: accel,
    accel_plural: plural(accel, p.accel_per_system),
    accel_per_system: p.accel_per_system,
    accel_per_rack: accelPerRack,
    system_word: sysWord,
    scale_up_tech: p.scale_up.tech,
    scale_up_domain: p.scale_up.domain,
    gbps_per_gpu_label: gbpsLabel(p.scale_out_gbps_per_accel),
    hbm_label: isWafer ? `${p.hbm_gb_per_accel} GB of on-wafer SRAM` : `${p.hbm_gb_per_accel} GB`,
    rack_memory_label: `${memTB.toLocaleString("en-US", { maximumFractionDigits: 1 })} TB`,
    rack_memory_sentence: p.form === "rack" ? `, or ${memTB.toLocaleString("en-US", { maximumFractionDigits: 1 })} TB across the rack` : "",
    form_phrase: p.form === "rack"
      ? `as a whole rack of ${p.accel_per_system} ${plural(accel, p.accel_per_system)} working as one`
      : `as ${p.accel_per_system}-GPU servers`,
    density_label: p.form === "rack" ? "one system per rack" : `${ro.systems_per_rack} ${plural(sysWord, ro.systems_per_rack)} per rack`,
    rack_kw_typ: rackTyp,
    rack_kw_peak: rackPeak,
    peak_phrase: rackPeak > rackTyp ? `, peaking near ${rackPeak} kW` : "",
    cooling: p.cooling,
    cooling_word: liquid ? "liquid-cooled" : "air-cooled",
    cooling_sentence: liquid
      ? "It needs direct liquid cooling."
      : rackTyp > 40 ? "It can be air-cooled at this density, with rear-door heat exchangers." : "It can be air-cooled at this density.",
    density_note: p.form === "rack"
      ? "A rack-scale system cannot be split, so the hall must support the full rack."
      : "Fewer servers per rack is possible, but needs more racks and floor space.",
    availability: p.availability,
    confidence: p.confidence,
    su_label: p.form === "rack"
      ? `${p.su_systems} racks (${n(p.su_systems * p.accel_per_system)} ${plural(accel, 2)})`
      : `${p.su_systems} ${plural(sysWord, p.su_systems)} (${n(p.su_systems * p.accel_per_system)} ${plural(accel, 2)})`,
    vendor_max_label: p.max_cluster_systems ? `${n(p.max_cluster_systems)} systems` : "a size Cerebras has not yet published",
  };
}

function fabricContext(fo, DATA) {
  const p = byId(DATA.platforms, fo.platform);
  const ctx = platformContext(p, DATA);
  const sw = fo.switch ? byId(DATA.switches, fo.switch) : null;
  const L = fo.limits || fabricLimits(fo, p, sw);
  const ro = defaultRackOption(p);
  if (!sw) return { ...ctx, fabric: fo.fabric, switch: "Cerebras-supplied network", planes: fo.planes };
  const k = L.k, half = k / 2;
  const unitsLabel = p.form === "rack"
    ? `${n(L.max_racks_2tier)} racks`
    : `${n(L.max_systems_2tier)} servers, ${n(L.max_racks_2tier)} racks`;
  const unitsSentence = p.form === "rack"
    ? `With ${p.accel_per_system} GPUs per rack, that is **${n(L.max_racks_2tier)} racks**.`
    : `With ${p.accel_per_system} GPUs per server, that is **${n(L.max_systems_2tier)} servers** (${n(L.max_racks_2tier)} racks at ${ro.systems_per_rack} servers per rack).`;
  const kAlt = sw.radix[800] ?? k;
  const altCeil = (kAlt * kAlt) / 2;
  const k200 = sw.radix[200] ?? null;
  const nvidiaSx = /Spectrum-X/.test(fo.fabric);
  return {
    ...ctx,
    fabric: fo.fabric,
    switch: sw.name,
    k, half_k: half,
    planes: fo.planes,
    planes_word: word(fo.planes),
    planes_times: times(fo.planes),
    plane_gbps_label: gbpsLabel(fo.plane_gbps),
    gbps_per_gpu_label: gbpsLabel(fo.planes * fo.plane_gbps),
    max_gpus_2tier: n(L.max_gpus_2tier),
    max_racks_2tier: n(L.max_racks_2tier),
    max_systems_2tier: n(L.max_systems_2tier),
    max_units_label: unitsLabel,
    units_sentence: unitsSentence,
    plane_note: fo.planes > 1
      ? ` Each GPU connects to ${word(fo.planes)} of these networks in parallel (one port in each), so the GPU limit equals one network's limit.`
      : "",
    leaf_fit: p.form === "rack" && ctx.accel_per_rack === half
      ? (fo.planes > 1 ? " That works out neatly as one leaf switch per rack in each plane." : " That works out neatly as one leaf switch per rack.")
      : "",
    k_alt: kAlt,
    alt_ceiling: n(altCeil),
    multiplier: kAlt !== k ? `${Math.round(L.max_gpus_2tier / altCeil)}x` : "",
    balance_note: nvidiaSx
      ? "The network cards must spread traffic evenly across the planes; NVIDIA Spectrum-X does this in hardware."
      : "The network cards and software must spread traffic evenly across the planes; confirm the vendor supports this before proposing it.",
    k_200: k200 ?? "",
    ceil_200: k200 ? n((k200 * k200) / 2) : "",
  };
}

function referenceContext(r, DATA) {
  const fo = byId(DATA.fabric_options, r.fabric_option_id);
  const p = byId(DATA.platforms, r.platform_id);
  const ctx = fabricContext(fo, DATA);
  const mw = (kw) => (kw / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 });
  const vendorPower = !!p.cluster_provisioned_kw_per_system;
  return {
    ...ctx,
    gpus: n(r.gpus),
    compute_racks: n(r.compute_racks),
    pue: r.pue,
    cooling_word: r.pue <= DATA.assumptions.pue.liquid ? "liquid-cooled" : "air-cooled",
    compute_mw: mw(r.compute_kw_typ),
    it_mw: mw(r.it_kw),
    facility_mw: mw(r.facility_kw),
    ref_example: vendorPower
      ? `For Cerebras, Atlas instead uses Cerebras's own provisioned load, which already includes the network cabinets: ${mw(r.it_kw)} MW of IT power here.`
      : `For this configuration: ${mw(r.compute_kw_typ)} MW of compute ÷ 0.9 = **${mw(r.it_kw)} MW** of IT power.`,
    pue_example: `Here: ${mw(r.it_kw)} MW × ${r.pue} = **${mw(r.facility_kw)} MW** of facility power.`,
  };
}

function storageContext(s, DATA) { return { ...globalContext(DATA), product: s.product, vendor: s.vendor }; }
function frontendContext(f, DATA) { return { ...globalContext(DATA), cpu: f.name }; }

function contextFor(entity, row, DATA) {
  switch (entity) {
    case "platform": return platformContext(row, DATA);
    case "fabric_option": return fabricContext(row, DATA);
    case "reference_config": return referenceContext(row, DATA);
    case "storage_option": return storageContext(row, DATA);
    case "frontend_option": return frontendContext(row, DATA);
    default: throw new Error(`Unknown entity ${entity}`);
  }
}

// ------------------------------------------------------------------ which "why?" link sits on which field
function explainLinks(entity, row, DATA) {
  const out = {};
  if (entity === "platform") {
    const p = row, wafer = p.vendor === "Cerebras";
    out.form = wafer ? "cerebras-wafer" : "rack-scale-vs-server";
    if (/NVL72/.test(p.name)) out.family = "what-is-nvl72";
    if (/Helios/.test(p.name)) out.family = "what-is-helios";
    if (!wafer) { out.scale_up = "scale-up-vs-scale-out"; out.hbm_gb_per_accel = "hbm-memory"; }
    out.rack_kw_typ = "rack-power-density";
    out.cooling = "liquid-vs-air";
    if ((p.system_kw_peak ?? p.system_kw_typ) > p.system_kw_typ) out.system_kw_peak = "typical-vs-peak";
    if (!p.workloads.hpc && !wafer) out.wl_hpc = "fp64-hpc";
    out.status = "status-and-confidence";
  } else if (entity === "fabric_option") {
    const fo = row;
    if (!fo.switch) { out.fabric = "cerebras-fabric"; out.max_gpus_2tier = "cerebras-fabric"; return out; }
    const sw = byId(DATA.switches, fo.switch);
    out.fabric = /InfiniBand/.test(fo.fabric) ? "fabric-infiniband" : /Spectrum-X/.test(fo.fabric) ? "fabric-spectrum-x" : "fabric-open-ethernet";
    out.max_gpus_2tier = "ceiling-2tier";
    out.max_racks_2tier = "ceiling-2tier";
    out.max_systems_2tier = "ceiling-2tier";
    if (fo.planes > 1 && fo.plane_gbps < 800) out.planes = "multiplane";
    else if (fo.planes > 1 && byId(DATA.platforms, fo.platform).family === "Vera Rubin") out.planes = "rubin-two-planes";
    if (fo.planes === 1 && fo.plane_gbps === 800 && sw.radix[800] <= 64) out.warning = "single-plane-trap";
    out.non_blocking = "non-blocking";
    out.beyond_2tier = "beyond-2tier";
  } else if (entity === "reference_config") {
    const r = row;
    const fo = byId(DATA.fabric_options, r.fabric_option_id);
    if (!fo.switch) out.scale_point = "cerebras-fabric";
    else if (r.scale_point === "su") out.scale_point = "scalable-unit";
    else if (r.scale_point === "max_2tier") out.scale_point = "ceiling-2tier";
    else if (/_A$/.test(r.scale_point)) out.scale_point = "beyond-2tier";
    else if (/_B$/.test(r.scale_point)) out.scale_point = "three-tier-cost";
    if (fo.switch) { out.topology = "non-blocking"; out.transceiver_ends_800g_eq = "optics-count"; }
    out.rack_kw_typ = "rack-power-density";
    out.it_kw = "power-90-10";
    out.facility_kw = "pue";
    out.storage_read_GBps = "storage-bandwidth";
    out.storage_usable_PB = "storage-two-tiers";
    out.frontend_vcpu = "vcpu-per-gpu";
  } else if (entity === "storage_option") {
    out.product = "storage-vendors";
    out.role = "storage-two-tiers";
    out.read_gbps_per_unit = "storage-bandwidth";
    out.protocols = "gpudirect-storage";
  } else if (entity === "frontend_option") {
    out.name = "frontend-cpu";
    out.vcpu_per_node = "vcpu-per-gpu";
  }
  return out;
}

// ------------------------------------------------------------------ render
function fill(template, ctx) {
  return template.replace(/\{(\w+)\}/g, (m, key) => {
    if (!(key in ctx) || ctx[key] === undefined || ctx[key] === null) throw new Error(`Missing placeholder {${key}}`);
    return String(ctx[key]);
  });
}

function renderExplainer(id, entity, row, DATA) {
  const e = byId(DATA.explainers, id);
  const ctx = contextFor(entity, row, DATA);
  return { id, title: fill(e.title, ctx), summary: fill(e.summary, ctx), body: fill(e.body, ctx), links: e.links };
}

// ------------------------------------------------------------------ live configurations
/** Turn a planCluster() result into a reference_config-shaped row, so its "why?" boxes can be rendered live. */
function rowFromPlan(input, plan, DATA) {
  const p = byId(DATA.platforms, input.platform);
  const t = plan.network;
  const tiers = t.chosen?.tiers ?? null;
  return {
    id: "live",
    platform_id: p.id,
    fabric_option_id: input.fabric,
    scale_point: t.beyond_2tier ? "beyond_2tier_B" : "live",
    gpus: plan.gpus,
    compute_racks: plan.compute_racks,
    rack_kw_typ: plan.rack_kw_typ,
    tiers,
    pue: plan.power.pue,
    compute_kw_typ: plan.power.compute_kw_typ,
    it_kw: plan.power.it_kw,
    facility_kw: plan.power.facility_kw,
  };
}

export { byId, defaultRackOption, radix, fabricLimits, fabricBill, topologyFor, planCluster, explainLinks, renderExplainer, rowFromPlan };
