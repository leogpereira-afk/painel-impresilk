// O funil de fechamento: o que fazer HOJE para cada cliente, e o placar do mes.
//
// A pergunta que este arquivo responde mudou. Antes era "quanto esta na mesa e
// por que perdemos" -- um relatorio. Agora e "para quem eu ligo agora, e o que
// eu prometi a ele" -- uma fila de trabalho. O relatorio continua existindo,
// mas atras de um acordeao.
//
// POR QUE O EIXO E A PROMESSA, E NAO A ETAPA DE VENDA
// O ERP so tem tres situacoes (aberto, ganho, perdido) e duas sao terminais.
// Inventar etapas ("negociando", "proposta revisada") exigiria alguem alimentar
// a mao todo dia; a coleção ov_orc do painel tinha UM registro em oito meses --
// ninguem alimenta nada. Entao o unico eixo honesto e o que o proprio sistema
// consegue observar: eu chamei? eu prometi voltar? a promessa venceu?
//
// E o eixo certo pelo dado: os dois maiores motivos de perda da casa sao
// "Cliente nao deu retorno" (R$ 3,7 mi) e "Compra futura" (R$ 3,5 mi). Nenhum
// dos dois e preco. Os dois se resolvem com agenda.
//
// MEMBRESIA EM BALDE E FATO BINARIO, NUNCA RELOGIO. "Parado ha N dias" contava
// desde o CADASTRO do orcamento (nao desde o ultimo toque), entao um orcamento
// revisado ontem aparecia parado ha 90 dias e furava a fila. Um fato -- tem
// data marcada ou nao tem -- nao envelhece errado.

import { diaLocalISO, diasEntre, ymdLocal } from "../format.js";

// Chave estavel para agrupar um motivo que veio como texto livre do ERP.
const chaveTexto = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/* O nome do vendedor E o id (o Mubisys nao manda codigo). Entao "Barbara
   Vasconcelos" e "Barbara  Vasconcelos" -- com dois espacos -- viravam duas
   pessoas na lista, cada uma com metade da fila. */
export const canonVend = (s) => String(s || "").replace(/\s+/g, " ").trim();

/* dataFechamento e dataAtualizacao NAO passam por String() no normalizador do
   cache: podem chegar null, numero ou texto do ERP. diaLocalISO com lixo
   devolve lixo, e lixo comparado com data vira balde errado, calado. */
const diaSeguro = (v) => {
  if (v == null) return "";
  const d = diaLocalISO(String(v));
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
};

export const somaDias = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return ymdLocal(d);
};

/* Os seis baldes, em ordem fixa de urgencia. A ordem E a prioridade: o cliente
   herda o balde mais urgente entre os orcamentos dele, e a fila sai nessa
   ordem. Nao ha chip, nao ha filtro de balde -- eles sao cabecalhos dentro da
   propria lista, entao ninguem precisa escolher para trabalhar. */
export const BALDES = [
  { id: "chamado-sem-passo", nome: "Você chamou e não marcou o retorno", tom: "bad" },
  { id: "prometido-atrasado", nome: "Retorno prometido e não cumprido", tom: "bad" },
  { id: "prometido-hoje", nome: "Prometido para hoje", tom: "warn" },
  { id: "vencido", nome: "Orçamento vencido", tom: "bad" },
  { id: "compra-futura", nome: "Compra futura sem data marcada", tom: "warn" },
  { id: "sem-proxima-acao", nome: "Sem próxima ação marcada", tom: "neutral" },
];
const ORDEM_BALDE = Object.fromEntries(BALDES.map((b, i) => [b.id, i]));

/* "Compra futura" nao e perda: e um cliente que pediu para voltar depois. Vale
   R$ 3,5 milhoes na base e volta so com alguem lembrando de ligar.
   Aceita o id manual TAMBEM: sem isso, dar baixa pela propria tela (que grava
   motivoPerdaId) apagava o balde -- a tela comia o que ela mesma criou. */
export const ehCompraFutura = (item) =>
  item?.motivoPerdaId === "compra-futura" ||
  chaveTexto(item?.motivoPerdaNome).includes("compra futura");

const soma = (lista, campo) => lista.reduce((s, o) => s + (Number(o[campo]) || 0), 0);

const dia = (iso) => {
  const [a, m, d] = String(iso || "").split("-");
  return d ? `${d}/${m}` : "";
};

