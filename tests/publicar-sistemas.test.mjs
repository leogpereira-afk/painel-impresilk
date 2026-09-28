import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AUTOMATICO_DESDE, decidir, importsRelativos, juntarArquivos, listarFunctions, metadados, tipoDoArquivo,
} from "../scripts/lib/publicar-sistemas.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "../scripts/publicar-sistemas.mjs");

function escrever(raiz, arquivos) {
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    mkdirSync(dirname(join(raiz, rel)), { recursive: true });
    writeFileSync(join(raiz, rel), conteudo);
  }
}

// Repositório de verdade, com a data de cada commit escolhida: é ela que decide.
function repositorio(raiz, commits) {
  mkdirSync(raiz, { recursive: true });
  const git = (...a) => execFileSync("git", ["-C", raiz, ...a], { stdio: "pipe" });
  git("init", "-q", "-b", "main");
  for (const { quando, arquivos } of commits) {
    escrever(raiz, arquivos);
    git("add", "-A");
    execFileSync("git", ["-C", raiz, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "c"], {
      env: { ...process.env, GIT_AUTHOR_DATE: quando, GIT_COMMITTER_DATE: quando },
    });
  }
}

test("imports relativos: os três jeitos de citar, com várias linhas; URL, npm: e jsr: ficam de fora", () => {
  const texto = `
    import { a } from "./a.ts";
    import {
      b,
      c,
    } from '../_shared/b.mjs';
    export { d } from "./d.js";
    import "./efeito.ts";
    const e = await import("../_shared/e.ts");
    import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
    import x from "npm:zod";
    import y from "jsr:@std/path";
  `;
  assert.deepEqual(importsRelativos(texto).sort(), ["../_shared/b.mjs", "../_shared/e.ts", "./a.ts", "./d.js", "./efeito.ts"]);
});

test("pacote da function: a pasta inteira e o que ela importa, seguindo os imports dos imports", () => {
  const raiz = mkdtempSync(join(tmpdir(), "pacote-"));
  escrever(raiz, {
    "supabase/functions/sistema-api/index.ts": 'import { r } from "./regras.mjs";\nimport { c } from "../_shared/cors.ts";\n// import { velho } from "../_shared/nao-existe.ts";\n',
    "supabase/functions/sistema-api/regras.mjs": 'export { base } from "../_shared/base.mjs";\n',
    "supabase/functions/sistema-api/dados.json": "{}",
    "supabase/functions/_shared/cors.ts": "export const c = 1;\n",
    "supabase/functions/_shared/base.mjs": 'import "./fundo.js";\nexport const base = 1;\n',
    "supabase/functions/_shared/fundo.js": "",
    "supabase/functions/_shared/sobra.ts": "export const naoUsado = 1;\n",
    "supabase/functions/outra/index.ts": "",
  });
  assert.deepEqual(juntarArquivos(raiz, "sistema-api"), [
    "supabase/functions/_shared/base.mjs",
    "supabase/functions/_shared/cors.ts",
    "supabase/functions/_shared/fundo.js",
    "supabase/functions/sistema-api/dados.json",
    "supabase/functions/sistema-api/index.ts",
    "supabase/functions/sistema-api/regras.mjs",
  ]);
  // _shared e pasta sem index.ts não são functions.
  assert.deepEqual(listarFunctions(raiz), ["outra", "sistema-api"]);
});

test("decisão: em dia, publicar, pendente de antes da automação, forçada, fora do ar e sem histórico", () => {
  const noAr = { updated_at: Date.parse("2026-10-01T12:00:00Z") };
  const depois = Date.parse("2026-10-01T12:05:00Z");
  assert.equal(decidir({ noAr, ultimoCommitMs: Date.parse("2026-10-01T11:00:00Z") }).acao, "manter");
  assert.equal(decidir({ noAr, ultimoCommitMs: noAr.updated_at }).acao, "manter");
  assert.equal(decidir({ noAr, ultimoCommitMs: depois }).acao, "publicar");
  // Commit mais novo que a versão no ar, mas anterior à automação: só à mão.
  const antigo = { updated_at: Date.parse("2026-08-19T14:57:00Z") };
  assert.equal(decidir({ noAr: antigo, ultimoCommitMs: Date.parse("2026-09-22T19:24:00Z") }).acao, "pendente");
  assert.ok(AUTOMATICO_DESDE > Date.parse("2026-09-28T10:00:00Z"));
  assert.equal(decidir({ noAr: antigo, ultimoCommitMs: Date.parse("2026-09-22T19:24:00Z"), forcar: true }).acao, "publicar");
  assert.equal(decidir({ noAr: undefined, ultimoCommitMs: depois }).acao, "pular");
  assert.equal(decidir({ noAr, ultimoCommitMs: NaN }).acao, "erro");
});

