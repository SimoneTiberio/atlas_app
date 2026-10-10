'use client';

import React, { useState } from 'react';
import { catalog } from './catalog.js';
import { renderExplainer } from './engine.js';
import { initialState, updateState, rackOption, calculateRuns } from './explorerModel.js';
import ExplorerControls from './ExplorerControls.jsx';
import ExplorerResults from './ExplorerResults.jsx';
import ExplainDialog from './ExplainDialog.jsx';
import { useScenario, useScenarioField } from '../scenario/ScenarioProvider.jsx';
import { technicalIssues } from '../scenario/model.js';
import TechnicalContext from '../scenario/TechnicalContext.jsx';
import { downloadTechnicalPlan } from './exportPlan.js';
import DataReviewNotice from '../components/DataReviewNotice.jsx';

export default function TechnicalExplorer() {
  const scenario = useScenario();
  const [state, setState] = useScenarioField('technical', 'state', () => ({ ...initialState, selectedFabric: null }));
  const [explanation, setExplanation] = useState(null);
  const [notice, setNotice] = useState('');
  const change = (field, value) => {
    const next = updateState(state, field, value, catalog);
    if (next.platform !== state.platform && state.selectedFabric) {
      next.selectedFabric = null;
      setNotice('The explicit fabric belongs to the previous platform. Choose a fabric for the new platform; all alternatives are now compared.');
    }
    if (field === 'selectedFabric') { next.showAll = true; setNotice(''); }
    if (field === 'gpus' || next.platform !== state.platform) next.sizeDraft = null;
    setState(next);
  };
  const issues = technicalIssues(state);
  const p = catalog.platforms.find(p => p.id === state.platform), rack = p && rackOption(p, state), runs = issues.length ? [] : calculateRuns(state, catalog);
  const why = (id, entity, row, label = 'why?') => id ? <button type="button" className="why" aria-haspopup="dialog" onClick={() => setExplanation(renderExplainer(id, entity, row, catalog))}>{label}</button> : null;

  return <div className="technical-explorer">
    <section className="page-intro"><p className="eyebrow">TECHNICAL WORKSPACE</p><h1>AI factory sizing</h1><p className="intro-description">Reference data as of {catalog.assumptions.data_as_of} · presales ballpark, validate before quoting</p></section>
    <DataReviewNotice engine="technical" />
    <TechnicalContext />
    {notice && <p className="scenario-notice" role="status">{notice}</p>}
    {issues.length ? <div className="technical-grid">{p && <ExplorerControls data={catalog} state={state} platform={p} rack={rack} change={change} />}<div className="scenario-panel" role="alert"><h2>Inputs cannot be mapped</h2>{issues.map(issue => <p key={issue}>{issue}</p>)}</div></div> : <>
      <div className="technical-grid"><ExplorerControls data={catalog} state={state} platform={p} rack={rack} change={change} /><ExplorerResults data={catalog} state={state} platform={p} rack={rack} runs={runs} change={change} why={why} /></div>
      {runs.length > 0 && <button type="button" className="scenario-action" onClick={() => downloadTechnicalPlan(state, runs, scenario?.scenario)}>Export Technical plan</button>}
    </>}
    <p className="technical-foot">{catalog.assumptions.disclaimer} Every figure comes from the Atlas reference dataset; “why?” links explain each one.</p>
    {explanation && <ExplainDialog explanation={explanation} onClose={() => setExplanation(null)} />}
  </div>;
}
