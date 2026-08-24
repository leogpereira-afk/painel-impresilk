/* TODA AÇÃO NOVA PEDE CRACHÁ?
 *
 * As Edge Functions são a porta de dados do painel, e nenhuma delas passa por
 * lint: `npm run lint` é `eslint src`, e `eslint supabase/functions` sequer
 * roda (a config não cobre TypeScript de Deno). Ou seja: os nove porteiros da
 * casa não tinham verificador NENHUM.
 *
 * Este script não tenta ser um compilador. Ele confere a única regra que, se
 * falhar, abre o painel inteiro: cada `case "acao"` do switch principal chama
 * `exigirSessao`/`exigirDirecao` (ou está declarado aqui como público, com o
 * motivo escrito). Foi assim que uma action nova quase nasceu aberta nesta
 * própria rodada.
 *
 *   node scripts/conferir-portas.mjs
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";

// PORTAS_DIR existe para o teste de controle: dá para apontar o verificador
// para uma pasta de mentira e provar que ele REPROVA o que deve reprovar.
const DIR = process.env.PORTAS_DIR || "supabase/functions";

/* AÇÕES PÚBLICAS DE PROPÓSITO -- cada uma com o porquê. Lista curta e
   explícita: sem isso o verificador vira ruído e alguém o desliga. */
const PUBLICAS = {
  "painel-config:ping": "só responde que a function está viva; não lê nada",
  "painel-auth:entrar": "é o próprio login (quem entra ainda não tem crachá)",
  "painel-auth:trocarSenha": "troca com a senha antiga na mão, sem sessão",
  "painel-auth:esqueci": "pedido de recuperação, antes de existir sessão",
  "painel-backup:auto": "chamado pelo pg_cron com x-token, não com crachá",
  "painel-acesso:entrar": "login dos outros sistemas",
  // Aposentadas: respondem 410 ("mudou de casa") e não tocam em dado nenhum.
  "painel-auth:listarContas": "aposentada; responde 410 e não lê nada",
  "painel-auth:salvarConta": "aposentada; responde 410 e não grava nada",
  "painel-auth:removerConta": "aposentada; responde 410 e não apaga nada",
};

/* A GUARDA NÃO É SEMPRE NO MESMO LUGAR. O painel-dados confere DENTRO de cada
   `case` (exigirSessao); o painel-config e o painel-gestao resolvem a sessão
   ANTES do switch e cada ramo decide com `podeModulo`/`ehDirecao`. Um
   verificador que só conhecesse o primeiro jeito acusaria 51 ações corretas --
   e verificador que grita sem motivo é desligado no dia seguinte. Vale
   qualquer prova de autorização DENTRO do ramo; o que não pode é o ramo
   responder sem olhar para ninguém. */
/* DUAS FORMAS LEGÍTIMAS DE FECHAR A PORTA, e o verificador conhece as duas:
   1. no RAMO -- `exigirSessao(req, "modulo")` no começo do `case`
      (painel-dados, painel-ativos);
   2. NO TOPO -- a function recusa sem crachá ANTES do switch e cada ramo
      decide o papel com um ajudante (painel-config, painel-gestao,
      painel-auth: `if (!sessao) return ... 401`).
   Um verificador que só conhecesse a primeira acusaria 51 ações corretas --
   e verificador que grita à toa é desligado no dia seguinte. O que ele
   PRECISA pegar é o buraco de verdade: ramo que responde sem que ninguém,
   nem no topo nem nele, tenha olhado o crachá. */
const GUARDA_NO_RAMO = /exigirSessao|exigirDirecao|exigirToken|exigirMaster|x-token|podeModulo|pode[A-Z]\w*\(|so[A-Z]\w*\(|ehDirecao|ehDiretoria|ehGestor|sessao|perms|master|TOKEN/;
const GUARDA_NO_TOPO = /semSessao:\s*true\s*\}\s*,\s*401|Entre no sistema.*401|exigirSessao/;

let faltando = 0, conferidas = 0;
for (const fn of readdirSync(DIR).filter((f) => !f.startsWith("_"))) {
  const caminho = `${DIR}/${fn}/index.ts`;
  if (!existsSync(caminho)) continue;
  const src = readFileSync(caminho, "utf8");
  /* A function recusa sem crachá antes do switch? Só vale o que vem ANTES:
     um 401 escrito depois, dentro de um ramo, não protege os outros. */
  const antesDoSwitch = src.slice(0, src.search(/switch\s*\(/) >>> 0 || src.length);
  const fechadaNoTopo = GUARDA_NO_TOPO.test(antesDoSwitch);

  // Cada bloco vai do seu `case "x"` até o próximo `case` (ou o fim).
  const casos = [...src.matchAll(/case\s+"([^"]+)"\s*:/g)];
  for (let i = 0; i < casos.length; i++) {
    const nome = casos[i][1];
    const ini = casos[i].index;
    const fim = i + 1 < casos.length ? casos[i + 1].index : src.length;
    const bloco = src.slice(ini, fim);
    const chave = `${fn}:${nome}`;
    conferidas++;
    if (PUBLICAS[chave]) continue;
    if (GUARDA_NO_RAMO.test(bloco)) continue;
    if (fechadaNoTopo) continue;
    console.log(`X ${chave} — responde sem que ninguém confira o crachá (nem no topo da function, nem no ramo)`);
    faltando++;
  }
}

console.log(
  faltando
    ? `\n${faltando} ação(ões) sem porteiro. Ou chame exigirSessao, ou declare em PUBLICAS com o motivo.`
    : `\n${conferidas} ações conferidas: todas pedem crachá (ou estão declaradas públicas com motivo).`,
);
process.exit(faltando ? 1 : 0);
