// Cruza os recebiveis do Mubi (leitura) com os overrides (motivo, cobrado) e
// aplica as regras de Configuracoes. Retorna o modelo completo do modulo.
//
// dsoHist (opcional) e o historico REAL de DSO acumulado no cache (um ponto por
// dia). Sem historico real, o modulo NAO inventa tendencia nem curva.

import { diasEntre, dataCurta } from "../format.js";
import { proximaAcao } from "../recomendacao.js";

// Quem vendeu cada titulo. O contas-receber do Mubisys nao guarda vendedor: o
// vinculo e o campo `os` do titulo (que e o numero da Ordem de Servico, e pode
// citar VARIAS OS, ex "18821-18838"). Cruzando com as OS do cache descobrimos
// com quem a cobranca deve falar.
//
// Cobertura medida (2026-07-21): 167 dos 189 titulos em aberto. Os 22 sem
// vendedor eram de OS de 2025, porque o cache so guardava o ano corrente --
// corrigido em 08/2026: a carga completa passou a buscar O.S. desde a MESMA
// data de corte da tela (CORTE_ATRASADOS, em mubi-cache-background.mjs).
// Quando ainda assim nao houver par, a tela mostra "nao localizado" em vez de
// mentir um nome.
//
// ------------------------------------------------------------------------
// TRES CAMINHOS QUE PARECEM CONSERTO E NAO SAO. Medidos em 04/08/2026 contra
// os dados reais (519 O.S. do PCP + config do Painel). Estao escritos aqui
// para ninguem gastar o trabalho de novo:
//
// 1) "Usar o vendedor do PCP como segunda fonte." NAO RESOLVE: o PCP so tem
//    registro de 21/06/2026 para frente, e a lacuna real e de O.S. de 2025 --
//    cobertura ZERO justamente onde falta. Alem de ser um subconjunto (so O.S.
//    que passam por instalacao).
//
// 2) "Normalizar acento e caixa do nome do vendedor." NAO E A CAUSA: 518 das
//    519 O.S. batem EXATAMENTE (byte a byte) com a lista do config. A unica
//    excecao e um registro digitado a mao no PCP que usou o apelido "Barbara"
//    em vez de "Barbara Vasconcelos". Ganho maximo: 0,19%.
//
// 3) "Casar por cliente ou CNPJ quando o numero nao acha." PIOR QUE NAO TER:
//    o CNPJ vem vazio em 99,8% dos registros, e 15 clientes (5,5%) sao
//    atendidos por MAIS DE UMA vendedora -- eles concentram 93 das 519 O.S.
//    E nao e passagem de carteira que uma regra de "mais recente" resolveria:
//    os nomes se intercalam dia a dia dentro do mesmo mes (SOCIEDADE RURAL
//    alterna Barbara/Jessica ao longo de todo junho). Um palpite por nome
//    mandaria a cobranca para quem nao atendeu o cliente, sem nada na tela
//    dizendo que e palpite -- e o recorte do seletor e o que vai para o PDF
//    de cobranca.
//
// Se um dia entrar um palpite, ele tem de ser rotulado como palpite E ficar
// fora de `porVendedor` (que alimenta o seletor e, por ele, o PDF), do mesmo
// jeito que "Nao localizado" ja fica.
// ------------------------------------------------------------------------
function mapaVendedorPorOS(ordens) {
  const m = new Map();
  for (const o of ordens || []) {
    const n = String(o.numero || "").trim();
    if (n && o.vendedor) m.set(n, o.vendedor);
  }
  return m;
}

function vendedoresDoTitulo(osTexto, mapa) {
  const numeros = String(osTexto || "").match(/\d+/g) || [];
  return [...new Set(numeros.map((n) => mapa.get(n)).filter(Boolean))];
}

