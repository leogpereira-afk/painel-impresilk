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
 *
 * 4. TÍTULO COMPARTILHADO. O ERP cobra várias O.S. num título só
 *    ("23208-23206-23051-23021"). O servidor já reparte proporcionalmente ao
 *    valor de cada O.S. e marca a parte com `compartilhado` — e com `incerto`
 *    quando teve de dividir por igual por não saber o valor de alguma. A tela
 *    precisa dizer isso: número repartido não é número conferido no ERP linha
 *    a linha, e quem cobra o cliente tem de saber a diferença.
 */

const CENT = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const TOLERANCIA = 0.05;

/* A FAXINA DO MAPA DE PAGOS — decide quem sai, e quando NÃO mexer.
 *
 * Mora aqui, e não solta no script da carga, porque isto APAGA registro de
 * dinheiro recebido: precisa de teste, e teste com entrada sintética, nunca
 * "rodando para ver".
 *
 * O mapa cresce por merge (id a id) e nunca encolheria sozinho: um título
 * estornado no ERP ficaria "pago" para sempre e a tela diria pago sobre
 * dinheiro que voltou a ser devido. Uma vez por semana a carga varre uma
 * janela larga e o que estava no mapa DENTRO dela e não voltou sai.
 *
 * O FREIO: apagar em lote exige resposta confiável. Se o ERP devolver a janela
 * pela metade, "não voltou" deixa de significar estorno e passa a significar
 * leitura incompleta -- e apagar aí transformaria dinheiro recebido em cobrança
 * ao cliente. Acima do limite (30%), não mexe e denuncia.
 *
 * `titulos` — o mapa {id: {os, pago, em}}   `vieram` — Set de ids que o ERP devolveu
 * `corte`   — AAAA-MM-DD, início da janela varrida
 */
export function faxinarPagos(titulos, vieram, corte, { limite = 0.3 } = {}) {
  const naJanela = Object.entries(titulos || {})
    .filter(([, t]) => {
      const em = String(t?.em || "").slice(0, 10);
      // Sem data de pagamento não dá para saber se ele era esperado nesta
      // janela -- e o que não se pode julgar não se apaga.
      return em && em >= String(corte);
    });
  const sumiram = naJanela.filter(([id]) => !vieram.has(id));
  if (naJanela.length > 0 && sumiram.length / naJanela.length > limite) {
    return { titulos, removidos: 0, abortada: true, sumiram: sumiram.length, naJanela: naJanela.length };
  }
  const saida = { ...titulos };
  for (const [id] of sumiram) delete saida[id];
  return { titulos: saida, removidos: sumiram.length, abortada: false, sumiram: sumiram.length, naJanela: naJanela.length };
}

/* `linhas`  — as O.S. da campanha (resumo.linhas: {id, numero, valor, data}).
   `dados`   — a resposta do servidor: {abertos, pagos, permutaDaOS, temPagos, desdeDados}.
   `hoje`    — AAAA-MM-DD local; entra por fora para o teste não depender do
               relógio (a lição do teste que só passava no meu fuso).

   A PERMUTA VEM ANTES DE TUDO. Uma O.S. paga em troca está quitada e nunca vai
   ter título -- perguntar "pago ou em aberto?" sobre ela é a pergunta errada.
   Fica num estado próprio, com o valor FORA do dinheiro recebido: somar troca
   com caixa faria o cartão "Recebido" deixar de responder quanto entrou. */
