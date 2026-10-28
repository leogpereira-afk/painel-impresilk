import { geometrySignature, validatePrintProject, LIMITS } from './model.mjs';
import { GeometryError } from './errors.mjs';
export function createPrintClient({ timeoutMs = LIMITS.timeoutMs, workerFactory = () => new Worker(new URL('./calculation.worker.mjs', import.meta.url), { type: 'module' }) } = {}) {
  let pending = null, disposed = false, sequence = 0;
  const close = (job, error, result) => {
    if (job !== pending) return;
    clearTimeout(job.timer); job.worker.terminate(); pending = null;
    if (error) job.reject(error); else job.resolve(result);
  };
  const cancel = () => { if (pending) close(pending, new GeometryError('CANCELLED', 'Geração cancelada.')); };
  return {
    generate(input) {
      if (disposed) return Promise.reject(new GeometryError('DISPOSED', 'Gerador encerrado.'));
      cancel();
      let project, signature;
      try { project = validatePrintProject(input); signature = geometrySignature(project); } catch (error) { return Promise.reject(error); }
      return new Promise((resolve, reject) => {
        let worker;
        try { worker = workerFactory(); } catch { reject(new GeometryError('WORKER_UNAVAILABLE', 'O navegador não conseguiu iniciar o gerador em segundo plano.')); return; }
        const job = { worker, resolve, reject, requestId: ++sequence, signature, timer: null }; pending = job;
        job.timer = setTimeout(() => close(job, new GeometryError('GENERATION_TIMEOUT', 'A geração excedeu 20 segundos. Simplifique o desenho ou reduza a quantidade de letras.')), timeoutMs);
        worker.onmessage = ({ data }) => {
          if (job !== pending || data?.requestId !== job.requestId || data?.signature !== signature) return;
          if (data.error) close(job, new GeometryError(data.error.code || 'GENERATION_FAILED', data.error.message, data.error.detail));
          else if (data.result?.signature !== signature) close(job, new GeometryError('STALE_RESULT', 'Resultado de outra configuração descartado.'));
          else close(job, null, data.result);
        };
        worker.onerror = () => close(job, new GeometryError('WORKER_FAILED', 'O gerador foi interrompido. Tente novamente.'));
        worker.onmessageerror = () => close(job, new GeometryError('WORKER_FAILED', 'Resposta inválida do gerador.'));
        try { worker.postMessage({ requestId: job.requestId, signature, project }); } catch { close(job, new GeometryError('WORKER_FAILED', 'Não foi possível enviar o projeto ao gerador.')); }
      });
    },
    cancel,
    dispose() { cancel(); disposed = true; },
  };
}
