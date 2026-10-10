# Technical explorer migration

Completed on 2026-10-10. Before migration, the Sales implementation and documentation were inspected and all 23 existing tests passed. No unfinished Sales requirements were found. Sales calculations, wizard, constraints and JSON export remain unchanged; its tests still pass afterward.

## Implementation and provenance

`src/technical/engine.js` contains the pure calculation and explanation script extracted verbatim from `reference/atlas-explorer.html`, with a provenance comment and module exports added. It includes `planCluster`, fabric limits/bills/topology selection, explanation links/context/template filling and live reference rows. It does not import the separate dataset sizing module. The generated-source comments within the archived script were retained as provenance, not used as an instruction to obtain other code.

`src/technical/catalog.js` imports only `data/atlas.json`. No duplicate dataset is maintained in authored React code. The archived HTML and its embedded data are used read-only as test oracles, not imported by the application. The explorer's SHA-256 still matches `data/provenance.json`.

The React implementation is split into the explorer, controls, headline/fabric cards/gauges, dialog/Markdown renderer and pure state/ranking helpers. It fits inside the existing shared layout and has scoped styles. Each route owns local state; there is no shared scenario handoff, persistence or new export feature for Technical.

## Preserved behavior

- Original initial selection: All vendors, Training, GB300 NVL72, 10,368 GPUs, default density/typical profile, VAST storage, EPYC Turin front end, top three network options.
- Vendor/workload controls and the same platform eligibility flags. Ineligible platforms remain disabled. Arrow Up/Down cycles enabled platform radios, wraps and moves focus.
- GPU and Cerebras wafer unit labels, whole-system rounding, scalable-unit/cluster presets and size hints. Crossing GPU/wafer vendors resets size to the selected platform's scalable unit. Selecting a platform resets density/profile.
- All rack-density choices and power profiles. Storage retains all performance-tier options without new workload filtering; all five front-end CPU choices remain available.
- Eight headline facts: compute racks, rack power/cooling/peak, IT power, facility power/PUE, storage read, data blocks/capacity racks, CPU nodes/vCPU and per-accelerator memory.
- Original fabric ranking: fitting topology first, recommended flag next, chosen switch power next, then two-tier ceiling. Top-three/show-all controls, recommendation/validation tags, per-plane details, ceiling gauges and growth headroom are preserved.
- One/two-tier switch/optics counts and beyond-ceiling independent two-tier pods versus a single three-tier fabric. Vendor-defined Cerebras networking and published-maximum warnings remain distinct.
- Contextual “why?” explanations, filled titles/summary/Markdown, engineering links and live-plan power/PUE examples. The modal supports close, Escape and backdrop click, and restores focus to the trigger.
- Shipping/ramping/announced labels, estimate labels and the source's presales disclaimer. Technical can provisionally size announced platforms where eligible, as the original explorer did; Sales separately leaves announced entries unsized.

## Independent engine assumptions

Technical retains Atlas's compute share of 0.90 and uses `compute / 0.90` for IT power, with the Cerebras provisioned-load minimum where specified. Its PUE follows the **selected rack option**: liquid/water uses 1.20; other cooling descriptions use 1.40. Power profiles replace typical and peak compute draw in the same way as the HTML.

Storage performance/capacity building blocks, hot/lake PB rounded to three decimal places, capacity-tier power, front-end vCPU/node rules and the 90/10 ancillary allowance warning are unchanged. That warning does not silently increase facility power. Beyond-two-tier ancillary checks use the same three-tier alternative as the archived script. Platform/fabric explanation contexts continue to describe default rack options where the source did, while live power/PUE explanations use the current result; this inherited distinction has not been rewritten.

Sales remains separate: 40U packing policy, 15% ancillary overhead, fixed PUE 1.20, full-unit peak/provisioning reference power and OEM overrides. Equal GPU inputs need not produce equal results across workflows.

## Representative output comparisons

