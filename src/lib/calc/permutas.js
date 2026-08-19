/* A CONTA DA PERMUTA.
 *
 * Permuta é troca: o parceiro nos dá alguma coisa (um espaço, um serviço, uma
 * mercadoria) e passa a ter crédito para gastar conosco em comunicação visual.
 * A pergunta que a tela responde é uma só: QUANTO AINDA SOBRA.
 *
 *   saldo = crédito − soma das O.S. que a direção ACEITOU nesta permuta
 *
 * Três decisões deste arquivo merecem explicação, porque cada uma nasceu de um
 * jeito de errar que já custou caro nos outros módulos.
 *
 * 1. ACEITAR É UM ATO, NÃO UM FILTRO.
 *    Seria mais fácil somar "todas as O.S. do cliente X". Estaria errado: o
 *    mesmo cliente compra na permuta E compra pagando. Quem sabe qual é qual é
 *    a direção, O.S. por O.S. Por isso a permuta guarda a LISTA das aceitas —
 *    nunca uma regra que as deduza. Deduzir acesso pelo nome já criou sósia na
 *    Central de Acessos; deduzir permuta pelo cliente criaria saldo falso.
 *
 * 2. O VALOR É CONGELADO NO ACEITE, MAS CONFERIDO CONTRA O ERP.
 *    Se a tela lesse o valor sempre do cache, uma O.S. que saísse da janela do
 *    cache (ele começa em 2025-01-01) sumiria do saldo sozinha — a permuta
 *    encolheria sem ninguém mexer nela. Se lesse só o congelado, uma correção
 *    legítima no ERP nunca apareceria. Então guarda o congelado E confere:
 *    quando os dois discordam, o número que vale é o do ERP e a tela DIZ que
 *    mudou. O que não pode acontecer é o saldo mudar em silêncio.
 *
 * 3. CNPJ QUALIFICA, NOME IDENTIFICA.
 *    O cache identifica a O.S. pelo nome do cliente, e uma permuta costuma
 *    abranger mais de um CNPJ do mesmo dono. A permuta guarda a lista de
 *    clientes que ela abrange; o CNPJ entra para desempatar razões sociais
 *    parecidas, quando o ERP o fornece. Vazio é resposta legítima (pessoa
 *    física sem cadastro completo), então nada aqui pode EXIGIR CNPJ.
 */

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");

/* O que a O.S. vale: a soma dos itens dela, do jeito que o resto do painel soma
   -- ARREDONDADA AO CENTAVO.

   O arredondamento não é preciosismo. O cache guarda o rateio das uniões de
   itens, e ele sai com cauda binária: uma O.S. de R$ 7.340,44 é guardada como
   7340.4400000000005. Na tela some, porque a formatação corta em dois dígitos.
   Na CONTA não some: a permuta soma dezenas dessas e compara o congelado com o
   vivo. Sem arredondar, a cauda vira diferença e a tela acusaria "mudou no ERP"
   numa O.S. que ninguém tocou. */
export function valorDaOS(os) {
  /* O VALOR DE VENDA, e não a soma dos itens.
     Os dois quase sempre coincidem, mas não sempre: conferindo 200 O.S. contra
     o ERP em 19/08/2026, duas tinham total maior que a soma dos itens sem ser
     desconto nem frete (a 21076, R$ 116,10 a mais; a 21022, R$ 331,76). Numa
     permuta isso é o saldo do parceiro -- vale o número que está na nota, que é
     o que o ERP chama de `valor_total`.

     A soma dos itens fica como CAMINHO DE VOLTA, para registro antigo gravado
     antes de o campo existir: sem ela, uma O.S. já aceita passaria a valer zero
     e o saldo subiria sozinho. */
  if (os && os.valor != null && os.valor !== "") {
    return Math.round(num(os.valor) * 100) / 100;
  }
  const bruto = (os?.itens || []).reduce((s, it) => s + num(it.valorTotal), 0);
  return Math.round(bruto * 100) / 100;
}