test("configuração segue a do ar: verify_jwt e import map", () => {
  const arquivos = ["supabase/functions/f/index.ts", "supabase/functions/f/deno.json"];
  assert.deepEqual(metadados("f", arquivos, { verify_jwt: false, import_map: false }),
    { name: "f", entrypoint_path: "supabase/functions/f/index.ts", verify_jwt: false });
  // Publicar por cima não pode desligar a trava do gateway calado.
  assert.equal(metadados("f", arquivos, { verify_jwt: true }).verify_jwt, true);
  assert.equal(metadados("f", arquivos, { import_map: true }).import_map_path, "supabase/functions/f/deno.json");
  assert.throws(() => metadados("f", ["supabase/functions/f/index.ts"], { import_map: true }), /import map/);
  assert.equal(tipoDoArquivo("a/b.mjs"), "application/javascript");
  assert.equal(tipoDoArquivo("a/b.ts"), "application/typescript");
  assert.equal(tipoDoArquivo("a/deno.json"), "application/json");
});

test("de ponta a ponta: publica só a atrasada, com os arquivos certos, e não cria a que não existe no ar", async () => {
  const origem = mkdtempSync(join(tmpdir(), "origem-"));
  repositorio(join(origem, "sistema"), [
    { quando: "2026-10-01T10:00:00Z", arquivos: {
      "supabase/functions/_shared/cors.ts": "export const c = 1;\n",
      "supabase/functions/sis-api/index.ts": 'import { c } from "../_shared/cors.ts";\n',
      "supabase/functions/sis-rotina/index.ts": "export {};\n",
      "supabase/functions/sis-nova/index.ts": "export {};\n",
    } },
    // Mexe só no _shared, que a sis-api usa e a sis-rotina não.
    { quando: "2026-10-02T10:00:00Z", arquivos: { "supabase/functions/_shared/cors.ts": "export const c = 2;\n" } },
  ]);
  const registro = join(origem, "sistemas.json");
  writeFileSync(registro, JSON.stringify([{ repo: "sistema", nome: "Sistema", projeto: "projetoteste" }]));

  const recebidos = [];
  const servidor = createServer((req, res) => {
    const partes = [];
    req.on("data", (p) => partes.push(p));
    req.on("end", () => {
      assert.equal(req.headers.authorization, "Bearer sbp_teste");
      if (req.method === "GET") {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify([
          { slug: "sis-api", version: 7, updated_at: Date.parse("2026-10-01T11:00:00Z"), verify_jwt: false, import_map: false },
          { slug: "sis-rotina", version: 3, updated_at: Date.parse("2026-10-01T11:00:00Z"), verify_jwt: true, import_map: false },
        ]));
      }
      recebidos.push({ url: req.url, corpo: Buffer.concat(partes).toString("utf8") });
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ version: 8, status: "ACTIVE" }));
    });
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  const porta = servidor.address().port;

  const rodar = (...extra) => new Promise((ok) => {
    const filho = spawn(process.execPath, [SCRIPT, "--origem", origem, "--registro", registro, ...extra], {
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: "sbp_teste", SUPABASE_API_URL: `http://127.0.0.1:${porta}/v1` },
    });
    let saida = "";
    filho.stdout.on("data", (d) => { saida += d; });
    filho.stderr.on("data", (d) => { saida += d; });
    filho.on("close", (codigo) => ok({ codigo, saida }));
  });

  try {
    const simulado = await rodar("--simular");
    assert.equal(simulado.codigo, 0, simulado.saida);
    assert.equal(recebidos.length, 0, "simulação não publica");

    const { codigo, saida } = await rodar();
    assert.equal(codigo, 0, saida);
    assert.match(saida, /sis-api: publicada v8/);
    assert.match(saida, /sis-rotina: em dia/);
    assert.match(saida, /sis-nova: não existe no ar/);
    assert.equal(recebidos.length, 1);
    assert.equal(recebidos[0].url, "/v1/projects/projetoteste/functions/deploy?slug=sis-api");
    const corpo = recebidos[0].corpo;
    assert.match(corpo, /"entrypoint_path":"supabase\/functions\/sis-api\/index.ts"/);
    assert.match(corpo, /"verify_jwt":false/);
    assert.match(corpo, /filename="supabase\/functions\/_shared\/cors.ts"/);
    assert.match(corpo, /filename="supabase\/functions\/sis-api\/index.ts"/);
    assert.match(corpo, /export const c = 2;/);

    // Forçar uma function preserva o verify_jwt dela; forçar tudo é recusado.
    const forcada = await rodar("--funcao", "sis-rotina", "--forcar");
    assert.equal(forcada.codigo, 0, forcada.saida);
    assert.match(recebidos[1].corpo, /"verify_jwt":true/);
    const tudo = await rodar("--forcar");
    assert.notEqual(tudo.codigo, 0);
    assert.match(tudo.saida, /só vale com --funcao/);
  } finally {
    servidor.close();
  }
});
