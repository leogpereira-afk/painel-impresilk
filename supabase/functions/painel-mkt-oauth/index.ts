/* O RETORNO DO OAUTH DO MARKETING (Google, LinkedIn e Pinterest).
 *
 * Contrato: docs/marketing/integracoes-contrato.md, seção 3.
 *
 * PÚBLICA DE PROPÓSITO: quem chega aqui é o navegador do Léo voltando da
 * tela de permissão do provedor, e essa volta não traz crachá. O que prova
 * que o pedido saiu do Painel é o `state`: assinado pela painel-marketing
 * (com o PAINEL_JWT_SECRET) só para quem é da gestão do Marketing, com a
 * fonte e o login dentro, válido por 10 minutos. State que não confere não
 * troca code nenhum e não grava nada.
 *
 * E O STATE VALE UMA VEZ: o clique em Conectar guardou no servidor o nonce
 * dele (e o verificador do PKCE, quando o provedor usa). Aqui o nonce é
 * CONSUMIDO num passo só (painel_mkt_conexao_consumir) antes de qualquer
 * troca, inclusive quando o Léo cancelou: o mesmo state usado de novo cai em
 * state_invalido.
 *
 * MAS QUEM CHEGA PRIMEIRO COM A URL NÃO É, POR ISSO, QUEM CLICOU. O uso
 * único segura quem volta DEPOIS do Léo; quem pegou a URL da tela de
 * permissão (aba esquecida, histórico, link colado) e volta ANTES passava
 * com a própria conta, e o PKCE não impede, porque o desafio vai na mesma URL
 * (segunda revisão, 11/10). Esta function não tem crachá para saber quem é o
 * navegador. Então ela NÃO GRAVA NO COFRE: deixa a conexão PENDENTE
 * (painel_mkt_conexao_pendente, no Vault, amarrada ao nonce e ao login do
 * pedido, por 10 minutos) e manda a tela confirmar. Só a tela com o CRACHÁ de
 * quem clicou move a pendente para o cofre (conectarConfirmar, na
 * painel-marketing). Consentimento completado sem essa confirmação vence sem
 * nunca chegar à coleta.
 *
 * O QUE ELA FAZ: GET ?code&state (ou ?error&state) ->
 *   1. confere o state (assinatura, prazo, fonte) e consome o pedido
 *      guardado, que tem de ser da mesma fonte e do mesmo login;
 *   2. troca o code pelo token (com o verificador do PKCE, se houver);
 *   3. guarda a conexão como PENDENTE (painel_mkt_conexao_pendente), com
 *      conectado_por = o login que estava no state;
 *   4. responde 302 para a tela de Configurações, com
 *      r=ok&confirmar=<nonce>, ou r=erro&motivo=<código curto>.
 *
 * O Supabase não serve HTML (vira texto puro), por isso a resposta é sempre
 * um 302. O destino é FIXO (DESTINO_RETORNO): destino que viesse da URL
 * transformaria esta function num redirecionador aberto. Os motivos são os
 * códigos de MOTIVOS em _shared/mkt-oauth.mjs. Nunca vai para a URL, para o
 * log ou para a resposta um texto do provedor, o code ou um token.
 * Qualquer outra coisa: 400, com texto curto.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { conferirState, trocarCodigo, destinoDoRetorno, ErroOAuth, VALIDADE_STATE_S } from '../_shared/mkt-oauth.mjs';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const JWT_SECRET = Deno.env.get('PAINEL_JWT_SECRET') || '';
const TEMPO_TROCA_MS = 20_000;

const recusa = () => new Response('Pedido inválido.', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
// no-referrer: a URL desta volta tem o code na query, e ela não deve seguir
// como Referer para lugar nenhum.
const voltar = (fonte: string | null, motivo: string | null, confirmar: string | null = null) => new Response(null, {
  status: 302,
  headers: { Location: destinoDoRetorno(fonte, motivo, confirmar), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
});

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') return recusa();
  let url: URL;
  try { url = new URL(req.url); } catch { return recusa(); }
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const negado = url.searchParams.get('error');
  if (!state || (!code && !negado) || (code && negado)) return recusa();

  // 1. O state. Assinatura que não confere: não se sabe nem a fonte, e a
  // volta vai sem ela. Assinatura certa e prazo vencido (o Léo demorou mais
  // de 10 minutos na tela do provedor): a fonte é nossa, e vai junto, para a
  // tela dizer de qual conexão o pedido venceu.
  let fonte: string, quem: string, nonce: string;
  try {
    ({ fonte, quem, n: nonce } = await conferirState(state, JWT_SECRET, Date.now()));
  } catch (e) {
    console.error('painel-mkt-oauth: state', (e as any)?.detalhe ?? '');
    return voltar((e as any)?.fonte ?? null, 'state_invalido');
  }
  // O pedido guardado no clique, consumido aqui (vale uma vez). Mesmo na
  // volta com error: um state de pedido cancelado também não pode servir de
  // novo.
  const { data: pedido, error: ePedido } = await sb.rpc('painel_mkt_conexao_consumir', { p_nonce: nonce });
  if (ePedido) {
    console.error('painel-mkt-oauth: pedido', fonte, ePedido.code ?? '');
    return voltar(fonte, 'pedido_falhou');
  }
  if (!pedido || typeof pedido !== 'object' || pedido.fonte !== fonte || pedido.quem !== quem) {
    console.error('painel-mkt-oauth: state', 'usado_ou_desconhecido');
    return voltar(fonte, 'state_invalido');
  }
  const verificador = typeof pedido.verificador === 'string' ? pedido.verificador : null;
  // O Léo clicou em Cancelar (ou desmarcou tudo) na tela do provedor.
  if (negado) return voltar(fonte, 'negado');

  // 2. A troca do code.
  let conexao: any;
  try {
    // Sem seguir redirecionamento: o corpo leva o code e a chave secreta do
    // app, e um 3xx vira troca recusada em vez de um segundo destino.
    const comTempo = (u: string, init: any) => fetch(u, { ...init, redirect: 'manual', signal: AbortSignal.timeout(TEMPO_TROCA_MS) });
    conexao = await trocarCodigo(fonte, code!, (n: string) => Deno.env.get(n), comTempo, { agora: Date.now(), quem, verificador });
  } catch (e) {
    const codigo = e instanceof ErroOAuth ? e.codigo : '';
    const motivo = codigo === 'sem_refresh' || codigo === 'falta_configurar' ? codigo : 'troca_falhou';
    console.error('painel-mkt-oauth: troca', fonte, motivo, (e as any)?.status ?? '');
    return voltar(fonte, motivo);
  }

  // 3. PENDENTE, não o cofre: só o crachá de quem clicou a confirma (ver o
  // topo). A confirmação grava por cima da conexão antiga, sem revogar a
  // velha: no Google a revogação vale para o projeto inteiro e derrubaria
  // também o token que acabou de chegar (contraprova da pesquisa).
  const { error } = await sb.rpc('painel_mkt_conexao_pendente', { p_nonce: nonce, p_fonte: fonte, p_quem: quem, p_valor: conexao, p_validade_s: VALIDADE_STATE_S });
  if (error) {
    console.error('painel-mkt-oauth: pendente', fonte, error.code ?? '');
    return voltar(fonte, 'gravar_falhou');
  }
  return voltar(fonte, null, nonce);
});