/* O SELO DA LINHA: uma frase curta e um tom, por orçamento.
   Regra do Geist que a casa adota: UM selo por linha. Se a linha precisa de
   dois, é sinal de que falta uma coluna -- não de que cabe mais um selo.
   Primeira regra que casar vence, e a ordem é a da urgência. */
export function estadoDe(o) {
  if (o.situacao === "ganho") return { chave: "ganho", rotulo: "Ganho", tom: "ok" };
  if (o.recall) return { chave: "recall", rotulo: "Compra futura", tom: "warn" };
  if (o.situacao === "perdido") {
    return { chave: "perdido", rotulo: o.motivoPerdaNome || "Perdido", tom: "bad" };
  }
  if (o.toqueAtrasado) return { chave: "atrasado", rotulo: `Prometido ${dia(o.proximoToque)}`, tom: "bad" };
  if (o.toqueHoje) return { chave: "hoje", rotulo: "Prometido hoje", tom: "warn" };
  if (o.adiado) return { chave: "agendado", rotulo: `Volta ${dia(o.proximoToque)}`, tom: "brand" };
  if (o.chamadoEm) return { chave: "chamado", rotulo: `Chamado ${dia(o.chamadoEm)}`, tom: "bad" };
  if (o.vencido) return { chave: "vencido", rotulo: `Vencido há ${Math.abs(o.diasParaVencer)} d`, tom: "bad" };
  return { chave: "sem", rotulo: "Sem retorno", tom: "neutral" };
}

