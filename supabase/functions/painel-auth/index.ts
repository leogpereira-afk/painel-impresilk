// ============================================================================
// painel-auth — login do Painel de Gestao (substitui netlify/functions/auth.mjs)
//
// O CONTRATO E O MESMO: { action, ... } e as mesmas respostas. So o backend
// mudou -- store "painel-auth" (1 blob por conta) -> tabela painel_contas.
//
// O painel NAO usa Supabase Auth de proposito: ele ja tem login proprio com
// permissao por modulo, e o hash das senhas (PBKDF2, 120 mil iteracoes) fica em
// painel_contas. Trocar isso agora significaria todo mundo recriar senha sem
// ganho nenhum -- e reescrever mecanismo de senha e a forma mais facil de
// enfraquecer um. O modulo _shared/cripto.ts e copia fiel do que roda hoje.
//
// PROJETO COMPARTILHADO: prefixo obrigatorio. "auth" seria uma function generica
// demais num projeto que hospeda cinco sistemas.
//
// verify_jwt = false: quem valida o cracha e esta funcao, com o JWT_SECRET
// proprio do painel. O gateway do Supabase nao conhece esse cracha.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  assinarJwt, hashSenha, conferirSenha, normalizarUsuario, sessaoDoPedido,
} from "../_shared/cripto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";
// Chave publica: signInWithPassword nao aceita a de servico.
const ANON_KEY = Deno.env.get("ANON_KEY_IMPRESILK") ?? "";
const TOKEN = Deno.env.get("PAINEL_TOKEN") ?? "";
const MASTER_USUARIO = normalizarUsuario(Deno.env.get("PAINEL_AUTH_MASTER_USUARIO") || "leonardo");
const MASTER_SENHA = Deno.env.get("PAINEL_AUTH_MASTER_SENHA") ?? "";

const EXP_SEG = 60 * 60 * 12; // cracha vale 12 horas

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Modulos que podem ser liberados. "inicio" nao entra: e a porta de entrada e
// fica sempre acessivel, senao a pessoa loga e cai numa tela sem lugar nenhum.
// A tela de Acessos so consegue conceder o que estiver AQUI: salvarConta filtra
// a lista recebida por esta constante, em silencio. "gestao" ficou de fora
// quando a tela de direcao nasceu -- marcar a caixa, salvar e receber {ok:true}
// nao concedia nada, e nao havia como perceber. Modulo novo entra nos DOIS
// lugares (aqui e em src/lib/modulos.js) ou nao entra em nenhum.
// fluxo-caixa e produtos sairam: as telas nao existem mais no painel (menu e
// rotas removidos). Conta antiga pode ter o id guardado; ele simplesmente nao
// abre nada, e some na proxima gravacao.
const MODULOS = ["gestao", "contas-atrasadas", "orcamentos", "bancos", "marketing", "licitacoes", "glossario", "compromissos", "manutencoes", "patrimonio", "permutas", "configuracoes"];

// Mensagem UNICA para qualquer falha de login: usuario inexistente e senha
// errada precisam ser indistinguiveis, senao da para descobrir quem tem acesso.
// (Confirmado atacando o sistema no ar em 2026-07-22.)
const ERRO_LOGIN = "Usuario ou senha incorretos.";

// Registro de mentira, so para GASTAR o mesmo tempo quando o usuario nao
// existe. Sem isso a mensagem era igual mas o RELOGIO nao: conta inexistente
// respondia em milissegundos (nem chega a calcular hash) e conta real levava os
// ~100 ms do PBKDF2 de 120 mil voltas -- da para listar quem trabalha aqui so
// cronometrando. O salt e fixo e publico de proposito: ele nao protege nada,
// so faz a conta demorar.
const CONTA_FANTASMA = {
  hash: "0".repeat(64),
  salt: "00112233445566778899aabbccddeeff",
  iter: 120000,
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json" } });

// Comparacao em tempo constante (nao vaza o tamanho do acerto).
function igual(a: unknown, b: unknown): boolean {
  const x = String(a), y = String(b);
  let dif = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) dif |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return dif === 0;
}

async function lerConta(usuario: string) {
  const { data } = await sb.from("painel_contas").select("*").eq("usuario", usuario).maybeSingle();
  return data;
}

