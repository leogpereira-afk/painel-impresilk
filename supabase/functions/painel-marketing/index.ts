/* PORTA DO CENTRO DE COMANDO DO MARKETING.
 *
 * Etapa a1 (10/10/2026): as ações do Marketing e a trava de orçamento saem da
 * coleção genérica e passam a morar nas tabelas painel_mkt_* (ver
 * supabase/migrations/20261010a_marketing_base.sql). A tela nunca fala com o
 * banco: tudo passa aqui, com crachá e módulo conferidos no topo.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { verificarJwt, crachaRevogado } from '../_shared/cripto.ts';
import { ErroMarketing, prepararAcao, idAcao, acaoParaTela, ehDirecaoMarketing, podeMarketing, erroDoBanco } from '../_shared/marketing.mjs';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const JWT_SECRET = Deno.env.get('PAINEL_JWT_SECRET') || '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (x: any, status = 200) => new Response(JSON.stringify(x), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const PASSO = 500;

/* Leitura paginada: o PostgREST corta em 1000 linhas sem avisar. */
async function todas(tabela: string, colunas: string, filtro: (q: any) => any, ordem: string) {
  const out: any[] = [];
  for (let pag = 0; pag < 200; pag++) {
    const { data, error } = await filtro(sb.from(tabela).select(colunas)).order(ordem).range(pag * PASSO, pag * PASSO + PASSO - 1);
    if (error) throw error;
    out.push(...(data || []));
    if ((data || []).length < PASSO) return out;
  }
  throw new Error('Limite de leitura atingido.');
}

/* Ações antigas (coleção "marketing", tipo "acao") que ainda não vieram
   para a tabela. Em 10/10/2026 eram zero; a conta existe para ninguém
   perder uma ação criada na tela velha antes da troca. */
async function pendentesDoLegado() {
  const antigas = await todas('painel_registros', 'id', (q) => q.eq('colecao', 'marketing').eq('registro->>tipo', 'acao'), 'id');
  if (!antigas.length) return 0;
  const migradas = await todas('painel_mkt_acoes', 'legado_id', (q) => q.not('legado_id', 'is', null), 'legado_id');
  const ja = new Set(migradas.map((m: any) => m.legado_id));
  return antigas.filter((a: any) => !ja.has(a.id)).length;
}

async function listarAcoes() {
  const linhas = await todas('painel_mkt_acoes', '*', (q) => q.is('retirada_em', null), 'id');
  const vinculos = await todas('painel_mkt_orcamento_vinculo', 'orcamento_id,acao_id', (q) => q, 'orcamento_id');
  const porAcao = new Map<string, string[]>();
  for (const v of vinculos) {
    const l = porAcao.get(v.acao_id) || [];
    l.push(v.orcamento_id);
    porAcao.set(v.acao_id, l);
  }
  return linhas.map((l: any) => acaoParaTela(l, porAcao.get(l.id) || []));
}

async function rpc(nome: string, params: any) {
  const { data, error } = await sb.rpc(nome, params);
  if (error) {
    const humano = erroDoBanco(error);
    if (humano) throw humano;
    throw error;
  }
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);
  try {
    if (!JWT_SECRET) return json({ erro: 'Acesso não configurado.' }, 503);
    const token = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
    const s = token ? await verificarJwt(token, JWT_SECRET) : null;
    if (!s || typeof s.sub !== 'string' || !s.sub || await crachaRevogado(sb, 'painel', s)) return json({ erro: 'Entre novamente.', semSessao: true }, 401);
    if (!podeMarketing(s)) return json({ erro: 'Sem acesso ao Marketing.' }, 403);
    const raw = await req.text();
    if (raw.length > 200000) return json({ erro: 'Pedido grande demais.' }, 413);
    let b: any;
    try { b = JSON.parse(raw); } catch { return json({ erro: 'Pedido inválido.' }, 400); }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ erro: 'Pedido inválido.' }, 400);
    const quem = s.sub;

    switch (b.action) {
      case "acoes": {
        const [acoes, pendentes] = await Promise.all([listarAcoes(), pendentesDoLegado()]);
        return json({ ok: true, acoes, legado: { pendentes }, podeMigrar: ehDirecaoMarketing(s) });
      }
      case "salvarAcao": {
        const { dados, orcamentos } = prepararAcao(b.acao);
        const id = b.acao?.id ? idAcao(b.acao.id) : null;
        // Ação NOVA chega com o id gerado na tela (novo: true) e sem versão:
        // repetir o pedido depois de uma resposta perdida devolve a mesma ação.
        const novo = b.novo === true;
        const versao = id && !novo ? Number(b.versao) : null;
        if (id && !novo && !Number.isInteger(versao)) return json({ erro: 'Versão da ação ausente. Recarregue a página.' }, 409);
        const linha = await rpc('painel_mkt_salvar_acao', { p_id: id, p_dados: dados, p_orcamentos: orcamentos, p_versao: versao, p_quem: quem });
        return json({ ok: true, acao: acaoParaTela(linha, linha.orcamentos || []) });
      }
      case "retirarAcao": {
        const id = idAcao(b.id);
        if (!Number.isInteger(b.versao)) return json({ erro: 'Versão da ação ausente. Recarregue a página.' }, 409);
        await rpc('painel_mkt_retirar_acao', { p_id: id, p_versao: b.versao, p_quem: quem });
        return json({ ok: true });
      }
      case "migrarLegado": {
        // Mexe no dado de todo mundo: só a direção, conferido aqui.
        if (!ehDirecaoMarketing(s)) return json({ erro: 'Só a direção traz as ações antigas.' }, 403);
        const resultado = await rpc('painel_mkt_migrar_legado', { p_quem: quem });
        return json({ ok: true, resultado });
      }
      default:
        return json({ erro: 'Ação inválida.' }, 400);
    }
  } catch (e) {
    if (e instanceof ErroMarketing) return json({ erro: e.message }, e.status);
    console.error('painel-marketing', e);
    return json({ erro: 'Não foi possível concluir. Tente novamente.' }, 500);
  }
});
