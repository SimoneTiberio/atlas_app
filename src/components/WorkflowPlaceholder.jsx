import Link from 'next/link';

export default function WorkflowPlaceholder({ section, title, description, steps, nextHref, nextLabel }) {
  return (
    <>
      <section className="page-intro" aria-labelledby="page-title">
        <p className="eyebrow">{section} WORKSPACE</p>
        <h1 id="page-title">{title}</h1>
        <p className="intro-description">{description}</p>
      </section>
      <section className="placeholder-panel" aria-labelledby="placeholder-title">
        <div className="panel-top"><span className="eyebrow">WORKFLOW PREVIEW</span><span className="placeholder-badge">Placeholder</span></div>
        <div className="placeholder-content">
          <div className="placeholder-symbol" aria-hidden="true">↗</div>
          <h2 id="placeholder-title">The {section.toLowerCase()} workflow is coming next.</h2>
          <p>This page establishes the shared workspace. The existing workflow has not been migrated; calculations and exports are not available here yet.</p>
        </div>
        <ol className="workflow-preview" aria-label="Planned workflow">
          {steps.map((step, index) => <li key={step.title}><span className="step-number">0{index + 1}</span><h3>{step.title}</h3><p>{step.description}</p></li>)}
        </ol>
        <div className="panel-bottom"><span>Stage 01 · Shell ready for migration</span><Link href={nextHref}>{nextLabel} <span aria-hidden="true">→</span></Link></div>
      </section>
      <div className="workspace-note"><span className="note-mark" aria-hidden="true">A</span><p>Two workflows. One Atlas reference catalog.<br /><span>Sales discovery and technical planning will each retain their own calculation engine and explicit assumptions.</span></p></div>
    </>
  );
}
