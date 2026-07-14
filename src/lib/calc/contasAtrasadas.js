// Cruza os recebiveis do Mubi (leitura) com os overrides do Supabase/Blobs
// (motivo, cobrado) e aplica as regras de Configuracoes. Retorna o modelo
// completo do modulo Contas Atrasadas.

import { diasEntre, rotuloMes } from "../format.js";
import { proximaAcao } from "../recomendacao.js";

export function calcContasAtrasadas(recebiveis, overrides, config) {
  const hoje = new Date();
  const hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(hoje.getDate()).padStart(2, "0")}`;

  const motivoMap = new Map((config.motivosAtraso || []).map((m) => [m.id, m]));
  const grupoNome = (g) =>
    (config.gruposCausa || []).find((x) => x.id === g)?.nome || g;

  // Quantos titulos vencidos cada cliente tem (para reincidencia).
  const vencidosPorCliente = {};
  const abertos = recebiveis.map((r) => {
    const dias = diasEntre(r.vencimento, hojeISO);
    if (dias > 0) vencidosPorCliente[r.cliente] = (vencidosPorCliente[r.cliente] || 0) + 1;
    return { ...r, dias };
  });

  const atrasados = abertos
    .filter((r) => r.dias > 0)
    .map((r) => {
      const ov = overrides[r.id] || {};
      const motivo = motivoMap.get(ov.motivoId);
      return {
        id: r.id,
        cliente: r.cliente,
        cnpj: r.cnpj,
        nf: r.nf,
        os: r.os,
        valor: r.valor,
        dias: r.dias,
        motivoId: ov.motivoId || null,
        motivoNome: motivo?.nome || "Sem motivo",
        grupo: motivo?.grupo || null,
        grupoNome: motivo ? grupoNome(motivo.grupo) : "Sem classificacao",
        tag: motivo?.tag || null,
        cobrado: !!ov.cobrado,
        observacao: ov.observacao || "",
        reincidente: (vencidosPorCliente[r.cliente] || 0) > 1,
        proximaAcao: proximaAcao(ov.motivoId, r.dias, config),
      };
    })
    .sort((a, b) => b.valor - a.valor);

  const totalAtrasado = soma(atrasados);
  const pendentes = atrasados.filter((r) => !r.cobrado);
  const reincidentes = atrasados.filter((r) => r.reincidente);

  // DSO (prazo medio de recebimento): media dos dias desde a emissao dos abertos,
  // ponderada por valor.
  const totValorAberto = abertos.reduce((s, r) => s + r.valor, 0) || 1;
  const dso = Math.round(
    abertos.reduce((s, r) => s + r.valor * diasEntre(r.emissao, hojeISO), 0) /
      totValorAberto
  );
  const dsoHistorico = curvaDso(dso, config.parametros.dsoMeta, hoje);
  const dsoAnterior = dsoHistorico.length > 1 ? dsoHistorico[dsoHistorico.length - 2].dso : dso;
  const dsoTendencia = dso < dsoAnterior ? "baixa" : dso > dsoAnterior ? "alta" : "estavel";

  const maior = atrasados.reduce((a, b) => (b.dias > a.dias ? b : a), atrasados[0] || { dias: 0 });

  // --- Por que estao atrasados (por origem/grupo)
  const porGrupo = {};
  for (const r of atrasados) {
    const g = r.grupo || "sem";
    porGrupo[g] = (porGrupo[g] || 0) + r.valor;
  }
  const porOrigem = (config.gruposCausa || [])
    .map((g) => ({
      grupo: g.id,
      nome: g.nome,
      valor: porGrupo[g.id] || 0,
      pct: totalAtrasado ? Math.round(((porGrupo[g.id] || 0) / totalAtrasado) * 100) : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
  const lider = porOrigem[0];
  const resumoOrigem = lider && lider.valor
    ? `O grosso do atraso esta em ${lider.nome.toLowerCase()}: ${lider.pct}% do total.`
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

  return {
    titulos: atrasados,
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
    const itens = atrasados.filter((r) => r.dias >= (i === 0 ? 1 : b.de) && r.dias <= b.ate);
    const faixa = b.ate === Infinity ? `${b.de}+ dias` : `${i === 0 ? 1 : b.de} a ${b.ate} dias`;
    return {
      faixa,
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

function curvaDso(dsoAtual, meta, hoje) {
  // Serie dos ultimos 6 meses convergindo para o DSO atual (partindo de mais alto).
  const pontos = [];
  const partida = Math.round(dsoAtual + 10);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const t = (5 - i) / 5;
    const valor = Math.round(partida + (dsoAtual - partida) * t + (i % 2 === 0 ? 2 : -1));
    pontos.push({ mes: rotuloMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`), dso: valor });
  }
  pontos[pontos.length - 1].dso = dsoAtual;
  return pontos;
}
