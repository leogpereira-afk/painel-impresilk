export const AREAS_BEM = { maquinas: 'Máquinas', carros: 'Carros', estrutura: 'Estrutura' };

// A área organiza o bem original. Fichas existentes seguem nas suas próprias
// listas; vínculo oculto, conflitante ou ainda não conferido nunca vira cópia.
export function bensDaArea(bens, area, vinculos, busca = '', setores = []) {
  if (!Object.hasOwn(AREAS_BEM, area) || !vinculos) return [];
  const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const termo = normalizar(busca).trim();
  return bens.filter(b => b.areaPatrimonio === area && b.situacao !== 'baixado' &&
    vinculos[b.id]?.estado === 'sem-ficha' &&
    normalizar([b.codigo, b.nomeGenerico, b.descricaoTecnica, b.setorSigla,
      setores.find(s => s.sigla === b.setorSigla)?.nome, b.responsavel].join(' ')).includes(termo));
}
