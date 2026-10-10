import React, { useEffect, useRef } from 'react';
import { catalogReview } from '../catalogReview.js';

// Same small Markdown subset as the reference, rendered as escaped React nodes.
export function Inline({ text }) {
  const parts = [], pattern = /\[([^\]]+)\]\((https?:[^)\s]+)\)|\*\*(.+?)\*\*|\*(?!\s)([^*]+?)\*/g;
  let match, offset = 0;
  while ((match = pattern.exec(text))) {
    parts.push(text.slice(offset, match.index));
    parts.push(match[1] ? <a key={match.index} href={match[2]} target="_blank" rel="noopener noreferrer">{match[1]}</a> : match[3] ? <strong key={match.index}>{match[3]}</strong> : <em key={match.index}>{match[4]}</em>);
    offset = pattern.lastIndex;
  }
  parts.push(text.slice(offset));
  return <>{parts}</>;
}

export function Markdown({ text }) {
  return text.trim().split(/\n\s*\n/).map((block, index) => {
    const lines = block.split('\n');
    if (lines.every(l => /^- /.test(l))) return <ul key={index}>{lines.map((l, i) => <li key={i}><Inline text={l.slice(2)} /></li>)}</ul>;
    if (lines.every(l => /^\d+\. /.test(l))) return <ol key={index}>{lines.map((l, i) => <li key={i}><Inline text={l.replace(/^\d+\. /, '')} /></li>)}</ol>;
    if (lines.every(l => /^\|/.test(l))) {
      const [head, ...rows] = lines.filter(l => !/^\|\s*-/.test(l)).map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
      return <div className="explanation-table" key={index}><table><thead><tr>{head.map((c, i) => <th key={i}><Inline text={c} /></th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}><Inline text={c} /></td>)}</tr>)}</tbody></table></div>;
    }
    return <p key={index}><Inline text={lines.join(' ')} /></p>;
  });
}

export default function ExplainDialog({ explanation, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const trigger = document.activeElement, dialog = ref.current;
    dialog.showModal();
    return () => { dialog.close(); trigger?.focus(); };
  }, []);
  return <dialog className="technical-dialog" ref={ref} aria-labelledby="technical-why-title" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <button type="button" className="close" aria-label="Close explanation" onClick={onClose}>×</button>
    <div className="dlg">
      <h2 id="technical-why-title">{explanation.title}</h2>
      <p className="lead">{explanation.summary}</p>
      {explanation.id === 'status-and-confidence' && <div className="scenario-notice"><strong>Audit qualification</strong><p>{catalogReview.confidencePolicy} The description below is the archived catalog's classification, not an independent evidence assessment.</p></div>}
      <div className="explanation-body"><Markdown text={explanation.body} /></div>
      {explanation.links.length > 0 && <div className="eng"><h3>For engineers</h3><ul>{explanation.links.map(link => <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></li>)}</ul></div>}
    </div>
  </dialog>;
}
