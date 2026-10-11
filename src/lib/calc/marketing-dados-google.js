/* O CONECTOR "google" NA SUB-ABA "DADOS": Google Analytics e Search Console
 * (no canal site) e o Perfil da Empresa (no canal google).
 *
 * O formato que chega é o da seção FORMATO de
 * supabase/functions/_shared/mkt-fontes/google.mjs. As peças (número,
 * tabela, gráfico, estado) são as de marketing-dados.js; aqui só se escolhe
 * o que cada quadro mostra, na ordem em que interessa: a semana fechada mais
 * nova contra a anterior em cima, o gráfico por dia, e as tabelas recolhidas.
 *
 * Duas regras do Google que a tela segura:
 *  - usuário do GA4 é contado SEM repetição dentro da semana: a soma de
 *    semanas contaria a mesma pessoa várias vezes. Por isso as tabelas do
 *    período (canais, origens, aparelhos) somam sessões, que somam, e não
 *    usuários;
 *  - as datas do Search Console são do horário do Pacífico, e os dias mais
 *    novos são provisórios (o gráfico os desenha mais claros).
 */
import { fmtAbaixoDe } from './marketing-fontes.js';
import { somarDias } from './marketing-canais.js';
import { MESES } from '../format.js';
import {
  agrupar,
  blocoAvisos,
  blocoBarras,
  blocoGrafico,
  blocoNumeros,
  blocoPares,
  blocoTabela,
  blocoTexto,
  col,
  colSemanaFechada,
  conhecido,
  formatar,
  lista,
  medida,
  montarQuadro,
  nomeDoPais,
  numero,
  objeto,
  ordenar,
  plural,
  razao,
  rotuloDia,
  rotuloPeriodo,
  secao,
  secaoTabela,
  separarPorHoje,
  somaEstrita,
  texto,
  traduzir,
  ultimasDuas,
} from './marketing-dados.js';

const recentesPrimeiro = (linhas, campo) => [...lista(linhas)].filter(objeto).sort((a, b) => String(b[campo] ?? '').localeCompare(String(a[campo] ?? '')));

/** "set/2026" para o mês AAAA-MM (o que não for mês aparece como veio). */
const rotuloDoMes = (mes) => {
  const m = /^(\d{4})-(\d{2})$/.exec(String(mes ?? ''));
  return m && MESES[Number(m[2]) - 1] ? `${MESES[Number(m[2]) - 1]}/${m[1]}` : String(mes ?? '');
};

/** "Semana de 28/09 a 04/10, comparada com a de 21/09." */
export function rotuloSemana(semana, anterior, hoje) {
  if (!semana) return null;
  const base = `Semana de ${rotuloDia(semana, hoje)} a ${rotuloDia(somarDias(semana, 6), hoje)}`;
  return anterior ? `${base}, comparada com a de ${rotuloDia(anterior, hoje)}` : `${base} (sem semana anterior para comparar)`;
}

/* ----------------------------------------------------- Google Analytics -- */

// Os grupos de canal do GA4 com o nome da tela do GA4 em português. Canal
// que não está aqui vai para "Outros canais" (somados numa linha só), nunca
// com o nome em inglês.
export const CANAIS_GA4 = Object.freeze({
  'Organic Search': 'Pesquisa orgânica', Direct: 'Direto', Referral: 'Referência', 'Organic Social': 'Social orgânico',
  'Paid Search': 'Pesquisa paga', 'Paid Social': 'Social pago', Email: 'E-mail', Unassigned: 'Não atribuído', Display: 'Display',
  'Organic Video': 'Vídeo orgânico', 'Paid Video': 'Vídeo pago', 'Cross-network': 'Entre redes', 'Organic Shopping': 'Shopping orgânico',
  'Paid Shopping': 'Shopping pago', Affiliates: 'Afiliados', SMS: 'SMS', 'Mobile Push Notifications': 'Notificações push', Audio: 'Áudio',
  'Paid Other': 'Outros pagos', 'AI Assistant': 'Assistente de IA', 'Organic Maps': 'Maps orgânico', 'Paid Maps': 'Maps pago',
  '(other)': 'Outros (juntados pelo GA4)', '(not set)': 'Não definido',
});
const APARELHOS_GA4 = Object.freeze({ mobile: 'celular', desktop: 'computador', tablet: 'tablet', 'smart tv': 'TV', '(not set)': 'não definido' });
const TIPOS_USUARIO = Object.freeze({ new: 'novos', returning: 'recorrentes', '(not set)': 'não definido' });
// Por que o GA4 cortou dados (dataTruncationReasons), como o conector diz.
const CORTES_GA4 = Object.freeze({
  DATA_TRUNCATION_TYPE_PROPERTY: 'pela retenção de dados da propriedade',
  DATA_TRUNCATION_TYPE_GOOGLE_ADS: 'pela regra de 36 meses do Google Ads',
});

const COLS_PERIODO = [
  col('sessoes', 'Sessões', 'int'),
  col('sessoes_engajadas', 'Engajadas', 'int'),
  col('novos', 'Novos usuários', 'int'),
  col('eventos_chave', 'Eventos-chave', 'int'),
];
/** A soma do período por chave (a função que dá a chave da linha). Nos
 *  mapas de código a chave é o próprio nome traduzido: o que o mapa não
 *  conhece vira "Outros canais" e soma numa linha só. */
const somaDoPeriodo = (linhas, chave, rotular, extra = () => ({})) =>
  ordenar(agrupar(linhas, chave, ['sessoes', 'sessoes_engajadas', 'novos', 'eventos_chave'], (l) => ({ nome: rotular(l), ...extra(l) })), 'sessoes');

