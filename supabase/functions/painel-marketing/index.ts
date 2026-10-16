import { atenderNewsletter } from '../_shared/newsletter-handler.mjs';
import { ErroNewsletter } from '../_shared/newsletter.mjs';
/* PORTA DO CENTRO DE COMANDO DO MARKETING.
 *
 * Etapa a1 (10/10/2026): as ações do Marketing e a trava de orçamento saem da
 * coleção genérica e passam a morar nas tabelas painel_mkt_* (ver
 * supabase/migrations/20261010a_marketing_base.sql). A tela nunca fala com o
 * banco: tudo passa aqui, com crachá e módulo conferidos no topo.
 *
 * Etapa a2 (11/10/2026): canais, playbook, publicações, números da semana e
 * papéis internos (20261011a_marketing_canais.sql; contrato em
 * docs/marketing/a2-contrato.md). O PAPEL dentro do Marketing é decidido
 * aqui, nunca pela tela:
 *  - direção (master ou "*") é sempre gestão;
 *  - os outros: o papel da pessoa em painel_mkt_papeis, achada pelo
 *    id_pessoa do login; sem linha (ou sem id_pessoa), marketing;
 *  - gestão mexe em canal, playbook e papéis; marketing e gestão lançam e
 *    concluem; visualização só olha.
 *
 * Integrações (11/10/2026, docs/marketing/integracoes-contrato.md, seção 6):
 * as fontes de dados (site, Google, Meta, Google Ads, LinkedIn, Pinterest).
 * Todos os papéis veem o retrato e o estado; só a gestão conecta, confirma a
 * conexão e desconecta; gestão e marketing pedem "Atualizar agora". Esta
 * porta nunca vê token: a conexão chega pela painel_mkt_conexao_info, que só
 * tem datas, conta e escopos; a confirmação move a pendente para o cofre
 * dentro do banco (painel_mkt_conexao_confirmar); e a coleta roda na
 * painel-mkt-fontes.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { verificarJwt, crachaRevogado } from '../_shared/cripto.ts';
import {
  ErroMarketing, prepararAcao, idAcao, idMarketing, acaoParaTela, ehDirecaoMarketing, podeMarketing, papelEfetivo,
  prepararCanal, canalParaTela, prepararItemPlaybook, itemParaTela, prepararConclusao, prepararPublicacao, prepararLinhaCsv,
  publicacaoParaTela, prepararMetricas, metricasParaTela, prepararPapel, papelParaTela, pessoasParaMarketing, padraoParaBanco,
  erroDoBanco, hojeSP, somarDias, segundaDaSemana, LIMITE_LINHAS_CSV,
} from '../_shared/marketing.mjs';
import { CANAIS_PADRAO, PLAYBOOK_PADRAO } from '../_shared/marketing-padrao.mjs';
import { idPessoaDoLogin, papelDaPessoa } from '../_shared/marketing-papel.mjs';
import { FONTES, CHAVE_DIARIO, TRAVA_COLETA_MS, chaveDaFonte, fonteParaTela, fonteValida } from '../_shared/mkt-fontes/info.mjs';
import {
  PROVEDORES, FONTES_OAUTH, VALIDADE_STATE_S, assinarState, novoNonce, gerarPkce, urlDeAutorizacao, provedorConfigurado, revogar,
  AVISO_DESCONECTAR_GOOGLE, MOTIVOS, nonceValido,
} from '../_shared/mkt-oauth.mjs';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const JWT_SECRET = Deno.env.get('PAINEL_JWT_SECRET') || '';
// O token de máquina que a coletora (painel-mkt-fontes) exige no x-token.
const PAINEL_TOKEN = Deno.env.get('PAINEL_TOKEN') || '';
const URL_COLETORA = `${Deno.env.get('SUPABASE_URL') || ''}/functions/v1/painel-mkt-fontes`;
// O botão "Atualizar agora" espera até 25 s; a coletora responde em até 22 s
// e continua sozinha depois (waitUntil). Passou disso, a tela relê depois.
const ESPERA_COLETORA_MS = 22_000;
const TEMPO_COLETORA_MS = 25_000;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (x: any, status = 200) => new Response(JSON.stringify(x), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const PASSO = 500;
// O maior pedido é a importação de CSV (até 2000 linhas com link e título).
const LIMITE_PEDIDO = 2_000_000;
// O que o "painel" devolve de números: o bastante para comparar períodos e
// montar o calendário, sem carregar o histórico inteiro a cada abertura.
const DIAS_PUBLICACOES = 400;
const SEMANAS_METRICAS = 26;

const SO_VER = 'Seu papel no Marketing é só de visualização.';
const SO_GESTAO = 'Só a gestão do Marketing mexe nisso.';
/* Quem grava. Visualização só olha; canal, playbook e papéis são da gestão. */
const podeGravar = (papel: string) => papel === 'gestao' || papel === 'marketing';
const ehGestao = (papel: string) => papel === 'gestao';

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

