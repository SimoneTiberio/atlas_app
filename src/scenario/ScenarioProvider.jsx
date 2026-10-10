'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { SESSION_KEY, catalogVersion, newScenario, recoverScenario, handoffScenario } from './model.js';

const ScenarioContext = createContext(null);
export const useScenario = () => useContext(ScenarioContext);

export function useScenarioField(workflow, field, initial) {
  const context = useScenario(), [local, setLocal] = useState(initial);
  return context ? [context.scenario[workflow][field], value => context.setScenario(old => ({ ...old,
    [workflow]: { ...old[workflow], [field]: typeof value === 'function' ? value(old[workflow][field]) : value } }))] : [local, setLocal];
}

export default function ScenarioProvider({ children }) {
  const [scenario, setScenario] = useState(newScenario), [ready, setReady] = useState(false);
  const [errors, setErrors] = useState([]), [warnings, setWarnings] = useState([]), [saveError, setSaveError] = useState('');
  useEffect(() => {
    try {
      const recovery = recoverScenario(window.sessionStorage.getItem(SESSION_KEY));
      if (recovery.scenario) setScenario({ ...recovery.scenario, catalogVersion });
      setErrors(recovery.errors); setWarnings(recovery.warnings);
    } catch { setSaveError('Session storage is unavailable. Inputs will survive navigation, but cannot be recovered after refresh.'); }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || errors.length) return;
    try { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(scenario)); setSaveError(''); }
    catch { setSaveError('The scenario could not be saved in this browser. Refresh recovery is unavailable.'); }
  }, [scenario, ready, errors]);
  const reset = () => { setScenario(newScenario()); setErrors([]); setWarnings([]); };
  const openTechnical = (input, platformId, options) => {
    const mapped = handoffScenario(scenario, input, platformId, options, window.crypto?.randomUUID?.() || `scenario-${Date.now()}`);
    if (!mapped.errors.length) {
      setScenario(mapped.scenario);
      // Commit before navigation, including a modified link click opening a new tab.
      try { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(mapped.scenario)); setSaveError(''); }
      catch { setSaveError('The scenario could not be saved in this browser. Refresh recovery is unavailable.'); }
    }
    return mapped.errors;
  };
  return <ScenarioContext.Provider value={{ scenario, setScenario, openTechnical, ready, errors, warnings, saveError, reset }}>
    {children}
  </ScenarioContext.Provider>;
}

export function ScenarioRecovery({ children }) {
  const context = useScenario();
  if (context?.errors.length) return <section className="scenario-panel" role="alert"><h1>Saved scenario needs attention</h1><p>No saved input has been silently substituted. The saved session remains intact until you start a new scenario.</p><ul>{context.errors.map((e, i) => <li key={i}>{e}</li>)}</ul><button type="button" onClick={context.reset}>Start a new scenario</button></section>;
  return children;
}
