// Atalhos do Drive da aba Marketing. Moram no servidor (painel-config, chave
// "marketing", mapa {id: {nome, url}}) para valerem em qualquer aparelho.
//
// Adicionar usa "merge" e remover usa "removerId" -- os dois mexem em UMA
// linha por vez. Remover via get+set do mapa inteiro reabria a corrida:
// duas lixeiras clicadas rapido ressuscitavam o atalho da primeira.

import { comCracha, mensagemDoStatus } from "../lib/sessao.js";
import { API } from "../lib/api.js";
import { urlDeConexaoSegura } from "../lib/calc/marketing-fontes.js";

const BASE = `${API}/painel-config`;

async function chamar(action, corpo) {
  const resp = await comCracha(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...corpo }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(body?.erro || mensagemDoStatus(resp.status));
  return body;
}

export const lerAtalhos = () =>
  chamar("get", { chave: "marketing" }).then((r) => r.valor || {});

export const salvarAtalho = (id, { nome, url }) =>
  chamar("merge", { chave: "marketing", patch: { [id]: { nome, url } } });

export const removerAtalho = (id) =>
  chamar("removerId", { chave: "marketing", id });

// AÇÕES DO MARKETING (desde 10/10/2026): moram nas tabelas painel_mkt_* e
// passam pela Edge Function painel-marketing, que tem a trava "um orçamento
// numa ação só" no banco. Os atalhos acima continuam no painel-config.
//
// O erro leva junto o status HTTP e o que o servidor manda para a tela agir
// (integrações, 11/10/2026): `aguardarSegundos` na trava do "Atualizar
// agora" (429), `faltaConfigurar` no Conectar sem os secrets do app (422) e
// `motivo`, o CÓDIGO da recusa da confirmação da conexão (pedido_vencido,
// outra_pessoa), que a tela troca pelo texto do mapa MOTIVOS. Só passa o
// que tem cara de código: texto livre no lugar dele não chega à tela. A
// mensagem continua sendo a frase do servidor.
const CODIGO_DE_MOTIVO = /^[a-z][a-z0-9_]{0,59}$/;
async function chamarMarketing(action, corpo = {}) {
  const resp = await comCracha(`${API}/painel-marketing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...corpo }),
  });
  const body = await resp.json().catch(() => null);
  if (!resp.ok || !body?.ok) {
    const erro = new Error(body?.erro || mensagemDoStatus(resp.status));
    erro.status = resp.status;
    if (Number.isInteger(body?.aguardarSegundos) && body.aguardarSegundos > 0) erro.aguardarSegundos = body.aguardarSegundos;
    if (body?.faltaConfigurar === true) erro.faltaConfigurar = true;
    if (typeof body?.motivo === "string" && CODIGO_DE_MOTIVO.test(body.motivo)) erro.motivo = body.motivo;
    throw erro;
  }
  return body;
}

// A função de uma etapa anterior não conhece a ação nova e responde 400
// "Ação inválida.". Na janela em que a tela nova chega antes da função nova,
// diz isso para gente (o mesmo texto do lerPainelMarketing).
const SERVIDOR_ANTIGO = "O servidor do Marketing ainda está na versão anterior. Tente de novo em alguns minutos.";
function servidorAntigo(e) {
  if (e?.message === "Ação inválida.") throw Object.assign(new Error(SERVIDOR_ANTIGO), { status: e.status, servidorAntigo: true });
  throw e;
}

export const listarAcoesMarketing = () => chamarMarketing("acoes");
// Ação nova: a tela gera o id e manda novo:true. Se a resposta se perder e a
// pessoa tentar de novo, o servidor devolve a mesma ação em vez de criar outra.
export const salvarAcaoMarketing = (acao, versao, novo = false) =>
  chamarMarketing("salvarAcao", { acao, versao, novo }).then((r) => r.acao);
export const retirarAcaoMarketing = (id, versao) => chamarMarketing("retirarAcao", { id, versao });
export const migrarAcoesAntigasMarketing = () =>
  chamarMarketing("migrarLegado").then((r) => r.resultado);

// ETAPA A2 (11/10/2026): canais, playbook, publicações, números da semana e
// papéis. Uma função por ação da painel-marketing. O servidor decide o papel
// (gestão, marketing, visualização) e recusa o que não cabe; a tela só
// esconde o botão. As que salvam devolvem a linha no formato da tela (como
// salvarAcaoMarketing); as outras devolvem a resposta inteira.

// { papel, idPessoa, semIdentidade, hoje, canais, playbook, acoes,
//   publicacoes, metricas, papeis (só para a gestão), legado:{pendentes},
//   podeMigrar }. semIdentidade (11/10/2026): true quando o login não está
//   ligado a uma pessoa do RH; a função antiga não manda o campo.
// A função da a1 não conhece "painel" e responde 400 "Ação inválida.". Na
// janela em que a tela nova chega antes da função nova, diz isso para gente.
export const lerPainelMarketing = () => chamarMarketing("painel").catch(servidorAntigo);
// { pessoas:[{idPessoa, nome, area, temContaPainel}], semId }: o CPF nunca
// vem. temContaPainel (11/10/2026, só para a gestão): false quando a pessoa
// não tem conta no Painel (o papel dela só vale quando tiver).
export const listarPessoasMarketing = () => chamarMarketing("pessoas");

// Canal e item do playbook (só a gestão). Novo: mande o id gerado na tela e
// novo=true, sem versão; repetir o pedido devolve o mesmo, não cria outro.
// Na edição, pode mandar só o que mudou (ex.: {id, ordem}): o resto vem do
// que está gravado. O código do canal não muda depois de criado.
export const salvarCanal = (canal, versao, novo = false) =>
  chamarMarketing("salvarCanal", { canal, versao, novo }).then((r) => r.canal);
export const salvarPlaybook = (item, versao, novo = false) =>
  chamarMarketing("salvarPlaybook", { item, versao, novo }).then((r) => r.item);
export const retirarPlaybook = (id, versao) => chamarMarketing("retirarPlaybook", { id, versao });
// Marcar (feito=true) ou desmarcar um item único ou de implantação. Item que
// pede link ou texto exige a evidência.
export const concluirPlaybook = (id, versao, feito, evidencia) =>
  chamarMarketing("concluirPlaybook", { id, versao, feito, evidencia }).then((r) => r.item);

// Publicação lançada à mão (colando o link). Número vazio vai como null.
export const salvarPublicacao = (publicacao, versao, novo = false) =>
  chamarMarketing("salvarPublicacao", { publicacao, versao, novo }).then((r) => r.publicacao);
export const retirarPublicacao = (id, versao) => chamarMarketing("retirarPublicacao", { id, versao });
// Linhas de lerCsvPublicacoes (com `linha`, o número da linha no arquivo).
// Devolve { inseridas, atualizadas, iguais, recusadas:[{linha, motivo}] }.
export const importarPublicacoes = (linhas) => chamarMarketing("importarPublicacoes", { linhas });

// Números da semana (semana = segunda-feira, AAAA-MM-DD). Só os números
// mandados mudam; mandar null apaga aquele número.
export const salvarMetricas = (canalId, semana, numeros) =>
  chamarMarketing("salvarMetricas", { canalId, semana, numeros }).then((r) => r.metricas);

// Papel de uma pessoa (só a gestão). papel null volta ao padrão (marketing).
export const definirPapel = (idPessoa, papel) => chamarMarketing("definirPapel", { idPessoa, papel });
// Canais e playbook da especificação. Pode rodar de novo: não duplica nem
// sobrescreve. Devolve { canais, itens } (quantos entraram agora).
export const carregarPadrao = () => chamarMarketing("carregarPadrao");

// INTEGRAÇÕES (11/10/2026): as fontes de dados (site, Google, Meta, Google
// Ads, LinkedIn, Pinterest). Contrato em docs/marketing/integracoes-contrato.md,
// seção 6. A tela nunca vê token nem valor de secret: a conexão chega só com
// datas, conta e escopos, e "configurado" diz só se os secrets EXISTEM. As
// contas de estado, rótulo e número ficam em lib/calc/marketing-fontes.js.

// Todos os papéis. { papel, ordem: ['site', ...], fontes: { site: {fonte,
// nome, oauth, estado, conta, partes, dados, avisos, coletadoEm,
// ultimaBoaEm, configurado, opcionais, conexao, andando, ultimas}, ... },
// avisos, motivos }. Os `dados` de cada fonte seguem a seção FORMATO do
// conector (supabase/functions/_shared/mkt-fontes/<fonte>.mjs); dado pessoal
// (as chaves "restrito") só vem para a gestão. `opcionais` (11/10/2026):
// [{nome, cadastrado}] dos secrets opcionais, só o nome.
// LEITURA LEVE E POR FONTE (11/10/2026): { leve: true } traz cada fonte SEM
// a chave "dados" (o que a faixa da Visão geral e o bloco Conexões usam);
// { fontes: ['site', ...] } traz só as pedidas (a sub-aba Dados do canal).
// Sem os dois, o pedido sai igual ao de antes. A função antiga ignora os
// dois e manda tudo, com os dados: quem chama tem de aceitar a resposta
// cheia (useFontesMarketing.js aceita). Quem lê as fontes na tela é o
// useFontesMarketing.js, que guarda e reaproveita: não chame isto direto.
export const lerFontesMarketing = ({ leve = false, fontes = null } = {}) =>
  chamarMarketing("fontes", { ...(leve === true ? { leve: true } : {}), ...(Array.isArray(fontes) ? { fontes: [...fontes] } : {}) }).catch(servidorAntigo);

// Só a gestão, e só Google, LinkedIn e Pinterest. Devolve { url, nonce }: a
// tela de permissão do provedor, para a tela navegar, e o nonce deste
// pedido, que a TELA guarda na aba antes de navegar (a volta só é
// confirmada quando o nonce dela for o guardado; ver
// confirmarConexaoMarketing e lib/calc/marketing-conexoes.js). A volta cai em
// /configuracoes?secao=marketing&conexao=<fonte>&r=ok&confirmar=<nonce>, ou
// r=erro&motivo=<código>. O endereço é conferido aqui (urlDeConexaoSegura):
// só a tela do provedor daquela fonte ou um caminho do próprio Painel; outra
// coisa não vira navegação. Nonce fora do formato (ou que não veio, na
// função antiga) volta null. Sem os secrets do app, o erro vem com
// faltaConfigurar.
const NONCE_DE_CONEXAO = /^[A-Za-z0-9_-]{16,128}$/;
export const conectarInicioMarketing = (fonte) =>
  chamarMarketing("conectarInicio", { fonte })
    .then((r) => {
      const url = urlDeConexaoSegura(fonte, r.url);
      if (!url) throw new Error("O servidor mandou um endereço de conexão inesperado. Nada foi aberto.");
      return { url, nonce: typeof r.nonce === "string" && NONCE_DE_CONEXAO.test(r.nonce) ? r.nonce : null };
    }, servidorAntigo);

// A volta do Conectar, com CONFIRMAÇÃO (protocolo de 11/10/2026): a
// painel-mkt-oauth guarda a conexão como pedida e manda o Léo para
// /configuracoes?secao=marketing&conexao=<fonte>&r=ok&confirmar=<nonce>. A
// conexão só passa a valer quando a tela, com o crachá de quem clicou em
// Conectar, devolve o nonce aqui (e a tela só devolve o nonce que ela mesma
// guardou na aba, no Conectar). Devolve a fonte nova (o mesmo formato de
// cada item de lerFontesMarketing), ou null se o servidor não mandou uma
// fonte daquela. A recusa vem como erro: 404 com motivo pedido_vencido
// (venceu, já foi usado ou não existe); 403 com motivo outra_pessoa (quem
// confirma não é quem pediu); 403 sem motivo (o papel não é gestão); 422
// (fonte fora do OAuth). O 401 de crachá vencido o comCracha já trata. A
// tela chama uma vez só por nonce.
export const confirmarConexaoMarketing = (fonte, nonce) =>
  chamarMarketing("conectarConfirmar", { fonte, nonce }).then(
    (r) => (r.fonte && typeof r.fonte === "object" && !Array.isArray(r.fonte) && r.fonte.fonte === fonte ? r.fonte : null),
    servidorAntigo,
  );

// Só a gestão. Apaga a conexão do cofre; no Google, revoga também (e isso
// desliga juntos o Analytics, o Search Console e o Perfil da Empresa).
// Devolve { revogado: true | false | null (o provedor não revoga por API),
// aviso: frase para mostrar, ou null }.
export const desconectarMarketing = (fonte) =>
  chamarMarketing("desconectar", { fonte }).then(
    (r) => ({ revogado: typeof r.revogado === "boolean" ? r.revogado : null, aviso: typeof r.aviso === "string" && r.aviso ? r.aviso : null }),
    servidorAntigo,
  );

// Gestão e marketing. O servidor espera a coleta até uns 25 s:
//  - terminou: { andando: false, fonte } com a fonte nova (o mesmo formato
//    de cada item de lerFontesMarketing);
//  - não deu tempo: { andando: true, fonte: null }, e a tela relê depois.
// A trava de 2 minutos por fonte volta como erro 429 com aguardarSegundos.
export const coletarAgoraMarketing = (fonte) =>
  chamarMarketing("coletarAgora", { fonte }).then(
    (r) => ({ andando: r.andando === true, fonte: r.andando === true ? null : (r.fonte ?? null) }),
    servidorAntigo,
  );