async function lerUm(tabela: string, id: string) {
  const { data, error } = await sb.from(tabela).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
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

/* O RH, como as Reuniões leem (registros, sem apagados). O CPF entra aqui só
   para virar id_pessoa em pessoasParaMarketing; não sai desta porta. */
async function lerRH(colecao: string, colunas: string) {
  const itens: any[] = [];
  for (let pag = 0; pag < 100; pag++) {
    const { data, error } = await sb.from('registros').select(colunas).eq('colecao', colecao).eq('apagado', false).order('id').range(pag * PASSO, pag * PASSO + PASSO - 1);
    if (error) throw error;
    itens.push(...(data || []));
    if ((data || []).length < PASSO) return itens;
  }
  throw new Error('Limite de leitura do RH atingido.');
}

async function pessoasMarketing() {
  const [colaboradores, status, areas, cargos] = await Promise.all([
    lerRH('colaboradores', 'id,nome:registro->>nome,cpf:registro->>cpf,areaId:registro->>areaId,cargoId:registro->>cargoId,statusId:registro->>statusId,dataDesligamento:registro->>dataDesligamento,ehDirecao:registro->>ehDirecao'),
    lerRH('status', 'id,contaComoAtivo:registro->>contaComoAtivo'),
    lerRH('areas', 'id,nome:registro->>nome'),
    lerRH('cargos', 'id,nome:registro->>nome'),
  ]);
  return pessoasParaMarketing(colaboradores, status, areas, cargos);
}

/* Um cliente SÓ DE LEITURA, em memória, com o formato das consultas do
   supabase-js que o idPessoaDoLogin faz (from, select, eq, in). Serve para
   rodar a regra de verdade (_shared/marketing-papel.mjs) sobre tabelas lidas
   uma vez, em vez de copiá-la aqui: uma regra copiada deixa de bater no
   primeiro conserto. Tabela que não foi lida, ou método que não está aqui,
   QUEBRA (o "pessoas" volta 500): cair em lista vazia diria "ninguém tem
   conta" calado, o dia em que a regra passar a ler outra coisa. */
function clienteDeLeitura(tabelas: Record<string, any[]>) {
  return {
    from(tabela: string) {
      if (!Object.prototype.hasOwnProperty.call(tabelas, tabela)) throw new Error(`clienteDeLeitura: tabela ${tabela} não foi lida`);
      let linhas = tabelas[tabela];
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => { linhas = linhas.filter((x) => x[k] === v); return q; },
        in: (k: string, vs: any[]) => { linhas = linhas.filter((x) => vs.includes(x[k])); return q; },
        then: (ok: any, erro: any) => Promise.resolve({ data: linhas.map((x) => ({ ...x })), error: null }).then(ok, erro),
      };
      return q;
    },
  };
}

/* QUEM TEM CONTA NO PAINEL, por id_pessoa. Conta do Painel é linha em
   painel_contas (a mesma régua da entrada única: sem ela não sai crachá do
   Painel), mais o login de quem está pedindo, que tem crachá do Painel na
   mão (cobre a direção sem linha própria). Cada login é resolvido pela MESMA
   regra que decide o papel (idPessoaDoLogin): a pessoa "tem conta" quando
   algum login do Painel cai nela, que é exatamente quando um papel dado a
   ela vale de verdade. */
async function idsComContaPainel(loginDeQuemPede: string) {
  const [contasPainel, acessoConta, acessoPapel] = await Promise.all([
    todas('painel_contas', 'usuario', (q) => q, 'usuario'),
    todas('acesso_conta', 'id,usuario,id_pessoa', (q) => q, 'id'),
    todas('acesso_papel', 'conta_id,sistema,login', (q) => q.eq('sistema', 'painel'), 'conta_id'),
  ]);
  const leitura = clienteDeLeitura({ acesso_conta: acessoConta, acesso_papel: acessoPapel });
  const logins = new Set([...contasPainel.map((c: any) => c.usuario), loginDeQuemPede].filter((l) => typeof l === 'string' && l));
  const ids = new Set<string>();
  for (const login of logins) {
    const id = await idPessoaDoLogin(leitura, login);
    if (id) ids.add(id);
  }
  return ids;
}

/* O banco responde; o erro dele vira mensagem para gente. A chamada fica
   escrita no ramo, `rpc(sb.rpc('painel_mkt_...'), ...)`, e não escondida
   aqui dentro: é assim que o scripts/conferir-papel.mjs enxerga que o ramo
   grava e cobra dele a conferência do papel. */
async function rpc(chamada: PromiseLike<any>, contexto: string) {
  const { data, error } = await chamada;
  if (error) {
    const humano = erroDoBanco(error, contexto);
    if (humano) throw humano;
    throw error;
  }
  return data;
}

