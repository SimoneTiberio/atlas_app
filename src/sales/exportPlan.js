import { catalog } from './catalog.js';
import { catalogReview, calculationUnits } from '../catalogReview.js';

export function serializePlan(inputs, result, generatedAt = new Date().toISOString(), scenario = null) {
  return JSON.stringify({
    generatedAt, catalogVersion: catalog.version, source: catalog.source,
    qualification: catalog.qualification, assumptions: catalog.assumptions,
    catalogReview, units: calculationUnits,
    engine: 'sales', mapping: catalog.mapping, scenario, inputs, ...result,
  }, null, 2);
}

export function downloadPlan(inputs, result, scenario = null) {
  const blob = new Blob([serializePlan(inputs, result, undefined, scenario)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'atlas-sizing-summary.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