function corpoGa4(g, hoje) {
  // Bloco que o GA4 recusou ou cortou (as chaves de dados.ga4): a seção dele
  // diz isso no lugar de "não veio". A frase com o porquê já está nos avisos
  // da coleta (o servidor escreve em português, sem a mensagem do Google).
  const naLista = (l, k) => lista(l).some((r) => (typeof r === 'string' ? r : r?.chave) === k);
  const semDado = (k, padrao) => (naLista(g.recusados, k) ? 'O GA4 recusou este quadro nesta coleta (o porquê está nos avisos da coleta).' : padrao);
  const comCorte = (k, nota = null) => [nota, naLista(g.cortados, k) ? 'Veio cortado pelo teto de linhas do GA4.' : null].filter(Boolean).join(' ') || null;
  const { atual, anterior } = ultimasDuas(g.semanas);
  const comparar = (campo) => (anterior ? anterior[campo] : undefined);
  const tempoPorUsuario = (s) => razao(s?.tempo_engajamento_s, s?.usuarios);
  const topo = [];
  if (atual) {
    topo.push(
      blocoNumeros(
        [
          numero({ id: 'usuarios', rotulo: 'Usuários', valor: atual.usuarios, anterior: comparar('usuarios') }),
          numero({ id: 'novos', rotulo: 'Novos usuários', valor: atual.novos, anterior: comparar('novos') }),
          numero({ id: 'sessoes', rotulo: 'Sessões', valor: atual.sessoes, anterior: comparar('sessoes') }),
          numero({ id: 'engajadas', rotulo: 'Sessões engajadas', valor: atual.sessoes_engajadas, anterior: comparar('sessoes_engajadas') }),
          numero({ id: 'taxa', rotulo: 'Taxa de engajamento', tipo: 'fracao', valor: atual.taxa_engajamento, anterior: comparar('taxa_engajamento') }),
          numero({ id: 'visualizacoes', rotulo: 'Visualizações', valor: atual.visualizacoes, anterior: comparar('visualizacoes') }),
          numero({ id: 'eventos_chave', rotulo: 'Eventos-chave', valor: atual.eventos_chave, anterior: comparar('eventos_chave') }),
          numero({
            id: 'tempo', rotulo: 'Tempo por usuário', tipo: 'dur', valor: tempoPorUsuario(atual),
            anterior: anterior ? tempoPorUsuario(anterior) : undefined,
            titulo: 'Tempo de engajamento da semana dividido pelos usuários (a conta do GA4 para "tempo médio de engajamento").',
          }),
        ],
        rotuloSemana(atual.semana, anterior?.semana, hoje)
      )
    );
  } else topo.push(blocoTexto('Nenhuma semana fechada medida ainda.'));
  topo.push(blocoGrafico(g.dias, { x: 'data', y: 'sessoes', titulo: 'Sessões por dia', unidade: 'sessões', hoje }));

  const q = objeto(g.qualidade) ? g.qualidade : {};
  topo.push(
    blocoAvisos([
      q.amostragem === true && { nivel: 'atencao', texto: 'O GA4 usou amostragem em parte destes números.' },
      q.limiar_privacidade === true && { nivel: 'atencao', texto: 'Parte dos números foi escondida pelo limite de privacidade do GA4 (poucas pessoas).' },
      q.linha_other === true && { nivel: 'info', texto: 'Parte das linhas veio juntada pelo GA4 em "(other)".' },
      // O motivo do corte vem em código (DATA_TRUNCATION_TYPE_...): a frase
      // é a do conector, e o código que ele não conhece não vai para a tela.
      ...lista(q.cortes).filter(objeto).map((c) => ({
        nivel: 'info',
        texto: `O GA4 cortou dados ${traduzir(CORTES_GA4, c.tipo, 'por uma regra de guarda dele') ?? 'por uma regra de guarda dele'}${rotuloDia(c.desde, hoje) ? `, antes de ${rotuloDia(c.desde, hoje)}` : ''}.`,
      })),
    ])
  );

  const periodo = rotuloPeriodo(lista(g.dias)[0]?.data, lista(g.dias).at(-1)?.data, hoje);
  const notaPeriodo = `Soma das semanas ${periodo ? `${periodo}, ` : ''}com a semana em andamento. Usuário não entra: a mesma pessoa contaria uma vez por semana.`;
  const moeda = texto(g.propriedade?.moeda, 3) || 'BRL';
  // As somas do período só com o que já aconteceu (a semana que ainda não
  // começou fica fora, regra 5 de marketing-dados.js).
  const ateHoje = (l, campo) => (Array.isArray(l) ? separarPorHoje(l, campo, hoje).ate : l);
  const futuras = ['canais', 'origens', 'campanhas', 'aparelhos', 'novos_recorrentes', 'ads'].flatMap((k) => separarPorHoje(g[k], 'semana', hoje).depois)
    .concat(separarPorHoje(g.eventos_chave_dia, 'data', hoje).depois, separarPorHoje(g.cliques_saida, 'data', hoje).depois);
  const eventosPorNome = ordenar(agrupar(ateHoje(g.eventos_chave_dia, 'data'), 'evento', ['eventos_chave', 'eventos'], (l) => ({ evento: l.evento })), 'eventos_chave');
  // Os cliques de saída por link (o mesmo domínio pode ter links diferentes:
  // o WhatsApp de um número e o de outro).
  const saidas = Array.isArray(g.cliques_saida)
    ? ordenar(agrupar(ateHoje(g.cliques_saida, 'data'), (l) => l.link || l.dominio, ['cliques'], (l) => ({ dominio: l.dominio, link: l.link ?? null })), 'cliques')
    : null;
  // O custo por clique do período é conta do Painel (custo somado dividido
  // pelos cliques somados); o ROAS não dá para somar e fica por semana.
  const ads = Array.isArray(g.ads)
    ? ordenar(agrupar(ateHoje(g.ads, 'semana'), 'campanha', ['custo', 'cliques', 'impressoes', 'sessoes', 'eventos_chave'], (l) => ({ campanha: l.campanha })), 'custo').map((x) => ({ ...x, cpc: razao(x.custo, x.cliques) }))
    : null;
  const canal = (l) => traduzir(CANAIS_GA4, l.canal, 'Outros canais');
  const aparelhoGa4 = (l) => traduzir(APARELHOS_GA4, l.aparelho, 'outros aparelhos');
  const tipoUsuario = (l) => traduzir(TIPOS_USUARIO, l.tipo, 'outros');
  const adsSemanas = Array.isArray(g.ads) ? [...g.ads].filter(objeto).sort((a, b) => String(b.semana ?? '').localeCompare(String(a.semana ?? '')) || String(a.campanha ?? '').localeCompare(String(b.campanha ?? ''))) : [];
  const p = objeto(g.propriedade) ? g.propriedade : {};
  const cota = objeto(g.cota) ? g.cota : null;

  const secoes = [
    secaoTabela('canais', 'Canais', Array.isArray(g.canais) ? somaDoPeriodo(ateHoje(g.canais, 'semana'), canal, canal) : null, [
      col('nome', 'Canal', 'texto', { titulo: (l) => (l.nome === 'Outros canais' ? 'Grupos de canais do GA4 que esta tela ainda não traduz, somados.' : null) }),
      ...COLS_PERIODO,
    ], {
      aberta: true, nota: comCorte('canais', notaPeriodo), unidade: ['canal', 'canais'], vazio: 'Nenhuma sessão no período.', semDado: semDado('canais', 'O GA4 não mandou os canais nesta coleta.'),
    }),
    secaoTabela('origens', 'Origem e mídia', Array.isArray(g.origens) ? somaDoPeriodo(ateHoje(g.origens, 'semana'), 'origem_midia', (l) => l.origem_midia) : null, [col('nome', 'Origem / mídia'), ...COLS_PERIODO], {
      nota: comCorte('origens', notaPeriodo), unidade: ['origem', 'origens'], semDado: semDado('origens', 'O GA4 não mandou a origem e mídia nesta coleta.'),
    }),
    secaoTabela(
      'campanhas', 'Campanhas',
      Array.isArray(g.campanhas) ? somaDoPeriodo(ateHoje(g.campanhas, 'semana'), (l) => `${l.campanha ?? ''}|${l.origem_midia ?? ''}`, (l) => l.campanha, (l) => ({ origem: l.origem_midia })) : null,
      [col('nome', 'Campanha'), col('origem', 'Origem / mídia'), ...COLS_PERIODO],
      { nota: comCorte('campanhas', notaPeriodo), unidade: ['campanha', 'campanhas'], semDado: semDado('campanhas', 'O GA4 não mandou as campanhas nesta coleta.') }
    ),
    secaoTabela('paginas', 'Páginas', ordenar(g.paginas, 'visualizacoes'), [
      col('pagina', 'Página', 'texto', { valor: (l) => l.titulo || l.caminho, link: (l) => l.link, titulo: (l) => [l.host, l.caminho].filter(Boolean).join('') || null, max: 120 }),
      col('caminho', 'Caminho', 'texto', { max: 120 }),
      col('visualizacoes', 'Visualizações', 'int'),
      col('usuarios', 'Usuários', 'int'),
      col('tempo_engajamento_s', 'Tempo de engajamento', 'dur'),
      col('eventos', 'Eventos', 'int'),
      col('eventos_chave', 'Eventos-chave', 'int'),
    ], { nota: comCorte('paginas', 'As mais vistas do período (até 200). O caminho vai com a consulta (?page_id=144).'), unidade: ['página', 'páginas'], semDado: semDado('paginas', 'O GA4 não mandou as páginas nesta coleta.') }),
    secaoTabela('entradas', 'Páginas de entrada', ordenar(g.entradas, 'sessoes'), [
      col('pagina', 'Página', 'texto', { max: 120 }),
      col('sessoes', 'Sessões', 'int'),
      col('sessoes_engajadas', 'Engajadas', 'int'),
      col('usuarios', 'Usuários', 'int'),
      col('eventos_chave', 'Eventos-chave', 'int'),
      col('taxa_rejeicao', 'Rejeição', 'fracao'),
    ], { nota: comCorte('entradas'), unidade: ['página', 'páginas'], semDado: semDado('entradas', 'O GA4 não mandou as páginas de entrada nesta coleta.') }),
    secaoTabela('cidades', 'Cidades', ordenar(g.cidades, 'usuarios'), [
      col('cidade', 'Cidade'), col('estado', 'Estado'), col('pais', 'País'), col('usuarios', 'Usuários', 'int'), col('sessoes', 'Sessões', 'int'), col('eventos_chave', 'Eventos-chave', 'int'),
    ], { nota: comCorte('cidades'), unidade: ['cidade', 'cidades'], semDado: semDado('cidades', 'O GA4 não mandou as cidades nesta coleta.') }),
    secaoTabela('aparelhos', 'Aparelhos', Array.isArray(g.aparelhos) ? somaDoPeriodo(ateHoje(g.aparelhos, 'semana'), aparelhoGa4, aparelhoGa4) : null, [col('nome', 'Aparelho'), col('sessoes', 'Sessões', 'int'), col('sessoes_engajadas', 'Engajadas', 'int'), col('eventos_chave', 'Eventos-chave', 'int')], {
      nota: comCorte('aparelhos', notaPeriodo), unidade: ['aparelho', 'aparelhos'], semDado: semDado('aparelhos', 'O GA4 não mandou os aparelhos nesta coleta.'),
    }),
    secaoTabela('novos_recorrentes', 'Novos e recorrentes', Array.isArray(g.novos_recorrentes) ? somaDoPeriodo(ateHoje(g.novos_recorrentes, 'semana'), tipoUsuario, tipoUsuario) : null, [col('nome', 'Usuários'), col('sessoes', 'Sessões', 'int'), col('sessoes_engajadas', 'Engajadas', 'int'), col('eventos_chave', 'Eventos-chave', 'int')], {
      nota: comCorte('novos_recorrentes', notaPeriodo), unidade: ['tipo', 'tipos'], semDado: semDado('novos_recorrentes', 'O GA4 não mandou novos e recorrentes nesta coleta.'),
    }),
    secao('eventos_chave', 'Eventos-chave', [
      Array.isArray(g.eventos_chave)
        ? g.eventos_chave.length
          ? blocoTabela(g.eventos_chave, [
            col('evento', 'Evento configurado'),
            col('desde', 'Desde', 'dia'),
            col('contagem', 'Conta', 'texto', { valor: (l) => traduzir({ ONCE_PER_EVENT: 'toda vez', ONCE_PER_SESSION: 'uma por sessão', COUNTING_METHOD_UNSPECIFIED: 'não informado' }, l.contagem, 'outra regra') }),
            col('personalizado', 'Personalizado', 'sim'),
          ], { hoje })
          : blocoTexto('Nenhum evento-chave configurado (o "purchase" padrão do GA não conta).')
        : blocoTexto(semDado('eventos_chave', 'Não deu para ler a lista de eventos-chave nesta coleta.')),
      Array.isArray(g.eventos_chave_dia)
        ? eventosPorNome.length
          ? blocoTabela(eventosPorNome, [col('evento', 'Evento'), col('eventos_chave', 'Como evento-chave', 'int'), col('eventos', 'Disparos', 'int')], { nota: 'Somados no período.' })
          : blocoTexto('Nenhum evento-chave disparado no período.')
        : null,
      rotuloDia(g.eventos_chave_desde, hoje) ? blocoTexto(`Os eventos-chave contam a partir de ${rotuloDia(g.eventos_chave_desde, hoje)}, o primeiro configurado; antes disso o número fica sem medida.`) : null,
    ], { resumo: Array.isArray(g.eventos_chave) ? plural(g.eventos_chave.length, 'configurado', 'configurados') : 'não medido' }),
    secaoTabela('cliques_saida', 'Cliques de saída', saidas, [
      col('dominio', 'Para onde'),
      col('link', 'Link', 'texto', { link: (l) => l.link, max: 160 }),
      col('cliques', 'Cliques', 'int'),
    ], {
      unidade: ['destino', 'destinos'],
      semDado: semDado('cliques_saida', 'Não medido: a medição otimizada do GA4 está desligada, ou não houve clique de saída no período.'),
      depois: [blocoTexto(g.whatsapp_medido === true ? 'Os cliques no WhatsApp (wa.me) estão sendo medidos.' : 'Nenhum clique para o WhatsApp visto no período.')],
    }),
    secaoTabela('ads', 'Google Ads no GA4', ads, [
      col('campanha', 'Campanha'), col('custo', 'Custo', 'moeda', { moeda }), col('cliques', 'Cliques', 'int'), col('cpc', 'CPC', 'moeda', { moeda, titulo: () => 'Custo dividido pelos cliques do período (conta do Painel).' }),
      col('impressoes', 'Impressões', 'int'), col('sessoes', 'Sessões', 'int'), col('eventos_chave', 'Eventos-chave', 'int'),
    ], {
      unidade: ['campanha', 'campanhas'],
      resumo: ads === null && g.vinculo_ads === false ? 'sem vínculo' : undefined,
      semDado: g.vinculo_ads === false ?'O GA4 não está vinculado ao Google Ads: o custo aparece só no quadro do Google Ads.' : 'O GA4 não mandou dados do Google Ads nesta coleta.',
      depois: adsSemanas.length
        ? [blocoTabela(adsSemanas, [
          col('semana', 'Semana de', 'dia'), col('campanha', 'Campanha'), col('custo', 'Custo', 'moeda', { moeda }), col('cliques', 'Cliques', 'int'),
          col('cpc', 'CPC', 'moeda', { moeda }), col('roas', 'ROAS', 'dec2', { titulo: () => 'Receita dividida pelo custo, como o GA4 calcula.' }), col('sessoes', 'Sessões', 'int'), col('eventos_chave', 'Eventos-chave', 'int'),
        ], { hoje, titulo: 'Por semana (números do GA4)', chave: (l, i) => `${l.semana ?? ''}-${l.campanha ?? ''}-${i}` })]
        : [],
    }),
    secaoTabela('semanas', 'Por semana', recentesPrimeiro(g.semanas, 'semana'), [
      col('semana', 'Semana de', 'dia'),
      col('usuarios', 'Usuários', 'int'),
      col('usuarios_totais', 'Usuários totais', 'int', { titulo: () => 'Todos os usuários com algum evento na semana; "Usuários" conta só os ativos.' }),
      col('novos', 'Novos', 'int'),
      col('sessoes', 'Sessões', 'int'),
      col('sessoes_engajadas', 'Engajadas', 'int'),
      col('taxa_engajamento', 'Taxa de engaj.', 'fracao'),
      col('visualizacoes', 'Visualizações', 'int'),
      col('eventos', 'Eventos', 'int'),
      col('eventos_chave', 'Eventos-chave', 'int'),
      col('tempo_engajamento_s', 'Tempo de engaj. (soma)', 'dur'),
    ], { hoje, unidade: ['semana', 'semanas'] }),
    secaoTabela('dias', 'Por dia', recentesPrimeiro(g.dias, 'data'), [
      col('data', 'Dia', 'dia'),
      col('registrou', 'Teve registro', 'sim', { tom: (l) => (l.registrou === false ? 'warn' : null) }),
      col('usuarios', 'Usuários', 'int'),
      col('novos', 'Novos', 'int'),
      col('sessoes', 'Sessões', 'int'),
      col('sessoes_engajadas', 'Engajadas', 'int'),
      col('taxa_engajamento', 'Taxa de engaj.', 'fracao'),
      col('duracao_media_s', 'Duração média', 'dur'),
      col('taxa_rejeicao', 'Rejeição', 'fracao'),
      col('visualizacoes', 'Visualizações', 'int'),
      col('eventos', 'Eventos', 'int'),
      col('eventos_chave', 'Eventos-chave', 'int'),
    ], { hoje, limite: 14, unidade: ['dia', 'dias'], nota: 'Dia sem registro numa semana que teve visitas vem com contagem zero; semana inteira sem registro fica sem medida.' }),
    secao('propriedade', 'Sobre a propriedade', [
      blocoPares([
        { rotulo: 'Propriedade', valor: p.nome },
        { rotulo: 'Conta', valor: p.conta },
        { rotulo: 'ID', valor: p.id },
        { rotulo: 'ID de medição', valor: p.medicao },
        { rotulo: 'Fluxo', valor: [texto(p.fluxo?.nome), texto(p.fluxo?.site)].filter(Boolean).join(', ') || null, link: p.fluxo?.site },
        { rotulo: 'Fuso', valor: p.fuso, tipo: 'fuso' },
        { rotulo: 'Moeda', valor: p.moeda, tipo: 'nomeMoeda' },
        { rotulo: 'Nível', valor: traduzir({ GOOGLE_ANALYTICS_STANDARD: 'padrão', GOOGLE_ANALYTICS_360: '360', SERVICE_LEVEL_UNSPECIFIED: 'não informado' }, p.nivel, 'outro nível') },
        { rotulo: 'Criada em', valor: p.criada_em, tipo: 'dia', hoje },
        { rotulo: 'Achada', valor: traduzir({ medicao: 'pela etiqueta do site', site: 'pelo endereço do site' }, p.achada_por, 'de outro jeito') },
        { rotulo: 'Vínculo com o Google Ads', valor: g.vinculo_ads, tipo: 'sim' },
        cota && { rotulo: 'Cota restante hoje', valor: cota.dia_restante, tipo: 'int' },
        cota && { rotulo: 'Cota restante nesta hora', valor: cota.hora_restante, tipo: 'int' },
        cota && { rotulo: 'Cota do projeto nesta hora', valor: cota.projeto_hora_restante, tipo: 'int' },
        cota && { rotulo: 'Erros de servidor ainda aceitos nesta hora', valor: cota.erros_servidor_restantes, tipo: 'int' },
      ]),
    ]),
  ];

  return {
    destaque: atual && medida(atual.usuarios) !== null ? `${formatar('int', atual.usuarios)} usuários na semana` : null,
    topo,
    secoes,
    notas: [futuras.length ? `O GA4 mandou ${plural(futuras.length, 'linha', 'linhas')} com data que ainda não chegou (${[...new Set(futuras.map((l) => rotuloDia(l.semana ?? l.data, hoje)).filter(Boolean))].join(', ')}): ficaram fora das somas do período.` : null],
  };
}

