/* A COLETORA DO MARKETING: puxa os números de cada fonte (site, Google,
 * Meta, Google Ads, LinkedIn, Pinterest) e grava para a tela.
 *
 * Contrato: docs/marketing/integracoes-contrato.md, seção 4.
 *
 * QUEM CHAMA: o pg_cron (um job por fonte, todo dia de manhã) e a
 * painel-marketing (botão "Atualizar agora"). Os dois com o x-token, o
 * mesmo PAINEL_TOKEN da painel-backup. Não há crachá de gente aqui: quem
 * decide se a pessoa pode pedir a coleta é a painel-marketing, antes de
 * chamar.
 *
 * O QUE ACONTECE NUMA EXECUÇÃO:
 *  1. marca no diário que a fonte está "andando" e recusa a segunda
 *     execução da mesma fonte enquanto a primeira não terminou (o Pinterest
 *     troca o refresh token a cada renovação, e duas renovações ao mesmo
 *     tempo podem deixar guardado o token que já morreu). A marca e a
 *     conferência são UM passo no banco (painel_mkt_coleta_anotar): ler o
 *     diário daqui e gravar depois deixava duas coletas começarem juntas;
 *  2. nas fontes por OAuth, lê a conexão do cofre e renova o token antes,
 *     para o conector já receber um que vale. A conexão renovada é guardada
 *     NA HORA, antes do conector rodar;
 *  3. roda o conector com orçamento de 110 s (a Edge Function morre em 150 s;
 *     sobra tempo para gravar);
 *  4. grava: a conexão que o conector mudou (se mudou), depois os números da
 *     semana e as publicações (RPCs), o retrato da tela (painel_cache,
 *     juntando parte por parte com o anterior) e o diário.
 *
 * A CONEXÃO NUNCA É GRAVADA DE CIMA: a coleta leva até 110 s, e no meio dela
 * a gestão pode Desconectar ou Reconectar. Toda gravação daqui é condicional
 * (painel_mkt_conexao_regravar): só grava se o cofre ainda tem a conexão que
 * a coletora leu. Se mudou, a cópia da coleta é descartada; sem isso, um
 * Desconectar feito no meio era desfeito no fim (e no LinkedIn e no
 * Pinterest, que não revogam por API, com o token valendo).
 *
 * NENHUM SEGREDO SAI DAQUI: tudo que vai para o cache, para o diário ou para
 * a resposta passa pelo limparSegredos, que esconde o valor de qualquer
 * secret e de qualquer token da conexão, e os formatos conhecidos de
 * credencial.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { CONECTORES } from '../_shared/mkt-fontes/registro.mjs';
import {
  ORCAMENTO_MS, TEMPO_CHAMADA_MS, criarBuscador, regraDeHosts, comOrcamento, normalizarResultado, juntarRetrato,
  prepararSemanas, prepararPublicacoes, limparSegredos, segredosDosValores, envDoConector, extrasDoCtx, ErroFonte,
} from '../_shared/mkt-fontes/coletora.mjs';
import { FONTES, NOMES_FONTE, chaveDaFonte, nomeDeSecretValido } from '../_shared/mkt-fontes/info.mjs';
import { PROVEDORES, provedorConfigurado, precisaRenovar, renovar, tokenValido, avisosDaConexao, ErroOAuth } from '../_shared/mkt-oauth.mjs';
import { hojeSP, normalizarLink } from '../_shared/marketing.mjs';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const TOKEN = Deno.env.get('PAINEL_TOKEN') ?? '';
const json = (x: any, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const LIMITE_PEDIDO = 10_000;
// Retenção do LinkedIn (regra de guarda de dados deles, ver a pesquisa):
// número de relatório da Página por 1 ano. O texto de post (6 meses) não
// entra: a API do LinkedIn nunca manda título (o conector manda só link e
// data), então todo título numa publicação dele foi digitado por gente, e
// zerá-lo apagaria o que a equipe escreveu. Por isso o prazo do título vai
// nulo (a faxina deixa essa parte quieta).
const FAXINA_LINKEDIN = { canal: 'linkedin', diasNumeros: 365, diasTitulo: null };
// As RPCs recebem as publicações em lotes: o Pinterest pode trazer centenas
// de Pins, e um pedido gigante numa transação só segura a tabela.
const LOTE_PUBLICACOES = 500;
// Os segredos da casa e de todos os provedores. A faxina esconde o valor de
// cada um onde quer que apareça, mesmo que nenhum conector o tenha pedido.
// O ID do app OAuth fica de fora de propósito: ele não é segredo (vai na URL
// de autorização) e, sendo número, esconderia pedaços de IDs de Pin e de
// página que por acaso o contenham.
const SECRETS_CONHECIDOS = [
  'PAINEL_TOKEN', 'PAINEL_JWT_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY',
  'GOOGLE_API_KEY', 'META_TOKEN', 'META_APP_SECRET', 'GOOGLE_ADS_SA_JSON',
  ...Object.values(PROVEDORES).map((p: any) => p.secrets.segredo),
];
// Do que o conector lê pelo ctx.env, entra na faxina o que tem nome de
// segredo. ID de página ou de conta (META_PAGE_ID) não: escondê-lo
// apagaria o link da página na tela.
const NOME_DE_SEGREDO = /TOKEN|SECRET|KEY|JSON|SENHA|PASSWORD|CREDENC/;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
const objeto = (x: any) => !!x && typeof x === 'object' && !Array.isArray(x);

async function lerCache(chave: string) {
  const { data, error } = await sb.from('painel_cache').select('valor').eq('chave', chave).maybeSingle();
  if (error) throw error;
  return data?.valor ?? null;
}
async function gravarCache(chave: string, valor: any) {
  const { error } = await sb.from('painel_cache').upsert({ chave, valor, atualizado_em: new Date().toISOString() }, { onConflict: 'chave' });
  if (error) throw error;
}
/* A chamada fica escrita inteira em cada lugar, `rpc(sb.rpc('painel_mkt_...'))`,
   como na painel-marketing: é assim que o scripts/conferir-papel.mjs enxerga
   quais funções do banco esta porta chama. */
