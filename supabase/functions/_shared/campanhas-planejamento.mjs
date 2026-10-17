// Planejamento é parte da campanha. Calendário apenas projeta as ações datadas.
export function validarPlanejamento(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw Error('Planejamento inválido.');
  const texto = (v, limite) => {
    if (v != null && typeof v !== 'string') throw Error('Informe os campos em texto.');
    const s = (v || '').trim();
    if (s.length > limite) throw Error(`Texto excede ${limite} caracteres.`);
    return s;
  };
  if (!Array.isArray(valor.acoes) || valor.acoes.length > 100) throw Error('Use até 100 ações por campanha.');
  const ids = new Set();
  const acoes = valor.acoes.map(a => {
    if (!a || typeof a !== 'object') throw Error('Ação inválida.');
    const id = texto(a.id, 100), titulo = texto(a.titulo, 200), data = texto(a.data, 10);
    if (!id || ids.has(id) || !titulo) throw Error('Cada ação deve ter identificação única e título.');
    ids.add(id);
    if (data && (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !Number.isFinite(Date.parse(data)) || new Date(data).toISOString().slice(0,10) !== data)) throw Error('Informe uma data válida.');
    if (a.calendario === true && !data) throw Error('Informe a data da ação para vinculá-la ao calendário.');
    if (![undefined, 'pendente', 'concluida', 'cancelada'].includes(a.status)) throw Error('Situação inválida.');
    return {id,titulo,data,responsavel:texto(a.responsavel,120),calendario:a.calendario===true,status:a.status||'pendente'};
  });
  return {consideracoes:texto(valor.consideracoes,10000),estrategia:texto(valor.estrategia,10000),proximaCampanha:texto(valor.proximaCampanha,10000),acoes};
}
export function projetarCampanhas(campanhas, mes) {
  const eventos=[];
  for (const c of campanhas) {
    if (c.encerrada || !c.id) continue;
    for (const a of c.planejamento?.acoes || []) {
      if (!a.id || !a.titulo || a.calendario !== true || a.status !== 'pendente' || !a.data?.startsWith(`${mes}-`)) continue;
      eventos.push({id:`campanha:${c.id}:${a.id}`,data:a.data,titulo:a.titulo,tipo:'Campanha',cor:'#7c3aed',origem:'campanhas',descricao:[c.nome,a.responsavel].filter(Boolean).join(' · '),href:`/campanhas?campanha=${encodeURIComponent(c.id)}`});
    }
  }
  return eventos;
}