/** O quadro do Google Analytics (ligação google/ga4 do canal site). */
export function quadrosGa4(l, { hoje } = {}) {
  const g = objeto(l?.dados) ? l.dados : null;
  const temDado = !!g && (lista(g.semanas).length > 0 || lista(g.dias).length > 0 || objeto(g.propriedade));
  return [montarQuadro({ id: 'ga4', titulo: 'Google Analytics', rotuloFonte: 'Google Analytics', ligacao: l, temDado, hoje, corpo: () => corpoGa4(g, hoje) })];
}

/* ------------------------------------------------------- Search Console -- */

const APARELHOS_SC = Object.freeze({ MOBILE: 'celular', DESKTOP: 'computador', TABLET: 'tablet' });
const TIPOS_SC = Object.freeze({ web: 'Web', image: 'Imagens', video: 'Vídeos', news: 'Notícias (aba)', discover: 'Discover', googleNews: 'Google Notícias' });
// A aparência do resultado (searchAppearance), com o nome da tela do
// Search Console em português.
const APARENCIA_SC = Object.freeze({
  AMP_ARTICLE: 'artigo AMP', AMP_BLUE_LINK: 'link AMP', AMP_TOP_STORIES: 'principais notícias (AMP)', ORGANIC_SHOPPING: 'Shopping orgânico',
  PRODUCT_SNIPPETS: 'trecho de produto', MERCHANT_LISTINGS: 'produto da loja', REVIEW_SNIPPET: 'trecho de avaliação', RECIPE_FEATURE: 'receita em destaque',
  RECIPE_RICH_SNIPPET: 'receita', VIDEO: 'vídeo', FAQ_RICH_RESULT: 'perguntas frequentes', HOWTO: 'passo a passo', HOW_TO: 'passo a passo',
  JOB_LISTING: 'vaga de emprego', JOB_DETAILS: 'detalhe da vaga', EVENT: 'evento', EVENT_DETAILS: 'detalhe do evento', TRANSLATED_RESULT: 'resultado traduzido',
  SPECIAL_ANNOUNCEMENT: 'aviso especial', WEBLITE: 'página leve', PAGE_EXPERIENCE: 'experiência na página', RICHCARD: 'cartão rico',
  DISCUSSION_FORUM: 'fórum de discussão', Q_AND_A: 'perguntas e respostas', PROFILE_PAGE: 'página de perfil', DATASET: 'conjunto de dados',
  EDUCATION_Q_AND_A: 'perguntas de estudo', PRACTICE_PROBLEMS: 'exercícios', LEARNING_VIDEOS: 'vídeo de aula', MATH_SOLVERS: 'resolução de contas',
  SHORT_VIDEOS: 'vídeo curto', PRODUCT_RICH_RESULT: 'resultado de produto', LOGO: 'logotipo', SITELINKS: 'links do site', BREADCRUMB: 'trilha de navegação',
});
// A cobertura da inspeção vem em frase inglesa do Google: as que aparecem na
// tela do Search Console, em português. Frase nova vai como veio (é texto,
// não código).
const COBERTURA = Object.freeze({
  'Submitted and indexed': 'enviada e indexada', 'Indexed, not submitted in sitemap': 'indexada, fora do sitemap',
  'Indexed, though blocked by robots.txt': 'indexada, mas bloqueada pelo robots.txt', 'Crawled - currently not indexed': 'rastreada, ainda não indexada',
  'Discovered - currently not indexed': 'descoberta, ainda não indexada', 'URL is unknown to Google': 'o Google não conhece o endereço',
  'Page with redirect': 'página que redireciona', "Excluded by 'noindex' tag": 'fora do índice pela tag noindex', 'Blocked by robots.txt': 'bloqueada pelo robots.txt',
  'Not found (404)': 'não encontrada (404)', 'Soft 404': 'parece vazia (soft 404)', 'Server error (5xx)': 'erro do servidor (5xx)', 'Redirect error': 'erro de redirecionamento',
  'Duplicate without user-selected canonical': 'duplicada, sem canônica escolhida', 'Duplicate, Google chose different canonical than user': 'duplicada, o Google escolheu outra canônica',
  'Alternate page with proper canonical tag': 'página alternativa com a canônica certa', 'Blocked due to unauthorized request (401)': 'bloqueada: pediu login (401)',
  'Blocked due to access forbidden (403)': 'bloqueada: acesso proibido (403)', 'Blocked due to other 4xx issue': 'bloqueada por outro erro 4xx',
  'Blocked by page removal tool': 'bloqueada pela ferramenta de remoção',
});
// Os tipos de resultado rico (nomes ingleses do Google), em português; tipo
// novo vai como veio (é nome, não código).
const RICOS = Object.freeze({
  Breadcrumbs: 'trilha de navegação', FAQ: 'perguntas frequentes', 'Review snippets': 'avaliações', 'Product snippets': 'produto', Logos: 'logotipo',
  'Sitelinks searchbox': 'caixa de pesquisa do site', 'Local business': 'empresa local', Organization: 'organização', Videos: 'vídeo', Event: 'evento',
  'Job posting': 'vaga de emprego', Recipes: 'receita', 'How-to': 'passo a passo', 'Merchant listings': 'produto da loja', 'Profile page': 'página de perfil',
  'Discussion forum': 'fórum de discussão', 'Q&A': 'perguntas e respostas', 'Image metadata': 'dados da imagem',
});
// O que o sitemap lista (contents[].type), em português.
const CONTEUDO_SITEMAP = Object.freeze({ web: 'páginas', image: 'imagens', video: 'vídeos', news: 'notícias', mobile: 'páginas para celular', androidApp: 'app Android', iosApp: 'app iOS' });
const VEREDITO = Object.freeze({ PASS: 'aprovada', FAIL: 'com problema', NEUTRAL: 'neutra', PARTIAL: 'parcial', VERDICT_UNSPECIFIED: 'sem veredito' });
const TIPO_SITEMAP = Object.freeze({ sitemap: 'sitemap', rssFeed: 'feed RSS', atomFeed: 'feed Atom', urlList: 'lista de endereços', patternSitemap: 'sitemap de padrão', notSitemap: 'não é sitemap' });
const ROBOTS_INSPECAO = Object.freeze({ ALLOWED: 'liberada', DISALLOWED: 'bloqueada', ROBOTS_TXT_STATE_UNSPECIFIED: 'sem informação' });
const INDEXACAO = Object.freeze({
  INDEXING_ALLOWED: 'liberada', BLOCKED_BY_META_TAG: 'bloqueada pela meta noindex', BLOCKED_BY_HTTP_HEADER: 'bloqueada pelo cabeçalho noindex',
  BLOCKED_BY_ROBOTS_TXT: 'bloqueada pelo robots.txt', INDEXING_STATE_UNSPECIFIED: 'sem informação',
});
const BUSCA_PAGINA = Object.freeze({
  SUCCESSFUL: 'abriu', SOFT_404: 'parece vazia (soft 404)', BLOCKED_ROBOTS_TXT: 'bloqueada pelo robots.txt', NOT_FOUND: 'não encontrada (404)',
  ACCESS_DENIED: 'pediu login (401)', SERVER_ERROR: 'erro do servidor (5xx)', REDIRECT_ERROR: 'erro de redirecionamento', ACCESS_FORBIDDEN: 'proibida (403)',
  BLOCKED_4XX: 'bloqueada (4xx)', INTERNAL_CRAWL_ERROR: 'erro interno do Google', INVALID_URL: 'endereço inválido', PAGE_FETCH_STATE_UNSPECIFIED: 'sem informação',
});
/** A nota de um bloco do Search Console contado por página (byPage): a soma
 *  das páginas passa do total do site, porque uma busca que mostra duas
 *  páginas conta uma vez em cada. */
