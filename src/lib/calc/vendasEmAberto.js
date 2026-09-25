/* VENDAS EM ABERTO -- a aba de Contas Atrasadas pedida pelo Léo em 23/09/2026:
 * "um vendas em aberto, são pedidos que falta ser quitadas, com seus saldos e o
 * saldo total em atraso" e "é pra considerar os serviços normais, todos que
 * estiverem rodando na empresa, só não vai entrar o que estiver quitado".
 *
 * A RÉGUA NÃO É NOVA. Quem diz se uma O.S. está paga, em aberto, paga em parte,
 * sem título ou quitada em permuta é `financeiroDasLinhas` (financeiroOS.js), a
 * mesma de Campanhas. Régua copiada sai de sincronia calada; aqui só se acrescenta
 * o que a aba pede e ela não tinha:
 *
 * - O ATRASO POR PARCELA. A régua de Campanhas marca a O.S. inteira como
 *   vencida quando uma parcela venceu. Aqui atraso é a soma das PARCELAS vencidas
 *   (vencimento antes de hoje e depois do corte da tela), para fechar com o
 *   "Total atrasado" da aba Títulos: é o mesmo dinheiro, título a título.
 * - O QUE FICA DE FORA, CONTADO. Quitada, permuta, diferença de baixa, O.S. que
 *   a conta não pode afirmar (anterior ao mapa de pagamentos ou fora da
 *   consulta): nenhuma some calada; cada uma vai para um balde com nome.
 * - A EMPRESA de cada venda (CNPJ, ou o nome quando não há), para o seletor.
 *
 * `ordens`  -- dados.ordens (O.S. do cache, 2025 em diante, sem as canceladas)
 * `resposta` -- o que a porta vendasEmAberto devolveu
 * `hoje`, `corte` -- AAAA-MM-DD (hoje no fuso da empresa; corte da tela)
 */
import { financeiroDasLinhas, TOLERANCIA } from "./financeiroOS.js";
import { chaveCliente } from "./cobrancas.js";

const CENT = (n) => Math.round((Number(n) || 0) * 100) / 100;

/* Diferença pequena sem título é uma pendência de conferência, não prova
   de desconto nem autorização de baixa. Fica separada do saldo de cobrança
   até que o ERP permita confirmar o abatimento ou a dívida. */
const LIMIAR_CONFERENCIA = 0.02;

// A porta manda os pagos SOMADOS por O.S.; a régua pede a forma de lista.
export function dadosDaPorta(resposta) {
  const r = resposta || {};
  const pagos = Object.entries(r.pagosPorOS || {}).map(([os, a]) => ({
    // Id sintético: nunca coincide com o de um título aberto (o estorno já foi
    // aplicado no servidor, antes de somar).
    id: `soma:${os}`,
    os,
    pago: Number(Array.isArray(a) ? a[0] : 0) || 0,
    compartilhado: !!(Array.isArray(a) && a[1]),
    incerto: !!(Array.isArray(a) && a[2]),
  }));
  return {
    abertos: Array.isArray(r.abertos) ? r.abertos : [],
    pagos,
    permutaDaOS: r.permutaDaOS && typeof r.permutaDaOS === "object" ? r.permutaDaOS : {},
    temPagos: !!r.temPagos,
    desdeDados: r.desdeDados || "",
    consultadas: Array.isArray(r.consultadas) ? r.consultadas : undefined,
  };
}

// A empresa: CNPJ quando há (duas razões sociais da mesma empresa viram uma),
// senão o nome sem acento e sem espaço repetido.
export function chaveEmpresa(o) {
  const cnpj = String(o?.cnpj || "").replace(/\D/g, "");
  return cnpj ? `cnpj:${cnpj}` : `nome:${chaveCliente(o?.cliente)}`;
}

const vazio = () => ({ n: 0, valor: 0 });

