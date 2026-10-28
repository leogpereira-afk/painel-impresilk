export class GeometryError extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'GeometryError';
    this.code = code;
    this.detail = detail;
  }
}
export function errorForMessage(error) {
  return { code: error?.code || 'GENERATION_FAILED', message: error?.message || 'Não foi possível gerar a geometria.', detail: error?.detail || {} };
}
