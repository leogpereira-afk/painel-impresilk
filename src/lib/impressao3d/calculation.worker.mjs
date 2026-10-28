import { generatePrintProject } from './engine.mjs';
import { geometrySignature } from './model.mjs';
import { errorForMessage } from './errors.mjs';
self.onmessage = async ({ data }) => {
  const { requestId, signature, project } = data || {};
  try {
    if (signature !== geometrySignature(project)) throw Object.assign(new Error('Assinatura da solicitação inválida.'), { code: 'INVALID_REQUEST' });
    const result = await generatePrintProject(project);
    self.postMessage({ requestId, signature, result });
  } catch (error) { self.postMessage({ requestId, signature, error: errorForMessage(error) }); }
};
