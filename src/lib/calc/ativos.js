// Regras de vencimento de documentos, veiculos e maquinas.
//
// O valor do modulo nao e guardar o papel: e AVISAR ANTES. Uma CND vence e a
// empresa perde a licitacao; o alvara vence e o fiscal fecha; a revisao passa e
// a maquina para no meio da producao. Entao tudo aqui gira em torno de "quantos
// dias faltam" e "o que faco primeiro".

import { diasEntre } from "../format.js";

export const TIPOS = {
  documento: { rotulo: "Documentos", singular: "Documento" },
  veiculo: { rotulo: "Veiculos", singular: "Veiculo" },
  maquina: { rotulo: "Maquinas", singular: "Maquina" },
};

// Categorias sugeridas -- os documentos que sempre pedem, e as manutencoes que
// sempre esquecem. Sao sugestoes: o campo aceita texto livre.
export const CATEGORIAS = {
  documento: [
    "Cartao CNPJ",
    "Contrato social",
    "Alvara de funcionamento",
    "Alvara do corpo de bombeiros",
    "CND Federal",
    "CND Estadual",
    "CND Municipal",
    "CRF do FGTS",
    "Certidao trabalhista",
    "Comprovante de endereco",
    "Inscricao estadual",
    "Licenca ambiental",
    "Apolice de seguro",
  ],
  veiculo: [
    "IPVA",
    "Licenciamento",
    "Seguro",
    "Troca de oleo",
    "Revisao",
    "Pneus",
    "Tacografo",
  ],
  maquina: [
    "Manutencao preventiva",
    "Calibracao",
    "Contrato de assistencia",
    "Troca de peca",
    "Seguro",
  ],
};

// Situacao pelo que vence PRIMEIRO: data ou medidor (km/horas).
// Faixas: vencido | vence em ate 30 dias | ate 90 | em dia | sem controle.
export function situacao(item, hojeISO, alertaDias = 30) {
  const porData = item.validade ? diasEntre(hojeISO, item.validade) : null;

  // Medidor: quanto falta para a proxima manutencao (km ou horas).
  const faltaMedidor =
    item.medidorProximo > 0 ? item.medidorProximo - (item.medidorAtual || 0) : null;

  if (porData == null && faltaMedidor == null) {
    return { nivel: "sem", rotulo: "Sem controle", dias: null, falta: null };
  }

  // Vencido ganha de tudo.
  if ((porData != null && porData < 0) || (faltaMedidor != null && faltaMedidor < 0)) {
    return {
      nivel: "vencido",
      rotulo: porData != null && porData < 0 ? `Vencido ha ${Math.abs(porData)} dias` : "Medidor passou",
      dias: porData,
      falta: faltaMedidor,
    };
  }

  const perto = porData != null && porData <= alertaDias;
  const pertoMedidor = faltaMedidor != null && faltaMedidor <= (item.medidorProximo || 0) * 0.1;
  if (perto || pertoMedidor) {
    return {
      nivel: "urgente",
      rotulo: perto ? (porData === 0 ? "Vence hoje" : `Vence em ${porData} dias`) : "Manutencao proxima",
      dias: porData,
      falta: faltaMedidor,
    };
  }

  if (porData != null && porData <= alertaDias * 3) {
    return { nivel: "atencao", rotulo: `Vence em ${porData} dias`, dias: porData, falta: faltaMedidor };
  }

  return {
    nivel: "ok",
    rotulo: porData != null ? `Vence em ${porData} dias` : "Em dia",
    dias: porData,
    falta: faltaMedidor,
  };
}

const PESO = { vencido: 0, urgente: 1, atencao: 2, ok: 3, sem: 4 };

export function calcAtivos(itens, hojeISO, alertaDias = 30) {
  const lista = (itens || []).map((it) => ({ ...it, sit: situacao(it, hojeISO, alertaDias) }));
  // Pior primeiro: quem abre a tela precisa ver o que ja venceu, nao o que esta
  // tranquilo.
  lista.sort((a, b) => {
    const p = PESO[a.sit.nivel] - PESO[b.sit.nivel];
    if (p !== 0) return p;
    return (a.sit.dias ?? 9e9) - (b.sit.dias ?? 9e9);
  });

  const contar = (nivel) => lista.filter((x) => x.sit.nivel === nivel).length;
  const porTipo = {};
  for (const t of Object.keys(TIPOS)) {
    const doTipo = lista.filter((x) => x.tipo === t);
    porTipo[t] = {
      total: doTipo.length,
      vencidos: doTipo.filter((x) => x.sit.nivel === "vencido").length,
      urgentes: doTipo.filter((x) => x.sit.nivel === "urgente").length,
    };
  }

  return {
    lista,
    kpis: {
      total: lista.length,
      vencidos: contar("vencido"),
      urgentes: contar("urgente"),
      atencao: contar("atencao"),
      semControle: contar("sem"),
    },
    porTipo,
    // Os que exigem acao agora -- e o que a Home mostra.
    criticos: lista.filter((x) => x.sit.nivel === "vencido" || x.sit.nivel === "urgente"),
  };
}
