// A mesma classificação alimenta o selo, o contador e o filtro.
export function estadoDoPapel(p) {
  if (p?.fonte === 'nao_integrado') return { chave: 'externa', rotulo: 'gestão externa', tom: 'neutral' };
  if (!p?.real?.existe) return { chave: 'fantasma', rotulo: 'conta não encontrada', tom: 'bad' };
  if (p.real.ativo === false) return { chave: 'desativada', rotulo: 'desativada', tom: 'neutral' };
  if (p.sistema === 'painel' && !(p.real.permissoes ?? p.permissoes ?? []).length)
    return { chave: 'vazia', rotulo: 'nenhum módulo liberado', tom: 'bad' };
  if (p.real.temporaria) return { chave: 'temporaria', rotulo: 'senha temporária', tom: 'warn' };
  return { chave: 'ok', rotulo: 'verificado', tom: 'ok' };
}

export const temPendencia = p => ['fantasma', 'vazia'].includes(estadoDoPapel(p).chave);

export function contarAcessos(dados) {
  const contas = dados.contas || [];
  const papeis = contas.flatMap(c => c.papeis || []);
  return {
    pessoas: contas.length,
    foraDoLugar: papeis.filter(temPendencia).length,
    ausentes: papeis.filter(p => estadoDoPapel(p).chave === 'fantasma').length,
    vazias: papeis.filter(p => estadoDoPapel(p).chave === 'vazia').length,
    temporarias: papeis.filter(p => estadoDoPapel(p).chave === 'temporaria').length,
    pessoasTemporarias: contas.filter(c => c.papeis.some(p => estadoDoPapel(p).chave === 'temporaria')).length,
    pessoasFora: contas.filter(c => c.papeis.some(temPendencia)).length,
    soltas: Object.values(dados.soltas || {}).reduce((n, xs) => n + xs.length, 0),
    naPorta: (dados.naPorta || []).length,
  };
}

export function situacaoEntrada(e) {
  if (e.ultimaEntrada && e.ultimaFalha)
    return Date.parse(e.ultimaEntrada) > Date.parse(e.ultimaFalha)
      ? 'Entrou após a falha' : 'Última tentativa falhou';
  return e.entradas > 0 ? 'Há entradas no período' : 'Sem entrada no período';
}
