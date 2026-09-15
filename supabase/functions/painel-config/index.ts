// ============================================================================
// painel-config — configuracoes e marcacoes manuais (substitui config.js)
//
// O CONTRATO E O MESMO: get/set/merge com as mesmas chaves. Por dentro, a
// mudanca que importa: ov_rec/ov_orc eram UM JSON com todas as marcacoes, e
// marcar um titulo reescrevia o mapa inteiro -- com leitura eventual, duas
// marcacoes seguidas se atropelavam e uma apagava a outra (defeito real, que
// custou dado no modulo de ativos). Agora cada marcacao e UMA LINHA em
// painel_registros: gravar uma nao toca nas outras, e o merge por campo
// acontece linha a linha. A classe do problema deixa de existir.
//
// O get de ov_rec/ov_orc continua devolvendo o MAPA {id: campos} inteiro,
// remontado das linhas -- o cliente nao sabe que o formato interno mudou.
//
// Permissoes preservadas do original:
//   - marcar titulo (ov_*): qualquer pessoa logada;
//   - mudar as REGRAS (config): so quem tem o modulo "configuracoes" (vale
//     para todo mundo, entao nao e para qualquer um);
//   - ler cache_* (diagnostico): so o x-token do servidor.
// Ate 2026-07-22 essas chaves eram ABERTAS (um POST anonimo alterou a config
// em producao). O porteiro continua obrigatorio.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verificarJwt, crachaRevogado } from "../_shared/cripto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";
const TOKEN = Deno.env.get("PAINEL_TOKEN") ?? "";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// "marketing" guarda os atalhos do Drive; "bancos", as contas bancarias da aba
// Bancos e Pix. Entram como overlay porque o mecanismo e o mesmo: mapa por id,
// merge sem corrida.
// "assinaturas" sao as contas dos SISTEMAS (Supabase, GitHub, Claude...): dia
// do vencimento, valor e o mes que ja foi pago. Mesmo mecanismo, um registro
// por servico.
const OVERLAYS = new Set(["ov_rec", "ov_orc", "marketing", "bancos", "glossario", "compromissos", "manutencoes", "patrimonio", "setores", "assinaturas", "permutas", "cobrancas", "campanhas", "grupos_clientes", "planilhas"]);
/* A CONCESSAO DE SETOR FICA DE FORA DE `OVERLAYS`, e isso e a tranca, nao um
   esquecimento. Chave fora dali morre sozinha nos tres verbos genericos:
   `get` responde "chave invalida", `merge` e `removerId` respondem "chave nao
   gravavel". Para abri-la seria preciso um acrescimo DELIBERADO nesta linha --
   e ai o `conferir-papel.mjs` cobra o par em MODULO_DA_CHAVE. A unica porta e
   a acao `setoresDaPessoa`/`salvarSetoresDaPessoa`, master-only, la embaixo. */
const COLECAO_ACESSO_SETOR = "planilhas_acesso";
// Chaves em que cada pessoa so enxerga e mexe no que E DELA. A vendedora nao
// pode ver a agenda da colega, e a direcao ve tudo. Isso e checado no
// SERVIDOR: filtrar so na tela seria conforto, nao separacao.
const POR_DONO = new Set(["compromissos"]);
// Modulo que o DESTINO de um encaminhamento precisa ter para receber.
const MODULO_POR_DONO: Record<string, string> = { compromissos: "compromissos" };
// Diagnostico de cache pelo x-token (nomes sem o prefixo cache_ da era Blobs).
const CACHES = new Set(["recebiveis", "pagar", "bancos", "orcamentos", "ordens", "dso_hist", "fluxo_mensal", "status"]);

// ---------------------------------------------------------------- conversa
//
// O compromisso nao e so uma linha de agenda: ele PASSA DE MAO. A Barbara
// levanta a medicao, manda para a Karen fazer o orcamento, volta para a
// Barbara fechar. Sem registro, quem recebe nao sabe o que ja foi feito -- e
// quem passou nao sabe o que aconteceu depois.
//
// O historico mora DENTRO do proprio registro (campo `historico`), nao numa
// colecao de auditoria separada. Duas razoes:
//   1. e a conversa DAQUELA tarefa: separada, ela vira log que ninguem le;
//   2. um log externo com o conteudo dos campos e porta dos fundos do RBAC --
//      ja passamos por isso no RH. Dentro do registro, quem pode ver o
//      compromisso ve a conversa, e quem nao pode nao ve nem uma coisa nem a
//      outra. A regra de acesso e uma so.
//
// Quem escreve no historico e o SERVIDOR, sempre: o cliente manda o texto, e
// quem carimba autor e hora e esta funcao. Cliente que mande `historico` no
// corpo tem o campo ignorado (ver `merge`).
const MAX_ARQUIVO = 4 * 1024 * 1024; // ~3 MB reais depois do base64
const BUCKET = "painel-arquivos";
const MAX_HISTORICO = 200; // conversa longa demais vira registro gigante

type Evento = {
  em: string;
  quem: string;
  quemNome: string;
  tipo: "criou" | "passou" | "recado" | "concluiu" | "reabriu";
  texto?: string;
  para?: string;
  paraNome?: string;
  arquivo?: { chave: string; nome: string; mime: string };
};

