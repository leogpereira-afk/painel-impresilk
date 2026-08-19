#!/usr/bin/env node
/**
 * CONFERE SE OS SISTEMAS ESTAO CADASTRADOS NOS MESMOS LUGARES.
 *
 * POR QUE ISTO EXISTE
 * Um sistema da casa nao mora num arquivo so. Ele precisa estar no registro do
 * Painel (lib/sistemas.js), na lista fechada do servidor (painel-acesso) e na
 * lista fechada da porta de login (equipe-auth) -- com OS MESMOS PAPEIS. Nada
 * disso da erro quando falta: o sistema simplesmente aparece sem nome, ou some
 * da tela, ou recusa a primeira conta com "Sistema desconhecido", ou aceita um
 * papel que nao funciona em lugar nenhum. Sempre em silencio.
 *
 * Foi assim que a lista de modulos do Painel ficou em tres arquivos com dois
 * atrasados, e a de papeis com `compras` guardando os papeis do app antigo.
 *
 * ESTE SCRIPT NAO CONSERTA: ele acusa. Rodar depois de acrescentar um sistema,
 * e antes de anunciar que ele esta no ar.
 *
 *   node painel/scripts/conferir-sistemas.mjs
 *
 * Sai com 1 quando algo diverge, para poder virar passo de CI.
 *
 * O QUE ELE NAO ALCANCA (e por isso esta escrito no fim da saida):
 *  - a CHECK constraint de `equipe_contas.sistema`, que mora no banco;
 *  - o secret SISTEMAS_BACKUP, que so o servidor le.
 * Os dois estao na lista de passos do fim de lib/sistemas.js.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const PAINEL = resolve(AQUI, "..");
const HOME = process.env.HOME;

const ARQUIVOS = {
  registro: resolve(PAINEL, "src/lib/sistemas.js"),
  servidor: resolve(PAINEL, "supabase/functions/painel-acesso/index.ts"),
  modulosTela: resolve(PAINEL, "src/lib/modulos.js"),
  modulosServidor: resolve(PAINEL, "supabase/functions/painel-auth/index.ts"),
  porta: resolve(HOME, "Projetos/vida-leo/supabase/functions/equipe-auth/index.ts"),
};

let problemas = 0;
const acusar = (msg) => {
  console.log(`  ✗ ${msg}`);
  problemas++;
};
const ok = (msg) => console.log(`  · ${msg}`);

function ler(rotulo, caminho) {
  try {
    return readFileSync(caminho, "utf8");
  } catch {
    /* NAO PULAR EM SILENCIO. Um arquivo que sumiu de lugar deixaria o script
       verde sem ter conferido nada -- exatamente o defeito que ele caca. */
    console.log(`\nNAO ACHEI ${rotulo}: ${caminho}`);
    console.log("Se o arquivo mudou de lugar, corrija ARQUIVOS neste script.");
    process.exit(2);
  }
}

/** Extrai `const NOME = [...]` como lista de textos. */
function listaDeTextos(fonte, nome, rotulo) {
  const m = fonte.match(new RegExp(`const\\s+${nome}\\s*=\\s*\\[([^\\]]*)\\]`));
  if (!m) {
    console.log(`\nNAO ACHEI a lista ${nome} em ${rotulo}.`);
    process.exit(2);
  }
  return [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
}

/** Extrai `new Set([...])` de uma const. */
function conjunto(fonte, nome, rotulo) {
  const m = fonte.match(new RegExp(`const\\s+${nome}\\s*=\\s*new Set\\(\\[([^\\]]*)\\]`));
  if (!m) {
    console.log(`\nNAO ACHEI o conjunto ${nome} em ${rotulo}.`);
    process.exit(2);
  }
  return new Set([...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]));
}

/**
 * Extrai um objeto literal de TypeScript contando chaves, e o avalia.
 * Contar chaves (e nao casar com regex) porque o objeto tem comentarios e
 * objetos aninhados dentro -- regex leria o primeiro `}` como o fim.
 */
