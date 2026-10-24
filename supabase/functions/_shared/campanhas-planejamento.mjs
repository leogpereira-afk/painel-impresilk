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
// A LOGO DO EVENTO mora no Storage (bucket público painel-publico, pasta
// campanhas/<id da campanha>/<uuid>.<png|jpg|webp>) e o registro guarda só a
// URL: até 24/10/2026 ela viajava em base64 dentro do registro e cada leitura
// ou gravação devolvia TODAS as campanhas com todas as logos. A tela reduz a
// imagem e manda pela ação `logo` do painel-config, que confere os bytes e
// grava o arquivo. A forma antiga (data URL pequena) continua aceita: é o que
// a prévia usa e o que uma tela ainda não recarregada mandaria. SVG não entra
// (pode carregar script). null ou '' tira.
export const LOGO_MAX = 200000;
export const LOGO_BUCKET = 'painel-publico';
/* O id da campanha que pode ter logo: só letras, dígitos, ponto, traço e
   sublinhado, começando por letra ou dígito (nem ".", nem "..", nem barra).
   É o que novoId gera; outro id é cliente forjado e leva 400 antes do upload. */
export const LOGO_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
export const LOGO_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/painel-publico\/campanhas\/[A-Za-z0-9][A-Za-z0-9._-]{0,119}\/[a-f0-9-]{36}\.(png|jpg|webp)$/;
export function validarLogo(valor) {
  if (valor == null || valor === '') return null;
  if (typeof valor !== 'string') throw Error('Logo inválida: use uma imagem PNG, JPG ou WebP pequena.');
  if (LOGO_URL_RE.test(valor)) return valor;
  if (valor.length > LOGO_MAX || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(valor)) throw Error('Logo inválida: use uma imagem PNG, JPG ou WebP pequena.');
  return valor;
}
/* O caminho no bucket, a partir do id da campanha e de um nome de arquivo
   gerado pelo servidor. O id vai codificado: um id com barra viraria pasta. */
export function caminhoDaLogo(campanhaId, uuid, ext) {
  return `campanhas/${encodeURIComponent(String(campanhaId))}/${uuid}.${ext}`;
}
/* O caminho dentro do bucket a partir da URL pública gravada; "" se a URL não
   é a de uma logo nossa (forma antiga em base64, ou lixo). */
export function caminhoNoBucket(url) {
  if (!LOGO_URL_RE.test(String(url || ''))) return '';
  return String(url).split(`/object/public/${LOGO_BUCKET}/`)[1] || '';
}
