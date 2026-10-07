// Carga manual, por janela, exclusivamente das fontes comerciais. Não escreve
// no ERP, não lê contas a pagar/receber e não apaga O.S. ou negócios.
import { mubiConfigurado, mubiGetTudo } from './lib/mubi.js';
import { executarCargaComercial } from './lib/carga-comercial.mjs';

const TOKEN = process.env.PAINEL_TOKEN;
const FN = process.env.PAINEL_CACHE_URL || 'https://heveemylixartyijxewh.supabase.co/functions/v1/painel-cache';

async function cache(body) {
  const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-token': TOKEN }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`painel-cache respondeu HTTP ${r.status}.`);
  return r.json();
}

async function main() {
  if (!TOKEN || !mubiConfigurado()) throw new Error('Configuração ausente: PAINEL_TOKEN e MUBI_* são obrigatórios.');
  await executarCargaComercial({
    desde: process.env.COMERCIAL_DESDE || '', ate: process.env.COMERCIAL_ATE || '', recurso: process.env.COMERCIAL_RECURSO || 'ambos',
  }, { getTudo: mubiGetTudo, cache, log: console.log });
  console.log('Carga comercial concluída nas janelas informadas.');
}
main().catch((e) => { console.error(e?.message || 'Falha na carga comercial.'); process.exitCode = 1; });
