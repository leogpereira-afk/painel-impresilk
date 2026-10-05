// As operações recebem somente a intenção do cliente. Acervo e histórico vêm
// do registro lido no servidor; identidade e carimbos vêm da sessão autenticada.
export const ESTADOS_CAIXA = ['bom', 'desgaste', 'danificado', 'nao_verificado'];
const MAX_QUANTIDADE = 1_000_000;
const LIMITES = { acervo: 500, movimentacoes: 10_000, avaliacoes: 1_200 };
const falhar = mensagem => { throw Object.assign(new Error(mensagem), { status: 422 }); };
const objeto = valor => valor && typeof valor === 'object' && !Array.isArray(valor);
function texto(valor, nome, max, obrigatorio = false) {
  if (valor != null && typeof valor !== 'string') falhar(`O campo ${nome} deve ser um texto.`);
  const resultado = (valor ?? '').trim();
  if (obrigatorio && !resultado) falhar(`Informe ${nome}.`);
  if (resultado.length > max) falhar(`O campo ${nome} ultrapassa ${max} caracteres.`);
  return resultado;
}
function quantidade(valor, nome = 'quantidade', minimo = 0) {
  if (!Number.isSafeInteger(valor) || valor < minimo || valor > MAX_QUANTIDADE) {
    falhar(`Informe ${nome} inteira entre ${minimo} e ${MAX_QUANTIDADE}.`);
  }
  return valor;
}
function estado(valor) {
  if (!ESTADOS_CAIXA.includes(valor)) falhar('Informe um estado válido para o item.');
  return valor;
}
function dia(valor, nome, hoje, permitirFuturo = false) {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) falhar(`Informe ${nome} válida no formato AAAA-MM-DD.`);
  const data = new Date(`${valor}T12:00:00.000Z`);
  if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== valor) falhar(`Informe ${nome} válida.`);
  if (!permitirFuturo && valor > hoje) falhar(`A ${nome} não pode estar no futuro.`);
  return valor;
}
function lista(anterior, nome) {
  if (anterior?.[nome] == null) return [];
  if (!Array.isArray(anterior[nome])) falhar(`O histórico de ${nome} está inválido. Atualize o cadastro antes de continuar.`);
  return anterior[nome];
}
function conferirLimite(registros, nome) {
  if (registros.length >= LIMITES[nome]) falhar(`O limite de ${nome} desta caixa foi atingido. O histórico foi preservado.`);
}
const maiorData = registros => registros.reduce((maior, registro) => registro.data > maior ? registro.data : maior, '');
const chavePessoa = valor => valor.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
export function quantidadeEmUso(movimentacoes = [], itemId, pessoa) {
  return movimentacoes.reduce((total, movimento) => {
    if (movimento.itemId !== itemId || (pessoa !== undefined && chavePessoa(movimento.pessoa) !== chavePessoa(pessoa))) return total;
    return total + (movimento.tipo === 'entrega' ? movimento.quantidade : -movimento.quantidade);
  }, 0);
}

export function saldoDisponivelCaixa(caixa, itemId) {
  const item = caixa?.acervo?.find(entrada => entrada.id === itemId);
  return item ? item.quantidade - quantidadeEmUso(caixa.movimentacoes || [], itemId) : 0;
}