function objetoLiteral(fonte, nome, rotulo) {
  /* O `{` que interessa e o do VALOR, depois do `=`. Procurar o primeiro `{`
     depois do nome pegaria o da ANOTACAO DE TIPO -- em
     `const PAPEIS: Record<Sistema, { todos: string[] }> = {` a chave do tipo vem
     antes, e foi assim que a primeira versao deste script leu o objeto errado e
     morreu com "Unexpected token ]". */
  const m = fonte.match(new RegExp(`const\\s+${nome}\\b[^=]*=`));
  if (!m) {
    console.log(`\nNAO ACHEI o objeto ${nome} em ${rotulo}.`);
    process.exit(2);
  }
  const i = fonte.indexOf("{", m.index + m[0].length);
  if (i < 0) {
    console.log(`\n${nome} em ${rotulo} nao e um objeto literal.`);
    process.exit(2);
  }
  let nivel = 0;
  let fim = -1;
  let emTexto = null;
  let emLinha = false;
  let emBloco = false;
  for (let j = i; j < fonte.length; j++) {
    const c = fonte[j];
    const prox = fonte[j + 1];
    if (emLinha) { if (c === "\n") emLinha = false; continue; }
    if (emBloco) { if (c === "*" && prox === "/") { emBloco = false; j++; } continue; }
    if (emTexto) { if (c === "\\") j++; else if (c === emTexto) emTexto = null; continue; }
    if (c === "/" && prox === "/") { emLinha = true; j++; continue; }
    if (c === "/" && prox === "*") { emBloco = true; j++; continue; }
    if (c === '"' || c === "'" || c === "`") { emTexto = c; continue; }
    if (c === "{") nivel++;
    else if (c === "}") { nivel--; if (nivel === 0) { fim = j; break; } }
  }
  if (fim < 0) {
    console.log(`\nNAO CONSEGUI LER o objeto ${nome} em ${rotulo} (chaves desemparelhadas).`);
    process.exit(2);
  }
  try {
    return new Function(`return (${fonte.slice(i, fim + 1)})`)();
  } catch (e) {
    console.log(`\nNAO CONSEGUI AVALIAR ${nome} em ${rotulo}: ${e.message}`);
    process.exit(2);
  }
}

const mesmos = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---------------------------------------------------------------- o registro
const { SISTEMAS, doSistema } = await import(`file://${ARQUIVOS.registro}`);
const ids = SISTEMAS.map((s) => s.id);
console.log(`\nREGISTRO (src/lib/sistemas.js): ${ids.length} sistemas — ${ids.join(", ")}\n`);

// ------------------------------------------------- 1. a lista fechada do servidor
const servidor = ler("painel-acesso", ARQUIVOS.servidor);
console.log("1. Lista fechada do servidor (painel-acesso)");
{
  const doServidor = listaDeTextos(servidor, "SISTEMAS", "painel-acesso");
  for (const id of ids) {
    if (!doServidor.includes(id)) {
      acusar(`"${id}" esta no registro e NAO na lista do servidor — criar conta nele devolve "Sistema desconhecido"`);
    }
  }
  for (const id of doServidor) {
    if (!ids.includes(id)) acusar(`"${id}" esta no servidor e NAO no registro — aparece na tela com o id cru no lugar do nome`);
  }
  if (!problemas) ok(`os ${doServidor.length} batem`);

  const soLeituraServidor = conjunto(servidor, "SO_LEITURA", "painel-acesso");
  const soLeituraRegistro = new Set(SISTEMAS.filter((s) => s.soLeitura).map((s) => s.id));
  const antes = problemas;
  for (const id of soLeituraRegistro) {
    if (!soLeituraServidor.has(id)) acusar(`"${id}" e so-leitura na TELA e administravel no SERVIDOR — a tela esconde o botao e a porta aceita`);
  }
  for (const id of soLeituraServidor) {
    if (!soLeituraRegistro.has(id)) acusar(`"${id}" e so-leitura no SERVIDOR e administravel na TELA — o botao aparece e a acao falha`);
  }
  if (problemas === antes) ok(`so-leitura combina: ${[...soLeituraServidor].join(", ") || "(nenhum)"}`);
}

