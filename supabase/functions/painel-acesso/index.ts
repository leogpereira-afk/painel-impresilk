// ============================================================================
// painel-acesso — quem entra nos SETE sistemas, num lugar so.
//
// Le e escreve acesso_conta / acesso_papel, as tabelas que consolidam
// equipe_contas (uma linha por pessoa POR SISTEMA) e painel_contas.
//
// ATENCAO AO QUE ESTA FUNCTION *NAO* FAZ: ela nao decide login nenhum ainda.
// Quem manda nos logins de hoje continua sendo equipe_contas e painel_contas.
// Isto aqui e a PREPARACAO da virada -- a tela diz isso com todas as letras,
// senao a direcao mexe aqui, acha que tirou o acesso de alguem, e nao tirou.
//
// So a direcao entra. Nao ha leitura para gestor nem para colaborador: a lista
// de quem entra em que sistema e, por si so, um mapa de onde bater.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verificarJwt } from "../_shared/cripto.ts";

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

// No RH a chave da conta e o NOME COMPLETO da pessoa: perfis.usuario e casado
// com o nome da ficha do colaborador (equipe-auth rhSalvar). Mandar o usuario
// curto ("karen") criaria uma SEGUNDA conta chamada karen, ao lado da Karen
// Luiza de verdade -- e ninguem perceberia ate ela nao conseguir entrar.
const alvoNoSistema = (conta: any, sistema: string) =>
  sistema === "rh" ? texto(conta.colaborador, 160) : texto(conta.usuario, 60);

// O painel nao tem papel: tem lista de modulos. A equipe-auth so entende
// "acesso total" pelo papel literal "tudo" (painelSalvar), entao a estrela da
// lista de permissoes e traduzida aqui. Mandar "" com ["*"] gravaria uma lista
// vazia: o filtro de modulos descarta a estrela, calado.
const papelNoSistema = (sistema: string, papel: unknown, permissoes: unknown[]) =>
  sistema === "painel"
    ? (Array.isArray(permissoes) && permissoes.includes("*") ? "tudo" : "")
    : texto(papel, 40);

// A pessoa JA tem conta naquele sistema? Ler para decidir e legitimo -- o que
// esta function nao faz e ESCREVER as regras dos outros. Isto decide so uma
// coisa: se e preciso inventar uma senha (conta nova) ou nao (conta que ja
// existe, e cuja senha nao pode ser mexida sem pedirem).
async function jaExisteNoSistema(conta: any, sistema: string): Promise<boolean> {
  const alvo = alvoNoSistema(conta, sistema);
  if (!alvo) return false;
  if (sistema === "painel") {
    const { data } = await sb.from("painel_contas").select("usuario").eq("usuario", alvo).maybeSingle();
    return !!data;
  }
  if (sistema === "rh") {
    // `perfis.usuario` e o nome NORMALIZADO (sem acento) pelo RH. Comparar com
    // .toLowerCase() sozinho fazia "Barbara Patrícia" nunca bater com
    // "barbara patricia": a function achava que a conta nao existia, mandava
    // senha nova junto e a equipe-auth TROCAVA a senha do RH da pessoa a cada
    // mudanca de papel.
    const alvoRh = alvo.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/\s+/g, " ").trim();
    const { data } = await sb.from("perfis").select("user_id")
      .eq("usuario", alvoRh).maybeSingle();
    return !!data;
  }
  const { data } = await sb.from("equipe_contas").select("usuario")
    .eq("sistema", sistema).eq("usuario", alvo).maybeSingle();
  return !!data;
}

// Senha temporaria legivel: quem recebe consegue digitar sem errar, e ela morre
// na primeira entrada (a equipe-auth marca trocar_senha).
const PALAVRAS = ["pedra", "verde", "chuva", "campo", "vento", "folha", "porta",
  "praia", "monte", "peixe", "trilho", "barro", "vidro", "fogo"];
function senhaTemporaria() {
  const n = crypto.getRandomValues(new Uint32Array(3));
  return `${PALAVRAS[n[0] % PALAVRAS.length]}-${PALAVRAS[n[1] % PALAVRAS.length]}-${100 + (n[2] % 900)}`;
}

