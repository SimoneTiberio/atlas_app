# Atlas app

One Next.js / React front end with two sections:

- Sales (`/sales`): the migrated three-step discovery wizard, sizing results and JSON export.
- Technical (`/technical`): the migrated Atlas explorer with live sizing and contextual explainers.

Both workflows share the Atlas reference catalog and retain separate calculation engines with explicit planning assumptions.

## Files

| File | Purpose |
| --- | --- |
| `data/atlas.json` | Shared catalog extracted exactly from the explorer's embedded `DATA` object, including explanatory content. |
| `data/provenance.json` | Snapshot date, source hash, and extraction details. |
| `reference/atlas-explorer.html` | Original explorer retained as the behavioral reference for later migration. |
| `.gitignore` | Excludes dependencies, build outputs, and local environment files. |

## Data policy

Use `data/atlas.json` as the working catalog for this repository. The reference HTML is an archived snapshot: edits to the JSON will not update it. Do not independently maintain both copies.

The catalog contains reference specifications and presales assumptions, including estimates. Its confidence labels are inherited from the explorer; they do not constitute independent verification. Validate source claims before customer commitments. Keep source links and confidence information when extending the catalog.

Technical calculation/explanation logic is ported directly from the embedded scripts in `reference/atlas-explorer.html`, excluding its data and DOM UI. The separate dataset sizing module is not used. The HTML's cooling-based PUE selection and storage rounding are preserved. Sales uses a pure adapter into its existing engine's expected structure, retaining Sales validation and facility constraints. See [Sales migration notes](docs/migration-notes.md#stage-2-completed-sales-migration) and [Technical migration notes](docs/technical-migration.md) for decisions and verification.

## Current scope

Stage 5 audits catalog provenance, units, composite OEM configurations and cross-engine behavior. See [DATA_REVIEW.md](DATA_REVIEW.md) for primary-source findings, eight scenario comparisons and decisions needed before engineering commitments. Both interfaces and exports qualify estimates and inherited confidence labels; catalog values and calculation formulas remain unchanged.

Stage 4 provides both workflows in the shared sidebar/header layout with explicit scenario handoff and versioned browser session persistence. Sales retains its three-step validation, reset and input-invalidation behavior, vendor/platform filters, OEM overrides, constraints, result categories and JSON download. Technical retains vendor/workload selection, platform eligibility, keyboard selection, GPU/wafer sizing, presets, rack density, power profiles, storage/front-end CPU sizing, ranked fabric options, topology alternatives, confidence and “why?” dialogs. `/` redirects to `/sales`. No backend or deployment is configured. Both original sources remain unchanged.

Sales imports only `data/atlas.json` as reference data. Its separate engine still uses 40U usable rack space, 15% ancillary IT allowance and fixed PUE 1.20. Peak/provisioning Atlas power drives reference estimates; OEM full-unit power still overrides it. Missing values remain unknown. There are nine NVIDIA/AMD catalog entries (eight provisionally sizeable and one announced roadmap entry); Cerebras wafer systems cannot be mapped into the preserved GPU wizard. Results differ from the workbook MVP in coverage, power, workload eligibility, fabric recommendations and storage guidance; the migration notes explain each difference.

Technical separately uses Atlas's 90% compute share, rack-cooling PUE (1.40 air / 1.20 liquid), vendor-provisioned Cerebras load where specified, and its original network/storage/CPU rules. The engines remain independent: the session store contains inputs, progress and context, never calculated results.

Choose **Open in Technical** on a Sales configuration to transfer its Atlas platform, workload, requested accelerator target and optional explicit fabric/storage IDs. Technical displays Sales facility/OEM inputs as context and recalculates independently. **Return to Sales** restores wizard inputs and progress. Both workflows survive sidebar navigation and refresh within this browser session. The shared header identifies the active scenario. Both JSON exports include the catalog version and their own calculation assumptions. See [scenario handoff](docs/scenario-handoff.md) for mapping, defaults, incompatibility recovery and persistence behavior.

## Run locally

Use Node.js 22.x and npm from this repository root:

```powershell
npm ci
npm run dev
```

Open http://localhost:3000/sales and http://localhost:3000/technical. The server binds to `127.0.0.1` on port 3000. Stop it with Ctrl+C. Run `npm test` for calculation, adapter and DOM interaction checks. For a production-mode local check, run `npm run build`, then `npm start`.

If port 3000 is occupied, use `npm run dev -- --port 3001` or `npm start -- --port 3001` and open the corresponding localhost:3001 routes.

If Node is not on PATH, this machine has a portable runtime in the existing Sales project. This changes only the current PowerShell session's PATH:

```powershell
$atlasNode = 'C:\Users\simone.tiberio\OneDrive - G42\Development Files\Sales_App\.runtime\node-v22.23.3-win-x64'
$env:PATH = "$atlasNode;$env:PATH"
npm.cmd ci
npm.cmd run dev
```

If npm is configured for offline mode without cached packages, use `npm ci --offline=false` when registry access is available. No environment variables or credentials are needed by the app.

## Application structure

| Path | Purpose |
| --- | --- |
| `src/app/layout.jsx` | Document layout and shared shell. |
| `src/components/ApplicationShell.jsx` | Navigation, active route, shared header and footer. |
| `src/components/WorkflowPlaceholder.jsx` | Retained stage 1 placeholder component, no longer mounted. |
| `src/app/sales/page.js` | Sales route mounting the migrated wizard. |
| `src/app/technical/page.jsx`, `technical.css` | Technical route and scoped responsive explorer styling. |
| `src/app/globals.css` | Responsive shell and page styles, keyboard focus and skip link. |
| `src/app/sales/sales.css` | Sales styles scoped to the workflow. |
| `src/sales/InfrastructureAdvisor.jsx`, `FleetStep.jsx` | Existing three-step wizard adapted to the shell. |
| `src/sales/catalogAdapter.js`, `catalog.js` | Atlas-only structural adapter and independent Sales planning policy. |
| `src/sales/engine.js`, `fleetGuidance.js` | Preserved Sales calculations, constraints and qualification guidance. |
| `src/sales/exportPlan.js` | JSON serialization/download, including Atlas provenance and mapping limits. |
| `src/technical/engine.js` | Embedded HTML's pure calculation/explanation engine; no embedded catalog. |
| `src/technical/catalog.js`, `explorerModel.js` | Atlas JSON import and original explorer state/ranking behavior. |
| `src/technical/TechnicalExplorer.jsx`, `ExplorerControls.jsx`, `ExplorerResults.jsx` | React explorer composition, controls, headline, fabric cards and gauges. |
| `src/technical/ExplainDialog.jsx` | Native modal with React-rendered explanation Markdown. |
| `src/scenario/model.js`, `ScenarioProvider.jsx`, `TechnicalContext.jsx` | Versioned session contract, stable-ID mapping/recovery, shared state and Sales context. |
| `src/sales/ConfigurationHandoff.jsx` | Explicit per-configuration fabric/storage choices and handoff navigation. |
| `src/technical/exportPlan.js` | Independently calculated Technical JSON export with assumptions and scenario context. |
| `tests/` | Sales regressions, original-explorer parity, DOM navigation/export/explainers and responsive rule checks. |

## Stage 1 verification

Verified locally on 2026-10-10: production build passed; development server started; `/sales` and `/technical` returned HTTP 200; `/` returned a 307 redirect to `/sales`. Checked route titles, active navigation, placeholder labels, stylesheet references and skip link. The archived explorer SHA-256 still matches `data/provenance.json`. No browser was available for visual verification in this session.

Next.js generated `AGENTS.md` and `CLAUDE.md` during development startup; these contain its local framework guidance.

## Stage 2 verification

On 2026-10-10, all 23 tests and the production build passed. Regression checks cover representative power and fleet calculations, exact facility/rack budget boundaries, OEM overrides, cooling, workload/protocol filtering, unknown values, roadmap behavior and numeric overflow. React DOM tests cover three-step navigation, prerequisite errors, back/reset, OEM clearing, result invalidation, incomplete-result editing and the actual JSON download handler. Baselines were compared read-only against the original Sales engine; no old catalog is bundled in this app.

The production server was verified on port 3001 because port 3000 was occupied. Both routes returned HTTP 200, `/` returned a 307 redirect to `/sales`, active navigation and stylesheet responses passed, and Sales rendered one shared sidebar/main rather than nesting the original shell. The original explorer hash still matches its extraction provenance.

DOM tests use jsdom and do not replace a real-browser visual check. No browser was available in this session.

## Stage 3 verification

Verified on 2026-10-10: all 39 tests and the production build passed. Technical results matched the original HTML across 762 fabric/workload/density/profile/size configurations, plus every performance-storage/CPU combination. Explanation links/text matched across catalog entities and reference configurations. DOM interaction tests also compared headline metrics directly against the original explorer after control changes.

The original 23 Sales tests still pass. Shared navigation and independent defaults are exercised through React/Next link context tests; CSSOM checks verify layout rules at 1440, 1024 and 390px. A production server on localhost:3002 returned HTTP 200 for both routes, loaded all CSS/JS assets and returned a 307 root redirect. The archived explorer hash still matches provenance. No browser was available for visual geometry or screenshot verification.

## Stage 4 verification

On 2026-10-10, all **54 tests** passed, including all existing Sales and Technical behavior checks and the 762 original-explorer calculation comparisons. New checks cover selected/All-platform round trips, both routes' refresh recovery, unfinished wizard/size drafts, explicit fabric/storage IDs, incompatible/stale inputs, unsupported versions, catalog changes, denied session storage and actual Technical JSON download. Production build passed. A local production server on port 3003 returned HTTP 200 for both routes with the shared scenario header, loaded all 13 referenced CSS/JS assets, and returned a 307 root redirect to `/sales`. The archived explorer's SHA-256 still matches provenance. Nothing was deployed.

Responsive DOM/CSS checks cover navigation and stacked scenario context. No browser was available for screenshot or geometry verification. See [scenario handoff documentation](docs/scenario-handoff.md) for what transfers and what stays specific to each workflow.

## Stage 5 verification

On 2026-10-10, all **59 tests** and the production build passed. Audit regressions cover stable IDs, catalog field/unit trace, eight cross-engine comparisons, missing specifications, composite density and export qualification. Existing wizard, Technical parity, handoff, refresh and responsive DOM/CSS checks still pass. A local production server on port 3004 returned HTTP 200 for both routes with audit qualifications, catalog date and shared scenario header; all 13 CSS/JS assets loaded, and `/` redirected to `/sales` (307). Atlas, both engine files and the archived explorer retain their pre-audit hashes. No real browser was available for visual geometry verification. Nothing was deployed.