const notaPorPagina = (sc, k) => (objeto(sc.agregacao) && sc.agregacao[k] === 'byPage' ? 'Contado por página: a soma passa do total do site, porque uma busca que mostra duas páginas conta uma vez em cada.' : null);

const COLS_BUSCA = [
  col('cliques', 'Cliques', 'int'),
  col('impressoes', 'Impressões', 'int'),
  col('ctr', 'CTR', 'fracao', { casas: 1 }),
  col('posicao', 'Posição média', 'dec1'),
];

function corpoSearchConsole(sc, hoje) {
  const { atual, anterior } = ultimasDuas(sc.semanas, 'semana', (s) => s.fechada === true);
  const comparar = (campo) => (anterior ? anterior[campo] : undefined);
  const topo = [];
  if (atual) {
    topo.push(
      blocoNumeros(
        [
          numero({ id: 'cliques', rotulo: 'Cliques', valor: atual.cliques, anterior: comparar('cliques') }),
          numero({ id: 'impressoes', rotulo: 'Impressões', valor: atual.impressoes, anterior: comparar('impressoes') }),
          numero({ id: 'ctr', rotulo: 'CTR', tipo: 'fracao', valor: atual.ctr, anterior: comparar('ctr') }),
          numero({ id: 'posicao', rotulo: 'Posição média', tipo: 'dec1', valor: atual.posicao, anterior: comparar('posicao'), subirE: 'ruim', titulo: 'Posição média nos resultados do Google: quanto menor, mais para cima.' }),
        ],
        rotuloSemana(atual.semana, anterior?.semana, hoje)
      )
    );
  } else topo.push(blocoTexto('Nenhuma semana fechada medida ainda.'));
  topo.push(blocoGrafico(sc.dias, { x: 'data', y: 'cliques', titulo: 'Cliques por dia', unidade: 'cliques', hoje, fraco: (d) => d.provisorio === true }));
  const sitemaps = lista(sc.sitemaps).filter(objeto);
  topo.push(
    blocoAvisos([
      ...sitemaps.filter((s) => (medida(s.erros) ?? 0) > 0).map((s) => ({ nivel: 'atencao', texto: `O Google achou ${plural(medida(s.erros), 'erro', 'erros')} no sitemap ${texto(s.caminho, 120) ?? ''}.` })),
      ...sitemaps.filter((s) => s.pendente === true).map((s) => ({ nivel: 'info', texto: `O sitemap ${texto(s.caminho, 120) ?? ''} ainda está pendente de leitura pelo Google.` })),
    ])
  );

  const marca = objeto(sc.marca) ? sc.marca : null;
  const cortado = (k) => (lista(sc.cortados).includes(k) ? 'Passou do teto de linhas: a lista veio cortada.' : null);
  const tipos = objeto(sc.tipos) ? Object.entries(sc.tipos).map(([k, v]) => ({ tipo: traduzir(TIPOS_SC, k, 'outro tipo'), ...(objeto(v) ? v : {}), semVolume: !objeto(v) })) : null;
  const prop = objeto(sc.propriedade) ? sc.propriedade : {};
  // O Search Console manda o país em três letras ("bra"): o nome em
  // português de qualquer país, e nunca o código.
  const pais = (l) => nomeDoPais(l.pais);
  const traduzirTexto = (mapa, v) => conhecido(mapa, v) ?? texto(v, 120);

  const secoes = [
    secaoTabela('consultas', 'Consultas', ordenar(sc.consultas, 'cliques'), [col('consulta', 'Consulta', 'texto', { max: 120 }), ...COLS_BUSCA], {
      aberta: true, unidade: ['consulta', 'consultas'], nota: ['No período, até mil linhas. Consulta rara o Google não mostra (ela entra no total).', cortado('consultas'), notaPorPagina(sc, 'consultas')].filter(Boolean).join(' '), semDado: 'O Search Console não mandou as consultas nesta coleta.',
    }),
    secaoTabela('paginas', 'Páginas', ordenar(sc.paginas, 'cliques'), [col('pagina', 'Página', 'texto', { link: (l) => l.pagina, max: 120 }), ...COLS_BUSCA], {
      unidade: ['página', 'páginas'], nota: [cortado('paginas'), notaPorPagina(sc, 'paginas')].filter(Boolean).join(' ') || null, semDado: 'O Search Console não mandou as páginas nesta coleta.',
    }),
    secaoTabela('consultas_semana', 'Consultas da última semana', Array.isArray(sc.consultas_semana) ? ordenar(sc.consultas_semana, 'cliques') : null, [col('consulta', 'Consulta', 'texto', { max: 120 }), ...COLS_BUSCA], {
      unidade: ['consulta', 'consultas'], semDado: 'Não veio nesta coleta.', nota: notaPorPagina(sc, 'consultas_semana'),
    }),
    secaoTabela('paginas_semana', 'Páginas da última semana', Array.isArray(sc.paginas_semana) ? ordenar(sc.paginas_semana, 'cliques') : null, [col('pagina', 'Página', 'texto', { link: (l) => l.pagina, max: 120 }), ...COLS_BUSCA], {
      unidade: ['página', 'páginas'], semDado: 'Não veio nesta coleta.', nota: notaPorPagina(sc, 'paginas_semana'),
    }),
    secaoTabela('paises', 'Países', ordenar(sc.paises, 'cliques'), [col('pais', 'País', 'texto', { valor: pais }), ...COLS_BUSCA], { unidade: ['país', 'países'], vazio: 'Nenhum país com volume no período.', nota: notaPorPagina(sc, 'paises') }),
    secaoTabela('aparelhos', 'Aparelhos', ordenar(sc.aparelhos, 'cliques'), [col('aparelho', 'Aparelho', 'texto', { valor: (l) => traduzir(APARELHOS_SC, l.aparelho, 'outro aparelho') }), ...COLS_BUSCA], { unidade: ['aparelho', 'aparelhos'], vazio: 'Nenhum aparelho com volume no período.', nota: notaPorPagina(sc, 'aparelhos') }),
    secaoTabela('aparencias', 'Aparência nos resultados', ordenar(sc.aparencias, 'cliques'), [col('aparencia', 'Aparência', 'texto', { valor: (l) => traduzir(APARENCIA_SC, l.aparencia, 'outra aparência') }), ...COLS_BUSCA], { unidade: ['aparência', 'aparências'], vazio: 'Nenhum resultado com aparência especial no período.', nota: notaPorPagina(sc, 'aparencias') }),
    secaoTabela('tipos', 'Tipo de busca', tipos, [col('tipo', 'Tipo'), ...COLS_BUSCA], {
      unidade: ['tipo', 'tipos'], semDado: 'Não veio nesta coleta.', nota: 'Tipo sem volume no período fica sem número.',
    }),
    secao('marca', 'Marca e não marca', [
      marca
        ? blocoTabela([
          { nome: 'Com a marca', ...(marca.marca || {}) },
          { nome: 'Sem a marca', ...(marca.nao_marca || {}) },
          { nome: 'Consultas raras', ...(marca.anonimas || {}) },
        ], [col('nome', 'Consultas'), col('cliques', 'Cliques', 'int'), col('impressoes', 'Impressões', 'int')], {
          nota: 'Consultas raras é o total menos as de marca e as sem marca: o Google não mostra a consulta, mas conta no total.',
        })
        : blocoTexto('Não veio nesta coleta.'),
    ], { resumo: marca ? null : 'não medido' }),
    secaoTabela('sitemaps', 'Sitemaps enviados', Array.isArray(sc.sitemaps) ? sitemaps : null, [
      col('caminho', 'Sitemap', 'texto', { link: (l) => l.caminho, max: 120 }),
      col('tipo', 'Tipo', 'texto', { valor: (l) => (l.indice === true ? 'índice de sitemaps' : traduzir(TIPO_SITEMAP, l.tipo, 'outro tipo')) }),
      col('enviado_em', 'Enviado', 'instante'),
      col('lido_em', 'Lido pelo Google', 'instante'),
      col('pendente', 'Pendente', 'sim'),
      col('erros', 'Erros', 'int', { tom: (l) => ((medida(l.erros) ?? 0) > 0 ? 'bad' : null) }),
      col('avisos', 'Avisos', 'int', { tom: (l) => ((medida(l.avisos) ?? 0) > 0 ? 'warn' : null) }),
      col('conteudos', 'Endereços enviados', 'texto', { valor: (l) => lista(l.conteudos).filter(objeto).map((c) => `${traduzir(CONTEUDO_SITEMAP, c.tipo, 'outros') ?? 'sem tipo'}: ${formatar('int', c.enviados)}`).join(', ') || null }),
    ], { hoje, unidade: ['sitemap', 'sitemaps'], semDado: 'Não deu para ler os sitemaps nesta coleta.', vazio: 'Nenhum sitemap enviado ao Search Console.' }),
    secaoTabela('inspecoes', 'Inspeção de páginas', Array.isArray(sc.inspecoes) ? sc.inspecoes.filter(objeto) : null, [
      col('pagina', 'Página', 'texto', { link: (l) => l.pagina, max: 120 }),
      col('veredito', 'Resultado', 'texto', { valor: (l) => traduzir(VEREDITO, l.veredito, 'outro resultado'), tom: (l) => (l.veredito === 'PASS' ? 'ok' : l.veredito === 'FAIL' ? 'bad' : null) }),
      col('cobertura', 'Cobertura', 'texto', { valor: (l) => traduzirTexto(COBERTURA, l.cobertura) }),
      col('indexacao', 'Indexação', 'texto', { valor: (l) => traduzir(INDEXACAO, l.indexacao, 'outra situação'), tom: (l) => (/^BLOCKED/.test(String(l.indexacao ?? '')) ? 'warn' : null) }),
      col('robots', 'robots.txt', 'texto', { valor: (l) => traduzir(ROBOTS_INSPECAO, l.robots, 'outra situação'), tom: (l) => (l.robots === 'DISALLOWED' ? 'warn' : null) }),
      col('busca', 'Ao buscar a página', 'texto', { valor: (l) => traduzir(BUSCA_PAGINA, l.busca, 'outro problema'), tom: (l) => (l.busca && l.busca !== 'SUCCESSFUL' ? 'bad' : null) }),
      col('rastreado_em', 'Rastreada', 'instante'),
      col('rastreado_como', 'Como', 'texto', { valor: (l) => traduzir({ MOBILE: 'celular', DESKTOP: 'computador', CRAWLING_USER_AGENT_UNSPECIFIED: 'não informado' }, l.rastreado_como, 'outro robô') }),
      col('canonica_google', 'Canônica do Google', 'texto', { max: 120 }),
      col('canonica_site', 'Canônica do site', 'texto', { max: 120, tom: (l) => (l.canonica_site && l.canonica_google && l.canonica_site !== l.canonica_google ? 'warn' : null) }),
      col('ricos', 'Resultados ricos', 'texto', { valor: (l) => (objeto(l.ricos) ? [traduzir(VEREDITO, l.ricos.veredito, 'outro resultado'), lista(l.ricos.tipos).map((t) => traduzirTexto(RICOS, t)).filter(Boolean).join(', ')].filter(Boolean).join(': ') : null) }),
      col('link', 'Abrir', 'texto', { valor: (l) => (l.link ? 'no Search Console' : null), link: (l) => l.link }),
    ], { hoje, unidade: ['página', 'páginas'], semDado: 'Não veio nesta coleta.', nota: 'A canônica do site fica destacada quando o Google escolheu outra.' }),
    secaoTabela('semanas', 'Por semana', recentesPrimeiro(sc.semanas, 'semana'), [col('semana', 'Semana de', 'dia'), colSemanaFechada('fechada', 'ainda não fechada', { hoje }), ...COLS_BUSCA], { hoje, unidade: ['semana', 'semanas'], semDado: 'Não veio nesta coleta.', nota: 'A semana ainda não fechada fica sem números.' }),
    secaoTabela('dias', 'Por dia', recentesPrimeiro(sc.dias, 'data'), [col('data', 'Dia', 'dia'), col('provisorio', 'Provisório', 'sim'), ...COLS_BUSCA], { hoje, limite: 14, unidade: ['dia', 'dias'], nota: notaPorPagina(sc, 'dias') }),
    secaoTabela('por_hora', 'Por hora (dias mais novos)', Array.isArray(sc.por_hora) ? recentesPrimeiro(sc.por_hora, 'hora') : null, [col('hora', 'Hora', 'instante'), ...COLS_BUSCA], {
      hoje, unidade: ['hora', 'horas'], semDado: 'Não veio nesta coleta.', nota: 'Dado parcial: o Google ainda está contando estes dias.',
    }),
    secao('sobre', 'Sobre a propriedade', [
      blocoPares([
        { rotulo: 'Propriedade', valor: prop.site },
        { rotulo: 'Permissão', valor: traduzir({ siteOwner: 'dono', siteFullUser: 'usuário completo', siteRestrictedUser: 'usuário restrito', siteUnverifiedUser: 'não verificado' }, prop.permissao, 'outra permissão') },
        { rotulo: 'Fuso das datas', valor: sc.fuso, tipo: 'fuso' },
        { rotulo: 'Primeiro dia incompleto', valor: sc.primeiro_dia_incompleto, tipo: 'dia', hoje },
      ]),
    ]),
  ];

  const notas = ['As datas do Search Console seguem o horário do Pacífico (4 ou 5 horas antes de Brasília); os dias provisórios ficam mais claros no gráfico.'];
  if (rotuloDia(sc.primeiro_dia_incompleto, hoje)) notas.push(`A partir de ${rotuloDia(sc.primeiro_dia_incompleto, hoje)} os números ainda podem mudar.`);
  return {
    destaque: atual && medida(atual.cliques) !== null ? `${formatar('int', atual.cliques)} cliques na semana` : null,
    topo,
    secoes,
    notas,
  };
}

