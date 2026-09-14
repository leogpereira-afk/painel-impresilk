// ============================================================================
// Importação horária das O.S do Mubisys para o PCP / Instalação.
//
// POR QUE ISTO MORA NO REPOSITÓRIO DO PAINEL, e não no do PCP (14/09/2026):
//
// 1. A busca precisa sair da Edge Function. Uma página do Mubisys já levou
//    206 s em horário comercial e a Edge Function do Supabase morre aos 150 s.
//    A importação do PCP nunca teve folga — funcionava só enquanto o ERP
//    respondia em 15-20 s. No dia em que ele ficou lento, ela morreu CALADA
//    (morte vinda de fora não executa o catch) e a fábrica passou horas sem
//    receber O.S nova. É a mesma razão que trouxe a carga do Painel para cá.
//
// 2. A credencial do ERP fica em UM lugar só. `MUBI_PUBLIC_KEY` e `MUBI_TOKEN`
//    já são segredos deste repositório. Copiá-los para o repo do PCP dobraria
//    o raio de exposição e o trabalho de girar a chave.
//
// 3. O cliente que aguenta o ERP também já está aqui: `mubiGetTudo` pagina e
//    aplica as quatro regras do Mubisys (404 não é erro; vazio só quando dois
//    404 concordam; 401/403 são fatais; 5xx e timeout nunca viram vazio), com
//    a trava de regressão em scripts/conferir-404.mjs. Reescrever isso no PCP
//    seria uma segunda cópia para envelhecer sozinha.
//
// Este script faz só a parte LENTA. A gravação (deduplicar, respeitar lápide,
// preservar trabalho humano) continua no PCP, na ação `importarLote` do
// pcp-mubisys — a mesma função de banco que a importação antiga usa.
//
// Segredo que falta cadastrar neste repositório:
//   PCP_CRON_TOKEN   (o mesmo que o robô horário do PCP já usa)
// ============================================================================

import { mubiGetTudo, mubiConfigurado } from "../netlify/functions/lib/mubi.js";

const PCP_TOKEN = process.env.PCP_CRON_TOKEN || "";
const PCP_FN =
  process.env.PCP_FN_URL ||
  "https://heveemylixartyijxewh.supabase.co/functions/v1/pcp-mubisys";

// O PCP trabalha o que está EM PRODUÇÃO. O filtro é por data de CADASTRO, que
// nunca está no futuro — a versão antiga pedia 180 dias à frente, peso puro.
const STATUS = process.env.MUBI_STATUS || "PRODUCAO";
const DIAS_ATRAS = Number(process.env.MUBI_DIAS_ATRAS) || 180;

const ymd = (d) => d.toISOString().slice(0, 10);

function janela() {
  const hoje = new Date();
  const ini = new Date(hoje);
  ini.setDate(ini.getDate() - DIAS_ATRAS);
  // `datafinal` é AMANHÃ: o ERP corta na meia-noite, então pedir "hoje" deixa
  // de fora a O.S cadastrada hoje com hora. Já custou sete O.S ao Painel.
  const fim = new Date(hoje);
  fim.setDate(fim.getDate() + 1);
  return { status: STATUS, filtrodata: "CADASTRO", datainicial: ymd(ini), datafinal: ymd(fim) };
}

async function entregarAoPcp(os) {
  const r = await fetch(PCP_FN, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-token": PCP_TOKEN },
    // `vazioEsperado` só quando o ERP realmente disse "não há nada" — o
    // mubiGetTudo já aplicou a regra dos dois 404 antes de devolver vazio.
    body: JSON.stringify({ action: "importarLote", os, vazioEsperado: os.length === 0 }),
  });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`o PCP recusou o lote (HTTP ${r.status}): ${corpo?.error ?? ""}`);
  return corpo;
}

const faltando = [];
if (!mubiConfigurado()) faltando.push("MUBI_PUBLIC_KEY / MUBI_TOKEN");
if (!PCP_TOKEN) faltando.push("PCP_CRON_TOKEN");
if (faltando.length) {
  console.error(`Faltam segredos neste repositório: ${faltando.join(", ")}.`);
  console.error("Settings → Secrets and variables → Actions → New repository secret.");
  process.exit(1);
}

try {
  const j = janela();
  console.log(`janela: ${j.datainicial} → ${j.datafinal} (status ${STATUS})`);
  const os = await mubiGetTudo("ordem-servico", j);
  console.log(`o ERP devolveu ${os.length} O.S`);

  const r = await entregarAoPcp(os);
  console.log(`\nPronto: ${r.novas} nova(s) de ${r.total} (${r.jaExistiam} já existiam).`);
  if (r.semNumero) console.log(`${r.semNumero} O.S sem número ignoradas (não dá para deduplicar).`);
} catch (e) {
  // Vermelho na lista de execuções. Foi o silêncio que fez a parada de hoje
  // durar horas sem ninguém saber.
  console.error(`\nFALHOU: ${e.message}`);
  process.exit(1);
}