// Tira hash/salt antes de devolver uma conta para a tela.
const publica = (c: any) => ({
  usuario: c.usuario,
  nome: c.nome || c.usuario,
  permissoes: c.permissoes || [],
  vendedorId: c.vendedor_id || "",
  atualizadoEm: c.atualizado_em,
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);
  if (!JWT_SECRET) return json({ erro: "Login nao configurado (falta PAINEL_JWT_SECRET).", semConfig: true }, 501);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ erro: "JSON invalido." }, 400);
  }
  const action = String(body.action || "");

  const exigirMaster = async () => {
    const s = await sessaoDoPedido(req, JWT_SECRET);
    return s && s.master === true ? s : null;
  };

  try {
    switch (action) {
      // Diz se o ambiente esta montado, NUNCA os valores. Existe porque "senha
      // incorreta" tem duas causas muito diferentes -- senha errada de verdade,
      // ou a variavel invisivel para a funcao -- e sem isto nao da para separar.
      case "diag": {
        if (!TOKEN || req.headers.get("x-token") !== TOKEN) return json({ erro: "nao autorizado" }, 401);
        const { count } = await sb.from("painel_contas").select("usuario", { count: "exact", head: true });
        return json({
          temJwtSecret: !!JWT_SECRET,
          temMasterSenha: !!MASTER_SENHA,
          usuarioMaster: MASTER_USUARIO,
          contaMasterJaGravada: !!(await lerConta(MASTER_USUARIO)),
          totalContas: count ?? 0,
        });
      }

      case "login": {
        const usuario = normalizarUsuario(body.usuario);
        const senha = String(body.senha || "");
        if (!usuario || !senha) return json({ erro: "Informe usuario e senha." }, 400);

        /* FREIO E RASTRO. Esta porta nao registrava NADA -- nem entrada, nem
           falha -- e nao tinha limite de tentativa: um martelo online contra o
           usuario da direcao era invisivel. Agora ela usa as mesmas duas funcoes
           de banco que as outras quatro portas de senha da casa, e as falhas
           caem no MESMO equipe_acessos_log que a tela ja mostra. */
        const trancar = async () => {
          const { data: t } = await sb.rpc("porta_travada", { p_sistema: "painel", p_usuario: usuario });
          return t === true;
        };
        const anotar = (acao: string, detalhe = "") =>
          sb.rpc("porta_registrar", {
            p_sistema: "painel", p_usuario: usuario, p_acao: acao, p_por: "-", p_detalhe: detalhe,
          }).then(() => {}, () => {});   // log e testemunha: falhar aqui nao derruba o login
        if (await trancar()) {
          await anotar("login-barrado", "porta travada por tentativas");
          return json({
            erro: "Muitas tentativas seguidas. Espere 15 minutos ou peca uma senha nova a direcao.",
          }, 429);
        }

        if (usuario === MASTER_USUARIO) {
          /* MESMO NUMERO DE IDAS AO BANCO que o caminho comum. O ramo do master
             pulava a consulta a acesso_conta, e isso o denunciava pelo relogio:
             ~0,49s constante contra 0,7-1,2s de todo mundo (medido em 6 amostras
             por usuario). Quem cronometrasse a porta descobria QUEM e o dono. */
          await sb.from("acesso_conta").select("ativo").eq("usuario", usuario).maybeSingle();
          const propria = await lerConta(MASTER_USUARIO);
          // A senha do ambiente e apenas a INICIAL: assim que a direcao troca a
          // senha dentro do painel, passa a valer a conta gravada -- a senha
          // definitiva nunca fica escrita numa configuracao.
          const ok = propria
            ? await conferirSenha(senha, propria)
            : !!MASTER_SENHA && igual(senha, MASTER_SENHA);
          if (!ok) { await anotar("login-falhou", "senha errada"); return json({ erro: ERRO_LOGIN }, 401); }
          const token = await assinarJwt(
            { sub: MASTER_USUARIO, nome: propria?.nome || "Direcao", master: true, perms: ["*"], vend: "" },
            JWT_SECRET, EXP_SEG);
          await anotar("entrou", "direcao");
          return json({
            token, usuario: MASTER_USUARIO, nome: propria?.nome || "Direcao",
            permissoes: ["*"], master: true, vendedorId: "",
            trocarSenha: !propria, // avisa a tela para pedir a troca da senha inicial
          });
        }

        /* DESATIVAR TEM DE VALER AQUI TAMBEM.
           `painel_contas` nao tem coluna de ativo: quem manda sobre estar ativo
           e a tabela nova (acesso_conta). Sem esta consulta, desativar alguem na
           tela de Acessos fechava a porta nova e deixava ESTA aberta -- a pessoa
           digitava usuario e senha e entrava com todas as permissoes. */
        const { data: unica } = await sb.from("acesso_conta")
          .select("ativo").eq("usuario", usuario).maybeSingle();
        if (unica && unica.ativo === false) return json({ erro: ERRO_LOGIN }, 401);

        const conta = await lerConta(usuario);
        // Confere SEMPRE, mesmo sem conta: o tempo de resposta tem de ser o
        // mesmo nos dois casos (ver CONTA_FANTASMA).
        const senhaOk = await conferirSenha(senha, conta ?? CONTA_FANTASMA);
        if (!conta || !senhaOk) {
          await anotar("login-falhou", conta ? "senha errada" : "usuario nao existe");
          return json({ erro: ERRO_LOGIN }, 401);
        }
        const perms = conta.permissoes || [];
        const vend = conta.vendedor_id || "";
        const token = await assinarJwt(
          { sub: conta.usuario, nome: conta.nome, master: false, perms, vend }, JWT_SECRET, EXP_SEG);
        await anotar("entrou", "");
        return json({
          token, usuario: conta.usuario, nome: conta.nome,
          permissoes: perms, master: false, vendedorId: vend,
        });
      }

      case "eu": {
        const s = await sessaoDoPedido(req, JWT_SECRET);
        if (!s) return json({ erro: "Sessao invalida ou expirada.", semSessao: true }, 401);
        return json({
          usuario: s.sub, nome: s.nome || s.sub,
          permissoes: s.perms || [], master: s.master === true, vendedorId: s.vend || "",
        });
      }

      // Exige a senha atual: um cracha roubado nao pode tomar a conta.
      case "trocarMinhaSenha": {
        const s = await sessaoDoPedido(req, JWT_SECRET);
        // semSessao: true e o sinal que o cliente usa para deslogar e mostrar
        // "sua sessao expirou". Sem ele, quem passou das 12 horas do cracha
        // ficava preso numa tela de erro que nao dizia o que fazer.
        if (!s?.sub) return json({ erro: "Sua sessao expirou. Entre de novo para trocar a senha.", semSessao: true }, 401);
        const atual = String(body.senhaAtual || "");
        const nova = String(body.novaSenha || "");
        if (nova.length < 6) return json({ erro: "A nova senha precisa ter ao menos 6 caracteres." }, 400);

        const chave = normalizarUsuario(s.sub);
        const conta = await lerConta(chave);
        const ehMaster = s.master === true;

        // Saida so para a DIRECAO ja logada: definir a senha sem lembrar a
        // anterior. Quem esta com essa sessao na mao ja abre tudo no painel --
        // inclusive backup e restauracao --, entao exigir a senha atual aqui
        // protegeria pouco e travaria o dono do sistema para fora. Para as
        // demais contas a senha atual continua obrigatoria: a direcao redefine
        // a senha delas pela tela de acessos.
        /* A SENHA ATUAL E CONFERIDA ONDE ELA DE FATO VALE.
           Depois da virada, quem manda na senha de uma conta migrada e o
           Supabase Auth -- `painel_contas` guarda um hash que pode estar velho.
           Conferindo so no hash velho, a pessoa digitava a senha que usa hoje e
           ouvia "senha atual incorreta". */
        const { data: unificada } = await sb.from("acesso_conta")
          .select("auth_user_id").eq("usuario", chave).maybeSingle();
        const idAuth = unificada?.auth_user_id ?? null;

        const semAtual = body.semSenhaAtual === true && ehMaster;
        let confere = semAtual;
        if (!confere && idAuth && ANON_KEY) {
          const { data: u } = await sb.auth.admin.getUserById(idAuth);
          const email = u?.user?.email;
          if (email) {
            const cliente = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
            const { data: ok } = await cliente.auth.signInWithPassword({ email, password: atual });
            confere = !!ok?.session;
          }
        }
        if (!confere) {
          confere = conta
            ? await conferirSenha(atual, conta)
            : ehMaster && !!MASTER_SENHA && igual(atual, MASTER_SENHA);
        }
        if (!confere) return json({ erro: "Senha atual incorreta." }, 401);

        /* A SENHA E UMA SO -- ENTAO TROCAR AQUI TEM DE TROCAR LA.
           Depois da virada, quem entra pela entrada unica e conferido no
           Supabase Auth, nao em `painel_contas`. Gravando so aqui, a pessoa
           trocava a senha, via "pronto", e no dia seguinte a entrada unica
           continuava pedindo a ANTIGA -- enquanto o login antigo ja queria a
           nova. Duas senhas para a mesma pessoa, do pior jeito: sem ninguem
           saber qual vale onde.
           Se a conta ainda nao foi migrada, nao ha o que atualizar la. */
        if (idAuth) {
          const { error: erroAuth } = await sb.auth.admin
            .updateUserById(idAuth, { password: nova });
          // Falhar aqui e falhar a troca: gravar so de um lado e o problema.
          if (erroAuth) {
            console.error("[painel-auth] troca de senha no Auth:", erroAuth.message);
            return json({ erro: "Nao consegui trocar a senha agora. Tente de novo." }, 500);
          }
        }

        const reg = await hashSenha(nova);
        const { error } = await sb.from("painel_contas").upsert({
          usuario: chave,
          nome: conta?.nome || (ehMaster ? "Direcao" : chave),
          permissoes: ehMaster ? ["*"] : conta?.permissoes || [],
          vendedor_id: conta?.vendedor_id || "",
          ...reg,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: "usuario" });
        if (error) throw new Error(error.message);
        /* E TAMBEM NOS OUTROS SISTEMAS. Faltavam dois lugares: as linhas dela em
           `equipe_contas` (uma POR SISTEMA -- Brief, PCP, POPs, Compras, DRE) e
           os hashes antigos de `acesso_senha_legado`, que a entrada unica aceita
           para quem ainda nao migrou. Sem estes, trocar a senha no Painel
           deixava a antiga abrindo os outros cinco.
           O mecanismo de hash e o mesmo (PBKDF2 120k, salt de 16 bytes, hex), de
           proposito: reescrever isso seria enfraquecer.
           Aviso, nao excecao: a senha do Painel e a do Auth ja foram gravadas. */
        const avisos: string[] = [];
        const { error: eEq } = await sb.from("equipe_contas")
          .update({ ...reg, trocar_senha: false, atualizado_em: new Date().toISOString() })
          .eq("usuario", chave);
        if (eEq) avisos.push("outros sistemas: " + eEq.message);
        const { data: pessoa } = await sb.from("acesso_conta")
          .select("id").eq("usuario", chave).maybeSingle();
        if (pessoa) {
          await sb.from("acesso_senha_legado").delete().eq("conta_id", pessoa.id);
          const { error: eLg } = await sb.from("acesso_senha_legado").insert({
            conta_id: pessoa.id, origem: "propria", hash: reg.hash, salt: reg.salt, iter: reg.iter,
          });
          if (eLg) avisos.push("guarda da entrada unica: " + eLg.message);
        }
        return json({ ok: true, avisos: avisos.length ? avisos : undefined });
      }

      // Quem trabalha aqui -- so nome e usuario, para montar o "encaminhar para"
      // dos compromissos. Qualquer pessoa logada pode ver: para passar uma
      // tarefa para a colega e preciso saber que ela existe. NAO devolve hash,
      // permissao nem vendedor: isso continua sendo coisa da direcao.
      case "listarPessoas": {
        const s = await sessaoDoPedido(req, JWT_SECRET);
        if (!s) return json({ erro: "Entre no sistema.", semSessao: true }, 401);
        const { data, error } = await sb.from("painel_contas")
          .select("usuario, nome, permissoes").order("nome");
        if (error) throw new Error(error.message);
        // SO quem tem a agenda liberada. Mandar compromisso para quem nao tem o
        // modulo fazia a tarefa sumir dos DOIS lados: saia da lista de quem
        // passou e o destinatario nunca a via (o menu esconde e a rota recusa).
        const temAgenda = (perms: any) =>
          Array.isArray(perms) && (perms.includes("*") || perms.includes("compromissos"));
        const pessoas = (data ?? [])
          .filter((c: any) => temAgenda(c.permissoes))
          .map((c: any) => ({ usuario: c.usuario, nome: c.nome || c.usuario }));
        // A direcao pode nao ter linha em painel_contas (enquanto usa a senha
        // inicial do ambiente), mas existe e recebe compromisso como todo mundo.
        if (!pessoas.some((p) => p.usuario === MASTER_USUARIO)) {
          pessoas.unshift({ usuario: MASTER_USUARIO, nome: "Direcao" });
        }
        return json({ pessoas });
      }

      case "listarContas": {
        if (!(await exigirMaster())) return json({ erro: "Apenas a direcao." }, 403);
        const { data, error } = await sb.from("painel_contas").select("*").order("usuario");
        if (error) throw new Error(error.message);
        return json({ contas: (data ?? []).map(publica), modulos: MODULOS, master: MASTER_USUARIO });
      }

      case "salvarConta": {
        if (!(await exigirMaster())) return json({ erro: "Apenas a direcao." }, 403);
        const usuario = normalizarUsuario(body.usuario);
        const nome = String(body.nome || "").trim() || usuario;
        const senha = body.senha ? String(body.senha) : "";
        const permissoes = Array.isArray(body.permissoes)
          ? body.permissoes.filter((p: string) => p === "*" || MODULOS.includes(p))
          : [];
        if (!usuario) return json({ erro: "Informe o usuario." }, 400);
        if (usuario === MASTER_USUARIO) {
          // Nao e limitacao, e desenho: a direcao ja entra e ja ve tudo, entao
          // cadastra-la de novo criaria duas contas com o mesmo nome disputando
          // o login. A senha dela se troca em "Minha senha", dentro do painel.
          return json({
            erro: "Essa e a conta da direcao: ela ja entra e ja enxerga tudo. Para trocar a senha dela, use 'Minha senha' no alto desta pagina.",
          }, 400);
        }

        const atual = await lerConta(usuario);
        // Conta nova exige senha; conta existente pode ser editada sem trocar a
        // senha (campo em branco = mantem a que ja tem).
        if (!atual && senha.length < 6) return json({ erro: "Defina uma senha de ao menos 6 caracteres." }, 400);
        if (senha && senha.length < 6) return json({ erro: "A senha precisa ter ao menos 6 caracteres." }, 400);

        const reg = senha
          ? await hashSenha(senha)
          : { hash: atual!.hash, salt: atual!.salt, iter: atual!.iter };
        /* Campo ausente no corpo = mantem o que ja estava; string vazia = desliga.

           CONTRATO COM A TELA: `salvarConta` e um UPSERT do registro INTEIRO --
           quem chama tem de mandar `permissoes` e `vendedorId` com os valores
           ATUAIS da conta, nao com o formulario em branco. Em 04/08/2026 isso
           mordeu: digitar "karen" no campo Usuario (caminho natural para trocar
           a senha dela) mandava o form vazio e zerava permissoes e vinculo sem
           avisar. O conserto ficou na TELA, que agora carrega os valores da
           conta assim que o usuario digitado casa com uma existente.

           NAO transformamos "string vazia" em "manter" aqui de proposito: seria
           tirar da direcao a unica forma de REMOVER uma permissao ou desligar um
           vinculo -- trocar um footgun por uma trava. Se um dia outro cliente
           chamar esta API, ele tem de respeitar o mesmo contrato, ou mandar o
           campo ausente. */
        const vendedorId = body.vendedorId === undefined
          ? atual?.vendedor_id || ""
          : String(body.vendedorId || "").trim();

        const { error } = await sb.from("painel_contas").upsert({
          usuario, nome, permissoes, vendedor_id: vendedorId, ...reg,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: "usuario" });
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }

      case "removerConta": {
        if (!(await exigirMaster())) return json({ erro: "Apenas a direcao." }, 403);
        const usuario = normalizarUsuario(body.usuario);
        if (!usuario) return json({ erro: "Informe o usuario." }, 400);
        if (usuario === MASTER_USUARIO) return json({ erro: "A conta da direcao nao pode ser removida." }, 400);
        await sb.from("painel_contas").delete().eq("usuario", usuario);
        return json({ ok: true });
      }

      default:
        return json({ erro: `Acao desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[painel-auth] erro:", e);
    return json({ erro: "Falha interna no login." }, 500);
  }
});
