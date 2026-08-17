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

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { hashSenha, verificarJwt } from "../_shared/cripto.ts";

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

const texto = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

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

// Mesma normalizacao do equipe-auth (e do painel-auth, e do RH): o login e a
// chave, entao tem de casar com acento, maiuscula e espaco sobrando. O `ç`
// decompoe em `c` + cedilha, e a cedilha esta na faixa apagada -- e por isso
// que "Golçalves" casa com "golcalves" em perfis.
const normalizar = (s: unknown): string =>
  String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

// O LOGIN DAQUELA PESSOA NAQUELE SISTEMA.
//
// Gravado em acesso_papel.login quando alguem o corrigiu pela tela; senao a
// regra antiga: no RH a chave e o NOME COMPLETO (perfis.usuario e casado com o
// nome da ficha do colaborador -- mandar "karen" criaria uma SEGUNDA conta ao
// lado da Karen Luiza de verdade), e nos outros e o usuario curto.
//
// A deducao continua valendo por omissao, mas ela e um PALPITE: quando erra,
// erra criando conta nova em vez de mexer na que existe. Por isso tudo que
// escreve confere `existeNoSistema` antes.
const alvoNoSistema = (conta: any, sistema: string, papel?: any) => {
  const gravado = texto(papel?.login, 160);
  if (gravado) return gravado;
  return sistema === "rh" ? texto(conta.colaborador, 160) : texto(conta.usuario, 60);
};

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

