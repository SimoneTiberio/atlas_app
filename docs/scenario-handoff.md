# Scenario handoff

Stage 4 adds a single active scenario stored in browser `sessionStorage`, under `atlas.scenario` with `schemaVersion: 1`. It lives for this browser tab/session and origin (including port). It is not shared across browsers or machines. There is no backend, database or deployment.

Both migrations were checked first: the existing 39 tests passed, including Sales validation/constraints/export and 762 Technical comparisons against the archived explorer. The calculation engines have not been changed for this stage. `data/atlas.json` remains the sole application reference catalog.

## Transfer contract

Click **Open in Technical** on a Sales power-sized configuration. Sales may still have “All platforms” selected: the clicked configuration's stable Atlas ID is transferred while the original wizard selection remains intact.

| Sales input | Technical behavior |
| --- | --- |
| Selected configuration | Exact Atlas platform ID, never an array index or name match. |
| Workload | Atlas workload ID; `tuning` maps to `fine_tuning` and `digitalTwin` to `digital_twin`. Platform eligibility is checked. |
| Minimum GPU count | Requested accelerator target, not Sales' rounded fleet result. Technical independently rounds whole systems. |
| Explicit fabric | Optional per-configuration Atlas fabric ID. Platform/protocol/connection-speed compatibility is checked before navigating. Its freshly calculated card is highlighted; alternatives and ranking are retained. |
| Explicit storage | Optional Atlas performance storage ID from the workload shortlist. Technical calculates its building blocks and capacity tier. Capacity-only storage cannot be transferred as a performance selection. |
| Cooling, MW/rack-power/rack-count limits | Visible Sales context only. Technical does not enforce these facility constraints. |
| OEM full-unit power / server height | Visible Sales context only. Technical continues using its reference density/power profile; OEM values do not overwrite it. |
| Vendor, protocol and minimum speed requirements | Retained as context. Technical compares fabric alternatives; these requirements do not automatically filter its calculation engine. |

The optional fabric/storage controls are new handoff selections. They do not change Sales' existing sizing or storage guidance. No fabric is inferred from a protocol requirement, and no storage product is inferred from a vendor shortlist. A prior fabric selection made incompatible by editing Sales network requirements remains visibly labelled and blocks handoff until explicitly changed or cleared. A performance storage selection outside a newly selected workload's shortlist remains labelled as a previous choice; Technical permits all Atlas performance products, as the original explorer did.

Without explicit fabric selection Technical compares all alternatives. Without explicit storage it starts with the original VAST default, explained in the context panel. Each explicit handoff starts Technical density, power profile and CPU at its own defaults, also explained. Normal sidebar navigation retains the last state of each workflow without starting a new handoff. Technical edits do not overwrite Sales inputs. Changing Technical platforms clears a fabric tied to the previous platform and explains that action.

**Return to Sales** restores its inputs, step, completed-results state and optional choices. Results are calculated again from the saved inputs. Sales Reset preserves its original wizard reset behavior and additionally clears Sales handoff choices and the linked scenario context; the independent Technical controls remain saved.

## Persistence and incompatible inputs

The session stores Sales inputs/progress/selections, Technical inputs (including an uncommitted size draft), and the last explicit Sales context snapshot. Calculated results are neither stored nor transferred. A handoff is written before navigation; subsequent edits persist after React updates. Numeric Technical sizing still commits on blur or Enter, so recovering a draft does not silently change the calculated target.

Recovery checks schema version, stable IDs, owning-platform density/profile/fabric compatibility and supported storage/CPU options. In-progress Sales numeric validation errors are valid saved drafts. Unsupported versions, malformed sessions and stale/unmappable identifiers produce a recovery explanation; the original session is left intact and workflow calculations are blocked. **Start a new scenario** explicitly replaces it. No stale input is silently swapped for the first catalog entry. A changed catalog date with still-valid IDs produces a warning and recalculates using the current catalog. If browser storage is denied or full, navigation continues in memory and the header area explicitly reports that refresh recovery is unavailable.

The shared header identifies the linked Sales configuration/target, or the current tab session before a handoff. The Technical context panel identifies the original handoff snapshot even when Technical inputs have since been edited.

## Engines and exports

Sales retains 40U usable rack space, 15% ancillary allowance, PUE 1.20 and peak/provisioning/OEM power. Technical retains typical/selected-profile power, 90% compute share, cooling-based PUE (1.40 air / 1.20 liquid), its vendor-provisioned Cerebras rule, and original fabric/storage/CPU formulas. A Sales estimate and a Technical estimate can differ even for the same target; neither engine's result is presented as the other's.

Sales JSON export now adds its engine name and scenario metadata, preserving the existing results/provenance/assumptions. **Export Technical plan** independently exports current Technical inputs, every calculated fabric alternative, catalog version, Technical assumptions/rules and Sales context. Exports identify `data/atlas.json` and its date (`2026-10-07` at this stage). Scenario metadata never contains cached results from the other engine.

## Verification

All **54 tests** pass. Scenario tests cover stable mapping under reordered catalog arrays, workload translation, requested versus rounded targets, unmappable/ineligible inputs, wrong-platform/stale fabric, unsupported storage, version/corruption recovery, catalog revision warnings, independent assumptions and both exports. DOM integration tests cover selected/All-platform handoff, Return to Sales, refresh recovery in both routes, incomplete Sales drafts, uncommitted Technical size drafts, reset, explanatory fabric clearing, denied storage and actual Technical JSON download. Existing Sales tests and original Technical parity tests remain in the suite. Responsive CSS checks include the scenario header and stacked context panel.

Run with Node.js 22: `npm ci`, `npm run dev`; open http://localhost:3000/sales or /technical. Use `npm test` and `npm run build`; `npm start` serves the production build. The README records final verification results and limits.
