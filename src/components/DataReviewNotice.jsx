import React from 'react';
import { catalogReview } from '../catalogReview.js';
import { catalog } from '../technical/catalog.js';
import { salesAssumptions } from '../sales/catalogAdapter.js';

export default function DataReviewNotice({ engine }) {
  return <section className="scenario-notice" aria-label="Catalog and calculation qualification">
    <strong>Reference estimates · Atlas {catalog.assumptions.data_as_of} · evidence partially verified</strong>
    <p>{catalogReview.configurationPolicy} Availability and confidence labels are catalog claims; unresolved specifications remain unverified.</p>
    <p>{engine === 'sales' ? salesAssumptions.note : 'Technical planning: typical/selected-profile compute power, 90% compute share of IT power, PUE 1.40 air / 1.20 liquid. Storage, CPU and fabric quantities are estimates. An ancillary allowance warning does not increase the facility estimate; review the bottom-up load separately.'}</p>
  </section>;
}