const objeto = (x: any) => !!x && typeof x === 'object' && !Array.isArray(x);

/* AS FONTES PARA A TELA: o retrato que a coletora gravou no cache, a conexão
   sem token e se os secrets existem (só se existem, nunca o valor). Se a
   leitura das conexões falhar, as fontes saem assim mesmo, sem a conexão e
   com o aviso: a tela não fica em branco por causa do cofre. `leve`: cada
   fonte sai sem os "dados" (ver fonteParaTela). Lista vazia não vai ao
   banco. */
async function lerFontes(lista: string[], papel: string, { leve = false } = {}) {
  if (!lista.length) return { fontes: {} as Record<string, any>, avisos: [] as string[] };
  const chaves = [...lista.map(chaveDaFonte), CHAVE_DIARIO];
  const [{ data: linhas, error }, info] = await Promise.all([
    sb.from('painel_cache').select('chave,valor,atualizado_em').in('chave', chaves),
    sb.rpc('painel_mkt_conexao_info').then((r: any) => r, (e: any) => ({ error: e })),
  ]);
  if (error) throw error;
  const infoOk = !info?.error;
  if (!infoOk) console.error('painel-marketing: conexao_info', info.error?.code ?? '');
  const porChave = new Map((linhas || []).map((l: any) => [l.chave, l]));
  const diario = porChave.get(CHAVE_DIARIO)?.valor ?? null;
  const env = (n: string) => Deno.env.get(n);
  const agora = Date.now();
  const fontes: Record<string, any> = {};
  for (const f of lista) {
    const oauth = FONTES_OAUTH.includes(f);
    fontes[f] = fonteParaTela(f, {
      linha: porChave.get(chaveDaFonte(f)) ?? null,
      conexaoInfo: infoOk && objeto(info.data) ? info.data[f] ?? null : null,
      infoOk, diario, env, oauth, agora,
      // Dado pessoal (chave "restrito", ver tirarRestrito em info.mjs) só
      // para a gestão.
      verRestrito: ehGestao(papel),
      leve,
      secretsExtras: oauth ? [(PROVEDORES as any)[f].secrets.id, (PROVEDORES as any)[f].secrets.segredo] : [],
    });
  }
  return { fontes, avisos: infoOk ? [] : ['Não deu para ler as conexões agora. Recarregue em alguns minutos.'] };
}

