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
// vendedor sao de OS de 2025 -- o cache so guarda o ano corrente. Por isso a
// tela mostra "nao localizado" em vez de mentir um nome.
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

  // Reincidencia por CNPJ (mesmo cliente pode aparecer com grafias diferentes;
  // o CNPJ e a chave estavel). Cai para o nome se nao houver CNPJ.
  const vencidosPorCliente = {};
  const abertos = recebiveis.map((r) => {
    const dias = diasEntre(r.vencimento, hojeISO);
    const chaveCliente = r.cnpj || r.cliente;
    if (dias > 0) vencidosPorCliente[chaveCliente] = (vencidosPorCliente[chaveCliente] || 0) + 1;
    return { ...r, dias, chaveCliente };
  });

  const atrasados = abertos
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
        dias: r.dias,
        emissao: r.emissao,
        vencimento: r.vencimento,
        motivoId: ov.motivoId || null,
        motivoNome: motivo?.nome || "Sem motivo",
        grupo: motivo?.grupo || null,
        grupoNome: motivo ? grupoNome(motivo.grupo) : "Sem classificacao",
        tag: motivo?.tag || null,
        cobrado: !!ov.cobrado,
        observacao: ov.observacao || "",
        reincidente: (vencidosPorCliente[r.chaveCliente] || 0) > 1,
        proximaAcao: proximaAcao(ov.motivoId, r.dias, config),
      };
    })
    .sort((a, b) => b.valor - a.valor);

  const totalAtrasado = soma(atrasados);
  const pendentes = atrasados.filter((r) => !r.cobrado);
  const reincidentes = atrasados.filter((r) => r.reincidente);

  // DSO (prazo medio de recebimento): media dos dias desde a emissao dos abertos,
  // ponderada por valor. Valor atual e REAL; a tendencia so aparece quando ha
  // historico real com pelo menos dois pontos.
  const totValorAberto = abertos.reduce((s, r) => s + r.valor, 0) || 1;
  const dso = Math.round(
    abertos.reduce((s, r) => s + r.valor * diasEntre(r.emissao, hojeISO), 0) /
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
    porOrigem.push({ grupo: "sem", nome: "Sem classificacao", valor: semClass, pct: naoClassPct });
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
    titulos: atrasados,
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
      titulo: "Destrave o que e seu",
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
      descricao: `Sem contato ha mais de ${diasEscala} dias. Suba o nivel da cobranca.`,
      soma: s(semResposta),
      qtd: semResposta.length,
      prazo: "hoje",
      clientes: nomesUnicos(semResposta),
      nota: "Ligue, mande e-mail formal e avise que a proxima etapa e a cobranca juridica.",
    },
    {
      chave: "esquecimento",
      titulo: "Deixe a regua trabalhar",
      descricao: "Esquecimento simples. Um lembrete automatico resolve.",
      soma: s(esquecimento),
      qtd: esquecimento.length,
      prazo: "automatico",
      clientes: nomesUnicos(esquecimento),
      nota: "Dispare o lembrete padrao por WhatsApp e acompanhe a baixa.",
    },
  ];
}
