// ============================================================================
// agenda-pcp — as REGRAS DE LEITURA da agenda da producao, portadas do PCP.
//
// O PCP (instalacao/operacao.js) e dono destas regras: que dias uma O.S. ocupa,
// qual o status dela, quando ela foi encerrada pelo ERP. O Painel precisa das
// MESMAS respostas para desenhar o calendario e a programacao -- e a tentacao
// e reimplementar no componente React. Nao: regra copiada em dois lugares sai
// de sincronia em silencio, e o jeito de perceber e alguem reclamar que "o
// calendario do painel mostra um dia diferente do PCP".
//
// Por isso a copia e UMA SO, e fica aqui, no servidor: a tela recebe a O.S. ja
// com `dias` e `status` calculados e so pinta. Se o PCP mudar a regra, muda
// aqui -- um arquivo, nao doze componentes.
//
// ORIGEM DE CADA FUNCAO (para conferir quando o PCP mudar):
//   dia, somarDias, interno, equipe, duracao, prazo, agendaCompleta, status,
//   diasAgenda, encerradaERP .... instalacao/operacao.js
//   diasCasa ................... instalacao/casa.js:29-34
//   ordemHora, rotuloHora ...... instalacao/app.js, funcoes `ordemHora` e `rotuloHora`
//   rotuloStatus ............... instalacao/app.js, `STATUS_LABEL`, `STATUS_LABEL_INT`
//                                e `statusLabelDe`
//
// OS PONTEIROS SAO POR NOME, nao por numero de linha. A primeira versao deste
// arquivo citava "app.js:3392-3405" e ja estava errado quando foi escrito: o
// recorte comecava no meio de outra funcao e deixava a `rotuloHora` INTEIRA de
// fora -- justamente a que carrega a regra sutil de nao mostrar hora fora de
// "Horário". Numero de linha de arquivo de OUTRO repositorio envelhece entre um
// commit e o proximo; `grep -n "^function ordemHora" instalacao/app.js` acha
// sempre.
//
// O QUE ESTE ARQUIVO NUNCA FAZ: gravar. Ele nao importa cliente de banco --
// e so aritmetica de data e leitura de campo.
// ============================================================================

/* O dia de uma data, no calendario de Sao Paulo.
   O PCP roda no navegador do Leo, que esta em Sao Paulo, e faz a conta no fuso
   local. Esta function roda em Deno, que esta em UTC -- e as 21h de Sao Paulo
   ja sao o dia seguinte em UTC. Sem fixar o fuso, uma O.S. finalizada as 22h
   apareceria num dia no PCP e noutro no Painel. */
const FUSO = "America/Sao_Paulo";
const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dia(valor: unknown): string {
  if (!valor) return "";
  if (valor instanceof Date) return Number.isFinite(+valor) ? fmtDia.format(valor) : "";
  const s = String(valor);
  /* Data pura ("2026-09-14") ja E o dia: converter para Date e voltar so
     arriscaria deslocar por fuso. A conferencia extra existe para recusar
     "2026-02-31", que o Date aceita e vira 03/03. */
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T12:00:00Z");
    return Number.isFinite(+d) && d.toISOString().slice(0, 10) === s ? s : "";
  }
  const d = new Date(s);
  return Number.isFinite(+d) ? fmtDia.format(d) : "";
}

