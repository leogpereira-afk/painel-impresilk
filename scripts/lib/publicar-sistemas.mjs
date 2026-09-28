// ============================================================================
// Regras do publicador de functions dos outros sistemas (scripts/publicar-sistemas.mjs).
//
// Ficam aqui, sem rede e sem git, para os testes conferirem cada decisão:
// o que entra no pacote de uma function, quando ela está atrasada e com que
// configuração ela sobe.
// ============================================================================
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";

// Os três jeitos de citar outro arquivo: import/export ... from "x",
// import "x" e import("x"). Só os caminhos relativos interessam: URL, npm: e
// jsr: o próprio Supabase baixa.
const CITACOES = [
  /\b(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

export function importsRelativos(texto) {
  const achados = new Set();
  for (const re of CITACOES) {
    for (const m of texto.matchAll(re)) {
      if (m[1].startsWith("./") || m[1].startsWith("../")) achados.add(m[1]);
    }
  }
  return [...achados];
}

const CODIGO = /\.(m?[jt]sx?)$/;

function listarPasta(raiz, pasta) {
  const saida = [];
  for (const nome of readdirSync(join(raiz, pasta))) {
    if (nome.startsWith(".") || nome === "node_modules") continue;
    const rel = `${pasta}/${nome}`;
    if (statSync(join(raiz, rel)).isDirectory()) saida.push(...listarPasta(raiz, rel));
    else saida.push(rel);
  }
  return saida;
}

// O PACOTE DE UMA FUNCTION: a pasta inteira dela e tudo o que ela importa por
// caminho relativo, seguindo os imports dos imports. É assim que o _shared
// entra, e também qualquer outro ajudante fora da pasta. Lista escrita à mão
// esquece justamente o arquivo novo (o script do PCP subia sem o _shared e o
// Supabase recusava com "Module not found").
// Os caminhos são relativos à raiz do repositório, o mesmo formato da CLI do
// Supabase: supabase/functions/<nome>/index.ts.
export function juntarArquivos(raiz, nome) {
  const pasta = `supabase/functions/${nome}`;
  const fila = [];
  const vistos = new Set();
  const incluir = (rel) => {
    if (vistos.has(rel)) return;
    const caminho = join(raiz, rel);
    // Import citado em comentário ou arquivo que não existe fica de fora: se o
    // import for de verdade, a publicação acusa e o erro aparece no log.
    if (!existsSync(caminho) || !statSync(caminho).isFile()) return;
    vistos.add(rel);
    fila.push(rel);
  };
  for (const rel of listarPasta(raiz, pasta)) incluir(rel);
  for (let i = 0; i < fila.length; i++) {
    if (!CODIGO.test(fila[i])) continue;
    for (const citado of importsRelativos(readFileSync(join(raiz, fila[i]), "utf8"))) {
      const alvo = posix.normalize(posix.join(posix.dirname(fila[i]), citado.split(/[?#]/)[0]));
      if (alvo.startsWith("../")) continue; // fora do repositório
      incluir(alvo);
    }
  }
  return fila.sort();
}

// A PARTIR DE QUANDO a publicação é automática. Na primeira simulação
// (28/09/2026), 49 functions tinham commit depois da versão no ar. Quase todas
// eram "publicou à mão e fez o commit um minuto depois", mas havia código parado
// havia semanas e o Minaslab tinha commits da mesma manhã, de outra sessão que
// ainda estava trabalhando. Publicar tudo isso de uma vez, sem ninguém olhar,
// seria trocar um problema calado por outro. Commit anterior a esta data aparece
// como PENDENTE no relatório e só sobe à mão (--funcao X --forcar), depois de
// conferido. Commit novo sobe sozinho.
export const AUTOMATICO_DESDE = Date.parse("2026-09-28T10:45:00Z");

// ATRASADA = a main tem commit nesses arquivos depois da versão que está no ar.
// Function que não existe no ar não é criada: nasce pela primeira publicação à
// mão, conferida (o Portal dos Bosques tem uma pdb-setup que nunca foi ao ar de
// propósito). Nada é apagado.
export function decidir({ noAr, ultimoCommitMs, forcar = false, desde = AUTOMATICO_DESDE }) {
  if (!noAr) return { acao: "pular", motivo: "não existe no ar (a primeira publicação é à mão)" };
  if (!Number.isFinite(ultimoCommitMs)) return { acao: "erro", motivo: "sem histórico no git para esses arquivos" };
  if (forcar) return { acao: "publicar", motivo: "forçada" };
  if (ultimoCommitMs <= Number(noAr.updated_at)) return { acao: "manter", motivo: "em dia" };
  if (ultimoCommitMs <= desde) return { acao: "pendente", motivo: "commit anterior à publicação automática: conferir e publicar à mão" };
  return { acao: "publicar", motivo: "a main tem commit mais novo que a versão no ar" };
}

// A CONFIGURAÇÃO FICA COMO ESTÁ NO AR. verify_jwt vem da versão atual: nenhum
// sistema daqui confere crachá pelo gateway, mas se algum dia um conferir,
// publicar por cima não pode desligar essa trava calado. O import map também
// segue o que está no ar.
export function metadados(nome, arquivos, noAr) {
  const meta = {
    name: nome,
    entrypoint_path: `supabase/functions/${nome}/index.ts`,
    verify_jwt: noAr.verify_jwt === true,
  };
  if (noAr.import_map) {
    const mapa = ["deno.json", "deno.jsonc", "import_map.json"]
      .map((n) => `supabase/functions/${nome}/${n}`)
      .find((p) => arquivos.includes(p));
    if (!mapa) throw new Error("no ar usa import map, mas a pasta não tem deno.json nem import_map.json");
    meta.import_map_path = mapa;
  }
  return meta;
}

export function tipoDoArquivo(rel) {
  if (/\.m?jsx?$/.test(rel)) return "application/javascript";
  if (/\.json[c]?$/.test(rel)) return "application/json";
  if (/\.tsx?$/.test(rel)) return "application/typescript";
  return "application/octet-stream";
}

export function listarFunctions(raiz) {
  const base = join(raiz, "supabase/functions");
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .filter((n) => !n.startsWith("_") && !n.startsWith("."))
    .filter((n) => existsSync(join(base, n, "index.ts")))
    .sort();
}
