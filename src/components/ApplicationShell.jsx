'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ScenarioProvider, { ScenarioRecovery, useScenario } from '../scenario/ScenarioProvider.jsx';
import { atlas } from '../scenario/model.js';

const sections = [
  { href: '/sales', label: 'Sales', detail: 'Guided discovery', icon: '01' },
  { href: '/technical', label: 'Technical', detail: 'Infrastructure explorer', icon: '02' },
];

export default function ApplicationShell({ children }) {
  return <ScenarioProvider><Shell>{children}</Shell></ScenarioProvider>;
}

function Shell({ children }) {
  const pathname = usePathname();
  const { scenario, warnings, saveError } = useScenario();
  const selected = scenario.handoff && atlas.platforms.find(p => p.id === scenario.handoff.platformId);
  const active = sections.find(({ href }) => pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <Link className="brand" href="/sales" aria-label="Atlas home"><span className="brand-mark" aria-hidden="true">A</span>atlas<span className="brand-dot">.</span></Link>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {sections.map(({ href, label, detail, icon }) => (
            <Link key={href} href={href} aria-label={label} className={`nav-link${active?.href === href ? ' active' : ''}`} aria-current={active?.href === href ? 'page' : undefined}>
              <span className="nav-icon" aria-hidden="true">{icon}</span>
              <span><strong>{label}</strong><small>{detail}</small></span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-note"><span className="status-dot" aria-hidden="true" />One shared workspace<p>From customer discovery<br />to infrastructure planning.</p></div>
      </aside>
      <div className="workspace">
        <header className="shared-header">
          <div className="breadcrumb">Workspace <span aria-hidden="true">/</span> <strong>{active?.label || 'Atlas'}</strong></div>
          <span className="stage-badge">{active?.href === '/sales' ? 'Sales discovery' : 'Technical explorer'}</span>
          <div className="active-scenario" aria-label="Active scenario">{selected ? <><strong>{selected.name}</strong><span>{scenario.handoff.acceleratorTarget.toLocaleString('en-US')} accelerators · Sales scenario</span></> : <><strong>Current session</strong><span>Workflow inputs saved in this tab</span></>}</div>
        </header>
        <main id="main-content" tabIndex={-1}>{[...warnings, ...(saveError ? [saveError] : [])].map(message => <p className="scenario-notice" role="status" key={message}>{message}</p>)}<ScenarioRecovery>{children}</ScenarioRecovery></main>
        <footer className="shared-footer">Atlas <span aria-hidden="true">·</span> AI infrastructure planning</footer>
      </div>
    </div>
  );
}