async function rpc(chamada: PromiseLike<any>) {
  const { data, error } = await chamada;
  if (error) throw error;
  return data;
}

/* O diário é gravado PELO BANCO, num passo só e sob trava
   (painel_mkt_coleta_anotar): as seis fontes escrevem na mesma linha, e o
   "lê, junta e grava" feito daqui perdia a execução de quem terminou junto.
   Com `exclusiva`, a mesma chamada recusa a execução se outra da mesma fonte
   está andando, e devolve o diário (para a conta das chamadas do dia). Só a
   entrada desta execução passa pela faxina de segredos: o resto do diário
   já passou quando foi escrito. Falha do banco aqui não derruba a coleta
   (devolve null): melhor coletar que travar. */
async function anotar(entrada: any, segredos: string[], exclusiva = false) {
  try {
    return await rpc(sb.rpc('painel_mkt_coleta_anotar', { p_entrada: limparSegredos(entrada, segredos), p_exclusiva: exclusiva }));
  } catch (e) {
    console.error('painel-mkt-fontes: diário', (e as any)?.code ?? '');
    return null;
  }
}

// Só o código curto: mensagem de erro do banco ou do provedor não vai para
// o diário como está.
function descrever(e: any) {
  if (e instanceof ErroFonte || e instanceof ErroOAuth) return e.message;
  if (e?.code && typeof e.code === 'string') return `banco: ${e.code}`;
  return 'falha inesperada';
}

const QUEM = /^[A-Za-z0-9._@-]{1,80}$/;

