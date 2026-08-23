/* CAMPANHAS: quanto vendemos para um evento, e quem comprou.
 *
 * Mesma base da permuta -- escolher clientes, aceitar O.S. uma a uma -- porque
 * é o mesmo trabalho: separar, dentro da carteira, o que pertence àquilo. O que
 * muda é a PERGUNTA.
 *
 *   A permuta pergunta  "quanto ainda sobra do crédito do parceiro"
 *   A campanha pergunta "quanto vendemos para este evento, e quem comprou"
 *
 * Por isso não há crédito nem saldo aqui. O número é o FATURAMENTO, e a leitura
 * é por comprador: numa eleição são vinte candidaturas, cada uma com o seu
 * CNPJ, e o que se quer saber é quanto cada uma comprou.
 *
 * A escolha continua sendo um ATO, nunca uma regra. Seria tentador dizer "toda
 * O.S. com 'eleição' no nome do cliente é da campanha" -- e aí a primeira
 * gráfica chamada "Eleição Papelaria" entraria sozinha, e ninguém perceberia.
 * Deduzir pelo nome já criou sósia na Central de Acessos.
 */

import {
  chaveCliente, valorDaOS, linhasDaPermuta, linhasPorCliente, linhasDosLancamentos,
} from "./permutas.js";

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

export { chaveCliente, valorDaOS };

/** A ficha de uma O.S. dentro da campanha -- a mesma da permuta. */
export { fichaDaOS } from "./permutas.js";

/* O RESUMO DE UMA CAMPANHA.
 *
 * `linhasDaPermuta` é reaproveitada inteira: ela já sabe congelar o valor no
 * aceite, conferir contra o ERP a cada carga, avisar quando mudou e distinguir
 * "a O.S. sumiu" de "não deu para conferir". Essas regras não são da permuta --
 * são de qualquer lista de O.S. escolhida à mão, e a campanha é uma delas.
 */