const comEvento = (registro: any, ev: Evento) => {
  const antes: Evento[] = Array.isArray(registro?.historico) ? registro.historico : [];
  return [...antes, ev].slice(-MAX_HISTORICO);
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function sessaoDe(req: Request) {
  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const s = m ? await verificarJwt(m[1], JWT_SECRET) : null;
  // Sessao revogada vale como sessao inexistente: quem chama ja sabe recusar.
  return s && (await crachaRevogado(sb, "painel", s)) ? null : s;
}

async function lerConfig(): Promise<any> {
  const { data } = await sb.from("painel_config_global").select("config").eq("id", true).maybeSingle();
  return data?.config ?? null;
}

// Existe conta com esse usuario? Devolve o nome para carimbar no item.
// A direcao pode nao ter linha em painel_contas (enquanto usa a senha inicial
// do ambiente), mas recebe compromisso como qualquer pessoa.
const MASTER_USUARIO = (Deno.env.get("PAINEL_AUTH_MASTER_USUARIO") || "leonardo").trim().toLowerCase();
async function pessoaValida(
  usuario: string,
  moduloExigido?: string,
): Promise<{ usuario: string; nome: string } | null> {
  const u = String(usuario || "").trim().toLowerCase();
  if (!u) return null;
  const { data } = await sb.from("painel_contas")
    .select("usuario, nome, permissoes").eq("usuario", u).maybeSingle();
  if (data) {
    // Existir nao basta: o destino precisa PODER ABRIR a tela, senao o item
    // vira invisivel para todo mundo menos a direcao.
    if (moduloExigido) {
      const perms = Array.isArray(data.permissoes) ? data.permissoes : [];
      if (!perms.includes("*") && !perms.includes(moduloExigido)) return null;
    }
    return { usuario: data.usuario, nome: data.nome || data.usuario };
  }
  if (u === MASTER_USUARIO) return { usuario: u, nome: "Direcao" };
  return null;
}

/* COLECOES QUE NAO PODEM SAIR INTEIRAS.
   `planilhas` e a primeira: cada linha pertence a um SETOR, e quem nao tem
   aquele setor nao pode nem saber que a planilha existe -- o registro carrega o
   id do documento no Google, que e a chave dela (quem tem o id, abre).

   A poda mora AQUI, e nao em cada ramo, porque `lerOverlay` e o funil: sao SEIS
   chamadores (get, os tres merges, evento e permutaAnexo, mais o lerArquivo que
   passa null). Espalhar a poda por seis lugares e garantir que o setimo nasca
   sem ela.

   E por isso o `throw` abaixo em vez de um parametro opcional: parametro que
   pode faltar LIBERA por omissao, e omissao e o que acontece. Nao adianta
   confiar no compilador -- a CI do painel NAO type-checa Edge Function nenhuma
   (`npm run lint` e `eslint src`, e o proprio pages.yml diz isso por escrito).
   Entao a defesa e em tempo de execucao: quem chamar sem crivo recebe 500 na
   primeira vez que o ramo rodar, alto e claro, em vez de devolver a lista
   inteira para quem nao devia. */
const PODADAS = new Set(["planilhas"]);

// Mapa {id: campos} remontado das linhas — o formato que o cliente espera.
// `crivo` recebe o registro e devolve o que pode sair (ou null para esconder a
// linha inteira). Obrigatorio para as colecoes de PODADAS.
async function lerOverlay(
  colecao: string,
  soDoDono?: string | null,
  crivo?: ((reg: unknown, id: string) => unknown | null) | null,
): Promise<Record<string, unknown>> {
  if (PODADAS.has(colecao) && typeof crivo !== "function") {
    throw new Error(`lerOverlay("${colecao}") sem crivo: colecao podada por setor.`);
  }
  const out: Record<string, unknown> = {};
  const PASSO = 1000;
  for (let de = 0; ; de += PASSO) {
    const { data, error } = await sb
      .from("painel_registros").select("id, registro")
      .eq("colecao", colecao).order("id").range(de, de + PASSO - 1);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    for (const r of data ?? []) {
      // Registro sem dono (vindo de backup antigo) so aparece para a direcao.
      if (soDoDono != null && (r.registro as any)?.dono !== soDoDono) continue;
      if (crivo) {
        const podado = crivo(r.registro, r.id);
        if (podado == null) continue;
        out[r.id] = podado;
        continue;
      }
      out[r.id] = r.registro;
    }
    if ((data ?? []).length < PASSO) break;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "use POST" }, 405);
  if (!JWT_SECRET) return resposta({ erro: "Login nao configurado no servidor." }, 503);

  const autenticado = !!TOKEN && req.headers.get("x-token") === TOKEN;
  const sessao = await sessaoDe(req);
  const temModulo = (m: string) =>
    !!sessao &&
    (sessao.master === true ||
      (Array.isArray(sessao.perms) && (sessao.perms.includes("*") || sessao.perms.includes(m))));
  const podeConfigurar = temModulo("configuracoes");

  // As chaves novas sao CONTEUDO de um modulo (contas bancarias, materiais de
  // marca, glossario), nao marcacao de titulo. Sem esta amarra, uma conta com
  // acesso so a Orcamentos lia os CNPJs e as chaves Pix da empresa e apagava
  // termo do glossario -- a permissao existia so na tela.
  //
  // Marcações também seguem a permissão do módulo que as utiliza.
  const MODULO_DA_CHAVE: Record<string, string> = {
    ov_rec: "contas-atrasadas",
    ov_orc: "orcamentos",
    bancos: "bancos",
    marketing: "marketing",
    glossario: "glossario",
    compromissos: "compromissos",
    manutencoes: "manutencoes",
    // Duas chaves, um modulo so: os setores existem para o patrimonio.
    patrimonio: "patrimonio",
    setores: "patrimonio",
    permutas: "permutas",
    campanhas: "campanhas",
    // Sem esta linha `barraChave` cai no `!m` e LIBERA por omissao: qualquer
    // pessoa logada leria a lista inteira de planilhas, com os ids do Google.
    planilhas: "planilhas",
    // Os grupos de compra (CNPJs do mesmo dono) sao vocabulario das analises
    // de venda, que moram na tela de Campanhas.
    grupos_clientes: "campanhas",
    // O diário de cobrança é conteúdo da tela de Contas Atrasadas.
    cobrancas: "contas-atrasadas",
    // As contas dos sistemas sao assunto da direcao: moram na tela de Gestao.
    assinaturas: "gestao",
  };
  // Substituição e exclusão conferem a mesma permissão de leitura e edição.
  const MODULO_APAGAR: Record<string, string> = {
    ov_rec: "contas-atrasadas",
    ov_orc: "orcamentos",
  };
  const barraApagar = (chave: string) => {
    if (!sessao) return null;   // o 401 de cada ramo cuida do sem-sessao
    const m = MODULO_APAGAR[chave];
    if (m && !temModulo(m)) {
      return resposta({ erro: "Apagar marcacoes de " + m + " exige o modulo correspondente." }, 403);
    }
    return null;
  };
  /* LER E GRAVAR NAO SAO A MESMA PERGUNTA -- e ate 15/09/2026 este mapa tratava
     as duas como se fossem uma so.

     A chave `setores` e do Patrimonio: e la que se cria, edita e remove setor.
     Mas MANUTENCOES TAMBEM PRECISA LER a lista, para escrever o nome do setor
     ao lado do carro e da maquina. Com um mapa unico, quem tinha Manutencoes e
     nao tinha Patrimonio levava 403 na leitura; o `Promise.all` da tela
     (src/pages/Manutencoes.jsx) caia inteiro, `itens` ficava null, e a pessoa
     via a pagina de erro dizendo "Voce nao tem acesso a este modulo" -- sobre
     um modulo que ELA TEM. Medido em 15/09/2026: 2 das 10 contas.

     Liberar a chave inteira para `manutencoes` consertaria a leitura e abriria
     a escrita: a tela de Manutencoes passaria a poder APAGAR setor, e apagar
     setor desmancha a etiqueta de todo bem que estava nele. Trocar um defeito
     por outro pior. Por isso o leitor extra e SO LEITOR. */
  const LEITORES_EXTRA: Record<string, string[]> = {
    // A tela de Planilhas escreve o NOME do setor ao lado de cada planilha, e
    // a de conceder mostra "FIN — Financeiro" em vez de uma sigla crua. Ler,
    // so; criar e apagar setor continua sendo do Patrimonio.
    setores: ["manutencoes", "planilhas"],
  };
  /* CADASTRAR PLANILHA E DA DIRECAO -- e "direcao" aqui e `master`, nao o
     `ehDirecao` largo deste arquivo (que tambem aceita `perms.includes("*")`).
     Quem tem o modulo `planilhas` USA a lista; quem a monta e quem responde por
     ela. O link de uma planilha e a chave dela: cadastrar uma planilha no setor
     errado nao e um erro de digitacao, e uma concessao. */
  const barraEscritaDePlanilha = (chave: string) => {
    if (chave !== "planilhas") return null;
    if (sessao?.master === true) return null;
    return resposta({ erro: "Só a direção cadastra, edita e remove planilha." }, 403);
  };
  const barraChave = (chave: string, modo: "ler" | "gravar" = "gravar") => {
    // Sem sessao, quem responde e o 401 de cada ramo: o cliente usa esse 401
    // (com semSessao) para deslogar sozinho. Trocar por 403 aqui esconderia a
    // sessao vencida atras de "voce nao tem acesso".
    if (!sessao) return null;
    const m = MODULO_DA_CHAVE[chave];
    if (!m || temModulo(m)) return null;
    /* `gravar` e o padrao DE PROPOSITO: quem acrescentar um ramo novo e
       esquecer de dizer o modo recebe a regra ESTREITA. Esquecimento que tranca
       aparece no mesmo dia, reclamado por quem trabalha; esquecimento que abre
       ninguem vem reclamar. */
    if (modo === "ler" && (LEITORES_EXTRA[chave] ?? []).some(temModulo)) return null;
    return resposta({ erro: "Voce nao tem acesso a este modulo." }, 403);
  };

  /* ------------------------------------------------------------- SETOR
     A regua fina das Planilhas. Tres decisoes ficam aqui:

     1. SO O MASTER ATRAVESSA. `ehDirecao` (logo abaixo) tambem aceita
        `perms.includes("*")`, e a tela de Acessos NAO chama essa pessoa de
        direcao -- `souDirecao` do cliente e `master === true`. Se a poda usasse
        `ehDirecao`, marcar "Acesso total" para alguem entregaria todas as
        planilhas de todos os setores, sem que a caixa clicada dissesse isso.
        Decisao do dono em 15/09/2026: o setor vale para todo mundo.

     2. A CONCESSAO GUARDA O ID DO SETOR, nunca a sigla. A tela de Patrimonio
        preserva o id e deixa EDITAR a sigla (src/pages/Patrimonio.jsx:468):
        guardar "FIN" faria um "FIN" virar "CTB" revogar todo mundo em silencio,
        e a caixa reapareceria desmarcada como se ninguem tivesse concedido.

     3. FALHA DE LEITURA TRANCA E GRITA. Um `catch` que devolvesse lista vazia
        transformaria banco fora do ar em "voce nao tem setor nenhum" -- zero
        apresentado como resultado. Aqui o erro sobe. */
  const setoresDaPessoa = async (usuario: string): Promise<string[]> => {
    const { data, error } = await sb.from("painel_registros").select("registro")
      .eq("colecao", COLECAO_ACESSO_SETOR).eq("id", usuario).maybeSingle();
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    const lista = (data?.registro as any)?.setores;
    return Array.isArray(lista) ? lista.map(String) : [];
  };

  /* O crivo de `planilhas`. Devolve o registro que pode sair, ou null para a
     linha nem existir para quem esta perguntando -- e nao basta esconder o
     `docId`: o nome da planilha ja conta o que a casa tem. */
  const crivoDe = async (chave: string) => {
    if (chave !== "planilhas") return null;
    // O master ve tudo -- mas passa pelo crivo do mesmo jeito, para o
    // `lerOverlay` nunca ser chamado sem ele nesta colecao.
    if (sessao?.master === true) return (reg: unknown) => reg;
    const meus = new Set(await setoresDaPessoa(String(sessao?.sub ?? "")));
    return (reg: unknown) => {
      const setor = String((reg as any)?.setor ?? "");
      return setor && meus.has(setor) ? reg : null;
    };
  };

  // Quem NAO e direcao so enxerga e mexe no que e dela nas chaves POR_DONO.
  const ehDirecao = sessao?.master === true ||
    (Array.isArray(sessao?.perms) && sessao.perms.includes("*"));
  const donoDaVez = (chave: string) =>
    POR_DONO.has(chave) && !ehDirecao ? String(sessao?.sub ?? "") : null;
  // Mexer em linha de outra pessoa: barra. Linha que ainda nao existe passa
  // (esta nascendo), e o dono correto e carimbado na gravacao.
  const barraDono = async (chave: string, id: string) => {
    const escopo = donoDaVez(chave);
    if (!escopo) return null;
    const { data } = await sb.from("painel_registros").select("registro")
      .eq("colecao", chave).eq("id", id).maybeSingle();
    const dono = (data?.registro as any)?.dono;
    if (data && dono !== escopo) {
      return resposta({ erro: "Este compromisso nao e seu." }, 403);
    }
    return null;
  };

  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: "json invalido" }, 400);
  }

  try {
    switch (corpo.action) {
      case "ping":
        return resposta({ ok: true });

      case "get": {
        const chave = String(corpo.chave ?? "");
        // Compatibilidade: o cliente antigo pede "cache_status" etc.
        const semPrefixo = chave.startsWith("cache_") ? chave.slice(6) : null;

        if (semPrefixo !== null) {
          if (!CACHES.has(semPrefixo)) return resposta({ erro: "chave invalida" }, 400);
          /* O MARCADOR `semSessao` E O QUE FAZ O CLIENTE VOLTAR AO LOGIN
             (lib/sessao.js so desloga quando ele vem). Este era o unico 401 de
             sessao sem ele: com o cracha vencido, a tela ficava presa num erro
             generico em vez de pedir para entrar de novo. Quando a recusa e do
             x-token (maquina, nao pessoa), o marcador nao vai -- deslogar
             alguem por causa de um token de servico seria pior. */
          if (!autenticado) {
            return resposta({ erro: sessao ? "nao autorizado" : "Entre no sistema.", semSessao: !sessao }, 401);
          }
          const { data } = await sb.from("painel_cache").select("valor").eq("chave", semPrefixo).maybeSingle();
          return resposta({ ok: true, chave, valor: data?.valor ?? null });
        }

        if (chave === "config") {
          if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
          // A config e uma so, mas nem tudo nela e para todo mundo. Motivos,
          // regua de cobranca e nomes de vendedor sao vocabulario das telas --
          // quem abre Orcamentos precisa deles. Ja `parametros` e dinheiro da
          // casa (colchao minimo de caixa, saldo inicial, valor minimo de
          // orcamento): quem nao abre nenhuma tela financeira nao tem por que
          // receber esses numeros. O cliente completa com os padroes dele.
          const cfg = await lerConfig();
          const veDinheiro = ["fluxo-caixa", "contas-atrasadas", "orcamentos", "produtos", "configuracoes"]
            .some((m) => temModulo(m));
          if (cfg && !veDinheiro) {
            const { parametros: _fora, ...resto } = cfg as any;
            return resposta({ ok: true, chave, valor: resto });
          }
          return resposta({ ok: true, chave, valor: cfg });
        }
        if (OVERLAYS.has(chave)) {
          // "ler": o UNICO ramo de leitura desta function. Todos os outros
          // ficam no padrao `gravar`, que e o estreito.
          const barrado = barraChave(chave, "ler");
          if (barrado) return barrado;
          if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
          return resposta({ ok: true, chave, valor: await lerOverlay(chave, donoDaVez(chave), await crivoDe(chave)) });
        }
        return resposta({ erro: "chave invalida" }, 400);
      }

      case "set": {
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        // A substituição integral antiga apagava antes de gravar e perdia
        // alterações concorrentes. A recuperação tem transação própria.
        return resposta({ erro: "Edite cada registro ou use a recuperação de backup para restaurar dados." }, 403);
      }

      // Merge por id. No Blobs isto era le-o-mapa-inteiro + regrava-o-inteiro
      // (a corrida). Aqui cada id e um upsert de UMA linha, fundindo campo a
      // campo com o que a linha ja tem -- dois aparelhos marcando titulos
      // diferentes nunca mais se atropelam.
      case "merge": {
        const chave = String(corpo.chave ?? "");
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        const patch = corpo.patch && typeof corpo.patch === "object" ? corpo.patch : {};

        if (chave === "config") {
          if (!podeConfigurar) return resposta({ erro: "Voce nao tem acesso as Configuracoes." }, 403);
          const { data: merged, error } = await sb.rpc("painel_config_mesclar", {
            p_patch: patch, p_antes: corpo.antes ?? null,
          });
          if (error) throw Object.assign(new Error(error.message), { code: error.code });
          return resposta({ ok: true, valor: merged });
        }

        /* PERMUTA NAO PASSA PELO MERGE GENERICO.
           Duas razoes, e as duas sao de confianca no numero:

           1. O merge le, calcula e grava em tres passos. Perde escrita
              simultanea -- provado contra a producao: dois aceites de O.S.
              disparados juntos terminaram com um so no registro, sem erro
              nenhum. Numa permuta isso e credito que deixa de ser abatido.

           2. O HISTORICO tem que ser verdade. Se ele viesse do cliente, a
              parte interessada reescreveria a propria conta -- e um historico
              assim nao serve para conferir com o parceiro. Quem carimba autor,
              hora e o QUE MUDOU e o banco, comparando o registro antigo com o
              pedido (ver `permuta_mexer`).

           A tela manda `osPatch`, `lancPatch` e os campos no MESMO pedido; a
           funcao aplica tudo numa transacao com a linha travada. */
        /* COBRANÇA: mesmo motivo da permuta -- gravação atômica e autoria
           carimbada pelo servidor. Perder o registro de uma ligação que já
           aconteceu é pior que perder um número: ninguém liga de novo para
           conferir se anotou. */
        if (chave === "cobrancas") {
          const barrado = barraChave(chave);
          if (barrado) return barrado;
          const quem = String(sessao?.sub ?? "");
          const quemNome = String(sessao?.nome || quem);
          for (const [id, campos] of Object.entries(patch)) {
            const c = (campos ?? {}) as Record<string, unknown>;
            if (Object.prototype.hasOwnProperty.call(c, "prioridade")) {
              if (!["alta", "normal", "baixa"].includes(String(c.prioridade)) || "chamadoId" in c || "chamado" in c) {
                return resposta({ erro: "Informe uma prioridade válida separadamente do chamado." }, 400);
              }
              const { error } = await sb.rpc("cobranca_priorizar", { p_id: id, p_cliente: String(c.cliente ?? id), p_prioridade: c.prioridade, p_quem: quem });
              if (error) throw Object.assign(new Error(error.message), { code: error.code });
              continue;
            }
            const { error } = await sb.rpc("cobranca_mexer", {
              p_id: id,
              p_quem: quem,
              p_quem_nome: quemNome,
              p_cliente: String(c.cliente ?? id),
              p_chamado_id: String(c.chamadoId ?? ""),
              p_chamado: c.chamado ?? null,
            });
            if (error) throw Object.assign(new Error(error.message), { code: error.code });
          }
          return resposta({ ok: true, valor: await lerOverlay(chave, donoDaVez(chave), await crivoDe(chave)) });
        }

        /* PERMUTA E CAMPANHA: a mesma maquina (`troca_mexer`), porque e o
           mesmo trabalho -- escolher clientes e aceitar O.S. uma a uma. O que
           muda e a PERGUNTA que a tela faz com isso, e pergunta e conta, nao
           gravacao. Um ramo so aqui e uma funcao so no banco: duplicar a regra
           foi o que deixou o contas a pagar para tras hoje. */
        if (chave === "permutas" || chave === "campanhas") {
          const barrado = barraChave(chave);
          if (barrado) return barrado;
          const quem = String(sessao?.sub ?? "");
          const quemNome = String(sessao?.nome || quem);
          for (const [id, campos] of Object.entries(patch)) {
            const c = (campos ?? {}) as Record<string, unknown>;
            const { osPatch, lancPatch, criar, ...limpos } = c;
            /* TIRAR UM LANCAMENTO LEVA O ANEXO DELE. A funcao apaga o objeto
               inteiro (`v_lanc - k`), e com ele a referencia do arquivo -- os
               bytes ficavam no bucket sem ninguem listar, apagar ou saber que
               existem. A protecao ja existe no `removerId` dos vizinhos e
               faltava so aqui. Le ANTES de mexer; se a gravacao falhar, nada
               foi apagado. */
            const paraApagar: string[] = [];
            if (lancPatch && typeof lancPatch === "object") {
              const tirando = Object.entries(lancPatch as Record<string, unknown>)
                .filter(([, v]) => v === null).map(([k]) => k);
              if (tirando.length) {
                const { data: antes } = await sb.from("painel_registros")
                  .select("registro").eq("colecao", chave).eq("id", id).maybeSingle();
                const lancs = ((antes?.registro as any)?.lancamentos ?? {}) as Record<string, any>;
                for (const k of tirando) {
                  const ch = lancs?.[k]?.anexo?.chave;
                  if (typeof ch === "string" && ch) paraApagar.push(ch);
                }
              }
            }
            const { data: reg, error } = await sb.rpc("troca_mexer", {
              p_colecao: chave,
              p_id: id,
              p_quem: quem,
              p_quem_nome: quemNome,
              p_campos: limpos,
              p_os: (osPatch ?? {}) as Record<string, unknown>,
              p_lancamentos: (lancPatch ?? {}) as Record<string, unknown>,
              p_anexo: null,
              p_criar: criar === true,
            });
            if (error) throw Object.assign(new Error(error.message), { code: error.code });
            if (reg === null) {
              const oQue = chave === "campanhas" ? "campanha" : "permuta";
              return resposta({ erro: `Essa ${oQue} nao existe mais -- recarregue a tela.` }, 409);
            }
            // Gravou: agora os bytes do que saiu podem ir. Falha aqui nao
            // derruba a operacao -- o registro ja esta certo.
            if (paraApagar.length) {
              await sb.storage.from(BUCKET).remove(paraApagar).catch(() => {});
            }
          }
          return resposta({ ok: true, valor: await lerOverlay(chave, donoDaVez(chave), await crivoDe(chave)) });
        }

        if (OVERLAYS.has(chave)) {
          const barrado = barraChave(chave);
          if (barrado) return barrado;
          const barradoPlanilha = barraEscritaDePlanilha(chave);
          if (barradoPlanilha) return barradoPlanilha;
          for (const [id, campos] of Object.entries(patch)) {
            const barradoDono = await barraDono(chave, id);
            if (barradoDono) return barradoDono;
            const { data, error: erroLeitura } = await sb.from("painel_registros").select("registro")
              .eq("colecao", chave).eq("id", id).maybeSingle();
            if (erroLeitura) throw new Error(erroLeitura.message);
            // O CODIGO DA ETIQUETA E GERADO AQUI, nunca no cliente. Ele vai
            // virar adesivo colado no bem: dois computadores cadastrando ao
            // mesmo tempo com a mesma sequencia gerariam duas etiquetas iguais
            // e o inventario passaria a mentir. Gerado uma vez, nunca muda --
            // nem quando o bem troca de setor (o adesivo ja esta colado).
            if (chave === "patrimonio" && !(campos as any)?.codigo) {
              const jaTem = (data?.registro as any)?.codigo;
              if (jaTem) {
                (campos as any).codigo = jaTem;
              } else {
                /* NO BANCO, com advisory lock por sigla. A versao daqui lia o
                   maior e somava 1 em dois passos: dois computadores
                   cadastrando ao mesmo tempo saiam com a MESMA etiqueta -- e
                   etiqueta e adesivo colado no bem, nao tem conserto barato.
                   Falhar e melhor que duplicar: sem codigo, o erro sobe e a
                   tela avisa. */
                /* O LOCK DA FUNCAO E `xact`: ele solta quando a RPC retorna, e a
                   gravacao vem no passo seguinte, ja fora dele -- dois
                   cadastros simultaneos ainda podiam sair com o mesmo codigo.
                   Quem garante agora e o INDICE UNICO no banco
                   (20260824c_etiqueta_unica): o segundo e recusado. Aqui a
                   gente so tenta de novo uma vez, para a corrida normal se
                   resolver sozinha em vez de virar erro na cara de quem
                   cadastrou. */
                const sigla = String((campos as any)?.setorSigla ?? "GER");
                const { data: etq, error: erroEtq } = await sb.rpc("patrimonio_proxima_etiqueta", { p_sigla: sigla });
                if (erroEtq || !etq) throw new Error("nao consegui gerar a etiqueta: " + (erroEtq?.message ?? "vazio"));
                (campos as any).codigo = etq as string;
                (campos as any).__etiquetaSigla = sigla;   // so para a retentativa abaixo
              }
            }

            // `historico` NUNCA vem do cliente: e o servidor que carimba autor
            // e hora. Sem isto, qualquer pessoa reescreveria a conversa inteira
            // -- inclusive apagando o que a colega escreveu.
            const { historico: _naoVemDoCliente, ...camposLimpos } = (campos as any) ?? {};
            /* `pagosPatch` funde MES a MES dentro do campo `pagos` (null tira o
               mes). Mandar o mapa inteiro -- como a primeira versao fazia --
               reabria a corrida que este arquivo fechou para registros: o
               celular com estado velho apagava o mes que o desktop tinha
               acabado de marcar. */
            if (camposLimpos.pagosPatch && typeof camposLimpos.pagosPatch === "object") {
              const atualPagos = { ...(((data?.registro as any) ?? {}).pagos ?? {}) };
              for (const [mes, v] of Object.entries(camposLimpos.pagosPatch as Record<string, unknown>)) {
                if (v == null) delete atualPagos[mes];
                else atualPagos[mes] = String(v);
              }
              (camposLimpos as any).pagos = atualPagos;
              delete (camposLimpos as any).pagosPatch;
            }
            const fundido: any = { ...(data?.registro ?? {}), ...camposLimpos };
            if (POR_DONO.has(chave)) {
              const donoAtual = (data?.registro as any)?.dono ?? null;
              const eu = String(sessao?.sub ?? "");
              const euNome = String(sessao?.nome || eu);
              const pedido = (campos as any)?.dono ? String((campos as any).dono) : null;
              const agora = new Date().toISOString();
              const base = { em: agora, quem: eu, quemNome: euNome };

              // ENCAMINHAR. Quem chegou ate aqui ja passou pelo barraDono, entao
              // ou e a direcao, ou o item e dela -- so falta conferir que a
              // pessoa de destino existe de verdade (nome digitado errado
              // sumiria com o compromisso: ninguem mais o veria).
              if (pedido && pedido !== donoAtual) {
                const destino = await pessoaValida(pedido, MODULO_POR_DONO[chave]);
                if (!destino) {
                  return resposta(
                    { erro: "Essa pessoa nao tem essa tela liberada -- fale com a direcao." },
                    400,
                  );
                }
                fundido.dono = destino.usuario;
                fundido.donoNome = destino.nome;
                fundido.encaminhadoPor = sessao?.nome || eu;
                fundido.encaminhadoEm = agora;
                // A ida fica registrada na propria conversa: quem recebe abre
                // e ve de onde veio, e se voltar depois a linha do tempo mostra
                // o caminho inteiro (era o `encaminhadoPor`, que so guardava a
                // ULTIMA passagem e apagava as anteriores).
                fundido.historico = comEvento(data?.registro, {
                  ...base, tipo: "passou",
                  para: destino.usuario, paraNome: destino.nome,
                  texto: String((campos as any)?.recado ?? "").trim().slice(0, 2000) || undefined,
                });
              } else {
                // Sem encaminhamento, o dono e carimbado pelo servidor e nao
                // muda: mandar dono no corpo nao rouba item de ninguem.
                fundido.dono = donoAtual ?? eu;
                fundido.donoNome =
                  (data?.registro as any)?.donoNome || sessao?.nome || fundido.dono;

                if (!data) {
                  // Nascimento do compromisso: a conversa comeca com quem criou.
                  fundido.historico = [{ ...base, tipo: "criou" as const }];
                } else if (
                  (campos as any)?.feito !== undefined &&
                  !!(campos as any).feito !== !!(data.registro as any)?.feito
                ) {
                  fundido.historico = comEvento(data.registro, {
                    ...base, tipo: (campos as any).feito ? "concluiu" : "reabriu",
                  });
                }
              }
              // `recado` e instrucao de chamada, nao campo do registro.
              delete fundido.recado;
            }
            /* A ETIQUETA PODE COLIDIR NA GRAVACAO (indice unico
               20260824c): o lock da funcao que gera o numero solta antes
               daqui. Uma retentativa resolve a corrida normal -- e se
               colidir de novo, o erro sobe, porque etiqueta repetida e
               adesivo errado colado num bem. */
            const sigla = (fundido as any).__etiquetaSigla;
            delete (fundido as any).__etiquetaSigla;
            const gravar = () => sb.rpc("painel_registro_gravar", {
              p_colecao: chave, p_id: id, p_registro: fundido, p_anterior: data?.registro ?? null,
            });
            let { error } = await gravar();
            if (error && sigla && /painel_patrimonio_codigo_unico|duplicate key/i.test(error.message)) {
              const { data: outra } = await sb.rpc("patrimonio_proxima_etiqueta", { p_sigla: sigla });
              if (outra) {
                (fundido as any).codigo = outra as string;
                ({ error } = await gravar());
              }
            }
            if (error) throw Object.assign(new Error(error.message), { code: error.code });
          }
          // Devolve o mapa inteiro, como o original fazia (o cliente atualiza o
          // estado local com ele). Depois de encaminhar, o item some da lista de
          // quem passou -- e por isso que o cliente adota esta resposta.
          return resposta({ ok: true, valor: await lerOverlay(chave, donoDaVez(chave), await crivoDe(chave)) });
        }
        return resposta({ erro: "chave nao gravavel" }, 403);
      }

      // Recado na conversa do compromisso, com anexo opcional (foto da medicao,
      // PDF do orcamento, croqui). O texto e o autor vao para o `historico` do
      // proprio registro; os BYTES vao para o bucket, porque um PDF dentro do
      // JSON incharia a linha e viajaria em TODA leitura da agenda.
      //
      // Acao propria em vez de um campo do merge: assim o append e atomico do
      // lado do servidor (le, acrescenta, grava) e duas pessoas escrevendo ao
      // mesmo tempo nao apagam o recado uma da outra.
      case "evento": {
        const chave = String(corpo.chave ?? "");
        const id = String(corpo.id ?? "");
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        if (!POR_DONO.has(chave)) return resposta({ erro: "chave sem conversa" }, 400);
        const barrado = barraChave(chave);
        if (barrado) return barrado;
        if (!id) return resposta({ erro: "informe o id" }, 400);
        const barradoDono = await barraDono(chave, id);
        if (barradoDono) return barradoDono;

        const { data } = await sb.from("painel_registros").select("registro")
          .eq("colecao", chave).eq("id", id).maybeSingle();
        if (!data) return resposta({ erro: "Este compromisso nao existe mais." }, 404);

        const texto = String(corpo.texto ?? "").trim().slice(0, 2000);
        const base64 = String(corpo.base64 ?? "");
        if (!texto && !base64) return resposta({ erro: "Escreva algo ou anexe um arquivo." }, 400);
        if (base64.length > MAX_ARQUIVO) {
          return resposta({ erro: "Arquivo muito grande (limite ~3 MB)." }, 413);
        }

        let arquivo: Evento["arquivo"];
        if (base64) {
          // Chave por compromisso E por evento: trocar de anexo nao apaga o
          // anterior, e a conversa antiga continua abrindo o arquivo dela.
          const nomeArq = String(corpo.nome ?? "anexo");
          const chaveArq = `conversa/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const mime = String(corpo.mime ?? "application/octet-stream");
          const { error } = await sb.storage.from(BUCKET)
            .upload(chaveArq, bytes, { contentType: mime, upsert: false });
          if (error) throw new Error("upload: " + error.message);
          arquivo = { chave: chaveArq, nome: nomeArq, mime };
        }

        const registro: any = {
          ...(data.registro as any),
          historico: comEvento(data.registro, {
            em: new Date().toISOString(),
            quem: String(sessao.sub ?? ""),
            quemNome: String(sessao.nome || sessao.sub || ""),
            tipo: "recado",
            ...(texto ? { texto } : {}),
            ...(arquivo ? { arquivo } : {}),
          }),
        };
        const { error } = await sb.rpc("painel_registro_gravar", {
          p_colecao: chave, p_id: id, p_registro: registro, p_anterior: data.registro,
        });
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
        return resposta({ ok: true, valor: await lerOverlay(chave, donoDaVez(chave), await crivoDe(chave)) });
      }

      /* ANEXAR A NOTA DE UM LANCAMENTO DE CREDITO.
         A permuta e uma troca: de um lado as O.S. que ele consumiu, do outro o
         que a Impresilk comprou dele. O credito nao e um numero solto -- e uma
         LISTA de entradas, cada uma com data, o que foi e a sua nota. Sem a
         nota o credito e um numero que alguem digitou, e o parceiro nao tem
         como conferir; e sem estar presa a UMA entrada, a nota nao diz a qual
         delas pertence.

         Os bytes vao para o bucket e so a referencia entra no registro: um PDF
         dentro do JSON incharia a linha e viajaria em TODA leitura da tela.
         Mesma escolha da conversa dos compromissos. */
      case "permutaAnexo": {
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        // A mesma acao serve permuta e campanha: o anexo e a nota do que
        // sustenta o lancamento, nos dois casos.
        const colecao = corpo.chave === "campanhas" ? "campanhas" : "permutas";
        const barrado = barraChave(colecao);
        if (barrado) return barrado;
        const id = String(corpo.id ?? "");
        if (!id) return resposta({ erro: "informe a permuta" }, 400);

        const base64 = String(corpo.base64 ?? "");
        if (!base64) return resposta({ erro: "Escolha um arquivo." }, 400);
        if (base64.length > MAX_ARQUIVO) {
          return resposta({ erro: "Arquivo muito grande (limite ~3 MB)." }, 413);
        }
        const lancId = corpo.lancId ? String(corpo.lancId) : null;
        const nomeArq = String(corpo.nome ?? "documento").slice(0, 180);
        const mime = String(corpo.mime ?? "application/octet-stream");
        const chaveArq = `permuta/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const { error: erroUp } = await sb.storage.from(BUCKET)
          .upload(chaveArq, bytes, { contentType: mime, upsert: false });
        if (erroUp) throw new Error("upload: " + erroUp.message);

        // Quem carimba autor e hora e a funcao, junto com o evento do
        // historico -- do mesmo jeito que os outros movimentos da permuta.
        const { data: reg, error } = await sb.rpc("troca_mexer", {
          p_colecao: colecao,
          p_id: id,
          p_quem: String(sessao.sub ?? ""),
          p_quem_nome: String(sessao.nome || sessao.sub || ""),
          p_campos: {},
          p_os: {},
          p_lancamentos: {},
          p_anexo: { chave: chaveArq, nome: nomeArq, mime, ...(lancId ? { lancId } : {}) },
          p_criar: false,
        });
        /* Permuta ou lancamento sumiram entre o upload e a gravacao: apaga os
           bytes. Sem isto viram lixo que nenhuma tela lista, ninguem apaga e
           ninguem sabe que existe -- foi o que aconteceu com os arquivos dos
           ativos ate 04/08. */
        if (error) {
          await sb.storage.from(BUCKET).remove([chaveArq]).catch(() => {});
          /* SO A RECUSA DA PROPRIA FUNCAO prova que o lancamento sumiu. Aqui
             cai qualquer erro do banco -- timeout de statement, lock nao
             obtido, queda de conexao -- e a resposta afirmava um FATO sobre o
             dado ("nao existe mais"), mandando a pessoa recarregar e perder o
             anexo que acabou de subir. */
          const some = /nao existe|does not exist/i.test(error.message || "");
          return resposta(
            some
              ? { erro: "Esse lancamento nao existe mais -- recarregue a tela." }
              : { erro: "Nao consegui anexar agora (o banco recusou). O arquivo nao foi guardado; tente de novo." },
            some ? 409 : 503,
          );
        }
        if (reg === null) {
          await sb.storage.from(BUCKET).remove([chaveArq]).catch(() => {});
          return resposta({ erro: "Essa permuta nao existe mais." }, 409);
        }
        return resposta({ ok: true, valor: await lerOverlay(colecao, null, await crivoDe(colecao)) });
      }

      // Baixar um anexo da conversa. A permissao e a MESMA do compromisso: a
      // chave do arquivo tem de estar no historico do registro que a pessoa
      // pode abrir -- pedir uma chave de outro compromisso nao adianta.
      case "lerArquivo": {
        const chave = String(corpo.chave ?? "");
        const id = String(corpo.id ?? "");
        const arquivoChave = String(corpo.arquivo ?? "");
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        // Permuta tem anexo mas nao tem dono: o modulo E a permissao.
        if (!POR_DONO.has(chave) && chave !== "permutas" && chave !== "campanhas") {
          return resposta({ erro: "chave sem anexo" }, 400);
        }
        const barrado = barraChave(chave);
        if (barrado) return barrado;
        if (POR_DONO.has(chave)) {
          const barradoDono = await barraDono(chave, id);
          if (barradoDono) return barradoDono;
        }

        const { data } = await sb.from("painel_registros").select("registro")
          .eq("colecao", chave).eq("id", id).maybeSingle();
        /* A CHAVE PEDIDA TEM QUE ESTAR NESTE REGISTRO. Sem esta amarra, quem
           tem o modulo baixaria qualquer arquivo do bucket adivinhando a
           chave -- inclusive de compromisso alheio. Na permuta o anexo mora em
           `anexos`; no compromisso, dentro do `historico`. */
        const reg = (data?.registro as any) ?? null;
        const doAnexo = (Array.isArray(reg?.anexos) ? reg.anexos : [])
          .find((a: any) => a?.chave === arquivoChave);
        // A nota do credito mora DENTRO do lancamento a que pertence.
        const doLancamento = Object.values(reg?.lancamentos ?? {})
          .map((l: any) => l?.anexo)
          .find((a: any) => a?.chave === arquivoChave);
        const doHistorico = (Array.isArray(reg?.historico) ? reg.historico : [])
          .find((e: any) => e?.arquivo?.chave === arquivoChave)?.arquivo;
        const achado = doAnexo || doLancamento || doHistorico;
        if (!achado) return resposta({ erro: "arquivo nao encontrado" }, 404);

        const { data: arq, error } = await sb.storage.from(BUCKET).download(arquivoChave);
        if (error || !arq) return resposta({ erro: "arquivo nao encontrado" }, 404);
        const buf = new Uint8Array(await arq.arrayBuffer());
        let s = "";
        const BLOCO = 0x8000;
        for (let i = 0; i < buf.length; i += BLOCO) s += String.fromCharCode(...buf.subarray(i, i + BLOCO));
        // base64 PURO, sem prefixo data: -- mesmo contrato do painel-ativos.
        return resposta({ ok: true, base64: btoa(s), mime: achado.mime, nome: achado.nome });
      }

      /* ------------------------------------------------ setor das Planilhas
         A UNICA porta da colecao `planilhas_acesso`. Ela fica fora de
         `OVERLAYS` de proposito: get/merge/removerId a recusam por construcao,
         entao nao existe caminho generico para alguem se auto-conceder setor.

         `master === true`, nao `ehDirecao`: `ehDirecao` aceita
         `perms.includes("*")`, e quem tem `*` e uma pessoa comum na tela de
         Acessos. Conceder acesso e da direcao de verdade.

         O ECO E OBRIGATORIO. A resposta devolve o que FICOU GRAVADO, nao o que
         foi pedido, e a tela compara. Permutas (19/08) e campanhas (20/08)
         foram marcadas na tela, responderam ok, e nao concederam nada -- em
         ambos os casos porque alguem filtrou em silencio. Aqui o que nao existe
         na lista de setores volta em `descartados`. */
      case "setoresDaPessoa": {
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        if (sessao.master !== true) return resposta({ erro: "Só a direção vê e concede setor." }, 403);
        const usuario = String(corpo.usuario ?? "").trim();
        if (!usuario) return resposta({ erro: "informe o usuario" }, 400);
        return resposta({ ok: true, usuario, setores: await setoresDaPessoa(usuario) });
      }

      case "salvarSetoresDaPessoa": {
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        if (sessao.master !== true) return resposta({ erro: "Só a direção vê e concede setor." }, 403);
        const usuario = String(corpo.usuario ?? "").trim();
        if (!usuario) return resposta({ erro: "informe o usuario" }, 400);
        const pedidos = Array.isArray(corpo.setores) ? corpo.setores.map(String) : [];
        // A LISTA FECHADA e a colecao `setores` do Patrimonio, lida agora --
        // nunca uma copia. Setor apagado no Patrimonio deixa de poder ser
        // concedido no mesmo instante.
        const existentes = new Set(Object.keys(await lerOverlay("setores", null)));
        const setores = [...new Set(pedidos.filter((x: string) => existentes.has(x)))];
        const descartados = pedidos.filter((x: string) => !existentes.has(x));
        const { error } = await sb.from("painel_registros").upsert({
          colecao: COLECAO_ACESSO_SETOR, id: usuario,
          registro: { setores, por: String(sessao.sub ?? ""), em: new Date().toISOString() },
          atualizado_em: new Date().toISOString(),
        }, { onConflict: "colecao,id" });
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
        // Le de volta: o eco e o que FICOU, nao o que foi mandado.
        return resposta({
          ok: true, usuario,
          setores: await setoresDaPessoa(usuario),
          descartados: descartados.length ? descartados : undefined,
        });
      }

      case "lixeiraRegistros": {
        if(!sessao || !ehDirecao) return resposta({erro:"Só a Direção pode recuperar registros."},403);
        const itens=[];
        for(let de=0;;de+=1000){
          const {data,error}=await sb.from("painel_registros").select("id,registro").eq("colecao","registro_lixeira").order("atualizado_em",{ascending:false}).range(de,de+999);
          if(error)throw error;
          itens.push(...(data || []).map((x:any)=>({id:x.id,colecao:x.registro.colecao,nome:x.registro.registro?.nome || x.registro.registro?.titulo || x.registro.id,retiradoEm:x.registro.retiradoEm})));
          if(!data || data.length<1000)break;
        }
        return resposta({ok:true,itens});
      }
      case "recuperarRegistro": {
        if(!sessao || !ehDirecao) return resposta({erro:"Só a Direção pode recuperar registros."},403);
        const {error}=await sb.rpc("painel_registro_recuperar",{p_lixeira_id:String(corpo.id || "")});
        if(error)throw error;
        return resposta({ok:true});
      }

      // Remocao por id: apaga UMA linha do overlay. Existe porque remover via
      // get+set do mapa inteiro reabre a corrida que o merge-por-linha fechou
      // (dois removedores simultaneos ressuscitavam o que o outro apagou).
      case "removerId": {
        const chave = String(corpo.chave ?? "");
        const id = String(corpo.id ?? "");
        if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
        if (!OVERLAYS.has(chave)) return resposta({ erro: "chave nao gravavel" }, 403);
        const barrado = barraChave(chave);
        if (barrado) return barrado;
        const barradoPlanilha = barraEscritaDePlanilha(chave);
        if (barradoPlanilha) return barradoPlanilha;
        if (chave === "patrimonio") {
          const { data: fotos, error } = await sb.from("painel_registros").select("id").eq("colecao", "patrimonio_foto").eq("registro->>bemId", id).limit(1);
          if (error) throw Object.assign(new Error(error.message), { code: error.code });
          if (fotos?.length) return resposta({ erro: "Este equipamento tem fotos. Para preservar o histórico, marque como Baixado; para apagar, remova as fotos primeiro." }, 409);
        }
        {
          const barrado2 = barraApagar(chave);
          if (barrado2) return barrado2;
        }
        if (!id) return resposta({ erro: "informe o id" }, 400);
        const barradoDono = await barraDono(chave, id);
        if (barradoDono) return barradoDono;
        // A retirada copia o registro para a lixeira na mesma transação.
        // Referências e bytes dos anexos permanecem recuperáveis.
        const { error } = await sb.rpc("painel_registro_retirar",{p_colecao:chave,p_id:id,p_por:sessao.sub});
        if (error) throw Object.assign(new Error(error.message), { code: error.code });
        return resposta({ ok: true });
      }

      default:
        return resposta({ erro: "acao desconhecida" }, 400);
    }
  } catch (e) {
    console.error("[painel-config] erro:", e);
    if ((e as any)?.code === "40001") return resposta({ erro: "Outra pessoa alterou este registro. Recarregue antes de salvar." }, 409);
    return resposta({ erro: "Não foi possível salvar ou carregar os dados. Tente novamente." }, 500);
  }
});