// Onde a divida esta concentrada: por ano e por mes de VENCIMENTO (quando a
// divida nasceu) e por cliente (quem deve). Recebe a lista JA FILTRADA da tela,
// para o painel responder sempre sobre o que esta na frente do gestor.
export function agruparDividas(titulos) {
  const porChave = (fn) => {
    const acc = {};
    for (const t of titulos) {
      const k = fn(t);
      if (!k) continue;
      const b = (acc[k] ||= { chave: k, qtd: 0, valor: 0, dias: 0 });
      b.qtd += 1;
      b.valor += t.valor;
      b.dias = Math.max(b.dias, t.dias);
    }
    return Object.values(acc);
  };

  const porAno = porChave((t) => (t.vencimento || "").slice(0, 4)).sort((a, b) =>
    a.chave.localeCompare(b.chave)
  );
  const porMes = porChave((t) => (t.vencimento || "").slice(0, 7)).sort((a, b) =>
    a.chave.localeCompare(b.chave)
  );
  const porCliente = porChave((t) => t.cliente).sort((a, b) => b.valor - a.valor);

  return { porAno, porMes, porCliente };
}

export function calcContasAtrasadas(recebiveis, overrides, config, dsoHist = [], ordens = []) {
  const vendPorOS = mapaVendedorPorOS(ordens);
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(hoje.getDate()).padStart(2, "0")}`;

  const motivoMap = new Map((config.motivosAtraso || []).map((m) => [m.id, m]));
  const grupoNome = (g) =>
    (config.gruposCausa || []).find((x) => x.id === g)?.nome || g;

  // Corte do historico: divida vencida antes desta data e calote velho (2021-22
  // no ERP), nao cobranca ativa. Fica fora dos totais e da lista, mas continua
  // no cache e reaparece quando o gestor seleciona aquele ano/periodo -- some
  // do numero do dia sem sumir da verdade.
  const corte = config.parametros?.dataCorteAtrasados || "";
  const ehAntiga = (venc) => !!corte && String(venc || "") < corte;

  // Reincidencia por CNPJ (mesmo cliente pode aparecer com grafias diferentes;
  // o CNPJ e a chave estavel). Cai para o nome se nao houver CNPJ.
  const vencidosPorCliente = {};
  const abertos = recebiveis.map((r) => {
    const dias = diasEntre(r.vencimento, hojeISO);
    const chaveCliente = r.cnpj || r.cliente;
    // So conta para reincidencia o que esta DENTRO do corte. Antes, um cliente
    // com um atraso hoje e um calote de 2022 vinha marcado como reincidente --
    // com base num titulo que a tela jura ter tirado de todos os numeros.
    /* REINCIDENTE É QUEM ATRASA DE NOVO, NÃO QUEM PARCELOU.
       Contando TÍTULOS, uma nota fiscal parcelada em três vezes com as três
       parcelas vencidas marcava o cliente de vermelho e o mandava para a frente
       "renegocie os crônicos" — propondo parcelamento a quem já parcelou.
       Contando NOTAS distintas, três parcelas da mesma NF valem uma. */
    if (dias > 0 && !ehAntiga(r.vencimento)) {
      const nfs = (vencidosPorCliente[chaveCliente] ||= new Set());
      nfs.add(String(r.nf || r.id));
    }
    return { ...r, dias, chaveCliente };
  });

  /* O QUE VENCE NA SEMANA JÁ ESTÁ AQUI, E ERA JOGADO FORA.
     O cache traz os títulos pendentes até 90 dias à frente; a linha abaixo
     (`dias > 0`) descartava tudo que ainda não venceu. Um telefonema dois dias
     ANTES do vencimento evita o atraso inteiro — e o caso mais caro é o cliente
     que já está devendo e tem mais um vencendo sexta: é quem não deveria
     receber trabalho novo sem uma conversa. */
  const aVencer = abertos
    .filter((r) => r.dias <= 0 && r.dias >= -7)
    .map((r) => ({
      ...r,
      diasAte: -r.dias,
      jaDeve: (vencidosPorCliente[r.chaveCliente]?.size || 0) > 0,
    }))
    .sort((a, b) => a.diasAte - b.diasAte);

  const todosAtrasados = abertos
    .filter((r) => r.dias > 0)
    .map((r) => {
      const ov = overrides[r.id] || {};
      const motivo = motivoMap.get(ov.motivoId);
      const vendedores = vendedoresDoTitulo(r.os, vendPorOS);
      return {
        id: r.id,
        cliente: r.cliente,
        cnpj: r.cnpj,
        nf: r.nf,
        os: r.os,
        vendedores,
        vendedor: vendedores.join(", "),
        valor: r.valor,
        /* O QUE JÁ FOI PAGO deste título. Vai adiante para a tela poder
           mostrar a conta -- "R$ 28.000 − R$ 21.000 pago" -- em vez de um
           líquido sem origem. Título antigo do cache, gravado antes do campo
           existir, vem sem: aí a tela não mostra nada, que é o certo. */
        valorTitulo: r.valorTitulo ?? null,
        pago: r.pago ?? 0,
        dias: r.dias,
        emissao: r.emissao,
        vencimento: r.vencimento,
        motivoId: ov.motivoId || null,
        motivoNome: motivo?.nome || "Sem motivo",
        grupo: motivo?.grupo || null,
        grupoNome: motivo ? grupoNome(motivo.grupo) : "Sem classificacao",
        tag: motivo?.tag || null,
        cobrado: !!ov.cobrado,
        /* HÁ QUANTOS DIAS foi cobrado. `null` = marcado antes de existir data
           (as marcações antigas não têm), e a tela diz só "Cobrado".
           É esta conta que separa "acabei de falar com ele" de "falei há vinte
           dias e o dinheiro não entrou" -- a segunda é a cobrança que mais
           rende, e até aqui ela não existia na tela. */
        cobradoHa: ov.cobradoEm ? diasEntre(ov.cobradoEm, hojeISO) : null,
        observacao: ov.observacao || "",
        reincidente: (vencidosPorCliente[r.chaveCliente]?.size || 0) > 1,
        antiga: ehAntiga(r.vencimento),
        proximaAcao: proximaAcao(ov.motivoId, r.dias, config),
      };
    })
    .sort((a, b) => b.valor - a.valor);

  // Daqui para baixo TODO calculo usa so a cobranca ativa: totais, DSO, faixas,
  // frentes e ranking. As antigas seguem em `todosAtrasados` para a tela poder
  // revela-las sob demanda.
  const atrasados = todosAtrasados.filter((t) => !t.antiga);
  const listaAntigas = todosAtrasados.filter((t) => t.antiga);

  const totalAtrasado = soma(atrasados);
  const pendentes = atrasados.filter((r) => !r.cobrado);
  const reincidentes = atrasados.filter((r) => r.reincidente);

  // DSO (prazo medio de recebimento): media dos dias desde a emissao, ponderada
  // por valor.
  //
  // Respeita o MESMO corte do resto da tela. Antes usava `abertos` (tudo que
  // veio do cache) enquanto todos os outros numeros ja usavam so a cobranca
  // ativa: como a media e ponderada por valor e por dias, cada titulo de 2021-22
  // (ha um de 1.782 dias no ERP) empurrava o indicador para cima sozinho, e o
  // painel exibia um prazo medio que nao correspondia a lista mostrada.
  const abertosAtivos = abertos.filter((r) => !ehAntiga(r.vencimento));
  const totValorAberto = abertosAtivos.reduce((s, r) => s + r.valor, 0) || 1;
  const dso = Math.round(
    abertosAtivos.reduce((s, r) => s + r.valor * diasEntre(r.emissao, hojeISO), 0) /
      totValorAberto
  );
  const historicoReal = (Array.isArray(dsoHist) ? dsoHist : []).filter(
    (p) => p && typeof p.dso === "number" && p.dia
  );
  const dsoAnterior =
    historicoReal.length >= 2 ? historicoReal[historicoReal.length - 2].dso : null;
  const dsoTendencia =
    dsoAnterior == null ? null : dso < dsoAnterior ? "baixa" : dso > dsoAnterior ? "alta" : "estavel";
  const dsoHistorico =
    historicoReal.length >= 2
      ? historicoReal.map((p) => ({ mes: dataCurta(p.dia), dso: p.dso }))
      : [];

  const maior = atrasados.reduce((a, b) => (b.dias > a.dias ? b : a), atrasados[0] || { dias: 0 });

  // --- Por que estao atrasados (por origem/grupo)
  const porGrupo = {};
  for (const r of atrasados) {
    const g = r.grupo || "sem";
    porGrupo[g] = (porGrupo[g] || 0) + r.valor;
  }
  const porOrigemBase = (config.gruposCausa || [])
    .map((g) => ({
      grupo: g.id,
      nome: g.nome,
      valor: porGrupo[g.id] || 0,
      pct: totalAtrasado ? Math.round(((porGrupo[g.id] || 0) / totalAtrasado) * 100) : 0,
    }))
    .sort((a, b) => b.valor - a.valor);

  const semClass = porGrupo["sem"] || 0;
  const naoClassPct = totalAtrasado ? Math.round((semClass / totalAtrasado) * 100) : 0;

  // Inclui a fatia sem classificacao para as barras fecharem 100%.
  const porOrigem = [...porOrigemBase];
  if (semClass > 0) {
    porOrigem.push({ grupo: "sem", nome: "Sem classificação", valor: semClass, pct: naoClassPct });
  }
  porOrigem.sort((a, b) => b.valor - a.valor);

  // O "grosso" so considera causas classificadas (ignora a fatia sem motivo).
  const lider = porOrigemBase.find((o) => o.valor > 0);
  const resumoOrigem = lider
    ? `O grosso classificado esta em ${lider.nome.toLowerCase()}: ${lider.pct}% do total.` +
      (naoClassPct >= 20 ? ` Atencao: ${naoClassPct}% ainda sem motivo, classifique na tabela.` : "")
    : semClass > 0
      ? `Nenhum atraso tem motivo definido ainda (${naoClassPct}% do total). Classifique na tabela abaixo.`
      : "Sem atrasos classificados por origem.";

  // --- Padroes por motivo
  const porMotivoMap = {};
  for (const r of atrasados) {
    const k = r.motivoId || "sem";
    if (!porMotivoMap[k])
      porMotivoMap[k] = { motivoId: r.motivoId, nome: r.motivoNome, grupo: r.grupo, valor: 0, qtd: 0 };
    porMotivoMap[k].valor += r.valor;
    porMotivoMap[k].qtd += 1;
  }
  const porMotivo = Object.values(porMotivoMap).sort((a, b) => b.valor - a.valor);

  // --- Idade dos atrasos (faixas de Configuracoes)
  const idade = faixasIdade(atrasados, config.faixasIdade || [15, 30, 60, 90]);

  // --- Plano de acao em frentes automaticas
  const frentes = montarFrentes(atrasados, config);

  // --- Cobrar hoje: top 5 pendentes por valor
  const cobrarHoje = pendentes.slice(0, 5).map((r) => ({
    id: r.id,
    cliente: r.cliente,
    valor: r.valor,
    dias: r.dias,
    acao: r.proximaAcao,
  }));

  // --- Carteira de cobranca por vendedor: quem vendeu o que esta atrasado.
  // Serve para repassar a cobranca a quem tem a relacao com o cliente. Um
  // titulo que cita varias OS conta para cada vendedor envolvido (por isso a
  // soma das carteiras pode passar do total; o rotulo na tela avisa).
  const porVendedorMapa = {};
  for (const t of atrasados) {
    for (const v of t.vendedores.length ? t.vendedores : ["Nao localizado"]) {
      const b = (porVendedorMapa[v] ||= { nome: v, qtd: 0, valor: 0 });
      b.qtd += 1;
      b.valor += t.valor;
    }
  }
  const porVendedor = Object.values(porVendedorMapa).sort((a, b) => b.valor - a.valor);

  return {
    /* Vence nos próximos 7 dias: quantidade, valor e quantos são de quem JÁ
       está devendo -- esse cruzamento é o que vira ligação preventiva. */
    aVencer: {
      lista: aVencer,
      qtd: aVencer.length,
      valor: aVencer.reduce((s2, r) => s2 + (r.valor || 0), 0),
      deQuemJaDeve: aVencer.filter((r) => r.jaDeve).length,
      valorDeQuemJaDeve: aVencer.filter((r) => r.jaDeve).reduce((s2, r) => s2 + (r.valor || 0), 0),
    },
    // Inclui as antigas (marcadas com `antiga`); a tela as esconde por padrao.
    titulos: todosAtrasados,
    qtdAtivos: atrasados.length,
    // Quanto ficou de fora dos numeros -- a tela avisa, para o dinheiro nunca
    // sumir em silencio.
    antigas: {
      qtd: listaAntigas.length,
      valor: soma(listaAntigas),
      corte,
      anos: [...new Set(listaAntigas.map((t) => (t.vencimento || "").slice(0, 4)))].sort(),
    },
    porVendedor,
    kpis: {
      totalAtrasado,
      qtd: atrasados.length,
      pendentesQtd: pendentes.length,
      pendentesValor: soma(pendentes),
      reincidentesQtd: reincidentes.length,
      reincidentesValor: soma(reincidentes),
      dso,
      dsoMeta: config.parametros.dsoMeta,
      dsoAlerta: config.parametros.dsoAlerta,
      dsoTendencia,
      maiorAtrasoDias: maior?.dias || 0,
      maiorAtrasoCliente: maior?.cliente || "",
    },
    porOrigem,
    resumoOrigem,
    porMotivo,
    idade,
    frentes,
    cobrarHoje,
    dsoHistorico,
  };
}

function soma(arr) {
  return arr.reduce((s, r) => s + r.valor, 0);
}

function faixasIdade(atrasados, limites) {
  const lim = [...limites].sort((a, b) => a - b);
  const buckets = [];
  let anterior = 0;
  for (const l of lim) {
    buckets.push({ de: anterior + (anterior === 0 ? 0 : 1), ate: l });
    anterior = l;
  }
  buckets.push({ de: anterior + 1, ate: Infinity });
  return buckets.map((b, i) => {
    const de = i === 0 ? 1 : b.de;
    const itens = atrasados.filter((r) => r.dias >= de && r.dias <= b.ate);
    const faixa = b.ate === Infinity ? `${b.de}+ dias` : `${de} a ${b.ate} dias`;
    return {
      faixa,
      de, // limites expostos para a faixa virar filtro clicavel na tela
      ate: b.ate,
      valor: soma(itens),
      qtd: itens.length,
      alto: i >= 2, // faixas mais altas em vermelho
    };
  });
}

function montarFrentes(atrasados, config) {
  const nomesUnicos = (arr) => [...new Set(arr.map((r) => r.cliente))];
  const s = (arr) => soma(arr);
  const diasEscala = config.parametros.diasEscala || 10;

  const internos = atrasados.filter((r) => r.grupo === "interna");
  const cronicos = atrasados.filter((r) => r.reincidente && r.grupo === "cliente");
  const semResposta = atrasados.filter((r) => r.tag === "semContato" && r.dias > diasEscala);
  const esquecimento = atrasados.filter((r) => r.tag === "esquecimento");

  return [
    {
      chave: "interna",
      titulo: "Destrave o que é seu",
      descricao: "Atrasos causados por falha interna. Resolva antes de cobrar o cliente.",
      soma: s(internos),
      qtd: internos.length,
      prazo: "48 horas",
      clientes: nomesUnicos(internos),
      nota: "Cada dia parado aqui e responsabilidade da casa. Priorize a entrega ou a correcao.",
    },
    {
      chave: "cronicos",
      titulo: "Renegocie os cronicos",
      descricao: "Reincidentes com causa no cliente. Proponha acordo e formalize.",
      soma: s(cronicos),
      qtd: cronicos.length,
      prazo: "esta semana",
      clientes: nomesUnicos(cronicos),
      nota: "Clientes que repetem o atraso pedem parcelamento com data e registro do acordo.",
    },
    {
      chave: "sem-resposta",
      titulo: "Escale os sem resposta",
      descricao: `Sem contato ha mais de ${diasEscala} dias. Suba o nível da cobrança.`,
      soma: s(semResposta),
      qtd: semResposta.length,
      prazo: "hoje",
      clientes: nomesUnicos(semResposta),
      nota: "Ligue, mande e-mail formal e avise que a proxima etapa e a cobranca juridica.",
    },
    {
      chave: "esquecimento",
      titulo: "Deixe a régua trabalhar",
      descricao: "Esquecimento simples. Um lembrete automático resolve.",
      soma: s(esquecimento),
      qtd: esquecimento.length,
      prazo: "automatico",
      clientes: nomesUnicos(esquecimento),
      nota: "Dispare o lembrete padrao por WhatsApp e acompanhe a baixa.",
    },
  ];
}
