/* O VERIFICADOR REPROVA O QUE TEM DE REPROVAR?
 *
 * Verificador que nunca acusa nada é indistinguível de verificador quebrado --
 * e o `conferir-papel.mjs` é justamente o que fica VERDE quase sempre. Se um
 * dia ele parar de enxergar as escritas (um `preparar` que engole o arquivo,
 * um regex que deixou de bater), o sinal seria... verde. Igualzinho.
 *
 * Por isso as functions de mentira abaixo: cada uma é um buraco conhecido, e o
 * teste exige que ele acuse aquele buraco pelo NOME. E as boas exigem o
 * contrário -- que ele fique calado, porque o dia em que ele gritar à toa é o
 * dia em que alguém o tira da CI.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

// fileURLToPath, não `.pathname`: o repositório mora no iCloud, cujo caminho
// tem espaço -- e `.pathname` devolve "%20", que nenhum exec encontra.
const SCRIPT = fileURLToPath(new URL("../scripts/conferir-papel.mjs", import.meta.url));

/* As mentiras ficam fora de `supabase/functions` de propósito: function falsa
   dentro da pasta de verdade é candidata a ser publicada por engano. */
function casa(functions, sql = {}) {
  const raiz = mkdtempSync(join(tmpdir(), "papel-"));
  for (const [nome, src] of Object.entries(functions)) {
    mkdirSync(join(raiz, "functions", nome), { recursive: true });
    writeFileSync(join(raiz, "functions", nome, "index.ts"), src);
  }
  mkdirSync(join(raiz, "sql"), { recursive: true });
  for (const [nome, texto] of Object.entries(sql)) writeFileSync(join(raiz, "sql", nome), texto);
  return raiz;
}