// ------------------------------------------------- 2. a porta de login (equipe-auth)
const porta = ler("equipe-auth", ARQUIVOS.porta);
console.log("\n2. Porta de login (equipe-auth)");
{
  const daPorta = listaDeTextos(porta, "SISTEMAS", "equipe-auth");
  const antes = problemas;
  for (const id of ids) {
    if (!daPorta.includes(id)) acusar(`"${id}" nao esta na lista da equipe-auth — a primeira conta criada devolve erro sem explicacao`);
  }
  for (const id of daPorta) {
    if (!ids.includes(id)) acusar(`"${id}" existe na equipe-auth e nao no registro do Painel — gente com acesso, invisivel na tela`);
  }
  if (problemas === antes) ok(`os ${daPorta.length} batem`);
}

// ------------------------------------------------- 3. os papeis, um a um
console.log("\n3. Papeis (o registro diz ser copia FIEL da equipe-auth)");
{
  const PAPEIS = objetoLiteral(porta, "PAPEIS", "equipe-auth");
  const antes = problemas;
  for (const s of SISTEMAS) {
    const naPorta = PAPEIS[s.id]?.todos;
    if (!naPorta) {
      if (s.papeis.length) acusar(`"${s.id}": o registro tem papeis e a equipe-auth nao conhece o sistema`);
      continue;
    }
    /* Sistema de fachada na equipe-auth: ele nao usa papel de verdade, e o
       papel unico de la existe so para caber na tabela. Aqui a conferencia e
       outra -- e continua sendo conferencia: a fachada tem de ser EXATAMENTE o
       que o registro declara, e ninguem pode administrar por ela. */
    if (s.papelDeFachada) {
      if (!mesmos(naPorta, [s.papelDeFachada])) {
        acusar(`"${s.id}": a fachada mudou\n      registro declara: ${JSON.stringify([s.papelDeFachada])}\n      equipe-auth tem : ${JSON.stringify(naPorta)}`);
      } else if ((PAPEIS[s.id].admin || []).length) {
        acusar(`"${s.id}": e sistema de fachada e a equipe-auth deixou alguem administrar por ela`);
      }
      if (s.papeis.length) acusar(`"${s.id}": tem fachada e tambem papeis proprios — decidir qual dos dois vale`);
      continue;
    }
    if (!mesmos(s.papeis, naPorta)) {
      acusar(`"${s.id}": papeis diferentes\n      registro   : ${JSON.stringify(s.papeis)}\n      equipe-auth: ${JSON.stringify(naPorta)}`);
      continue;
    }
    /* A LISTA DE PAPEIS DE COMANDO tem de bater com a da porta. A tela usa
       `papeisAdmin` para decidir se "Criar a conta la" pode obedecer ao papel
       marcado ou tem de cair no de operacao -- lista errada aqui volta a criar
       admin sem ninguem pedir, que foi o defeito de 17/08/2026. */
    const adminPorta = PAPEIS[s.id].admin || [];
    if (!mesmos(s.papeisAdmin || [], adminPorta)) {
      acusar(`"${s.id}": papeis de comando diferentes\n      registro   : ${JSON.stringify(s.papeisAdmin || [])}\n      equipe-auth: ${JSON.stringify(adminPorta)}`);
    }
    /* MARCAR A CAIXA NAO PODE CONCEDER O PAPEL MAIS PODEROSO. O papel inicial
       tem de existir na lista e nao pode ser um dos que administram. */
    if (s.papelInicial) {
      if (!naPorta.includes(s.papelInicial)) {
        acusar(`"${s.id}": papel inicial "${s.papelInicial}" nao existe na lista — cadastrar alguem grava um papel que nao funciona`);
      } else if ((PAPEIS[s.id].admin || []).includes(s.papelInicial)) {
        acusar(`"${s.id}": o papel inicial "${s.papelInicial}" e de ADMIN — marcar a caixa daria o poder maximo`);
      }
    } else if (naPorta.length && !s.soLeitura) {
      acusar(`"${s.id}": tem papeis e nenhum inicial — a caixa marca e nao concede nada`);
    }
  }
  if (problemas === antes) ok(`os papeis dos ${ids.length} conferem, e nenhum papel inicial e de admin`);
}

