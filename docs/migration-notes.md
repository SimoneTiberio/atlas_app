# Sales migration notes

Initial inspection on 2026-10-10 established the stage 1 shell and placeholders. The following inspection notes record that baseline; the completed stage 2 implementation and measured differences are documented below.

## Sources

- Sales: `C:\Users\simone.tiberio\OneDrive - G42\Development Files\Sales_App`. Inspected its package manifest, README, `src/InfrastructureAdvisor.jsx`, `src/engine.js`, `src/catalog.js`, catalog and file inventory including regression tests. Its three-step wizard validates prerequisites, invalidates results on input changes, resets OEM specifications on vendor/platform changes and exports inputs, assumptions, provenance and result categories as JSON.
- Technical: `reference/atlas-explorer.html`. Inspected embedded calculation/explanation functions and UI event/rendering code. Preserve workload/vendor filters, GPU targets and presets, platform selection and keyboard navigation, rack density, power profiles, storage/front-end choices, fabric comparison, topology alternatives, show-more controls and contextual explainers.
- Catalog: `data/atlas.json` and `data/provenance.json`. Atlas contains 11 platforms, 30 fabric options, 7 switches, 8 storage products, 5 front-end options, 119 reference configurations and 32 explainers. Its reference date is 2026-10-07.

Both original sources remain unchanged. Future workflows must use Atlas as the sole reference catalog; do not import the Sales workbook catalog as a second working catalog or consume the archived HTML's data in production.

## Separate engine assumptions

| Concern | Sales MVP | Technical embedded HTML |
| --- | --- | --- |
| Fleet rounding | Whole servers/racks; validates safe numeric ranges. | Whole systems, then chosen rack density. |
| Ancillary IT | Compute power multiplied by 1.15. | Compute power divided by 0.90, with vendor cluster provisioning minimum where supplied. |
| PUE | Fixed 1.20 assumption. | 1.20 for liquid/water rack cooling, 1.40 otherwise, based on the selected rack option. |
| Rack packing | 40U assumption; OEM server height and rack power determine packing. Missing specifications stay unconfirmed. | Catalog rack options determine systems per rack. |
| Constraints | Enforces cooling, full-unit/rack power, facility MW and rack limits where calculable; incomplete candidates cannot become confirmed matches. | Computes typical/peak power, rack density and ancillary checks. |
| Networking | Filters protocol/minimum speed recommendations; does not invent a cluster ceiling. | Per-plane Clos limits, switches and optics, independent two-tier pods versus one three-tier fabric, and vendor-defined networks. |
| Storage | Workload vendor recommendations. | Performance/capacity building blocks and capacity-tier power; hot/lake PB round to three decimal places. |

Retain Sales assumptions as engine policy rather than replacing them with Atlas's Technical assumptions. Preserve OEM overrides, validation, pending/incomplete/rejected categories, missing-data handling, reset behavior and JSON export. Port Technical logic from the HTML scripts; do not substitute the separate dataset sizing module.

## Anticipated adapter differences

These are migration decisions and expected effects, not implemented behavior. Record actual comparisons when the adapter exists.

- Map `fine_tuning` to Sales `tuning`, `digital_twin` to `digitalTwin`, and platform workload flags to Sales arrays.
- Map shared platform IDs explicitly: `nv-hgx-b200` to `hgx-b200`, `nv-hgx-b300` to `hgx-b300`, `nv-gb300-nvl72` to `gb300-nvl72`, `amd-mi355x` to `mi355x` and `amd-mi455x-helios` to `mi455x`. Review equivalence beyond names.
- Sales's GB200, MI325X and MI500X entries are absent from Atlas. Atlas adds Rubin, MI350X, MI440X and Cerebras entries. The Sales validator currently accepts only NVIDIA/AMD and assumes GPU units; Cerebras needs an explicit product decision. Do not mislabel wafers as GPUs or fabricate missing platforms.
- Atlas marks B200 as HPC-capable where Sales does not, and marks GB300/MI455X as mixed-workload capable. These will change shortlists.
- Atlas distinguishes typical, peak and facility provisioning power. Sales uses a full-unit reference rating or OEM override. Explicitly resolve the Sales power basis and preserve its provenance in exports; typical power must not silently stand for peak provisioning.

| Shared platform | Sales reference kW/unit | Atlas typical / peak kW/unit |
| --- | ---: | ---: |
| B200 server | 8 | 14.3 / 14.3 |
| B300 server | 11.2 | 14.5 / 14.5 |
| GB300 rack | 142 | 135 / 155 |
| MI355X server | 11.2 | 15 / 17 |
| MI455X rack | 120 | 225 / 245 |

For example, a hypothetical 8-GPU B200 Sales plan without an OEM override would rise from `8 × 1.15 × 1.20 = 11.04 kW` facility demand to `14.3 × 1.15 × 1.20 = 19.734 kW` using Atlas's unit rating. This can turn a facility-budget match into a rejection. Technical results differ further because of compute share and selected cooling. No such plan is calculated by the stage 1 placeholders.

