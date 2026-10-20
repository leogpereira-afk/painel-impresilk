import {handleCatalog,catalogRepository} from '../_shared/placas-catalogo.mjs';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { verificarJwt, crachaRevogado } from '../_shared/cripto.ts';
import { ACMError, currentACMSession, readACMIdentity } from '../_shared/acm-handler.mjs';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const jwtSecret = Deno.env.get('PAINEL_JWT_SECRET') || '';
const url = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const BODY_LIMIT=64000;
const sb = url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;

async function readBody(req: Request) {
  if (Number(req.headers.get('content-length') || 0) > BODY_LIMIT) throw new ACMError('SIZE', 'Solicitação muito grande.', 413);
  if (!req.body) throw new ACMError('REQUEST', 'Solicitação vazia.');
  const reader = req.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > BODY_LIMIT) { await reader.cancel(); throw new ACMError('SIZE', 'Solicitação muito grande.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const all = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(all)); } catch { throw new ACMError('JSON', 'JSON inválido.'); }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return response({ ok: false, code: 'METHOD', error: 'Use POST.' }, 405);
  if (!sb || !jwtSecret) return response({ ok: false, code: 'CONFIG', error: 'Cadastro compartilhado indisponível.' }, 503);
  try {
    const bearer = (req.headers.get('authorization') || '').match(/^Bearer\s+([^\s]+)$/i);
    if (bearer && bearer[1].length > 8192) throw new ACMError('SESSION', 'Sessão inválida.', 401);
    const session = bearer ? await verificarJwt(bearer[1], jwtSecret) : null;
    // verificarJwt accepts legacy payloads; this data endpoint explicitly requires expiry.
    if (!session || typeof session.exp !== 'number' || session.exp <= Date.now() / 1000 || typeof session.sub !== 'string' || !session.sub.trim()) throw new ACMError('SESSION', 'Sessão inválida ou expirada.', 401);
    if (await crachaRevogado(sb, 'painel', session, true)) throw new ACMError('SESSION', 'Sessão revogada ou indisponível.', 401);
    const identity = await readACMIdentity(sb, session.sub);
    if (identity?.ativo === false || identity?.trocar_senha === true) throw new ACMError('SESSION', 'Atualize sua senha e entre novamente.', 401);
    if (session.master === true && !identity?.auth_user_id) {
      const own = await sb.from('painel_contas').select('usuario').eq('usuario', session.sub).maybeSingle();
      if (own.error) throw new ACMError('SESSION_CHECK', 'Não foi possível conferir sua sessão.', 503);
      if (!own.data) throw new ACMError('SESSION', 'Atualize sua senha antes de usar projetos.', 401);
    }
    let currentAccount = null;
    if (session.master !== true) {
      const account = await sb.from('painel_contas').select('usuario,permissoes').eq('usuario', session.sub).maybeSingle();
      if (account.error) throw new ACMError('SESSION_CHECK', 'Não foi possível conferir suas permissões atuais.', 503);
      currentAccount = account.data;
    }
    const currentSession = currentACMSession(session, currentAccount);
    const body = await readBody(req);
    return response(await handleCatalog(body, { session: currentSession, repo: catalogRepository(sb) }));
  } catch (error) {
    if (error instanceof ACMError) return response({ ok: false, code: error.code, error: error.message, ...(error.status === 401 ? { semSessao: true } : {}) }, error.status);
    // Never log request/project/provider contents, authorization headers, or credentials.
    return response({ ok: false, code: 'UNAVAILABLE', error: 'Não foi possível concluir. Os campos da tela foram preservados.' }, 503);
  }
});