async function estadoReal(): Promise<MapaReal> {
  const mapa: MapaReal = {};
  const por = (s: string) => (mapa[s] ??= {});

  const { data: equipe } = await sb.from("equipe_contas")
    .select("sistema, usuario, nome, papel, ativo, trocar_senha, atualizado_em");
  for (const c of equipe ?? []) {
    por(c.sistema)[normalizar(c.usuario)] = {
      login: c.usuario, papel: c.papel ?? "", ativo: c.ativo !== false,
      temporaria: !!c.trocar_senha, em: c.atualizado_em, nome: c.nome || c.usuario,
    };
  }

  // O Painel nao tem papel nem "desativado": ou a linha existe, ou nao existe.
  const { data: painel } = await sb.from("painel_contas")
    .select("usuario, nome, permissoes, atualizado_em");
  for (const c of painel ?? []) {
    por("painel")[normalizar(c.usuario)] = {
      login: c.usuario, papel: (c.permissoes ?? []).includes("*") ? "tudo" : "",
      ativo: true, temporaria: false, em: c.atualizado_em, nome: c.nome || c.usuario,
      permissoes: c.permissoes ?? [],
    };
  }

  // No RH quem manda e a linha de perfis; a senha mora no Supabase Auth.
  const { data: perfis } = await sb.from("perfis")
    .select("usuario, nome, perfil, atualizado_em");
  for (const c of perfis ?? []) {
    por("rh")[normalizar(c.usuario)] = {
      login: c.usuario, papel: c.perfil ?? "", ativo: true, temporaria: false,
      em: c.atualizado_em, nome: c.nome || c.usuario,
    };
  }

  /* A CENTRAL NAO TEM TABELA DE CONTAS, e nao e esquecimento: o app pessoal do
     dono autentica pela leo-sync (LEO_SESSION_SECRET), nao por equipe_contas.
     Sem um ramo aqui ela caia no "nao existe la" -- e a tela oferecia "Tirar da
     lista" e "Criar a conta la" para a UNICA linha que registra quem abre a
     Central. Uma das duas apagaria o registro; a outra fabricaria em
     equipe_contas uma segunda senha que abre o app pessoal dele.
     Aqui a propria linha de acesso e a verdade -- que e o que ela sempre foi. */
  const { data: central } = await sb.from("acesso_papel")
    .select("conta_id, papel, ativo").eq("sistema", "central");
  if (central?.length) {
    const { data: donos } = await sb.from("acesso_conta")
      .select("id, usuario, nome, ativo, atualizado_em")
      .in("id", central.map((p: any) => p.conta_id));
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

/* A Central nao se administra por aqui. Criar conta ou trocar senha nela cairia
   em equipe_contas pela equipe-auth -- que ainda nao tem "central" na lista
   EXTERNOS -- e fabricaria uma SEGUNDA senha, valida, para o app pessoal do
   dono. Enquanto o outro lado nao fecha, quem fecha e este. */
const SO_LEITURA = new Set(["central"]);
const RECADO_SO_LEITURA =
  "A Central do Léo é o app pessoal do dono e tem porta própria (leo-sync). " +
  "Ela aparece aqui só para registro: não se cria conta nem se troca senha dela por esta tela.";

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

// Senha temporaria legivel: quem recebe consegue digitar sem errar, e ela morre
// na primeira entrada (a equipe-auth marca trocar_senha).
const PALAVRAS = ["pedra", "verde", "chuva", "campo", "vento", "folha", "porta",
  "praia", "monte", "peixe", "trilho", "barro", "vidro", "fogo", "areia", "nuvem",
  "raiz", "galho", "prego", "tinta", "lona", "placa", "risco", "molde", "corte",
  "serra", "regua", "farol", "ilha", "ponte", "muro", "telha"];
// Tres palavras de 32 + tres digitos: ~35 bits, contra os ~17 de antes (duas de
// 14 + tres digitos). A senha e temporaria, mas quem a recebe pode demorar dias
// para trocar -- e adivinhavel nesse meio-tempo e adivinhavel de verdade.
function senhaTemporaria() {
  const n = crypto.getRandomValues(new Uint32Array(4));
  const p = (i: number) => PALAVRAS[n[i] % PALAVRAS.length];
  return `${p(0)}-${p(1)}-${p(2)}-${100 + (n[3] % 900)}`;
}

// Os sete sistemas da casa. Lista fechada: sistema digitado errado viraria uma
// linha de papel que nenhuma tela le e ninguem descobre.
const SISTEMAS = ["painel", "rh", "pcp", "brief", "dre", "compras", "pops", "central"];

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
  await sb.from("acesso_senha_legado").delete().eq("conta_id", conta.id);
  const { error: e2 } = await sb.from("acesso_senha_legado").insert({
    conta_id: conta.id, origem: "central", hash: reg.hash, salt: reg.salt, iter: reg.iter,
  });
  if (e2) avisos.push(`nao consegui guardar a senha da entrada unica: ${e2.message}`);
  return avisos;
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
        const { data: contas } = await sb.from("acesso_conta").select("*").order("usuario");
        const { data: papeis } = await sb.from("acesso_papel").select("*");
        // O hash NUNCA sai daqui -- so a contagem, para a tela poder dizer
        // "esta pessoa ainda nao entrou depois da virada".
        const { data: senhas } = await sb.from("acesso_senha_legado")
          .select("conta_id, origem, usado_em");

        // Nomes do RH para o campo de amarrar. So o NOME: a ficha de la tem
        // salario, CPF e endereco, e nada disso tem o que fazer nesta tela.
        const { data: colabs } = await sb.from("registros")
          .select("registro").eq("colecao", "colaboradores");
        const nomes = [...new Set((colabs ?? [])
          .map((r: any) => String(r.registro?.nome ?? "").trim())
          .filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

        // A VERDADE, perguntada aos sistemas. Sem isto a tela so repetia a
        // tabela consolidada -- e era ela que estava mentindo.
        const real = await estadoReal();
        // Todo login que ALGUEM aqui reivindica, para saber o que sobrou solto.
        const reivindicados: Record<string, Set<string>> = {};

        const contasFora = (contas ?? []).map((c: any) => ({
          ...c,
          papeis: (papeis ?? []).filter((p: any) => p.conta_id === c.id).map((p: any) => {
            const login = alvoNoSistema(c, p.sistema, p);
            const chave = normalizar(login);
            (reivindicados[p.sistema] ??= new Set()).add(chave);
            const r = real[p.sistema]?.[chave] ?? null;
            return {
              ...p,
              // O login com que a pessoa entra ALI. Quando ninguem corrigiu,
              // e o palpite -- e a tela precisa poder dizer que e palpite.
              login,
              deduzido: !texto(p.login, 160),
              real: r
                ? { existe: true, login: r.login, papel: r.papel, ativo: r.ativo,
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
        const soltas: Record<string, Real[]> = {};
        for (const sis of SISTEMAS) {
          const sobra = Object.entries(real[sis] ?? {})
            .filter(([chave]) => !reivindicados[sis]?.has(chave))
            .map(([, r]) => r)
            .sort((a, b) => a.login.localeCompare(b.login, "pt-BR"));
          if (sobra.length) soltas[sis] = sobra;
        }

        /* OS VENDEDORES, COMO O ERP OS ESCREVE. A tela precisa oferecer a lista
           em vez de deixar digitar: o nome tem de bater EXATO (a comparacao so
           junta espaco), e "Michelle Petrone" nao e "Michelle". Errar aqui nao
           da erro -- da uma fila vazia, que parece so um dia sem orcamento. */
        const { data: cache } = await sb.from("painel_cache")
          .select("valor").eq("chave", "orcamentos").maybeSingle();
        const conta_: Record<string, number> = {};
        for (const o of (Array.isArray(cache?.valor) ? cache!.valor : []) as any[]) {
          const v = texto(o?.vendedorId, 120);
          if (v) conta_[v] = (conta_[v] ?? 0) + 1;
        }
        const vendedores = Object.entries(conta_)
          .map(([nome, n]) => ({ nome, n }))
          .sort((a, b) => b.n - a.n);

        /* QUEM MAIS O SISTEMA CONHECE. Ate aqui esta tela mostrava so quem tem
           CONTA -- e cada sistema tem gente cadastrada alem disso. Abrir "POPs"
           mostrava 7 nomes enquanto o POPs conhece 40 pessoas; o RH mostrava 6
           enquanto tem 93 fichas.

           E o caso do PCP e mais que contagem: os 15 INSTALADORES entram sem
           senha, tocando no proprio nome. Isso e acesso de verdade, e nao
           aparecia em lugar nenhum desta tela -- a lista de nomes E a
           credencial. Por isso eles vem marcados como "entra pelo nome", e nao
           como simples cadastro.

           So o NOME e o minimo para reconhecer a pessoa. A ficha do RH tem CPF,
           endereco e salario, e nada disso tem o que fazer aqui. */
        const elenco: Record<string, { nome: string; como: string; detalhe: string }[]> = {};

        const { data: cfgPcp } = await sb.from("pcp_config_global")
          .select("config").eq("id", true).maybeSingle();
        const instaladores = (cfgPcp?.config?.instaladores ?? []) as unknown[];
        if (instaladores.length) {
          elenco.pcp = instaladores
            .map((x) => texto(x, 120))
            .filter(Boolean)
            .map((nome) => ({ nome, como: "nome", detalhe: "toca no nome, sem senha" }));
        }

        const { data: pessoasPops } = await sb.from("pops_registros")
          .select("registro").eq("colecao", "pessoas");
        if (pessoasPops?.length) {
          elenco.pops = pessoasPops
            .map((r: any) => ({
              nome: texto(r.registro?.nome, 120),
              como: "cadastro",
              detalhe: texto(r.registro?.area, 60),
            }))
            .filter((x) => x.nome)
            .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        }

        elenco.rh = (colabs ?? [])
          .map((r: any) => ({
            nome: texto(r.registro?.nome, 120),
            como: "cadastro",
            // Desligado continua na ficha; dizer isso evita a leitura de que o
            // RH tem 93 pessoas trabalhando.
            detalhe: texto(r.registro?.dataDesligamento, 20) ? "desligado" : "",
          }))
          .filter((x: any) => x.nome)
          .sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR"));

        return resposta({
          ok: true,
          sistemas: SISTEMAS,
          contas: contasFora,
          soltas,
          elenco,
          vendedores,
          colaboradores: nomes,
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
          tipo: c.tipo === "funcao" ? "funcao" : "pessoa",
          colaborador: texto(c.colaborador, 160),
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
        /* Retentativa: se a criacao anterior gravou a conta e falhou em TODOS os
           sistemas, a pessoa ficou sem acesso nenhum e o segundo "Criar" batia
           em "ja existe" -- sem caminho para consertar pela tela. Conta sem
           papel nenhum e um cadastro pela metade: da para retomar. */
        const { data: existe } = await sb.from("acesso_conta")
          .select("id").eq("usuario", usuario).maybeSingle();
        if (existe) {
          const { count } = await sb.from("acesso_papel")
            .select("sistema", { count: "exact", head: true }).eq("conta_id", existe.id);
          if ((count ?? 0) > 0) return resposta({ erro: "Ja existe alguem com esse usuario." }, 409);
          await sb.from("acesso_conta").delete().eq("id", existe.id);
        }

        const senha = texto(corpo.senha, 80) || senhaTemporaria();
        if (senha.length < 6) return resposta({ erro: "A senha precisa ter ao menos 6 caracteres." }, 400);

        const linha = {
          usuario,
          nome: texto(c.nome, 120) || usuario,
          tipo: c.tipo === "funcao" ? "funcao" : "pessoa",
          colaborador: texto(c.colaborador, 160),
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
          if (sistema === "rh" && !linha.colaborador) {
            recusados.push({ sistema, erro: "O RH so aceita conta ligada a uma ficha de colaborador. Preencha \"Quem e no RH\"." });
            continue;
          }
          const r = await chamarEquipe({
            acao: "salvarConta",
            sistema,
            usuario: alvoNoSistema(linha, sistema),
            nome: linha.nome,
            papel: papelNoSistema(sistema, p.papel, p.permissoes ?? []),
            permissoes: Array.isArray(p.permissoes) ? p.permissoes : [],
            senha,
            temporaria: true,
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
      case "definirSenha": {
        const id = await contaPorUsuario(corpo.usuario);
        if (!id) return resposta({ erro: "Conta nao encontrada." }, 404);
        const { data: conta } = await sb.from("acesso_conta").select("*").eq("id", id).single();
        const senha = texto(corpo.senha, 80) || senhaTemporaria();
        if (senha.length < 6) return resposta({ erro: "A senha precisa ter ao menos 6 caracteres." }, 400);

        const { data: papeis } = await sb.from("acesso_papel").select("*").eq("conta_id", id);
        const trocados: string[] = [];
        const recusados: { sistema: string; erro: string }[] = [];
        const real = await estadoReal();
        for (const p of papeis ?? []) {
          const login = alvoNoSistema(conta, p.sistema, p);
          /* NAO CRIAR CONTA AQUI. Este era o pior efeito da divergencia: quando
             o login nao existia no sistema, a equipe-auth recebia senha junto e
             CRIAVA uma conta com aquele nome. O dono clicava "gerar nova senha",
             a tela dizia que deu certo nos sete, e a conta que ele usa de
             verdade (`leo`, no PCP) continuava com a senha velha -- agora com
             uma sosia `leonardo` ao lado. Quem nao existe la e recusado, com o
             nome do login que faltou. */
          if (!(await acharNoSistema(p.sistema, login, real))) {
            recusados.push({
              sistema: p.sistema,
              erro: `nao existe conta "${login}" ali — aponte para a conta certa antes`,
            });
            continue;
          }
          const r = await chamarEquipe({
            acao: "salvarConta", sistema: p.sistema,
            usuario: login, nome: conta.nome,
            papel: papelNoSistema(p.sistema, p.papel, p.permissoes ?? []),
            permissoes: p.permissoes ?? [], senha, temporaria: true,
          });
          if (r.ok) trocados.push(p.sistema);
          else recusados.push({ sistema: p.sistema, erro: r.erro || "nao consegui" });
        }
        // A PORTA DA FRENTE. Antes aqui so se carimbava `usado_em`, e o carimbo
        // nao tirava nada: a entrada unica aceita o hash antigo do mesmo jeito.
        const avisos = await senhaNaPortaDaFrente(conta, senha);
        for (const a of avisos) recusados.push({ sistema: "entrada", erro: a });
        if (!avisos.length) trocados.push("entrada");
        return resposta({ ok: true, senha, trocados, recusados });
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
          if (p.sistema === "rh" || p.sistema === "painel") {
            // Nenhum dos dois tem coluna de "desativado": no painel a conta
            // existe ou nao existe, e no RH quem manda e a linha em perfis.
            // Desativar ali seria apagar -- e apagar leva junto o historico.
            recusados.push({ sistema: p.sistema, erro: "Aqui e preciso remover o acesso, nao ha como so desativar." });
            continue;
          }
          const login = alvoNoSistema(conta, p.sistema, p);
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
          .select("login, vendedor_id").eq("conta_id", id).eq("sistema", sistema).maybeSingle();
        const login = texto(p.login, 160) || alvoNoSistema(conta, sistema, papelAtual);

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
        const senha = nova ? (texto(corpo.senha, 80) || senhaTemporaria()) : "";

        const r = await chamarEquipe({
          acao: "salvarConta", sistema,
          usuario: login, nome: conta.nome,
          papel: papelNoSistema(sistema, p.papel, p.permissoes ?? []),
          permissoes: Array.isArray(p.permissoes) ? p.permissoes : [],
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
        // vendedorId AUSENTE mantem o que esta gravado. Toda gravacao de papel
        // mandava "" e apagava o vinculo da vendedora -- e nenhuma tela grava
        // ele de volta, entao ela perdia a propria fila de acoes em silencio.
        // O `login` corrigido tem o mesmo cuidado: uma troca de papel nao pode
        // desfazer o apontamento que alguem levou tempo para acertar.
        const { error } = await sb.from("acesso_papel").upsert({
          conta_id: id,
          sistema,
          papel: texto(p.papel, 40),
          permissoes: aceitas,
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
        const alvoRem = alvoNoSistema(conta, sistema, papelRem);
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
        const sistema = texto(corpo.sistema, 20);
        if (!SISTEMAS.includes(sistema)) return resposta({ erro: "Sistema desconhecido." }, 400);
        const id = await contaPorUsuario(corpo.usuario);
        if (!id) return resposta({ erro: "Conta nao encontrada." }, 404);
        const { data: conta } = await sb.from("acesso_conta").select("*").eq("id", id).single();
        if (SO_LEITURA.has(sistema)) return resposta({ erro: RECADO_SO_LEITURA }, 400);
        const { data: papel } = await sb.from("acesso_papel")
          .select("*").eq("conta_id", id).eq("sistema", sistema).maybeSingle();
        if (!papel) return resposta({ erro: `Essa pessoa nao tem acesso ao ${sistema}.` }, 404);

        const login = alvoNoSistema(conta, sistema, papel);
        const achado = await acharNoSistema(sistema, login);
        if (!achado) {
          return resposta({
            erro: `Nao existe a conta "${login}" no ${sistema} — aponte para a conta certa antes de trocar a senha.`,
          }, 404);
        }
        const senha = texto(corpo.senha, 80) || senhaTemporaria();
        if (senha.length < 6) return resposta({ erro: "A senha precisa ter ao menos 6 caracteres." }, 400);

        const r = await chamarEquipe({
          acao: "salvarConta", sistema, usuario: login, nome: conta.nome,
          // O papel que ESTA la, para uma troca de senha nunca virar promocao
          // ou rebaixamento sem ninguem pedir.
          papel: sistema === "painel"
            ? (achado.permissoes?.includes("*") ? "tudo" : "")
            : achado.papel,
          permissoes: achado.permissoes ?? papel.permissoes ?? [],
          senha, temporaria: true,
        });
        if (!r.ok) return resposta({ erro: r.erro || "Nao consegui trocar a senha ali." }, 400);
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
