// ============================================================================
// acesso-entrar — A ENTRADA UNICA da Impresilk.
//
// Uma pessoa digita usuario e senha UMA vez e sai daqui com o cracha de cada
// sistema a que tem direito. Pode ser chamada de qualquer porta: da tela do
// Painel ou da tela de login de qualquer um dos sete -- as duas portas
// continuam existindo, era condicao do dono.
//
// POR QUE ESTE DESENHO, e nao trocar a autenticacao dos sete de uma vez:
// cada sistema JA sabe conferir um cracha. Emitindo aqui os crachas que eles ja
// entendem, a virada nao encosta em nenhuma das 12 functions de dados nem nas
// telas deles. Se algo der errado, o estrago e nesta function -- e a porta
// antiga de cada sistema continua de pe ate ser desligada de proposito.
//
// A IDENTIDADE PASSA A SER O SUPABASE AUTH. A senha mora la (bcrypt do GoTrue),
// nao mais em duas tabelas nossas.
//
// MIGRACAO NA PRIMEIRA ENTRADA. O GoTrue nao aceita hash PBKDF2 importado --
// entao ninguem poderia "levar" a senha antiga. A saida: na primeira vez, a
// pessoa digita a senha de sempre, ESTA function confere contra o hash antigo
// (acesso_senha_legado) e, batendo, grava a MESMA senha no Supabase Auth. Da
// segunda vez em diante quem confere e o GoTrue. Ninguem recria senha e ninguem
// percebe a virada.
//
// UMA LINHA POR ORIGEM, de proposito: a Barbara tem senhas DIFERENTES no Brief
// e no POPs; o dono tem cinco. Qualquer uma delas serve na primeira entrada, e
// a que ela digitar vira a unica. Escolher por ela seria trancar metade da
// equipe do lado de fora.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assinarJwt, hashSenha, conferirSenha, normalizarUsuario } from "../_shared/cripto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// ANON_KEY_IMPRESILK, e nao SUPABASE_ANON_KEY: o prefixo SUPABASE_ e reservado
// pela plataforma e um secret com esse nome e recusado (HTTP 400).
const ANON_KEY = Deno.env.get("ANON_KEY_IMPRESILK") ?? "";
// Os dois segredos que os sistemas ja usam. Esta function e a UNICA que precisa
// dos dois ao mesmo tempo -- e por isso que ela e a ponte.
const EQUIPE_SECRET = Deno.env.get("EQUIPE_JWT_SECRET") ?? "";
const PAINEL_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";

