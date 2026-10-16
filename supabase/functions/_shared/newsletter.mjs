// Contrato da Newsletter. O painel atual pertence à Impresilk; não mistura bases de outras empresas.
export class ErroNewsletter extends Error { constructor(message, status = 422) { super(message); this.status = status; } }
export const REMETENTE_ID = '00000000-0000-4000-8000-000000000001';
export const TIPOS_NEWSLETTER = ['contato', 'lista', 'edicao', 'remetente'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function idNewsletter(id) { if (!uuid.test(id || '')) throw new ErroNewsletter('Identificador inválido.'); return id; }
function texto(v, limite, campo, obrigatorio = false) {
  const s = String(v ?? '').trim();
  if (s.length > limite || (obrigatorio && !s) || s.includes('\0')) throw new ErroNewsletter(`Confira ${campo}.`);
  return s;
}
function email(v, opcional = false) {
  const s = texto(v, 254, 'o e-mail').toLowerCase();
  if (opcional && !s) return '';
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s)) throw new ErroNewsletter('Informe um e-mail válido.');
  return s;
}
function opcao(v, opcoes, campo) { if (!opcoes.includes(v)) throw new ErroNewsletter(`Confira ${campo}.`); return v; }
function ids(v) { if (!Array.isArray(v) || v.length > 50) throw new ErroNewsletter('Escolha até 50 listas.'); return [...new Set(v.map(idNewsletter))]; }
function link(v) {
  const s = texto(v, 2000, 'o link'); if (!s) return '';
  try { const u = new URL(s); if (u.protocol !== 'https:' || u.username || u.password) throw new Error(); return u.href; } catch { throw new ErroNewsletter('Use um link HTTPS válido.'); }
}
export function prepararNewsletter(tipo, entrada) {
  if (!TIPOS_NEWSLETTER.includes(tipo) || !entrada || typeof entrada !== 'object' || Array.isArray(entrada)) throw new ErroNewsletter('Cadastro inválido.');
  if (tipo === 'lista') return { nome: texto(entrada.nome, 100, 'o nome da lista', true), descricao: texto(entrada.descricao, 400, 'a descrição') };
  if (tipo === 'remetente') return { nome: texto(entrada.nome, 100, 'o nome do remetente', true), email: email(entrada.email), responderPara: email(entrada.responderPara, true) };
  if (tipo === 'contato') {
    const situacao = opcao(entrada.situacao || 'pendente', ['pendente', 'inscrito', 'descadastrado', 'bloqueado'], 'a situação');
    const origem = texto(entrada.origem, 300, 'a origem');
    const autorizacao = texto(entrada.autorizacao, 500, 'a autorização');
    if (situacao === 'inscrito' && (!origem || !autorizacao)) throw new ErroNewsletter('Para ativar, registre a origem e a autorização para receber.');
    return { nome: texto(entrada.nome, 150, 'o nome'), email: email(entrada.email), empresa: texto(entrada.empresa, 150, 'a empresa'), listas: ids(entrada.listas || []), situacao, origem, autorizacao };
  }
  const situacao = opcao(entrada.situacao || 'rascunho', ['rascunho', 'revisao', 'pronta', 'arquivada'], 'a situação');
  const conteudo = texto(entrada.conteudo, 30000, 'o conteúdo');
  const listas = ids(entrada.listas || []);
  if (situacao === 'pronta' && (!conteudo || !listas.length)) throw new ErroNewsletter('Para deixar pronta, escreva o conteúdo e escolha o público.');
  const metricas = {};
  for (const campo of ['enviados', 'entregues', 'aberturas', 'cliques', 'descadastros', 'falhas']) {
    const v = entrada.metricas?.[campo];
    if (v == null || v === '') metricas[campo] = null;
    else if (!Number.isSafeInteger(Number(v)) || Number(v) < 0) throw new ErroNewsletter(`Confira ${campo}.`);
    else metricas[campo] = Number(v);
  }
  if (metricas.enviados != null && (metricas.entregues > metricas.enviados || metricas.falhas > metricas.enviados || ((metricas.entregues ?? 0) + (metricas.falhas ?? 0)) > metricas.enviados)) throw new ErroNewsletter('Entregues e falhas não podem superar enviados.');
  if (metricas.entregues != null && ['aberturas', 'cliques', 'descadastros'].some(k => metricas[k] > metricas.entregues)) throw new ErroNewsletter('Eventos únicos não podem superar entregues.');
  const fonteMetricas = texto(entrada.fonteMetricas, 300, 'a fonte dos resultados');
  const dataResultados = texto(entrada.dataResultados, 10, 'a data dos resultados');
  if (Object.values(metricas).some(v => v != null) && (!fonteMetricas || !/^\d{4}-\d{2}-\d{2}$/.test(dataResultados) || Number.isNaN(Date.parse(dataResultados)) || new Date(dataResultados).toISOString().slice(0,10) !== dataResultados)) throw new ErroNewsletter('Informe a fonte e uma data válida para os resultados manuais.');
  return { titulo: texto(entrada.titulo, 200, 'o assunto', true), preCabecalho: texto(entrada.preCabecalho, 200, 'a prévia do assunto'), conteudo, imagem: link(entrada.imagem), link: link(entrada.link), botao: texto(entrada.botao, 60, 'o botão'), listas, situacao, metricas, fonteMetricas, dataResultados };
}
export function publicoDaEdicao(contatos, listas) {
  const escolhidas = new Set(listas); const emails = new Set();
  return contatos.filter(c => {
    const d = c.dados || c;
    if (d.situacao !== 'inscrito' || !d.autorizacao || !d.origem || !d.listas?.some(id => escolhidas.has(id)) || emails.has(d.email.toLowerCase())) return false;
    emails.add(d.email.toLowerCase()); return true;
  });
}
export function taxaNewsletter(n, total) { return n == null || total == null || total <= 0 ? null : (100 * n / total); }