export function vendasEmAberto(ordens, resposta, { hoje, corte = "" } = {}) {
  if (!resposta) return null;
  const dados = dadosDaPorta(resposta);

  /* NÚMERO REPETIDO NO ERP (em 23/09 eram 20050 e 21855, dois ids cada). Os
     títulos citam o NÚMERO, então as duas O.S. dividiriam as mesmas parcelas e
     a lista contaria o mesmo dinheiro duas vezes. Viram uma venda só, com o
     valor somado e o aviso na linha. */
  const porNum = new Map();
  const idsLidos = new Set();
  const fora = { quitadas: vazio(), permuta: vazio(), conferencia: vazio(), retrabalho: vazio(), semTipo: vazio(), semDado: vazio(), naoConsultadas: vazio(), valorZero: vazio() };
  const somar = (balde, valor) => { balde.n += 1; balde.valor = CENT(balde.valor + (Number(valor) || 0)); };
  for (const o of ordens || []) {
    const numero = String(o?.numero || "").trim();
    if (!numero) continue;
    const id = String(o?.id ?? "");
    if (id && idsLidos.has(id)) continue;
    if (id) idsLidos.add(id);
    // Tipo do pedido no ERP, não a ocorrência operacional na venda original.
    const tipo = String(o?.tipo || "").trim().toLowerCase();
    if (tipo === "retrabalho") { somar(fora.retrabalho, o.valor); continue; }
    if (!tipo) { somar(fora.semTipo, o.valor); continue; }
    const ja = porNum.get(numero);
    if (!ja) {
      porNum.set(numero, { ...o, numero, valor: Number(o?.valor) || 0, desconto: Number(o?.desconto) || 0, ids: [String(o?.id ?? "")] });
    } else {
      ja.valor = CENT(ja.valor + (Number(o?.valor) || 0));
      ja.desconto = CENT(ja.desconto + (Number(o?.desconto) || 0));
      ja.sinalPago = CENT(Math.max(0, Number(ja.sinalPago) || 0) + Math.max(0, Number(o?.sinalPago) || 0));
      ja.ids.push(String(o?.id ?? ""));
      if (String(o?.data || "") && String(o.data) < String(ja.data || "9999")) ja.data = o.data;
    }
  }
  const linhasBase = [...porNum.values()];
  /* A PERMUTA É REGISTRADA PELO ID. Com número repetido, qualquer um dos ids
     em permuta leva a venda para a permuta (a régua lê pelo primeiro id). */
  const permutaDaOS = { ...dados.permutaDaOS };
  for (const l of linhasBase) {
    const achou = l.ids.find((id) => permutaDaOS[id]);
    if (achou && !permutaDaOS[l.ids[0]]) permutaDaOS[l.ids[0]] = permutaDaOS[achou];
  }
  const fin = financeiroDasLinhas(
    linhasBase.map((l) => ({ id: l.ids[0], numero: l.numero, valor: l.valor, data: l.data, sinalPago: l.sinalPago })),
    { ...dados, permutaDaOS },
    hoje
  );

  // As parcelas abertas de cada número, já repartidas pelo servidor.
  const parcelas = new Map();
  for (const t of dados.abertos) {
    const n = String(t?.os ?? "");
    if (!parcelas.has(n)) parcelas.set(n, []);
    parcelas.get(n).push(t);
  }


  const linhas = [];
  const conferir = [];
  for (const l of linhasBase) {
    const f = fin.porNumero[l.numero];
    if (!f) continue;
    if (f.tipo === "naoConsultada") { somar(fora.naoConsultadas, l.valor); continue; }
    if (f.tipo === "permuta") { somar(fora.permuta, l.valor); continue; }
    if (f.tipo === "semDado") { somar(fora.semDado, l.valor); continue; }
    if (f.tipo === "pago") { somar(fora.quitadas, l.valor); continue; }
    if (f.aberto <= 0 && l.valor <= TOLERANCIA) { somar(fora.valorZero, l.valor); continue; }
    if (f.tipo === "pagoParcial" && f.aberto <= 0 && l.valor > 0 && f.resto <= l.valor * LIMIAR_CONFERENCIA) {
      somar(fora.conferencia, f.resto);
      conferir.push({ numero: l.numero, cliente: l.cliente, valor: l.valor, recebido: f.pago, diferenca: f.resto });
      continue;
    }
    if (!(f.aReceber > TOLERANCIA)) { somar(fora.quitadas, l.valor); continue; }

    // O atraso é por PARCELA, não pela O.S. inteira.
    let atraso = 0, aVencer = 0, antigo = 0, vencMaisAntigo = "";
    const ps = parcelas.get(l.numero) || [];
    for (const t of ps) {
      const v = Number(t.valor) || 0;
      const venc = String(t.vencimento || "").slice(0, 10);
      if (venc && venc < hoje) {
        if (corte && venc < corte) antigo = CENT(antigo + v);
        else {
          atraso = CENT(atraso + v);
          if (!vencMaisAntigo || venc < vencMaisAntigo) vencMaisAntigo = venc;
        }
      } else {
        aVencer = CENT(aVencer + v);
      }
    }
    const diasAtraso = vencMaisAntigo
      ? Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${vencMaisAntigo}T12:00:00Z`)) / 86400000)
      : 0;
    const semTitulo = f.resto || 0;
    const estado = atraso > 0 ? "atraso" : aVencer > 0 ? "aVencer" : f.pago > 0 ? "parcialSemTitulo" : "semTitulo";

    linhas.push({
      id: l.ids[0],
      ids: l.ids,
      numeroRepetido: l.ids.length > 1,
      numero: l.numero,
      cliente: String(l.cliente || "Cliente"),
      cnpj: String(l.cnpj || ""),
      empresa: chaveEmpresa(l),
      vendedor: String(l.vendedor || ""),
      data: String(l.data || "").slice(0, 10),
      valor: l.valor,
      descontoVenda: l.desconto,
      recebido: f.pago,
      sinalPago: f.sinalPago,
      sinalComplementar: f.sinalComplementar,
      pagoTitulos: f.pagoTitulos,
      saldo: f.aReceber,
      atraso,
      aVencer,
      antigo,
      semTitulo,
      diasAtraso,
      estado,
      parcelas: ps.length,
      compartilhado: !!f.compartilhado,
      incerto: !!f.incerto,
      /* TÍTULO MAIOR QUE A VENDA: o saldo segue o título (é o que o ERP cobra),
         mas a linha avisa. Medido em 23/09/2026: 13 vendas, R$ 84 mil (a 22906
         foi paga duas vezes e ainda tem título aberto). */
      excesso: f.aberto > l.valor + TOLERANCIA ? CENT(f.aberto - l.valor) : 0,
    });
  }

  return { linhas, conferir, fora, desdeDados: dados.desdeDados, temPagos: dados.temPagos };
}

/* OS TOTAIS DE UM RECORTE -- somados das linhas, para o topo nunca discordar
   da lista que está logo abaixo. */
export function totaisDe(linhas) {
  const t = { n: 0, saldo: 0, atraso: 0, aVencer: 0, antigo: 0, semTitulo: 0, recebido: 0, valor: 0,
    nAtraso: 0, nAVencer: 0, nSemTitulo: 0 };
  for (const l of linhas || []) {
    t.n += 1;
    t.saldo = CENT(t.saldo + l.saldo);
    t.atraso = CENT(t.atraso + l.atraso);
    t.aVencer = CENT(t.aVencer + l.aVencer);
    t.antigo = CENT(t.antigo + l.antigo);
    t.semTitulo = CENT(t.semTitulo + l.semTitulo);
    t.recebido = CENT(t.recebido + l.recebido);
    t.valor = CENT(t.valor + l.valor);
    if (l.atraso > 0) t.nAtraso += 1;
    if (l.aVencer > 0) t.nAVencer += 1;
    if (l.semTitulo > 0) t.nSemTitulo += 1;
  }
  return t;
}

/* AS EMPRESAS com venda em aberto, para o seletor: a maior dívida primeiro. */
export function empresasDe(linhas) {
  const m = new Map();
  for (const l of linhas || []) {
    const e = m.get(l.empresa) || { chave: l.empresa, nome: l.cliente, cnpj: l.cnpj, n: 0, saldo: 0, atraso: 0 };
    e.n += 1;
    e.saldo = CENT(e.saldo + l.saldo);
    e.atraso = CENT(e.atraso + l.atraso);
    m.set(l.empresa, e);
  }
  return [...m.values()].sort((a, b) => b.saldo - a.saldo || a.nome.localeCompare(b.nome));
}

export const ORDENS_VENDAS = [
  { id: "saldo", rotulo: "Maior saldo" },
  { id: "atraso", rotulo: "Mais atrasada" },
  { id: "antigas", rotulo: "Venda mais antiga" },
  { id: "recentes", rotulo: "Venda mais recente" },
];

export function ordenarVendas(linhas, ordem) {
  const porData = (dir) => (a, b) => dir * String(a.data).localeCompare(String(b.data)) || b.saldo - a.saldo;
  const f = {
    saldo: (a, b) => b.saldo - a.saldo || String(a.numero).localeCompare(String(b.numero)),
    atraso: (a, b) => b.diasAtraso - a.diasAtraso || b.atraso - a.atraso || b.saldo - a.saldo,
    antigas: porData(1),
    recentes: porData(-1),
  }[ordem] || ((a, b) => b.saldo - a.saldo);
  return [...(linhas || [])].sort(f);
}

// Paginação não altera somas nem o conjunto usado na impressão.
export function paginarEmpresas(empresas, pagina = 1, tamanho = 20) {
  const porPagina = Math.max(1, Math.trunc(Number(tamanho)) || 20);
  const total = empresas.length;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const atual = Math.min(paginas, Math.max(1, Math.trunc(Number(pagina)) || 1));
  const inicio = (atual - 1) * porPagina;
  return { itens: empresas.slice(inicio, inicio + porPagina), pagina: atual, paginas,
    total, de: total ? inicio + 1 : 0, ate: Math.min(inicio + porPagina, total) };
}
