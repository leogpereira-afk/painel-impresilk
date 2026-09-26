// ============================================================================
// painel-acesso — quem entra nos SETE sistemas, num lugar so.
//
// Le e escreve acesso_conta / acesso_papel, as tabelas que consolidam
// equipe_contas (uma linha por pessoa POR SISTEMA) e painel_contas.
//
// O QUE ESTA VERSAO CONSERTA (16/08/2026)
// A tabela consolidada era um MAPA DE INTENCAO: ela dizia "o Leonardo entra no
// PCP", e a tela repetia isso sem nunca perguntar ao PCP. Só que a conta que
// existe la se chama `leo`, nao `leonardo` -- e o dono passou cinco tentativas
// digitando um usuario que nao existe (equipe_acessos_log, 16/08 22:46). Vinte
// e uma divergencias assim estavam gravadas, caladas.
//
// Duas mudancas de fundo:
//   1. O LOGIN DE CADA SISTEMA VIRA DADO (acesso_papel.login). Antes ele era
//      DEDUZIDO do usuario (ou do nome do colaborador, no RH) -- e o dia em que
//      a conta de la tinha outro nome, a deducao errava sem barulho. Vazio =
//      cai na regra antiga, entao nada quebra por omissao.
//   2. `listar` PERGUNTA AOS SISTEMAS. Toda linha volta com o que existe de
//      verdade em equipe_contas / painel_contas / perfis: se a conta existe,
//      com que login, que papel, se a senha e temporaria. Contas que existem la
//      e nao sao de ninguem aqui voltam em `soltas`, para serem reconectadas --
//      quase sempre e a mesma pessoa com o nome escrito de outro jeito.
//
// So a direcao entra. Nao ha leitura para gestor nem para colaborador: a lista
// de quem entra em que sistema e, por si so, um mapa de onde bater.
// ============================================================================

import { agruparEntradas, elencoRh } from "../_shared/acesso-leitura.mjs";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { hashSenha, verificarJwt, crachaRevogado } from "../_shared/cripto.ts";
import {
  texto, normalizar, alvoNoSistema, SO_LEITURA, OBRIGA_TROCA,
  lerLojas, linhasDoLog, perfisDaPessoa, lojaDeOutro, FalhaLeitura, type Lojas,
} from "../_shared/senha-lojas.ts";
import { senhaPedida, pedidoEmLote, motivoSeguro, falhaDeCredencial } from "../_shared/senha-regra.ts";
import { recusaCerta } from "../_shared/troca-senha.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";
// Segredo da Central. E com ele que esta function se identifica para a
// equipe-auth -- ver "POR QUE NAO REESCREVI AS REGRAS AQUI", abaixo.
const LEO_SECRET = Deno.env.get("LEO_SESSION_SECRET") ?? "";
const ANON = Deno.env.get("ANON_KEY_IMPRESILK") ?? "";
const URL_EQUIPE = `${SUPABASE_URL}/functions/v1/equipe-auth`;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// `texto`, `normalizar`, `alvoNoSistema` e `SO_LEITURA` moram em
// _shared/senha-lojas.ts desde 26/09/2026: a troca de senha precisa achar a
// pessoa no MESMO login que esta tela mostra, e duas copias da regra
// envelheceriam separadas.

// ============================================================================
// POR QUE NAO REESCREVI AS REGRAS AQUI
//
// Cadastrar alguem num sistema nao e so inserir uma linha. E: validar o papel
// contra a lista fechada daquele sistema; nao deixar o sistema sem nenhuma
// conta de gestao; gravar o log; e ESPELHAR O ELENCO na config do Brief, do PCP
// e do Compras -- preservando o id do designer, que e por onde o Brief liga a
// pessoa ao briefing. Cada uma dessas regras custou caro para existir.
//
// Copiar isso para ca criaria duas implementacoes das mesmas regras, e a copia
// envelheceria calada: mudar a lista de papeis de um lado e nao do outro grava
// papel que nenhum sistema reconhece, sem erro nenhum.
//
// Entao esta function NAO escreve em equipe_contas, painel_contas nem perfis.
// Ela chama a equipe-auth, que ja faz tudo isso, identificando-se com o cracha
// da Central. O que ela mantem por conta propria e so a tabela nova
// (acesso_conta/acesso_papel), que e a visao "uma linha por pessoa".
//
// A EXCECAO, E SO ELA: A SENHA DE "DEFINIR SENHA EM TODOS" (26/09/2026).
// `definirSenha` grava pela funcao de banco `acesso_senha_gravar`, numa
// transacao so, e SO nas colunas de senha (hash, salt, iter, trocar_senha).
// Nao e atalho: trocar senha nao cria conta, nao muda papel, nao conta gestor
// nem espelha elenco, que sao as regras que justificam passar pela
// equipe-auth. E passar por ela OBRIGA a reenviar papel e modulos junto: era
// assim que "gerar senha" promovia, rebaixava ou tirava modulos do Painel de
// quem tinha a tabela de intencao divergente do sistema. Quem "consertar" isto
// de volta para a equipe-auth traz esse defeito junto.
// ============================================================================

// Cracha da Central, no formato que a equipe-auth ja aceita:
// "<expira_ms>.<hmac sha256 hex de expira_ms>". Vale um minuto -- tempo de
// fazer a chamada e nada mais.
async function crachaCentral(): Promise<string> {
  const enc = new TextEncoder();
  const exp = Date.now() + 60_000;
  const chave = await crypto.subtle.importKey(
    "raw", enc.encode(LEO_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", chave, enc.encode(String(exp))));
  return `${exp}.${[...mac].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function chamarEquipe(corpo: Record<string, unknown>) {
  const r = await fetch(URL_EQUIPE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${await crachaCentral()}`,
    },
    body: JSON.stringify(corpo),
  });
  const b = await r.json().catch(() => null);
  // `descartados` = modulo pedido que a equipe-auth nao conhece. Ela ja filtrava
  // isso em silencio: a caixa era marcada, a resposta vinha {ok:true} e a pessoa
  // nao ganhava acesso nenhum. Aqui vira ERRO, com o nome do que caiu.
  // `descartados` = modulo pedido que a equipe-auth nao conhece. Recusar tudo
  // seria mentira ao contrario: os validos JA foram gravados la, e a tabela
  // daqui ficaria para tras. Entao a escrita vale, e o aviso sobe junto.
  const perdidos: string[] = Array.isArray(b?.descartados) ? b.descartados : [];
  return {
    ok: r.ok && b?.ok !== false,
    erro: b?.erro ?? (r.ok ? "" : `HTTP ${r.status}`),
    aviso: perdidos.length
      ? `O servidor nao conhece: ${perdidos.join(", ")} — esses NAO foram concedidos.`
      : "",
    descartados: perdidos,
  };
}

// O painel nao tem papel: tem lista de modulos. A equipe-auth so entende
// "acesso total" pelo papel literal "tudo" (painelSalvar), entao a estrela da
// lista de permissoes e traduzida aqui. Mandar "" com ["*"] gravaria uma lista
// vazia: o filtro de modulos descarta a estrela, calado.
const papelNoSistema = (sistema: string, papel: unknown, permissoes: unknown[]) =>
  sistema === "painel"
    ? (Array.isArray(permissoes) && permissoes.includes("*") ? "tudo" : "")
    : texto(papel, 40);

// ---------------------------------------------------------------- a verdade
// O ESTADO REAL DE TODOS OS SISTEMAS, de uma vez.
//
// Tres tabelas, tres formatos, um so mapa: sistema -> login -> o que ha la.
// Ler tudo junto (em vez de uma consulta por pessoa por sistema) e o que deixa
// `listar` responder "com que login cada um entra em cada lugar" sem virar
// cento e cinquenta idas ao banco.
//
// As chaves saem NORMALIZADAS, porque e assim que os tres sistemas comparam.
// Comparar com o texto cru fazia "Barbara Patricia" nunca casar com "barbara
// patricia": a function concluia que a conta nao existia, mandava senha nova
// junto e a equipe-auth TROCAVA a senha do RH da pessoa a cada mudanca de papel.
type Real = {
  login: string;
  papel: string;
  ativo: boolean;
  temporaria: boolean;
  em: string | null;
  nome: string;
  permissoes?: string[];
};
type MapaReal = Record<string, Record<string, Real>>;

async function lerConsulta(consulta: any) {
  const resultado = await consulta;
  if (resultado.error) throw new Error("Não foi possível consultar uma fonte de acessos. Tente novamente.");
  return resultado;
}