const porOrdem = (a: any, b: any) => a.ordem - b.ordem || String(a.nome ?? a.titulo).localeCompare(String(b.nome ?? b.titulo), 'pt-BR');

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
    if (raw.length > LIMITE_PEDIDO) return json({ erro: 'Pedido grande demais.' }, 413);
    let b: any;
    try { b = JSON.parse(raw); } catch { return json({ erro: 'Pedido inválido.' }, 400); }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ erro: 'Pedido inválido.' }, 400);
    const quem = s.sub;

    // PAPEL EFETIVO. A direção é gestão sem consultar nada (o id_pessoa dela
    // só é buscado para devolver no "painel").
    const direcao = ehDirecaoMarketing(s);
    const idPessoaLogin = direcao && b.action !== 'painel' ? null : await idPessoaDoLogin(sb, quem);
    const papel = papelEfetivo(s, direcao || !idPessoaLogin ? null : await papelDaPessoa(sb, idPessoaLogin));

    if (typeof b.action === 'string' && b.action.startsWith('newsletter')) return json(await atenderNewsletter(sb, b, { papel, quem }));

    switch (b.action) {
      case "painel": {
        const hoje = hojeSP();
        const [acoes, pendentes, canais, playbook, publicacoes, metricas, papeis] = await Promise.all([
          listarAcoes(),
          pendentesDoLegado(),
          todas('painel_mkt_canais', '*', (q) => q, 'id'),
          todas('painel_mkt_playbook', '*', (q) => q, 'id'),
          todas('painel_mkt_publicacoes', '*', (q) => q.is('retirada_em', null).gte('data', somarDias(hoje, -DIAS_PUBLICACOES)), 'id'),
          todas('painel_mkt_metricas_canal', '*', (q) => q.gte('semana', somarDias(segundaDaSemana(hoje), -7 * (SEMANAS_METRICAS - 1))), 'id'),
          // A lista de papéis é da tela de Configurações, que só a gestão vê.
          papel === 'gestao' ? todas('painel_mkt_papeis', '*', (q) => q, 'id_pessoa') : Promise.resolve([] as any[]),
        ]);
        return json({
          ok: true, papel, idPessoa: idPessoaLogin, hoje,
          // O login não achou a pessoa (nenhuma conta, ou duas): o papel de
          // painel_mkt_papeis não alcança quem entrou, e vale o padrão
          // (marketing). A tela avisa, em vez de a pessoa achar que o papel
          // dela está valendo. A direção é gestão sem precisar da pessoa.
          semIdentidade: !direcao && !idPessoaLogin,
          canais: canais.map(canalParaTela).sort(porOrdem),
          playbook: playbook.map(itemParaTela).sort((x: any, y: any) => String(x.canalId).localeCompare(String(y.canalId)) || porOrdem(x, y)),
          acoes,
          publicacoes: publicacoes.map(publicacaoParaTela).sort((x: any, y: any) => y.data.localeCompare(x.data) || String(x.id).localeCompare(String(y.id))),
          metricas: metricas.map(metricasParaTela).sort((x: any, y: any) => y.semana.localeCompare(x.semana) || String(x.canalId).localeCompare(String(y.canalId))),
          papeis: papeis.map(papelParaTela),
          legado: { pendentes },
          podeMigrar: direcao,
        });
      }
      case "pessoas": {
        // Só id, nome e setor; o CPF fica no servidor.
        const r = await pessoasMarketing();
        // temContaPainel só para a gestão, que é quem dá papel (Configurações,
        // Marketing): é por ele que se vê que o papel de alguém não vai valer.
        // Para os outros papéis a chave nem vai: quem tem conta em qual
        // sistema é, por si só, um mapa de onde bater (a mesma régua da
        // painel-acesso, que nem lista isso fora da direção).
        if (ehGestao(papel)) {
          const comConta = await idsComContaPainel(quem);
          r.pessoas = r.pessoas.map((p: any) => ({ ...p, temContaPainel: comConta.has(p.idPessoa) }));
        }
        return json({ ok: true, ...r });
      }
      case "acoes": {
        const [acoes, pendentes] = await Promise.all([listarAcoes(), pendentesDoLegado()]);
        return json({ ok: true, acoes, legado: { pendentes }, podeMigrar: direcao });
      }
      case "salvarAcao": {
        if (!podeGravar(papel)) return json({ erro: SO_VER }, 403);
        const { dados, orcamentos } = prepararAcao(b.acao);
        const id = b.acao?.id ? idAcao(b.acao.id) : null;
        // Ação NOVA chega com o id gerado na tela (novo: true) e sem versão:
        // repetir o pedido depois de uma resposta perdida devolve a mesma ação.
        const novo = b.novo === true;
        const versao = id && !novo ? Number(b.versao) : null;
        if (id && !novo && !Number.isInteger(versao)) return json({ erro: 'Versão da ação ausente. Recarregue a página.' }, 409);
        const linha = await rpc(sb.rpc('painel_mkt_salvar_acao', { p_id: id, p_dados: dados, p_orcamentos: orcamentos, p_versao: versao, p_quem: quem }), 'acao');
        return json({ ok: true, acao: acaoParaTela(linha, linha.orcamentos || []) });
      }
      case "retirarAcao": {
        // Na a1 qualquer um com o módulo retirava; com papéis, visualização
        // não grava nada, nem retirar.
        if (!podeGravar(papel)) return json({ erro: SO_VER }, 403);
        const id = idAcao(b.id);
        if (!Number.isInteger(b.versao)) return json({ erro: 'Versão da ação ausente. Recarregue a página.' }, 409);
        await rpc(sb.rpc('painel_mkt_retirar_acao', { p_id: id, p_versao: b.versao, p_quem: quem }), 'acao');
        return json({ ok: true });
      }
      case "migrarLegado": {
        // Mexe no dado de todo mundo: só a direção, conferido aqui.
        if (!ehDirecaoMarketing(s)) return json({ erro: 'Só a direção traz as ações antigas.' }, 403);
        const resultado = await rpc(sb.rpc('painel_mkt_migrar_legado', { p_quem: quem }), 'acao');
        return json({ ok: true, resultado });
      }
      case "salvarCanal": {
        if (!ehGestao(papel)) return json({ erro: SO_GESTAO }, 403);
        if (!objeto(b.canal)) return json({ erro: 'Canal inválido.' }, 400);
        const id = b.canal.id ? idMarketing(b.canal.id, 'Canal inválido.') : null;
        const editar = !!id && b.novo !== true;
        let dados;
        if (editar) {
          if (!Number.isInteger(b.versao)) return json({ erro: 'Versão do canal ausente. Recarregue a página.' }, 409);
          // O canal vai inteiro para o banco: o que a tela não mandou vem do
          // que está gravado (mudar só a ordem não zera o resto).
          const atual = await lerUm('painel_mkt_canais', id);
          if (!atual) return json({ erro: 'Este canal não existe mais. Recarregue a página.' }, 404);
          dados = prepararCanal({ ...canalParaTela(atual), ...b.canal }, { novo: false, codigoAtual: atual.codigo });
        } else {
          dados = prepararCanal(b.canal, { novo: true });
        }
        const linha = await rpc(sb.rpc('painel_mkt_salvar_canal', { p_id: id, p_dados: dados, p_versao: editar ? b.versao : null, p_quem: quem }), 'canal');
        return json({ ok: true, canal: canalParaTela(linha) });
      }
      case "salvarPlaybook": {
        if (!ehGestao(papel)) return json({ erro: SO_GESTAO }, 403);
        if (!objeto(b.item)) return json({ erro: 'Item do playbook inválido.' }, 400);
        const id = b.item.id ? idMarketing(b.item.id, 'Item do playbook inválido.') : null;
        const editar = !!id && b.novo !== true;
        let dados;
        if (editar) {
          if (!Number.isInteger(b.versao)) return json({ erro: 'Versão do item ausente. Recarregue a página.' }, 409);
          const atual = await lerUm('painel_mkt_playbook', id);
          if (!atual) return json({ erro: 'Este item do playbook não existe mais. Recarregue a página.' }, 404);
          dados = prepararItemPlaybook({ ...itemParaTela(atual), ...b.item });
        } else {
          dados = prepararItemPlaybook(b.item);
        }
        const linha = await rpc(sb.rpc('painel_mkt_salvar_playbook', { p_id: id, p_dados: dados, p_versao: editar ? b.versao : null, p_quem: quem }), 'playbook');
        return json({ ok: true, item: itemParaTela(linha) });
      }
      case "retirarPlaybook": {
        if (!ehGestao(papel)) return json({ erro: SO_GESTAO }, 403);
        const id = idMarketing(b.id, 'Item do playbook inválido.');
        if (!Number.isInteger(b.versao)) return json({ erro: 'Versão do item ausente. Recarregue a página.' }, 409);
        await rpc(sb.rpc('painel_mkt_retirar_playbook', { p_id: id, p_versao: b.versao, p_quem: quem }), 'playbook');
        return json({ ok: true });
      }
      case "concluirPlaybook": {
        if (!podeGravar(papel)) return json({ erro: SO_VER }, 403);
        const id = idMarketing(b.id, 'Item do playbook inválido.');
        if (!Number.isInteger(b.versao)) return json({ erro: 'Versão do item ausente. Recarregue a página.' }, 409);
        // A evidência que o item pede (link, texto) depende do item gravado,
        // não do que a tela acha que ele pede.
        const atual = await lerUm('painel_mkt_playbook', id);
        if (!atual || atual.ativo === false) return json({ erro: 'Este item do playbook não existe mais. Recarregue a página.' }, 404);
        const evidencia = prepararConclusao(atual, { feito: b.feito, evidencia: b.evidencia });
        const linha = await rpc(sb.rpc('painel_mkt_concluir_playbook', { p_id: id, p_versao: b.versao, p_feito: b.feito, p_evidencia: evidencia, p_quem: quem }), 'playbook');
        return json({ ok: true, item: itemParaTela(linha) });
      }
      case "salvarPublicacao": {
        if (!podeGravar(papel)) return json({ erro: SO_VER }, 403);
        if (!objeto(b.publicacao)) return json({ erro: 'Publicação inválida.' }, 400);
        const id = b.publicacao.id ? idMarketing(b.publicacao.id, 'Publicação inválida.') : null;
        const editar = !!id && b.novo !== true;
        let dados;
        if (editar) {
          if (!Number.isInteger(b.versao)) return json({ erro: 'Versão da publicação ausente. Recarregue a página.' }, 409);
          const atual = await lerUm('painel_mkt_publicacoes', id);
          if (!atual || atual.retirada_em) return json({ erro: 'Esta publicação não existe mais. Recarregue a página.' }, 404);
          dados = prepararPublicacao({ ...publicacaoParaTela(atual), ...b.publicacao });
        } else {
          dados = prepararPublicacao(b.publicacao);
        }
        const linha = await rpc(sb.rpc('painel_mkt_salvar_publicacao', { p_id: id, p_dados: { ...dados, fonte: 'manual' }, p_versao: editar ? b.versao : null, p_quem: quem }), 'publicacao');
        return json({ ok: true, publicacao: publicacaoParaTela(linha) });
      }
      case "retirarPublicacao": {
        if (!podeGravar(papel)) return json({ erro: SO_VER }, 403);
        const id = idMarketing(b.id, 'Publicação inválida.');
        if (!Number.isInteger(b.versao)) return json({ erro: 'Versão da publicação ausente. Recarregue a página.' }, 409);
        await rpc(sb.rpc('painel_mkt_retirar_publicacao', { p_id: id, p_versao: b.versao, p_quem: quem }), 'publicacao');
        return json({ ok: true });
      }
      case "importarPublicacoes": {
        if (!podeGravar(papel)) return json({ erro: SO_VER }, 403);
        const linhas = b.linhas;
        if (!Array.isArray(linhas) || !linhas.length) return json({ erro: 'O arquivo não tem linhas para importar.' }, 422);
        if (linhas.length > LIMITE_LINHAS_CSV) return json({ erro: `Importe até ${LIMITE_LINHAS_CSV} linhas por vez.` }, 422);
        // LINHA RUIM NÃO DERRUBA O ARQUIVO: cada uma é conferida aqui e a
        // recusada volta com o motivo; as boas entram juntas, numa transação.
        const canais = new Set((await todas('painel_mkt_canais', 'id', (q) => q, 'id')).map((c: any) => c.id));
        const boas: any[] = [], recusadas: { linha: number; motivo: string }[] = [], vistos = new Map<string, number>();
        linhas.forEach((l: any, i: number) => {
          const linha = Number.isInteger(l?.linha) ? l.linha : i + 1;
          try {
            const d = prepararLinhaCsv(l);
            if (!canais.has(d.canal_id)) throw new ErroMarketing('Canal não encontrado. Confira o nome ou o código do canal.');
            if (d.url) {
              const chave = `${d.canal_id} ${d.url}`;
              if (vistos.has(chave)) throw new ErroMarketing(`Link repetido no arquivo (igual ao da linha ${vistos.get(chave)}).`);
              vistos.set(chave, linha);
            }
            boas.push({ ...d, linha });
          } catch (e) {
            if (!(e instanceof ErroMarketing)) throw e;
            recusadas.push({ linha, motivo: e.message });
          }
        });
        let r: any = { inseridas: 0, atualizadas: 0, iguais: 0, retiradas: [] };
        if (boas.length) r = await rpc(sb.rpc('painel_mkt_importar_publicacoes', { p_linhas: boas, p_quem: quem }), 'publicacao');
        for (const linha of r.retiradas || []) recusadas.push({ linha, motivo: 'Esta publicação foi retirada da lista antes; o link não volta pela importação. Para trazer de volta, lance o link à mão no canal.' });
        recusadas.sort((x, y) => x.linha - y.linha);
        return json({ ok: true, inseridas: r.inseridas, atualizadas: r.atualizadas, iguais: r.iguais, recusadas });
      }
      case "salvarMetricas": {
        if (!podeGravar(papel)) return json({ erro: SO_VER }, 403);
        const { canal, semana, dados } = prepararMetricas({ canalId: b.canalId, semana: b.semana, numeros: b.numeros });
        const linha = await rpc(sb.rpc('painel_mkt_salvar_metricas', { p_canal: canal, p_semana: semana, p_dados: { ...dados, fonte: 'manual' }, p_quem: quem }), 'metricas');
        return json({ ok: true, metricas: metricasParaTela(linha) });
      }
      case "definirPapel": {
        if (!ehGestao(papel)) return json({ erro: SO_GESTAO }, 403);
        const pedido = prepararPapel(b);
        await rpc(sb.rpc('painel_mkt_definir_papel', { p_id_pessoa: pedido.id_pessoa, p_papel: pedido.papel_escolhido, p_quem: quem }), 'papel');
        return json({ ok: true });
      }
      case "carregarPadrao": {
        if (!ehGestao(papel)) return json({ erro: SO_GESTAO }, 403);
        const padrao = padraoParaBanco(CANAIS_PADRAO, PLAYBOOK_PADRAO);
        const r = await rpc(sb.rpc('painel_mkt_carregar_padrao', { p_padrao: padrao, p_quem: quem }), 'canal');
        return json({ ok: true, canais: r.canais, itens: r.itens });
      }
      case "fontes": {
        // Todos os papéis do Marketing veem o retrato das fontes.
        // LEITURA LEVE E POR FONTE (11/10/2026). O "dados" de cada fonte é o
        // retrato inteiro (centenas de KB nas seis), e a faixa da Visão geral
        // e o bloco Conexões só precisam do estado:
        //  - {leve: true}: cada fonte sem "dados" (o resto igual);
        //  - {fontes: [...]}: só as pedidas, na ordem de FONTES (a sub-aba
        //    Dados pede só as do canal aberto). Fonte desconhecida é
        //    ignorada; o que não é lista vale como "não mandou".
        // Sem os dois, igual a antes: as seis, com os dados (a tela antiga e
        // o gerador da prévia pedem assim).
        const leve = b.leve === true;
        const pedidas = Array.isArray(b.fontes) ? FONTES.filter((f) => b.fontes.includes(f)) : [...FONTES];
        const r = await lerFontes(pedidas, papel, { leve });
        return json({ ok: true, papel, ordem: pedidas, fontes: r.fontes, avisos: r.avisos, motivos: MOTIVOS });
      }
      case "conectarInicio": {
        if (!ehGestao(papel)) return json({ erro: SO_GESTAO }, 403);
        const fonte = FONTES_OAUTH.includes(b.fonte) ? b.fonte : null;
        if (!fonte) return json({ erro: 'Esta fonte não se conecta por aqui.' }, 422);
        const env = (n: string) => Deno.env.get(n);
        if (!provedorConfigurado(fonte, env)) {
          const p = (PROVEDORES as any)[fonte];
          return json({ erro: `Falta cadastrar ${p.secrets.id} e ${p.secrets.segredo} nos Secrets do Supabase.`, faltaConfigurar: true }, 422);
        }
        // O state leva quem pediu, para qual fonte e o nonce deste clique,
        // assinado: a volta do provedor (painel-mkt-oauth) não tem crachá e
        // confia nele. E o pedido fica guardado no servidor (nonce, e o
        // verificador do PKCE quando o provedor usa): a volta o consome, e
        // o mesmo state não vale uma segunda vez. A volta não grava no
        // cofre: deixa a conexão pendente, que só entra pela
        // conectarConfirmar, com o crachá de quem clicou aqui. O clique novo
        // também derruba a pendente de um clique anterior desta fonte.
        const nonce = novoNonce();
        const pkce = (PROVEDORES as any)[fonte].pkce ? await gerarPkce() : null;
        await rpc(sb.rpc('painel_mkt_conexao_pedido', { p_nonce: nonce, p_fonte: fonte, p_quem: quem, p_verificador: pkce?.verificador ?? null, p_validade_s: VALIDADE_STATE_S }), 'fontes');
        const state = await assinarState({ fonte, quem, n: nonce }, JWT_SECRET);
        // O nonce volta também para a tela (ele já vai na URL, dentro do
        // state): guardado na aba que clicou, deixa a tela confirmar só a
        // volta que ELA pediu, e não um link de confirmação que alguém mande.
        return json({ ok: true, url: urlDeAutorizacao(fonte, state, env, { desafio: pkce?.desafio ?? null }), nonce });
      }
      case "conectarConfirmar": {
        // A volta do provedor deixou a conexão PENDENTE (painel-mkt-oauth): só
        // entra no cofre aqui, com o crachá de quem clicou em Conectar. A
        // gravação é pelo Vault, dentro do banco (painel_mkt_conexao_confirmar
        // chama a painel_mkt_conexao_gravar), e o scripts/conferir-papel.mjs
        // não enxerga gravação pelo Vault: a guarda do papel fica escrita
        // aqui, à mão, e não pode sair.
        if (!ehGestao(papel)) return json({ erro: SO_GESTAO }, 403);
        const fonte = FONTES_OAUTH.includes(b.fonte) ? b.fonte : null;
        if (!fonte) return json({ erro: 'Esta fonte não se conecta por aqui.' }, 422);
        // Nonce fora do formato não é pedido nenhum: nem vai ao banco.
        if (!nonceValido(b.nonce)) return json({ erro: MOTIVOS.pedido_vencido, motivo: 'pedido_vencido' }, 404);
        // Num passo só no banco: confere o nonce, a validade e se quem
        // confirma (o crachá, s.sub) é quem clicou; move para o cofre e apaga
        // a pendente. Uso único.
        const r = await rpc(sb.rpc('painel_mkt_conexao_confirmar', { p_fonte: fonte, p_nonce: b.nonce, p_quem: quem }), 'fontes');
        if (r?.ok !== true) {
          if (r?.motivo === 'outra_pessoa') return json({ erro: MOTIVOS.outra_pessoa, motivo: 'outra_pessoa' }, 403);
          return json({ erro: MOTIVOS.pedido_vencido, motivo: 'pedido_vencido' }, 404);
        }
        const f = await lerFontes([fonte], papel);
        return json({ ok: true, fonte: f.fontes[fonte] });
      }
      case "desconectar": {
        if (!ehGestao(papel)) return json({ erro: SO_GESTAO }, 403);
        const fonte = FONTES_OAUTH.includes(b.fonte) ? b.fonte : null;
        if (!fonte) return json({ erro: 'Esta fonte não se conecta por aqui.' }, 422);
        // No Google, revogar antes de apagar: sem isso o token continuaria
        // valendo na conta do Léo. A revogação vale para o projeto inteiro
        // (GA4, Search Console e Perfil caem juntos; a tela avisa antes).
        let revogado: boolean | null = null;
        if ((PROVEDORES as any)[fonte].urlRevogar) {
          // Conexão ilegível no cofre não pode trancar o Desconectar: sem
          // ela não há o que revogar, e apagar continua sendo o certo.
          let conexao: any = null;
          try { conexao = await rpc(sb.rpc('painel_mkt_conexao_ler', { p_fonte: fonte }), 'fontes'); } catch (e) { console.error('painel-marketing: conexao_ler', (e as any)?.code ?? ''); revogado = false; }
          // Sem seguir redirecionamento: o corpo leva o refresh token.
          if (objeto(conexao)) revogado = await revogar(fonte, conexao, (u: string, init: any) => fetch(u, { ...init, redirect: 'manual', signal: AbortSignal.timeout(10_000) }));
        }
        await rpc(sb.rpc('painel_mkt_conexao_apagar', { p_fonte: fonte }), 'fontes');
        // A GUARDA DO LINKEDIN ALCANÇA O RETRATO DO CACHE TAMBÉM. A faxina
        // (painel_mkt_api_faxina) cuida das tabelas e do log; o retrato que a
        // coletora guarda em painel_cache (posts com impressões, alcance,
        // engajamento e cliques, e o total desde sempre) não tem prazo: depois
        // do Desconectar, cada coleta diária pula com "falta conectar" sem
        // dado novo, a junção mantém os dados de antes, e a tela mostrava os
        // números da Página para sempre (segunda revisão, 11/10). Desconectar
        // é parar de usar a conta, e o relatório dela sai junto. Nas outras
        // fontes o último retrato fica, marcado "falta conectar": não há
        // regra de guarda que mande apagar.
        let avisoCache: string | null = null;
        if (fonte === 'linkedin') {
          const { error: eCache } = await sb.from('painel_cache').delete().eq('chave', chaveDaFonte(fonte));
          if (eCache) {
            console.error('painel-marketing: cache linkedin', eCache.code ?? '');
            avisoCache = 'A conexão saiu do Painel, mas os números antigos do LinkedIn não saíram da tela agora. Clique em Desconectar de novo.';
          }
        }
        return json({
          ok: true, revogado,
          // O retrato do LinkedIn não saiu do cache: a tela mantém o
          // Desconectar à vista (o aviso manda clicar de novo) e pinta o
          // aviso como atenção, e não como "deu certo".
          retratoFicou: avisoCache !== null,
          aviso: avisoCache ?? (revogado === false ? 'A conexão saiu do Painel, mas o Google não confirmou a revogação. Para garantir, tire o acesso do app na sua Conta Google (myaccount.google.com, na parte de segurança).' : fonte === 'google' ? AVISO_DESCONECTAR_GOOGLE : null),
        });
      }
      case "coletarAgora": {
        if (!podeGravar(papel)) return json({ erro: SO_VER }, 403);
        const fonte = fonteValida(b.fonte);
        if (!fonte) return json({ erro: 'Fonte inválida.' }, 422);
        if (!PAINEL_TOKEN) return json({ erro: 'A coleta ainda não está configurada no servidor.' }, 503);
        // TRAVA: um pedido por fonte a cada 2 minutos, para todo mundo. Fica
        // no banco (e não na memória da function, que não é uma só), e a
        // conferência e a marca são UM passo lá (painel_mkt_coleta_pedir):
        // ler aqui e gravar depois deixava cinco cliques juntos passarem
        // todos, gastando a cota do provedor (o LinkedIn dá 100 por dia).
        const trava = await rpc(sb.rpc('painel_mkt_coleta_pedir', { p_fonte: fonte, p_quem: quem, p_intervalo_s: Math.round(TRAVA_COLETA_MS / 1000) }), 'fontes');
        if (!trava?.ok) {
          const aguardar = Number.isInteger(trava?.aguardar_s) && trava.aguardar_s > 0 ? trava.aguardar_s : Math.round(TRAVA_COLETA_MS / 1000);
          return json({ erro: `Esta fonte foi atualizada há pouco. Tente de novo em ${aguardar} segundos.`, aguardarSegundos: aguardar }, 429);
        }
        let resposta: Response;
        try {
          resposta = await fetch(URL_COLETORA, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-token': PAINEL_TOKEN },
            body: JSON.stringify({ action: 'coletar', fonte, quem, esperarMs: ESPERA_COLETORA_MS }),
            signal: AbortSignal.timeout(TEMPO_COLETORA_MS),
          });
        } catch (e) {
          // Passou do tempo: a coleta segue no servidor; a tela relê depois.
          if ((e as any)?.name === 'TimeoutError' || (e as any)?.name === 'AbortError') return json({ ok: true, andando: true });
          console.error('painel-marketing: coletora', (e as any)?.name ?? '');
          return json({ erro: 'A coleta não respondeu. Tente de novo em alguns minutos.' }, 502);
        }
        // A resposta da coletora não vai para a tela como veio: só serve
        // para saber se terminou. O que a tela recebe é relido do cache.
        const corpo: any = await resposta.json().catch(() => null);
        if (!resposta.ok) {
          console.error('painel-marketing: coletora', resposta.status);
          return json({ erro: 'A coleta não respondeu. Tente de novo em alguns minutos.' }, 502);
        }
        if (corpo?.andando) return json({ ok: true, andando: true });
        const r = await lerFontes([fonte], papel);
        return json({ ok: true, andando: false, fonte: r.fontes[fonte] });
      }
      default:
        return json({ erro: 'Ação inválida.' }, 400);
    }
  } catch (e) {
    if (e instanceof ErroMarketing || e instanceof ErroNewsletter) return json({ erro: e.message }, e.status);
    console.error('painel-marketing', e);
    return json({ erro: 'Não foi possível concluir. Tente novamente.' }, 500);
  }
});