- Cooling: preserve liquid-only exclusions and OEM confirmation. Mixed descriptions such as air plus rear-door heat exchangers require explicit mapping; a platform-wide regex is insufficient for facility compatibility.
- Networking: map fabric options and per-accelerator bandwidth into Sales recommendations explicitly. Multiple planes and 1.6T connectivity must not be truncated to the wizard's current 400/800G choices or conflated with Technical fabric limits.
- Storage: Atlas products/rules differ from Sales workload recommendation objects. Build traceable mappings and preserve unknowns without replacing Sales recommendations with Technical calculations.
- Provenance: replace workbook-specific labels/ranges with Atlas IDs, links, confidence and catalog date. Keep Sales assumptions separately identifiable in exports.

## Stage 1 proposed next step (completed in stage 2)

Implement a pure Atlas-to-Sales adapter and meaningful regression comparisons for shared platforms, including OEM overrides, missing specifications and facility limits. Document observed result differences. Mount the existing Sales wizard at `/sales` only after those mappings are reviewable; migrate Technical independently afterward.

## Stage 2: completed Sales migration

The Sales wizard is mounted at `/sales` inside the existing shared shell, with its own scoped styles. `/technical` and the archived HTML remain unchanged. The application imports only `data/atlas.json`; the old workbook catalog is neither copied nor imported as application data. Comparison runs read the original engine in place without modifying it.

The wizard retains its three steps, owning-step validation, forward prerequisite checks, back navigation, full reset, vendor/platform OEM-field resets, result invalidation on edits, vendor/platform filtering, OEM power/height overrides, cooling and facility/rack constraints, incomplete/rejected/pending results and browser JSON download. There is no workflow persistence between routes, matching the source's local React state behavior. Atlas IDs are now the stable selection/export identities; old exported IDs are not an import format and no plan-import feature was added.

The Sales calculation formula remains `units × full-unit kW / 1000 × 1.15 × 1.20`, with 40U usable space and OEM packing inputs. The only calculation guard added handles unknown unit type/GPU count as incomplete rather than dividing by an unknown quantity. Adapter warnings accompany engineering reviews. No Technical engine code has been migrated or used by Sales.

### Field mapping and unknowns

| Atlas field | Sales mapping and limit |
| --- | --- |
| `platforms[].id` | Canonical stable platform ID; joins to `fabric_options[].platform` by ID. Reordering either list does not change identity or ratings. Duplicate/missing platform IDs fail explicitly. |
| `form`, `accel_per_system` | `node` becomes server, `rack` becomes rack; positive integer GPU count becomes GPUs per unit. Unrecognized form/count remains null and incomplete. |
| `workloads` | True flags become Sales workload arrays; `fine_tuning` → `tuning`, `digital_twin` → `digitalTwin`. |
| `hbm_gb_per_accel`, `host_cpu`, `scale_up.tech`, `notes` | Memory, configuration, scale-up description and considerations. Unknown numeric values stay null with Unconfirmed display labels. |
| `system_kw_peak`, `facility_provision_kw` | Full-unit reference rating is the greater positive value supplied. No fallback to typical power or accelerator TDP. Missing peak/provisioning power stays null and requires OEM power. |
| `system_kw_typ`, `accel_tdp_w` | Retained as informational metadata, never substituted for full-unit provisioning demand. |
| `power_profiles` | Not selectable in the preserved Sales wizard; its conservative peak/provisioning rating is used. A confirmed OEM override remains available. |
| `rack_options[].cooling` | All explicitly liquid/water options imply liquid-only; all plain-air options imply air. Mixed air/RDHx/liquid or absent options stay unconfirmed and require OEM review. |
| `system_ru`, `rack_options[].systems_per_rack` | Not used to bypass the existing OEM height/rack capacity controls. Reference chassis variants and Technical density options cannot establish Sales OEM packing. Server racks remain null without the original required inputs. |
| `fabric_options[].fabric`, `plane_gbps` | Only explicit InfiniBand or RoCE names establish a Sales protocol. Positive plane speed is speed per connection. Plane count and aggregate GPU bandwidth remain metadata; total bandwidth is never used as connection speed. |
| UEC-only fabric names | Protocol remains unconfirmed; UEC is not assumed to mean RoCE. Helios has no confirmed Sales protocol mapping. As in the source engine, unknown networks require review rather than an invented rejection or verified match. |
| Fabric topology limits and recommendation flags | Retained in Atlas for Technical; Sales does not calculate or enforce those ceilings. All mapped explicit protocol options can be filtered, without claiming vendor validation. |
| `storage[].best_for`, `vendor`, `product`, `strengths`, `confidence` | Workload-specific vendor/product reference shortlist, rationale and confidence. Products are not ranked. No storage building-block calculations enter the Sales engine. |
| Platform-to-storage compatibility | Atlas has no reliable explicit mapping; `platform.storage` stays null and displays Unconfirmed. Workload suitability is not fabricated into platform compatibility. |
| Digital Twin storage | No Atlas storage product lists `digital_twin`; vendors and rationale stay null. The original workbook's vendor text cannot be retained as catalog data. |
| `status`, `availability` | Shipping and ramping GPU platforms can be provisionally sized; ramping reviews flag availability. Announced/unknown lifecycle entries remain unsized roadmap entries, including MI440X. |
| `sources`, `confidence`, catalog `data_as_of` | Atlas source links, platform ID, confidence and date replace workbook cell provenance. JSON export retains these and adds mapping limitations/excluded platforms; filename and original result keys are preserved. |