// ------------------------------------------------- 4. a entrada unica
console.log("\n4. Entrada unica (crachas plantados e atalhos)");
{
  const antes = problemas;
  for (const s of SISTEMAS) {
    const e = s.entradaUnica;
    if (s.id === "painel") {
      if (e?.endereco) acusar(`"painel" ganhou endereco — viraria atalho para si mesmo em "Meus sistemas"`);
      continue;
    }
    if (!e?.endereco) {
      acusar(`"${s.id}" nao tem endereco na entrada unica — nao aparece nos atalhos de quem entra no Painel`);
      continue;
    }
    if (!/^https:\/\/leogpereira-afk\.github\.io\//.test(e.endereco)) {
      /* A entrada unica so vale enquanto todos moram no MESMO endereco:
         localStorage e por origem. Sistema em outro dominio nao recebe cracha
         plantado, e a entrada unica para de valer para ele EM SILENCIO. */
      acusar(`"${s.id}" aponta para fora de leogpereira-afk.github.io — cracha plantado nao chega la, e ninguem avisa`);
    }
  }
  const semChave = SISTEMAS.filter((s) => s.entradaUnica?.endereco && !s.entradaUnica.chave).map((s) => s.id);
  if (problemas === antes) {
    ok(`enderecos ok; sem cracha plantado (entra digitando a senha la): ${semChave.join(", ") || "(nenhum)"}`);
  }
}

// ------------------------------------------------- 4b. os MODULOS do painel
/* A MESMA DOENCA DOS SISTEMAS, num nivel abaixo.
 *
 * A lista de modulos do painel tambem mora em TRES arquivos: a tela
 * (src/lib/modulos.js), a porta do painel (painel-auth) e a porta de login
 * (equipe-auth, no outro repo). O filtro do equipe-auth descarta o que nao
 * conhece, e a tela mostra a caixa marcada sem ter concedido nada.
 *
 * Ja aconteceu DUAS vezes: com cinco modulos de uma vez (gestao, glossario,
 * compromissos, manutencoes, patrimonio) e com `permutas` em 19/08/2026 --
 * essa custou dois dias, porque o defeito parecia estar na tela de Permutas.
 *
 * O `descartados` da resposta avisa DEPOIS do clique. Isto aqui pega ANTES do
 * commit, que e onde o erro nasce.
 */
console.log("\n4b. Os modulos do painel nas tres listas");
{
  const lista = (txt, nome) => {
    const m = txt.match(new RegExp(nome + "\\s*(?::[^=]*)?=\\s*\\[([\\s\\S]*?)\\]"));
    if (!m) return null;
    return [...m[1].matchAll(/["']([a-z0-9-]+)["']/g)].map((x) => x[1]);
  };
  const daTela = lista(ler("modulos.js", ARQUIVOS.modulosTela), "MODULOS");
  const daPorta = lista(ler("painel-auth", ARQUIVOS.modulosServidor), "MODULOS");
  const doLogin = lista(porta, "MODULOS_PAINEL");

  if (!daTela || !daPorta || !doLogin) {
    acusar("nao consegui ler alguma das tres listas de modulos (o formato mudou?)");
  } else {
    const todos = [...new Set([...daTela, ...daPorta, ...doLogin])].sort();
    let divergiu = 0;
    for (const id of todos) {
      const onde = [
        daTela.includes(id) ? null : "tela",
        daPorta.includes(id) ? null : "painel-auth",
        doLogin.includes(id) ? null : "equipe-auth",
      ].filter(Boolean);
      if (onde.length) {
        acusar(`modulo "${id}" falta em: ${onde.join(", ")} — marcar a caixa nao vai conceder nada`);
        divergiu++;
      }
    }
    if (!divergiu) ok(`os ${todos.length} modulos estao nas tres listas`);
  }
}

// ------------------------------------------------- 5. o que este script nao alcanca
console.log("\n5. Fora do alcance deste script — conferir a mao ao criar sistema");
console.log("   · CHECK constraint de equipe_contas.sistema (no banco): sem ela, a primeira conta da 500 mudo");
console.log("   · secret SISTEMAS_BACKUP do Painel: sem ele, o backup diario nao cobre o sistema novo");
console.log("   · a lista completa de passos esta no fim de src/lib/sistemas.js");

console.log(
  problemas
    ? `\nREPROVADO: ${problemas} divergencia(s). Cada uma falha EM SILENCIO no ar.\n`
    : "\nOK: os sistemas estao cadastrados nos mesmos lugares, com os mesmos papeis.\n",
);
process.exit(problemas ? 1 : 0);