/** O quadro do Search Console (ligação google/search_console do canal site). */
export function quadrosSearchConsole(l, { hoje } = {}) {
  const sc = objeto(l?.dados) ? l.dados : null;
  const temDado = !!sc && (Array.isArray(sc.semanas) || lista(sc.dias).length > 0 || lista(sc.consultas).length > 0 || objeto(sc.propriedade));
  return [montarQuadro({ id: 'search_console', titulo: 'Search Console', rotuloFonte: 'Search Console', ligacao: l, temDado, hoje, corpo: () => corpoSearchConsole(sc, hoje) })];
}

/* ---------------------------------------------------- Perfil da Empresa -- */

const VISUALIZACOES = ['impressoes_busca_celular', 'impressoes_busca_computador', 'impressoes_maps_celular', 'impressoes_maps_computador'];
const TIPO_POST = Object.freeze({ STANDARD: 'novidade', EVENT: 'evento', OFFER: 'oferta', ALERT: 'aviso' });
const SITUACAO_POST = Object.freeze({ LIVE: 'no ar', REJECTED: 'recusado', PROCESSING: 'processando', SCHEDULED: 'agendado' });
const SITUACAO_RESPOSTA = Object.freeze({ APPROVED: 'publicada', PUBLISHED: 'publicada', PENDING: 'em análise', REJECTED: 'recusada pelo Google' });
const TIPO_CONTA_GBP = Object.freeze({ PERSONAL: 'pessoal', LOCATION_GROUP: 'grupo de locais', USER_GROUP: 'grupo de usuários', ORGANIZATION: 'organização' });
// As métricas diárias do Perfil (o nome da API), para o aviso de métrica
// recusada (as mesmas frases do conector, sem o artigo).
const METRICAS_PERFIL = Object.freeze({
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 'visualizações no Maps pelo computador', BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 'visualizações na Pesquisa pelo computador',
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 'visualizações no Maps pelo celular', BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 'visualizações na Pesquisa pelo celular',
  BUSINESS_CONVERSATIONS: 'conversas', BUSINESS_DIRECTION_REQUESTS: 'pedidos de rota', CALL_CLICKS: 'cliques para ligar', WEBSITE_CLICKS: 'cliques no site',
  BUSINESS_BOOKINGS: 'reservas', BUSINESS_FOOD_ORDERS: 'pedidos de comida', BUSINESS_FOOD_MENU_CLICKS: 'cliques no cardápio',
});
// O que o Google diz quando marca o perfil (complyWithGuidelines).
const PROBLEMA_PERFIL = Object.freeze({
  BUSINESS_LOCATION_SUSPENDED: 'o Google suspendeu o perfil', BUSINESS_LOCATION_DISABLED: 'o Google desativou o perfil',
  RECOMMENDATION_REASON_UNSPECIFIED: 'não informado',
});
// Os campos do perfil que o Google mexeu ou que esperam análise (as máscaras
// diffMask e pendingMask: "title,phoneNumbers.primaryPhone").
const CAMPOS_PERFIL = Object.freeze({
  title: 'nome', phoneNumbers: 'telefones', 'phoneNumbers.primaryPhone': 'telefone principal', 'phoneNumbers.additionalPhones': 'outros telefones',
  categories: 'categorias', 'categories.primaryCategory': 'categoria principal', 'categories.additionalCategories': 'outras categorias',
  storefrontAddress: 'endereço', websiteUri: 'site', regularHours: 'horário de funcionamento', specialHours: 'horários especiais', moreHours: 'outros horários',
  serviceArea: 'área de atendimento', labels: 'rótulos', adWordsLocationExtensions: 'extensão de local do Google Ads', latlng: 'posição no mapa',
  openInfo: 'situação de funcionamento', 'openInfo.status': 'situação de funcionamento', 'openInfo.openingDate': 'data de abertura', profile: 'descrição',
  'profile.description': 'descrição', relationshipData: 'locais ligados', serviceItems: 'serviços', languageCode: 'idioma', storeCode: 'código da loja',
  attributes: 'atributos',
});
/** Os campos de uma máscara do Google ("title,phoneNumbers.primaryPhone"),
 *  com o nome de gente; o que o mapa não conhece vira "outro campo". */
