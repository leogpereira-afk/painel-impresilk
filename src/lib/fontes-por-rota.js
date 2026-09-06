// Apenas as telas que calculam números do ERP pedem suas fontes.
export const FONTES_POR_ROTA = Object.freeze({
  '/contas-atrasadas': ['recebiveis', 'ordens'],
  '/orcamentos': ['orcamentos'],
  '/marketing': ['orcamentos'],
});
const SEM_FONTES = Object.freeze([]);
export const fontesDaRota = rota => FONTES_POR_ROTA[rota] || SEM_FONTES;