// Os sete sistemas da casa. Lista fechada: sistema digitado errado viraria uma
// linha de papel que nenhuma tela le e ninguem descobre.
const SISTEMAS = ["painel", "rh", "pcp", "brief", "dre", "compras", "pops"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "use POST" }, 405);
  if (!JWT_SECRET) return resposta({ erro: "Login nao configurado no servidor." }, 503);

  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const sessao = m ? await verificarJwt(m[1], JWT_SECRET) : null;
  if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
  const perms: string[] = Array.isArray(sessao.perms) ? sessao.perms : [];
  if (sessao.master !== true && !perms.includes("*")) {
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

        return resposta({
          ok: true,
          sistemas: SISTEMAS,
          contas: (contas ?? []).map((c: any) => ({
            ...c,
            papeis: (papeis ?? []).filter((p: any) => p.conta_id === c.id),
            senhas: (senhas ?? []).filter((s: any) => s.conta_id === c.id)
              .map((s: any) => ({ origem: s.origem, migrada: !!s.usado_em })),
          })),
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
        const { data: existe } = await sb.from("acesso_conta").select("id").eq("usuario", usuario).maybeSingle();
        if (existe) return resposta({ erro: "Ja existe alguem com esse usuario." }, 409);

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
          await sb.from("acesso_papel").upsert({
            conta_id: nova.id, sistema, papel: texto(p.papel, 40),
            permissoes: Array.isArray(p.permissoes) ? p.permissoes : [],
            vendedor_id: texto(p.vendedorId, 120), ativo: true,
          }, { onConflict: "conta_id,sistema" });
        }
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
        for (const p of papeis ?? []) {
          const r = await chamarEquipe({
            acao: "salvarConta", sistema: p.sistema,
            usuario: alvoNoSistema(conta, p.sistema), nome: conta.nome,
            papel: papelNoSistema(p.sistema, p.papel, p.permissoes ?? []),
            permissoes: p.permissoes ?? [], senha, temporaria: true,
          });
          if (r.ok) trocados.push(p.sistema);
          else recusados.push({ sistema: p.sistema, erro: r.erro || "nao consegui" });
        }
        // A senha antiga guardada para a virada nao vale mais nada.
        await sb.from("acesso_senha_legado")
          .update({ usado_em: new Date().toISOString() }).eq("conta_id", id);
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
        for (const p of papeis ?? []) {
          if (p.sistema === "rh" || p.sistema === "painel") {
            // Nenhum dos dois tem coluna de "desativado": no painel a conta
            // existe ou nao existe, e no RH quem manda e a linha em perfis.
            // Desativar ali seria apagar -- e apagar leva junto o historico.
            recusados.push({ sistema: p.sistema, erro: "Aqui e preciso remover o acesso, nao ha como so desativar." });
            continue;
          }
          const r = await chamarEquipe({
            acao: "salvarConta", sistema: p.sistema,
            usuario: alvoNoSistema(conta, p.sistema), nome: conta.nome,
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

        // Conta nova naquele sistema nasce com senha temporaria; conta que ja
        // existe nao tem a senha mexida.
        const nova = !(await jaExisteNoSistema(conta, sistema));
        const senha = nova ? (texto(corpo.senha, 80) || senhaTemporaria()) : "";

        const r = await chamarEquipe({
          acao: "salvarConta", sistema,
          usuario: alvoNoSistema(conta, sistema), nome: conta.nome,
          papel: papelNoSistema(sistema, p.papel, p.permissoes ?? []),
          permissoes: Array.isArray(p.permissoes) ? p.permissoes : [],
          ...(senha ? { senha, temporaria: true } : {}),
        });
        if (!r.ok) return resposta({ erro: r.erro || "Nao consegui dar esse acesso." }, 400);

        // Guarda o que de fato foi aceito la, nao o que foi pedido: gravar o
        // pedido inteiro faria esta tabela afirmar um acesso que nao existe.
        const pedidas = Array.isArray(p.permissoes) ? p.permissoes : [];
        const aceitas = pedidas.filter((x: string) => !(r.descartados ?? []).includes(x));
        const { error } = await sb.from("acesso_papel").upsert({
          conta_id: id,
          sistema,
          papel: texto(p.papel, 40),
          permissoes: aceitas,
          vendedor_id: texto(p.vendedorId, 120),
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
        if (await jaExisteNoSistema(conta, sistema)) {
          const r = await chamarEquipe({
            acao: "removerConta", sistema, usuario: alvoNoSistema(conta, sistema),
          });
          if (!r.ok) return resposta({ erro: r.erro || "Nao consegui tirar esse acesso." }, 400);
        }
        await sb.from("acesso_papel").delete().eq("conta_id", id).eq("sistema", sistema);
        return resposta({ ok: true });
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