Full result objects were compared to execution of the original embedded scripts, including network/storage/front-end details. All compared outputs matched.

| Configuration | Matching outputs from original and React engine |
| --- | --- |
| B300, 32 GPUs, air-2 density | 2 compute racks; 29 kW/rack; 58 kW compute; 64.4 kW IT; PUE 1.40; 90.2 kW facility. |
| Same fleet, air-4 density | 1 compute rack; 58 kW/rack; same IT and 90.2 kW facility; air + RDHx still uses PUE 1.40. |
| Same fleet, dlc-8 density | 1 compute rack; 116 kW/rack reference density; PUE 1.20; 77.3 kW facility. The full-density rack figure is preserved even when this fleet partially fills it. |
| Vera Rubin NVL72, 72 GPUs, typical | 190 kW compute typical; 230 kW compute peak. |
| Same fleet, Max-P | 230 kW/rack, compute typical and compute peak. Max-Q/default comparisons also match. |
| B300 single 800G plane, 2,048 GPUs | Fits the two-tier ceiling. |
| Same fabric, 2,056 GPUs | Beyond ceiling: 2 independent pods, 100 switches / 8,224 optics ends; single three-tier alternative, 163 switches / 12,336 optics ends. |
| B200, 9 requested GPUs, inference | Rounds to 16 GPUs; hot 0.016 PB; lake 0.032 PB; VAST 1 building block; Turin 7 CPU nodes including control plane. |
| Cerebras CS-3, 32 wafers | Vendor-defined network; provisioned IT load 947.2 kW. |

## Differences from the archived UI

No calculation or eligibility differences were found in the tested cases. Presentation now uses the shared Atlas sidebar/header, its typography/colors, and responsive layouts adjusted for that shell. On tablet widths the platform grid uses two columns; on phone widths it uses one, headline/network facts use two columns, and topology alternatives stack. Long explanation tables scroll horizontally.

The headline additionally shows published/partner confidence labels and a confidence explainer; estimate labels remain unchanged. The explanation Markdown is rendered as escaped React nodes rather than generated HTML, with the same paragraph/list/table/link/emphasis subset. Numeric edits commit on blur or Enter and retain the original minimum-one/integer normalization; presets update immediately. These are presentation/event implementation changes, not formula changes.

Reference quirks were preserved instead of silently changing results, including default-density explanation context, rack-capacity figures for partially filled racks, and displaying both fabric-growth alternatives without introducing a new choice state.

## Verification and limits

- **39 tests passed**, including all original 23 Sales regressions/DOM checks.
- **762** combinations spanning every fabric, compatible workload, rack density, profile and representative cluster size matched the archived engine; all 35 performance-storage/CPU combinations also matched.
- Explanation links and filled text matched for platform, fabric, reference, storage and front-end entities, plus live power/PUE explainers.
- DOM checks cover filtering, keyboard selection, presets, density/profile resets, GPU/wafer transitions, Digital Twin empty state, CPU/storage changes, show-all, topology alternatives and modal behavior. Headline facts and alternative labels were also compared to the original explorer executing in jsdom.
- Shared Next link/context tests switch routes and confirm independent scenario defaults; CSSOM rules were checked at 1440, 1024 and 390px, including stacked layouts, input scrolling and table overflow.
- Production build passed. Both routes returned HTTP 200 on localhost:3002 with correct titles/navigation and all CSS/JS assets loading; `/` returned a 307 redirect to `/sales`.
- No browser was available in this session. DOM/CSS rule checks do not verify real-browser geometry, screenshots or native modal focus trapping; visual review remains unverified.

Run locally with Node.js 22: `npm ci`, then `npm run dev`. Open `/sales` or `/technical` on http://localhost:3000. Run `npm test` and `npm run build` for verification; `npm start` serves the production build. Use `-- --port 3002` if the default port is occupied. Neither original source folder was modified, and nothing was deployed.
