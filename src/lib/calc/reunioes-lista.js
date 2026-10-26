const normalizar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

export function momentoReunioes(agora = new Date()) {
  return {
    dia: agora.toLocaleDateString('en-CA', {timeZone: 'America/Sao_Paulo'}),
    hora: agora.toLocaleTimeString('pt-BR', {timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}),
  };
}

export function filaReuniao(item, momento = momentoReunioes()) {
  if (item.situacao !== 'agendado') return 'historico';
  return item.data < momento.dia || item.data === momento.dia && item.fim <= momento.hora ? 'encerramento' : 'proximos';
}

export function rotuloNaLista(item, momento = momentoReunioes()) {
  if (item.situacao === 'cancelado') return 'Cancelado';
  if (item.situacao === 'realizado') return 'Realizado';
  if (filaReuniao(item, momento) === 'encerramento') return 'Aguardando encerramento';
  return item.data === momento.dia && item.inicio <= momento.hora ? 'Em andamento' : 'Agendado';
}

export function organizarReunioes(itens, {setor = '', tipo = '', busca = '', minhas = false, vista = 'proximos'} = {}, momento = momentoReunioes()) {
  const termo = normalizar(busca).trim();
  const filtrados = itens.filter(item =>
    (!setor || (item.setor || 'outros') === setor) &&
    (!tipo || item.tipo === tipo) &&
    (!minhas || !!item.minhaPresenca?.participanteId && item.participantes.some(p => p.id === item.minhaPresenca.participanteId)) &&
    (!termo || normalizar([item.titulo, item.responsavel, item.local, item.pauta, ...item.participantes.map(p => p.nome)].join(' ')).includes(termo))
  );
  const contagens = {proximos: 0, encerramento: 0, historico: 0, todos: filtrados.length};
  for (const item of filtrados) contagens[filaReuniao(item, momento)]++;
  const mostrados = filtrados.filter(item => vista === 'todos' || filaReuniao(item, momento) === vista)
    .sort((a, b) => (vista === 'historico' ? -1 : 1) * (a.data.localeCompare(b.data) || a.inicio.localeCompare(b.inicio)) || a.id.localeCompare(b.id));
  const encaminhamentos = mostrados.filter(item => item.situacao !== 'cancelado').flatMap(item => item.decisoes).filter(d => !d.concluida);
  return {mostrados, contagens, encaminhamentos: encaminhamentos.length, vencidos: encaminhamentos.filter(d => d.prazo && d.prazo < momento.dia).length};
}

export function rascunhoReuniaoDesatualizado(editor, itens) {
  if (!editor?.versaoAnterior) return false;
  const atual = itens.find(item => item.id === editor.id);
  return !!atual && atual.versao !== editor.versaoAnterior;
}

// Uma resposta anterior não pode substituir uma consulta nova ou uma gravação.
// O editor tem estado próprio e nunca é substituído por esta consulta.
export function criarConsultaReunioes(ler) {
  let sequencia = 0;
  return {
    invalidar() { sequencia++; },
    async buscar() {
      const pedido = ++sequencia;
      try {
        const itens = await ler();
        return pedido === sequencia ? itens : null;
      } catch (erro) {
        if (pedido === sequencia) throw erro;
        return null;
      }
    },
  };
}
