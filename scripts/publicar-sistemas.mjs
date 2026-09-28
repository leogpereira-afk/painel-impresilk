#!/usr/bin/env node
// ============================================================================
// Publica as Edge Functions que ficaram para trás nos OUTROS sistemas.
//
// POR QUE ESTE ARQUIVO EXISTE: só o Painel e a Central do Léo publicavam
// sozinhos (e o RH, pela integração do próprio Supabase). Brief, DRE, Compras,
// POPs, Método V.O.F., Domo, Diamond, Bosques, Portal dos Bosques e Minaslab
// dependiam de alguém lembrar de publicar à mão, e o PCP só subia de carona
// quando uma function do Painel mudava. É o mesmo defeito que o functions.yml
// nasceu para acabar (14/09/2026), um andar acima: código na main, servidor na
// versão velha, calado.
//
// O Painel já é a capa e já publicava o PCP de um repositório irmão com o mesmo
// token (SUPABASE_ACCESS_TOKEN, só Edge Functions read-write, nos dois
// projetos). Então é ele quem confere todos: um token, um lugar para trocar.
//
// COMO DECIDE, sistema por sistema (lista em scripts/sistemas-functions.json):
//   1. clona a main (são repositórios públicos; a Corretora, privada, fica de fora);
//   2. para cada function, junta a pasta dela e tudo o que ela importa por
//      caminho relativo (scripts/lib/publicar-sistemas.mjs);
//   3. se a main tem commit nesses arquivos DEPOIS da versão no ar, publica;
//      senão, está em dia. Commit anterior a AUTOMATICO_DESDE aparece como
//      PENDENTE e só sobe à mão. Function que não existe no ar não é criada, e
//      nada é apagado. verify_jwt e import map ficam como estão no ar.
//
// USO (o token é o "personal access token" do Supabase, começa com sbp_):
//   export SUPABASE_ACCESS_TOKEN=sbp_...
//   node scripts/publicar-sistemas.mjs                      # todos
//   node scripts/publicar-sistemas.mjs --sistema brief-medicao
//   node scripts/publicar-sistemas.mjs --simular            # só mostra o que faria
//   node scripts/publicar-sistemas.mjs --sistema domo --funcao domo-rotina --forcar
//
// Para os testes: --origem <pasta com os repositórios já clonados>,
// --registro <lista de sistemas> e a variável SUPABASE_API_URL
// (padrão https://api.supabase.com/v1).
// ============================================================================
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { decidir, juntarArquivos, listarFunctions, metadados, tipoDoArquivo } from "./lib/publicar-sistemas.mjs";

const API = process.env.SUPABASE_API_URL || "https://api.supabase.com/v1";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";
const DONO = "leogpereira-afk";

const args = process.argv.slice(2);
const valor = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] || "" : "";
};
const SO = valor("--sistema");
const FUNCAO = valor("--funcao");
const ORIGEM = valor("--origem");
const REGISTRO = valor("--registro") || new URL("./sistemas-functions.json", import.meta.url);
const FORCAR = args.includes("--forcar");
const SIMULAR = args.includes("--simular");

if (!TOKEN) {
  console.error("Falta o token. Rode:  export SUPABASE_ACCESS_TOKEN=sbp_...");
  process.exit(1);
}
// --forcar em todos de uma vez republicaria dezenas de functions sem ninguém
// olhar: é exatamente o que o AUTOMATICO_DESDE existe para evitar.
if (FORCAR && !FUNCAO) {
  console.error("--forcar só vale com --funcao (uma function por vez, depois de conferida).");
  process.exit(1);
}

const SISTEMAS = JSON.parse(readFileSync(REGISTRO, "utf8")).filter((s) => !SO || s.repo === SO);
if (!SISTEMAS.length) {
  console.error(`Nenhum sistema com o repositório "${SO}" na lista de sistemas.`);
  process.exit(1);
}

const hora = (ms) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(ms));

async function chamar(caminho, opcoes = {}) {
  const r = await fetch(`${API}${caminho}`, { ...opcoes, headers: { Authorization: `Bearer ${TOKEN}`, ...(opcoes.headers || {}) } });
  const corpo = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error("token recusado (401): vencido ou errado. Gere outro e troque o SUPABASE_ACCESS_TOKEN.");
  if (!r.ok) throw new Error(`${corpo.message || corpo.error || "erro"} (HTTP ${r.status})`);
  return corpo;
}

// Uma consulta por projeto: a lista já traz hora da versão, verify_jwt e import map.
const noArPorProjeto = new Map();
async function funcoesNoAr(projeto) {
  if (!noArPorProjeto.has(projeto)) {
    const lista = await chamar(`/projects/${projeto}/functions`);
    noArPorProjeto.set(projeto, new Map(lista.map((f) => [f.slug, f])));
  }
  return noArPorProjeto.get(projeto);
}