function conferir(functions, sql) {
  const raiz = casa(functions, sql);
  try {
    const opcoes = {
      encoding: "utf8",
      env: { ...process.env, PAPEL_DIR: join(raiz, "functions"), PAPEL_SQL: join(raiz, "sql") },
    };
    try {
      return { saida: execFileSync(process.execPath, [SCRIPT], opcoes), codigo: 0 };
    } catch (e) {
      // Sem isto, um script que EXPLODE se parece com um script que não achou
      // nada: os dois devolvem saída vazia.
      if (e.status !== 1) throw new Error(`o verificador não rodou: ${e.stderr || e.message}`);
      return { saida: e.stdout ?? "", codigo: e.status };
    }
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}

// Cabeça comum: confere o crachá e recusa quem não tem sessão. É exatamente o
// que o conferir-portas já exige -- e exatamente o que NÃO basta para gravar.
const CABECA = `
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verificarJwt } from "../_shared/cripto.ts";
const sb = createClient("u", "k");
const resposta = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
Deno.serve(async (req: Request) => {
  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\\s+(.+)$/i);
  const sessao = m ? await verificarJwt(m[1], "segredo") : null;
  if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
  const perms: string[] = Array.isArray(sessao.perms) ? sessao.perms : [];
  const corpo = await req.json();
`;
const PE = `
      default: return resposta({ erro: "acao desconhecida" }, 400);
    }
});
`;

test("acusa o ramo que grava provando só a sessão", () => {
  const { saida, codigo } = conferir({
    "mentira-escreve": `${CABECA}
    switch (corpo.action) {
      case "listar": {
        const { data } = await sb.from("registros").select("registro").eq("colecao", "x");
        return resposta({ ok: true, itens: data });
      }
      case "salvar": {
        await sb.from("registros").upsert({ colecao: "x", id: corpo.id, registro: corpo.item });
        return resposta({ ok: true });
      }${PE}`,
  });
  assert.match(saida, /X mentira-escreve:salvar/);
  assert.doesNotMatch(saida, /mentira-escreve:listar/, "ler não é gravar: acusar leitura vira ruído");
  assert.equal(codigo, 1, "achado tem de derrubar a CI, não só imprimir");
});

test("acusa também quando o despacho é corrente de if, não switch", () => {
  // O conferir-portas só enxerga `case "x":`. As escritas do painel-cache e do
  // painel-crm nunca entraram na conta dele por causa disso.
  const { saida } = conferir({
    "mentira-if": `${CABECA}
  if (corpo.action === "apagar") {
    await sb.from("registros").delete().eq("id", String(corpo.id));
    return resposta({ ok: true });
  }
  return resposta({ erro: "acao desconhecida" }, 400);
});
`,
  });
  assert.match(saida, /X mentira-if:apagar/);
});

test("acusa o mapa de permissão que não cobre a lista fechada", () => {
  // O buraco do painel-ativos, reduzido ao osso: o mapa decide o módulo, a
  // lista fechada tem mais valores que o mapa, e a chave ausente LIBERA.
  const { saida } = conferir({
    "mentira-mapa": `
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const sb = createClient("u", "k");
const resposta = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const TIPOS = new Set(["documento", "veiculo", "marketing", "licitacao", "seguro"]);
Deno.serve(async (req: Request) => {
  const sessao = { master: false, perms: ["marketing"] } as any;
  const perms: string[] = sessao.perms;
  const corpo = await req.json();
  const MODULO_DO_TIPO: Record<string, string> = { marketing: "marketing", licitacao: "licitacoes" };
  const podeTipo = (tipo: string) => {
    const mod = MODULO_DO_TIPO[tipo];
    if (!mod) return true;
    return sessao.master === true || perms.includes("*") || perms.includes(mod);
  };
    switch (corpo.action) {
      case "salvar": {
        const tipo = String(corpo.item?.tipo ?? "");
        if (!TIPOS.has(tipo)) return resposta({ erro: "tipo invalido" }, 400);
        if (!podeTipo(tipo)) return resposta({ erro: "sem acesso" }, 403);
        await sb.from("registros").upsert({ colecao: "ativo", id: corpo.item.id, registro: corpo.item });
        return resposta({ ok: true });
      }${PE}`,
  });
  assert.match(saida, /X mentira-mapa:MODULO_DO_TIPO/);
  // Tem de dizer QUAIS faltam: "o mapa está incompleto" não conserta nada.
  assert.match(saida, /documento/);
  assert.match(saida, /veiculo/);
  assert.match(saida, /seguro/);
  assert.doesNotMatch(saida, /X mentira-mapa:salvar/, "o ramo chamou o porteiro; o furo é o porteiro");
});

test("enxerga o mapa cujo valor é LISTA de módulos, não um módulo só", () => {
  /* O conserto do painel-ativos (PR painel-impresilk#2) trocou
     `Record<string,string>` por `Record<string,string[]>`: `veiculo` e
     `maquina` valem para `documentos` E `manutencoes`, porque é o mesmo carro
     em duas telas. Um detector que só entendesse valor-texto pararia de
     enxergar justamente a forma CERTA -- e mapa invisível é mapa não
     conferido. Aqui o mapa completo passa; tirar UM tipo dele reprova. */
  const fonte = (mapa) => `
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const sb = createClient("u", "k");
const resposta = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
const TIPOS = new Set(["documento", "veiculo", "seguro", "marketing"]);
Deno.serve(async (req: Request) => {
  const sessao = { master: false, perms: ["documentos"] } as any;
  const perms: string[] = sessao.perms;
  const corpo = await req.json();
  const MODULOS_DO_TIPO: Record<string, string[]> = ${mapa};
  const podeTipo = (tipo: string) => {
    if (sessao.master === true || perms.includes("*")) return true;
    const mods = Object.hasOwn(MODULOS_DO_TIPO, tipo) ? MODULOS_DO_TIPO[tipo] : null;
    if (!mods) return false;
    return mods.some((m) => perms.includes(m));
  };
    switch (corpo.action) {
      case "salvar": {
        const tipo = String(corpo.item?.tipo ?? "");
        if (!TIPOS.has(tipo)) return resposta({ erro: "tipo invalido" }, 400);
        if (!podeTipo(tipo)) return resposta({ erro: "sem acesso" }, 403);
        await sb.from("registros").upsert({ colecao: "ativo", id: corpo.item.id, registro: corpo.item });
        return resposta({ ok: true });
      }${PE}`;

  const completo = conferir({ "boa-lista": fonte(
    `{ documento: ["documentos"], seguro: ["documentos"], veiculo: ["documentos", "manutencoes"], marketing: ["marketing"] }`) });
  assert.equal(completo.codigo, 0, `mapa completo não podia acusar nada:\n${completo.saida}`);

  // O tipo que chega depois e ninguém lembra de pôr no mapa: é assim que
  // `seguro` nasceu aberto em 14/09/2026.
  const faltando = conferir({ "mentira-lista": fonte(
    `{ documento: ["documentos"], veiculo: ["documentos", "manutencoes"], marketing: ["marketing"] }`) });
  assert.match(faltando.saida, /X mentira-lista:MODULOS_DO_TIPO/);
  assert.match(faltando.saida, /Falta: seguro/);
});

test("fica calado quando o papel é conferido -- no ramo, no topo ou por ajudante", () => {
  const { saida, codigo } = conferir({
    // 1) prova no próprio ramo
    "boa-ramo": `${CABECA}
    switch (corpo.action) {
      case "salvar": {
        if (!sessao.master && !perms.includes("*") && !perms.includes("patrimonio")) {
          return resposta({ erro: "sem acesso" }, 403);
        }
        await sb.from("registros").upsert({ colecao: "bem", id: corpo.id, registro: corpo.item });
        return resposta({ ok: true });
      }${PE}`,
    // 2) prova antes do despacho, valendo para todos os ramos
    "boa-topo": `${CABECA}
  if (!sessao.master && !perms.includes("*") && !perms.includes("gestao")) {
    return resposta({ erro: "Voce nao tem acesso a Gestao." }, 403);
  }
    switch (corpo.action) {
      case "salvar": {
        await sb.from("gestao_valor").upsert({ id: corpo.id, nome: corpo.nome });
        return resposta({ ok: true });
      }
      case "remover": {
        await sb.from("gestao_valor").delete().eq("id", corpo.id);
        return resposta({ ok: true });
      }${PE}`,
    // 3) prova por ajudante de nome qualquer, dois níveis fundo -- o script lê
    //    o CORPO do ajudante; não é o nome que aprova.
    "boa-ajudante": `${CABECA}
  const temModulo = (mod: string) =>
    sessao.master === true || perms.includes("*") || perms.includes(mod);
  const zzz = (chave: string) => (temModulo(chave) ? null : resposta({ erro: "sem acesso" }, 403));
    switch (corpo.action) {
      case "salvar": {
        const barrado = zzz(String(corpo.chave ?? ""));
        if (barrado) return barrado;
        await sb.from("registros").upsert({ colecao: corpo.chave, id: corpo.id, registro: corpo.item });
        return resposta({ ok: true });
      }${PE}`,
  });
  assert.equal(saida.match(/^X /gm)?.length ?? 0, 0, `não podia ter achado nenhum:\n${saida}`);
  assert.equal(codigo, 0);
});

test("ajudante com nome de porteiro que não confere nada NÃO passa", () => {
  // O contrário do teste anterior, e o motivo de o script ler o corpo em vez
  // de acreditar em `pode...`/`barra...`: nome não é prova.
  const { saida } = conferir({
    "mentira-nome": `${CABECA}
  const podeTudo = (_chave: string) => null;
    switch (corpo.action) {
      case "salvar": {
        const barrado = podeTudo(String(corpo.chave ?? ""));
        if (barrado) return barrado;
        await sb.from("registros").upsert({ colecao: "x", id: corpo.id, registro: corpo.item });
        return resposta({ ok: true });
      }${PE}`,
  });
  assert.match(saida, /X mentira-nome:salvar/);
});

test("rpc é classificada pela declaração no SQL, não pelo nome", () => {
  const sql = {
    "funcoes.sql": `
create or replace function public.ler_coisas(p_x text)
returns table(a text) language sql stable security definer as $function$
  select 'x' as a;
$function$;
create or replace function public.gravar_coisas(p_x text)
returns jsonb language plpgsql security definer as $$
begin
  insert into registros(id) values (p_x);
  return '{}'::jsonb;
end $$;
`,
  };
  const { saida } = conferir({
    "mentira-rpc": `${CABECA}
    switch (corpo.action) {
      case "consultar": {
        const { data } = await sb.rpc("ler_coisas", { p_x: corpo.x });
        return resposta({ ok: true, data });
      }
      case "gravar": {
        const { data } = await sb.rpc("gravar_coisas", { p_x: corpo.x });
        return resposta({ ok: true, data });
      }
      case "desconhecida": {
        const { data } = await sb.rpc("nao_existe_no_repo", { p_x: corpo.x });
        return resposta({ ok: true, data });
      }${PE}`,
  }, sql);
  assert.doesNotMatch(saida, /mentira-rpc:consultar/, "função `stable` só lê");
  assert.match(saida, /X mentira-rpc:gravar/, "função volátil pode gravar");
  // Recusar por omissão: rpc que o repositório não declara conta como escrita.
  assert.match(saida, /X mentira-rpc:desconhecida/);
});

test("comentário não vale como prova de papel", () => {
  // Os arquivos da casa falam de "master", "x-token" e "a direcao" em
  // comentário o tempo todo. Aprovar por causa do que a function DIZ, e não do
  // que ela FAZ, seria o pior jeito de ficar verde.
  const { saida } = conferir({
    "mentira-comentario": `${CABECA}
    switch (corpo.action) {
      case "salvar": {
        /* Só a direcao mexe aqui: confere sessao.master e perms.includes("*"),
           e a carga entra pelo x-token === TOKEN. */
        await sb.from("registros").upsert({ colecao: "x", id: corpo.id, registro: corpo.item });
        return resposta({ ok: true });
      }${PE}`,
  });
  assert.match(saida, /X mentira-comentario:salvar/);
});

test("a declaração escrita cala o achado -- e só ela", () => {
  // As listas SEM_PAPEL / MAPAS_DECLARADOS são a válvula que impede o script
  // de virar ruído. Aqui se prova que elas existem e que o que NÃO está nelas
  // continua sendo acusado: `painel-auth:login` (o próprio login) passa,
  // enquanto a mesma escrita com outro nome de ação é acusada.
  const corpoLogin = `${CABECA}
    switch (corpo.action) {
      case "login": {
        const { data: t } = await sb.rpc("porta_travada", { p_sistema: "painel", p_usuario: corpo.usuario });
        if (t === true) return resposta({ erro: "muitas tentativas" }, 429);
        return resposta({ ok: true });
      }${PE}`;
  const declarada = conferir({ "painel-auth": corpoLogin });
  assert.doesNotMatch(declarada.saida, /painel-auth:login/);
  const igualSemDeclaracao = conferir({ "painel-outra": corpoLogin.replace('case "login"', 'case "entrarDeNovo"') });
  assert.match(igualSemDeclaracao.saida, /X painel-outra:entrarDeNovo/);
});

test("function sem despacho por ação é conferida como UM bloco, não ignorada", () => {
  /* Antes estas caíam num rodapé de "não conferidas" -- e rodapé não segura
     escrita nenhuma. A `acesso-entrar` (entrada única) e o `painel-vigia` são
     porta única e gravam; ficavam as duas fora da conta. Agora o corpo inteiro
     do Deno.serve responde como ramo. */
  const semPapel = conferir({
    "porta-unica": `${CABECA}
  await sb.from("registros").upsert({ colecao: "x", id: corpo.id, registro: corpo.item });
  return resposta({ ok: true });
});
`,
  });
  assert.match(semPapel.saida, /X porta-unica:\(function inteira\)/);
  assert.match(semPapel.saida, /sem despacho por ação, conferidas como UM bloco/);

  // E com portão de papel no corpo, fica calada.
  const comPapel = conferir({
    "porta-unica-boa": `${CABECA}
  if (!sessao.master && !perms.includes("*") && !perms.includes("patrimonio")) {
    return resposta({ erro: "sem acesso" }, 403);
  }
  await sb.from("registros").upsert({ colecao: "x", id: corpo.id, registro: corpo.item });
  return resposta({ ok: true });
});
`,
  });
  assert.equal(comPapel.codigo, 0, comPapel.saida);
});

test("escrita escondida num ajudante de _shared conta como escrita", () => {
  /* O `painel-vigia` grava um upsert em painel_meta sem que a palavra apareça
     no index.ts dele: quem grava é o `vigiarCache`, importado de `_shared`. O
     que não parece escrever não é conferido -- então o script segue o import
     relativo. */
  const raiz = mkdtempSync(join(tmpdir(), "papel-shared-"));
  mkdirSync(join(raiz, "functions", "_shared"), { recursive: true });
  writeFileSync(join(raiz, "functions", "_shared", "ajuda.ts"),
    `export const guardar = async (sb: any, v: unknown) =>
       sb.from("painel_meta").upsert({ chave: "x", valor: v });`);
  mkdirSync(join(raiz, "functions", "mentira-import"), { recursive: true });
  writeFileSync(join(raiz, "functions", "mentira-import", "index.ts"), `
import { guardar } from "../_shared/ajuda.ts";
const sb = {} as any;
const resposta = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
Deno.serve(async (req: Request) => {
  const sessao = { sub: "alguem" } as any;
  if (!sessao) return resposta({ erro: "Entre no sistema." }, 401);
  const corpo = await req.json();
    switch (corpo.action) {
      case "anotar": {
        await guardar(sb, corpo.valor);
        return resposta({ ok: true });
      }${PE}`);
  mkdirSync(join(raiz, "sql"), { recursive: true });
  let saida = "";
  try {
    execFileSync(process.execPath, [SCRIPT], {
      encoding: "utf8",
      env: { ...process.env, PAPEL_DIR: join(raiz, "functions"), PAPEL_SQL: join(raiz, "sql") },
    });
  } catch (e) {
    saida = e.stdout ?? "";
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
  assert.match(saida, /X mentira-import:anotar/);
});

test("rpc volátil que só LÊ não é escrita; quem CHAMA quem grava, é", () => {
  /* Duas armadilhas do classificador, as duas encontradas no repositório:

     - `acesso_revogado` (a conferência de crachá revogado, chamada no topo de
       quase toda function) é plpgsql sem `stable`, logo volátil -- mas não tem
       uma linha de escrita. Contá-la fazia 30 ramos de leitura "gravarem".
     - `painel_crm_resolver` não tem um `insert` sequer: ela chama
       `painel_crm_finalizar`, que tem. Ler só o corpo a deixaria passar. */
  const sql = {
    "f.sql": `
create or replace function public.so_le(p_x text)
returns boolean language plpgsql security definer as $fn$
begin
  return exists (select 1 from contas where id = p_x);
end $fn$;
create or replace function public.grava_mesmo(p_x text)
returns void language plpgsql as $$
begin
  insert into log(id) values (p_x);
end $$;
create or replace function public.chama_quem_grava(p_x text)
returns void language plpgsql as $$
begin
  perform grava_mesmo(p_x);
end $$;
`,
  };
  const { saida } = conferir({
    "mentira-classe": `${CABECA}
    switch (corpo.action) {
      case "conferir": {
        const { data } = await sb.rpc("so_le", { p_x: corpo.x });
        return resposta({ ok: true, data });
      }
      case "porTabela": {
        await sb.rpc("chama_quem_grava", { p_x: corpo.x });
        return resposta({ ok: true });
      }${PE}`,
  }, sql);
  assert.doesNotMatch(saida, /mentira-classe:conferir/, "volátil sem escrita no corpo é leitura");
  assert.match(saida, /X mentira-classe:porTabela/, "quem chama quem grava, grava");
});