const camposDaMascara = (m) => {
  const l = (typeof m === 'string' ? m.split(',') : lista(m)).map((x) => String(x ?? '').trim()).filter(Boolean);
  return l.length ? [...new Set(l.map((c) => conhecido(CAMPOS_PERFIL, c) ?? conhecido(CAMPOS_PERFIL, c.split('.')[0]) ?? 'outro campo'))].join(', ') : null;
};
// Os atributos que mais aparecem no Perfil (o nome da API, sem o "has_"),
// com o nome da tela do Google em português. O que não está aqui vira
// "outro atributo", nunca o código.
const ATRIBUTOS = Object.freeze({
  url_whatsapp: 'link do WhatsApp', url_instagram: 'perfil no Instagram', url_facebook: 'página no Facebook', url_linkedin: 'página no LinkedIn',
  url_youtube: 'canal no YouTube', url_tiktok: 'perfil no TikTok', url_twitter: 'perfil no X (Twitter)', url_pinterest: 'perfil no Pinterest',
  url_appointment: 'link para agendar', url_order_ahead: 'link para pedir', url_menu: 'link do cardápio', url_reservations: 'link para reservar',
  wheelchair_accessible_entrance: 'entrada acessível para cadeira de rodas', wheelchair_accessible_parking: 'estacionamento acessível',
  wheelchair_accessible_restroom: 'banheiro acessível', wheelchair_accessible_seating: 'assentos acessíveis', wheelchair_accessible_elevator: 'elevador acessível',
  onsite_services: 'atendimento no local', online_appointments: 'agendamento on-line', online_estimates: 'orçamento on-line', online_classes: 'aulas on-line',
  appointment_required: 'só com hora marcada', delivery: 'entrega', same_day_delivery: 'entrega no mesmo dia', no_contact_delivery: 'entrega sem contato',
  in_store_pickup: 'retirada na loja', curbside_pickup: 'retirada na porta', in_store_shopping: 'compras na loja', restroom: 'banheiro',
  gender_neutral_restroom: 'banheiro unissex', wi_fi: 'wi-fi', free_wi_fi: 'wi-fi grátis', parking: 'estacionamento', free_parking_lot: 'estacionamento grátis',
  paid_parking_lot: 'estacionamento pago', free_street_parking: 'vaga na rua grátis', paid_street_parking: 'vaga na rua paga', valet_parking: 'manobrista',
  pay_credit_card: 'aceita cartão de crédito', pay_credit_card_types_accepted: 'cartões de crédito aceitos', pay_debit_card: 'aceita cartão de débito',
  pay_mobile_nfc: 'pagamento por aproximação', pay_check: 'aceita cheque', pay_pix: 'aceita Pix', requires_cash_only: 'só dinheiro',
  is_owned_by_women: 'empresa de mulheres', is_black_owned: 'empresa de pessoas negras', welcomes_lgbtq: 'acolhe o público LGBTQ+',
  is_transgender_safespace: 'espaço seguro para pessoas trans', language_spoken_english: 'atendimento em inglês', language_spoken_spanish: 'atendimento em espanhol',
  service_installation: 'faz instalação', service_repair: 'faz reparo', service_design: 'faz projeto', service_delivery: 'faz entrega',
});

/** O nome de gente de um atributo do Perfil ("has_wheelchair_accessible_entrance"
 *  vira "entrada acessível para cadeira de rodas"); o que o mapa não conhece
 *  vira "outro atributo", nunca o código. */
export function nomeDoAtributo(nome) {
  const k = String(nome ?? '').trim();
  if (!k) return null;
  return conhecido(ATRIBUTOS, k) ?? conhecido(ATRIBUTOS, k.replace(/^(has_|is_)/, '')) ?? 'outro atributo';
}

/** Os valores de um atributo do Perfil, nas três formas que o Google manda:
 *  a lista de sim, não ou textos; a lista de endereços ([{uri}], o link do
 *  WhatsApp, por exemplo); e o par {setValues, unsetValues} das opções. O
 *  que não for nenhuma delas é null (nunca "[object Object]"). */
export function valoresDoAtributo(v) {
  if (Array.isArray(v)) {
    const l = v
      .map((x) => (x === true ? 'sim' : x === false ? 'não' : objeto(x) ? texto(x.uri, 200) : texto(x, 120)))
      .filter(Boolean);
    return l.length ? l.join(', ') : null;
  }
  if (objeto(v)) {
    const sim = lista(v.setValues).map((x) => texto(x, 80)).filter(Boolean);
    const nao = lista(v.unsetValues).map((x) => texto(x, 80)).filter(Boolean);
    return [sim.length ? `sim: ${sim.join(', ')}` : null, nao.length ? `não: ${nao.join(', ')}` : null].filter(Boolean).join('; ') || null;
  }
  return null;
}
/** O primeiro endereço de um atributo de link (para a célula virar link). */
const linkDoAtributo = (v) => (Array.isArray(v) ? v.find((x) => objeto(x) && typeof x.uri === 'string')?.uri ?? null : null);