export function resumoDaCampanha(campanha, ordens) {
  const linhas = linhasDaPermuta(campanha, ordens);
  const vendidoOS = Math.round(linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100;
  const porCliente = linhasPorCliente(linhas, campanha?.clientes || []);

  /* VENDA SEM O.S.: o que foi da campanha mas não virou ordem de serviço --
     uma entrega acertada por fora, um faturamento em outro CNPJ nosso. Sem
     este lugar, a pessoa "conserta" o total inventando uma O.S. que não
     existe, e aí a lista de O.S. deixa de bater com o ERP.

     Só somam (`tipo` não é usado aqui): numa campanha não há o que abater --
     o que não foi vendido simplesmente não entra. */
  const vendasSemOS = linhasDosLancamentos(campanha);
  const semOS = Math.round(vendasSemOS.reduce((s, l) => s + l.valor, 0) * 100) / 100;
  const vendido = Math.round((vendidoOS + semOS) * 100) / 100;

  /* A META é opcional e só entra na conta quando existe. Sem ela a tela não
     mostra percentual nenhum -- fingir 0% num evento sem meta seria inventar
     uma cobrança que ninguém fez. */
  const meta = Math.round(num(campanha?.meta) * 100) / 100;

  return {
    linhas,
    porCliente,
    vendasSemOS,
    semOS,
    vendidoOS,
    vendido,
    meta,
    // Quantos compradores DE VERDADE: cliente ligado que não comprou nada não
    // conta, senão "12 compradores" incluiria quem só foi pesquisado.
    compradores: porCliente.length,
    // Quanto o maior comprador representa. É o número que responde "esta
    // campanha é um cliente só ou é um mercado".
    /* A fatia é sobre o que passou por O.S., NÃO sobre o total: a venda sem
       O.S. não pertence a comprador nenhum, e somá-la ao denominador
       encolheria a fatia de todos por causa de um valor sem dono. */
    maiorFatia: vendidoOS > 0 && porCliente.length ? porCliente[0].valor / vendidoOS : null,
    pct: meta > 0 ? vendido / meta : null,
    falta: meta > 0 ? Math.round((meta - vendido) * 100) / 100 : null,
    // Os mesmos avisos da permuta: divergência não se esconde.
    mudaram: linhas.filter((l) => l.mudou).length,
    sumiram: linhas.filter((l) => l.sumiu).length,
    semConferir: linhas.some((l) => l.semConferir),
  };
}

/* Todas as campanhas com o seu resumo, para a lista de abertura.
   As do ANO CORRENTE primeiro, depois as mais recentes: uma eleição de 2022 não
   pode empurrar para baixo a que está acontecendo. */
export function resumoGeralCampanhas(campanhas, ordens, anoHoje) {
  return Object.entries(campanhas || {})
    .map(([id, c]) => ({ id, ...c, ...resumoDaCampanha(c, ordens) }))
    .sort((a, b) => {
      if (!!a.encerrada !== !!b.encerrada) return a.encerrada ? 1 : -1;
      const aAno = String(a.ano || "");
      const bAno = String(b.ano || "");
      const aAtual = aAno === String(anoHoje);
      const bAtual = bAno === String(anoHoje);
      if (aAtual !== bAtual) return aAtual ? -1 : 1;
      return bAno.localeCompare(aAno) || b.vendido - a.vendido;
    });
}

/* totaisDasCampanhas MORREU AQUI (23/08). Era a versão pré-seletor-de-ano de
   totaisDoAno, sem os dois controles que a viva ganhou (semAno e repetidas) --
   a cópia que alguém um dia chamaria por engano e reintroduziria o total
   inflado. O teste antigo dela migrou para totaisDoAno. */

/* O RANKING DE COMPRADORES de uma campanha, ou de várias somadas.
   É o "quem comprou quanto" que a campanha existe para responder. */
export function compradoresDaCampanha(resumos) {
  const mapa = new Map();
  for (const r of resumos || []) {
    for (const c of r.porCliente || []) {
      const g = mapa.get(c.chave) || { chave: c.chave, cliente: c.cliente, cnpj: c.cnpj, qtd: 0, valor: 0 };
      g.qtd += c.qtd;
      g.valor += c.valor;
      if (!g.cnpj) g.cnpj = c.cnpj;
      mapa.set(c.chave, g);
    }
  }
  return [...mapa.values()]
    .map((g) => ({ ...g, valor: Math.round(g.valor * 100) / 100 }))
    .sort((a, b) => b.valor - a.valor);
}

/* O EXTRATO DE PAPEL de uma campanha.
 *
 * A tela é dividida por tarefa (ligar cliente, escolher O.S.); o papel é
 * dividido pela PERGUNTA: quem comprou quanto, e o que foi. Por isso aqui o
 * ranking vem antes da lista de O.S. -- numa eleição com vinte candidaturas, o
 * que se leva para a reunião é o ranking; a lista é a prova dele.
 */
export function extratoDaCampanha(campanha, ordens) {
  const r = resumoDaCampanha(campanha, ordens);
  return {
    ...r,
    // As O.S. em ordem de DATA para o papel (na tela vão por cliente): quem
    // confere um extrato percorre o calendário, não o cadastro.
    porData: [...r.linhas].sort((a, b) => String(a.data).localeCompare(String(b.data))),
  };
}

/* ------------------------------------------------------------ COMPARAR ANOS

   "Geralmente conseguimos comparar e selecionar por anos" -- e no ramo dele o
   ano não é uma linha do tempo contínua: eleição é de dois em dois anos, festa
   da cidade é anual, e há anos sem campanha nenhuma.

   SÃO DUAS PERGUNTAS DIFERENTES, e o arquivo responde as duas em lugares
   separados de propósito:

   1. `comparativoPorAno` compara TOTAL DE ANO com TOTAL DE ANO -- tudo o que
      se vendeu em campanha em 2026 contra tudo o que se vendeu em 2025. Ele
      pula apenas o ano que não teve campanha NENHUMA (senão a linha seria uma
      queda de 100% contra o nada). Ele NÃO sabe de evento: se 2025 só teve a
      festa da cidade e 2026 teve a eleição, a linha compara festa com eleição,
      e é isso mesmo que um total de ano é.

   2. `edicoesDoMesmoEvento` compara O MESMO EVENTO entre anos -- a eleição de
      2026 contra a de 2022. É esta que responde "cresceu?".

   Escrevi aqui, na primeira versão, que "NADA usa ano - 1" e que a comparação
   era "sempre contra a edição anterior". Era falso: bastava existir a festa da
   cidade em 2025 para o ano-1 voltar inteiro, e a tela mostrava "+2150% vs
   2025" ao lado do faturamento -- eleição contra festa. O teste que eu tinha
   escrito só montava anos VAZIOS no meio, ou seja, só o caso em que o código
   acerta. Cada uma das duas perguntas agora tem o seu nome na tela e um teste
   que consegue reprovar.
*/

/* Os anos que têm campanha, do mais ANTIGO para o mais novo.
   Tempo se lê para a frente: numa sequência de anos, começar pelo mais recente
   obriga quem lê a inverter a linha do tempo na cabeça para ver se cresceu.
   Vale para os chips, para o quadro ano a ano e para as edições. */
export function anosDasCampanhas(lista) {
  const conta = new Map();
  for (const c of lista || []) {
    const ano = String(c.ano || "").trim();
    if (!/^\d{4}$/.test(ano)) continue;
    conta.set(ano, (conta.get(ano) || 0) + 1);
  }
  return [...conta.entries()]
    .map(([ano, quantas]) => ({ ano, quantas }))
    .sort((a, b) => a.ano.localeCompare(b.ano));
}

/* Os números de UM ano, ou de todos.
   `ano` vazio (ou "todos") junta tudo -- é o modo de olhar a história inteira.
   Campanha SEM ano preenchido cai fora de qualquer recorte por ano, e a tela
   precisa dizer isso: some sem aviso e o total do recorte não fecha com o
   total geral, e ninguém descobre por quê. */
export function totaisDoAno(lista, ano) {
  const cem = (n) => Math.round(n * 100) / 100;
  const todos = !ano || ano === "todos";
  /* Compara APARADO dos dois lados. `anosDasCampanhas` já apara para montar os
     chips; comparar cru aqui fazia o chip contar "2026 (2)" e o cartão somar só
     uma, quando um registro chegava com "2026 " (restauração de backup ou
     correção direta na tabela). Dois filtros com réguas diferentes sobre o
     mesmo campo é sempre um número que não fecha. */
  const oAno = String(ano ?? "").trim();
  const dentro = todos ? (lista || []) : (lista || []).filter((c) => String(c.ano || "").trim() === oAno);
  const semAno = (lista || []).filter((c) => !/^\d{4}$/.test(String(c.ano || "").trim())).length;

  /* A MESMA O.S. EM DUAS CAMPANHAS INFLA O ANO -- e este total é a soma das
     campanhas, então ela entraria duas vezes sem nada aparecer.
     A tela BLOQUEIA marcar uma O.S. que já está em outra campanha, mas o
     bloqueio só age na hora de marcar: duas abas marcando ao mesmo tempo
     passam pelas duas, e dado antigo nunca passou por bloqueio nenhum.
     Por isso o controle mora AQUI, e ele consegue falhar: compara a soma das
     campanhas com a soma das O.S. DISTINTAS -- dois números que saem de
     caminhos diferentes. Comparar um total consigo mesmo já me fez "provar"
     que o desconto estava aplicado quando não estava. */
  const vistas = new Set();
  let repetidas = 0;
  let valorRepetido = 0;
  for (const c of dentro) {
    for (const l of c.linhas || []) {
      const k = String(l.id);
      if (vistas.has(k)) { repetidas += 1; valorRepetido += l.valor; } else vistas.add(k);
    }
  }

  return {
    ano: todos ? "todos" : oAno,
    quantas: dentro.length,
    vendido: cem(dentro.reduce((s, c) => s + c.vendido, 0)),
    // Compradores DISTINTOS: o mesmo candidato em duas campanhas do ano conta
    // uma vez. Somar os de cada campanha inflaria o número.
    compradores: new Set(dentro.flatMap((c) => c.porCliente.map((p) => p.chave))).size,
    os: dentro.reduce((s, c) => s + c.linhas.length, 0),
    // Quantas O.S. entraram em mais de uma campanha do recorte, e quanto isso
    // está somando a mais. Zero é o normal; diferente de zero é dado para
    // consertar, e a tela diz.
    repetidas,
    valorRepetido: cem(valorRepetido),
    semOS: cem(dentro.reduce((s, c) => s + (c.semOS || 0), 0)),
    /* Campanha sem ano vale nos DOIS modos, e por motivos diferentes:
       - num ano escolhido, ela não aparece e a pessoa a procura;
       - em "todos", ela ENTRA neste total mas fica de fora do quadro ano a ano,
         e aí a soma das linhas não fecha com o número grande.
       Eu zerava isto em "todos" justamente onde a divergência aparece. */
    semAno,
  };
}

/* A TABELA DE COMPARAÇÃO: uma linha por ano, da mais ANTIGA para a mais nova,
   com a variação contra o ANO ANTERIOR QUE TEVE CAMPANHA (a linha de CIMA).
   Ano sem campanha nenhuma é pulado; ano com campanha de outro evento NÃO é --
   ver o cabeçalho da seção. É comparação de total de ano, e a tela diz isso
   com estas palavras.

   `variacao` é null na linha mais antiga -- não há contra o que comparar, e
   escrever 0% ali seria afirmar estabilidade que ninguém mediu. */
export function comparativoPorAno(lista) {
  const anos = anosDasCampanhas(lista).map((a) => a.ano);
  const linhas = anos.map((ano) => ({ ...totaisDoAno(lista, ano) }));
  return linhas.map((l, i) => {
    /* Ascendente: a edição anterior é a de ÍNDICE MENOR. Virar a ordem sem
       virar isto compararia cada ano com o SEGUINTE -- o sinal de toda
       variação inverteria e nenhum erro apareceria. */
    const antes = linhas[i - 1] || null;
    return {
      ...l,
      anoAnterior: antes ? antes.ano : null,
      vendidoAnterior: antes ? antes.vendido : null,
      diferenca: antes ? Math.round((l.vendido - antes.vendido) * 100) / 100 : null,
      // Divisão por zero vira null, não Infinity: uma edição anterior que
      // vendeu R$ 0 não tem percentual de crescimento, tem um valor novo.
      variacao: antes && antes.vendido > 0 ? (l.vendido - antes.vendido) / antes.vendido : null,
    };
  });
}

/* AS OUTRAS EDIÇÕES DO MESMO EVENTO.
 *
 * Casa pelo NOME normalizado, e isso é uma dedução -- o mesmo tipo que já criou
 * sósia na Central de Acessos. A diferença é o que se faz com ela: aqui ela só
 * MOSTRA uma comparação ao lado, ninguém é somado nem tem acesso concedido, e a
 * tela diz que o critério é o nome. Se o Leonardo escrever "Eleições 2022" num
 * ano e "Eleição Municipal" no outro, as duas não se encontram -- e é por isso
 * que a tela avisa o critério em vez de fingir que sabe.
 *
 * Nunca inclui a própria campanha, nem outra do MESMO ano: duas campanhas com o
 * mesmo nome no mesmo ano são um cadastro duplicado, não uma edição anterior.
 */
/* AS EDIÇÕES DE UM EVENTO: por VÍNCULO, e só depois por nome.
 *
 * A primeira versão casava só pelo nome -- dedução, do mesmo tipo que já criou
 * registro-sósia na Central de Acessos. Funciona enquanto ninguém renomeia, e
 * quebra calado quando alguém escreve "Eleição Municipal" num ano e "Eleições
 * 2022" no outro: a tela diz "primeira edição" e a comparação some.
 *
 * Criando a edição DE DENTRO da campanha (o botão "Outra edição"), as duas
 * passam a carregar o mesmo `evento`. Aí o vínculo é declarado, sobrevive a
 * renomear, e o nome vira só um segundo caminho -- para as que já existiam e
 * para as que forem cadastradas soltas com o mesmo nome.
 *
 * POR QUE UNION-FIND e não "casa se o evento OU o nome bate": as duas relações
 * juntas não são transitivas. Com A(evento X, "Eleição"), B(evento X, renomeada
 * para "Eleição Municipal") e C(sem evento, "Eleição"), a regra ingênua faz A
 * ver B e C, mas B ver só A -- abrir uma ou outra daria listas diferentes para
 * o mesmo evento, e ninguém descobriria por quê. Agrupar de verdade custa
 * quinze linhas e acaba com a classe inteira de dúvida.
 */
function gruposDeEvento(lista) {
  const pai = new Map();
  const achar = (x) => {
    while (pai.get(x) !== x) {
      pai.set(x, pai.get(pai.get(x)));
      x = pai.get(x);
    }
    return x;
  };
  const juntar = (a, b) => {
    if (!pai.has(a)) pai.set(a, a);
    if (!pai.has(b)) pai.set(b, b);
    const ra = achar(a);
    const rb = achar(b);
    if (ra !== rb) pai.set(ra, rb);
  };

  for (const c of lista || []) {
    const eu = `id:${c.id}`;
    if (!pai.has(eu)) pai.set(eu, eu);
    // Vínculo declarado (criado pelo botão "Outra edição").
    if (c.evento) juntar(eu, `ev:${c.evento}`);
    // Nome, para quem foi cadastrado solto. Campanha sem nome não junta nada:
    // senão todas as "Nova campanha" recém-criadas virariam um evento só.
    const nome = chaveCliente(c.nome || "");
    if (nome) juntar(eu, `nome:${nome}`);
  }
  return { achar, raiz: (c) => achar(`id:${c.id}`) };
}

/* As OUTRAS edições do mesmo evento, da mais ANTIGA para a mais nova.
 *
 * Nunca inclui a própria campanha, nem uma sem ano de 4 dígitos: sem ano ela
 * não pode ser "a edição anterior" de nada -- e era o que acontecia, a aberta
 * aparecia como "primeira edição" e a linha de cima dizia "vs " sem ano.
 * A do MESMO ano continua entrando: são duas de verdade, e cadastro duplicado
 * tem de ser visto (ver `anosRepetidos`), não escondido. */
export function edicoesDoMesmoEvento(lista, campanha) {
  const ano = String(campanha?.ano || "").trim();
  if (!/^\d{4}$/.test(ano)) return [];
  const g = gruposDeEvento([...(lista || []), campanha].filter(Boolean));
  const minha = g.raiz(campanha);
  return (lista || [])
    .filter((c) => {
      const a = String(c.ano || "").trim();
      return c.id !== campanha?.id && /^\d{4}$/.test(a) && a !== ano && g.raiz(c) === minha;
    })
    .sort((a, b) => String(a.ano || "").trim().localeCompare(String(b.ano || "").trim()));
}

/* TODAS AS CAMPANHAS DE UM GRUPO, incluindo ela mesma.
   Serve para VINCULAR: ao ligar B ao evento de A, não basta carimbar B -- se B
   já tinha um grupo (com C), carimbar só B arrancaria B de C e o vínculo
   antigo sumiria calado. Carimbam-se todos os membros. */
export function membrosDoEvento(lista, campanha) {
  const g = gruposDeEvento([...(lista || []), campanha].filter(Boolean));
  const minha = g.raiz(campanha);
  return (lista || []).filter((c) => g.raiz(c) === minha);
}

/* AS QUE AINDA PODEM SER VINCULADAS a este evento: as que já não estão nele.
   O ano entra no rótulo porque é assim que ele reconhece a edição -- na base
   real o nome carrega o ano ("Política 2026 - Deputados"), e é justamente por
   isso que elas não se acham sozinhas. */
export function candidatasAVincular(lista, campanha) {
  const dentro = new Set(membrosDoEvento(lista, campanha).map((c) => c.id));
  return (lista || [])
    .filter((c) => c.id !== campanha?.id && !dentro.has(c.id))
    .sort((a, b) => String(a.ano || "").localeCompare(String(b.ano || "")) || b.vendido - a.vendido);
}

/* A COMPARAÇÃO DE CADA CAMPANHA CONTRA A EDIÇÃO ANTERIOR DELA, para a lista.
 *
 * O cartão precisa responder "cresceu?" sem abrir. Calculado de uma vez para a
 * lista inteira: por cartão seria refazer o agrupamento N vezes.
 *
 * A anterior é a próxima de ano DIFERENTE -- com cadastro duplicado no mesmo
 * ano, a "anterior" seria a própria gêmea e o cartão diria "-33%" contra ela
 * mesma. */
export function comparativoDeEdicoes(lista) {
  const g = gruposDeEvento(lista || []);
  const porGrupo = new Map();
  for (const c of lista || []) {
    const k = g.raiz(c);
    if (!porGrupo.has(k)) porGrupo.set(k, []);
    porGrupo.get(k).push(c);
  }
  const saida = new Map();
  for (const membros of porGrupo.values()) {
    const comAno = membros
      .filter((c) => /^\d{4}$/.test(String(c.ano || "").trim()))
      .sort((a, b) => String(a.ano || "").trim().localeCompare(String(b.ano || "").trim()));
    comAno.forEach((c, i) => {
      /* Para TRÁS, e pulando o mesmo ano: com cadastro duplicado a "anterior"
         seria a própria gêmea, e o cartão diria "-33%" contra ela mesma. */
      const antes = [...comAno.slice(0, i)].reverse()
        .find((x) => String(x.ano || "").trim() !== String(c.ano || "").trim());
      saida.set(c.id, antes
        ? {
            anoAnterior: String(antes.ano || "").trim(),
            vendidoAnterior: antes.vendido,
            diferenca: Math.round((c.vendido - antes.vendido) * 100) / 100,
            // Zero não vira percentual: uma edição que vendeu R$ 0 não tem
            // crescimento, tem um valor novo.
            variacao: antes.vendido > 0 ? (c.vendido - antes.vendido) / antes.vendido : null,
            edicoes: comAno.length,
          }
        : null);
    });
  }
  return saida;
}

/* OS EVENTOS DA CASA, cada um com suas edições -- a visão da aba Análise.
 *
 * Agrupa pelo MESMO union-find das edições (vínculo declarado + nome) e devolve
 * um bloco por evento: o rótulo é o nome da edição mais recente (é o nome que a
 * pessoa reconhece hoje), as edições vêm do ano mais antigo para o mais novo, e
 * cada uma carrega a variação contra a anterior de ano DIFERENTE. Grupos
 * ordenados pelo total vendido: o evento que mais pesa abre a lista. */
export function eventosVinculados(lista) {
  const cem = (n) => Math.round(n * 100) / 100;
  const g = gruposDeEvento(lista || []);
  const porGrupo = new Map();
  for (const c of lista || []) {
    const k = g.raiz(c);
    if (!porGrupo.has(k)) porGrupo.set(k, []);
    porGrupo.get(k).push(c);
  }
  const eventos = [];
  for (const membros of porGrupo.values()) {
    const edicoes = [...membros].sort((a, b) =>
      String(a.ano || "").trim().localeCompare(String(b.ano || "").trim()));
    const comVariacao = edicoes.map((c, i) => {
      const antes = [...edicoes.slice(0, i)].reverse()
        .find((x) => String(x.ano || "").trim() !== String(c.ano || "").trim());
      return {
        id: c.id, nome: c.nome, ano: String(c.ano || "").trim(),
        vendido: c.vendido, compradores: c.compradores, os: c.linhas.length,
        encerrada: !!c.encerrada,
        anoAnterior: antes ? String(antes.ano || "").trim() : null,
        diferenca: antes ? cem(c.vendido - antes.vendido) : null,
        variacao: antes && antes.vendido > 0 ? (c.vendido - antes.vendido) / antes.vendido : null,
      };
    });
    const maisRecente = comVariacao[comVariacao.length - 1];
    eventos.push({
      rotulo: maisRecente?.nome || "sem nome",
      total: cem(comVariacao.reduce((s2, e) => s2 + e.vendido, 0)),
      edicoes: comVariacao,
    });
  }
  return eventos.sort((a, b) => b.total - a.total);
}

/* DUAS CAMPANHAS COM O MESMO NOME NO MESMO ANO são cadastro duplicado, não
   duas edições. `edicoesDoMesmoEvento` deixa as duas passarem quando o ano
   delas não é o da campanha aberta -- e aí a comparação encadeada compara uma
   gêmea com a outra e imprime "-33% vs 2022" contra ela mesma.
   Quem monta a cadeia precisa saber quais anos vieram repetidos para não
   comparar dentro do mesmo ano e para poder avisar. */
export function anosRepetidos(edicoes) {
  const conta = new Map();
  for (const e of edicoes || []) {
    const a = String(e.ano || "").trim();
    conta.set(a, (conta.get(a) || 0) + 1);
  }
  return [...conta.entries()].filter(([, n]) => n > 1).map(([a]) => a);
}

/* ------------------------------------------------- O QUE FOI VENDIDO, E QUANDO

   Três perguntas que o total não responde:
     quem comprou mais  ·  quando as compras aconteceram  ·  O QUE foi vendido
*/

/** O maior comprador da campanha, com a fatia dele. Null quando não há nenhum. */
export function maiorComprador(resumo) {
  const c = (resumo?.porCliente || [])[0];
  if (!c) return null;
  return {
    ...c,
    // Fatia sobre o que passou por O.S.: a venda sem O.S. não é de ninguém.
    fatia: resumo.vendidoOS > 0 ? c.valor / resumo.vendidoOS : null,
    // Quanto ele comprou a mais que o segundo -- é o que diz se a campanha se
    // apoia numa perna só. "R$ 35 mil" sozinho não responde isso.
    sobreOSegundo: (resumo.porCliente || [])[1]
      ? Math.round((c.valor - resumo.porCliente[1].valor) * 100) / 100
      : null,
  };
}

/* AS COMPRAS MÊS A MÊS.
   Uma campanha não vende parelho: a eleição concentra em agosto e setembro, a
   festa da cidade na semana dela. Ver a curva é o que diz QUANDO montar equipe
   na próxima -- e o total do evento, sozinho, esconde isso completamente.

   Meses sem venda NO MEIO entram com zero: sem eles, três compras em janeiro,
   abril e setembro desenham três barras coladas e a campanha parece contínua.
   Fora das pontas não se inventa nada. */
export function comprasPorMes(linhas) {
  const cem = (n) => Math.round(n * 100) / 100;
  const mapa = new Map();
  for (const l of linhas || []) {
    const mes = String(l.data || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) continue;
    const m = mapa.get(mes) || { mes, qtd: 0, valor: 0 };
    m.qtd += 1;
    m.valor += l.valor;
    mapa.set(mes, m);
  }
  if (!mapa.size) return [];
  const chaves = [...mapa.keys()].sort();
  const fim = chaves[chaves.length - 1];
  const saida = [];
  let atual = chaves[0];
  // Guarda de segurança: 600 meses são 50 anos. Data corrompida no cadastro não
  // pode virar um laço infinito na tela.
  for (let i = 0; atual <= fim && i < 600; i += 1) {
    saida.push(mapa.get(atual) || { mes: atual, qtd: 0, valor: 0 });
    const [a, m] = atual.split("-").map(Number);
    atual = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  }
  return saida.map((m) => ({ ...m, valor: cem(m.valor) }));
}

/** Nome de produto comparável: sem acento, sem caixa, sem espaço dobrado. */
export function chaveProduto(nome) {
  return String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/* O RANKING DOS PRODUTOS VENDIDOS na campanha.
 *
 * Sai dos ITENS das O.S. marcadas, não do cabeçalho -- é a diferença entre
 * saber QUANTO a eleição rendeu e saber que ela rendeu em placa de PVC.
 *
 * O QUE ELE DEVOLVE JUNTO, E POR QUÊ: um ranking vazio tem duas causas
 * opostas -- "essas O.S. não têm item" e "a carga ainda não gravou os itens
 * dessas O.S." -- e na tela as duas aparecem iguais. Sem a cobertura ao lado,
 * um ranking pela metade parece completo, e a direção decide o estoque da
 * próxima eleição com metade da venda invisível. Zero não é resultado.
 */
export function produtosDaCampanha(campanha, ordens) {
  const cem = (n) => Math.round(n * 100) / 100;
  const aceitas = Object.keys(campanha?.os || {}).map(String);
  const porId = new Map((ordens || []).map((o) => [String(o.id), o]));

  const cobertura = {
    aceitas: aceitas.length, comItens: 0, semItens: 0, foraDaBusca: 0,
    // Dentro do "fora da busca", QUAL é o motivo -- ver abaixo.
    semComprador: 0, compradores: [],
  };
  let brutoDasLidas = 0;
  /* QUAIS COMPRADORES A BUSCA REALMENTE ALCANÇOU.
   *
   * Não é a lista de ligados: é quem VOLTOU com O.S. A diferença entre as duas
   * é o defeito, e ele tem duas causas que a tela precisa saber juntar:
   *
   *   1. o comprador foi tirado da lista (as O.S. dele continuam no total, mas
   *      a busca é por cliente e não as alcança mais);
   *   2. O NOME DELE MUDOU NO ERP -- e este é o caso real que apareceu na
   *      campanha "Política 2026 - Deputados": o cadastro dizia "ELEICA 2026
   *      GILBERTO..." quando a campanha foi montada, alguém corrigiu para
   *      "ELEICAO 2026 GILBERTO...", e o vínculo virou órfão em silêncio. Ele
   *      continua na lista, com o nome velho, e não casa com nenhuma O.S.
   *
   * Comparar com a lista de ligados só pegaria a causa 1 -- e no caso real daria
   * ZERO, mandando procurar cancelamento e período onde não havia nada.
   * Órfão quase sempre é variante do mesmo nome: reconectar, nunca apagar. */
  const alcancados = new Set((ordens || []).map((o) => chaveCliente(o.cliente)));
  const semNome = new Set();
  const mapa = new Map();
  for (const id of aceitas) {
    const o = porId.get(id);
    if (!o) {
      cobertura.foraDaBusca += 1;
      /* A ficha congelada guarda quem comprou. Se a busca não trouxe NENHUMA
         O.S. desse comprador, o vínculo dele está quebrado -- e é isso que a
         tela tem de dizer, em vez de "cancelada ou fora do período". */
      const dono = chaveCliente((campanha?.os || {})[id]?.cliente || "");
      if (dono && !alcancados.has(dono)) {
        cobertura.semComprador += 1;
        if (!semNome.has(dono)) {
          semNome.add(dono);
          cobertura.compradores.push(String((campanha.os[id] || {}).cliente || dono));
        }
      }
      continue;
    }
    const itens = Array.isArray(o.itens) ? o.itens : [];
    if (!itens.length) { cobertura.semItens += 1; continue; }
    cobertura.comItens += 1;
    /* O BRUTO DO CABEÇALHO das mesmas O.S., para conferir contra a soma dos
       itens. São dois números de caminhos DIFERENTES -- um vem do topo da O.S.,
       o outro da lista de itens -- então a comparação consegue falhar. Comparar
       um total consigo mesmo já me fez "provar" que um desconto estava aplicado
       quando não estava. */
    brutoDasLidas += num(o.bruto ?? o.valorBruto ?? o.valor);
    for (const it of itens) {
      const nome = String(it?.produto ?? "").trim();
      if (!nome) continue;
      /* O GRÃO É produto + MODELO, e não o produto sozinho.
       *
       * No ERP o `produto` é a linha do catálogo -- "Material Político 2026" --
       * e o que foi vendido de verdade está no `modelo`: "Adesivo Perfurado
       * 60x33", "Bandeira 140X90", "Adesivo Parachoque 30x10". Agrupando só
       * pelo produto, a campanha inteira virava UMA linha de R$ 227 mil
       * chamada "Material Político 2026", que não diz o que estocar nem o que
       * cotar -- exatamente o que o ranking existe para responder.
       *
       * 99,3% dos itens da base têm modelo. Quando não tem, o produto sozinho
       * é o grão, e o rótulo cai para ele.
       *
       * A chave leva os DOIS: dois produtos podem ter modelo de mesmo nome, e
       * juntar "Placa / Lona 440g" com "Banner / Lona 440g" somaria coisas
       * diferentes. */
      const modelo = String(it?.modelo ?? "").trim();
      const k = `${chaveProduto(nome)}|${chaveProduto(modelo)}`;
      const g = mapa.get(k) || {
        chave: k, produto: nome, modelo,
        // O que a tela mostra em destaque: o modelo é o que foi comprado.
        rotulo: modelo || nome,
        categoria: String(it?.categoria ?? ""),
        quantidade: 0, valor: 0, os: new Set(),
      };
      g.quantidade += num(it?.quantidade);
      g.valor += num(it?.valorTotal);
      g.os.add(id);
      mapa.set(k, g);
    }
  }

  const itens = [...mapa.values()]
    .map((g) => ({ ...g, quantidade: cem(g.quantidade), valor: cem(g.valor), os: g.os.size }))
    .sort((a, b) => b.valor - a.valor);

  const total = cem(itens.reduce((s, i) => s + i.valor, 0));
  /* O QUE NÃO CHEGOU A PRODUTO NENHUM.
   *
   * Em 146 das 20.819 O.S. da base (0,7%) a soma dos itens dá MENOS que o
   * cabeçalho -- nunca mais. É a "união de itens" do Mubisys que vem sem
   * nenhum sub-item nomeado: o normalizador não tem a que produto atribuir o
   * valor e o descarta. No total são 0,21% do faturamento, mas numa O.S.
   * específica já chega a 61% dela.
   *
   * NÃO INVENTO UM PRODUTO "OUTROS" para o resto: foi exatamente um balde
   * "Outros" com 23% do faturamento que escondeu esse mesmo defeito por meses.
   * Um valor sem dono aparece como valor sem dono, e a tela diz quanto.
   */
  const naoAtribuido = Math.max(0, cem(brutoDasLidas - total));
  return {
    itens,
    cobertura,
    total,
    brutoDasLidas: cem(brutoDasLidas),
    naoAtribuido,
    // Fecha? Um centavo de folga para arredondamento do rateio das uniões.
    fecha: naoAtribuido <= 0.05,
    // A tela precisa saber se pode chamar isto de "os produtos da campanha" ou
    // se tem de dizer "dos que já foram lidos".
    completo: cobertura.semItens === 0 && cobertura.foraDaBusca === 0 && cobertura.comItens > 0
      && naoAtribuido <= 0.05,
  };
}

/* O ROLLUP para a linha do catálogo do ERP.
 *
 * O grão do ranking é produto + modelo. Esta visão junta os modelos sob o
 * produto -- útil para ver o peso da linha inteira ("Material Político 2026"
 * foi 94% da campanha), inútil para saber o que comprar.
 *
 * NÃO SOMA QUANTIDADE. Somar 6.300 adesivos com 1.010 bandeiras dá "192.778
 * un.", um número que não significa nada e que estava na tela. O que se conta
 * aqui é quantos ITENS diferentes a linha tem. */
export function porProduto(produtos) {
  const cem = (n) => Math.round(n * 100) / 100;
  const mapa = new Map();
  for (const p of produtos?.itens || []) {
    const g = mapa.get(p.produto) || {
      chave: p.produto, rotulo: p.produto, categoria: p.categoria,
      itens: 0, valor: 0, os: 0,
    };
    g.itens += 1;
    g.valor += p.valor;
    g.os = Math.max(g.os, p.os);
    if (!g.categoria) g.categoria = p.categoria;
    mapa.set(p.produto, g);
  }
  return [...mapa.values()]
    .map((g) => ({ ...g, valor: cem(g.valor) }))
    .sort((a, b) => b.valor - a.valor);
}

/* AS CATEGORIAS, dobrando o ranking de produtos.
   "Placa PVC 3mm" e "Placa PVC 5mm" são dois produtos e uma decisão só. */
export function categoriasDosProdutos(produtos) {
  const cem = (n) => Math.round(n * 100) / 100;
  const mapa = new Map();
  for (const p of produtos?.itens || []) {
    const nome = p.categoria || "sem categoria";
    const g = mapa.get(nome) || { categoria: nome, rotulo: nome, valor: 0, produtos: 0 };
    // Sem somar quantidade, pelo mesmo motivo do rollup por produto: adesivo
    // com bandeira não tem unidade comum.
    g.valor += p.valor;
    g.produtos += 1;
    mapa.set(nome, g);
  }
  return [...mapa.values()]
    .map((g) => ({ ...g, valor: cem(g.valor) }))
    .sort((a, b) => b.valor - a.valor);
}