/** Nome de cliente comparável: sem acento, sem caixa, sem espaço sobrando. */
export function chaveCliente(nome) {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/* Os clientes que existem nas ordens, um por nome, com o CNPJ e o tamanho da
   carteira. É a lista que a direção percorre para escolher de quem é a permuta.
   Uma razão social pode aparecer com CNPJ preenchido numas O.S. e vazio
   noutras; guardamos TODOS os que aparecem para a tela poder mostrar quando há
   mais de um — sinal de que dois cadastros diferentes usam o mesmo nome. */
export function clientesDasOrdens(ordens) {
  const mapa = new Map();
  for (const os of ordens || []) {
    if (os?.cancelada) continue;
    const nome = String(os?.cliente || "").trim();
    if (!nome) continue;
    const k = chaveCliente(nome);
    let c = mapa.get(k);
    if (!c) {
      c = { chave: k, nome, cnpjs: new Set(), qtd: 0, total: 0, ultima: "" };
      mapa.set(k, c);
    }
    const cnpj = soDigitos(os.cnpj);
    if (cnpj) c.cnpjs.add(cnpj);
    c.qtd += 1;
    c.total += valorDaOS(os);
    const d = String(os.data || "");
    if (d > c.ultima) c.ultima = d;
  }
  return [...mapa.values()]
    .map((c) => ({ ...c, cnpjs: [...c.cnpjs] }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** A ficha de uma O.S. como ela é guardada dentro da permuta (o congelado). */
export function fichaDaOS(os) {
  const desconto = Math.round(num(os?.desconto) * 100) / 100;
  return {
    numero: String(os?.numero ?? ""),
    cliente: String(os?.cliente ?? ""),
    cnpj: soDigitos(os?.cnpj),
    data: String(os?.data ?? ""),
    valor: valorDaOS(os),
    /* A CONTA FICA GUARDADA, não só o resultado. "R$ 2.000,00" sozinho não
       responde de onde saiu; "2.138,64 − 138,64" responde, e é o que a direção
       confere contra o PDF do ERP na frente do parceiro. Foi guardar só o
       resultado que deixou o desconto passar batido. */
    ...(desconto > 0 ? { bruto: Math.round(num(os?.bruto) * 100) / 100, desconto } : {}),
  };
}

/* AS LINHAS DA PERMUTA, prontas para a tela.
 *
 * Cada O.S. aceita vira uma linha que sabe se ainda existe no ERP e se o valor
 * mudou desde o aceite. `valor` é o número que ENTRA no saldo.
 *
 * SUMIR DO CACHE QUER DIZER CANCELADA — e isso importa em dinheiro. A carga do
 * cache DESCARTA a O.S. cancelada (mubi-cache-background: `.filter((o) =>
 * !o.cancelada)` e o `mapaOS.delete` da carga leve), e a janela do cache começa
 * em 2025-01-01 e nunca encolhe. Como só dá para ACEITAR uma O.S. que está no
 * cache, toda aceita nasceu dentro da janela: se depois ela some, foi cancelada
 * no ERP. Aí o crédito da permuta está sendo consumido por um serviço que não
 * existe mais, e a direção precisa ver isso — não é detalhe técnico.
 *
 * MAS SÓ DÁ PARA DIZER ISSO SE A LISTA CHEGOU. Quando as ordens não carregam
 * (sessão sem o módulo, cache frio, ERP fora), `ordens` vem vazia — e aí TODAS
 * as O.S. da permuta pareceriam canceladas de uma vez. Lista vazia não é
 * resposta: é ausência de resposta. Nesse caso a conta usa o valor congelado e
 * a tela diz que não deu para conferir. */
export function linhasDaPermuta(permuta, ordens) {
  const conferivel = Array.isArray(ordens) && ordens.length > 0;
  const porId = new Map(conferivel ? ordens.map((o) => [String(o.id), o]) : []);
  const aceitas = permuta?.os || {};
  return Object.entries(aceitas)
    .map(([id, ficha]) => {
      const viva = porId.get(String(id));
      const congelado = num(ficha?.valor);
      const atual = viva ? valorDaOS(viva) : null;
      // O ERP manda: quando ele responde, ele é a verdade. O congelado só
      // sustenta a linha que o ERP não confirmou.
      const valor = atual === null ? congelado : atual;
      // Centavos de arredondamento não são "mudança de valor".
      const mudou = atual !== null && Math.abs(atual - congelado) >= 0.01;
      return {
        id: String(id),
        numero: String(ficha?.numero ?? viva?.numero ?? ""),
        cliente: String(viva?.cliente || ficha?.cliente || ""),
        cnpj: soDigitos(viva?.cnpj || ficha?.cnpj),
        data: String(viva?.data || ficha?.data || ""),
        valor,
        congelado,
        mudou,
        // Quanto o ERP abateu nesta O.S. A tela mostra para a conta poder ser
        // conferida sem abrir o ERP.
        desconto: Math.round(num(viva?.desconto ?? ficha?.desconto) * 100) / 100,
        bruto: Math.round(num(viva?.bruto ?? ficha?.bruto) * 100) / 100,
        // Continua contando no saldo: foi aceita, e o crédito foi dado como
        // gasto. Quem decide tirar é a direção, no botão -- não a tela sozinha.
        sumiu: conferivel && !viva,
        // Não deu para conferir com o ERP nesta carga.
        semConferir: !conferivel,
      };
    })
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

/* OS LANÇAMENTOS MANUAIS: o que mexeu no saldo sem passar por O.S.
 *
 * Nem toda troca vira ordem de serviço. O parceiro leva um brinde, a Impresilk
 * presta um favor, sobra um acerto em dinheiro, o crédito é aumentado no meio
 * do contrato. Sem um lugar para isso, esses valores ficam de fora e o saldo
 * da tela nunca bate com o saldo real -- e um saldo que não bate deixa de ser
 * consultado em duas semanas.
 *
 * `tipo` só tem dois valores e eles são OPOSTOS de propósito:
 *   "consumo" — abate o crédito (o parceiro levou algo)
 *   "credito" — aumenta o crédito (nós levamos algo dele, ou ele repôs)
 * Guardar sinal no valor seria mais curto e pior: um menos digitado sem querer
 * viraria crédito, e ninguém enxerga um sinal no meio de uma lista de números.
 */
export function linhasDosLancamentos(permuta) {
  return Object.entries(permuta?.lancamentos || {})
    .map(([id, l]) => ({
      id,
      data: String(l?.data ?? ""),
      descricao: String(l?.descricao ?? ""),
      valor: Math.round(num(l?.valor) * 100) / 100,
      tipo: l?.tipo === "credito" ? "credito" : "consumo",
      // A nota do que foi. Mora DENTRO da entrada porque um documento solto
      // numa gaveta da permuta não diz a qual entrada pertence.
      anexo: l?.anexo || null,
    }))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

/* O RESUMO: crédito, quanto já foi gasto, quanto sobra.
 *
 * `saldo` positivo = o parceiro ainda tem crédito conosco.
 * `saldo` negativo = ele já consumiu mais do que trouxe (a empresa está a
 * receber a diferença). Os dois casos são normais; a tela precisa distinguir. */
export function resumoDaPermuta(permuta, ordens) {
  const linhas = linhasDaPermuta(permuta, ordens);
  const lancamentos = linhasDosLancamentos(permuta);
  const creditos = lancamentos.filter((l) => l.tipo === "credito");
  const consumos = lancamentos.filter((l) => l.tipo !== "credito");

  /* O CRÉDITO É A SOMA DAS ENTRADAS, não um campo.
     Era um número solto no topo da permuta, e um número solto não responde "de
     onde saiu esse crédito" -- que é a primeira pergunta que o parceiro faz.
     Agora cada coisa que ele nos deu é uma entrada com data, o que foi e a
     nota; o total é a soma.

     `permuta.credito` continua sendo SOMADO quando existe: e o que foi lançado
     antes desta mudança. Ignorá-lo faria dinheiro real sumir do saldo em
     silêncio -- e a tela mostra essa parcela separada, para nunca virar um
     valor sem origem. */
  const creditoAntigo = num(permuta?.credito);
  const creditoLancado = creditos.reduce((s, l) => s + l.valor, 0);
  const creditoBase = creditoAntigo + creditoLancado;
  const lancado = consumos.reduce((s, l) => s + l.valor, 0);
  const emOS = linhas.reduce((s, l) => s + l.valor, 0);
  // Centavo redondo em cada parcela e no total: a soma tem que bater com o que
  // a tela mostra linha a linha, senão a conferência com o parceiro trava num
  // centavo que ninguém acha.
  const consumido = Math.round((emOS + lancado) * 100) / 100;
  const credito = Math.round(creditoBase * 100) / 100;
  return {
    linhas,
    lancamentos,
    creditos,
    consumos,
    creditoAntigo: Math.round(creditoAntigo * 100) / 100,
    credito,
    emOS: Math.round(emOS * 100) / 100,
    // Quanto veio de lançamento manual, separado, para a tela poder mostrar de
    // onde o consumo saiu. Positivo abate, negativo devolve.
    lancado: Math.round(lancado * 100) / 100,
    consumido,
    saldo: Math.round((credito - consumido) * 100) / 100,
    // Quanto do crédito já virou serviço, para a barra. Sem crédito lançado a
    // barra não tem denominador: devolve null em vez de fingir 0% ou 100%.
    pct: credito > 0 ? Math.min(1, consumido / credito) : null,
    // O que a tela precisa avisar em vez de esconder.
    mudaram: linhas.filter((l) => l.mudou).length,
    sumiram: linhas.filter((l) => l.sumiu).length,
    semConferir: linhas.some((l) => l.semConferir),
  };
}

/* O EXTRATO DA PERMUTA — a conta consolidada, para o papel.
 *
 * A tela é dividida por TAREFA (lançar crédito, escolher O.S., ver consumo),
 * porque é assim que se trabalha. O papel é dividido por CONTA, porque é assim
 * que se confere com o parceiro: de um lado o que ele nos deu, do outro tudo o
 * que ele consumiu -- O.S. e lançamento manual na MESMA lista, em ordem de
 * data. Separados, o parceiro tem de somar duas colunas para saber quanto
 * gastou; juntos, ele lê de cima para baixo.
 *
 * A BALANÇA COMERCIAL é o resumo em uma linha: quanto entrou, quanto saiu, e
 * de que lado está a diferença. É o que responde "e aí, quem deve a quem".
 */
export function extratoDaPermuta(permuta, ordens) {
  const r = resumoDaPermuta(permuta, ordens);

  // Tudo o que ele consumiu, numa lista só, do mais antigo para o mais novo --
  // ordem de extrato, não de tela (lá o recente vem primeiro).
  const consumo = [
    ...r.linhas.map((l) => ({
      data: String(l.data).slice(0, 10),
      documento: `O.S. ${l.numero}`,
      descricao: l.cliente,
      bruto: l.bruto || l.valor,
      desconto: l.desconto || 0,
      valor: l.valor,
      alerta: l.sumiu ? "cancelada no ERP" : l.mudou ? "valor mudou no ERP" : null,
    })),
    ...r.consumos.map((l) => ({
      data: String(l.data).slice(0, 10),
      documento: "Lançamento manual",
      descricao: l.descricao || "(sem descrição)",
      bruto: l.valor,
      desconto: 0,
      valor: l.valor,
      alerta: null,
    })),
  ].sort((a, b) => a.data.localeCompare(b.data));

  const creditos = r.creditos
    .map((c) => ({
      data: String(c.data).slice(0, 10),
      descricao: c.descricao || "(sem descrição)",
      valor: c.valor,
      nota: c.anexo?.nome || null,
    }))
    .sort((a, b) => a.data.localeCompare(b.data));

  /* Consumo por CLIENTE. Uma permuta abrange mais de um CNPJ do mesmo dono, e
     na hora de conferir ele quer saber quanto saiu por cada empresa dele. Só
     entra no papel quando há mais de um -- com um só, seria repetir o total. */
  const porCliente = [...consumo.reduce((m, c) => {
    const k = c.documento.startsWith("O.S.") ? c.descricao : "Lançamentos manuais";
    m.set(k, (m.get(k) || 0) + c.valor);
    return m;
  }, new Map())]
    .map(([nome, valor]) => ({ nome, valor: Math.round(valor * 100) / 100 }))
    .sort((a, b) => b.valor - a.valor);

  return {
    ...r,
    creditos,
    consumo,
    porCliente,
    // A BALANÇA: o que entrou, o que saiu, e de que lado sobra.
    balanca: {
      recebemos: r.credito,
      entregamos: r.consumido,
      diferenca: r.saldo,
      // Quem está devendo a quem, em palavras -- a cor não vai para o papel.
      lado: r.saldo > 0 ? "credito-do-parceiro" : r.saldo < 0 ? "a-receber" : "zerada",
    },
  };
}

/* Todas as permutas com o seu resumo, para a lista de abertura. As que ainda
   têm saldo vêm primeiro: é onde a direção precisa olhar. */
export function resumoGeral(permutas, ordens) {
  return Object.entries(permutas || {})
    .map(([id, p]) => ({ id, ...p, ...resumoDaPermuta(p, ordens) }))
    .sort((a, b) => {
      if (!!a.encerrada !== !!b.encerrada) return a.encerrada ? 1 : -1;
      return b.saldo - a.saldo;
    });
}

/* OS TOTAIS DE TODAS AS PERMUTAS — os números do topo da tela.
 *
 * NÃO SOMA OS SALDOS. Somar daria um número que não responde pergunta nenhuma:
 * na base real de 19/08/2026, "R$ 2.238 ainda para gastar na Maple Bear" mais
 * "R$ 56.452 consumidos além do crédito na Vila 61" fecham em −R$ 81 mil, e
 * esse −81 mil não é nem crédito disponível nem dívida — é a mistura de dois
 * fatos opostos.
 *
 * Saldo positivo e saldo negativo são coisas diferentes:
 *   positivo = crédito que ainda dá para gastar;
 *   negativo = serviço entregue além do que o parceiro deu (ou crédito que
 *              ninguém lançou ainda).
 * Por isso eles saem separados, e quem lê decide o que fazer com cada um.
 *
 * `semCredito` é o que impede o número de mentir: duas permutas da base têm
 * crédito ZERO e consumo de dezenas de milhares. Elas não significam que a
 * casa gastou demais — significam que o crédito não foi lançado. Sem esse
 * aviso, o "além do crédito" parece prejuízo e é cadastro faltando.
 */
export function totaisDasPermutas(lista) {
  const cem = (n) => Math.round(n * 100) / 100;
  const vivas = (lista || []).filter((p) => !p.encerrada);
  const t = {
    quantas: vivas.length,
    encerradas: (lista || []).length - vivas.length,
    permutado: 0,     // o que os parceiros deram
    consumido: 0,     // o que já virou O.S. e lançamento
    aUsar: 0,         // soma só dos saldos POSITIVOS
    /* O QUE OS PARCEIROS DEVEM, em positivo. Chamava-se `aReceber`, que
       descreve o mecanismo -- consumiram mais do que o crédito -- e não o
       dinheiro. Quem lê a tela precisa da segunda coisa: é valor A RECEBER,
       com nome e telefone, não um fato consumado. */
    aReceber: 0,
    semCredito: 0,    // permutas com consumo e nenhum crédito lançado
  };
  for (const p of vivas) {
    t.permutado += p.credito || 0;
    t.consumido += p.consumido || 0;
    if (p.saldo > 0) t.aUsar += p.saldo;
    else if (p.saldo < 0) t.aReceber += -p.saldo;
    if (!(p.credito > 0) && (p.consumido || 0) > 0) t.semCredito++;
  }
  for (const k of ["permutado", "consumido", "aUsar", "aReceber"]) t[k] = cem(t[k]);
  return t;
}

/* As O.S. de um conjunto de clientes, para a tela de escolher.
 *
 * `jaAceitas` marca as que já entraram em ALGUMA permuta — inclusive em outra,
 * porque a mesma O.S. não pode abater dois créditos. Quem já está nesta permuta
 * aparece marcada; quem está em outra aparece bloqueada, com o nome de onde. */
export function ordensDosClientes(ordens, chaves, donoPorOS, permutaAtual) {
  const querem = new Set(chaves || []);
  if (!querem.size) return [];
  return (ordens || [])
    .filter((o) => !o.cancelada && querem.has(chaveCliente(o.cliente)))
    .map((o) => {
      const dono = donoPorOS?.get(String(o.id)) || null;
      return {
        id: String(o.id),
        numero: String(o.numero ?? ""),
        cliente: String(o.cliente ?? ""),
        cnpj: soDigitos(o.cnpj),
        data: String(o.data ?? ""),
        valor: valorDaOS(o),
        nesta: dono?.id === permutaAtual,
        // Nome da OUTRA permuta que já usou esta O.S. Null quando está livre.
        presaEm: dono && dono.id !== permutaAtual ? dono.nome : null,
      };
    })
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

/* Quem é o dono de cada O.S. já aceita, em todas as permutas. Uma O.S. só pode
   abater um crédito: sem este índice, aceitar a mesma O.S. em duas permutas
   apagaria dinheiro de verdade — e nenhuma das duas telas mostraria erro. */
export function donoPorOS(permutas) {
  const mapa = new Map();
  for (const [id, p] of Object.entries(permutas || {})) {
    for (const osId of Object.keys(p?.os || {})) {
      if (!mapa.has(osId)) mapa.set(osId, { id, nome: p?.nome || "sem nome" });
    }
  }
  return mapa;
}