/** A data do Google em partes ({year, month, day}) em AAAA-MM-DD, ou null. */
export function dataDoGoogle(d) {
  if (!objeto(d)) return null;
  const a = medida(d.year), m = medida(d.month), dd = medida(d.day);
  if (a === null || m === null || dd === null || !a || !m || !dd) return null;
  return `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/** A oferta de um post ("cupom TESTE10; termos: ..."), ou null. */
function textoDaOferta(o) {
  if (!objeto(o)) return null;
  return [texto(o.cupom, 60) ? `cupom ${texto(o.cupom, 60)}` : null, texto(o.termos, 200) ? `termos: ${texto(o.termos, 200)}` : null, texto(o.link) ? 'resgate pelo link' : null]
    .filter(Boolean).join('; ') || 'sem cupom';
}
const BOTAO_POST = Object.freeze({ LEARN_MORE: 'Saiba mais', CALL: 'Ligar', BOOK: 'Reservar', ORDER: 'Pedir', SHOP: 'Comprar', SIGN_UP: 'Inscrever-se' });
const CATEGORIA_FOTO = Object.freeze({ EXTERIOR: 'fachada', INTERIOR: 'interior', PRODUCT: 'produto', AT_WORK: 'trabalhando', TEAM: 'equipe', LOGO: 'logotipo', COVER: 'capa', ADDITIONAL: 'outras', PROFILE: 'perfil', FOOD_AND_DRINK: 'comida e bebida', MENU: 'cardápio', CUSTOMERS: 'clientes' });

function corpoPerfilDesempenho(p, hoje) {
  const { atual, anterior } = ultimasDuas(p.semanas, 'semana', (s) => s.fechada === true);
  const comparar = (campo) => (anterior ? anterior[campo] : undefined);
  const topo = [];
  if (atual) {
    topo.push(
      blocoNumeros(
        [
          numero({ id: 'impressoes', rotulo: 'Visualizações do perfil', valor: atual.impressoes, anterior: comparar('impressoes'), titulo: 'Soma das visualizações na Busca e no Maps, no celular e no computador. A mesma pessoa conta uma vez por dia.' }),
          numero({ id: 'cliques_site', rotulo: 'Cliques no site', valor: atual.cliques_site, anterior: comparar('cliques_site') }),
          numero({ id: 'ligacoes', rotulo: 'Ligações', valor: atual.ligacoes, anterior: comparar('ligacoes') }),
          numero({ id: 'rotas', rotulo: 'Pedidos de rota', valor: atual.rotas, anterior: comparar('rotas') }),
          numero({ id: 'reservas', rotulo: 'Reservas', valor: atual.reservas, anterior: comparar('reservas') }),
          numero({ id: 'interacoes', rotulo: 'Interações', valor: atual.interacoes, anterior: comparar('interacoes'), titulo: 'Cliques no site, ligações, rotas e reservas somados pelo Painel (pode não bater com a tela do Google).' }),
        ],
        rotuloSemana(atual.semana, anterior?.semana, hoje)
      )
    );
  } else topo.push(blocoTexto('Nenhuma semana fechada medida ainda (a semana fecha 3 dias depois do domingo).'));
  topo.push(blocoNumeros([numero({ id: 'seguidores', rotulo: 'Seguidores', valor: p.seguidores, titulo: 'Total de hoje: a API do Google não tem o histórico.' })], 'Agora'));
  topo.push(blocoGrafico(p.dias, { x: 'data', y: (d) => somaEstrita(VISUALIZACOES.map((k) => d[k])), titulo: 'Visualizações do perfil por dia', unidade: 'visualizações', hoje }));
  // O nome da métrica recusada vem da API (BUSINESS_IMPRESSIONS_...): vai o
  // nome de gente, e a que o mapa não conhece vira "outra métrica diária".
  const recusadas = [...new Set(lista(p.metricas_recusadas).map((m) => traduzir(METRICAS_PERFIL, m, 'outra métrica diária')).filter(Boolean))];
  if (recusadas.length) topo.push(blocoAvisos([{ nivel: 'atencao', texto: `O Google recusou nesta coleta: ${recusadas.join(', ')}.` }]));
  return {
    destaque: atual && medida(atual.impressoes) !== null ? `${formatar('int', atual.impressoes)} visualizações na semana` : null,
    topo,
    secoes: [
      secaoTabela('semanas', 'Por semana', recentesPrimeiro(p.semanas, 'semana'), [
        col('semana', 'Semana de', 'dia'), colSemanaFechada('fechada', 'ainda não fechada', { hoje }), col('impressoes', 'Visualizações', 'int'), col('cliques_site', 'Site', 'int'),
        col('ligacoes', 'Ligações', 'int'), col('rotas', 'Rotas', 'int'), col('reservas', 'Reservas', 'int'), col('cliques', 'Cliques', 'int'), col('interacoes', 'Interações', 'int'),
      ], { hoje, unidade: ['semana', 'semanas'], nota: 'Cada soma só sai com os 7 dias com número: um dia ainda sem dado deixa a semana sem número, e não pela metade.' }),
      secaoTabela('dias', 'Por dia', recentesPrimeiro(p.dias, 'data'), [
        col('data', 'Dia', 'dia'),
        col('impressoes_busca_celular', 'Busca, celular', 'int'),
        col('impressoes_busca_computador', 'Busca, computador', 'int'),
        col('impressoes_maps_celular', 'Maps, celular', 'int'),
        col('impressoes_maps_computador', 'Maps, computador', 'int'),
        col('cliques_site', 'Site', 'int'),
        col('ligacoes', 'Ligações', 'int'),
        col('rotas', 'Rotas', 'int'),
        col('reservas', 'Reservas', 'int'),
        col('cliques_cardapio', 'Cardápio', 'int'),
      ], { hoje, limite: 14, unidade: ['dia', 'dias'], nota: 'O Google não manda o dia zerado: ele só vira 0 depois de fechado (3 dias). Os dias mais novos, que o Google ainda não processou, ficam sem medida.' }),
    ],
    notas: [
      rotuloDia(p.dias_ate, hoje) ? `O Google mandou números até ${rotuloDia(p.dias_ate, hoje)}; os dias depois disso ainda não foram processados por ele.` : null,
      'Interações é a soma do Painel (site, ligações, rotas e reservas) e pode não bater com a tela do Google.',
    ],
  };
}

function corpoPerfilTermos(p, hoje) {
  const meses = recentesPrimeiro(p.termos, 'mes');
  const pessoas = (t) => (medida(t.usuarios) !== null || medida(t.abaixo_de) !== null ? fmtAbaixoDe(t) : null);
  const ordem = (t) => medida(t.usuarios) ?? (medida(t.abaixo_de) !== null ? medida(t.abaixo_de) - 0.5 : null);
  const ultimo = meses[0];
  return {
    destaque: ultimo ? `${plural(lista(ultimo.termos).length, 'termo', 'termos')} em ${rotuloDoMes(ultimo.mes)}` : null,
    topo: [blocoTexto('Pessoas que acharam o perfil por cada termo. Quando o Google só diz "menos que N", a tela escreve isso.')],
    secoes: meses.map((m, i) =>
      secaoTabela(`mes-${m.mes}`, `${rotuloDoMes(m.mes)}${m.completo === false ? ' (mês em andamento)' : ''}`, ordenar(m.termos, ordem), [
        col('termo', 'Termo', 'texto', { max: 120 }),
        col('pessoas', 'Pessoas', 'texto', { valor: pessoas, numerico: true }),
      ], { aberta: i === 0, unidade: ['termo', 'termos'], vazio: 'Nenhum termo neste mês.' })
    ),
    vazio: meses.length ? null : 'O Google não mandou termos de pesquisa nesta coleta.',
  };
}

/** A linha de baixo de uma avaliação: o dia, "editada em" quando o cliente
 *  mudou depois, e as fotos que ele mandou junto. */
function subDaAvaliacao(r, hoje) {
  const criada = rotuloDia(r.criada_em, hoje);
  const editada = r.atualizada_em && r.atualizada_em !== r.criada_em ? rotuloDia(r.atualizada_em, hoje) : null;
  const fotos = medida(r.midias);
  return [criada, editada && editada !== criada ? `editada em ${editada}` : null, fotos ? plural(fotos, 'foto', 'fotos') : null].filter(Boolean).join(' · ') || null;
}
/** A resposta da empresa, com a situação dela no Google quando não é a
 *  publicada (em análise, recusada) e o aviso de política. */
const respostaComProblema = (resp) => (objeto(resp) && ((resp.situacao && !['APPROVED', 'PUBLISHED'].includes(resp.situacao)) || !!resp.violacao));
function detalheDaResposta(resp, hoje) {
  const quando = rotuloDia(resp.em, hoje);
  const situacao = resp.situacao && !['APPROVED', 'PUBLISHED'].includes(resp.situacao) ? ` (${traduzir(SITUACAO_RESPOSTA, resp.situacao, 'em outra situação')})` : '';
  const violacao = resp.violacao ? ` O Google apontou problema de política${typeof resp.violacao === 'string' && texto(resp.violacao, 120) ? `: ${texto(resp.violacao, 120)}` : ''}.` : '';
  return `Resposta${quando ? ` em ${quando}` : ''}${situacao}: ${texto(resp.texto, 400)}${violacao}`;
}

/** O resumo das avaliações no cabeçalho: "nota 4,5 em 4 avaliações". Sem o
 *  total (o Google mandou a média e não a contagem), só a nota: a contagem
 *  que não veio não vira "0 avaliações". */
export function destaqueDasAvaliacoes(a) {
  const media = medida(a?.media), total = medida(a?.total);
  if (media !== null) return `nota ${formatar('dec1', media)}${total !== null ? ` em ${plural(total, 'avaliação', 'avaliações')}` : ''}`;
  return total !== null ? plural(total, 'avaliação', 'avaliações') : null;
}

function corpoPerfilAvaliacoes(a, hoje) {
  const dist = objeto(a.distribuicao) ? a.distribuicao : null;
  // A base das porcentagens é a soma das cinco notas: com uma delas sem
  // número, a soma parcial daria porcentagem errada (fica sem porcentagem).
  const total = dist ? somaEstrita(['1', '2', '3', '4', '5'].map((k) => dist[k])) : null;
  const avaliacoes = recentesPrimeiro(a.lista, 'criada_em');
  return {
    destaque: destaqueDasAvaliacoes(a),
    topo: [
      blocoNumeros([
        numero({ id: 'media', rotulo: 'Nota média', tipo: 'dec1', valor: a.media, titulo: 'De 1 a 5 estrelas.' }),
        numero({ id: 'total', rotulo: 'Avaliações', valor: a.total }),
        numero({ id: 'sem_resposta', rotulo: 'Sem resposta', valor: a.sem_resposta }),
        numero({ id: 'taxa_resposta', rotulo: 'Respondidas', tipo: 'fracao', valor: a.taxa_resposta, titulo: 'Avaliações com resposta da empresa.' }),
        numero({ id: 'resposta_media', rotulo: 'Tempo médio de resposta', tipo: 'horas', valor: a.resposta_media_horas }),
      ]),
      dist ? blocoBarras(['5', '4', '3', '2', '1'].map((k) => ({ rotulo: `${k} ${k === '1' ? 'estrela' : 'estrelas'}`, valor: dist[k] })), { titulo: 'Distribuição das notas', total }) : null,
      a.completas === false ? blocoAvisos([{ nivel: 'info', texto: 'A lista do Google veio incompleta nesta coleta; as avaliações já guardadas continuam aqui.' }]) : null,
    ],
    secoes: [
      secao('recentes', 'Mais recentes', [
        avaliacoes.length
          ? {
            tipo: 'lista',
            itens: avaliacoes.slice(0, 20).map((r, i) => {
              const estrelas = medida(r.estrelas);
              const resposta = objeto(r.resposta) && texto(r.resposta.texto);
              return {
                id: String(r.id ?? i),
                titulo: `${estrelas === null ? 'sem nota' : `${formatar('int', estrelas)} de 5`} · ${r.anonimo ? 'anônimo' : texto(r.autor, 80) ?? 'sem nome'}`,
                sub: subDaAvaliacao(r, hoje),
                texto: texto(r.comentario, 600) ?? 'Sem comentário.',
                detalhe: resposta ? detalheDaResposta(r.resposta, hoje) : 'Ainda sem resposta.',
                tom: estrelas !== null && estrelas <= 2 ? 'bad' : estrelas === 3 ? 'warn' : 'neutral',
                tomDetalhe: resposta && !respostaComProblema(r.resposta) ? 'neutral' : 'warn',
              };
            }),
          }
          : blocoTexto('Nenhuma avaliação guardada.'),
      ], { aberta: true, resumo: avaliacoes.length ? `${plural(Math.min(avaliacoes.length, 20), 'avaliação', 'avaliações')}${avaliacoes.length > 20 ? ` de ${formatar('int', avaliacoes.length)}` : ''}` : 'nenhuma' }),
      secaoTabela('por_semana', 'Por semana', recentesPrimeiro(a.por_semana, 'semana'), [col('semana', 'Semana de', 'dia'), col('novas', 'Novas', 'int'), col('media', 'Nota média', 'dec1')], { hoje, unidade: ['semana', 'semanas'] }),
    ],
    notas: medida(a.guardadas) !== null && medida(a.total) !== null && medida(a.guardadas) !== medida(a.total)
      ? [`O Painel guarda ${formatar('int', a.guardadas)} das ${formatar('int', a.total)} avaliações que o Google conta.`]
      : [],
  };
}

function corpoPerfilPosts(p, hoje) {
  const posts = Array.isArray(p.posts) ? recentesPrimeiro(p.posts, 'criado_em') : null;
  const fotos = objeto(p.fotos) ? p.fotos : null;
  return {
    destaque: posts ? plural(posts.filter((x) => x.situacao === 'LIVE').length, 'post no ar', 'posts no ar') : null,
    topo: [
      blocoNumeros([
        numero({ id: 'posts', rotulo: 'Posts no ar', valor: posts ? posts.filter((x) => x.situacao === 'LIVE').length : null }),
        numero({ id: 'fotos_empresa', rotulo: 'Fotos da empresa', valor: fotos?.empresa }),
        numero({ id: 'fotos_clientes', rotulo: 'Fotos de clientes', valor: fotos?.clientes }),
      ]),
    ],
    secoes: [
      secaoTabela('posts', 'Posts', posts, [
        col('criado_em', 'Data', 'dia'),
        col('tipo', 'Tipo', 'texto', { valor: (x) => traduzir(TIPO_POST, x.tipo, 'outro tipo') }),
        col('situacao', 'Situação', 'texto', { valor: (x) => traduzir(SITUACAO_POST, x.situacao, 'outra situação'), tom: (x) => (x.situacao === 'REJECTED' ? 'bad' : null) }),
        col('texto', 'Texto', 'texto', { valor: (x) => x.evento?.titulo || x.texto, max: 140, link: (x) => x.link }),
        col('botao', 'Botão', 'texto', { valor: (x) => (objeto(x.botao) ? traduzir(BOTAO_POST, x.botao.tipo, 'outro botão') : null), link: (x) => x.botao?.url }),
        col('evento', 'Data do evento', 'texto', { valor: (x) => (objeto(x.evento) && objeto(x.evento.agenda) ? rotuloPeriodo(dataDoGoogle(x.evento.agenda.startDate), dataDoGoogle(x.evento.agenda.endDate), hoje) : null) }),
        col('oferta', 'Oferta', 'texto', { valor: (x) => textoDaOferta(x.oferta), link: (x) => x.oferta?.link, max: 200 }),
        col('agendado_em', 'Agendado para', 'instante'),
        col('atualizado_em', 'Atualizado', 'dia'),
      ], { hoje, aberta: true, unidade: ['post', 'posts'], semDado: 'O Google não mandou os posts nesta coleta.', vazio: 'Nenhum post publicado.' }),
      secaoTabela('fotos', 'Fotos recentes', fotos ? recentesPrimeiro(fotos.recentes, 'criada_em') : null, [
        col('criada_em', 'Data', 'dia'),
        col('categoria', 'Categoria', 'texto', { valor: (x) => traduzir(CATEGORIA_FOTO, x.categoria, 'outra categoria') }),
        col('formato', 'Formato', 'texto', { valor: (x) => traduzir({ PHOTO: 'foto', VIDEO: 'vídeo' }, x.formato, 'outro formato'), link: (x) => x.link }),
      ], { hoje, unidade: ['foto', 'fotos'], semDado: 'O Google não mandou as fotos nesta coleta.', vazio: 'Nenhuma foto recente.' }),
    ],
    notas: ['O Google desligou os números por post em 2023: o post aparece sem alcance.'],
  };
}

function corpoPerfilDados(p) {
  const local = objeto(p.local) ? p.local : {};
  const conta = objeto(p.conta) ? p.conta : {};
  const situacao = objeto(local.situacao) ? local.situacao : null;
  const alteracoes = objeto(local.alteracoes_google) ? local.alteracoes_google : null;
  return {
    destaque: texto(local.categoria, 60),
    topo: [
      blocoPares([
        { rotulo: 'Nome', valor: local.nome },
        { rotulo: 'Categoria', valor: local.categoria },
        { rotulo: 'Outras categorias', valor: lista(local.categorias_extra).join(', ') || null },
        { rotulo: 'Endereço', valor: local.endereco },
        { rotulo: 'Telefone', valor: local.telefone },
        { rotulo: 'Site', valor: local.site, link: local.site },
        { rotulo: 'No Maps', valor: local.maps ? 'abrir no Google Maps' : null, link: local.maps },
        { rotulo: 'Pedir avaliação', valor: local.pedir_avaliacao ? 'link para mandar ao cliente' : null, link: local.pedir_avaliacao },
        { rotulo: 'Funcionamento', valor: traduzir({ OPEN: 'aberto', CLOSED_PERMANENTLY: 'fechado de vez', CLOSED_TEMPORARILY: 'fechado por um tempo', OPEN_FOR_BUSINESS_UNSPECIFIED: 'não informado' }, local.aberto, 'outra situação') },
        { rotulo: 'Descrição', valor: local.descricao },
        { rotulo: 'Pode postar', valor: local.pode_postar, tipo: 'sim' },
        // A voz do comerciante também vem na situação do perfil; sem ela, a
        // dos dados do local vai aqui.
        !situacao && { rotulo: 'Voz do comerciante', valor: local.voz_do_comerciante, tipo: 'sim' },
        { rotulo: 'Alterações pendentes', valor: local.alteracoes_pendentes, tipo: 'sim' },
        { rotulo: 'O Google mudou algum dado', valor: local.google_alterou, tipo: 'sim' },
        { rotulo: 'Conta', valor: conta.nome },
        { rotulo: 'Tipo da conta', valor: traduzir(TIPO_CONTA_GBP, conta.tipo, 'outro tipo') },
        { rotulo: 'Papel na conta', valor: traduzir({ OWNER: 'dono', PRIMARY_OWNER: 'dono principal', MANAGER: 'administrador', SITE_MANAGER: 'gerente do site' }, conta.papel, 'outro papel') },
        { rotulo: 'Verificação', valor: traduzir({ VERIFIED: 'verificada', UNVERIFIED: 'não verificada', VERIFICATION_REQUESTED: 'verificação pedida' }, conta.verificacao, 'outra situação') },
        { rotulo: 'Contas que o login enxerga', valor: p.contas, tipo: 'int' },
        { rotulo: 'Outros locais', valor: lista(p.outros_locais).map((o) => texto(o?.nome, 80)).filter(Boolean).join(', ') || null },
      ]),
    ],
    secoes: [
      secaoTabela('atributos', 'Atributos', Array.isArray(local.atributos) ? local.atributos.filter(objeto) : null, [
        col('nome', 'Atributo', 'texto', { valor: (x) => nomeDoAtributo(x.nome) }),
        col('valores', 'Valor', 'texto', { valor: (x) => valoresDoAtributo(x.valores), link: (x) => linkDoAtributo(x.valores), max: 300 }),
      ], { unidade: ['atributo', 'atributos'], semDado: 'O Google não mandou os atributos.' }),
      situacao
        ? secao('situacao', 'Situação do perfil', [blocoPares([
          { rotulo: 'Voz do comerciante', valor: situacao.voz_do_comerciante, tipo: 'sim' },
          { rotulo: 'Autoridade sobre o perfil', valor: situacao.autoridade, tipo: 'sim' },
          { rotulo: 'Aguardando', valor: situacao.aguardando, tipo: 'sim' },
          { rotulo: 'Verificação pendente', valor: situacao.verificacao_pendente, tipo: 'sim' },
          { rotulo: 'Conflito com outro perfil', valor: situacao.conflito, tipo: 'sim' },
          { rotulo: 'Problema', valor: traduzir(PROBLEMA_PERFIL, situacao.problema, 'o Google apontou um problema; confira no Perfil da Empresa') },
        ])])
        : null,
      // As máscaras do Google ("title,phoneNumbers") viram os nomes dos
      // campos; as pendentes também (antes iam como número e sumiam).
      alteracoes
        ? secao('alteracoes_google', 'Alterações do Google', [blocoPares([
          { rotulo: 'Campos', valor: camposDaMascara(alteracoes.campos) },
          typeof alteracoes.pendentes === 'boolean'
            ? { rotulo: 'Pendentes', valor: alteracoes.pendentes, tipo: 'sim' }
            : { rotulo: 'Pendentes', valor: camposDaMascara(alteracoes.pendentes) },
        ])])
        : null,
    ],
  };
}

/** Os quadros do Perfil da Empresa (ligação google/perfil do canal google):
 *  buscas e ações, termos de pesquisa, avaliações, posts e fotos, e os dados
 *  do perfil. Sem dado nenhum, um quadro só, com o estado. */
export function quadrosPerfilEmpresa(l, { hoje } = {}) {
  const p = objeto(l?.dados) ? l.dados : null;
  const base = { ligacao: l, rotuloFonte: 'Perfil da Empresa', hoje };
  if (!p) return [montarQuadro({ ...base, id: 'perfil', titulo: 'Perfil da Empresa', temDado: false })];
  return [
    montarQuadro({
      ...base, id: 'perfil-desempenho', titulo: 'Buscas e ações no perfil',
      temDado: lista(p.semanas).length > 0 || lista(p.dias).length > 0 || medida(p.seguidores) !== null,
      corpo: () => corpoPerfilDesempenho(p, hoje),
    }),
    montarQuadro({ ...base, id: 'perfil-termos', titulo: 'Termos de pesquisa', temDado: Array.isArray(p.termos), vazio: 'O Google não mandou os termos de pesquisa nesta coleta.', corpo: () => corpoPerfilTermos(p, hoje) }),
    montarQuadro({ ...base, id: 'perfil-avaliacoes', titulo: 'Avaliações', temDado: objeto(p.avaliacoes), vazio: 'O Google não mandou as avaliações nesta coleta.', corpo: () => corpoPerfilAvaliacoes(p.avaliacoes, hoje) }),
    montarQuadro({ ...base, id: 'perfil-posts', titulo: 'Posts e fotos', temDado: Array.isArray(p.posts) || objeto(p.fotos), vazio: 'O Google não mandou os posts nem as fotos nesta coleta.', corpo: () => corpoPerfilPosts(p, hoje) }),
    montarQuadro({ ...base, id: 'perfil-dados', titulo: 'Dados do perfil', temDado: objeto(p.local) || objeto(p.conta), vazio: 'O Google não mandou os dados do perfil nesta coleta.', corpo: () => corpoPerfilDados(p) }),
  ];
}
