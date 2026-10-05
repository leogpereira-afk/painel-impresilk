const texto = valor => String(valor ?? '').trim();
const normalizar = valor => texto(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Só IDs registrados estabelecem vínculo. O nome ou o padrão pat-<id> não
// provam que duas fichas descrevem o mesmo equipamento.
export function vinculoDoEquipamento(ativo, bens = []) {
  const origem = bens.filter(bem => bem.origemAtivoId === ativo.id);
  const direto = ativo.bemId ? bens.find(bem => bem.id === ativo.bemId) : null;
  if (origem.length > 1 || (direto?.origemAtivoId && direto.origemAtivoId !== ativo.id)
    || (origem.length === 1 && direto && origem[0].id !== direto.id)) {
    return { bem: null, vinculo: 'conflito' };
  }
  const bem = origem[0] || direto || null;
  return { bem, vinculo: bem ? 'vinculado' : 'sem-vinculo' };
}

export function projetarEquipamentos(ativos = [], bens = [], setores = []) {
  const ids = new Set();
  return ativos.filter(ativo => {
    if (!ativo?.id || !['veiculo', 'maquina'].includes(ativo.tipo) || ids.has(ativo.id)) return false;
    ids.add(ativo.id);
    return true;
  }).map(ativo => {
    const { bem, vinculo } = vinculoDoEquipamento(ativo, bens);
    const ficha = ativo.especificacao || {};
    const setorSigla = texto(bem?.setorSigla);
    const setor = setores.find(item => item.sigla === setorSigla);
    return {
      ...ativo, bem, vinculo,
      codigo: texto(bem?.codigo),
      setor: texto(setor?.nome) || setorSigla || texto(ficha.setor),
      setorSigla,
      modelo: ativo.tipo === 'veiculo' ? texto(ficha.marcaModelo) : [ficha.fabricante, ficha.modelo].map(texto).filter(Boolean).join(' · '),
      identificacao: texto(ativo.tipo === 'veiculo' ? ficha.placa : ficha.numeroSerie),
      ano: texto(ficha.ano),
      responsavel: texto(ativo.responsavel),
    };
  }).sort((a, b) => texto(a.nome).localeCompare(texto(b.nome), 'pt-BR', { numeric: true }) || a.id.localeCompare(b.id));
}

export function filtrarEquipamentos(itens, { tipo, busca = '', vinculo = 'todos' }) {
  const termos = normalizar(busca).split(/\s+/).filter(Boolean);
  return itens.filter(item => item.tipo === tipo
    && (vinculo === 'todos' || (vinculo === 'vinculado' ? item.vinculo === 'vinculado' : item.vinculo !== 'vinculado'))
    && termos.every(termo => normalizar([item.nome, item.identificacao, item.modelo, item.ano, item.setor,
      item.setorSigla, item.responsavel, item.codigo].join(' ')).includes(termo)));
}
