// Mesmas regras para cartões, filtros e relatórios do patrimônio.
export const FILTROS_INICIAIS = { busca: '', setor: '', tipo: '', situacao: 'ativos', pendencia: '', ordem: 'codigo' };
export const normalizarBusca = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const temTexto = valor => Boolean(String(valor || '').trim());

export function pendenciasBem(bem, setores, fotos) {
  return [
    !temTexto(bem.codigo) && ['etiqueta', 'Etiqueta'],
    !setores.some(s => s.sigla === bem.setorSigla) && ['setor', 'Setor'],
    !temTexto(bem.responsavel) && ['responsavel', 'Responsável pelo cadastro'],
    !temTexto(bem.nf) && !temTexto(bem.motivoSemNota) && ['documento', 'Nota ou justificativa'],
    !(Number(bem.valor) > 0) && ['valor', 'Valor de aquisição'],
    fotos !== null && !fotos[bem.id] && ['foto', 'Foto'],
  ].filter(Boolean).map(([id, nome]) => ({ id, nome }));
}

export function filtrarInventario(bens, setores, fotos, filtros) {
  const f = { ...FILTROS_INICIAIS, ...filtros };
  const termos = normalizarBusca(f.busca).trim().split(/\s+/).filter(Boolean);
  return bens.filter(b => {
    const setor = setores.find(s => s.sigla === b.setorSigla);
    const texto = normalizarBusca([b.codigo, b.nomeGenerico, b.descricaoTecnica, b.nf, b.observacao, b.responsavel, b.setorSigla, setor?.nome].join(' '));
    return (f.situacao === 'todos' || (f.situacao === 'ativos' ? b.situacao !== 'baixado' : (b.situacao || 'uso') === f.situacao))
      && (!f.setor || (f.setor === '__sem_setor' ? !setor : b.setorSigla === f.setor))
      && (!f.tipo || b.nomeGenerico === f.tipo)
      && termos.every(t => texto.includes(t))
      && (!f.pendencia || pendenciasBem(b, setores, fotos).some(p => f.pendencia === 'todas' || p.id === f.pendencia));
  }).sort((a, b) => {
    const codigo = () => String(a.codigo || '').localeCompare(String(b.codigo || ''), 'pt-BR', { numeric: true });
    if (f.ordem === 'valor') return b.valor - a.valor || codigo();
    if (f.ordem === 'nome') return String(a.nomeGenerico || '').localeCompare(String(b.nomeGenerico || ''), 'pt-BR') || codigo();
    if (f.ordem === 'recentes') return String(b.dataAquisicao || '').localeCompare(String(a.dataAquisicao || '')) || codigo();
    return codigo();
  });
}

// Ao mudar o recorte, os itens invisíveis nunca entram na impressão.
export function bensParaImpressao(visiveis, selecionados) {
  const marcados = visiveis.filter(b => selecionados.includes(b.id));
  return marcados.length ? marcados : visiveis;
}