// E-mail sintetico: ninguem aqui tem e-mail corporativo, entao o endereco e so
// a chave que o GoTrue exige -- NAO da para recuperar senha por e-mail, e a
// tela nao promete isso.
//
// O RH JA CRIOU usuarios no mesmo Auth. Criar outro para a mesma pessoa faria
// dela DUAS identidades -- e a do RH continuaria com a senha velha, exatamente
// o problema que esta virada existe para acabar.
//
// A ligacao NAO e adivinhada pelo e-mail: o endereco do RH vem do que a pessoa
// digitou no login dela ("leonardo", "leonardo goncalves"), nao do nome do
// cadastro, entao montar o endereco a partir do nome erra. Quem sabe a ligacao
// e a tabela `perfis` do RH, que guarda user_id + nome do colaborador.
const DOMINIO = "impresilk.local";
const emailDe = (usuario: string) => `${usuario}@${DOMINIO}`;
const semAcento = (t: string) =>
  String(t ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

const DIAS_EQUIPE = 30;   // o mesmo prazo que a equipe-auth usa
const HORAS_PAINEL = 12;  // o mesmo prazo que a painel-auth usa

/* A CONTA DA DIRECAO, o mesmo nome que a painel-auth usa. Precisa estar aqui
   porque `master` NAO pode ser deduzido das permissoes -- ver o comentario na
   emissao do cracha do Painel, mais abaixo. Mesma variavel de ambiente e mesmo
   padrao: divergir daqui faria as duas portas discordarem sobre quem e o dono. */
const MASTER_PAINEL = normalizarUsuario(
  Deno.env.get("PAINEL_AUTH_MASTER_USUARIO") || "leonardo");

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// Mensagem UNICA para qualquer falha: usuario inexistente e senha errada
// precisam ser indistinguiveis, senao da para descobrir quem trabalha aqui.
const ERRO = "Usuario ou senha incorretos.";
// Registro de mentira, so para gastar o mesmo tempo quando a conta nao existe
// (o PBKDF2 de 120 mil voltas leva ~100 ms; responder na hora denuncia).
const FANTASMA = { hash: "0".repeat(64), salt: "00112233445566778899aabbccddeeff", iter: 120000 };

/* O HISTORICO. Esta porta e a que a equipe usa -- e a unica das duas que nao
   deixava rastro nenhum. O `equipe_acessos_log` registra entrada e falha de
   login desde 03/08, mas so pelo login DIRETO de cada sistema; quem entra por
   aqui era invisivel. Cinco sistemas apareciam com zero entradas no historico
   enquanto havia trabalho gravado neles.

   Custou concreto: em 16/08 o dono ficou trancado fora do PCP e a unica razao
   de termos descoberto foi ele ter tentado, por acaso, o login direto -- que
   registra. Se tivesse insistido so pela entrada unica, o log estaria mudo.

   Escreve uma linha por sistema de cracha emitido (e assim o historico de cada
   sistema mostra quem entrou nele), com `por` marcando a via. Embrulhado em
   try: log e TESTEMUNHA, nao dono -- falha de log nao pode derrubar login. */
async function registrar(sistema: string, usuario: string, acao: string, detalhe = "") {
  try {
    await sb.from("equipe_acessos_log")
      .insert({ sistema, usuario, acao, por: "entrada-unica", detalhe });
  } catch (e) {
    console.warn("[acesso-entrar] log falhou:", (e as Error)?.message);
  }
}

const enc = new TextEncoder();
const b64url = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlTexto = (t: string) => b64url(enc.encode(t));

// Cracha no formato EXATO que a equipe-auth emite -- e ela que os cinco
// sistemas conferem. Mudar um campo aqui quebra os cinco de uma vez.
async function crachaEquipe(sistema: string, usuario: string, nome: string, papel: string) {
  const agora = Math.floor(Date.now() / 1000);
  const corpo = { sis: sistema, sub: usuario, nome, papel, iat: agora, exp: agora + DIAS_EQUIPE * 86400 };
  const cab = b64urlTexto(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const meio = `${cab}.${b64urlTexto(JSON.stringify(corpo))}`;
  const chave = await crypto.subtle.importKey(
    "raw", enc.encode(EQUIPE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", chave, enc.encode(meio)));
  return `${meio}.${b64url(sig)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  if (!EQUIPE_SECRET || !PAINEL_SECRET || !ANON_KEY) {
    return json({ erro: "Entrada nao configurada no servidor." }, 503);
  }

  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "json invalido" }, 400);
  }
  if (corpo.action !== "entrar") return json({ erro: "acao desconhecida" }, 400);

  const usuario = normalizarUsuario(corpo.usuario);
  const senha = String(corpo.senha ?? "");
  if (!usuario || !senha) return json({ erro: "Informe usuario e senha." }, 400);

  /* FREIO. Esta e a porta que a equipe usa, e ela nao tinha limite nenhum:
     tres tentativas erradas seguidas voltavam em ~1s cada, sem 429 e -- para
     quem ja tinha migrado -- sem uma linha de log. A contagem e a mesma das
     outras quatro portas de senha (public.porta_travada), sobre o mesmo
     equipe_acessos_log. "*" porque a tentativa e contra a ENTRADA, nao contra
     um sistema. */
  const { data: travado } = await sb.rpc("porta_travada", { p_sistema: "*", p_usuario: usuario });
  if (travado === true) {
    await registrar("*", usuario, "login-barrado", "porta travada por tentativas");
    return json({
      erro: "Muitas tentativas seguidas. Espere 15 minutos ou peca uma senha nova a direcao.",
    }, 429);
  }

  try {
    let { data: conta } = await sb.from("acesso_conta")
      .select("*").eq("usuario", usuario).maybeSingle();

    /* O APELIDO DA FICHA TAMBEM ABRE A PORTA.
       Em 17/08/2026 o apelido virou o login unico da casa e nasce na ficha do
       RH -- mas as contas foram criadas antes dele, e em uma delas os dois
       divergem (Pedro Henrique entra como `pedro` e o apelido dele e
       `pedrohenrique`). Aceitar os dois e o que evita ter de renomear conta, e
       renomear conta orfanaria o historico que aponta para o nome antigo.

       Conferido antes de ligar: nenhum apelido e o login de OUTRA pessoa. Sem
       isso, digitar o apelido de alguem poderia abrir a conta de um terceiro --
       que seria a pior falha possivel numa porta.

       So procura por apelido quando o login nao achou nada: conta existente
       sempre ganha, e ninguem passa a entrar em lugar diferente do de ontem. */
    if (!conta) {
      const { data: ficha } = await sb.from("registros")
        .select("id").eq("colecao", "colaboradores").eq("apagado", false)
        .eq("registro->>apelido", usuario).maybeSingle();
      if (ficha?.id) {
        const { data: porFicha } = await sb.from("acesso_conta")
          .select("*").eq("colaborador_id", ficha.id).maybeSingle();
        conta = porFicha ?? null;
      }
    }

    // Conta inexistente ainda paga o preco do PBKDF2 (ver FANTASMA).
    if (!conta || conta.ativo === false) {
      await conferirSenha(senha, FANTASMA);
      // "*" porque nao ha sistema: a tentativa e contra a entrada, nao contra
      // um sistema. O detalhe distingue quem nao existe de quem foi desligado
      // -- para quem tenta, a resposta continua sendo a mesma frase.
      await registrar("*", usuario, "login-falhou", conta ? "conta desativada" : "usuario nao existe");
      await registrar("*", usuario, "login-falhou", "senha errada");
      return json({ erro: ERRO }, 401);
    }

    // Esta pessoa ja tem usuario no Auth pela via do RH? Se tem, e ELE que vale.
    // Pode haver MAIS DE UM (o RH cria um por grafia digitada: hoje o Leonardo
    // tem dois). Ordena do mais recente para o mais antigo e deixa a senha
    // digitada decidir qual e o de verdade -- adivinhar aqui erraria calado.
    let email = emailDe(usuario);

    /* O E-MAIL SAI DO ID GRAVADO, NUNCA E REMONTADO.
       Quem foi adotado do RH tem `auth_user_id` de um usuario cujo endereco e
       `<nome>@rh.impresilk.local` -- e nao `<usuario>@impresilk.local`, que e o
       que emailDe() devolve. Remontar pelo usuario fazia a pessoa entrar UMA
       vez (na adocao, quando o endereco vinha do candidato) e da segunda em
       diante levar 401 com a senha CERTA, para sempre, porque o ramo do legado
       nunca mais roda com `auth_user_id` preenchido. Pegava exatamente as 12
       pessoas amarradas a um colaborador -- o publico deste desenho. */
    if (conta.auth_user_id) {
      const { data: u } = await sb.auth.admin.getUserById(conta.auth_user_id);
      if (u?.user?.email) email = u.user.email;
    }

    const candidatos: { id: string; email: string }[] = [];
    if (!conta.auth_user_id && conta.colaborador) {
      /* CASA POR `perfis.usuario`, NAO POR `perfis.nome`.
         `nome` e o nome CURTO de exibicao ("Jessica Sampaio"), copiado da conta
         do painel; `usuario` e o nome COMPLETO normalizado, que e como o RH
         identifica a pessoa e como ela digita para entrar. Comparando com
         `nome`, o alvo (o nome do colaborador, completo) nunca batia -- e a
         pessoa ganhava uma SEGUNDA identidade no Auth, calada. Foi o que
         aconteceu com a Jessica em 11/08. */
      const { data: perfis } = await sb.from("perfis").select("user_id, usuario, nome, atualizado_em");
      const alvo = semAcento(conta.colaborador);
      const meus = (perfis ?? [])
        .filter((p: any) => semAcento(p.usuario) === alvo || semAcento(p.nome) === alvo)
        .sort((a: any, b: any) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)));
      for (const p of meus) {
        const { data: u } = await sb.auth.admin.getUserById(p.user_id);
        if (u?.user?.email) candidatos.push({ id: p.user_id, email: u.user.email });
      }
      // NAO aponta `email` para candidatos[0] aqui. Fazer isso mandava o ramo
      // 2b criar/atualizar a conta do RH de um candidato que a senha digitada
      // nunca abriu -- e, quando o nome batia com o de outra pessoa, trocava a
      // senha do Auth DELA. O e-mail so muda dentro do laco, depois do signIn.
    }
    let sessao: any = null;

    // 1) Ja migrada? Quem confere e o GoTrue.
    const cliente = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    if (conta.auth_user_id) {
      const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha });
      if (error || !data?.session) return json({ erro: ERRO }, 401);
      sessao = data.session;
    } else {
      // 2a) A senha do RH nao esta em acesso_senha_legado: ela mora no GoTrue,
      //     em bcrypt, ilegivel para mim. Entao, para quem ja tem usuario la, a
      //     senha do RH e tentada PRIMEIRO -- batendo, a conta e so adotada, sem
      //     trocar senha nenhuma. Sem isto, quem digitasse a senha do RH (a mais
      //     provavel, e a que ele usa todo dia) ouviria "senha incorreta".
      for (const c of candidatos) {
        const { data: d0 } = await cliente.auth.signInWithPassword({ email: c.email, password: senha });
        if (!d0?.session) continue;
        email = c.email;
        await sb.from("acesso_conta")
          .update({ auth_user_id: d0.session.user.id, atualizado_em: new Date().toISOString() })
          .eq("id", conta.id);
        await sb.from("acesso_senha_legado")
          .update({ usado_em: new Date().toISOString() }).eq("conta_id", conta.id);
        conta.auth_user_id = d0.session.user.id;
        sessao = d0.session;
        break;
      }

      // 2b) Primeira entrada: confere contra os hashes antigos. QUALQUER um
      //     serve -- a pessoa pode ter senhas diferentes por sistema.
      /* `.is("usado_em", null)` e cinto: desde 16/08 quem define senha APAGA as
         linhas antigas em vez de carimbar, entao nao deveria sobrar carimbada
         nenhuma. Mas o carimbo existiu por semanas dando a impressao de revogar
         sem revogar nada -- se sobrar uma, que ela nao valha. */
      const { data: legados } = sessao ? { data: [] } : await sb.from("acesso_senha_legado")
        .select("origem, hash, salt, iter").eq("conta_id", conta.id).is("usado_em", null);
      const lista = legados ?? [];
      let bateu = !!sessao;
      for (const l of lista) {
        if (await conferirSenha(senha, l)) { bateu = true; break; }
      }
      if (!bateu) {
        if (!lista.length) await conferirSenha(senha, FANTASMA);
        await registrar("*", usuario, "login-falhou", "senha errada");
      return json({ erro: ERRO }, 401);
      }

      // Bateu por hash antigo: a senha que a pessoa acabou de digitar vira a do
      // Supabase Auth. (Se ja adotou o usuario do RH acima, nada disto roda --
      // trocar a senha do RH pela do outro sistema seria recriar senha na marra.)
      if (!sessao) {
      /* NAO CRIAR IDENTIDADE PARA QUEM JA TEM UMA.
         Chegar aqui com `candidatos` cheio significa: a pessoa TEM conta no RH,
         e a senha que ela digitou nao e a de la (o laco 2a teria adotado). O
         hash antigo bateu, entao ela e ela mesma -- so digitou a senha de outro
         sistema.

         O que acontecia entao: `createUser` com `<usuario>@impresilk.local`, um
         endereco DIFERENTE do `<nome completo>@rh.impresilk.local` que ela ja
         tem. Endereco diferente nao colide, o GoTrue aceita, e a pessoa passa a
         ter DUAS identidades -- a nova com a senha que acabou de digitar, a do
         RH com a antiga. A partir dai cada porta abre com uma senha diferente e
         ninguem entende por que. O comentario do laco 2a registra que foi
         exatamente isso que aconteceu com a Jessica em 11/08; a correcao de la
         fez o pareamento achar o candidato, mas nao fechou a criacao.

         A guarda de conflito logo abaixo nao pega este caso: ela so dispara
         quando o createUser FALHA, e aqui ele nao falha.

         Recusar e melhor que adotar: adotar exigiria trocar a senha do RH pela
         que ela digitou -- ou seja, deixar a senha do Brief reescrever a senha
         do RH de alguem. */
      if (candidatos.length) {
        await registrar("*", usuario, "login-barrado", "tem conta no RH e usou senha de outro sistema");
        return json({
          erro: "Você já tem acesso ao RH, e é a senha de lá que vale para entrar por aqui. " +
                "Se não lembra, peça à direção para gerar uma nova.",
          conflito: true,
        }, 409);
      }
      const { data: criado, error: erroCriar } = await sb.auth.admin.createUser({
        email, password: senha, email_confirm: true,
        user_metadata: { usuario, nome: conta.nome },
      });
      let idAuth = criado?.user?.id ?? null;
      if (erroCriar && !idAuth) {
        /* O endereco ja existe no GoTrue e a senha digitada NAO o abriu (se
           abrisse, o laco 2a teria adotado). Trocar a senha dele aqui era o que
           permitia uma pessoa reescrever a senha do Auth de OUTRA -- bastava o
           nome do colaborador bater. Agora para, e a direcao resolve. */
        return json({
          erro: "Ja existe um acesso com esse endereco e a senha nao confere. Fale com a direcao.",
          conflito: true,
        }, 409);
      }
      if (!idAuth) throw new Error(erroCriar?.message || "nao consegui criar o acesso");

      /* PROVAR PRIMEIRO, GRAVAR DEPOIS.
         Gravando `auth_user_id` antes do signIn, um GoTrue que recusasse a senha
         (politica de tamanho, por exemplo) deixava a conta marcada como migrada
         com uma senha que nao funciona -- e, como o ramo do legado so roda com
         `auth_user_id` vazio, a pessoa ficava trancada em definitivo ouvindo que
         errou uma senha que acertou. */
      const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha });
      if (error || !data?.session) {
        await sb.auth.admin.deleteUser(idAuth).catch(() => {});
        await registrar("*", usuario, "login-falhou", "senha errada");
      return json({ erro: ERRO }, 401);
      }
      sessao = data.session;

      await sb.from("acesso_conta").update({ auth_user_id: idAuth, atualizado_em: new Date().toISOString() })
        .eq("id", conta.id);
      // Marca as senhas antigas como usadas. Elas viram lixo a partir daqui --
      // hash de senha nao e coisa para ficar guardada "por via das duvidas".
      await sb.from("acesso_senha_legado")
        .update({ usado_em: new Date().toISOString() }).eq("conta_id", conta.id);
      conta.auth_user_id = idAuth;
      }
    }

    // 3) Os crachas de cada sistema a que ela tem direito.
    const { data: papeis } = await sb.from("acesso_papel")
      .select("*").eq("conta_id", conta.id).eq("ativo", true);

    const crachas: Record<string, unknown> = {};
    for (const p of papeis ?? []) {
      if (p.sistema === "painel") {
        /* DUAS COISAS QUE ESTAVAM ERRADAS AQUI, e as duas do mesmo jeito: esta
           porta emitia o cracha do Painel a partir da tabela de INTENCAO
           (acesso_papel), sem perguntar ao Painel.

           1) `master: perms.includes("*")`. Marcar "Acesso total" para alguem
              fazia dessa pessoa a DIRECAO na entrada unica -- e master abre a
              tela de Acessos e a porta painel-acesso, ou seja, cadastrar e
              tirar acesso nos oito sistemas. O dono decidiu (16/08/2026) que
              administrar acesso e so dele; deduzir master de uma caixa de
              permissao desfazia isso em um clique. `master` agora e o que
              sempre foi na painel-auth: o nome da conta da direcao.

           2) `perms` saia de acesso_papel. A Jessica tinha ali fluxo-caixa e
              produtos, que painel_contas nao tem -- a mesma tabela dizendo o
              que o sistema nao confirma. Agora a lista vem de painel_contas,
              que e onde a painel-auth le. Duas portas, uma verdade.

           Sem linha em painel_contas a pessoa NAO tem conta no Painel: nao se
           emite cracha nenhum. Antes ela recebia um cracha de permissao vazia,
           entrava e nao via tela alguma. */
        const ehMaster = usuario === MASTER_PAINEL;
        const { data: doPainel } = await sb.from("painel_contas")
          .select("nome, permissoes, vendedor_id").eq("usuario", usuario).maybeSingle();
        if (!doPainel && !ehMaster) continue;
        const perms: string[] = ehMaster
          ? ["*"]
          : (Array.isArray(doPainel?.permissoes) ? doPainel!.permissoes : []);
        const vend = doPainel?.vendedor_id || p.vendedor_id || "";
        const nome = conta.nome || doPainel?.nome || usuario;
        crachas.painel = {
          token: await assinarJwt(
            { sub: usuario, nome, master: ehMaster, perms, vend },
            PAINEL_SECRET, HORAS_PAINEL * 3600),
          usuario, nome, permissoes: perms, master: ehMaster, vendedorId: vend,
        };
      } else if (p.sistema !== "rh") {
        // RH fica de fora: la o cracha JA e o do Supabase Auth, que vai inteiro
        // na resposta. Emitir um cracha nosso para ele seria inventar um
        // terceiro mecanismo justamente onde ja existe o certo.
        crachas[p.sistema] = {
          token: await crachaEquipe(p.sistema, usuario, conta.nome || usuario, p.papel || ""),
          papel: p.papel || "",
        };
      }
    }

    // Uma linha por sistema, para o historico DAQUELE sistema mostrar quem
    // entrou nele -- mesmo formato que a equipe-auth grava no login direto.
    for (const s of Object.keys(crachas)) await registrar(s, usuario, "entrou");
    if ((papeis ?? []).some((p: any) => p.sistema === "rh")) await registrar("rh", usuario, "entrou");

    return json({
      ok: true,
      usuario, nome: conta.nome || usuario, tipo: conta.tipo,
      // A sessao do Supabase Auth: e ela que o RH usa, e e ela que um dia vai
      // substituir os crachas dos outros seis.
      sessao: { access_token: sessao.access_token, refresh_token: sessao.refresh_token, expires_at: sessao.expires_at },
      crachas,
      sistemas: Object.keys(crachas).concat((papeis ?? []).some((p: any) => p.sistema === "rh") ? ["rh"] : []),
    });
  } catch (e) {
    console.error("[acesso-entrar] erro:", e);
    return json({ erro: "Falha interna na entrada." }, 500);
  }
});
