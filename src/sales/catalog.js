import atlas from '../../data/atlas.json' with { type: 'json' };
import { adaptAtlas } from './catalogAdapter.js';

export const catalog = adaptAtlas(atlas);
export const workloads = { training: 'Training', inference: 'Inference', tuning: 'Fine Tuning', hpc: 'HPC', digitalTwin: 'Digital Twin', mixed: 'Mixed Workload' };