export function calcOrcamentos(orcamentos, overrides, config, opcoes = {}) {
  const p = config.parametros || {};
  const minimo = p.valorMinimoOrcamento || 0;
  const corte = p.dataCorteOrcamentos || "";
  const diasParado = p.diasParado || 7;
  const lista0 = orcamentos || [];
  const ovs = overrides || {};

  // "Hoje" vem de fora: a tela fica aberta o dia inteiro e recalcula o dia ao
  // voltar para a aba. Congelado aqui, a promessa de hoje viraria "atrasada" so
  // depois de um F5.
  const hojeISO = opcoes.hoje || ymdLocal(new Date());

  const nomeVend = (id) =>
    (config.vendedores || []).find((v) => v.id === id)?.nome ||
    (id && id !== "sem" ? id : "Sem vendedor");
  const nomeMotivo = (id) =>
    (config.motivosPerda || []).find((m) => m.id === id)?.nome || "Nao informado";

  /* AS TRES RAZOES DE UM ORCAMENTO NAO ESTAR NA TELA, contadas antes do filtro.
     Sem isto a tela some com dinheiro em silencio e ninguem entende por que o
     orcamento que a pessoa acabou de fazer nao aparece. */
  const excluidos = { semData: 0, antesDoCorte: 0, abaixoDoMinimo: 0, valorAbaixoDoMinimo: 0 };
  for (const o of lista0) {
    const d = diaSeguro(o.dataEnvio);
    if (!d) {
      excluidos.semData += 1;
      continue;
    }
    if (corte && d < corte) {
      excluidos.antesDoCorte += 1;
      continue;
    }
    if ((o.valor || 0) < minimo) {
      excluidos.abaixoDoMinimo += 1;
      excluidos.valorAbaixoDoMinimo += o.valor || 0;
    }
  }

  const filtrados = lista0
    .filter((o) => {
      const d = diaSeguro(o.dataEnvio);
      return !!d && (o.valor || 0) >= minimo && (!corte || d >= corte);
    })
    .map((o) => {
      const ov = ovs[o.id] || {};
      const envio = diaSeguro(o.dataEnvio);
      const dias = diasEntre(envio, hojeISO);

      // Baixa manual: a direcao registra o desfecho de um orcamento que o ERP
      // deixou "em aberto" para sempre. O override sobrepoe o Mubisys.
      const baixaManual = ov.situacao === "ganho" || ov.situacao === "perdido";
      const situacao = baixaManual ? ov.situacao : o.situacao;

      // O motivo padrao e o que o VENDEDOR ja escreveu no ERP -- ele preenche
      // em praticamente 100% dos casos. A marcacao da direcao sobrepoe.
      const motivoTexto = ov.motivoPerdaId ? nomeMotivo(ov.motivoPerdaId) : o.motivoErp || "";
      const motivoChave = ov.motivoPerdaId || (o.motivoErp ? chaveTexto(o.motivoErp) : "sem");

      // Validade: o ERP so preenche em ~30% dos orcamentos abertos. Sem ela nao
      // da para dizer que venceu -- e "sem validade" nunca pode virar "vencido".
      const temValidade = Number(o.validade) > 0;
      const diasParaVencer = temValidade ? Number(o.validade) - dias : null;
      const vencido = situacao === "aberto" && temValidade && diasParaVencer < 0;

      const proximoToque = ov.proximoToque || null;
      const chamadoEm = ov.chamadoEm || null;
      const margem = Number(o.margem) || 0;

      const item = {
        ...o,
        situacao,
        situacaoErp: o.situacao,
        baixaManual,
        dataBaixa: baixaManual ? ov.dataBaixa || null : null,
        vendedorId: canonVend(o.vendedorId),
        vendedorNome: nomeVend(canonVend(o.vendedorId)),
        motivoPerdaId: ov.motivoPerdaId || null,
        motivoPerdaNome: motivoTexto || null,
        motivoChave,
        motivoManual: !!ov.motivoPerdaId,
        margem,
        semMargem: !(margem > 0),
        dias,
        envio,
        // `parado` continua saindo (Configuracoes ainda tem o parametro), mas
        // NENHUM balde o usa: ele contava desde o cadastro, nao desde o toque.
        parado: situacao === "aberto" && dias > diasParado,
        temValidade,
        diasParaVencer,
        vencido,
        proximoToque,
        nota: ov.nota || "",
        chamadoEm,
        compromissoId: ov.compromissoId || null,
        adiado: !!proximoToque && proximoToque > hojeISO,
        toqueAtrasado: !!proximoToque && proximoToque < hojeISO,
        toqueHoje: !!proximoToque && proximoToque === hojeISO,
        // O ERP mexeu no registro depois do cadastro? E informacao de ficha, e
        // so isso: nao ordena, nao classifica, nao some com ninguem.
        mexidoNoErpEm: (() => {
          const a = diaSeguro(o.dataAtualizacao);
          return a && a > envio ? a : null;
        })(),
        fechadoEm:
          baixaManual && ov.dataBaixa
            ? ov.dataBaixa
            : o.situacao !== "aberto"
              ? diaSeguro(o.dataFechamento)
              : "",
      };
      item.recall = item.situacao === "perdido" && ehCompraFutura(item);
      item.balde = baldeDe(item);
      item.estado = estadoDe(item);
      return item;
    });

  /* O BALDE, primeira regra que casar vence.
     `adiado` sai da fila e vai para a Agenda -- mas depois de "chamado sem
     passo" e das promessas, senao uma data marcada esconderia o fato de que a
     pessoa chamou e nao anotou nada. */
  function baldeDe(i) {
    const naBase = i.situacao === "aberto" || i.recall;
    if (!naBase) return null;
    if (i.chamadoEm && !i.proximoToque) return "chamado-sem-passo";
    if (i.toqueAtrasado) return "prometido-atrasado";
    if (i.toqueHoje) return "prometido-hoje";
    if (i.adiado) return null; // tem data no futuro: mora na Agenda
    if (i.situacao === "aberto" && i.vencido) return "vencido";
    if (i.recall) return "compra-futura";
    return "sem-proxima-acao";
  }

  // ------------------------------------------------------------ escopo
  /* O vendedor escolhido corta ORCAMENTOS, antes de agrupar. Cortar grupos
     depois deixaria um cliente atendido por duas pessoas com valor errado. */
  const escopo = canonVend(opcoes.vendedor);
  const doEscopo = escopo ? filtrados.filter((o) => o.vendedorId === escopo) : filtrados;

  /* Os vendedores que a tela oferece nascem dos ORCAMENTOS, nunca de
     config.vendedores e nunca filtrados por config.vendedoresOcultos. A lixeira
     "Retirar Fulano" escondia a vendedora da tabela E tornava a fila dela
     inalcancavel pelos chips -- sem botao de desfazer em lugar nenhum. */
  /* A contagem do chip e do que esta ABERTO, nao do ano inteiro. Com o ano,
     "Barbara 315" aparecia ao lado de "56 abertos" e o numero nao batia com
     nada que a lista mostrasse. */
  const mapaBase = new Map();
  for (const o of filtrados) {
    if (!o.vendedorId) continue;
    const linha = mapaBase.get(o.vendedorId) || { id: o.vendedorId, nome: o.vendedorNome, qtd: 0, total: 0 };
    linha.total += 1;
    if (o.situacao === "aberto") linha.qtd += 1;
    mapaBase.set(o.vendedorId, linha);
  }
  const vendedoresDaBase = [...mapaBase.values()].sort((a, b) => b.qtd - a.qtd || b.total - a.total);

  const ganhos = doEscopo.filter((o) => o.situacao === "ganho");
  const perdidos = doEscopo.filter((o) => o.situacao === "perdido");
  const abertos = doEscopo.filter((o) => o.situacao === "aberto");
  const fechadosQtd = ganhos.length + perdidos.length;
  const conversao = fechadosQtd ? Math.round((ganhos.length / fechadosQtd) * 100) : 0;

  // ------------------------------------------------------------ ordem do dinheiro
  /* Margem manda na ordem -- faturamento gordo com margem fina nao vale a
     ligacao que um menor e mais rentavel vale. Mas ~15% dos orcamentos vem com
     margem 0 do ERP, e ordenar por margem afundaria todos eles no fim da fila.
     Entao quem nao tem margem entra pela taxa MEDIA da casa.
     Isto e criterio de ORDEM, nunca numero publicado: toda soma que aparece na
     tela usa margem real, e o cartao de quem nao tem escreve "sem margem". */
  const comMargem = doEscopo.filter((o) => o.margem > 0);
  const valorComMargem = soma(comMargem, "valor");
  const taxaMargem = valorComMargem > 0 ? soma(comMargem, "margem") / valorComMargem : 0;
  const dinheiroOrdem = (o) =>
    o.margem > 0 ? o.margem : taxaMargem > 0 ? o.valor * taxaMargem : o.valor;

  // ------------------------------------------------------------ agrupar por empresa
  /* Quatro orcamentos da Prefeitura sao UMA ligacao. A chave e a empresa, sem o
     vendedor: se dois vendedores atendem a mesma empresa, quem liga precisa
     saber disso antes de ligar, nao depois.
     O normalizador do cache usa "Cliente" como texto de preenchimento quando o
     ERP nao manda nome -- agrupar por ele juntaria empresas diferentes num
     cartao so. Nesse caso cada orcamento vira o proprio grupo. */
  const chaveEmpresa = (o) => {
    if (o.clienteId) return `c:${o.clienteId}`;
    const n = chaveTexto(o.cliente);
    if (!n || n === "cliente") return `o:${o.id}`;
    return `n:${n}`;
  };

  function agrupar(itens) {
    const grupos = new Map();
    for (const o of itens) {
      const chave = chaveEmpresa(o);
      let g = grupos.get(chave);
      if (!g) {
        g = {
          chave,
          cliente: o.cliente,
          clienteId: o.clienteId || "",
          agrupadoPorNome: chave.startsWith("n:"),
          vendedores: [],
          ids: [],
          itens: [],
          qtd: 0,
          valor: 0,
          margem: 0,
          margemAberta: 0,
          margemRecall: 0,
          dinheiro: 0,
          semMargemQtd: 0,
          balde: null,
          diasUltimoEnvio: Infinity,
          proximoToque: null,
          nota: "",
          compromissoId: null,
          chamadoEm: null,
          celular: "",
          contatoNome: "",
          email: "",
        };
        grupos.set(chave, g);
      }
      g.qtd += 1;
      g.ids.push(o.id);
      g.itens.push(o);
      g.valor += o.valor || 0;
      g.margem += o.margem;
      if (o.situacao === "aberto") g.margemAberta += o.margem;
      if (o.recall) g.margemRecall += o.margem;
      g.dinheiro += dinheiroOrdem(o);
      if (o.semMargem) g.semMargemQtd += 1;
      if (!g.vendedores.includes(o.vendedorNome)) g.vendedores.push(o.vendedorNome);
      // O relogio da empresa e o envio MAIS RECENTE: com o mais antigo, um
      // orcamento novo devolveria a empresa ao topo no dia seguinte a ligacao.
      if (o.dias < g.diasUltimoEnvio) g.diasUltimoEnvio = o.dias;
      if (o.balde != null && (g.balde == null || ORDEM_BALDE[o.balde] < ORDEM_BALDE[g.balde])) {
        g.balde = o.balde;
      }
      if (o.proximoToque && (!g.proximoToque || o.proximoToque < g.proximoToque)) {
        g.proximoToque = o.proximoToque;
      }
      if (o.chamadoEm && (!g.chamadoEm || o.chamadoEm > g.chamadoEm)) g.chamadoEm = o.chamadoEm;
      if (!g.compromissoId && o.compromissoId) g.compromissoId = o.compromissoId;
      if (o.nota) g.nota = o.nota;
      if (!g.celular && o.celular) g.celular = o.celular;
      if (!g.contatoNome && o.contatoNome) g.contatoNome = o.contatoNome;
      if (!g.email && o.email) g.email = o.email;
    }
    for (const g of grupos.values()) {
      g.vendedores.sort();
      g.itens.sort((a, b) => b.valor - a.valor);
      if (!Number.isFinite(g.diasUltimoEnvio)) g.diasUltimoEnvio = 0;
      // O item que manda no texto do cartao: o do balde mais urgente.
      g.item = g.itens.find((i) => i.balde === g.balde) || g.itens[0];
      g.diasParaVencer = g.item?.diasParaVencer ?? null;
    }
    return [...grupos.values()];
  }

  // ------------------------------------------------------------ a fila
  const naFila = doEscopo.filter((o) => o.balde != null);
  const grupos = agrupar(naFila).sort(
    (a, b) =>
      ORDEM_BALDE[a.balde] - ORDEM_BALDE[b.balde] ||
      b.dinheiro - a.dinheiro ||
      b.valor - a.valor ||
      String(a.cliente).localeCompare(String(b.cliente))
  );

  const porBalde = {};
  for (const b of BALDES) porBalde[b.id] = grupos.filter((g) => g.balde === b.id).length;

  // ------------------------------------------------------------ agenda
  const agenda = agrupar(doEscopo.filter((o) => o.adiado)).sort(
    (a, b) =>
      String(a.proximoToque).localeCompare(String(b.proximoToque)) || b.dinheiro - a.dinheiro
  );

  // ------------------------------------------------------------ fechados na semana
  const seteDias = somaDias(hojeISO, -7);
  const fechados = doEscopo
    .filter((o) => o.fechadoEm && o.fechadoEm >= seteDias && o.fechadoEm <= hojeISO)
    .sort((a, b) => String(b.fechadoEm).localeCompare(String(a.fechadoEm)));

  // ------------------------------------------------------------ cobertura e honestidade
  const naMesa = agrupar(abertos);
  const comData = naMesa.filter((g) => g.proximoToque);
  const semPasso = abertos.filter((o) => !o.proximoToque);
  const cobertura = {
    clientesNaMesa: naMesa.length,
    clientesComData: comData.length,
    pct: naMesa.length ? Math.round((comData.length / naMesa.length) * 100) : 0,
    abertosSemValidade: abertos.filter((o) => !o.temValidade).length,
    perdidosSemMotivo: perdidos.filter((o) => !o.motivoPerdaNome).length,
    filaSemMargem: naFila.filter((o) => o.semMargem).length,
    // O normalizador do cache manda para "ganho" todo status que ele nao
    // conhece (netlify/functions/mubi-cache-background.mjs). Ganho sem data de
    // aprovacao e o sintoma disso -- se este numero crescer, a conversao esta
    // inflada e o normalizador precisa de conserto.
    ganhosSemFechamento: ganhos.filter((o) => !o.fechadoEm).length,
    semPassoQtd: semPasso.length,
    semPassoValor: soma(semPasso, "valor"),
  };

  // ------------------------------------------------------------ por vendedor (placar)
  /* Sempre o TIME INTEIRO, sobre `filtrados`: o ranking existe para comparar.
     O escopo escolhido nao encolhe o ranking -- ele so muda a fila. */
  const linhaV = (id, nome) => ({
    vendedorId: id,
    nome,
    qtd: 0,
    valor: 0,
    ganhos: 0,
    perdidos: 0,
    conversao: 0,
    margemGanha: 0,
    margemPerdida: 0,
    semRetorno: 0,
    naMesa: 0,
    semPasso: 0,
  });
  const mapV = {};
  for (const o of filtrados) {
    const row = mapV[o.vendedorId] || (mapV[o.vendedorId] = linhaV(o.vendedorId, o.vendedorNome));
    row.qtd += 1;
    row.valor += o.valor || 0;
    if (o.situacao === "ganho") {
      row.ganhos += 1;
      row.margemGanha += o.margem;
    }
    if (o.situacao === "perdido") {
      row.perdidos += 1;
      row.margemPerdida += o.margem;
      // "Sem retorno" pelo texto do ERP OU pelo motivo manual equivalente: a
      // regra so por palavra ignorava tudo que a direcao classificou a mao.
      if (o.motivoPerdaId === "sem-retorno" || chaveTexto(o.motivoPerdaNome).includes("retorno")) {
        row.semRetorno += 1;
      }
    }
    if (o.situacao === "aberto") {
      row.naMesa += 1;
      if (!o.proximoToque) row.semPasso += 1;
    }
  }
  const porVendedor = Object.values(mapV)
    .map((r) => ({
      ...r,
      conversao: r.ganhos + r.perdidos ? Math.round((r.ganhos / (r.ganhos + r.perdidos)) * 100) : 0,
    }))
    .sort((a, b) => b.margemGanha - a.margemGanha || b.valor - a.valor);

  // ------------------------------------------------------------ por que perdemos
  const mapM = {};
  for (const o of perdidos) {
    const k = o.motivoChave;
    if (!mapM[k]) {
      mapM[k] = {
        motivoId: o.motivoPerdaId,
        chave: k,
        nome: o.motivoPerdaNome || "Não informado",
        valor: 0,
        qtd: 0,
        margem: 0,
      };
    }
    mapM[k].valor += o.valor || 0;
    mapM[k].qtd += 1;
    mapM[k].margem += o.margem;
  }
  const porMotivoPerda = Object.values(mapM).sort((a, b) => b.valor - a.valor);

  const recall = doEscopo.filter((o) => o.recall);

  /* A MESA é o que a tela abre: os orçamentos ABERTOS, um por linha. Não é a
     fila por baldes (que escondia a lista dentro de cabeçalhos) nem o arquivo
     inteiro. Compra futura entra por filtro, nunca por padrão -- ela é dinheiro
     que o ERP já deu por perdido. */
  const mesa = abertos;
  /* OS QUATRO NUMEROS SAO CONJUNTOS SEPARADOS. Com "sem retorno" contando
     tambem os vencidos, ele dava 56 ao lado de "na mesa 56" -- dois numeros
     iguais, um deles inutil. Quem esta atrasado ja tem lugar no seu proprio
     numero; "sem retorno" e o que ainda nao virou divida. */
  const ehAtrasado = (o) => o.toqueAtrasado || o.vencido || (o.chamadoEm && !o.proximoToque);
  const atrasados = abertos.filter(ehAtrasado);
  const semRetorno = abertos.filter((o) => !o.proximoToque && !o.chamadoEm && !ehAtrasado(o));

  return {
    // Lista mestra do escopo escolhido: alimenta a aba Histórico.
    lista: doEscopo,
    mesa,
    recorte: {
      mesa: { qtd: mesa.length, valor: soma(mesa, "valor"), margem: soma(mesa, "margem") },
      atrasados: { qtd: atrasados.length, valor: soma(atrasados, "valor") },
      semRetorno: { qtd: semRetorno.length, valor: soma(semRetorno, "valor") },
      recall: { qtd: recall.length, valor: soma(recall, "valor"), margem: soma(recall, "margem") },
    },
    kpis: {
      naMesaQtd: abertos.length,
      naMesaValor: soma(abertos, "valor"),
      conversao,
      valorPerdido: soma(perdidos, "valor"),
      ganhosValor: soma(ganhos, "valor"),
      ganhosQtd: ganhos.length,
      perdidosQtd: perdidos.length,
      totalQtd: doEscopo.length,
      margemEmRisco: soma(abertos, "margem"),
      margemGanha: soma(ganhos, "margem"),
      margemPerdida: soma(perdidos, "margem"),
      ticketGanho: ganhos.length ? soma(ganhos, "valor") / ganhos.length : 0,
      vencidosQtd: abertos.filter((o) => o.vencido).length,
      recallQtd: recall.length,
      recallValor: soma(recall, "valor"),
    },
    fila: {
      grupos,
      kpis: {
        clientes: grupos.length,
        orcamentos: naFila.length,
        valor: soma(naFila, "valor"),
        // Os dois dinheiros NUNCA se somam: o que o ERP ja deu por perdido nao
        // esta "em jogo", esta a recuperar. Somar inflaria a mesa em milhoes.
        margemAberta: soma(naFila.filter((o) => o.situacao === "aberto"), "margem"),
        margemRecall: soma(naFila.filter((o) => o.recall), "margem"),
        porBalde,
      },
    },
    agenda,
    fechados,
    cobertura,
    excluidos,
    vendedoresDaBase,
    porVendedor,
    porMotivoPerda,
    motivoLider: porMotivoPerda[0] || null,
  };
}