export function financeiroDasLinhas(linhas, dados, hoje) {
  const abertos = Array.isArray(dados?.abertos) ? dados.abertos : [];
  const pagos = Array.isArray(dados?.pagos) ? dados.pagos : [];
  const temPagos = !!dados?.temPagos;
  const desdeDados = String(dados?.desdeDados || "");

  const idsAbertos = new Set(abertos.map((t) => String(t.id)));

  const porOS = new Map();
  const balde = (numero) => {
    const n = String(numero);
    if (!porOS.has(n)) porOS.set(n, { aberto: 0, pago: 0, vencido: false, compartilhado: false, incerto: false });
    return porOS.get(n);
  };
  const marcar = (b, t) => {
    if (t.compartilhado) b.compartilhado = true;
    if (t.incerto) b.incerto = true;
  };
  for (const t of abertos) {
    const b = balde(t.os);
    b.aberto = CENT(b.aberto + (Number(t.valor) || 0));
    // Pagamento PARCIAL de título ainda aberto: já entrou no caixa.
    b.pago = CENT(b.pago + (Number(t.pago) || 0));
    // Vencido = venceu ANTES de hoje. No dia do vencimento ainda não é atraso.
    if (t.vencimento && String(t.vencimento).slice(0, 10) < String(hoje)) b.vencido = true;
    marcar(b, t);
  }
  for (const t of pagos) {
    if (idsAbertos.has(String(t.id))) continue; // estorno: vale o lado aberto
    const b = balde(t.os);
    b.pago = CENT(b.pago + (Number(t.pago) || 0));
    marcar(b, t);
  }

  const porNumero = {};
  const permutaDaOS = dados?.permutaDaOS && typeof dados.permutaDaOS === "object" ? dados.permutaDaOS : {};
  /* QUAIS O.S. A RESPOSTA COBRE. O servidor tem teto (600) e descarta número
     que não passa no filtro dele -- e a escada abaixo, sem saber disso, dava
     "sem título no ERP" para O.S. que ninguém consultou: afirmação de ausência
     a partir de pergunta não feita. Quando a lista vem, quem está fora dela
     não recebe selo nenhum e é contado à parte. (Resposta velha, de antes
     deste campo existir, não tem a lista: aí o comportamento é o de antes.) */
  const consultadas = Array.isArray(dados?.consultadas)
    ? new Set(dados.consultadas.map((x) => String(x)))
    : null;

  const totais = {
    recebido: 0, aberto: 0,
    pagas: 0, abertas: 0, vencidas: 0, vencidoValor: 0,
    semTitulo: 0, semTituloValor: 0, semDado: 0,
    // Pedidas mas não respondidas (teto do servidor / número recusado).
    naoConsultadas: 0, naoConsultadoValor: 0,
    // Quantas O.S. dependem de título que cobra mais de uma (valor repartido).
    compartilhadas: 0, incertas: 0,
    // Quitadas em troca: não entram no dinheiro, mas também não são cobrança.
    permutadas: 0, permutadoValor: 0,
    /* Quanto das O.S. em permuta o ERP TAMBÉM registra como pago. Medido em
       04/09/2026: 91 das 156 O.S. de permuta têm pagamento no ERP, R$ 468.574.
       O ERP não diz se aquilo foi dinheiro ou a baixa da própria troca -- e
       chutar em qualquer direção erra: somar em "Recebido" infla o caixa,
       ignorar sem falar esconde R$ 468 mil. Fica num número próprio, que a
       tela mostra. */
    permutaPagoNoErp: 0,
  };

  for (const l of linhas || []) {
    const numero = String(l?.numero || "");
    const valor = Number(l?.valor) || 0;
    const b = porOS.get(numero) || { aberto: 0, pago: 0, vencido: false, compartilhado: false, incerto: false };
    const permuta = permutaDaOS[String(l?.id ?? "")] || null;

    let tipo;
    /* PERMUTA MANDA. Mesmo que o ERP tenha um título para ela (acontece: a
       venda foi faturada e depois acertada em troca), quem responde "isto está
       pago?" é a permuta -- e ela diz sim. O que sobra em aberto no ERP é
       assunto da tela de Permutas, não cobrança desta campanha. */
    if (permuta) tipo = "permuta";
    else if (consultadas && !consultadas.has(numero)) tipo = "naoConsultada";
    else if (b.aberto > 0) tipo = "aberto";
    else if (b.pago >= valor - TOLERANCIA && b.pago > 0) tipo = "pago";
    else if (b.pago > 0) tipo = "pagoParcial";
    else if (!temPagos) tipo = "semDado"; // o mapa ainda não foi montado
    else if (desdeDados && String(l?.data || "").slice(0, 10) < desdeDados) tipo = "semDado";
    else tipo = "semTitulo";

    porNumero[numero] = {
      tipo, aberto: b.aberto, pago: b.pago, vencido: b.vencido,
      compartilhado: b.compartilhado, incerto: b.incerto, permuta,
    };

    /* O QUE ESTÁ EM TROCA SAI DAS DUAS CONTAS DE DINHEIRO. Deixar o título
       aberto dessa O.S. no cartão "Em aberto" mandaria cobrar quem já acertou;
       e somar a troca em "Recebido" faria o número deixar de ser caixa. Ela
       vira uma linha própria, com o valor da O.S. -- que é o que a permuta
       abateu do crédito do parceiro. */
    /* NÃO CONSULTADA: sem selo e fora de toda soma de cobrança. O número
       aparece só no rodapé, dizendo quantas ficaram de fora. */
    if (tipo === "naoConsultada") {
      totais.naoConsultadas += 1;
      totais.naoConsultadoValor = CENT(totais.naoConsultadoValor + valor);
      continue;
    }

    if (tipo === "permuta") {
      totais.permutadas += 1;
      totais.permutadoValor = CENT(totais.permutadoValor + valor);
      totais.permutaPagoNoErp = CENT(totais.permutaPagoNoErp + b.pago);
      continue;
    }

    if (b.compartilhado) totais.compartilhadas += 1;
    if (b.incerto) totais.incertas += 1;

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

  /* O QUE O CLIENTE AINDA DEVE, na regua do Leonardo (04/09): "o que nao teve
     identificacao esta aberto". Venda entregue sem nota emitida continua sendo
     divida -- so nao esta cobravel ainda. Por isso "Em aberto" soma os titulos
     em aberto MAIS o que ficou sem titulo (inclusive o resto de uma O.S. paga
     em parte), e a tela detalha a divisao embaixo do numero.

     Fica FORA: permuta (ja acertada), e o que a tela nao pode afirmar --
     `semDado` (anterior ao mapa de pagamentos) e `naoConsultada` (fora do teto
     do servidor). Somar esses dois seria cobrar por dedução. */
  totais.aReceber = CENT(totais.aberto + totais.semTituloValor);
  totais.aReceberOS = totais.abertas + totais.semTitulo;

  return { porNumero, totais };
}

/* AS O.S. QUE FORMAM CADA QUADRO — o detalhe por trás do número.
 *
 * Pedido do Léo (04/09): "quando clicar nos cards eles deveriam abrir as O.S.
 * específicas". Vale a regra de sempre da casa: quadro de análise que mostra um
 * total tem de deixar ver de onde ele saiu.
 *
 * A REGRA DE OURO AQUI: a soma de `parte` TEM de bater com o total do cartão.
 * Lista que não fecha com o número acima dela é pior que lista nenhuma -- quem
 * confere para de acreditar nos dois. Por isso cada quadro devolve a MESMA
 * parcela que entrou no seu total:
 *   recebido — o que entrou em dinheiro naquela O.S. (inclusive parcial);
 *   aberto   — o título em aberto, ou o pedaço ainda não faturado;
 *   permuta  — o valor da O.S., que foi o que a troca abateu.
 * Há teste de fechamento para os três. */
export function osDoQuadro(linhas, porNumero, quadro) {
  const out = [];
  for (const l of linhas || []) {
    const f = porNumero?.[String(l?.numero || "")];
    if (!f) continue;
    const valor = Number(l?.valor) || 0;
    if (quadro === "recebido") {
      if (f.tipo === "permuta" || f.tipo === "naoConsultada") continue;
      if (f.pago > 0) out.push({ ...l, parte: f.pago, fin: f });
    } else if (quadro === "aberto") {
      if (f.tipo === "aberto") out.push({ ...l, parte: f.aberto, fin: f });
      else if (f.tipo === "semTitulo" || f.tipo === "pagoParcial") {
        const resto = CENT(Math.max(0, valor - f.pago - f.aberto));
        if (resto > TOLERANCIA) out.push({ ...l, parte: resto, fin: f });
      }
    } else if (quadro === "permuta") {
      if (f.tipo === "permuta") out.push({ ...l, parte: valor, fin: f });
    }
  }
  // Do maior para o menor: quem abre quer ver primeiro o que pesa.
  return out.sort((a, b) => b.parte - a.parte);
}