export function somarDias(iso: string, n: number): string {
  if (!dia(iso)) return "";
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** O dia de hoje em Sao Paulo -- nao em UTC, nao no fuso de quem chamou. */
export const hojeSP = (): string => fmtDia.format(new Date());

type OS = Record<string, any>;

export const interno = (o: OS) => o?.tipo === "interno";

export const equipe = (o: OS): string[] =>
  [...new Set((Array.isArray(o?.equipe) ? o.equipe : []).map((n: unknown) => String(n).trim()).filter(Boolean))];

/* Teto de 366 porque duracao corrompida (um campo de texto que virou 99999)
   geraria uma lista de dias que trava a tela. O PCP tem o mesmo teto. */
export const duracao = (o: OS) =>
  Math.min(366, Math.max(1, Math.floor(Number(o?.instalacao?.duracaoDias) || 1)));

/** Em instalacao de varios dias, a conclusao prevista e o ULTIMO dia. */
export const prazo = (o: OS): string =>
  dia(o?.instalacao?.data)
    ? somarDias(dia(o.instalacao.data), interno(o) ? 0 : duracao(o) - 1)
    : dia(o?.previsaoEntrega);

export function agendaCompleta(o: OS): boolean {
  const i = o?.instalacao || {};
  return !!(
    dia(i.data) && i.periodo && equipe(o).length &&
    (i.periodo !== "Horário" || /^([01]\d|2[0-3]):[0-5]\d$/.test(i.hora || ""))
  );
}

export function status(o: OS): string {
  if (o?.finalizadaEm) return "finalizada";
  if (!o?.liberadoPCP) return "aguardando_producao";
  if (interno(o) || !agendaCompleta(o)) return "apto";
  if (o.confirmacao !== "Confirmado") return "agendada";
  return o.horaSaida ? "em_andamento" : "confirmada";
}

/** Os dias que a O.S. ocupa na AGENDA (vazio para O.S. interna ou sem data). */
export function diasAgenda(o: OS): string[] {
  if (interno(o) || !dia(o?.instalacao?.data)) return [];
  const dur = duracao(o);
  return Array.from({ length: dur }, (_, i) => somarDias(dia(o.instalacao.data), i));
}

/* A O.S. foi encerrada pelo ERP (baixa automatica) e nao por uma pessoa?
   O marcador fica como historico depois de reabertura -- por isso a conferencia
   e de igualdade com finalizadaEm, e nao a mera existencia do marcador. */
export function encerradaERP(o: OS): boolean {
  if (!o?.finalizadaEm) return false;
  return !!(o.baixaAutoERP?.em === o.finalizadaEm || /^Mubisys\b/i.test(o.finalizadoPor || ""));
}

/* A regra da CASA (instalacao/casa.js:29-34): o dia que a producao ja tem na
   O.S. -- a agenda completa quando existe, senao o prazo, senao a data marcada,
   senao a previsao de entrega. E por isso que a retirada, que nao tem agenda,
   ainda assim aparece no calendario. */
export function diasCasa(o: OS): string[] {
  const ag = diasAgenda(o);
  if (ag.length) return ag;
  const d = prazo(o) || dia(o?.instalacao?.data) || dia(o?.previsaoEntrega);
  return d ? [d] : [];
}

/* A HORA E O ROTULO DA HORA (instalacao/app.js, `ordemHora` e `rotuloHora`).
   A regra que importa: a hora SO vale quando o periodo e "Horário". O campo
   `instalacao.hora` nao e limpo quando o periodo muda -- o importador de PDF do
   ERP grava hora="14:00" junto com periodo="Tarde", e o formulario rapido do
   PCP grava a "Hora de saida" qualquer que seja o periodo. Quem mostrar essa
   hora solta afirma um horario que a producao nunca assumiu. */
export const rotuloHora = (o: OS): string => {
  const i = o?.instalacao || {};
  if (i.periodo === "Horário" && i.hora) return String(i.hora);
  return String(i.periodo || "—");
};

/** Ordena dentro do dia: Dia inteiro < Manha < Tarde; "Horário" usa a hora. */
export const ordemHora = (o: OS): string => {
  const i = o?.instalacao || {};
  if (i.periodo === "Horário" && i.hora) return String(i.hora);
  if (i.periodo === "Manhã") return "08:00";
  if (i.periodo === "Tarde") return "13:00";
  if (i.periodo === "Dia inteiro") return "00:00";
  return "23:59";
};

/* O ROTULO DO STATUS (instalacao/app.js, `statusLabelDe` e os dois mapas).
   Cliente retira fala outra lingua: para O.S. INTERNA, "Apto" vira "Pronto p/
   retirada" e "Finalizada" vira "Retirado". Sem isto, quem olha o Painel ve
   "Apto · equipe a definir · veiculo a definir" numa retirada de balcao e
   conclui que falta escalar gente e carro para um servico que ninguem vai
   fazer. O status interno e o mesmo; muda so o que se le. */
const ROTULO_STATUS: Record<string, string> = {
  aguardando_producao: "Aguardando produção",
  apto: "Apto",
  agendada: "Agendada",
  confirmada: "Confirmada",
  em_andamento: "Em andamento",
  finalizada: "Finalizada",
};
const ROTULO_STATUS_INTERNO: Record<string, string> = {
  aguardando_producao: "Aguardando produção",
  apto: "Pronto p/ retirada",
  finalizada: "Retirado",
};
export function rotuloStatus(o: OS, st: string): string {
  if (st === "finalizada" && encerradaERP(o)) return "Encerrada no ERP";
  if (interno(o) && ROTULO_STATUS_INTERNO[st]) return ROTULO_STATUS_INTERNO[st];
  return ROTULO_STATUS[st] || st;
}

/* ============================================================================
   A PROJECAO -- o que sai desta porta, campo a campo.
   ============================================================================
   LISTA FECHADA, e por isso ela existe: o registro da O.S. no pcp_registros e
   um jsonb com TUDO (valor, itens com subtotal, CNPJ/CPF, WhatsApp do cliente,
   contato, fotos, historico). Devolver `registro` inteiro e filtrar na tela
   seria abrir tudo isso para quem sabe abrir o inspetor do navegador -- e a
   tela de visualizacao existe justamente para ser aberta a mais gente.
   Campo novo no PCP NAO passa a sair daqui sozinho: tem de ser escrito nesta
   funcao, de proposito.

   O QUE FICA DE FORA, com o motivo:
   - valorTotal, itens[].subtotal, valor ... dinheiro (ver painel-agenda)
   - cnpjCpf, whatsapp, contato, telefone .... dado de contato do cliente
   - fotos, fotosRetornoIds ................. anexos
   - historico, observacoes ................. texto livre, sem regra de leitura
*/
export interface OSAgenda {
  id: string;
  numero: string;
  cliente: string;
  servico: string;
  endereco: string;
  data: string;
  rotuloHora: string;
  ordemHora: string;
  duracaoDias: number;
  equipe: string[];
  veiculo: string;
  dias: string[];
  status: string;
  rotuloStatus: string;
  interno: boolean;
  finalizada: boolean;
}

const texto = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

export function projetarOS(o: OS): OSAgenda {
  const i = o?.instalacao || {};
  const st = status(o);
  return {
    /* A IDENTIDADE e o `id` do registro, nao o numero. O numero nasce VAZIO
       (o PCP cria a O.S. antes de o ERP emitir o numero), e duas O.S. novas no
       mesmo dia dariam a mesma chave de lista no React -- duas linhas
       reconciliadas contra o mesmo elemento, uma podendo exibir o conteudo da
       outra. O id e um uuid e existe desde a criacao. */
    id: texto(o?.id, 60),
    numero: texto(o?.numero, 40),
    cliente: texto(o?.cliente, 160),
    servico: texto(o?.servico, 240),
    endereco: texto(o?.endereco, 240),
    data: dia(i.data),
    /* A hora vai PRONTA, nao crua: `instalacao.hora` guarda lixo quando o
       periodo nao e "Horário" (ver rotuloHora acima), e mandar o campo cru
       convidaria a proxima tela a mostra-lo de novo. */
    rotuloHora: rotuloHora(o),
    ordemHora: ordemHora(o),
    duracaoDias: duracao(o),
    equipe: equipe(o).slice(0, 30).map((n) => texto(n, 80)),
    veiculo: texto(o?.veiculo, 80),
    dias: diasCasa(o),
    status: st,
    rotuloStatus: rotuloStatus(o, st),
    // Retirada de balcao: a tela nao pede equipe nem veiculo para ela.
    interno: interno(o),
    finalizada: !!o?.finalizadaEm,
  };
}
