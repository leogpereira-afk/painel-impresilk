// Regras do programa. Dados reais são configurados no servidor, nunca no bundle.
export class ErroVirada extends Error {
  constructor(message, status = 422) { super(message); this.name = 'ErroVirada'; this.status = status; }
}
const fail = (message, status = 422) => { throw new ErroVirada(message, status); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ATIVAS = new Set(['em_andamento', 'bloqueada', 'em_validacao']);
const ESTADOS = new Set(['planejada', ...ATIVAS]);
export const MAX_FOTO = 6 * 1024 * 1024;
export const idValido = value => typeof value === 'string' && UUID.test(value);
const id = value => { if (!idValido(value)) fail('Identificador inválido.'); return value; };
const object = value => { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Pedido inválido.', 400); return value; };
function text(value, max, required = false) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') fail('Informe um texto válido.');
  const clean = value.trim();
  if (clean.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(clean)) fail('Texto inválido ou muito longo.');
  if (required && !clean) fail('Preencha os campos obrigatórios.');
  return clean;
}
function date(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T12:00:00Z')) || new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value) fail('Data inválida.');
  return value;
}
const list = (value, max) => { if (!Array.isArray(value) || value.length > max) fail('Lista inválida ou acima do limite.'); return value; };
export function autorizarModulo(sessao) {
  if (!sessao || typeof sessao.sub !== 'string' || !sessao.sub.trim()) fail('Entre novamente.', 401);
  if (!(sessao.master === true || Array.isArray(sessao.perms) && (sessao.perms.includes('*') || sessao.perms.includes('virada')))) fail('Sem acesso a A Virada.', 403);
}
export function atorDoCiclo(ciclo, sessao, identidade = {}) {
  autorizarModulo(sessao);
  const rhId = typeof identidade.rhId === 'string' && identidade.rhId ? identidade.rhId : null;
  const encontrados = rhId ? (ciclo?.participantes || []).filter(p => p.rhId === rhId) : [];
  if (encontrados.length > 1) fail('Vínculo duplicado no programa. Confira a configuração.', 409);
  return { rhId, participanteId: encontrados[0]?.id || null, direcao: sessao.master === true };
}
const participante = (ciclo, participanteId) => ciclo.participantes.find(p => p.id === participanteId);
export function podeLerMissao(ciclo, missao, ator) {
  const dono = participante(ciclo, missao?.participanteId);
  return !!dono && (ator.direcao || dono.id === ator.participanteId || !!ator.participanteId && dono.mentorId === ator.participanteId);
}
function mentor(ciclo, missao, ator) {
  const dono = participante(ciclo, missao?.participanteId);
  return !!dono && (ator.direcao || !!ator.participanteId && dono.mentorId === ator.participanteId);
}
function exigirLeitura(ciclo, missao, ator) {
  if (!missao || !podeLerMissao(ciclo, missao, ator)) fail('Missão não encontrada ou sem acesso.', 404);
}
function exigirRevisor(ciclo, missao, ator) {
  exigirLeitura(ciclo, missao, ator);
  if (!mentor(ciclo, missao, ator)) fail('Somente o acompanhador ou a direção pode validar.', 403);
  if (!ator.rhId || participante(ciclo, missao.participanteId)?.rhId === ator.rhId) fail('A validação precisa ser feita por outra pessoa vinculada ao RH.', 403);
}
function exigirEquipe(ator) { if (!ator.direcao && !ator.participanteId) fail('Sua conta não está vinculada aos participantes deste programa.', 403); }
const fotoPublica = ({ id, nome, mime, tamanho, em, autor }) => ({ id, nome, mime, tamanho, em, autor });
export function apresentarCiclo(ciclo, ator) {
  if (!ciclo) return null;
  exigirEquipe(ator);
  const visiveis = ciclo.missoes.filter(m => podeLerMissao(ciclo, m, ator));
  const meus = new Set(ciclo.participantes.filter(p => ator.direcao || p.id === ator.participanteId || p.mentorId === ator.participanteId).map(p => p.id));
  const meuMentor = participante(ciclo, ator.participanteId)?.mentorId;
  if (meuMentor) meus.add(meuMentor);
  return {
    id: ciclo.id, nome: ciclo.nome, inicio: ciclo.inicio, dias: 90, versao: ciclo.versao,
    participantes: ciclo.participantes.filter(p => meus.has(p.id)).map(p => { const { documentos: _privados, ...basico } = p; return { ...basico, documentos: podeLerMissao(ciclo, { participanteId: p.id }, ator) ? (p.documentos || []).map(fotoPublica) : [] }; }),
    missoes: visiveis.map(m => ({ ...m, xp: m.status === 'validada' ? 10 : 0,
      evidencias: m.evidencias.map(e => ({ ...e, fotos: e.fotos.map(fotoPublica) })),
      podeValidar: mentor(ciclo, m, ator) && !!ator.rhId && participante(ciclo, m.participanteId)?.rhId !== ator.rhId,
      podeEditar: mentor(ciclo, m, ator),
    })),
    mural: ciclo.mural.map(p => ({ id: p.id, titulo: p.titulo, texto: p.texto, fotos: p.fotos.map(fotoPublica), comentarios: p.comentarios, autor: p.autor, em: p.em })),
  };
}
function carimbo(sessao, ator) { return { usuario: sessao.sub, nome: text(sessao.nome || sessao.sub, 180, true), rhId: ator.rhId }; }
function evento(acao, contexto, uuid, em, autor, extra = {}) { return { id: uuid(), acao, contexto, em, autor, ...extra }; }
function adicionarHistorico(lista, item) { if (lista.length >= 10000) fail('Limite do histórico atingido. A direção precisa encerrar este ciclo.'); lista.push(item); }
function umaPrioridade(ciclo, missao, status) {
  if (ATIVAS.has(status) && ciclo.missoes.some(m => m.id !== missao.id && m.participanteId === missao.participanteId && ATIVAS.has(m.status))) fail('Conclua ou pause a prioridade atual antes de iniciar outra.', 409);
}
function comprovada(m) { return m.evidencias.some(e => e.texto?.trim() && e.resultado?.trim()); }
function prazoDoCiclo(ciclo, prazo) {
  if (!prazo || !ciclo.inicio) return;
  const fim = new Date(ciclo.inicio + 'T12:00:00Z'); fim.setUTCDate(fim.getUTCDate() + 89);
  if (prazo < ciclo.inicio || prazo > fim.toISOString().slice(0, 10)) fail('O prazo precisa estar dentro dos 90 dias do ciclo.');
}
function participantesValidos(entradas, antes, pessoas, uuid) {
  const usados = new Set(), ids = new Set();
  const novos = list(entradas, 100).map(raw => {
    const p = object(raw), rhId = text(p.rhId, 180, true), pessoa = pessoas.find(x => x.id === rhId);
    if (!pessoa) fail('Escolha uma ficha ativa do RH.');
    if (usados.has(rhId)) fail('A pessoa já está neste ciclo.'); usados.add(rhId);
    const anterior = antes.find(x => x.rhId === rhId);
    if (p.id && (!anterior || anterior.id !== p.id)) fail('O vínculo do participante mudou. Atualize os dados.', 409);
    const novoId = anterior?.id || uuid();
    if (ids.has(novoId)) fail('Participante duplicado.'); ids.add(novoId);
    return { id: novoId, rhId, nome: text(pessoa.nome, 180, true), funcao: text(p.funcao ?? anterior?.funcao ?? pessoa.funcao, 180), mentorId: p.mentorId || null, documentos: anterior?.documentos || [] };
  });
  for (const p of novos) {
    if (!p.mentorId) continue;
    const m = novos.find(x => x.id === p.mentorId || x.rhId === p.mentorId);
    if (!m || m.id === p.id) fail('O acompanhador deve ser outro participante do programa.');
    p.mentorId = m.id;
  }
  return novos;
}

// A versão é conferida aqui para mensagem rápida e novamente na RPC sob lock.
export function aplicarAcao(cicloAntes, pedido, sessao, identidade, contexto = {}) {
  const b = object(pedido), uuid = contexto.uuid || (() => crypto.randomUUID()), em = contexto.em || new Date().toISOString();
  autorizarModulo(sessao);
  if (!Number.isSafeInteger(b.versao) || b.versao < 0) fail('Informe a versão atual do ciclo.', 409);
  if (cicloAntes && (b.idCiclo !== cicloAntes.id || b.versao !== cicloAntes.versao) || !cicloAntes && b.versao !== 0) fail('Este ciclo mudou. Atualize os dados antes de continuar.', 409);
  if (!cicloAntes && b.action !== 'salvarCiclo') fail('Configure o ciclo primeiro.', 404);
  const ator = atorDoCiclo(cicloAntes, sessao, identidade), autor = carimbo(sessao, ator);
  const c = cicloAntes ? structuredClone(cicloAntes) : { id: b.idCiclo ? id(b.idCiclo) : uuid(), nome: '', inicio: null, dias: 90, versao: 0, participantes: [], missoes: [], mural: [], historico: [] };
  const registrar = (acao, alvo, extra = {}) => {
    const e = evento(acao, alvo?.id || c.id, uuid, em, autor, extra);
    adicionarHistorico(c.historico, e);
    if (alvo?.historico) adicionarHistorico(alvo.historico, e);
  };
  if (b.action === 'salvarCiclo') {
    if (!ator.direcao) fail('Somente a direção configura o programa.', 403);
    const item = object(b.item), pessoas = contexto.pessoas || [];
    const novos = participantesValidos(item.participantes, c.participantes, pessoas, uuid);
    if (c.missoes.some(m => !novos.some(p => p.id === m.participanteId)) || c.participantes.some(p => p.documentos?.length && !novos.some(n => n.id === p.id))) fail('Não é possível remover participante com missões. Preserve o histórico.');
    c.nome = text(item.nome, 120, true); c.inicio = date(item.inicio); c.participantes = novos;
    for (const m of c.missoes) prazoDoCiclo(c, m.prazo);
    registrar(cicloAntes ? 'configurou_ciclo' : 'criou_ciclo', null);
  } else {
    exigirEquipe(ator);
    if (b.action === 'anexarPdi') {
      if (!ator.direcao) fail('Somente a direção pode publicar uma versão do PDI.', 403);
      const p = participante(c, id(b.participanteId));
      if (!p) fail('Participante não encontrado.', 404);
      if ((p.documentos || []).length >= 30) fail('Limite de versões do PDI atingido. Preserve o histórico.');
      const f = contexto.documento;
      if (!f || !idValido(f.id) || f.mime !== 'application/pdf' || !f.chave?.startsWith(`virada/${c.id}/pdis/${p.id}/`) || !Number.isInteger(f.tamanho) || f.tamanho < 1 || f.tamanho > MAX_FOTO) fail('Documento inválido.');
      p.documentos = [...(p.documentos || []), { ...f, em, autor }];
      registrar('publicou_pdi', p, { arquivoId: f.id });
    } else if (b.action === 'salvarMissao') {
      const item = object(b.item), anterior = item.id ? c.missoes.find(m => m.id === id(item.id)) : null;
      if (item.id && !anterior) fail('Missão não encontrada.', 404);
      const destinatario = participante(c, item.participanteId);
      if (!destinatario) fail('Escolha um participante deste ciclo.');
      if (anterior && anterior.participanteId !== destinatario.id) fail('O responsável de uma missão não pode ser trocado.');
      if (!mentor(c, { participanteId: destinatario.id }, ator)) fail('Somente o acompanhador ou a direção pactua missões.', 403);
      if (anterior?.status === 'validada') fail('Reabra a missão antes de alterar o combinado.', 409);
      if (!['melhoria', 'aprendizado', 'compromisso'].includes(item.tipo) || ![30, 60, 90].includes(item.fase)) fail('Tipo ou fase inválida.');
      const prazo = date(item.prazo); prazoDoCiclo(c, prazo);
      const campos = ['titulo', 'objetivo', 'criterio', 'tipo', 'fase', 'prazo'];
      const valoresAnteriores = anterior ? Object.fromEntries(campos.map(k => [k, anterior[k] ?? null])) : null;
      const m = anterior || { id: uuid(), participanteId: destinatario.id, prazoOriginal: prazo, status: 'planejada', evidencias: [], comentarios: [], historico: [], criadoEm: em, criadoPor: autor };
      Object.assign(m, { titulo: text(item.titulo, 180, true), objetivo: text(item.objetivo, 4000, true), criterio: text(item.criterio, 2000), tipo: item.tipo, fase: item.fase, prazo });
      if (!anterior) { if (c.missoes.length >= 500) fail('Limite de missões atingido.'); c.missoes.push(m); }
      const alteracoes = anterior ? Object.fromEntries(campos.filter(k => valoresAnteriores[k] !== m[k]).map(k => [k, { anterior: valoresAnteriores[k], novo: m[k] }])) : {};
      const motivo = anterior ? text(item.motivo, 2000, !!(alteracoes.prazo || alteracoes.criterio || alteracoes.objetivo)) : '';
      registrar(anterior ? 'editou_missao' : 'pactuou_missao', m, anterior ? { alteracoes, motivo } : {});
    } else if (b.action === 'comentar' && b.postId) {
      if (b.missaoId) fail('Escolha um único contexto para o comentário.');
      const post = c.mural.find(p => p.id === id(b.postId));
      if (!post) fail('Publicação não encontrada.', 404);
      if (post.comentarios.length >= 200) fail('Limite de comentários atingido.');
      post.comentarios.push({ id: uuid(), texto: text(b.texto, 3000, true), autor, em }); registrar('comentou_mural', post);
    } else {
      const m = c.missoes.find(x => x.id === id(b.missaoId)); exigirLeitura(c, m, ator);
      if (['evidencia', 'anexar'].includes(b.action) && m.status === 'validada') fail('Reabra a missão antes de acrescentar evidências.', 409);
      if (b.action === 'estado') {
        if (!ESTADOS.has(b.status)) fail('Estado inválido.');
        if (m.status === 'validada') fail('Use a reabertura para preservar a validação.', 409);
        if (m.status === b.status) fail('A missão já está nesse estado. Atualize os dados.', 409);
        const motivo = text(b.motivo, 2000, ['planejada', 'bloqueada'].includes(b.status));
        if (b.status === 'em_validacao' && !comprovada(m)) fail('Registre uma evidência com execução e resultado antes de pedir validação.');
        umaPrioridade(c, m, b.status); const anterior = m.status; m.status = b.status;
        registrar('mudou_estado', m, { de: anterior, para: m.status, motivo });
      } else if (b.action === 'evidencia') {
        if (m.evidencias.length >= 50) fail('Limite de evidências atingido.');
        m.evidencias.push({ id: uuid(), texto: text(b.texto, 4000, true), resultado: text(b.resultado, 3000, true), aprendizado: text(b.aprendizado, 3000), os: text(b.os, 100), fotos: [], autor, em });
        registrar('registrou_evidencia', m);
      } else if (b.action === 'anexar') {
        const e = m.evidencias.find(x => x.id === id(b.evidenciaId));
        if (!e) fail('Evidência não encontrada.', 404);
        if (e.fotos.length >= 4) fail('Cada evidência admite até quatro fotos.');
        const a = contexto.arquivo;
        if (!a || !idValido(a.id) || !a.chave?.startsWith(`virada/${c.id}/${m.id}/`) || a.tamanho > MAX_FOTO || a.tamanho < 1) fail('Arquivo não conferido pelo servidor.');
        e.fotos.push({ ...a, autor, em }); registrar('anexou_foto', m);
      } else if (b.action === 'comentar') {
        if (m.comentarios.length >= 200) fail('Limite de comentários atingido.');
        m.comentarios.push({ id: uuid(), texto: text(b.texto, 3000, true), autor, em }); registrar('comentou_missao', m);
      } else if (b.action === 'validar') {
        exigirRevisor(c, m, ator);
        if (m.status !== 'em_validacao' || !comprovada(m)) fail('A missão precisa estar aguardando validação com evidência e resultado.', 409);
        if (b.conhecimentoCompartilhado !== undefined && typeof b.conhecimentoCompartilhado !== 'boolean') fail('Confirme a demonstração de aprendizagem.');
        if (b.conhecimentoCompartilhado === true && m.tipo !== 'aprendizado') fail('Conhecimento compartilhado exige uma missão de aprendizagem.');
        const parecer = text(b.parecer, 3000, true); m.status = 'validada';
        m.conhecimentoCompartilhado = b.conhecimentoCompartilhado === true;
        m.validacao = { parecer, autor, em, conhecimentoCompartilhado: m.conhecimentoCompartilhado };
        registrar('validou_missao', m, { parecer, conhecimentoCompartilhado: m.conhecimentoCompartilhado, xp: 10 });
      } else if (b.action === 'reabrir') {
        exigirRevisor(c, m, ator);
        if (!['validada', 'em_validacao'].includes(m.status)) fail('Somente missão em validação ou validada pode ser reaberta.', 409);
        const motivo = text(b.motivo, 2000, true); umaPrioridade(c, m, 'em_andamento'); const anterior = m.status; m.status = 'em_andamento'; m.conhecimentoCompartilhado = false; m.validacao = null;
        registrar('reabriu_missao', m, { de: anterior, motivo, xp: anterior === 'validada' ? -10 : 0 });
      } else if (b.action === 'publicar') {
        if (c.mural.length >= 300) fail('Limite do mural atingido.');
        const evidencias = list(b.evidenciaIds || [], 50);
        if (new Set(evidencias).size !== evidencias.length || evidencias.some(e => !m.evidencias.some(x => x.id === e))) fail('Seleção de evidências inválida.');
        const fotos = evidencias.flatMap(e => m.evidencias.find(x => x.id === e).fotos).map(f => ({ ...f }));
        if (fotos.length > 8) fail('Selecione no máximo oito fotos para o mural.');
        c.mural.push({ id: uuid(), titulo: text(b.titulo, 180, true), texto: text(b.texto, 4000, true), fotos, comentarios: [], autor, em, origemMissaoId: m.id }); registrar('publicou_resumo', m);
      } else fail('Ação inválida.', 400);
    }
  }
  c.versao += 1; c.atualizadoEm = em;
  if (new TextEncoder().encode(JSON.stringify(c)).byteLength > 3 * 1024 * 1024) fail('O ciclo atingiu o limite de registros. Preserve o histórico e abra um novo ciclo.');
  return c;
}

export function arquivoAutorizado(ciclo, pedido, ator) {
  exigirEquipe(ator);
  if (!!pedido.missaoId === !!pedido.postId) fail('Escolha um único contexto para a foto.');
  let fotos;
  if (pedido.missaoId) {
    const m = ciclo.missoes.find(x => x.id === id(pedido.missaoId)); exigirLeitura(ciclo, m, ator); fotos = m.evidencias.flatMap(e => e.fotos);
  } else {
    const p = ciclo.mural.find(x => x.id === id(pedido.postId)); if (!p) fail('Publicação não encontrada.', 404); fotos = p.fotos;
  }
  const a = fotos.find(x => x.id === id(pedido.arquivoId));
  if (!a || !a.chave?.startsWith(`virada/${ciclo.id}/`)) fail('Foto não encontrada.', 404);
  return a;
}
export function validarFoto(nome, mime, bytes) {
  const arquivo = text(nome, 140, true);
  if (/[\\/]/.test(arquivo) || !(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_FOTO) fail('Foto inválida ou acima de 6 MiB.');
  const starts = seq => seq.every((v, i) => bytes[i] === v);
  let ext;
  if (mime === 'image/png' && bytes.length >= 24 && starts([137, 80, 78, 71, 13, 10, 26, 10]) && String.fromCharCode(...bytes.slice(12, 16)) === 'IHDR') ext = 'png';
  if (mime === 'image/jpeg' && bytes.length >= 4 && starts([255, 216, 255]) && bytes.at(-2) === 255 && bytes.at(-1) === 217) ext = 'jpg';
  if (mime === 'image/webp' && bytes.length >= 20 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' && ['VP8 ', 'VP8L', 'VP8X'].includes(String.fromCharCode(...bytes.slice(12, 16))) && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) + 8 === bytes.length) ext = 'webp';
  if (!ext) fail('Envie uma foto JPEG, PNG ou WebP válida.');
  return { nome: arquivo, mime, ext, tamanho: bytes.length };
}


export function documentoPdiAutorizado(ciclo, pedido, ator) {
  const p = participante(ciclo, id(pedido.participanteId));
  if (!p || !podeLerMissao(ciclo, { participanteId: p.id }, ator)) fail('Documento não encontrado ou sem acesso.', 404);
  const f = (p.documentos || []).find(d => d.id === id(pedido.arquivoId));
  if (!f || f.mime !== 'application/pdf' || !f.chave?.startsWith(`virada/${ciclo.id}/pdis/${p.id}/`)) fail('Documento não encontrado.', 404);
  return f;
}
export function validarPdf(nome, mime, bytes) {
  if (mime !== 'application/pdf' || !(bytes instanceof Uint8Array) || bytes.length < 12 || bytes.length > MAX_FOTO) fail('Escolha um PDF de até 6 MiB.');
  const inicio = String.fromCharCode(...bytes.subarray(0, 8));
  const final = String.fromCharCode(...bytes.subarray(Math.max(0, bytes.length - 1024)));
  if (!/^%PDF-[12]\.[0-9]/.test(inicio) || !/%%EOF\s*$/.test(final)) fail('O arquivo não tem formato PDF válido.');
  const limpo = text(nome, 180, true).replace(/[\\/]/g, '_');
  if (!/\.pdf$/i.test(limpo)) fail('O nome do arquivo precisa terminar em .pdf.');
  return { nome: limpo, mime: 'application/pdf', tamanho: bytes.length };
}