async function estadoReal(): Promise<MapaReal> {
  const mapa: MapaReal = {};
  const por = (s: string) => (mapa[s] ??= {});

  const [{data: equipe}, {data: painel}, {data: perfis}] = await Promise.all([
    lerConsulta(sb.from("equipe_contas").select("sistema, usuario, nome, papel, ativo, trocar_senha, atualizado_em")),
    lerConsulta(sb.from("painel_contas").select("usuario, nome, permissoes, atualizado_em")),
    lerConsulta(sb.from("perfis").select("usuario, nome, perfil, atualizado_em, colaborador_id, ativo")),
  ]);
  for (const c of equipe ?? []) {
    por(c.sistema)[normalizar(c.usuario)] = {
      login: c.usuario, papel: c.papel ?? "", ativo: c.ativo !== false,
      temporaria: !!c.trocar_senha, em: c.atualizado_em, nome: c.nome || c.usuario,
    };
  }

  // O Painel nao tem papel nem "desativado": ou a linha existe, ou nao existe.

  for (const c of painel ?? []) {
    por("painel")[normalizar(c.usuario)] = {
      login: c.usuario, papel: (c.permissoes ?? []).includes("*") ? "tudo" : "",
      ativo: true, temporaria: false, em: c.atualizado_em, nome: c.nome || c.usuario,
      permissoes: c.permissoes ?? [],
    };
  }

  // No RH quem manda e a linha de perfis; a senha mora no Supabase Auth.

  for (const c of perfis ?? []) {
    const real: Real = {
      // `login` e so EXIBICAO -- e o nome, que e o que a tela mostra em "entra
      // como". Quem casa e a chave do mapa, logo abaixo.
      login: c.usuario, papel: c.perfil ?? "",
      /* `ativo` era CRAVADO em true porque `perfis` nao tinha essa coluna. Ela
         passou a existir em 17/08/2026, e continuar cravando escondia justamente
         quem foi desativado no RH -- a tela mostraria verde para quem nao entra
         mais. */
      ativo: c.ativo !== false,
      temporaria: false, em: c.atualizado_em, nome: c.nome || c.usuario,
    };
    /* DUAS CHAVES PARA A MESMA LINHA, e as duas fazem falta. A do id e a que
       vale: e ela que casa com `alvoNoSistema`. A do nome fica de rede para
       conta que ainda nao tenha `colaborador_id` -- sem ela, essa conta cairia
       em "nao existe no RH" e a tela ofereceria criar uma segunda. */
    if (c.colaborador_id) por("rh")[normalizar(c.colaborador_id)] = real;
    por("rh")[normalizar(c.usuario)] = real;
  }

  /* O DRE TAMBEM NAO TEM MAIS TABELA DE CONTAS. Ate 18/08/2026 ele era uma
     porta com uma senha so (`equipe` em equipe_contas); o Leonardo aposentou a
     senha e passou a entrada para o cracha do Painel. Sem este ramo, TODO MUNDO
     marcado no DRE apareceria como "nao existe la" -- e a tela ofereceria criar
     uma conta num sistema que nao guarda conta nenhuma.
     Aqui, como na Central, a propria linha de acesso e a verdade. */
  {
    const { data: doDre } = await lerConsulta(sb.from("acesso_papel")
      .select("conta_id, papel, ativo").eq("sistema", "dre"));
    if (doDre?.length) {
      const { data: donos } = await lerConsulta(sb.from("acesso_conta")
        .select("id, usuario, nome, ativo, atualizado_em")
        .in("id", doDre.map((p: any) => p.conta_id)));
      for (const p of doDre) {
        const d = (donos ?? []).find((x: any) => x.id === p.conta_id);
        if (!d) continue;
        por("dre")[normalizar(d.usuario)] = {
          login: d.usuario, papel: p.papel ?? "equipe",
          ativo: d.ativo !== false && p.ativo !== false,
          temporaria: false, em: d.atualizado_em, nome: d.nome || d.usuario,
        };
      }
    }
  }

  /* A CENTRAL NAO TEM TABELA DE CONTAS, e nao e esquecimento: o app pessoal do
     dono autentica pela leo-sync (LEO_SESSION_SECRET), nao por equipe_contas.
     Sem um ramo aqui ela caia no "nao existe la" -- e a tela oferecia "Tirar da
     lista" e "Criar a conta la" para a UNICA linha que registra quem abre a
     Central. Uma das duas apagaria o registro; a outra fabricaria em
     equipe_contas uma segunda senha que abre o app pessoal dele.
     Aqui a propria linha de acesso e a verdade -- que e o que ela sempre foi. */
  const { data: central } = await lerConsulta(sb.from("acesso_papel")
    .select("conta_id, papel, ativo").eq("sistema", "central"));
  if (central?.length) {
    const { data: donos } = await lerConsulta(sb.from("acesso_conta")
      .select("id, usuario, nome, ativo, atualizado_em")
      .in("id", central.map((p: any) => p.conta_id)));
    const porId = new Map((donos ?? []).map((d: any) => [d.id, d]));
    for (const p of central) {
      const d = porId.get(p.conta_id);
      if (!d) continue;
      por("central")[normalizar(d.usuario)] = {
        login: d.usuario, papel: p.papel || "dono",
        ativo: p.ativo !== false && d.ativo !== false,
        temporaria: false, em: d.atualizado_em, nome: d.nome || d.usuario,
      };
    }
  }
  return mapa;
}

// A lista SO_LEITURA (quais sistemas esta tela so mostra) mora em
// _shared/senha-lojas.ts, com o comentario que conta por que cada um esta la.
const RECADO_SO_LEITURA =
  "Este sistema tem porta e contas próprias (fora da equipe-auth). " +
  "Ele aparece aqui só para registro: não se cria conta nem se troca senha dele por esta tela.";

// A conta daquela pessoa naquele sistema, ou null. Ler para decidir e legitimo
// -- o que esta function nao faz e ESCREVER as regras dos outros. Isto decide
// so uma coisa: se e preciso inventar uma senha (conta nova) ou nao (conta que
// ja existe, e cuja senha nao pode ser mexida sem pedirem).
async function acharNoSistema(sistema: string, alvo: string, mapa?: MapaReal) {
  const chave = normalizar(alvo);
  if (!chave) return null;
  const m = mapa ?? (await estadoReal());
  return m[sistema]?.[chave] ?? null;
}

// A senha temporaria gerada mora em _shared/senha-regra.ts (gerarSenha):
// quatro palavras e tres digitos, a mesma regra da troca propria.

// Os sete sistemas da casa. Lista fechada: sistema digitado errado viraria uma
// linha de papel que nenhuma tela le e ninguem descobre.
const SISTEMAS = ["painel", "rh", "pcp", "brief", "dre", "compras", "pops", "vof", "central", "bosques", "domo"];

// ============================================================================
// A PORTA DA FRENTE TAMBEM. Sem isto, trocar a senha de alguem nao trocava nada.
//
// A entrada unica (acesso-entrar) nao consulta equipe_contas nem painel_contas:
// ela confere a senha no Supabase Auth (quem ja migrou) ou nos hashes de
// `acesso_senha_legado` (quem nao migrou). Esta function escrevia so nos
// sistemas -- entao "gerar nova senha" trocava as portas dos fundos e deixava
// a da frente com a senha VELHA, funcionando, para sempre.
//
// Pior: o ramo do legado nunca filtrou `usado_em`. Carimbar a senha antiga como
// usada, que era o que se fazia aqui, nao tirava nada de ninguem -- so dava a
// impressao de ter tirado.
//
// Agora a senha nova vai para os TRES lugares, e a antiga e APAGADA:
//   1. os sistemas (via equipe-auth, como antes);
//   2. o Supabase Auth, quando a pessoa ja migrou;
//   3. `acesso_senha_legado`, que passa a ter UMA linha: a nova.
//
// A linha 3 e o que faz a senha nova valer para quem ainda nao migrou: na
// primeira entrada ela bate contra esse hash e vira a do Auth. As varias linhas
// por origem existiam para a virada (a Barbara tinha senhas diferentes por
// sistema); depois que a direcao define uma senha de proposito, ter as antigas
// guardadas e so guardar chave de porta trocada.
// ============================================================================
/* Encerra as sessoes abertas daquela identidade no Supabase Auth. O GoTrue
   expoe isso pela admin API; a service_role que esta function ja usa basta.
   Falha aqui e AVISO, nao excecao: a senha e o `ativo` ja foram gravados, e
   abortar deixaria o estado pela metade. */
async function derrubarSessoes(authUserId: string) {
  try {
    /* Pelo BANCO, e nao pela API do GoTrue: esta instalacao nao expoe
       DELETE /admin/users/{id}/sessions nem POST .../logout (404 nas duas,
       conferido em 17/08/2026), e a Edge Function nao alcanca o schema `auth`
       pelo PostgREST. public.derrubar_sessoes e SECURITY DEFINER e faz o corte. */
    const { error } = await sb.rpc("derrubar_sessoes", { p_user: authUserId });
    if (error) console.warn("[painel-acesso] nao derrubei as sessoes:", error.message);
  } catch (e) {
    console.warn("[painel-acesso] nao derrubei as sessoes:", (e as Error)?.message);
  }
}

/* A SENHA NOVA ABRE A ENTRADA? Pergunta feita ao proprio Auth, quando a
   gravacao nele deu erro que nao e recusa certa (ver recusaCerta). "sim": ela
   gravou e so a resposta se perdeu; "nao": o Auth ficou com a anterior;
   "nao-sei": nem a pergunta teve resposta. */
async function entradaAceitou(authUserId: string, senha: string): Promise<"sim" | "nao" | "nao-sei"> {
  if (!ANON) return "nao-sei";
  const { data, error } = await sb.auth.admin.getUserById(authUserId);
  if (error || !data?.user?.email) return "nao-sei";
  const cliente = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: entrada, error: falha } = await cliente.auth.signInWithPassword({ email: data.user.email, password: senha });
  if (!falha && entrada?.session) return "sim";
  return falhaDeCredencial(falha) ? "nao" : "nao-sei";
}

// O log de senha e testemunha, nao dono: falhar aqui nao desfaz a troca.
const registrarSenha = (linha: { p_sistema: string; p_usuario: string; p_acao: string; p_por: string; p_detalhe: string }) =>
  sb.rpc("porta_registrar", linha).then(() => {}, () => {});

async function senhaNaPortaDaFrente(conta: any, senha: string) {
  const avisos: string[] = [];
  if (conta.auth_user_id) {
    const { error } = await sb.auth.admin.updateUserById(conta.auth_user_id, { password: senha });
    // Aviso, nao excecao: as senhas dos sistemas JA foram trocadas quando esta
    // funcao roda. Abortar aqui deixaria a pessoa com senha nova nos sistemas e
    // ninguem sabendo que a da frente ficou para tras.
    if (error) avisos.push(`nao consegui trocar a senha da entrada unica: ${error.message}`);
  }
  const reg = await hashSenha(senha);
  /* GRAVA A NOVA ANTES DE APAGAR AS ANTIGAS. A ordem era a contraria: apagar
     tudo e depois inserir. Se o insert falhasse, quem ainda nao migrou ficava
     SEM senha nenhuma na entrada unica, e a tela so mostrava um aviso. Agora a
     linha nova entra (ou substitui a de mesma origem) primeiro, e so depois as
     outras saem; falhou a gravacao, as antigas continuam valendo. */
  const { error: e2 } = await sb.from("acesso_senha_legado").upsert({
    conta_id: conta.id, origem: "central", hash: reg.hash, salt: reg.salt, iter: reg.iter, usado_em: null,
  }, { onConflict: "conta_id,origem" });
  if (e2) {
    avisos.push(`nao consegui guardar a senha da entrada unica: ${motivoSeguro(e2, [senha])}`);
    return avisos;
  }
  await sb.from("acesso_senha_legado").delete().eq("conta_id", conta.id).neq("origem", "central");
  return avisos;
}

/**
 * Acha a ficha do RH pelo nome e devolve o que AMARRA a conta a ela.
 *
 * Sem isto, so as 14 contas preenchidas a mao em 17/08/2026 teriam id: toda
 * conta criada dali em diante nasceria amarrada por NOME de novo, e o defeito
 * voltaria pela porta da frente -- um cadastro por vez, sem ninguem notar.
 *
 * `id_pessoa` sao os 6 primeiros digitos do CPF, decisao do Leonardo: identifica
 * sem espalhar o documento pelos oito sistemas, pela tela de acessos e pela
 * copia diaria. `colaborador_id` vai junto como rede -- se alguem corrigir um
 * CPF digitado errado, a conta nao fica orfa.
 *
 * Ficha nao encontrada devolve vazio em vez de estourar: amarrar e opcional
 * (terceirizado e conta de funcao nao tem ficha), e recusar aqui trancaria o
 * cadastro de quem nao e do quadro.
 */
