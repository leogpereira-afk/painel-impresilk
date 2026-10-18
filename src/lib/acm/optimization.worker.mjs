import { optimizeProject } from './optimization.mjs';
self.onmessage = ({ data: { project, id, compare = false } }) => {
  try { self.postMessage({ id, ...optimizeProject(project, { compare }) }); }
  catch (error) { self.postMessage({ id, error: error.message || 'Não foi possível calcular o plano.' }); }
};
