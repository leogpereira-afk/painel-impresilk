export function agruparEntradas(linhas) {
  const grupos = new Map();
  for (const l of linhas) {
    const usuario = String(l.usuario || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const chave = `${usuario}|${l.sistema}`;
    if (!grupos.has(chave)) grupos.set(chave, {usuario:l.usuario, sistema:l.sistema, falhas:0, entradas:0, ultimaFalha:null, ultimaEntrada:null, motivo:''});
    const e = grupos.get(chave);
    if (l.acao === 'entrou') {
      e.entradas++;
      if (!e.ultimaEntrada || Date.parse(l.em) > Date.parse(e.ultimaEntrada)) e.ultimaEntrada = l.em;
    } else {
      e.falhas++;
      if (!e.ultimaFalha || Date.parse(l.em) > Date.parse(e.ultimaFalha)) { e.ultimaFalha=l.em; e.motivo=String(l.detalhe || '').slice(0,60); }
    }
  }
  return [...grupos.values()].filter(e => e.falhas > 0).sort((a,b) => Date.parse(b.ultimaFalha)-Date.parse(a.ultimaFalha));
}

export function elencoRh(colabs) {
  return colabs.map(r => ({nome:String(r.nome || '').trim(), como:'cadastro', detalhe:['inativo','abandono'].includes(r.situacao) ? 'desligado' : ''})).filter(r => r.nome);
}
