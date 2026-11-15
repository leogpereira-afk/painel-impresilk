import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { verificarJwt, crachaRevogado } from '../_shared/cripto.ts';
import { identidadePresenca } from '../_shared/reunioes-presenca.mjs';
import { ErroVirada, autorizarModulo, atorDoCiclo, apresentarCiclo, aplicarAcao, arquivoAutorizado, validarFoto, idValido, MAX_FOTO, documentoPdiAutorizado, validarPdf } from '../_shared/virada.mjs';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const SECRET = Deno.env.get('PAINEL_JWT_SECRET') || '';
const BUCKET = 'virada-evidencias';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const MUTACOES = new Set(['salvarCiclo', 'salvarMissao', 'estado', 'evidencia', 'anexar', 'comentar', 'validar', 'reabrir', 'publicar', 'anexarPdi']);
const LIMITE_PEDIDO = Math.ceil(MAX_FOTO / 3) * 4 + 50000;

async function corpo(req: Request) {
  if (Number(req.headers.get('content-length')) > LIMITE_PEDIDO) throw new ErroVirada('Conteúdo grande demais.', 413);
  const reader = req.body?.getReader();
  if (!reader) throw new ErroVirada('Pedido inválido.', 400);
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      length += part.value.length;
      if (length > LIMITE_PEDIDO) { await reader.cancel(); throw new ErroVirada('Conteúdo grande demais.', 413); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(length); let pos = 0;
  for (const chunk of chunks) { data.set(chunk, pos); pos += chunk.length; }
  try {
    const b = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw new Error('forma');
    return b;
  } catch { throw new ErroVirada('Pedido inválido.', 400); }
}
async function cicloAtual() {
  const { data, error } = await sb.from('virada_ciclos').select('id,versao,registro').eq('ativo', true).maybeSingle();
  if (error) throw error;
  return data ? { ...data.registro, id: data.id, versao: Number(data.versao) } : null;
}
async function paginas(colecao: string, colunas: string) {
  const result: any[] = [];
  for (let offset = 0; offset < 10000; offset += 500) {
    const { data, error } = await sb.from('registros').select(colunas).eq('colecao', colecao).eq('apagado', false).order('id').range(offset, offset + 499);
    if (error) throw new ErroVirada('Não foi possível conferir as fichas do RH.', 503);
    result.push(...(data || [])); if ((data || []).length < 500) return result;
  }
  throw new ErroVirada('A consulta do RH excedeu o limite. Confira os cadastros.', 503);
}
async function pessoasRH() {
  const [pessoas, status, cargos] = await Promise.all([
    paginas('colaboradores', 'id,nome:registro->>nome,cargoId:registro->>cargoId,statusId:registro->>statusId,saiu:registro->>dataDesligamento'),
    paginas('status', 'id,ativo:registro->>contaComoAtivo'),
    paginas('cargos', 'id,nome:registro->>nome'),
  ]);
  const ativo = new Set(status.filter(s => s.ativo === 'true' || s.ativo === true).map(s => s.id));
  return pessoas.filter(p => p.id && p.nome && !p.saiu && ativo.has(p.statusId))
    .map(p => ({ id: p.id, nome: String(p.nome), funcao: String(cargos.find(c => c.id === p.cargoId)?.nome || '') }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
async function gravar(ciclo: any, versao: number) {
  const { error } = await sb.rpc('virada_ciclo_gravar', { p_id: ciclo.id, p_versao: versao, p_registro: ciclo });
  if (error) {
    if (['40001', '23505'].includes(error.code)) throw new ErroVirada('Este ciclo mudou. Atualize os dados antes de continuar.', 409);
    throw error;
  }
}
function bytesFoto(base64: unknown) {
  if (typeof base64 !== 'string' || !base64.length || base64.length > Math.ceil(MAX_FOTO / 3) * 4 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new ErroVirada('Foto inválida ou acima de 6 MiB.');
  let binary: string;
  try { binary = atob(base64); } catch { throw new ErroVirada('Foto inválida.'); }
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);
  try {
    if (!SECRET) return json({ erro: 'Acesso não configurado no servidor.' }, 503);
    const token = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
    const sessao = token ? await verificarJwt(token, SECRET) : null;
    if (!sessao?.sub || await crachaRevogado(sb, 'painel', sessao, true)) return json({ erro: 'Entre novamente para continuar.', semSessao: true }, 401);
    autorizarModulo(sessao);
    const b = await corpo(req);
    if (b.action === 'pessoas') {
      if (sessao.master !== true) throw new ErroVirada('Somente a direção pode configurar os participantes.', 403);
      return json({ ok: true, pessoas: await pessoasRH() });
    }
    if (!['listar', 'foto', 'documentoPdi', ...MUTACOES].includes(b.action)) throw new ErroVirada('Ação inválida.', 400);
    const [antes, identidade] = await Promise.all([cicloAtual(), identidadePresenca(sb, sessao.sub)]);
    if (identidade.indisponivel) throw new ErroVirada(identidade.motivo, 503);
    const ator = atorDoCiclo(antes, sessao, identidade);
    const resposta = (ciclo: any) => {
      const atual = atorDoCiclo(ciclo, sessao, identidade);
      return { ok: true, ciclo: apresentarCiclo(ciclo, atual), ator: atual, podeConfigurar: atual.direcao };
    };
    if (b.action === 'listar') return json(resposta(antes));
    if (b.action === 'foto') {
      if (!antes || b.idCiclo !== antes.id) throw new ErroVirada('Ciclo não encontrado.', 404);
      const a = arquivoAutorizado(antes, b, ator);
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(a.chave, 300);
      if (error) throw error;
      return json({ ok: true, url: data.signedUrl });
    }
    if (b.action === 'documentoPdi') {
      if (!antes || b.idCiclo !== antes.id) throw new ErroVirada('Ciclo não encontrado.', 404);
      const f = documentoPdiAutorizado(antes, b, ator);
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(f.chave, 300, { download: f.nome });
      if (error) throw error;
      return json({ ok: true, url: data.signedUrl, nome: f.nome });
    }
    if (b.action === 'anexarPdi') {
      if (!ator.direcao) throw new ErroVirada('Somente a direção pode publicar uma versão do PDI.', 403);
      if (!antes || b.idCiclo !== antes.id || b.versao !== antes.versao) throw new ErroVirada('Este ciclo mudou. Atualize os dados.', 409);
      if (!idValido(b.participanteId)) throw new ErroVirada('Participante inválido.');
      const bytes = bytesFoto(b.base64), tipo = validarPdf(b.nome, b.mime, bytes), arquivoId = crypto.randomUUID();
      const chave = `virada/${antes.id}/pdis/${b.participanteId}/${arquivoId}.pdf`;
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(x => x.toString(16).padStart(2, '0')).join('');
      const documento = { id: arquivoId, chave, ...tipo, sha256: hash };
      const ciclo = aplicarAcao(antes, b, sessao, identidade, { documento });
      const { error } = await sb.storage.from(BUCKET).upload(chave, bytes, { contentType: tipo.mime, upsert: false });
      if (error) throw error;
      try { await gravar(ciclo, antes.versao); }
      catch (error) {
        if (error instanceof ErroVirada && error.status === 409) {
          const cleanup = await sb.storage.from(BUCKET).remove([chave]).catch(() => ({ error: true }));
          if (cleanup.error) console.error('painel-virada: reconciliação de documento pendente');
        } else {
          try {
            const confirmado = await cicloAtual();
            if (confirmado?.id === antes.id && confirmado.participantes.some((p: any) => (p.documentos || []).some((f: any) => f.id === arquivoId && f.chave === chave))) return json(resposta(confirmado));
          } catch { /* Preservar arquivo privado diante de resultado incerto. */ }
        }
        throw error;
      }
      return json(resposta(ciclo));
    }
    // Confere versão/escopo antes de decodificar bytes ou fazer upload.
    if (b.action === 'anexar') {
      if (!antes || b.idCiclo !== antes.id || b.versao !== antes.versao) throw new ErroVirada('Este ciclo mudou. Atualize os dados.', 409);
      if (!idValido(b.missaoId) || !idValido(b.evidenciaId)) throw new ErroVirada('Identificador inválido.');
      const bytes = bytesFoto(b.base64), tipo = validarFoto(b.nome, b.mime, bytes), arquivoId = crypto.randomUUID();
      const chave = `virada/${antes.id}/${b.missaoId}/${arquivoId}.${tipo.ext}`;
      const arquivo = { id: arquivoId, chave, nome: tipo.nome, mime: tipo.mime, tamanho: tipo.tamanho };
      const ciclo = aplicarAcao(antes, b, sessao, identidade, { arquivo });
      const { error } = await sb.storage.from(BUCKET).upload(chave, bytes, { contentType: tipo.mime, upsert: false });
      if (error) throw error;
      try { await gravar(ciclo, antes.versao); }
      catch (error) {
        // Rejeição CAS é definitiva. Timeout pode ter acontecido DEPOIS do commit.
        if (error instanceof ErroVirada && error.status === 409) {
          const cleanup = await sb.storage.from(BUCKET).remove([chave]).catch(() => ({ error: true }));
          if (cleanup.error) console.error('painel-virada: remoção de upload órfão pendente');
        } else {
          try {
            const confirmado = await cicloAtual();
            const gravado = confirmado?.id === antes.id && confirmado.missoes.some((m: any) => m.evidencias.some((e: any) => e.fotos.some((f: any) => f.id === arquivoId && f.chave === chave)));
            if (gravado) return json(resposta(confirmado));
          } catch { /* Resultado ambíguo: preservar bytes privados é obrigatório. */ }
          console.error('painel-virada: confirmação do upload pendente; arquivo privado preservado');
        }
        throw error;
      }
      return json(resposta(ciclo));
    }
    if (b.action === 'salvarCiclo' && !ator.direcao) throw new ErroVirada('Somente a direção configura o programa.', 403);
    const contexto = b.action === 'salvarCiclo' ? { pessoas: await pessoasRH() } : {};
    const ciclo = aplicarAcao(antes, b, sessao, identidade, contexto);
    await gravar(ciclo, antes?.versao || 0);
    return json(resposta(ciclo));
  } catch (error) {
    if (error instanceof ErroVirada) return json({ erro: error.message, ...(error.status === 401 ? { semSessao: true } : {}) }, error.status);
    console.error('painel-virada: operação não concluída', (error as any)?.code || (error as Error)?.name || 'erro');
    return json({ erro: 'Não foi possível concluir. Atualize os dados e tente novamente.' }, 500);
  }
});
