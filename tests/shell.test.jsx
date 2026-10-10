import './setup-dom.js';
import React, { useState } from 'react';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PathnameContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime.js';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime.js';
import ApplicationShell from '../src/components/ApplicationShell.jsx';
import TechnicalExplorer from '../src/technical/TechnicalExplorer.jsx';
import InfrastructureAdvisor from '../src/sales/InfrastructureAdvisor.jsx';

afterEach(() => { cleanup(); window.sessionStorage.clear(); });

test('shared navigation retains each workflow’s inputs without implicitly handing off', () => {
  function Workspace() {
    const [path, setPath] = useState('/sales');
    const router = { pathname: path, asPath: path, isReady: true, locale: undefined, beforePopState() {}, push: href => { setPath(href); return Promise.resolve(true); }, prefetch: () => Promise.resolve() };
    return <RouterContext.Provider value={router}><PathnameContext.Provider value={path}><ApplicationShell>{path === '/sales' ? <InfrastructureAdvisor /> : <TechnicalExplorer />}</ApplicationShell></PathnameContext.Provider></RouterContext.Provider>;
  }
  render(<Workspace />);
  const salesLink = screen.getByRole('link', { name: 'Sales' }), technicalLink = screen.getByRole('link', { name: 'Technical' });
  assert.equal(salesLink.getAttribute('aria-current'), 'page');
  fireEvent.change(screen.getByLabelText('Platform'), { target: { value: 'nv-hgx-b200' } });
  fireEvent.click(screen.getByRole('button', { name: /^Continue/ }));
  fireEvent.change(screen.getByLabelText(/Minimum GPU count/), { target: { value: '9' } });
  fireEvent.click(technicalLink);
  assert.equal(screen.getByRole('link', { name: 'Technical' }).getAttribute('aria-current'), 'page');
  assert.equal(screen.getByLabelText('Cluster size (GPUs)').value, '10368');
  assert.equal(document.querySelectorAll('main').length, 1); assert.equal(document.querySelectorAll('aside.sidebar').length, 1);
  fireEvent.click(screen.getByRole('button', { name: '~1,000' }));
  fireEvent.click(screen.getByRole('link', { name: 'Sales' }));
  assert.equal(screen.getByLabelText(/Minimum GPU count/).value, '9');
  fireEvent.click(screen.getByRole('button', { name: 'Back', exact: true }));
  assert.equal(screen.getByLabelText('Platform').value, 'nv-hgx-b200');
  fireEvent.click(screen.getByRole('link', { name: 'Technical' }));
  assert.equal(screen.getByLabelText('Cluster size (GPUs)').value, '1024');
});

test('responsive rules switch columns and scrolling for desktop, tablet and phone', () => {
  // CSSOM rule checks, not browser geometry assertions: jsdom does not lay out.
  const css = fs.readFileSync('src/app/globals.css', 'utf8') + fs.readFileSync('src/app/technical/technical.css', 'utf8');
  const dom = new JSDOM(`<style>${css}</style>`), sheet = dom.window.document.styleSheets[0];
  const value = (selector, property, width) => {
    let result;
    function visit(rules) {
      for (const rule of rules) {
        if (rule.type === 4) {
          const max = rule.conditionText.match(/max-width:\s*(\d+)px/);
          if (max && width <= Number(max[1])) visit(rule.cssRules);
        } else if (rule.type === 1 && rule.selectorText.split(',').map(s => s.trim()).includes(selector)) {
          const next = rule.style.getPropertyValue(property); if (next) result = next;
        }
      }
    }
    visit(sheet.cssRules); return result;
  };
  assert.equal(value('.technical-grid', 'grid-template-columns', 1440), '300px minmax(0, 1fr)');
  assert.equal(value('.technical-inputs', 'position', 1440), 'sticky');
  assert.equal(value('.technical-grid', 'grid-template-columns', 1024), 'minmax(0, 1fr)');
  assert.equal(value('.technical-inputs', 'position', 1024), 'static');
  assert.equal(value('.technical-inputs', 'max-height', 390), 'none');
  assert.equal(value('.technical-explorer .facts', 'grid-template-columns', 390), 'repeat(2, minmax(0, 1fr))');
  assert.equal(value('.technical-explorer .netgrid', 'grid-template-columns', 390), 'repeat(2, minmax(0, 1fr))');
  assert.equal(value('.technical-explorer .alts', 'grid-template-columns', 390), 'minmax(0, 1fr)');
  assert.equal(value('.technical-explorer .plist', 'grid-template-columns', 390), 'minmax(0, 1fr)');
  assert.equal(value('.app-shell', 'grid-template-columns', 390), 'minmax(0, 1fr)');
  assert.equal(value('.sidebar', 'position', 390), 'static');
  assert.equal(value('.technical-dialog .explanation-table', 'overflow-x', 390), 'auto');
  assert.equal(value('.scenario-context', 'grid-template-columns', 1440), 'repeat(3, minmax(0, 1fr))');
  assert.equal(value('.scenario-context', 'grid-template-columns', 390), 'minmax(0, 1fr)');
  dom.window.close();
});