async function amarrarNaFicha(nomeColaborador: string) {
  const alvo = normalizar(nomeColaborador);
  if (!alvo) return {};
  const { data } = await sb.from("registros")
    .select("id, registro").eq("colecao", "colaboradores").eq("apagado", false);
  const acha = (data ?? []).filter((r: any) => normalizar(String(r.registro?.nome ?? "")) === alvo);
  // DOIS HOMONIMOS: nao escolher. Amarrar na pessoa errada liga o acesso de uma
  // a ficha da outra, e o desligamento passa a valer para quem nao saiu.
  if (acha.length !== 1) return {};
  const cpf = String(acha[0].registro?.cpf ?? "").replace(/\D/g, "");
  return {
    colaborador_id: String(acha[0].id),
    ...(cpf.length === 11 ? { id_pessoa: cpf.slice(0, 6) } : {}),
  };
}

/**
 * O ALVO PARA ESCREVER — que NAO e o mesmo de ler, e confundir os dois foi o
 * defeito mais caro de 18/08/2026.
 *
 * `alvoNoSistema` passou a devolver o `colaborador_id` no RH, porque e por ele
 * que a leitura casa (o nome quebrava: `perfis` guarda "leonardo goncalves" sem
 * cedilha). Só que TODO caminho de escrita continuou mandando esse mesmo valor
 * para a `equipe-auth`, e la o RH e procurado por `perfis.usuario`, que e o NOME
 * COMPLETO. Nenhuma linha casava -- e o pior: `update` que atinge zero linhas
 * NAO devolve erro no PostgREST, entao `desativar` empurrava "rh" em `feitos` e
 * a tela dizia que tinha fechado o RH de alguem que continuava entrando.
 *
 * Aqui o caminho e id -> ficha -> nome: parte do id (que e a chave) e resolve
 * para o texto que a porta do RH espera. Sem ficha, cai no nome guardado.
 */