function clonar(repo) {
  if (ORIGEM) return { raiz: join(ORIGEM, repo), limpar: () => {} };
  const pasta = mkdtempSync(join(tmpdir(), `fn-${repo}-`));
  // Sem blobs antigos: o histórico serve só para as datas dos commits.
  execFileSync("git", ["clone", "--quiet", "--filter=blob:none", `https://github.com/${DONO}/${repo}.git`, pasta], {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  return { raiz: pasta, limpar: () => rmSync(pasta, { recursive: true, force: true }) };
}

function ultimoCommitMs(raiz, arquivos) {
  const saida = execFileSync("git", ["-C", raiz, "log", "-1", "--format=%ct", "--", ...arquivos], { encoding: "utf8" }).trim();
  return saida ? Number(saida) * 1000 : NaN;
}

async function publicar(projeto, raiz, nome, arquivos, noAr) {
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadados(nome, arquivos, noAr))], { type: "application/json" }));
  for (const rel of arquivos) form.append("file", new Blob([readFileSync(join(raiz, rel))], { type: tipoDoArquivo(rel) }), rel);
  const r = await chamar(`/projects/${projeto}/functions/deploy?slug=${encodeURIComponent(nome)}`, { method: "POST", body: form });
  // "deployed" na resposta não prova nada sem a versão nova.
  if (!r.version) throw new Error(`resposta sem versão: ${JSON.stringify(r).slice(0, 200)}`);
  return r.version;
}

const conta = { publicadas: 0, emDia: 0, pendentes: 0, puladas: 0, falhas: 0 };
let achouFuncao = false;
for (const sistema of SISTEMAS) {
  console.log(`\n${sistema.nome} (${sistema.repo} → ${sistema.projeto})`);
  let clone;
  try {
    const noAr = await funcoesNoAr(sistema.projeto);
    clone = clonar(sistema.repo);
    const nomes = listarFunctions(clone.raiz).filter((n) => !FUNCAO || n === FUNCAO);
    if (!nomes.length) console.log(FUNCAO ? `  (sem a function ${FUNCAO})` : "  (sem functions em supabase/functions)");
    for (const nome of nomes) {
      achouFuncao = true;
      try {
        const arquivos = juntarArquivos(clone.raiz, nome);
        const commit = ultimoCommitMs(clone.raiz, arquivos);
        const versao = noAr.get(nome);
        const { acao, motivo } = decidir({ noAr: versao, ultimoCommitMs: commit, forcar: FORCAR });
        const quando = versao ? ` [no ar: v${versao.version} de ${hora(versao.updated_at)}; main: ${hora(commit)}]` : "";
        if (acao === "manter") { conta.emDia++; console.log(`  ${nome}: em dia${quando}`); continue; }
        if (acao === "pendente") { conta.pendentes++; console.log(`  ${nome}: PENDENTE, ${motivo}${quando}`); continue; }
        if (acao === "pular") { conta.puladas++; console.log(`  ${nome}: ${motivo}`); continue; }
        if (acao === "erro") throw new Error(motivo);
        if (SIMULAR) { conta.publicadas++; console.log(`  ${nome}: PUBLICARIA (${motivo}; ${arquivos.length} arquivos)${quando}`); continue; }
        const nova = await publicar(sistema.projeto, clone.raiz, nome, arquivos, versao);
        conta.publicadas++;
        console.log(`  ${nome}: publicada v${nova} (${motivo}; ${arquivos.length} arquivos)${quando}`);
      } catch (e) {
        conta.falhas++;
        console.log(`  ${nome}: ERRO -- ${e.message}`);
      }
    }
  } catch (e) {
    conta.falhas++;
    console.log(`  ERRO no sistema -- ${e.message}`);
  } finally {
    clone?.limpar();
  }
}

if (FUNCAO && !achouFuncao) {
  console.log(`\nA function "${FUNCAO}" não existe em nenhum dos sistemas escolhidos.`);
  conta.falhas++;
}
console.log(`\n${SIMULAR ? "Simulação: publicaria" : "Publicadas"} ${conta.publicadas} · em dia ${conta.emDia} · pendentes (à mão) ${conta.pendentes} · fora (não existem no ar) ${conta.puladas} · falhas ${conta.falhas}`);
// Falha não pode terminar verde: "publicou" com check verde é a mesma mentira
// que o functions.yml existe para acabar.
process.exit(conta.falhas ? 1 : 0);
