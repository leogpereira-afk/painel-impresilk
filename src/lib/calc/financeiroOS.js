/* PAGO × EM ABERTO, O.S. a O.S. — a conta da tela de Campanhas.
 *
 * A pergunta do Leonardo é de cobrança: "desta campanha, o que já entrou e o
 * que ainda devem?". A resposta vem dos TÍTULOS do contas a receber, que
 * apontam a O.S. pelo número (campo `despesa` do ERP). Duas fontes:
 *
 *   `abertos` — títulos PENDENTE/VENCIDO, frescos de 20 em 20 minutos. Cada um
 *               traz o que ainda RESTA (`valor`) e o que já foi pago em parte.
 *   `pagos`   — o mapa de títulos quitados (`recebidos_os`), por id de título,
 *               montado pela carga desde `desdeDados` (2025-01-01).
 *
 * REGRAS QUE NÃO SÃO ÓBVIAS:
 *
 * 1. NÃO AFIRMAR "PAGO" SEM DADO. Um título quitado SOME das listas de
 *    aberto — e uma O.S. sem título nenhum também não aparece. "Nada em
 *    aberto" tem três leituras (pagou tudo / nunca foi faturada / o mapa não
 *    cobre a época), e só os títulos quitados no mapa separam as três. O.S.
 *    anterior a `desdeDados` sem movimento fica "semDado", nunca "pago".
 *
 * 2. O ESTORNO NÃO SOMA DUAS VEZES. Um título quitado que volta a aberto
 *    (estorno no ERP) reaparece na lista de abertos ANTES de sair do mapa de
 *    pagos (que se reconstrói na janela de 7 dias). O mesmo id nos dois lados
 *    vale pelo lado ABERTO, que é o mais fresco — sem isso o valor contaria
 *    como pago E como devido.
 *
 * 3. TOLERÂNCIA DE CENTAVOS. Título e O.S. arredondam em momentos diferentes;
 *    R$ 0,05 de diferença não pode rebaixar "pago" para "parcial".
 */

const CENT = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const TOLERANCIA = 0.05;

/* `linhas`  — as O.S. da campanha (resumo.linhas: {numero, valor, data}).
   `dados`   — a resposta do servidor: {abertos, pagos, temPagos, desdeDados}.
   `hoje`    — AAAA-MM-DD local; entra por fora para o teste não depender do
               relógio (a lição do teste que só passava no meu fuso). */
export function financeiroDasLinhas(linhas, dados, hoje) {
  const abertos = Array.isArray(dados?.abertos) ? dados.abertos : [];
  const pagos = Array.isArray(dados?.pagos) ? dados.pagos : [];
  const temPagos = !!dados?.temPagos;
  const desdeDados = String(dados?.desdeDados || "");

  const idsAbertos = new Set(abertos.map((t) => String(t.id)));

  const porOS = new Map();
  const balde = (numero) => {
    const n = String(numero);
    if (!porOS.has(n)) porOS.set(n, { aberto: 0, pago: 0, vencido: false });
    return porOS.get(n);
  };
  for (const t of abertos) {
    const b = balde(t.os);
    b.aberto = CENT(b.aberto + (Number(t.valor) || 0));
    // Pagamento PARCIAL de título ainda aberto: já entrou no caixa.
    b.pago = CENT(b.pago + (Number(t.pago) || 0));
    // Vencido = venceu ANTES de hoje. No dia do vencimento ainda não é atraso.
    if (t.vencimento && String(t.vencimento).slice(0, 10) < String(hoje)) b.vencido = true;
  }
  for (const t of pagos) {
    if (idsAbertos.has(String(t.id))) continue; // estorno: vale o lado aberto
    const b = balde(t.os);
    b.pago = CENT(b.pago + (Number(t.pago) || 0));
  }

  const porNumero = {};
  const totais = {
    recebido: 0, aberto: 0,
    pagas: 0, abertas: 0, vencidas: 0, vencidoValor: 0,
    semTitulo: 0, semTituloValor: 0, semDado: 0,
  };

  for (const l of linhas || []) {
    const numero = String(l?.numero || "");
    const valor = Number(l?.valor) || 0;
    const b = porOS.get(numero) || { aberto: 0, pago: 0, vencido: false };

    let tipo;
    if (b.aberto > 0) tipo = "aberto";
    else if (b.pago >= valor - TOLERANCIA && b.pago > 0) tipo = "pago";
    else if (b.pago > 0) tipo = "pagoParcial";
    else if (!temPagos) tipo = "semDado"; // o mapa ainda não foi montado
    else if (desdeDados && String(l?.data || "").slice(0, 10) < desdeDados) tipo = "semDado";
    else tipo = "semTitulo";

    porNumero[numero] = { tipo, aberto: b.aberto, pago: b.pago, vencido: b.vencido };

    totais.recebido = CENT(totais.recebido + b.pago);
    totais.aberto = CENT(totais.aberto + b.aberto);
    if (tipo === "pago") totais.pagas += 1;
    if (tipo === "aberto") {
      totais.abertas += 1;
      if (b.vencido) { totais.vencidas += 1; totais.vencidoValor = CENT(totais.vencidoValor + b.aberto); }
    }
    if (tipo === "semTitulo" || tipo === "pagoParcial") {
      // O que a O.S. vale além do que tem título (pago ou aberto): ainda não
      // foi faturado no ERP. É aviso, não cobrança.
      const semTitulo = CENT(Math.max(0, valor - b.pago - b.aberto));
      if (semTitulo > TOLERANCIA) { totais.semTitulo += 1; totais.semTituloValor = CENT(totais.semTituloValor + semTitulo); }
    }
    if (tipo === "semDado") totais.semDado += 1;
  }

  return { porNumero, totais };
}