### Coverage and eligibility changes

The source workbook had eight platform entries: seven default training matches plus MI500X pending. Atlas supplies nine NVIDIA/AMD entries: eight default training matches plus announced MI440X pending. This count is not a ranking or availability commitment.

| Identity change | Effect |
| --- | --- |
| B200, B300, GB300, MI355X, MI455X/Helios | Mapped to their Atlas identities; original labels/specifications are replaced by Atlas values. No array-position matching. |
| GB200, MI325X, MI500X | Absent from Atlas, so absent from the wizard. MI350X is not treated as MI325X. |
| Vera Rubin NVL72, HGX Rubin NVL8, MI350X | New GPU candidates, with Atlas eligibility and provisional reference ratings. |
| MI440X | New announced entry, displayed as roadmap and never sized. |
| Cerebras CS-3 / CS-4 | Kept in Atlas but excluded from this NVIDIA/AMD GPU wizard. Wafer count, vendor-defined network and product semantics cannot be mapped reliably without changing the workflow. Exclusion reasons are in export metadata. |

HPC now includes B200, MI350X and MI355X; the old workbook included MI325X and MI355X. GB300 and Helios now qualify for Mixed. B300, GB300, Rubin and MI4xx remain ineligible for HPC under Atlas's flags. Digital Twin still has no eligible GPU platform. Fine-tuning retains its Sales label through the workload-key mapping.

Networking also changes: MI355X now has Atlas 400G RoCE/InfiniBand options, so an 800G minimum excludes it where the source workbook supplied an 800G recommendation. Atlas supplies new explicit InfiniBand choices for MI350X. Rubin's 2 × 800G planes are 800G per connection, not a 1.6T connection; 4 × 200G options do not satisfy a 400/800G per-connection minimum. The wizard retains its original 400/800G minimum selectors.

### Measured power-result differences

Compared read-only with the original MVP engine on 2026-10-10. Inputs: training, 2,000 requested GPUs, selected platform/vendor, no OEM override, no facility/rack limits, default Sales assumptions. Servers round to 250 units; 72-GPU racks round to 28 units / 2,016 GPUs.

| Platform | Old kW/unit | Atlas Sales kW/unit | Old facility MW | New facility MW |
| --- | ---: | ---: | ---: | ---: |
| B200 | 8 | 14.3 | 2.76000 | 4.93350 |
| B300 | 11.2 | 14.5 | 3.86400 | 5.00250 |
| GB300 | 142 | 155 | 5.48688 | 5.98920 |
| MI355X | 11.2 | 17 | 3.86400 | 5.86500 |
| MI455X/Helios | 120 | 245 | 4.63680 | 9.46680 |

These changes can reject plans that previously fitted a facility/rack budget and can reduce server packing under the same rack-power limit. For example, the default B200 plan fitted 3 MW in the original catalog and fails it with Atlas. With a 40 kW rack limit and OEM 8U server height, B200 changes from five 8 kW servers/rack (50 racks) to two 14.3 kW servers/rack (125 racks). A 10 kW OEM override restores the preserved 3.45 MW / 63-rack calculation for the 2,000-GPU target.

GB300 uses Atlas 155 kW provisioning/peak rather than 135 kW typical. MI355X uses 17 kW peak rather than 15 kW typical, and Helios uses 245 kW peak rather than 225 kW typical. Sales ancillary overhead remains applied to the complete unit rating as before; engineers must validate what integrated rack equipment the vendor rating already covers. Technical will continue to use its own typical-power, compute-share and cooling-PUE logic when migrated; equal input GPU counts need not produce equal facility estimates.

### Verification

Meaningful source-engine/guidance tests were adapted to Atlas IDs and expectations, replacing old workbook transcription assertions with provenance/adapter checks. Tests cover fleet rounding, workload and protocol filtering, roadmap/ramping status, cooling, exact budget boundaries, OEM packing, unknown power/geometry, input validation, headroom and numeric overflow. Reordered catalog tests verify stable ID mapping. Recorded scalar MVP baselines verify the observed power-result changes without bundling the old catalog.

React Testing Library/jsdom tests exercise the actual wizard's prerequisite validation, forward/back navigation, vendor/platform filtering and OEM resets, full Reset, result invalidation, incomplete-result editing, cooling exclusions and JSON download handler. The exported Blob is parsed and checked for results, unknowns, assumptions and Atlas provenance. These are DOM interaction tests, not real-browser visual tests; a browser was unavailable in this session.

All 23 tests passed. Production build passed and emitted `/sales`, `/technical` and the `/` redirect. A production server on localhost:3001 returned HTTP 200 for both routes and a 307 root redirect; active navigation, stylesheet responses and the single shared shell passed. Port 3000 was already occupied. The original explorer hash still matches provenance. See README for local commands. No source-folder changes or deployment were performed.