export function aplicarOperacaoCaixa(anterior, operacao, sessao, agora) {
  const acervo = lista(anterior, 'acervo');
  const movimentacoes = lista(anterior, 'movimentacoes');
  const avaliacoes = lista(anterior, 'avaliacoes');
  const resultado = { acervo, movimentacoes, avaliacoes };
  if (operacao == null) return resultado;
  if (!objeto(operacao)) falhar('Operação da caixa inválida.');
  const instante = new Date(agora);
  if (!Number.isFinite(instante.getTime())) falhar('Data de atualização inválida.');
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
  const criadoPor = String(sessao.sub);
  const criadoPorNome = String(sessao.nome || sessao.sub);
  const autoria = { criadoEm: agora, criadoPor, criadoPorNome };
  const itemAtivo = id => {
    const item = acervo.find(entrada => entrada.id === id && !entrada.arquivado);
    if (!item) falhar('O item não existe ou está arquivado nesta caixa.');
    return item;
  };
  if (operacao.tipo === 'itemSalvar') {
    if (!objeto(operacao.item)) falhar('Item da caixa inválido.');
    const entrada = operacao.item;
    const id = texto(entrada.id, 'identificação do item', 100);
    const anteriorItem = id ? itemAtivo(id) : null;
    if (!anteriorItem) conferirLimite(acervo, 'acervo');
    const total = quantidade(entrada.quantidade);
    if (anteriorItem && total < quantidadeEmUso(movimentacoes, id)) falhar('A quantidade total não pode ser menor que a quantidade em uso.');
    const item = {
      ...(anteriorItem || {}),
      id: anteriorItem?.id || crypto.randomUUID(),
      nome: texto(entrada.nome, 'nome do item', 160, true),
      quantidade: total,
      estado: estado(entrada.estado),
      observacao: texto(entrada.observacao, 'observação', 1000),
      atualizadoEm: agora,
      atualizadoPorNome: criadoPorNome,
    };
    return { ...resultado, acervo: anteriorItem ? acervo.map(entrada => entrada.id === id ? item : entrada) : [...acervo, item] };
  }
  if (operacao.tipo === 'itemArquivar') {
    const item = itemAtivo(texto(operacao.itemId, 'identificação do item', 100, true));
    if (quantidadeEmUso(movimentacoes, item.id) !== 0) falhar('Devolva os itens em uso antes de arquivar.');
    return { ...resultado, acervo: acervo.map(entrada => entrada.id === item.id ? { ...entrada, arquivado: true, atualizadoEm: agora, atualizadoPorNome: criadoPorNome } : entrada) };
  }
  if (operacao.tipo === 'entrega' || operacao.tipo === 'devolucao') {
    const item = itemAtivo(texto(operacao.itemId, 'identificação do item', 100, true));
    const total = quantidade(operacao.quantidade, 'quantidade', 1);
    const pessoa = texto(operacao.pessoa, 'pessoa', 120, true);
    const data = dia(operacao.data, 'data', hoje);
    const ultimaMovimentacao = maiorData(movimentacoes.filter(movimento => movimento.itemId === item.id));
    const ultimaAvaliacao = maiorData(avaliacoes);
    if (data < ultimaMovimentacao) falhar(`A data não pode ser anterior à última movimentação deste item (${ultimaMovimentacao}).`);
    if (data < ultimaAvaliacao) falhar(`A data não pode ser anterior à última avaliação da caixa (${ultimaAvaliacao}).`);
    if (operacao.tipo === 'entrega' && total > item.quantidade - quantidadeEmUso(movimentacoes, item.id)) falhar('A quantidade da entrega excede o saldo disponível na caixa.');
    if (operacao.tipo === 'devolucao' && total > quantidadeEmUso(movimentacoes, item.id, pessoa)) falhar('A devolução excede a quantidade em uso por essa pessoa.');
    conferirLimite(movimentacoes, 'movimentacoes');
    const movimento = {
      id: crypto.randomUUID(), tipo: operacao.tipo, itemId: item.id, itemNome: item.nome,
      quantidade: total, pessoa, data,
      estado: estado(operacao.estado), observacao: texto(operacao.observacao, 'observação', 1000), ...autoria,
    };
    return { ...resultado, movimentacoes: [...movimentacoes, movimento] };
  }
  if (operacao.tipo === 'avaliar') {
    const ativos = acervo.filter(item => !item.arquivado);
    if (!ativos.length) falhar('Cadastre pelo menos um item ativo antes de avaliar a caixa.');
    if (!Array.isArray(operacao.itens) || operacao.itens.length !== ativos.length) falhar('A avaliação deve conferir todos os itens ativos da caixa.');
    const ids = new Set();
    const itens = operacao.itens.map(entrada => {
      if (!objeto(entrada)) falhar('Item de avaliação inválido.');
      const item = itemAtivo(texto(entrada.itemId, 'identificação do item', 100, true));
      if (ids.has(item.id)) falhar('Cada item deve aparecer apenas uma vez na avaliação.');
      ids.add(item.id);
      return { itemId: item.id, itemNome: item.nome, quantidadeConferida: quantidade(entrada.quantidadeConferida, 'quantidade conferida'), quantidadeEsperada: item.quantidade - quantidadeEmUso(movimentacoes, item.id), estado: estado(entrada.estado), observacao: texto(entrada.observacao, 'observação', 1000) };
    });
    const data = dia(operacao.data, 'data da avaliação', hoje);
    const ultimaAvaliacao = maiorData(avaliacoes);
    const ultimaMovimentacao = maiorData(movimentacoes);
    if (data < ultimaAvaliacao) falhar(`A data não pode ser anterior à última avaliação da caixa (${ultimaAvaliacao}).`);
    if (data < ultimaMovimentacao) falhar(`A data da avaliação não pode ser anterior à última movimentação da caixa (${ultimaMovimentacao}).`);
    const proximaData = dia(operacao.proximaData, 'data da próxima avaliação', hoje, true);
    if (proximaData < data) falhar('A próxima avaliação não pode ser anterior à avaliação registrada.');
    conferirLimite(avaliacoes, 'avaliacoes');
    const avaliacao = { id: crypto.randomUUID(), data, proximaData, itens, observacao: texto(operacao.observacao, 'observação', 1000), ...autoria };
    return { ...resultado, avaliacoes: [...avaliacoes, avaliacao] };
  }
  falhar('Operação da caixa inválida.');
}