async function alvoParaEscrever(conta: any, sistema: string, papel?: any): Promise<string> {
  if (sistema !== "rh") return alvoNoSistema(conta, sistema, papel);
  const ficha = texto(conta.colaborador_id, 120);
  if (ficha) {
    const { data } = await sb.from("perfis").select("usuario")
      .eq("colaborador_id", ficha).maybeSingle();
    if (data?.usuario) return String(data.usuario);
  }
  return texto(conta.colaborador, 160);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "use POST" }, 405);
  if (!JWT_SECRET) return resposta({ erro: "Login nao configurado no servidor." }, 503);

  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const sessao = m ? await verificarJwt(m[1], JWT_SECRET) : null;
  if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
  /* SO A CONTA DA DIRECAO. Uma pessoa, o dono -- decisao dele em 16/08/2026.
     Antes bastava ter acesso total ("*"), e isso era desencontro puro: a tela
     escondia o menu de quem tinha "*" (gated so por `master`), enquanto ESTA
     porta abria para essa mesma pessoa. Quem soubesse o endereco da function
     administrava acesso sem nunca ver o botao.
     "*" continua mandando no que a pessoa VE dentro do painel; nao em quem
     entra nos sistemas. Ver ehDirecao em src/lib/sessao.js. */
  if (sessao.master !== true) {
    return resposta({ erro: "Apenas a direcao." }, 403);
  }
  /* E O CRACHA AINDA VALE? Esta porta administra quem entra nos oito sistemas --
     era a unica do Painel, junto com o backup, que conferia a assinatura e nao
     perguntava pela revogacao. Um cracha de direcao dura 12h: bastava ele estar
     no bolso de alguem para administrar acesso mesmo depois de encerrado. */
  if (await crachaRevogado(sb, "painel", sessao)) {
    return resposta({ erro: "Seu acesso foi encerrado.", semSessao: true }, 401);
  }

  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: "json invalido" }, 400);
  }

  const contaPorUsuario = async (usuario: string) => {
    const { data } = await sb.from("acesso_conta").select("id")
      .eq("usuario", texto(usuario, 60).toLowerCase()).maybeSingle();
    return data?.id ?? null;
  };

  try {
    switch (corpo.action) {
      case "listar": {
        const { data: contas } = await lerConsulta(sb.from("acesso_conta").select("*").order("usuario"));
        const { data: papeis } = await lerConsulta(sb.from("acesso_papel").select("*"));
        // O hash NUNCA sai daqui -- so a contagem, para a tela poder dizer
        // "esta pessoa ainda nao entrou depois da virada".
        const { data: senhas } = await lerConsulta(sb.from("acesso_senha_legado")
          .select("conta_id, origem, usado_em"));

        /* Nomes do RH para o campo de amarrar. So o NOME: a ficha de la tem
           salario, CPF e endereco, e nada disso tem o que fazer nesta tela.

           `apagado = false` porque as fichas repetidas foram UNIFICADAS, nao
           removidas (17/08/2026: Kelly, Jose Adilando e Demerval tinham cinco
           fichas a mais entre os tres). Sem este filtro elas voltariam a
           aparecer na lista de escolha, e amarrar alguem a uma ficha morta
           desligaria a conta do RH em silencio.

           SO QUEM NAO FOI DESLIGADO, decisao do Leonardo. E "nao desligado" NAO
           e o mesmo que `ativo`: das 93 fichas, 24 estao `ativo`, 7 em
           `experiencia`, 3 na `direcao` e 1 em `atestado-medico`. Filtrar por
           `ativo` sumiria com a Karen e a Michelle (experiencia, trabalhando
           hoje), com o proprio dono (direcao) e com o Nailton (afastado, que
           volta). Fora ficam so `inativo` e `abandono`. */
        const NO_QUADRO = new Set(["ativo", "experiencia", "direcao", "atestado-medico"]);
        /* SO O NOME E A SITUACAO, e nao a ficha inteira. Pedir `registro` trazia
           as 88 fichas COMPLETAS -- salario, CPF, endereco, telefone do conjuge --
           para extrair dois campos. Meio megabyte por abertura de tela, de dado
           que esta tela nao tem o que fazer com ele: 512 KB viraram 7 KB.
           Menos tempo E menos exposicao: o que nao viaja nao vaza. */
        const { data: colabs } = await lerConsulta(sb.from("registros")
          .select("id, nome:registro->>nome, situacao:registro->>statusId")
          .eq("colecao", "colaboradores").eq("apagado", false));
        const fichas = (colabs ?? []).filter((r: any) => NO_QUADRO.has(String(r.situacao ?? "")));
        const nomes = [...new Set(fichas
          .map((r: any) => String(r.nome ?? "").trim())
          .filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
        /* O NOME DA FICHA MANDA. `acesso_conta.colaborador` e uma copia do nome
           feita no dia em que a conta foi amarrada -- corrigir um acento no RH
           deixava a tela mostrando o texto velho para sempre. Com o id como
           chave, o nome pode mudar a vontade: a tela le o atual daqui. */
        const nomeDaFicha = new Map(
          (colabs ?? []).map((r: any) => [String(r.id), String(r.nome ?? "").trim()]),
        );

        // A VERDADE, perguntada aos sistemas. Sem isto a tela so repetia a
        // tabela consolidada -- e era ela que estava mentindo.
        const real = await estadoReal();
        // Todo login que ALGUEM aqui reivindica, para saber o que sobrou solto.
        const reivindicados: Record<string, Set<string>> = {};

        const contasFora = (contas ?? []).map((c: any) => ({
          ...c,
          // O nome ATUAL da ficha, nao a copia congelada no dia da amarracao.
          colaborador: nomeDaFicha.get(String(c.colaborador_id ?? "")) || c.colaborador,
          papeis: (papeis ?? []).filter((p: any) => p.conta_id === c.id).map((p: any) => {
            const login = alvoNoSistema(c, p.sistema, p);
            const chave = normalizar(login);
            (reivindicados[p.sistema] ??= new Set()).add(chave);
            const r = real[p.sistema]?.[chave] ?? null;
            /* O `ativo` da conta NAO conta a historia toda: painel_contas e
               perfis nao tinham coluna de ativo, entao `estadoReal` grava true
               fixo neles -- e conta desativada aparecia VERDE, com selo "ok".
               Quem manda sobre estar ativo e o quadro unico, que e onde o botao
               "desativar" grava: a pessoa (c.ativo) e o papel dela naquele
               sistema (p.ativo). */
            const ativo = r ? (r.ativo !== false && c.ativo !== false && p.ativo !== false) : false;
            return {
              ...p,
              // O login com que a pessoa entra ALI. Quando ninguem corrigiu,
              // e o palpite -- e a tela precisa poder dizer que e palpite.
              login,
              fonte: ["domo", "bosques"].includes(p.sistema) ? "nao_integrado" : "consultado",
              deduzido: !texto(p.login, 160),
              real: r
                ? { existe: true, login: r.login, papel: r.papel, ativo,
                    temporaria: r.temporaria, em: r.em, permissoes: r.permissoes }
                : { existe: false },
            };
          }),
          senhas: (senhas ?? []).filter((s: any) => s.conta_id === c.id)
            .map((s: any) => ({ origem: s.origem, migrada: !!s.usado_em })),
        }));

        // CONTAS SOLTAS: existem no sistema e ninguem aqui se diz dono delas.
        // Quase sempre e a mesma pessoa com o nome escrito de outro jeito (o
        // `leo` do PCP e o `leonardo` de todo o resto), e por isso elas voltam
        // para a tela em vez de serem apagadas caladas.
        /* UMA CONTA PODE SER ALCANCAVEL POR MAIS DE UMA CHAVE, e contar chaves
           em vez de contas faz a mesma pessoa aparecer como conta sem dono ao
           lado de si mesma. O RH passou a ser indexado pelo id da ficha E pelo
           nome (a rede para conta que ainda nao tem id): o `reivindicados`
           marca so a chave do id, a do nome sobrava, e a tela acusava SEIS
           contas sem dono no RH quando as seis tinham dono.
           Entao a conta so e "solta" quando NENHUMA das chaves dela foi
           reivindicada -- e o mapa por objeto tambem tira a duplicata. */
        const soltas: Record<string, Real[]> = {};
        for (const sis of SISTEMAS) {
          const temDono = new Map<Real, boolean>();
          for (const [chave, r] of Object.entries(real[sis] ?? {})) {
            temDono.set(r, (temDono.get(r) ?? false) || !!reivindicados[sis]?.has(chave));
          }
          const sobra = [...temDono.entries()]
            .filter(([, tem]) => !tem)
            .map(([r]) => r)
            .sort((a, b) => a.login.localeCompare(b.login, "pt-BR"));
          if (sobra.length) soltas[sis] = sobra;
        }

        /* OS VENDEDORES, COMO O ERP OS ESCREVE. A tela precisa oferecer a lista
           em vez de deixar digitar: o nome tem de bater EXATO (a comparacao so
           junta espaco), e "Michelle Petrone" nao e "Michelle". Errar aqui nao
           da erro -- da uma fila vazia, que parece so um dia sem orcamento. */
        /* A CONTAGEM VEM PRONTA DO BANCO. Antes esta linha lia `painel_cache`
           INTEIRO -- 1,39 MB de orcamentos -- para produzir 8 nomes e 8 numeros,
           a cada abertura da tela. Medido em 18/08/2026: 217 bytes fazem o mesmo.
           A agregacao mora no Postgres porque o PostgREST nao agrega dentro de
           jsonb: pedir de fora obriga a trazer o array todo e contar aqui. */
        const { data: vend } = await lerConsulta(sb.rpc("painel_vendedores"));
        // `n` e nao `orcamentos`: e o nome que a tela le (AcessoUnico.jsx:275,
        // "{v.n} orcamentos"). Trocar o rotulo aqui nao daria erro -- daria
        // "undefined orcamentos" no seletor, calado.
        const vendedores = (vend ?? []).map((v: any) => ({
          nome: String(v.vendedor ?? ""),
          n: Number(v.orcamentos ?? 0),
        }));

        /* QUEM MAIS O SISTEMA CONHECE.
           Ate aqui esta tela mostrava so quem tem CONTA -- e cada sistema tem
           gente cadastrada alem disso. Abrir "POPs" mostrava 7 nomes enquanto o
           POPs conhece 40 pessoas; o RH mostrava 6 enquanto tem 93 fichas.

           E parte dessa gente ENTRA. Nao por senha, por outro caminho:
             · os 15 instaladores do PCP tocam no proprio nome (decisao do dono:
               quem sobe em andaime nao digita senha) -- a lista de nomes E a
               credencial, e cada variante de escrita e uma porta a mais;
             · os 53 fornecedores do Compras abrem as telas deles por um link
               publico (desenho consciente, esta no PADRAO-DOS-SISTEMAS).
           Nenhum dos dois aparecia em lugar nenhum desta tela. `como` diz por
           onde cada um entra, e a tela pinta os dois de amarelo.

           So o NOME viaja: a ficha do RH tem CPF, endereco e salario, e nada
           disso tem o que fazer aqui. */
        type NoElenco = { nome: string; como: string; detalhe: string };
        const elenco: Record<string, NoElenco[]> = {};
        const juntar = (sis: string, itens: NoElenco[]) => {
          if (!itens.length) return;
          (elenco[sis] ??= []).push(...itens.filter((x) => x.nome));
        };
        // Nome pode vir texto ("Saulo Rodrigues") ou objeto ({nome, numero}).
        const soNome = (x: unknown) =>
          texto(typeof x === "object" && x ? (x as any).nome : x, 120);

        const { data: cfgPcp } = await lerConsulta(sb.from("pcp_config_global")
          .select("config").eq("id", true).maybeSingle());
        const cp = (cfgPcp?.config ?? {}) as Record<string, unknown[]>;
        const lista = (k: string) => (Array.isArray(cp[k]) ? cp[k] : []);
        juntar("pcp", lista("instaladores").map((x) => ({
          nome: soNome(x), como: "nome", detalhe: "toca no nome, sem senha",
        })));
        for (const [chave, rotulo] of [
          ["responsaveis", "responsável"],
          ["gerentes_montagem", "gerente de montagem"],
          ["funcionarios", "funcionário"],
        ] as const) {
          juntar("pcp", lista(chave).map((x) => ({
            nome: soNome(x), como: "cadastro", detalhe: rotulo,
          })));
        }

        const { data: pessoasPops } = await lerConsulta(sb.from("pops_registros")
          .select("registro").eq("colecao", "pessoas"));
        juntar("pops", (pessoasPops ?? []).map((r: any) => ({
          nome: texto(r.registro?.nome, 120), como: "cadastro",
          detalhe: texto(r.registro?.area, 60),
        })));

        const { data: forn } = await lerConsulta(sb.from("compras_registros")
          .select("registro").eq("colecao", "forn"));
        juntar("compras", (forn ?? []).map((r: any) => ({
          nome: texto(r.registro?.nome, 120), como: "link",
          detalhe: "fornecedor — abre as telas dele por link",
        })));

        juntar("rh", elencoRh(colabs ?? []));

        // Nome repetido nas listas (o mesmo Saulo e responsavel E gerente de
        // montagem) vira UMA linha, com os dois papeis juntos.
        for (const sis of Object.keys(elenco)) {
          const porNome = new Map<string, NoElenco>();
          for (const e of elenco[sis]) {
            const k = normalizar(e.nome);
            const ja = porNome.get(k);
            if (!ja) { porNome.set(k, { ...e }); continue; }
            // "entra" ganha de "cadastro": o que importa e o acesso.
            if (ja.como === "cadastro" && e.como !== "cadastro") ja.como = e.como;
            const partes = new Set([ja.detalhe, e.detalhe].filter(Boolean));
            ja.detalhe = [...partes].join(" · ");
          }
          elenco[sis] = [...porNome.values()]
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        }

        /* QUEM ESTA BATENDO NA PORTA E NAO CONSEGUE ENTRAR.
           O equipe_acessos_log existe desde 03/08 e a tela NUNCA o leu -- sao
           121 falhas gravadas contra 43 entradas, e a pergunta que o dono mais
           faz ("por que a Barbara nao consegue entrar?") tinha resposta no banco
           e silencio na tela. Foi assim que ele passou cinco tentativas
           digitando um usuario que nao existe no PCP.

           Agrupado por (usuario, sistema, motivo) nos ultimos 30 dias. O motivo
           importa mais que a contagem: "senha errada" e "usuario nao existe" sao
           problemas OPOSTOS -- num a pessoa sabe o login e erra a senha; no
           outro ela esta digitando um login que nao existe, e trocar a senha
           dela nao resolve nada. */
        const desde = new Date(Date.now() - 30 * 86400_000).toISOString();
        const { data: linhas } = await lerConsulta(sb.from("equipe_acessos_log")
          .select("sistema, usuario, acao, detalhe, em")
          .gte("em", desde)
          .in("acao", ["login-falhou", "login-barrado", "entrou"])
          .order("em", { ascending: false })
          .limit(2001));
        const historicoLimitado = (linhas ?? []).length > 2000;
        const naPorta = agruparEntradas((linhas ?? []).slice(0, 2000));

        /* O QUE A FICHA DO RH JA DECIDIU E NINGUEM VIU ACONTECER.
           `acesso_revogado` fecha a porta sozinha quando a ficha diz `inativo`
           ou quando o prazo do terceirizado vence -- e acesso que fecha sozinho
           e acesso que some SEM EXPLICACAO: a pessoa liga reclamando e ninguem
           sabe por que. Esta lista existe para a tela conseguir dizer o motivo,
           e para mostrar o que a regra NAO alcanca (conta sem ficha). */
        const { data: contratos } = await lerConsulta(sb.from("registros")
          .select("id, nome:registro->>nome, fim:registro->>contratoFim, funcao:registro->>funcao, situacao:registro->>situacao")
          .eq("colecao", "freelancers").eq("apagado", false));

        const { data: pendencias } = await lerConsulta(sb.from("acesso_pendencias")
          .select("usuario, nome, tipo, pendencia, situacao_no_rh, valido_ate")
          .not("pendencia", "is", null));

        return resposta({
          ok: true,
          sistemas: SISTEMAS,
          naPorta,
          historicoLimitado,
          verificadoEm: new Date().toISOString(),
          fontes: Object.fromEntries(SISTEMAS.map(s => [s, {estado: ["domo", "bosques"].includes(s) ? "nao_integrado" : "consultado"}])),
          contas: contasFora,
          soltas,
          elenco,
          vendedores,
          colaboradores: nomes,
          pendencias: pendencias ?? [],
          /* OS CONTRATOS DE FREELANCER ABERTOS, para a tela OFERECER em vez de
             pedir data. Só os não encerrados: oferecer contrato encerrado seria
             convidar a amarrar acesso a um combinado que acabou. */
          contratos: (contratos ?? [])
            .filter((c: any) => String(c.situacao ?? "") !== "encerrado")
            .map((c: any) => ({ id: c.id, nome: c.nome, fim: c.fim, funcao: c.funcao }))
            .sort((a: any, b: any) => String(a.nome).localeCompare(String(b.nome), "pt-BR")),
        });
      }

      case "salvarConta": {
        const c = corpo.conta ?? {};
        const usuario = texto(c.usuario, 60).toLowerCase();
        if (!usuario) return resposta({ erro: "Informe o usuario." }, 400);
        if (!/^[a-z0-9._-]+$/.test(usuario)) {
          return resposta({ erro: "O usuario aceita so letras sem acento, numeros, ponto, hifen e sublinhado." }, 400);
        }
        // `ativo` AUSENTE mantem o que esta gravado. Com `c.ativo !== false`
        // sozinho, um corpo sem o campo (a tela de editar nome mandava assim)
        // gravava true e devolvia o acesso de quem tinha sido desativado.
        const { data: antes } = await sb.from("acesso_conta")
          .select("ativo").eq("usuario", usuario).maybeSingle();
        const linha: any = {
          usuario,
          nome: texto(c.nome, 120) || usuario,
          /* TRES TIPOS, e nao dois. Ate 18/08/2026 esta linha forcava
             pessoa|funcao nas DUAS escritas, entao o tipo `terceirizado` -- e a
             regra 4 inteira, do prazo -- eram inalcançaveis: codigo vivo que
             nenhum caminho conseguia acionar. Achado pela auditoria.
             O prazo e o responsavel viajam junto porque o banco RECUSA
             terceirizado sem os dois (constraint acesso_conta_terceirizado_prazo)
             -- mandar o tipo sem eles daria erro cru do Postgres na cara da tela. */
          tipo: c.tipo === "funcao" ? "funcao" : c.tipo === "terceirizado" ? "terceirizado" : "pessoa",
          /* O CONTRATO MANDA, E A DATA NAO SE DIGITA DUAS VEZES. Ordem do
             Leonardo em 18/08/2026: "tem que ser apenas um". Com `freelancerId`,
             a validade e LIDA do contrato no RH -- renovou la, a porta reabre
             sozinha; encerrou, fecha. A data propria continua aceita para quem
             nao tem contrato cadastrado, e o banco exige uma das duas. */
          ...(c.tipo === "terceirizado"
            ? {
                freelancer_id: texto(c.freelancerId, 120) || null,
                valido_ate: texto(c.freelancerId, 120) ? null : (texto(c.validoAte, 10) || null),
                responsavel: texto(c.responsavel, 120),
              }
            : {}),
          colaborador: texto(c.colaborador, 160),
          // A amarracao vai JUNTA com o nome -- ver amarrarNaFicha.
          ...(await amarrarNaFicha(texto(c.colaborador, 160))),
          ativo: c.ativo === undefined ? (antes?.ativo ?? true) : c.ativo !== false,
          atualizado_em: new Date().toISOString(),
        };
        const { data, error } = await sb.from("acesso_conta")
          .upsert(linha, { onConflict: "usuario" }).select().single();
        if (error) throw new Error(error.message);
        return resposta({ ok: true, conta: data });
      }

      // ---------------------------------------------------------------- criar
      // Cria a pessoa na tabela nova E nos sistemas escolhidos, de uma vez.
      // Se um sistema recusar (papel invalido, pessoa sem ficha no RH), os
      // outros continuam: a resposta diz exatamente quais entraram e quais nao,
      // em vez de deixar a tela achar que deu tudo certo.
      case "criarPessoa": {
        const c = corpo.conta ?? {};
        const usuario = texto(c.usuario, 60).toLowerCase();
        if (!/^[a-z0-9._-]+$/.test(usuario)) {
          return resposta({ erro: "O usuario aceita so letras sem acento, numeros, ponto, hifen e sublinhado." }, 400);
        }
        // A mesma regra da troca de senha: nada aparado nem cortado calado.
        // Conferida ANTES da retentativa abaixo, que apaga o cadastro pela
        // metade: senha recusada nao pode custar a linha que ja existia.
        const pedida = senhaPedida(corpo.senha);
        if ("erro" in pedida) return resposta({ erro: pedida.erro }, 400);
        const senha = pedida.senha;
        /* Retentativa: se a criacao anterior gravou a conta e falhou em TODOS os
           sistemas, a pessoa ficou sem acesso nenhum e o segundo "Criar" batia
           em "ja existe" -- sem caminho para consertar pela tela. Conta sem
           papel nenhum e um cadastro pela metade: da para retomar. */
        const { data: existe } = await sb.from("acesso_conta")
          .select("id, usuario, ativo, auth_user_id").eq("usuario", usuario).maybeSingle();
        if (existe) {
          const { count } = await sb.from("acesso_papel")
            .select("sistema", { count: "exact", head: true }).eq("conta_id", existe.id);
          if ((count ?? 0) > 0) return resposta({ erro: "Ja existe alguem com esse usuario." }, 409);
          /* SO O CADASTRO PELA METADE DE VERDADE e retomado. Conta sem papel
             tambem e a de quem foi DESATIVADO e teve os acessos tirados, e a de
             quem ja entrou pela entrada unica (tem identidade no Auth). Apagar e
             recriar essas era outro caminho para dar senha nova a pessoa
             desligada, ja ativa de novo, e para soltar a identidade dela do
             quadro. A direcao nunca e recriada por aqui. */
          if (existe.ativo === false) {
            return resposta({ erro: "Já existe essa pessoa, desativada. Reative-a em vez de criar de novo." }, 409);
          }
          if (existe.auth_user_id || normalizar(existe.usuario) === normalizar(sessao.sub)) {
            return resposta({ erro: "Ja existe alguem com esse usuario." }, 409);
          }
          await sb.from("acesso_conta").delete().eq("id", existe.id);
        }

        const linha = {
          usuario,
          nome: texto(c.nome, 120) || usuario,
          /* TRES TIPOS, e nao dois. Ate 18/08/2026 esta linha forcava
             pessoa|funcao nas DUAS escritas, entao o tipo `terceirizado` -- e a
             regra 4 inteira, do prazo -- eram inalcançaveis: codigo vivo que
             nenhum caminho conseguia acionar. Achado pela auditoria.
             O prazo e o responsavel viajam junto porque o banco RECUSA
             terceirizado sem os dois (constraint acesso_conta_terceirizado_prazo)
             -- mandar o tipo sem eles daria erro cru do Postgres na cara da tela. */
          tipo: c.tipo === "funcao" ? "funcao" : c.tipo === "terceirizado" ? "terceirizado" : "pessoa",
          /* O CONTRATO MANDA, E A DATA NAO SE DIGITA DUAS VEZES. Ordem do
             Leonardo em 18/08/2026: "tem que ser apenas um". Com `freelancerId`,
             a validade e LIDA do contrato no RH -- renovou la, a porta reabre
             sozinha; encerrou, fecha. A data propria continua aceita para quem
             nao tem contrato cadastrado, e o banco exige uma das duas. */
          ...(c.tipo === "terceirizado"
            ? {
                freelancer_id: texto(c.freelancerId, 120) || null,
                valido_ate: texto(c.freelancerId, 120) ? null : (texto(c.validoAte, 10) || null),
                responsavel: texto(c.responsavel, 120),
              }
            : {}),
          colaborador: texto(c.colaborador, 160),
          // A amarracao vai JUNTA com o nome -- ver amarrarNaFicha.
          ...(await amarrarNaFicha(texto(c.colaborador, 160))),
          ativo: true,
          atualizado_em: new Date().toISOString(),
        };
        const { data: nova, error } = await sb.from("acesso_conta").insert(linha).select().single();
        if (error) throw new Error(error.message);

        const pedidos = Array.isArray(corpo.papeis) ? corpo.papeis : [];
        const entraram: string[] = [];
        const recusados: { sistema: string; erro: string }[] = [];
        for (const p of pedidos) {
          const sistema = texto(p.sistema, 20);
          if (!SISTEMAS.includes(sistema)) continue;
          // Mesma regra do salvarPapel: sistema aposentado nao ganha conta nova.
          if (SO_LEITURA.has(sistema)) {
            recusados.push({ sistema, erro: RECADO_SO_LEITURA });
            continue;
          }
          if (sistema === "rh" && !linha.colaborador) {
            recusados.push({ sistema, erro: "O RH so aceita conta ligada a uma ficha de colaborador. Preencha \"Quem e no RH\"." });
            continue;
          }
          const r = await chamarEquipe({
            acao: "salvarConta",
            sistema,
            usuario: await alvoParaEscrever(linha, sistema),
            nome: linha.nome,
            papel: papelNoSistema(sistema, p.papel, p.permissoes ?? []),
            permissoes: Array.isArray(p.permissoes) ? p.permissoes : [],
            // O vinculo com o vendedor tem de ir na CRIACAO: gravado so depois,
            // a pessoa passa o primeiro dia vendo a mesa do time inteiro.
            ...(p.vendedorId ? { vendedorId: texto(p.vendedorId, 120) } : {}),
            senha,
            // Porta compartilhada nasce com a definitiva (ver definirSenha): o
            // gatilho da guarda ja nao marca a pessoa de funcao como provisoria.
            temporaria: linha.tipo !== "funcao",
          });
          if (!r.ok) { recusados.push({ sistema, erro: r.erro || "nao consegui" }); continue; }
          entraram.push(sistema);
          // O ACEITO, nao o pedido: guardar o pedido faria esta tabela afirmar
          // um modulo que o servidor descartou.
          const pedidas = Array.isArray(p.permissoes) ? p.permissoes : [];
          await sb.from("acesso_papel").upsert({
            conta_id: nova.id, sistema, papel: texto(p.papel, 40),
            permissoes: pedidas.filter((x: string) => !(r.descartados ?? []).includes(x)),
            vendedor_id: texto(p.vendedorId, 120), ativo: true,
          }, { onConflict: "conta_id,sistema" });
          if (r.aviso) recusados.push({ sistema, erro: r.aviso });
        }
        /* A PORTA DA FRENTE, tambem na criacao. Sem isto, a pessoa nascia
           entrando por cada sistema no link direto e sendo RECUSADA na entrada
           unica -- que e a porta que a equipe usa e a que o Painel tenta
           primeiro. Nao se cria usuario no Supabase Auth aqui de proposito: a
           primeira entrada faz isso, e e la que mora a regra de adotar a
           identidade que a pessoa ja tem no RH em vez de criar uma segunda. */
        const avisosNovo = await senhaNaPortaDaFrente(nova, senha);
        for (const a of avisosNovo) recusados.push({ sistema: "entrada", erro: a });

        // A senha volta UMA vez, para a tela mostrar e a direcao passar adiante.
        // Ela nao fica guardada em lugar nenhum legivel.
        return resposta({ ok: true, conta: nova, senha, entraram, recusados });
      }

      // ------------------------------------------------------------ nova senha
      /* ================================================================
         (B) DEFINIR UMA SENHA PARA ESTA PESSOA EM TODOS OS SISTEMAS
         (contrato das senhas, 26/09/2026). So a direcao, uma pessoa por clique.

         Substitui a de antes, com o mesmo nome e o mesmo corpo (a tela manda
         so `usuario`), porque a de antes era a perigosa e nao podia ficar viva
         ao lado. O que ela fazia e deixou de fazer:
           * mandava a `salvarConta` da equipe-auth o papel e os modulos da
             tabela de INTENCAO (acesso_papel). Quando a intencao divergia do
             sistema, "gerar senha" promovia, rebaixava ou tirava modulos do
             Painel sem ninguem pedir. Agora so as colunas de senha mudam, pela
             funcao de banco, e papel nenhum e reenviado;
           * um sistema por vez, por HTTP, sem desfazer nada quando o do meio
             falhava, e respondia `ok: true` mesmo sem ter trocado nada. Agora
             o banco muda numa transacao so e a resposta diz o que valeu onde;
           * nao reservava a pessoa, e o log dizia `por = central`;
           * apagava a guarda da entrada antes de gravar a nova.
         ================================================================ */
      case "definirSenha": {
        // 1. A PORTA NO MODO ESTRITO: banco sem responder se o cracha vale nao
        // deixa definir senha de ninguem.
        if (await crachaRevogado(sb, "painel", sessao, true)) {
          return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        }
        const direcao = normalizar(sessao.sub);
        const por = `painel:${direcao}`;
        const indisponivel = () => resposta({ erro: "Não consegui ler as contas agora. Tente de novo em instantes." }, 503);

        // 2. UMA PESSOA, e a senha dentro da regra (quando a direcao digitou).
        if (pedidoEmLote(corpo)) return resposta({ erro: "Uma pessoa por vez." }, 400);
        const usuario = typeof corpo.usuario === "string" ? corpo.usuario.trim().toLowerCase() : "";
        if (!usuario || usuario.length > 60 || !/^[a-z0-9._-]+$/.test(usuario)) {
          return resposta({ erro: "Escolha uma pessoa." }, 400);
        }
        const pedida = senhaPedida(corpo.senha);
        if ("erro" in pedida) return resposta({ erro: pedida.erro }, 400);

        /* FREIO DE LOTE: mais de 10 pessoas em 15 minutos da 429. Nenhum uso
           real chega perto disso; um laco por script para aqui. Banco sem
           responder NAO deixa passar: e caminho de escrita de senha. */
        const { data: travou, error: erroFreio } = await sb.rpc("porta_travada", { p_sistema: "definir-senha", p_usuario: direcao });
        if (erroFreio) return resposta({ erro: "Não consegui conferir o limite de trocas agora. Tente de novo em instantes." }, 503);
        if (travou === true) {
          await registrarSenha({ p_sistema: "definir-senha", p_usuario: direcao, p_acao: "troca-barrada", p_por: por, p_detalhe: "freio de lote" });
          return resposta({ erro: "Muitas senhas definidas em pouco tempo. Espere 15 minutos." }, 429);
        }

        // 3. A PESSOA.
        const { data: conta, error: erroConta } = await sb.from("acesso_conta").select("*").eq("usuario", usuario).maybeSingle();
        if (erroConta) return indisponivel();
        if (!conta) return resposta({ erro: "Conta não encontrada." }, 404);
        if (normalizar(conta.usuario) === direcao) {
          return resposta({ erro: "A sua própria senha se troca em Minha conta." }, 400);
        }
        if (conta.ativo === false) {
          return resposta({ erro: "Esta pessoa está desativada. Reative antes de definir uma senha." }, 409);
        }
        const { data: papeis, error: erroPapeis } = await sb.from("acesso_papel").select("*").eq("conta_id", conta.id);
        if (erroPapeis) return indisponivel();
        if (!papeis?.length) {
          return resposta({ erro: "Esta pessoa não tem acesso a nenhum sistema. Dê um acesso antes de definir a senha." }, 409);
        }

        // 4. A RESERVA: (A) e (B) da mesma pessoa ao mesmo tempo, a segunda espera.
        const operacao = crypto.randomUUID();
        const { data: reservou, error: falhaReserva } = await sb.rpc("painel_senha_reservar", { p_usuario: conta.usuario, p_operacao: operacao });
        if (falhaReserva) return indisponivel();
        if (!reservou) return resposta({ erro: "Já há uma troca de senha em andamento para esta pessoa. Espere um minuto." }, 409);
        try {
          let lojas: Lojas;
          try {
            lojas = await lerLojas(sb, { modo: "direcao", conta, papeis, direcao });
          } catch (e) {
            if (e instanceof FalhaLeitura) return indisponivel();
            throw e;
          }
          // A entrada desta pessoa e tambem a de outra conta: a senha nova
          // valeria para as duas. Nada e gravado ate o vinculo ser corrigido.
          if (lojas.conflito) {
            await registrarSenha({ p_sistema: "*", p_usuario: conta.usuario, p_acao: "senha-nao-definida", p_por: por, p_detalhe: lojas.conflito });
            return resposta({ erro: `Nada mudou: ${lojas.conflito}. Corrija o vínculo antes de definir a senha.` }, 409);
          }

          /* 5. A SENHA. Provisoria, com uma excecao: CONTA DE FUNCAO (porta
             compartilhada) recebe a definitiva. Obrigar a troca ali faria o
             primeiro que entrasse escolher uma senha que os outros da mesma
             porta nao sabem. */
          const senha = pedida.senha;
          const temporaria = String(conta.tipo ?? "") !== "funcao";
          const detalhe = temporaria ? "definida pela direção, temporária" : "definitiva, porta compartilhada";
          const reg = await hashSenha(senha);
          const naoDefinida = (motivo: string) => registrarSenha({
            p_sistema: "*", p_usuario: conta.usuario, p_acao: "senha-nao-definida", p_por: por, p_detalhe: motivo,
          });

          /* 6. O BANCO PRIMEIRO, numa transacao so. Falhou: nada mudou, e a
             senha NAO volta na resposta (ela nao vale em lugar nenhum). O
             `antes` fica so na memoria, para desfazer; nunca sai daqui. */
          const { data: gravou, error: erroGravar } = await sb.rpc("acesso_senha_gravar", {
            p_conta: conta.id, p_equipe: lojas.equipe, p_painel: lojas.painel,
            p_hash: reg, p_temporaria: temporaria, p_origem: "direcao",
          });
          if (erroGravar || !gravou?.antes) {
            const motivo = motivoSeguro(erroGravar ?? "gravação não confirmada", [senha]);
            await naoDefinida(`banco recusou: ${motivo}`);
            return resposta({ erro: `Nada mudou: não consegui gravar (${motivo}). A senha anterior continua valendo.` }, 500);
          }

          /* 7. A ENTRADA UNICA (E), DEPOIS do banco. Aqui a ordem e a contraria
             da troca propria porque a senha anterior NAO e conhecida: o Auth
             nao se desfaz, entao ele vem depois do que se desfaz. */
          if (lojas.authUserId) {
            const { error: erroE } = await sb.auth.admin.updateUserById(lojas.authUserId, { password: senha });
            /* RECUSA CERTA OU DUVIDA? 4xx e o GoTrue dizendo nao: a entrada
               ficou com a anterior. Rede caida ou 5xx podem ter gravado e so
               perdido a resposta; desfazer o banco nesse caso e dizer "nada
               mudou" deixava a pessoa com uma senha que ninguem sabe na porta
               que abre todos. Na duvida, pergunta-se ao proprio Auth: a senha
               nova abre? */
            const aceitou = !erroE ? "sim" : recusaCerta(erroE) ? "nao" : await entradaAceitou(lojas.authUserId, senha);
            if (aceitou !== "sim") {
              const motivo = motivoSeguro(erroE, [senha]);
              const { error: erroRepor } = await sb.rpc("acesso_senha_repor", {
                p_conta: conta.id, p_antes: gravou.antes, p_hash_gravado: reg.hash,
              });
              await naoDefinida(`entrada ${aceitou === "nao" ? "recusou" : "não confirmou"}: ${motivo}${erroRepor ? "; desfazer também falhou" : ""}`);
              if (erroRepor) {
                return resposta({ erro: aceitou === "nao"
                  ? "A senha nova ficou nos sistemas, mas a entrada pelo Painel continua com a anterior. Clique de novo: a próxima tentativa regrava todos."
                  : "A senha nova ficou nos sistemas, e não consegui confirmar a entrada pelo Painel. Clique de novo: a próxima tentativa regrava todos." }, 500);
              }
              if (aceitou === "nao-sei") {
                return resposta({ erro: `Não consegui confirmar se a entrada pelo Painel recebeu a senha nova (${motivo}). Os outros sistemas continuam com a anterior. Clique de novo: a próxima tentativa regrava todos.` }, 500);
              }
              return resposta({ erro: `Nada mudou: a entrada pelo Painel recusou a senha nova (${motivo}). A senha anterior continua valendo em todos.` }, 500);
            }
          }

          // 8. O RH COM IDENTIDADE PROPRIA, por ultimo. Recusou: parcial.
          const falhasRh: string[] = [];
          const rhTrocados: string[] = [];
          for (const r of lojas.rh) {
            const { error } = await sb.auth.admin.updateUserById(r.userId, { password: senha });
            // Erro que nao e recusa certa pode ter gravado: pergunta ao Auth.
            if (!error || (!recusaCerta(error) && (await entradaAceitou(r.userId, senha)) === "sim")) rhTrocados.push(r.userId);
            else falhasRh.push(motivoSeguro(error, [senha]));
          }

          /* 9. SENHA NOVA DERRUBA QUEM ESTA DENTRO, senao a sessao antiga
             continua valendo e "troquei a senha dela" nao significa nada.
             (So o Auth: os crachas do Painel e das equipes seguem ate vencer,
             pendencia antiga da entrada unica.) */
          if (lojas.authUserId) await derrubarSessoes(lojas.authUserId);
          for (const id of rhTrocados) await derrubarSessoes(id);

          const sistemas = lojas.sistemas.map((item) => {
            if (item.sistema === "rh" && item.resultado === "trocada" && falhasRh.length) {
              return {
                sistema: "rh", resultado: "falhou" as const,
                motivo: lojas.rh.length > 1 ? `${falhasRh.length} de ${lojas.rh.length} identidades do RH recusaram: ${falhasRh[0]}` : falhasRh[0],
              };
            }
            if (item.resultado === "trocada" || item.resultado === "pela-entrada") {
              return { ...item, obriga: temporaria && OBRIGA_TROCA[item.sistema] === true };
            }
            return item;
          });
          const parcial = sistemas.some((i) => i.resultado === "falhou");

          // 10. O RASTRO: "quem trocou de quem", sem a senha.
          for (const linha of linhasDoLog(lojas, sistemas, { entrada: true, por, detalhe })) {
            await registrarSenha(linha);
          }

          /* A SENHA VOLTA UMA VEZ, nesta resposta (Cache-Control: no-store), para
             a direcao passar adiante. Nao fica guardada em lugar nenhum legivel.
             `trocados`/`recusados` sao o formato de antes: a tela antiga, presa
             numa aba, continua mostrando o que nao alcancou. */
          return resposta({
            ok: true, senha, temporaria, parcial, entrada: "trocada", sistemas,
            trocados: ["entrada", ...sistemas.filter((i) => i.resultado === "trocada").map((i) => i.sistema)],
            recusados: sistemas
              .filter((i) => i.resultado === "sem-conta" || i.resultado === "fora" || i.resultado === "falhou")
              .map((i) => ({ sistema: i.sistema, erro: i.motivo ?? "" })),
          });
        } finally {
          const { error } = await sb.from("painel_senha_operacao").delete().eq("usuario", conta.usuario).eq("operacao", operacao);
          if (error) console.error("[painel-acesso] reserva de troca aguarda expiração");
        }
      }

      // ------------------------------------------------------------- desativar
      case "desativar": {
        const id = await contaPorUsuario(corpo.usuario);
        if (!id) return resposta({ erro: "Conta nao encontrada." }, 404);
        const { data: conta } = await sb.from("acesso_conta").select("*").eq("id", id).single();
        const ativo = corpo.ativo === true;

        const { data: papeis } = await sb.from("acesso_papel").select("*").eq("conta_id", id);
        const feitos: string[] = [];
        const recusados: { sistema: string; erro: string }[] = [];
        const realDes = await estadoReal();
        for (const p of papeis ?? []) {
          /* O TEXTO DAQUI ERA FALSO NOS DOIS CASOS, e a tela repetia o falso.
             · Painel: o painel-auth SEMPRE consultou acesso_conta.ativo antes de
               conferir a senha -- desativar ja fechava a porta dele. Dizer que
               nao fechava fazia a direcao procurar um caminho que nao precisava.
             · RH: `perfis` ganhou coluna `ativo` em 17/08/2026, e o sync passou
               a exigi-la. Era o unico dos oito que ficava aberto depois do
               desligamento.
             Os dois agora entram no fluxo normal e voltam em `feitos`. */
          if (p.sistema === "painel") {
            feitos.push(p.sistema);      // a porta ja le acesso_conta.ativo
            continue;
          }
          if (p.sistema === "rh") {
            /* ESCREVER PELA FICHA, e CONFERIR QUE ATINGIU ALGUEM.
               `update` que nao acha ninguem devolve sucesso com zero linhas -- e
               foi assim que esta tela passou a dizer "fechei o RH" para gente que
               continuava entrando. `.select()` faz o PostgREST devolver as linhas
               atingidas, e lista vazia aqui e RECUSA, nao sucesso. */
            const ficha = texto(conta.colaborador_id, 120);
            const consulta = sb.from("perfis").update({ ativo });
            const { data: linhas, error } = ficha
              ? await consulta.eq("colaborador_id", ficha).select("user_id")
              : await consulta.eq("usuario", normalizar(texto(conta.colaborador, 160))).select("user_id");
            if (error) recusados.push({ sistema: "rh", erro: error.message });
            else if (!linhas?.length) {
              recusados.push({
                sistema: "rh",
                erro: 'nao achei o perfil desta pessoa no RH -- confira "Quem e no RH" na ficha dela',
              });
            } else feitos.push("rh");
            continue;
          }
          /* Em sistema aposentado, DESATIVAR passa (reduz acesso) e REATIVAR
             nao: religar uma conta no DRE e o mesmo buraco da senha nova, por
             outro botao. */
          if (ativo && SO_LEITURA.has(p.sistema)) {
            recusados.push({ sistema: p.sistema, erro: RECADO_SO_LEITURA });
            continue;
          }
          const login = await alvoParaEscrever(conta, p.sistema, p);
          // Sem conta la nao ha o que desativar. Deixar seguir devolvia o erro
          // "Defina uma senha de ao menos 6 caracteres" -- verdadeiro para a
          // equipe-auth e incompreensivel para quem so queria desligar alguem.
          if (!(await acharNoSistema(p.sistema, login, realDes))) {
            recusados.push({ sistema: p.sistema, erro: `nao existe conta "${login}" ali` });
            continue;
          }
          const r = await chamarEquipe({
            acao: "salvarConta", sistema: p.sistema,
            usuario: login, nome: conta.nome,
            papel: p.papel, ativo,
          });
          if (r.ok) feitos.push(p.sistema);
          else recusados.push({ sistema: p.sistema, erro: r.erro || "nao consegui" });
        }
        await sb.from("acesso_conta")
          .update({ ativo, atualizado_em: new Date().toISOString() }).eq("id", id);
        await sb.from("acesso_papel").update({ ativo }).eq("conta_id", id);
        /* DERRUBAR A SESSAO ABERTA. O cracha dos sistemas para de valer em ate
           60s (public.acesso_revogado), mas a sessao do Supabase Auth se renova
           sozinha para sempre -- quem estivesse com o RH aberto continuaria. */
        if (!ativo && conta.auth_user_id) await derrubarSessoes(conta.auth_user_id);
        return resposta({ ok: true, feitos, recusados });
      }

      // O SISTEMA DE VERDADE PRIMEIRO, a tabela nova depois. Se a ordem fosse
      // ao contrario, um papel recusado la ficaria marcado aqui -- e a tela
      // mostraria um acesso que a pessoa nao tem.
      case "salvarPapel": {
        const p = corpo.papel ?? {};
        const sistema = texto(p.sistema, 20);
        if (!SISTEMAS.includes(sistema)) return resposta({ erro: "Sistema desconhecido." }, 400);
        const id = await contaPorUsuario(p.usuario);
        if (!id) return resposta({ erro: "Conta nao encontrada." }, 404);
        const { data: conta } = await sb.from("acesso_conta").select("*").eq("id", id).single();

        if (sistema === "rh" && !texto(conta.colaborador, 160)) {
          return resposta({ erro: 'O RH so aceita conta ligada a uma ficha de colaborador. Preencha "Quem e no RH" antes.' }, 400);
        }

        // O login gravado manda; so quem nao tem cai no palpite de sempre.
        const { data: papelAtual } = await sb.from("acesso_papel")
          .select("login, vendedor_id, permissoes").eq("conta_id", id).eq("sistema", sistema).maybeSingle();
        // ESCRITA: o RH e procurado la por nome, nao por id -- ver alvoParaEscrever.
        const login = texto(p.login, 160) || await alvoParaEscrever(conta, sistema, papelAtual);

        // Conta nova naquele sistema nasce com senha temporaria; conta que ja
        // existe nao tem a senha mexida.
        //
        // CRIAR PASSOU A SER PEDIDO EXPLICITO (`criar: true`). Antes, qualquer
        // gravacao de papel numa linha divergente criava uma conta nova la:
        // mudar o papel de alguem cujo login estava errado nao trocava o papel
        // dele, inventava outra pessoa com o mesmo nome. Marcar a caixa do
        // sistema (dar acesso) manda `criar`; o seletor de papel, nao.
        const nova = !(await acharNoSistema(sistema, login));
        if (nova && SO_LEITURA.has(sistema)) return resposta({ erro: RECADO_SO_LEITURA }, 400);
        if (nova && corpo.criar !== true) {
          return resposta({
            erro: `Nao existe a conta "${login}" no ${sistema}. Aponte para uma conta que ja existe la, ou peca para criar.`,
            precisaCriar: true, login,
          }, 409);
        }
        const pedida = nova ? senhaPedida(corpo.senha) : { senha: "" };
        if ("erro" in pedida) return resposta({ erro: pedida.erro }, 400);
        const senha = pedida.senha;

        const r = await chamarEquipe({
          acao: "salvarConta", sistema,
          usuario: login, nome: conta.nome,
          papel: papelNoSistema(sistema, p.papel, p.permissoes ?? []),
          /* AUSENTE TEM DE SER AUSENTE, e nao lista vazia. A painelSalvar da
             equipe-auth decide assim:
                 Array.isArray(body.permissoes) ? filtrar(body.permissoes)
                                                : (atual?.permissoes ?? [])
             ou seja, mandar `[]` APAGA os modulos de quem tem Painel; so a
             CHAVE FALTANDO preserva. Enquanto so o quadro de caixinhas chamava
             esta acao (e ele sempre manda a lista), a mina nao explodia --
             qualquer botao novo que grave papel sem falar de modulo a pisaria,
             e o efeito seria a pessoa perder o painel inteiro sem uma palavra. */
          ...(p.permissoes === undefined
            ? {}
            : { permissoes: Array.isArray(p.permissoes) ? p.permissoes : [] }),
          // O vinculo com o vendedor ia SO para a tabela daqui, e a porta antiga
          // (painel-auth) le de painel_contas -- entao quem entrasse pelo link
          // direto do Painel ficava sem fila. Ausente continua preservando dos
          // dois lados.
          ...(p.vendedorId === undefined ? {} : { vendedorId: texto(p.vendedorId, 120) }),
          ...(senha ? { senha, temporaria: true } : {}),
        });
        if (!r.ok) return resposta({ erro: r.erro || "Nao consegui dar esse acesso." }, 400);

        // Guarda o que de fato foi aceito la, nao o que foi pedido: gravar o
        // pedido inteiro faria esta tabela afirmar um acesso que nao existe.
        const pedidas = Array.isArray(p.permissoes) ? p.permissoes : [];
        const aceitas = pedidas.filter((x: string) => !(r.descartados ?? []).includes(x));
        // Mesmo cuidado na tabela daqui: sem falar de modulo, mantem o que ha.
        const permissoesGravar = p.permissoes === undefined
          ? (papelAtual?.permissoes ?? [])
          : aceitas;
        // vendedorId AUSENTE mantem o que esta gravado. Toda gravacao de papel
        // mandava "" e apagava o vinculo da vendedora -- e nenhuma tela grava
        // ele de volta, entao ela perdia a propria fila de acoes em silencio.
        // O `login` corrigido tem o mesmo cuidado: uma troca de papel nao pode
        // desfazer o apontamento que alguem levou tempo para acertar.
        const { error } = await sb.from("acesso_papel").upsert({
          conta_id: id,
          sistema,
          papel: texto(p.papel, 40),
          permissoes: permissoesGravar,
          login: texto(p.login, 160) || (papelAtual?.login ?? ""),
          vendedor_id: p.vendedorId === undefined
            ? (papelAtual?.vendedor_id ?? "")
            : texto(p.vendedorId, 120),
          ativo: p.ativo !== false,
        }, { onConflict: "conta_id,sistema" });
        if (error) throw new Error(error.message);
        return resposta({ ok: true, senha: senha || undefined, aviso: r.aviso || undefined });
      }

      case "removerPapel": {
        const id = await contaPorUsuario(corpo.usuario);
        const sistema = texto(corpo.sistema, 20);
        if (!id || !SISTEMAS.includes(sistema)) return resposta({ erro: "Pedido invalido." }, 400);
        const { data: conta } = await sb.from("acesso_conta").select("*").eq("id", id).single();

        // Tira do sistema de verdade primeiro. A equipe-auth recusa quando isso
        // deixaria o sistema sem nenhuma conta de gestao -- e essa recusa tem
        // de chegar na tela, nao ser engolida.
        // Vale para os SETE, inclusive rh e painel: a equipe-auth tem handler
        // proprio para os dois (rhRemover apaga o usuario do Auth e a linha de
        // perfis; painelRemover apaga de painel_contas). Pular isso apagava a
        // linha SO daqui e devolvia {ok:true} -- a pessoa continuava entrando.
        const { data: papelRem } = await sb.from("acesso_papel")
          .select("login").eq("conta_id", id).eq("sistema", sistema).maybeSingle();
        const alvoRem = await alvoParaEscrever(conta, sistema, papelRem);
        if (await acharNoSistema(sistema, alvoRem)) {
          const r = await chamarEquipe({ acao: "removerConta", sistema, usuario: alvoRem });
          if (!r.ok) return resposta({ erro: r.erro || "Nao consegui tirar esse acesso." }, 400);
        }
        await sb.from("acesso_papel").delete().eq("conta_id", id).eq("sistema", sistema);
        return resposta({ ok: true });
      }

      // ------------------------------------------------------- apontar login
      // "Esta pessoa, NESTE sistema, chama-se assim." Nao escreve nada no
      // sistema: so acerta o apontamento, que e o que estava errado.
      //
      // Serve para os dois lados do mesmo problema: adotar uma conta solta
      // (o `leo` do PCP, que e o dono com o nome curto) e desfazer um
      // apontamento errado (mandar "" volta para a regra deduzida).
      case "apontarLogin": {
        const sistema = texto(corpo.sistema, 20);
        if (!SISTEMAS.includes(sistema)) return resposta({ erro: "Sistema desconhecido." }, 400);
        const id = await contaPorUsuario(corpo.usuario);
        if (!id) return resposta({ erro: "Conta nao encontrada." }, 404);
        const { data: conta } = await sb.from("acesso_conta").select("*").eq("id", id).single();
        const login = texto(corpo.login, 160);

        const real = await estadoReal();
        const achado = login ? await acharNoSistema(sistema, login, real) : null;
        if (login && !achado) {
          return resposta({ erro: `Nao existe a conta "${login}" no ${sistema}.` }, 404);
        }

        // DUAS PESSOAS NO MESMO LOGIN e o mesmo estrago de outro jeito: as duas
        // telas diriam "ok" e uma trocaria a senha da outra. O dono do
        // apontamento tem de ser um so.
        if (login) {
          const { data: outros } = await sb.from("acesso_papel")
            .select("conta_id, login").eq("sistema", sistema).neq("conta_id", id);
          // Uma leitura so: com um SELECT por linha, acertar as dezessete
          // divergencias custaria centenas de idas ao banco.
          const ids = (outros ?? []).map((o: any) => o.conta_id);
          const { data: donos } = ids.length
            ? await sb.from("acesso_conta").select("*").in("id", ids)
            : { data: [] as any[] };
          const porId = new Map((donos ?? []).map((d: any) => [d.id, d]));
          for (const o of outros ?? []) {
            const dono = porId.get(o.conta_id);
            if (!dono) continue;
            if (normalizar(alvoNoSistema(dono, sistema, o)) === normalizar(login)) {
              return resposta({ erro: `Esse login ja e de ${dono.nome || dono.usuario} no ${sistema}.` }, 409);
            }
          }
        }

        const { data: antes } = await sb.from("acesso_papel")
          .select("*").eq("conta_id", id).eq("sistema", sistema).maybeSingle();
        const { error } = await sb.from("acesso_papel").upsert({
          conta_id: id, sistema,
          // O PAPEL VEM DE LA, nao daqui: adotar a conta e aceitar o que ela e.
          // Guardar o papel antigo faria a tela seguir mentindo, so que sobre
          // outra coisa.
          papel: sistema === "painel" ? "" : (achado?.papel ?? antes?.papel ?? ""),
          permissoes: achado?.permissoes ?? antes?.permissoes ?? [],
          login,
          vendedor_id: antes?.vendedor_id ?? "",
          ativo: antes?.ativo ?? true,
        }, { onConflict: "conta_id,sistema" });
        if (error) throw new Error(error.message);
        return resposta({ ok: true, login, papel: achado?.papel ?? "" });
      }

      // -------------------------------------------------- senha de UM sistema
      // A senha da pessoa nao e a mesma em todo lugar (ainda), e trocar as sete
      // de uma vez para consertar uma so era o caminho mais caro possivel:
      // quem tinha a senha do RH na cabeca perdia ela para consertar o PCP.
      case "senhaDoSistema": {
        // Grava senha: a porta confere no modo estrito, como em definirSenha.
        if (await crachaRevogado(sb, "painel", sessao, true)) {
          return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        }
        const sistema = texto(corpo.sistema, 20);
        if (!SISTEMAS.includes(sistema)) return resposta({ erro: "Sistema desconhecido." }, 400);
        // A regra da senha antes de qualquer leitura ou ficha: nada aparado.
        const pedida = senhaPedida(corpo.senha);
        if ("erro" in pedida) return resposta({ erro: pedida.erro }, 400);
        const senha = pedida.senha;
        const direcao = normalizar(sessao.sub);
        const id = await contaPorUsuario(corpo.usuario);
        if (!id) return resposta({ erro: "Conta nao encontrada." }, 404);
        const { data: conta } = await sb.from("acesso_conta").select("*").eq("id", id).single();
        if (SO_LEITURA.has(sistema)) return resposta({ erro: RECADO_SO_LEITURA }, 400);
        /* AS MESMAS PORTAS FECHADAS DO "DEFINIR SENHA EM TODOS". Sem elas, este
           era o outro caminho: a senha da propria direcao (que so se troca em
           Minha conta, provando a atual) saia na tela, sistema por sistema, de
           um cracha de 12 horas; e pessoa desativada ganhava senha nova para
           quando alguem a religasse. */
        if (normalizar(conta.usuario) === direcao) {
          return resposta({ erro: "A sua própria senha se troca em Minha conta." }, 400);
        }
        if (conta.ativo === false) {
          return resposta({ erro: "Esta pessoa está desativada. Reative antes de definir uma senha." }, 409);
        }
        const { data: papel } = await sb.from("acesso_papel")
          .select("*").eq("conta_id", id).eq("sistema", sistema).maybeSingle();
        if (!papel) return resposta({ erro: `Essa pessoa nao tem acesso ao ${sistema}.` }, 404);

        const login = await alvoParaEscrever(conta, sistema, papel);
        const achado = await acharNoSistema(sistema, login);
        if (!achado) {
          return resposta({
            erro: `Nao existe a conta "${login}" no ${sistema} — aponte para a conta certa antes de trocar a senha.`,
          }, 404);
        }
        // O login dela ali tambem e de outra pessoa (ou da direcao): a senha
        // nova seria de quem nao foi clicado. Ver donosDeFora.
        let divide: string | null;
        try {
          divide = await lojaDeOutro(sb, conta, sistema, login, direcao);
        } catch (e) {
          if (e instanceof FalhaLeitura) return resposta({ erro: "Não consegui ler as contas agora. Tente de novo em instantes." }, 503);
          throw e;
        }
        if (divide) {
          return resposta({ erro: sistema === "rh"
            ? `A ficha do RH desta pessoa também está ligada a ${divide}. Corrija o vínculo antes de trocar a senha.`
            : `O login "${login}" no ${sistema} também é de ${divide}. Aponte cada pessoa para a própria conta antes de trocar a senha.` }, 409);
        }
        /* NO RH DE QUEM TEM A IDENTIDADE COMPARTILHADA, "SO ESTE SISTEMA" NAO
           EXISTE. Para quem foi adotado do RH na primeira entrada, o usuario do
           Auth do RH E o da entrada unica: trocar "so o RH" trocava a senha da
           porta que abre todos, enquanto a tela prometia o contrario. Aqui
           recusa e manda para a acao que troca em todos, que diz a verdade. */
        if (sistema === "rh" && conta.auth_user_id) {
          const { data: perfis, error: erroPerfis } = await sb.from("perfis").select("user_id, usuario, colaborador_id");
          if (erroPerfis) return resposta({ erro: "Não consegui ler as contas agora. Tente de novo em instantes." }, 503);
          const doRh = perfisDaPessoa(conta, perfis ?? []).perfis;
          if (doRh.some((p: any) => String(p.user_id) === String(conta.auth_user_id))) {
            return resposta({
              erro: "No RH desta pessoa a senha é a mesma da entrada pelo Painel. Use Definir senha em todos os sistemas.",
            }, 409);
          }
        }
        /* O MESMO FREIO DE LOTE do "Definir senha em todos", no mesmo balde:
           sem ele, um laco por script trocava a senha de todo mundo, sistema
           por sistema, sem limite nenhum. Banco sem responder nao deixa passar. */
        const { data: travou, error: erroFreio } = await sb.rpc("porta_travada", { p_sistema: "definir-senha", p_usuario: direcao });
        if (erroFreio) return resposta({ erro: "Não consegui conferir o limite de trocas agora. Tente de novo em instantes." }, 503);
        if (travou === true) {
          await registrarSenha({ p_sistema: "definir-senha", p_usuario: direcao, p_acao: "troca-barrada", p_por: `painel:${direcao}`, p_detalhe: "freio de lote" });
          return resposta({ erro: "Muitas senhas definidas em pouco tempo. Espere 15 minutos." }, 429);
        }

        const r = await chamarEquipe({
          acao: "salvarConta", sistema, usuario: login, nome: conta.nome,
          // O papel que ESTA la, para uma troca de senha nunca virar promocao
          // ou rebaixamento sem ninguem pedir.
          papel: sistema === "painel"
            ? (achado.permissoes?.includes("*") ? "tudo" : "")
            : achado.papel,
          permissoes: achado.permissoes ?? papel.permissoes ?? [],
          // Porta compartilhada recebe a definitiva, como no "Definir senha em
          // todos": obrigar a troca ali faria o primeiro que entrasse escolher
          // uma senha que os outros da mesma porta nao sabem.
          senha, temporaria: String(conta.tipo ?? "") !== "funcao",
        });
        if (!r.ok) return resposta({ erro: r.erro || "Nao consegui trocar a senha ali." }, 400);
        // O rastro com QUEM trocou: a linha da equipe-auth diz so `por = central`.
        await registrarSenha({
          p_sistema: sistema, p_usuario: login, p_acao: "trocou-senha",
          p_por: `painel:${direcao}`, p_detalhe: "só neste sistema",
        });
        return resposta({ ok: true, senha, login });
      }

      // Nao existe "remover conta" de proposito. Enquanto equipe_contas e
      // painel_contas mandam nos logins, apagar aqui daria a ilusao de ter
      // tirado o acesso de alguem que continua entrando. Para tirar de
      // verdade, hoje, e nas tabelas antigas -- e a tela diz isso.
      default:
        return resposta({ erro: "acao desconhecida" }, 400);
    }
  } catch (e) {
    console.error("[painel-acesso] erro:", e);
    return resposta({ erro: "erro interno" }, 500);
  }
});
