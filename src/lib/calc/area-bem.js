export const AREAS_BEM = { maquinas: 'Máquinas', carros: 'Carros', estrutura: 'Estrutura', outros: 'Ferramentas & Outros' };

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

// Uma linha para o mesmo bem: a ficha real tem precedência sobre a projeção.
export function equipamentosComBens(equipamentos, bens, setores, vinculos, tipo) {
  const ligados = new Set(equipamentos.map(e=>e.bem?.id).filter(Boolean));
  const simples = bensDaArea(bens,tipo==='veiculo'?'carros':'maquinas',vinculos,'',setores)
    .filter(b=>!ligados.has(b.id)).map(b=>({id:`bem:${b.id}`,tipo,nome:b.descricaoTecnica||b.nomeGenerico,
      bem:b, somenteBem:true, codigo:b.codigo, vinculo:'vinculado', modelo:'', identificacao:'',
      setor:setores.find(s=>s.sigla===b.setorSigla)?.nome||b.setorSigla, setorSigla:b.setorSigla,
      responsavel:b.responsavel,atualizadoEm:b.atualizadoEm}));
  return [...equipamentos,...simples].sort((a,b)=>String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR',{numeric:true}));
}