// As linhas que o banco recusou, contadas por motivo (códigos curtos da
// migração: canal_inexistente, semana_aberta, numero_invalido...).
function porMotivo(ignoradas: any[]) {
  const conta = new Map<string, number>();
  for (const x of ignoradas) { const m = objeto(x) && typeof x.motivo === 'string' ? x.motivo.slice(0, 40) : 'outro'; conta.set(m, (conta.get(m) || 0) + 1); }
  return conta.size ? ` (${[...conta].map(([m, n]) => `${m}: ${n}`).join(', ')})` : '';
}
// Canal que não existe (ou foi desativado) é o único motivo que pede gente:
// os outros são do conector, e vão só para o diário.
function avisarSemCanal(ignoradas: any[], avisos: string[]) {
  const codigos = [...new Set(ignoradas.filter((x: any) => objeto(x) && x.motivo === 'canal_inexistente' && typeof x.canal === 'string').map((x: any) => x.canal.slice(0, 30)))].slice(0, 5);
  const texto = codigos.length ? `Há números sem canal para guardar: crie ou reative o canal com o código ${codigos.join(', ')}.` : null;
  if (texto && !avisos.includes(texto)) avisos.push(texto);
}

async function coletar(fonte: string, quem: string | null) {
  const conector: any = (CONECTORES as any)[fonte];
  const inicio = new Date();
  const id = crypto.randomUUID();
  const lidos: string[] = [];
  const lembrar = (v: any) => { if (typeof v === 'string' && v.length >= 8) lidos.push(v); };
  for (const n of SECRETS_CONHECIDOS) lembrar(Deno.env.get(n));
  const segredos = () => segredosDosValores(lidos);
  const pQuem = quem ? `${quem} (coleta ${fonte})` : `coleta ${fonte}`;
  let chamadas = 0;
  const linhasLog: string[] = [];
  const log = (t: any) => { if (linhasLog.length < 60) linhasLog.push(String(t ?? '').slice(0, 300)); };
  const erros: string[] = [];
  // Os secrets que FALTAM no começo desta execução (só os NOMES, nunca o
  // valor), anotados no retrato: é por eles que a porta da tela sabe que um
  // retrato "falta_configurar" é de antes de o Léo cadastrar o secret
  // (fonteParaTela), em vez de mostrar a falta até a coleta seguinte. Os do
  // app OAuth entram junto: sem eles a coleta nem passa da porta.
  const pApp = (PROVEDORES as any)[fonte];
  const declarados = (lista: any) => (Array.isArray(lista) ? lista.filter(nomeDeSecretValido) : []);
  const faltavam = [...new Set([...declarados(conector?.SECRETS), ...(pApp ? [pApp.secrets.id, pApp.secrets.segredo] : [])])].filter((n) => !Deno.env.get(n));
  const opcionaisFaltavam = declarados(conector?.SECRETS_OPCIONAIS).filter((n: string) => !Deno.env.get(n));

  // 1. Uma execução por fonte de cada vez, decidido no banco num passo só
  // (anotar com exclusiva). O diário que volta dá a conta das chamadas do
  // dia (extrasDoCtx). Sem diário (o banco não respondeu), segue.
  const comeco = await anotar({ id, fonte, inicio: inicio.toISOString(), fim: null, estado: 'andando', chamadas: 0, quem: quem || 'cron' }, segredos(), true);
  if (comeco?.andando === true) return { fonte, andando: true };
  const diarioAntes: any = objeto(comeco?.diario) ? comeco.diario : null;

  const fim = inicio.getTime() + ORCAMENTO_MS;
  const prazo = () => Math.max(0, fim - Date.now());
  const parar = new AbortController();
  const envBruto = (n: string) => Deno.env.get(n);
  // fetch das renovações de token: com tempo, contado no diário, e sem
  // seguir redirecionamento (o corpo leva o refresh token e a chave secreta
  // do app; um 3xx vira recusa, e não um segundo destino recebendo os dois).
  const fetchContado = (url: string, init: any) => { chamadas++; return fetch(url, { ...init, redirect: 'manual', signal: AbortSignal.timeout(Math.max(1, Math.min(TEMPO_CHAMADA_MS, prazo()))) }); };

  const avisosCasa: string[] = [];
  let resultado: any = null;
  const pular = (estado: string, aviso: string) => { resultado = normalizarResultado({ estado, partes: {}, dados: {}, avisos: [aviso] }); };
  const nome = NOMES_FONTE[fonte as keyof typeof NOMES_FONTE] || fonte;

  // A conexão OAuth, em três estados: a que o conector usa, a que a coletora
  // SABE que está no cofre (é contra ela que a gravação confere) e a nova
  // que ainda falta guardar.
  let conexao: any = null;
  let noCofre: any = null;
  let pendente: any = null;
  let conexaoMudou = false;
  const identidade = (c: any) => ({ access_token: c?.access_token ?? null, refresh_token: c?.refresh_token ?? null, conectado_em: c?.conectado_em ?? null });
  const paraCofre = (c: any) => {
    const valor: any = { escopos: Array.isArray(c.escopos) ? c.escopos : [], conectado_por: c.conectado_por ?? null, conectado_em: c.conectado_em ?? null };
    for (const k of ['access_token', 'refresh_token', 'expira_em', 'refresh_expira_em', 'conta']) if (c[k] != null) valor[k] = c[k];
    return valor;
  };
  /* Guarda a conexão pendente SÓ se o cofre ainda tem a que a coletora leu
     (painel_mkt_conexao_regravar). "mudou": alguém desconectou ou reconectou
     no meio; a cópia da coleta é descartada, e vale o que a pessoa fez. */
  const guardarConexao = async (): Promise<string | null> => {
    if (!pendente || !noCofre) return null;
    const valor = paraCofre(pendente);
    try {
      const r = await rpc(sb.rpc('painel_mkt_conexao_regravar', { p_fonte: fonte, p_esperado: identidade(noCofre), p_valor: valor }));
      if (r === 'gravada') { noCofre = valor; pendente = null; return 'gravada'; }
      pendente = null;
      conexaoMudou = true;
      log('a conexão mudou no cofre durante a coleta; a cópia da coleta foi descartada');
      return 'mudou';
    } catch (e) {
      erros.push(`conexão não gravada (${descrever(e)})`);
      return 'falhou';
    }
  };
  const avisoMudou = (p: any) => `A conexão com o ${p.nome} mudou durante a coleta (alguém conectou ou desconectou). A próxima coleta usa a de agora.`;

  try {
    const { data: canaisLidos, error: eCanais } = await sb.from('painel_mkt_canais').select('codigo,nome,url_perfil').eq('ativo', true);
    if (eCanais) throw eCanais;
    const canais = (canaisLidos || []).map((c: any) => ({ codigo: c.codigo, nome: c.nome, url_perfil: c.url_perfil ?? null }));

    // 2. A conexão das fontes por OAuth.
    const p = (PROVEDORES as any)[fonte];
    if (p) {
      if (!provedorConfigurado(fonte, envBruto)) {
        pular('falta_configurar', `Falta cadastrar o ID e a chave secreta do app do ${p.nome} (${p.secrets.id} e ${p.secrets.segredo}) nos Secrets do Supabase.`);
      } else {
        let salva: any = null;
        try {
          salva = await rpc(sb.rpc('painel_mkt_conexao_ler', { p_fonte: fonte }));
        } catch (e) {
          // XX001: a conexão guardada está ilegível no cofre (a migração não
          // repete o conteúdo, que é o token). Conectar de novo grava por cima.
          if ((e as any)?.code !== 'XX001') throw e;
          erros.push(descrever(e));
          pular('reconectar', `A conexão guardada com o ${p.nome} ficou ilegível. Clique em Reconectar.`);
        }
        if (resultado) { /* já decidido acima */ } else if (!objeto(salva)) {
          pular('falta_conectar', `O ${p.nome} ainda não foi conectado. Clique em Conectar em Configurações, Marketing.`);
        } else {
          lembrar(salva.access_token); lembrar(salva.refresh_token);
          conexao = salva;
          noCofre = salva;
          if (precisaRenovar(fonte, salva, Date.now())) {
            if (!salva.refresh_token) {
              if (!tokenValido(salva, Date.now())) pular('reconectar', `A conexão com o ${p.nome} venceu. Clique em Reconectar.`);
            } else {
              try {
                conexao = await renovar(fonte, salva, envBruto, fetchContado, { agora: Date.now() });
                lembrar(conexao.access_token); lembrar(conexao.refresh_token);
                log(`token renovado; refresh ${conexao.refresh_token !== salva.refresh_token ? 'novo' : 'o mesmo'}`);
                // Guardada já, antes do conector: é a mais cara de perder (o
                // Pinterest matou o refresh de antes) e, se a conexão mudou
                // no cofre enquanto renovava, o conector nem roda: a conta
                // pode ser outra, ou ter sido desligada de propósito.
                pendente = conexao;
                if (await guardarConexao() === 'mudou') pular('parcial', avisoMudou(p));
              } catch (e) {
                const codigo = (e as any)?.codigo;
                log(`renovação: ${descrever(e)}`);
                if (codigo === 'reconectar') pular('reconectar', `O ${p.nome} recusou a conexão guardada. Clique em Reconectar.`);
                else if (codigo === 'credencial_recusada') pular('erro', `O ${p.nome} recusou o ID ou a chave secreta do app. Confira os Secrets do Supabase.`);
                else if (tokenValido(salva, Date.now())) avisosCasa.push(`Não deu para renovar a conexão com o ${p.nome} agora; a coleta usou a de antes.`);
                else pular('erro', `Não deu para renovar a conexão com o ${p.nome} agora. A próxima coleta tenta de novo.`);
              }
            }
          }
          if (!resultado) avisosCasa.push(...avisosDaConexao(fonte, conexao, Date.now()));
        }
      }
    }

    // 3. O conector, com orçamento.
    if (!resultado) {
      const buscador = criarBuscador({ fetch, regra: regraDeHosts(fonte, canais), prazo, sinal: parar.signal, contar: () => { chamadas++; } });
      // Os opcionais (ver extrasDoCtx): o retrato guardado desta fonte e, para
      // o google, o do site. Leitura que falha só deixa o opcional vazio.
      const [anteriorCache, siteCache] = await Promise.all([
        lerCache(chaveDaFonte(fonte)).catch(() => null),
        fonte === 'google' ? lerCache(chaveDaFonte('site')).catch(() => null) : Promise.resolve(null),
      ]);
      const ctx = {
        ...extrasDoCtx(fonte, { anterior: anteriorCache, diario: diarioAntes, site: siteCache, agora: inicio.getTime() }),
        fonte,
        env: envDoConector(envBruto, conector.SECRETS, (v: string, n: string) => { if (NOME_DE_SEGREDO.test(n)) lembrar(v); }),
        conexao: conexao ? { ...conexao } : null,
        fetchJson: buscador.fetchJson,
        fetchTexto: buscador.fetchTexto,
        fetch: buscador.fetch,
        prazo,
        hoje: hojeSP(),
        canais,
        log,
      };
      const r = await comOrcamento(() => conector.coletar(ctx), prazo(), () => parar.abort());
      if (r.estourou) {
        resultado = normalizarResultado({ estado: 'parcial', partes: {}, dados: {}, avisos: ['A coleta passou do tempo e parou no meio. O que já estava na tela continua.'] });
        erros.push('tempo esgotado');
      } else if ('erro' in r) {
        resultado = normalizarResultado({ estado: 'erro', partes: {}, dados: {}, avisos: [`A coleta do ${nome} falhou. O que já estava na tela continua.`] });
        erros.push(descrever(r.erro));
      } else {
        resultado = normalizarResultado(r.valor);
      }
    }
  } catch (e) {
    resultado = normalizarResultado({ estado: 'erro', partes: {}, dados: {}, avisos: [`A coleta do ${nome} falhou antes de começar. A próxima tenta de novo.`] });
    erros.push(descrever(e));
  }

  // 4. Gravação. Cada passo com o seu catch: um que falha não leva os outros.
  const p = (PROVEDORES as any)[fonte];
  if (p && noCofre && !conexaoMudou) {
    if (objeto(resultado.conexao)) {
      // O conector renovou por conta própria: o que ele devolveu é o que vale.
      const nova = resultado.conexao;
      if (typeof nova.access_token === 'string' && nova.access_token) {
        lembrar(nova.access_token); lembrar(nova.refresh_token);
        // Campo ausente ou nulo na conexão do conector não apaga o que existia
        // (o refresh token que nem toda renovação devolve).
        const base = { ...(pendente || conexao || {}) };
        for (const [k, v] of Object.entries(nova)) if (v !== undefined && v !== null) base[k] = v;
        pendente = base;
      }
    }
    const atual = pendente || conexao;
    if (resultado.conta && atual && atual.conta !== resultado.conta) pendente = { ...atual, conta: resultado.conta };
    const g = await guardarConexao();
    if (g === 'falhou') resultado.avisos.push(`A conexão renovada com o ${p.nome} não foi guardada. Se a próxima coleta pedir, clique em Reconectar.`);
    if (g === 'mudou') resultado.avisos.push(avisoMudou(p));
  }

  const semanas = prepararSemanas(resultado.semanas);
  if (semanas.descartadas) log(`${semanas.descartadas} semana(s) fora do formato ficaram de fora`);
  if (semanas.linhas.length) {
    try {
      const r = await rpc(sb.rpc('painel_mkt_api_metricas', { p_linhas: semanas.linhas, p_quem: pQuem }));
      const ignoradas = Array.isArray(r?.ignoradas) ? r.ignoradas : [];
      log(`semanas: ${r?.gravadas ?? '?'} gravada(s), ${r?.iguais ?? '?'} igual(is), ${ignoradas.length} ignorada(s)${porMotivo(ignoradas)}`);
      avisarSemCanal(ignoradas, resultado.avisos);
    } catch (e) {
      erros.push(`semanas não gravadas (${descrever(e)})`);
    }
  }

  const pubs = prepararPublicacoes(resultado.publicacoes, normalizarLink);
  if (pubs.descartadas) log(`${pubs.descartadas} publicação(ões) sem link ou data válida ficaram de fora`);
  for (let i = 0; i < pubs.linhas.length; i += LOTE_PUBLICACOES) {
    try {
      const r = await rpc(sb.rpc('painel_mkt_api_publicacoes', { p_linhas: pubs.linhas.slice(i, i + LOTE_PUBLICACOES), p_quem: pQuem }));
      const ignoradas = Array.isArray(r?.ignoradas) ? r.ignoradas : [];
      log(`publicações: ${r?.inseridas ?? '?'} nova(s), ${r?.atualizadas ?? '?'} atualizada(s), ${r?.iguais ?? '?'} igual(is), ${r?.retiradas ?? 0} retirada(s) antes, ${ignoradas.length} ignorada(s)${porMotivo(ignoradas)}`);
      avisarSemCanal(ignoradas, resultado.avisos);
    } catch (e) {
      erros.push(`publicações não gravadas (${descrever(e)})`);
      break;
    }
  }

  // A retenção do LinkedIn roda em toda execução dele, até na que falhou: o
  // prazo de guarda corre mesmo sem coleta nova. O canal pode vir do
  // conector (ele acha o canal pelo endereço); os prazos, nunca.
  if (fonte === 'linkedin') {
    try {
      const r = await rpc(sb.rpc('painel_mkt_api_faxina', { p_canal: resultado.faxina?.canal || FAXINA_LINKEDIN.canal, p_dias_numeros: FAXINA_LINKEDIN.diasNumeros, p_dias_titulo: FAXINA_LINKEDIN.diasTitulo }));
      // A faxina apaga dado: o diário guarda quanto, para alguém conferir.
      log(r?.ignorada ? `faxina: ${String(r.ignorada).slice(0, 40)}` : `faxina: ${r?.numeros_apagados ?? '?'} semana(s) e ${r?.publicacoes_limpas ?? '?'} publicação(ões) sem os números do LinkedIn, ${r?.titulos_zerados ?? '?'} título(s) zerado(s)`);
    } catch (e) {
      erros.push(`faxina do LinkedIn (${descrever(e)})`);
    }
  }

  const agoraIso = new Date().toISOString();
  const novo = { ...resultado, avisos: [...avisosCasa, ...resultado.avisos].slice(0, 30) };
  try {
    const anterior = await lerCache(chaveDaFonte(fonte));
    const retrato: any = juntarRetrato(anterior, novo, agoraIso);
    retrato.chamadas = chamadas;
    // Os NOMES dos secrets que o conector declarou (nunca o valor): é por
    // eles que a porta da tela diz se a fonte está configurada. Os
    // opcionais também (só os nomes): a porta diz quais estão cadastrados.
    retrato.secrets = Array.isArray(conector?.SECRETS) ? conector.SECRETS.filter(nomeDeSecretValido) : [];
    retrato.secretsOpcionais = Array.isArray(conector?.SECRETS_OPCIONAIS) ? conector.SECRETS_OPCIONAIS.filter(nomeDeSecretValido) : [];
    retrato.faltavam = faltavam;
    retrato.opcionaisFaltavam = opcionaisFaltavam;
    // O COMEÇO desta execução (coletado_em é o fim). A tela compara a
    // conexão com ele: um Reconectar feito com a coleta andando é mais novo
    // que o token que ela usou, mesmo que ela grave depois.
    retrato.iniciado_em = inicio.toISOString();
    await gravarCache(chaveDaFonte(fonte), limparSegredos(retrato, segredos()));
  } catch (e) {
    erros.push(`retrato não gravado (${descrever(e)})`);
  }

  const entrada: any = { id, fonte, inicio: inicio.toISOString(), fim: new Date().toISOString(), estado: resultado.estado, chamadas, quem: quem || 'cron' };
  if (erros.length) entrada.erro = erros.join('; ').slice(0, 500);
  if (linhasLog.length) entrada.log = linhasLog.slice(-30);
  await anotar(entrada, segredos(), false);
  return limparSegredos({ fonte, estado: resultado.estado, chamadas, coletadoEm: agoraIso }, segredos());
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405);
  // Porta de máquina: só o pg_cron e a painel-marketing têm o token.
  if (!TOKEN || req.headers.get("x-token") !== TOKEN) return json({ erro: "nao autorizado" }, 401);
  const raw = await req.text();
  if (raw.length > LIMITE_PEDIDO) return json({ erro: 'pedido grande demais' }, 413);
  let b: any;
  try { b = JSON.parse(raw); } catch { return json({ erro: 'json invalido' }, 400); }
  if (!objeto(b)) return json({ erro: 'pedido invalido' }, 400);

  switch (b.action) {
    case "coletar": {
      const fonte = FONTES.includes(b.fonte) && (CONECTORES as any)[b.fonte] ? b.fonte : null;
      if (!fonte) return json({ erro: 'fonte invalida' }, 400);
      const quem = typeof b.quem === 'string' && QUEM.test(b.quem) ? b.quem : null;
      // A coleta continua depois da resposta (waitUntil): quem chamou pelo
      // botão espera no máximo `esperarMs` e relê depois; o cron espera tudo.
      const trabalho = coletar(fonte, quem).catch((e) => { console.error('painel-mkt-fontes', descrever(e)); return { fonte, estado: 'erro' }; });
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(trabalho);
      const esperar = Number.isInteger(b.esperarMs) ? Math.max(0, Math.min(b.esperarMs, ORCAMENTO_MS + 30_000)) : null;
      const r = esperar == null ? await trabalho : await Promise.race([trabalho, dormir(esperar).then(() => null)]);
      return json(r ? { ok: true, ...r } : { ok: true, fonte, andando: true });
    }
    default:
      return json({ erro: 'acao desconhecida' }, 400);
  }
});
