/* O CONECTOR "meta" NA SUB-ABA "DADOS": a Página do Facebook, os anúncios e
 * o Pixel (canal facebook) e o Instagram (canal instagram).
 *
 * O formato é o da seção FORMATO de
 * supabase/functions/_shared/mkt-fontes/meta.mjs. Regras da Meta que a tela
 * segura:
 *  - os números do Instagram INCLUEM anúncio e conteúdo impulsionado: a tela
 *    não os chama de orgânicos (a observação do conector vai no quadro);
 *  - a soma da semana da Página só vale com os 7 dias medidos (o conector já
 *    deixa null quando faltou dia; aqui não se soma por cima);
 *  - o ctr da Meta já vem em porcentagem (fmtPorcento); o CTR e o CPC do
 *    período inteiro são calculados pelo Painel das somas, e o title diz;
 *  - alcance não soma entre semanas (a mesma pessoa conta de novo): o
 *    período mostra gasto, cliques e leads, e o alcance fica por semana;
 *  - o valor e o custo de cada ação (valores_acoes, custo_por_acao) são da
 *    Meta por campanha e por semana; no período inteiro o custo por ação é
 *    conta do Painel (gasto dividido pela quantidade), porque custo não se
 *    soma. Ação sem valor fica sem valor, nunca R$ 0.
 */
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
  formatar,
  lista,
  medida,
  montarQuadro,
  numero,
  objeto,
  ordenar,
  plural,
  razao,
  rotuloDia,
  rotuloPeriodo,
  secao,
  secaoTabela,
  somaDisponivel,
  somarMapas,
  texto,
  textoDoMapa,
  traduzir,
  ultimasDuas,
} from './marketing-dados.js';
import { rotuloSemana } from './marketing-dados-google.js';

const recentesPrimeiro = (linhas, campo) => [...lista(linhas)].filter(objeto).sort((a, b) => String(b[campo] ?? '').localeCompare(String(a[campo] ?? '')));

/** Os países (ISO de duas letras, como a Meta manda) que mais aparecem; o
 *  resto aparece com o código. */
export const PAISES = Object.freeze({
  BR: 'Brasil', PT: 'Portugal', US: 'Estados Unidos', AR: 'Argentina', PY: 'Paraguai', UY: 'Uruguai', CL: 'Chile', ES: 'Espanha', IT: 'Itália',
  FR: 'França', DE: 'Alemanha', GB: 'Reino Unido', JP: 'Japão', AO: 'Angola', MZ: 'Moçambique', MX: 'México', CA: 'Canadá', CO: 'Colômbia', PE: 'Peru', BO: 'Bolívia',
});
const TAREFAS = Object.freeze({ ANALYZE: 'analisar', CREATE_CONTENT: 'criar conteúdo', MODERATE: 'moderar', ADVERTISE: 'anunciar', MESSAGING: 'mensagens', MANAGE: 'gerenciar' });
const OBJETIVO = Object.freeze({
  OUTCOME_LEADS: 'leads', OUTCOME_TRAFFIC: 'tráfego', OUTCOME_ENGAGEMENT: 'engajamento', OUTCOME_AWARENESS: 'reconhecimento', OUTCOME_SALES: 'vendas',
  OUTCOME_APP_PROMOTION: 'aplicativo', LEAD_GENERATION: 'leads', LINK_CLICKS: 'tráfego', MESSAGES: 'mensagens', POST_ENGAGEMENT: 'engajamento',
});
const SITUACAO = Object.freeze({
  ACTIVE: 'ativa', PAUSED: 'pausada', DELETED: 'apagada', ARCHIVED: 'arquivada', CAMPAIGN_PAUSED: 'pausada', ADSET_PAUSED: 'conjunto pausado',
  IN_PROCESS: 'em análise', WITH_ISSUES: 'com problema', PENDING_REVIEW: 'em revisão', DISAPPROVED: 'reprovada',
});
const PLATAFORMA = Object.freeze({ facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger', audience_network: 'Audience Network', threads: 'Threads', whatsapp: 'WhatsApp' });
/** As ações da Meta que mais aparecem, com nome de gente (o resto aparece
 *  com o código da Meta). */
export const ACOES_META = Object.freeze({
  link_click: 'cliques no link', lead: 'leads', 'onsite_conversion.lead_grouped': 'leads de formulário', 'offsite_conversion.fb_pixel_lead': 'leads no site (Pixel)',
  'onsite_conversion.messaging_conversation_started_7d': 'conversas iniciadas', 'onsite_conversion.messaging_first_reply': 'primeiras respostas',
  post_engagement: 'engajamento com o post', page_engagement: 'engajamento com a Página', video_view: 'visualizações de vídeo',
  landing_page_view: 'visitas à página de destino', post_reaction: 'reações', comment: 'comentários', 'onsite_conversion.post_save': 'salvamentos',
  like: 'curtidas da Página', post: 'compartilhamentos', 'offsite_conversion.fb_pixel_contact': 'contatos no site (Pixel)',
  'offsite_conversion.fb_pixel_purchase': 'compras no site (Pixel)', purchase: 'compras', omni_purchase: 'compras',
});
const nomeDaAcao = (k) => traduzir(ACOES_META, String(k ?? '').replace(/^actions:/, ''));
const TIPO_POST = Object.freeze({ added_photos: 'foto', added_video: 'vídeo', shared_story: 'compartilhamento', mobile_status_update: 'texto', created_event: 'evento', created_note: 'nota' });
const ORIGEM_PIXEL = Object.freeze({ WEB: 'site (navegador)', APP: 'aplicativo', OFFLINE: 'offline', SERVER: 'servidor (API de conversões)', CAPI: 'servidor (API de conversões)' });
// Os detalhes por tipo dos posts da Página, com o nome da tela do Facebook.
const REACOES_FB = Object.freeze({ like: 'curtir', love: 'amei', wow: 'uau', haha: 'haha', sorry: 'triste', anger: 'grr', care: 'força', thankful: 'gratidão', pride: 'orgulho' });
const CLIQUES_FB = Object.freeze({ 'link clicks': 'cliques no link', 'other clicks': 'outros cliques', 'photo view': 'ver a foto', 'video play': 'tocar o vídeo' });
const ATIVIDADE_FB = Object.freeze({ comment: 'comentários', like: 'curtidas', share: 'compartilhamentos' });

/** O detalhe {tipo: n} da Meta em uma linha ("curtir 26, amei 4"). */
const porTipo = (mapa, nomes = {}) => textoDoMapa(mapa, { rotular: (k) => traduzir(nomes, k) });

const mapaEmBarras = (mapa, rotular = (k) => k) =>
  objeto(mapa) ? ordenar(Object.entries(mapa).map(([k, v]) => ({ rotulo: rotular(k), valor: v })), 'valor') : null;

/* -------------------------------------------------------- a Página -- */

function corpoPagina(p, hoje) {
  const { atual, anterior } = ultimasDuas(p.por_semana);
  const comparar = (campo) => (anterior ? anterior[campo] : undefined);
  const s = (campo, rotulo, extra = {}) => numero({ id: campo, rotulo, valor: atual?.[campo], anterior: comparar(campo), ...extra });
  const tituloSemana = atual
    ? `${rotuloSemana(atual.semana, anterior?.semana, hoje)}${medida(atual.dias_com_dado) !== null && atual.dias_com_dado < 7 ? ` (${atual.dias_com_dado} de 7 dias medidos: o que precisa da semana inteira fica sem número)` : ''}`
    : null;
  const paises = mapaEmBarras(p.seguidores_por_pais, (k) => traduzir(PAISES, k));
  const cidades = mapaEmBarras(p.seguidores_por_cidade);
  const posts = Array.isArray(p.posts) ? recentesPrimeiro(p.posts, 'criado_em') : null;
  const colData = col('data', 'Data', 'dia');
  const colPost = col('titulo', 'Post', 'texto', { valor: (x) => x.titulo || (x.link ? 'abrir o post' : null), link: (x) => x.link, max: 120 });
  const comTipos = posts ? posts.filter((x) => objeto(x.reacoes_por_tipo) || objeto(x.cliques_por_tipo) || objeto(x.atividade_por_tipo)) : [];
  const comVideo = posts ? posts.filter((x) => objeto(x.video)) : [];
  return {
    destaque: medida(p.seguidores) !== null ? `${formatar('int', p.seguidores)} seguidores` : null,
    topo: [
      blocoNumeros([
        numero({ id: 'seguidores', rotulo: 'Seguidores', valor: p.seguidores }),
        numero({ id: 'curtidas', rotulo: 'Curtidas da Página', valor: p.curtidas }),
        numero({ id: 'falando', rotulo: 'Falando sobre', valor: p.falando_sobre }),
        numero({ id: 'avaliacoes', rotulo: 'Avaliações', valor: p.avaliacoes }),
        numero({ id: 'nota', rotulo: 'Nota', tipo: 'dec1', valor: p.nota, titulo: 'De 1 a 5.' }),
        numero({ id: 'checkins', rotulo: 'Check-ins', valor: p.check_ins }),
        numero({ id: 'alcance28', rotulo: 'Alcance em 28 dias', valor: p.alcance_28_dias, titulo: `Pessoas únicas que viram a Página ou os posts em 28 dias${rotuloDia(p.alcance_28_dias_ate, hoje) ? ` até ${rotuloDia(p.alcance_28_dias_ate, hoje)}` : ''}.` }),
      ], 'Agora'),
      atual
        ? blocoNumeros([
          s('alcance', 'Alcance'),
          s('visualizacoes', 'Visualizações'),
          s('engajamento', 'Engajamento'),
          s('cliques_acao', 'Cliques em ações', { titulo: 'Cliques nos botões e contatos da Página.' }),
          s('visitas_perfil', 'Visitas ao perfil'),
          s('novos_seguidores', 'Novos seguidores'),
          s('deixaram_de_seguir', 'Deixaram de seguir', { subirE: 'ruim' }),
          s('video_visualizacoes', 'Visualizações de vídeo'),
        ], tituloSemana)
        : blocoTexto('Nenhuma semana fechada medida ainda.'),
      blocoGrafico(p.por_dia, { x: 'dia', y: 'visualizacoes', titulo: 'Visualizações por dia', unidade: 'visualizações', hoje }),
    ],
    secoes: [
      secaoTabela('posts', 'Posts', posts, [
        colData,
        colPost,
        col('tipo', 'Tipo', 'texto', { valor: (x) => traduzir(TIPO_POST, x.tipo) }),
        col('alcance', 'Alcance', 'int'),
        col('visualizacoes', 'Visualizações', 'int'),
        col('reacoes', 'Reações', 'int', { titulo: (x) => porTipo(x.reacoes_por_tipo, REACOES_FB) }),
        col('comentarios', 'Comentários', 'int'),
        col('compartilhamentos', 'Compart.', 'int'),
        col('engajamento', 'Engajamento', 'int', { titulo: (x) => porTipo(x.atividade_por_tipo, ATIVIDADE_FB) }),
        col('cliques', 'Cliques', 'int', { titulo: (x) => porTipo(x.cliques_por_tipo, CLIQUES_FB) }),
        col('video', 'Vídeo (vis.)', 'int', { valor: (x) => x.video?.visualizacoes }),
      ], { hoje, aberta: true, unidade: ['post', 'posts'], vazio: 'Nenhum post nos últimos 90 dias.', semDado: 'A Meta não mandou os posts nesta coleta.' }),
      // Os detalhes por tipo e os números de vídeo, só quando algum post tem.
      comTipos.length
        ? secaoTabela('posts_tipos', 'Reações e cliques por post', comTipos, [
          colData,
          colPost,
          col('reacoes_por_tipo', 'Reações por tipo', 'texto', { valor: (x) => porTipo(x.reacoes_por_tipo, REACOES_FB) }),
          col('cliques_por_tipo', 'Cliques por tipo', 'texto', { valor: (x) => porTipo(x.cliques_por_tipo, CLIQUES_FB) }),
          col('atividade_por_tipo', 'Atividade por tipo', 'texto', { valor: (x) => porTipo(x.atividade_por_tipo, ATIVIDADE_FB) }),
        ], { hoje, unidade: ['post', 'posts'] })
        : null,
      comVideo.length
        ? secaoTabela('posts_video', 'Vídeos dos posts', comVideo, [
          colData,
          colPost,
          col('v_vis', 'Visualizações', 'int', { valor: (x) => x.video.visualizacoes }),
          col('v_medio', 'Tempo médio', 'ms', { valor: (x) => x.video.tempo_medio_ms }),
          col('v_total', 'Tempo total', 'durms', { valor: (x) => x.video.tempo_total_ms }),
          col('v_organicas', 'Completas orgânicas', 'int', { valor: (x) => x.video.completas_organicas }),
          col('v_pagas', 'Completas pagas', 'int', { valor: (x) => x.video.completas_pagas }),
        ], { hoje, unidade: ['vídeo', 'vídeos'] })
        : null,
      secaoTabela('reels', 'Reels', Array.isArray(p.reels) ? recentesPrimeiro(p.reels, 'criado_em') : null, [
        col('data', 'Data', 'dia'),
        col('titulo', 'Reel', 'texto', { valor: (x) => x.titulo || (x.link ? 'abrir o Reel' : null), link: (x) => x.link, max: 120 }),
        col('duracao_s', 'Duração', 'dur'),
        col('reproducoes', 'Reproduções', 'int'),
        col('reproducoes_total', 'Reproduções totais', 'int'),
        col('repeticoes', 'Repetições', 'int'),
        col('tempo_medio_ms', 'Tempo médio', 'ms'),
        col('tempo_total_ms', 'Tempo total', 'durms'),
        col('seguidores_ganhos', 'Seguidores ganhos', 'int'),
        col('acoes_sociais', 'Ações', 'int'),
      ], { hoje, unidade: ['reel', 'reels'], resumo: Array.isArray(p.reels) ? undefined : 'a Meta não deixou', semDado: 'A Meta não deixou listar os Reels: ela pede permissão de escrita para isso.' }),
      secaoTabela('semanas', 'Por semana', recentesPrimeiro(p.por_semana, 'semana'), [
        col('semana', 'Semana de', 'dia'),
        col('dias_com_dado', 'Dias medidos', 'int'),
        col('alcance', 'Alcance', 'int'),
        col('visualizacoes', 'Visualizações', 'int'),
        col('engajamento', 'Engajamento', 'int'),
        col('cliques_acao', 'Cliques em ações', 'int'),
        col('visitas_perfil', 'Visitas', 'int'),
        col('novos_seguidores', 'Novos seguidores', 'int'),
        col('deixaram_de_seguir', 'Deixaram de seguir', 'int'),
        col('video_visualizacoes', 'Vídeo (vis.)', 'int'),
      ], { hoje, unidade: ['semana', 'semanas'], nota: 'A soma da semana só sai com os 7 dias medidos.' }),
      secaoTabela('dias', 'Por dia', recentesPrimeiro(p.por_dia, 'dia'), [
        col('dia', 'Dia', 'dia'),
        col('visualizacoes', 'Visualizações', 'int'),
        col('engajamento', 'Engajamento', 'int'),
        col('cliques_acao', 'Cliques em ações', 'int'),
        col('visitas_perfil', 'Visitas', 'int'),
        col('novos_seguidores', 'Novos', 'int'),
        col('deixaram_de_seguir', 'Deixaram', 'int'),
        col('seguidores_liquidos', 'Seguidores', 'int'),
        col('video_visualizacoes', 'Vídeo (vis.)', 'int'),
        col('video_tempo_ms', 'Tempo de vídeo', 'durms'),
        col('reacoes', 'Reações', 'texto', { valor: (x) => (objeto(x.reacoes) ? porTipo(x.reacoes, REACOES_FB) ?? 'nenhuma' : null) }),
      ], { hoje, limite: 14, unidade: ['dia', 'dias'] }),
      secao('paises', 'Seguidores por país', [paises ? blocoBarras(paises, { total: somaDisponivel(paises.map((x) => x.valor)) }) : blocoTexto('A Meta não mandou nesta coleta.')], { resumo: paises ? plural(paises.length, 'país', 'países') : 'não medido' }),
      secao('cidades', 'Seguidores por cidade', [cidades ? blocoBarras(cidades.slice(0, 15)) : blocoTexto('A Meta não mandou nesta coleta (ela pode ter recusado a métrica).')], { resumo: cidades ? plural(cidades.length, 'cidade', 'cidades') : 'não medido' }),
      secao('sobre', 'Sobre a Página', [
        blocoPares([
          { rotulo: 'Página', valor: p.nome },
          { rotulo: 'Usuário', valor: p.usuario },
          { rotulo: 'Link', valor: p.link, link: p.link },
          { rotulo: 'Categoria', valor: p.categoria },
          { rotulo: 'O que o usuário do sistema pode fazer', valor: Array.isArray(p.tarefas) ? p.tarefas.map((t) => traduzir(TAREFAS, t)).join(', ') || 'nada' : null },
          { rotulo: 'Como a Página foi achada', valor: traduzir({ link: 'pelo link do canal Facebook', unica: 'é a única que o usuário vê', primeira: 'a primeira da lista (o canal não tem link)' }, p.escolhida_por) },
        ]),
      ]),
    ],
    notas: [texto(p.fuso, 300)],
  };
}

/** O quadro da Página do Facebook (ligação meta/pagina do canal facebook). */
export function quadrosPaginaFacebook(l, { hoje } = {}) {
  const p = objeto(l?.dados) ? l.dados : null;
  const temDado = !!p && (medida(p.seguidores) !== null || lista(p.por_semana).length > 0 || Array.isArray(p.posts) || !!texto(p.nome));
  return [montarQuadro({ id: 'meta-pagina', titulo: 'Página do Facebook', rotuloFonte: 'Meta', ligacao: l, temDado, hoje, corpo: () => corpoPagina(p, hoje) })];
}

/* ------------------------------------------------------- os anúncios -- */

/** Os resultados da Meta ([{indicador, valor}]) em uma linha: "3 leads de
 *  formulário". Sem a lista: null; resultado sem número diz "não medido". */
export function textoResultados(lst) {
  if (!Array.isArray(lst)) return null;
  return lst.filter(objeto).map((r) => {
    const nome = nomeDaAcao(String(r.indicador ?? '').split(':').pop() ?? '');
    return medida(r.valor) === null ? `${nome}: ${formatar('int', null)}` : `${formatar('int', r.valor)} ${nome}`;
  }).join(', ') || null;
}

/** O custo por resultado da Meta ([{indicador, valor}], o mesmo formato dos
 *  resultados) em dinheiro: "leads de formulário: R$ 15,07". */
export function textoCustoPorResultado(lst, moeda = 'BRL') {
  if (!Array.isArray(lst)) return null;
  return lst.filter(objeto).map((r) => `${nomeDaAcao(String(r.indicador ?? '').split(':').pop() ?? '')}: ${formatar('moeda', r.valor, { moeda })}`).join(', ') || null;
}

/** As ações de UMA linha dos anúncios (a LINHA da Meta): a quantidade
 *  (acoes), o valor (valores_acoes) e o custo por ação (custo_por_acao) de
 *  cada tipo de ação que aparece em qualquer dos três mapas. O que não veio
 *  num mapa fica null ali, nunca 0: a Meta só manda o valor da ação que tem
 *  valor e o custo da ação que aconteceu. */
export function acoesDaLinha(l) {
  if (!objeto(l)) return [];
  const mapa = (k) => (objeto(l[k]) ? l[k] : {});
  const acoes = mapa('acoes'), valores = mapa('valores_acoes'), custos = mapa('custo_por_acao');
  const tipos = [...new Set([...Object.keys(acoes), ...Object.keys(valores), ...Object.keys(custos)])];
  return ordenar(tipos.map((k) => ({ chave: k, quantidade: medida(acoes[k]), valor: medida(valores[k]), custo: medida(custos[k]) })), 'quantidade');
}

/** As ações do período inteiro (somadas nas semanas da conta). A quantidade
 *  e o valor somam; o custo por ação não soma, então é conta do Painel: o
 *  gasto do período dividido pela quantidade. Sem quantidade (ou com zero)
 *  o custo fica null, e nenhuma ação vira R$ 0. */
export function acoesDoPeriodo(semanas) {
  const linhas = lista(semanas).filter(objeto);
  const gasto = somaDisponivel(linhas.map((s) => s.gasto));
  const porTipo = new Map();
  for (const s of linhas) {
    for (const a of acoesDaLinha(s)) {
      if (!porTipo.has(a.chave)) porTipo.set(a.chave, { chave: a.chave, quantidades: [], valores: [] });
      porTipo.get(a.chave).quantidades.push(a.quantidade);
      porTipo.get(a.chave).valores.push(a.valor);
    }
  }
  return ordenar([...porTipo.values()].map((t) => {
    const quantidade = somaDisponivel(t.quantidades);
    return { chave: t.chave, quantidade, valor: somaDisponivel(t.valores), custo: razao(gasto, quantidade) };
  }), 'quantidade');
}

/** As ações de cada linha (campanha ou semana), uma linha por ação, com os
 *  números da própria Meta. `chaveDaLinha(linha)` dá a chave da linha de
 *  origem (que vai junto, em `origem`). */
export function acoesPorLinha(linhas, chaveDaLinha) {
  return lista(linhas).filter(objeto).flatMap((l, i) =>
    acoesDaLinha(l).map((a) => ({ ...a, origem: l, id: `${chaveDaLinha(l) ?? i}-${a.chave}` }))
  );
}

function corpoConta(c, periodo, hoje) {
  const moeda = texto(c.moeda, 3) || 'BRL';
  const semanas = lista(c.por_semana).filter(objeto);
  const soma = (k) => somaDisponivel(semanas.map((s) => s[k]));
  const gasto = soma('gasto'), impressoes = soma('impressoes'), cliques = soma('cliques'), leads = soma('leads');
  const { atual, anterior } = ultimasDuas(semanas, 'semana', (s) => s.fechada !== false);
  const comparar = (campo) => (anterior ? anterior[campo] : undefined);
  // As taxas de cada plataforma no período são contas do Painel com as
  // somas (taxa não se soma entre semanas).
  const plataformas = ordenar(agrupar(c.por_plataforma, 'plataforma', ['gasto', 'impressoes', 'cliques', 'cliques_link', 'cliques_saida', 'leads', 'conversas', 'primeiras_respostas'], (x) => ({ plataforma: x.plataforma })), 'gasto')
    .map((x) => ({ ...x, ctr: razao(x.cliques, x.impressoes), cpc: razao(x.gasto, x.cliques), cpm: x.impressoes ? razao(x.gasto, x.impressoes / 1000) : null }));
  const campanhas = Array.isArray(c.campanhas) ? ordenar(c.campanhas, 'gasto') : null;
  const nomeDaCampanha = new Map(lista(c.campanhas).filter(objeto).map((x) => [String(x.id), texto(x.nome, 100)]));
  const orcamento = (x) => {
    const dia = medida(x.orcamento_diario_centavos), total = medida(x.orcamento_total_centavos);
    if (dia !== null) return `${formatar('moeda', dia / 100, { moeda })} por dia`;
    if (total !== null) return `${formatar('moeda', total / 100, { moeda })} no total`;
    return null;
  };
  const acoesPeriodo = acoesDoPeriodo(semanas);
  const acoesCampanhas = acoesPorLinha(campanhas, (x) => x.id);
  const acoesSemanas = acoesPorLinha(recentesPrimeiro(semanas, 'semana'), (x) => x.semana);
  const tiposDeAcao = new Set([...acoesPeriodo, ...acoesCampanhas, ...acoesSemanas].map((a) => a.chave)).size;
  const colsAcao = [
    col('chave', 'Ação', 'texto', { valor: (x) => nomeDaAcao(x.chave), titulo: (x) => x.chave }),
    col('quantidade', 'Quantidade', 'num2'),
    col('valor', 'Valor', 'moeda'),
    col('custo', 'Custo por ação', 'moeda'),
  ];
  return {
    destaque: gasto !== null ? `${formatar('moeda', gasto, { moeda })} no período` : null,
    topo: [
      blocoNumeros([
        numero({ id: 'gasto', rotulo: 'Gasto', tipo: 'moeda', moeda, valor: gasto }),
        numero({ id: 'impressoes', rotulo: 'Impressões', valor: impressoes }),
        numero({ id: 'cliques', rotulo: 'Cliques', valor: cliques }),
        numero({ id: 'cliques_link', rotulo: 'Cliques no link', valor: soma('cliques_link') }),
        numero({ id: 'cliques_saida', rotulo: 'Cliques de saída', valor: soma('cliques_saida'), titulo: 'Cliques que levaram para fora da Meta (o site, o WhatsApp).' }),
        numero({ id: 'ctr', rotulo: 'CTR', tipo: 'fracao', valor: razao(cliques, impressoes), titulo: 'Cliques divididos pelas impressões do período (conta do Painel).' }),
        numero({ id: 'cpc', rotulo: 'CPC', tipo: 'moeda', moeda, valor: razao(gasto, cliques), titulo: 'Gasto dividido pelos cliques do período (conta do Painel).' }),
        numero({ id: 'leads', rotulo: 'Leads', valor: leads }),
        numero({ id: 'conversas', rotulo: 'Conversas', valor: soma('conversas') }),
        numero({ id: 'primeiras_respostas', rotulo: 'Primeiras respostas', valor: soma('primeiras_respostas'), titulo: 'Conversas em que a pessoa respondeu a primeira mensagem.' }),
        numero({ id: 'cpl', rotulo: 'Custo por lead', tipo: 'moeda', moeda, valor: razao(gasto, leads) }),
      ], `Período ${rotuloPeriodo(periodo?.inicio, periodo?.fim, hoje) ?? 'da coleta'}`),
      atual
        ? blocoNumeros([
          numero({ id: 's-gasto', rotulo: 'Gasto', tipo: 'moeda', moeda, valor: atual.gasto, anterior: comparar('gasto'), subirE: 'neutro' }),
          numero({ id: 's-alcance', rotulo: 'Alcance', valor: atual.alcance, anterior: comparar('alcance') }),
          numero({ id: 's-cliques', rotulo: 'Cliques', valor: atual.cliques, anterior: comparar('cliques') }),
          numero({ id: 's-leads', rotulo: 'Leads', valor: atual.leads, anterior: comparar('leads') }),
          numero({ id: 's-conversas', rotulo: 'Conversas', valor: atual.conversas, anterior: comparar('conversas') }),
        ], rotuloSemana(atual.semana, anterior?.semana, hoje))
        : null,
      blocoGrafico(semanas, { x: 'semana', y: 'gasto', titulo: 'Gasto por semana', tipo: 'moeda', moeda, hoje, fraco: (x) => x.fechada === false }),
    ],
    secoes: [
      secaoTabela('campanhas', 'Campanhas', campanhas, [
        col('nome', 'Campanha', 'texto', { max: 120 }),
        col('objetivo', 'Objetivo', 'texto', { valor: (x) => traduzir(OBJETIVO, x.objetivo) }),
        col('situacao', 'Situação', 'texto', { valor: (x) => traduzir(SITUACAO, x.situacao_efetiva ?? x.situacao), tom: (x) => (['WITH_ISSUES', 'DISAPPROVED'].includes(x.situacao_efetiva) ? 'bad' : null) }),
        col('orcamento', 'Orçamento', 'texto', { valor: orcamento, numerico: true }),
        col('inicio', 'Início', 'dia'),
        col('fim', 'Fim', 'dia'),
        col('gasto', 'Gasto', 'moeda'),
        col('impressoes', 'Impressões', 'int'),
        col('alcance', 'Alcance', 'int'),
        col('frequencia', 'Frequência', 'dec1'),
        col('cliques', 'Cliques', 'int'),
        col('cliques_link', 'Cliques no link', 'int'),
        col('cliques_saida', 'Cliques de saída', 'int'),
        col('ctr', 'CTR', 'pct', { casas: 2 }),
        col('cpc', 'CPC', 'moeda'),
        col('cpm', 'CPM', 'moeda'),
        col('leads', 'Leads', 'int'),
        col('conversas', 'Conversas', 'int'),
        col('primeiras_respostas', 'Primeiras respostas', 'int'),
        col('resultados', 'Resultados', 'texto', { valor: (x) => textoResultados(x.resultados), numerico: true }),
        col('custo_por_resultado', 'Custo por resultado', 'texto', { valor: (x) => textoCustoPorResultado(x.custo_por_resultado, moeda), numerico: true }),
      ], { moeda, hoje, aberta: true, unidade: ['campanha', 'campanhas'], vazio: 'Nenhuma campanha no período.', nota: 'Campanha sem entrega no período fica com os números em branco.' }),
      secaoTabela('semanas', 'Por semana', [...semanas].reverse(), [
        col('semana', 'Semana de', 'dia'),
        colSemanaFechada('fechada', 'em andamento'),
        col('gasto', 'Gasto', 'moeda'),
        col('impressoes', 'Impressões', 'int'),
        col('alcance', 'Alcance', 'int'),
        col('frequencia', 'Frequência', 'dec1'),
        col('cliques', 'Cliques', 'int'),
        col('cliques_link', 'Cliques no link', 'int'),
        col('cliques_saida', 'Cliques de saída', 'int'),
        col('ctr', 'CTR', 'pct', { casas: 2 }),
        col('cpc', 'CPC', 'moeda'),
        col('cpm', 'CPM', 'moeda'),
        col('leads', 'Leads', 'int'),
        col('conversas', 'Conversas', 'int'),
        col('primeiras_respostas', 'Primeiras respostas', 'int'),
        col('resultados', 'Resultados', 'texto', { valor: (x) => textoResultados(x.resultados), numerico: true }),
        col('custo_por_resultado', 'Custo por resultado', 'texto', { valor: (x) => textoCustoPorResultado(x.custo_por_resultado, moeda), numerico: true }),
      ], { moeda, hoje, unidade: ['semana', 'semanas'] }),
      secaoTabela('plataformas', 'Por plataforma', Array.isArray(c.por_plataforma) ? plataformas : null, [
        col('plataforma', 'Plataforma', 'texto', { valor: (x) => traduzir(PLATAFORMA, x.plataforma) }),
        col('gasto', 'Gasto', 'moeda'),
        col('impressoes', 'Impressões', 'int'),
        col('cliques', 'Cliques', 'int'),
        col('cliques_link', 'Cliques no link', 'int'),
        col('cliques_saida', 'Cliques de saída', 'int'),
        col('ctr', 'CTR', 'fracao', { casas: 2 }),
        col('cpc', 'CPC', 'moeda'),
        col('cpm', 'CPM', 'moeda'),
        col('leads', 'Leads', 'int'),
        col('conversas', 'Conversas', 'int'),
        col('primeiras_respostas', 'Primeiras respostas', 'int'),
      ], { moeda, unidade: ['plataforma', 'plataformas'], nota: 'Somadas nas semanas do período (o alcance não soma e fica de fora). CTR, CPC e CPM são contas do Painel com essas somas.' }),
      secaoTabela('dias', 'Por dia', Array.isArray(c.por_dia) ? recentesPrimeiro(c.por_dia, 'dia') : null, [
        col('dia', 'Dia', 'dia'),
        col('gasto', 'Gasto', 'moeda'),
        col('impressoes', 'Impressões', 'int'),
        col('alcance', 'Alcance', 'int'),
        col('frequencia', 'Frequência', 'dec1'),
        col('cliques', 'Cliques', 'int'),
        col('cliques_link', 'Cliques no link', 'int'),
        col('cliques_saida', 'Cliques de saída', 'int'),
        col('ctr', 'CTR', 'pct', { casas: 2 }),
        col('cpc', 'CPC', 'moeda'),
        col('cpm', 'CPM', 'moeda'),
        col('leads', 'Leads', 'int'),
        col('conversas', 'Conversas', 'int'),
        col('primeiras_respostas', 'Primeiras respostas', 'int'),
      ], { moeda, hoje, limite: 14, unidade: ['dia', 'dias'] }),
      secaoTabela('campanhas_dia', 'Campanhas por dia', Array.isArray(c.campanhas_por_dia) ? recentesPrimeiro(c.campanhas_por_dia, 'dia') : null, [
        col('dia', 'Dia', 'dia'),
        col('campanha', 'Campanha', 'texto', { valor: (x) => nomeDaCampanha.get(String(x.campanha_id)) ?? x.campanha_id, max: 100 }),
        col('gasto', 'Gasto', 'moeda'),
        col('impressoes', 'Impressões', 'int'),
        col('alcance', 'Alcance', 'int'),
        col('frequencia', 'Frequência', 'dec1'),
        col('cliques', 'Cliques', 'int'),
        col('cliques_link', 'Cliques no link', 'int'),
        col('cliques_saida', 'Cliques de saída', 'int'),
        col('ctr', 'CTR', 'pct', { casas: 2 }),
        col('cpc', 'CPC', 'moeda'),
        col('cpm', 'CPM', 'moeda'),
        col('leads', 'Leads', 'int'),
        col('conversas', 'Conversas', 'int'),
        col('primeiras_respostas', 'Primeiras respostas', 'int'),
      ], { moeda, hoje, limite: 14, unidade: ['linha', 'linhas'], semDado: 'A Meta não mandou nesta coleta.', vazio: 'Nenhuma campanha com entrega no período.' }),
      // Cada tabela que tiver linha (a campanha pode trazer ação que as
      // semanas não trouxeram, e o contrário).
      secao('acoes', 'Ações e custo por ação', tiposDeAcao
        ? [
          acoesPeriodo.length
            ? blocoTabela(acoesPeriodo, colsAcao, {
              moeda, chave: 'chave', titulo: 'No período',
              nota: 'Somadas nas semanas do período. O custo por ação do período é conta do Painel: o gasto dividido pela quantidade. Valor é quanto a ação vale (uma compra, por exemplo); ação sem valor fica com o traço.',
            })
            : null,
          acoesCampanhas.length
            ? blocoTabela(acoesCampanhas, [col('campanha', 'Campanha', 'texto', { valor: (x) => x.origem.nome, max: 100 }), ...colsAcao], { moeda, chave: 'id', titulo: 'Por campanha (números da Meta)' })
            : null,
          acoesSemanas.length
            ? blocoTabela(acoesSemanas, [col('semana', 'Semana de', 'dia', { valor: (x) => x.origem.semana }), ...colsAcao], { moeda, hoje, chave: 'id', titulo: 'Por semana (números da Meta)' })
            : null,
        ]
        : [blocoTexto('Nenhuma ação registrada no período.')], { resumo: plural(tiposDeAcao, 'tipo', 'tipos') }),
      secao('sobre', 'Sobre a conta', [
        blocoPares([
          { rotulo: 'Conta', valor: c.nome },
          { rotulo: 'Número', valor: c.numero },
          { rotulo: 'Moeda', valor: c.moeda },
          { rotulo: 'Fuso', valor: c.fuso },
          { rotulo: 'Situação', valor: c.situacao },
        ]),
      ]),
    ],
    notas: ['O CTR e o CPC do período são contas do Painel com as somas; os das tabelas vêm da Meta.'],
  };
}

/** Os quadros dos anúncios da Meta (ligação meta/anuncios do canal facebook):
 *  um por conta de anúncios. Sem conta nenhuma, um quadro que diz isso. */
export function quadrosAnunciosMeta(l, { hoje } = {}) {
  const a = objeto(l?.dados) ? l.dados : null;
  const contas = a ? lista(a.contas).filter(objeto) : [];
  const base = { ligacao: l, rotuloFonte: 'Meta', hoje };
  if (!contas.length) {
    return [montarQuadro({ ...base, id: 'meta-anuncios', titulo: 'Anúncios da Meta', temDado: false, vazio: a ? 'O usuário do sistema não enxerga nenhuma conta de anúncios.' : 'Não veio nesta coleta.' })];
  }
  return contas.map((c, i) =>
    montarQuadro({
      ...base,
      id: contas.length > 1 ? `meta-anuncios-${c.id ?? i}` : 'meta-anuncios',
      titulo: contas.length > 1 ? `Anúncios da Meta: ${texto(c.nome, 60) ?? `conta ${i + 1}`}` : 'Anúncios da Meta',
      temDado: true,
      corpo: () => corpoConta(c, a.periodo, hoje),
    })
  );
}

/* ----------------------------------------------------------- o Pixel -- */

function corpoPixel(px, periodo, hoje) {
  const total = objeto(px.eventos_total) ? Object.entries(px.eventos_total).map(([evento, n]) => ({ evento, n })) : null;
  const dias = Array.isArray(px.eventos_por_dia) ? px.eventos_por_dia.filter(objeto) : null;
  const nomes = dias ? [...new Set(dias.flatMap((d) => (objeto(d.eventos) ? Object.keys(d.eventos) : [])))] : [];
  const urls = Array.isArray(px.urls) ? ordenar(px.urls, 'disparos') : null;
  return {
    destaque: total ? `${formatar('int', somaDisponivel(total.map((x) => x.n)))} eventos` : null,
    topo: [
      blocoNumeros([
        numero({ id: 'eventos', rotulo: 'Eventos recebidos', valor: total ? somaDisponivel(total.map((x) => x.n)) : null }),
        numero({ id: 'tipos', rotulo: 'Tipos de evento', valor: total ? total.length : null }),
        numero({ id: 'ultimo', rotulo: 'Último disparo', tipo: 'instante', valor: px.ultimo_disparo, hoje }),
        numero({ id: 'situacao', rotulo: 'Situação', tipo: 'texto', valor: px.indisponivel === true ? 'indisponível' : px.indisponivel === false ? 'recebendo' : null }),
      ], `Período ${rotuloPeriodo(periodo?.inicio, periodo?.fim, hoje) ?? 'da coleta'}`),
      blocoGrafico(dias, { x: 'dia', y: (d) => (objeto(d.eventos) ? somaDisponivel(Object.values(d.eventos)) : null), titulo: 'Eventos por dia', unidade: 'eventos', hoje }),
      px.indisponivel === true ? blocoAvisos([{ nivel: 'alerta', texto: 'A Meta marcou este Pixel como indisponível.' }]) : null,
    ],
    secoes: [
      secaoTabela('eventos', 'Eventos', total ? ordenar(total, 'n') : null, [col('evento', 'Evento'), col('n', 'Recebidos', 'int')], {
        aberta: true, unidade: ['evento', 'eventos'], vazio: 'Nenhum evento recebido no período.', semDado: 'A Meta não mandou os eventos nesta coleta.',
      }),
      secaoTabela('dias', 'Por dia', dias ? [...dias].sort((a, b) => String(b.dia).localeCompare(String(a.dia))) : null, [
        col('dia', 'Dia', 'dia'),
        ...nomes.map((n) => col(`ev-${n}`, n, 'int', { valor: (d) => (objeto(d.eventos) ? d.eventos[n] ?? null : null) })),
      ], { hoje, unidade: ['dia', 'dias'], semDado: 'A Meta não mandou os eventos por dia nesta coleta.', nota: 'Evento que não aparece num dia fica com o traço: a Meta só lista o que chegou.' }),
      secao('origem', 'De onde vêm os eventos', [
        objeto(px.por_origem) ? blocoBarras(mapaEmBarras(px.por_origem, (k) => traduzir(ORIGEM_PIXEL, k))) : blocoTexto('A Meta não mandou nesta coleta.'),
      ], { resumo: objeto(px.por_origem) ? null : 'não medido' }),
      secaoTabela('urls', 'Páginas que dispararam', urls, [col('url', 'Página', 'texto', { link: (x) => x.url, max: 120 }), col('disparos', 'Disparos', 'int')], {
        unidade: ['página', 'páginas'], semDado: 'A Meta não mandou nesta coleta.', nota: 'Só o endereço e o caminho: o resto da URL pode ter dado pessoal.',
      }),
      secaoTabela('qualidade', 'Qualidade da correspondência', Array.isArray(px.qualidade) ? px.qualidade.filter(objeto) : null, [
        col('evento', 'Evento'),
        col('nota', 'Nota (0 a 10)', 'dec1', { tom: (x) => (medida(x.nota) === null ? null : x.nota >= 6 ? 'ok' : x.nota >= 4 ? 'warn' : 'bad') }),
        col('chaves', 'Dados que casam', 'texto', { valor: (x) => lista(x.chaves).filter(objeto).map((k) => `${k.chave} ${formatar('pct', k.cobertura, { casas: 0 })}`).join(', ') || null, max: 300 }),
        col('cobertura_eventos', 'Cobertura dos eventos', 'pct', { casas: 0 }),
        col('acr', 'Conversões a mais (API de conversões)', 'pct', { casas: 0 }),
        col('frequencia_envio', 'Envio', 'texto', { valor: (x) => traduzir({ real_time: 'na hora', hourly: 'por hora', daily: 'por dia' }, x.frequencia_envio) }),
      ], { unidade: ['evento', 'eventos'], semDado: 'A Meta não mandou nesta coleta.', nota: 'Cobertura: a parte dos eventos do Pixel que também chegou pela API de conversões. Conversões a mais: o que a API de conversões contou além do Pixel.' }),
      secao('configuracao', 'Configuração', [
        blocoPares([
          { rotulo: 'Pixel', valor: px.nome },
          { rotulo: 'ID', valor: px.id },
          { rotulo: 'Criado em', valor: px.criado_em, tipo: 'dia', hoje },
          { rotulo: 'Cookie próprio', valor: traduzir({ FIRST_PARTY_COOKIE_ENABLED: 'ligado', FIRST_PARTY_COOKIE_DISABLED: 'desligado' }, px.cookie_primario) },
          { rotulo: 'Correspondência automática', valor: px.correspondencia_automatica, tipo: 'sim' },
          { rotulo: 'Campos da correspondência', valor: lista(px.campos_correspondencia).join(', ') || null },
          { rotulo: 'Uso dos dados', valor: traduzir({ ADVERTISING_AND_ANALYTICS: 'anúncios e análise', ANALYTICS_ONLY: 'só análise' }, px.uso_dados) },
        ]),
      ]),
    ],
    notas: ['A Meta guarda poucos dias das estatísticas do Pixel: o período é curto de propósito.'],
  };
}

/** Os quadros do Pixel da Meta (ligação meta/pixel do canal facebook): um
 *  por Pixel. */
export function quadrosPixelMeta(l, { hoje } = {}) {
  const x = objeto(l?.dados) ? l.dados : null;
  const pixels = x ? lista(x.pixels).filter(objeto) : [];
  const base = { ligacao: l, rotuloFonte: 'Meta', hoje };
  if (!pixels.length) {
    return [montarQuadro({ ...base, id: 'meta-pixel', titulo: 'Pixel da Meta', temDado: false, vazio: x ? 'Nenhum Pixel atribuído ao usuário do sistema.' : 'Não veio nesta coleta.' })];
  }
  return pixels.map((px, i) =>
    montarQuadro({
      ...base,
      id: pixels.length > 1 ? `meta-pixel-${px.id ?? i}` : 'meta-pixel',
      titulo: pixels.length > 1 ? `Pixel da Meta: ${texto(px.nome, 60) ?? `Pixel ${i + 1}`}` : 'Pixel da Meta',
      temDado: true,
      corpo: () => corpoPixel(px, x.periodo, hoje),
    })
  );
}

/* -------------------------------------------------------- o Instagram -- */

const OBSERVACAO_IG = 'Os números do Instagram incluem anúncio e conteúdo impulsionado: não são só orgânicos.';
const FORMATO_IG = Object.freeze({ IMAGE: 'foto', VIDEO: 'vídeo', CAROUSEL_ALBUM: 'carrossel', REELS: 'Reels', STORY: 'story', FEED: 'feed' });
const formatoDaMidia = (m) => (m.produto === 'REELS' ? 'Reels' : traduzir(FORMATO_IG, m.tipo) ?? traduzir(FORMATO_IG, m.produto));
const GENERO_IG = Object.freeze({ F: 'feminino', M: 'masculino', U: 'não informado' });
const QUEBRAS_IG = Object.freeze({
  POST: 'post', REEL: 'Reels', STORY: 'story', CAROUSEL_CONTAINER: 'carrossel', AD: 'anúncio', FOLLOWER: 'seguidores', NON_FOLLOWER: 'não seguidores', UNKNOWN: 'não informado',
  CALL: 'ligar', DIRECTION: 'como chegar', TEXT: 'mensagem', EMAIL: 'e-mail', BOOK_NOW: 'reservar', UNDEFINED: 'outro botão',
});

function corpoInstagramConta(ig, hoje) {
  const { atual, anterior } = ultimasDuas(ig.por_semana, 'semana', (s) => s.madura !== false);
  const comparar = (campo) => (anterior ? anterior[campo] : undefined);
  const s = (campo, rotulo, extra = {}) => numero({ id: campo, rotulo, valor: atual?.[campo], anterior: comparar(campo), ...extra });
  return {
    destaque: medida(ig.seguidores) !== null ? `${formatar('int', ig.seguidores)} seguidores` : null,
    topo: [
      blocoNumeros([
        numero({ id: 'seguidores', rotulo: 'Seguidores', valor: ig.seguidores }),
        numero({ id: 'seguindo', rotulo: 'Seguindo', valor: ig.seguindo }),
        numero({ id: 'publicacoes', rotulo: 'Publicações', valor: ig.publicacoes_total }),
      ], 'Agora'),
      atual
        ? blocoNumeros([
          s('alcance', 'Alcance'),
          s('visualizacoes', 'Visualizações'),
          s('contas_engajadas', 'Contas engajadas'),
          s('interacoes', 'Interações'),
          s('curtidas', 'Curtidas'),
          s('comentarios', 'Comentários'),
          s('compartilhamentos', 'Compartilhamentos'),
          s('salvamentos', 'Salvamentos'),
          s('toques_links', 'Toques em links'),
        ], `${rotuloSemana(atual.semana, anterior?.semana, hoje)}. Com anúncio e impulsionamento`)
        : blocoTexto('Nenhuma semana madura ainda (a Meta atrasa até 48 horas; a semana vale 3 dias depois do domingo).'),
      blocoGrafico(ig.alcance_por_dia, { x: 'dia', y: 'alcance', titulo: 'Alcance por dia (últimos 28 dias)', unidade: 'contas', hoje }),
    ],
    secoes: [
      secaoTabela('semanas', 'Por semana', recentesPrimeiro(ig.por_semana, 'semana'), [
        col('semana', 'Semana de', 'dia'),
        colSemanaFechada('madura', 'ainda não madura'),
        col('alcance', 'Alcance', 'int'),
        col('visualizacoes', 'Visualizações', 'int'),
        col('contas_engajadas', 'Contas engajadas', 'int'),
        col('interacoes', 'Interações', 'int'),
        col('curtidas', 'Curtidas', 'int'),
        col('comentarios', 'Comentários', 'int'),
        col('compartilhamentos', 'Compart.', 'int'),
        col('salvamentos', 'Salvamentos', 'int'),
        col('respostas', 'Respostas', 'int'),
        col('repostagens', 'Repostagens', 'int'),
        col('toques_links', 'Toques em links', 'int'),
        col('seguir_deixar', 'Seguir e deixar (como a Meta manda)', 'texto', { valor: (x) => (objeto(x.seguir_deixar) ? Object.entries(x.seguir_deixar).map(([k, v]) => `${k} ${formatar('int', v)}`).join(', ') : null) }),
      ], { hoje, aberta: true, unidade: ['semana', 'semanas'], nota: 'Semana madura: 3 dias depois do domingo. "Seguir e deixar" vai com os nomes da Meta, que não confirma qual é qual.' }),
      secaoTabela('alcance_dia', 'Alcance por dia', Array.isArray(ig.alcance_por_dia) ? recentesPrimeiro(ig.alcance_por_dia, 'dia') : null, [
        col('dia', 'Dia', 'dia'),
        col('alcance', 'Alcance', 'int'),
      ], { hoje, limite: 14, unidade: ['dia', 'dias'], semDado: 'A Meta não mandou nesta coleta.', nota: 'Contas diferentes alcançadas em cada dia (os últimos 28).' }),
      secao('sobre', 'Sobre a conta', [
        blocoPares([
          { rotulo: 'Usuário', valor: ig.usuario ? `@${ig.usuario}` : null, link: ig.usuario ? `https://www.instagram.com/${encodeURIComponent(ig.usuario)}/` : null },
          { rotulo: 'Nome', valor: ig.nome },
          { rotulo: 'Site na bio', valor: ig.site, link: ig.site },
          { rotulo: 'Bio', valor: ig.bio },
        ]),
      ]),
    ],
    notas: [texto(ig.observacao, 300) ?? OBSERVACAO_IG],
  };
}

function corpoInstagramPublicacoes(ig, hoje) {
  const midias = Array.isArray(ig.midias) ? recentesPrimeiro(ig.midias, 'criado_em') : null;
  const stories = Array.isArray(ig.stories) ? recentesPrimeiro(ig.stories, 'criado_em') : null;
  // O maior alcance entre as publicações que têm número (nenhuma medida: sem
  // número, e não zero).
  const alcances = lista(midias).map((m) => medida(m.alcance)).filter((v) => v !== null);
  const colData = col('data', 'Data', 'dia');
  const colMidia = col('titulo', 'Publicação', 'texto', { valor: (m) => m.titulo || formatoDaMidia(m), link: (m) => m.link, max: 120 });
  return {
    destaque: midias ? plural(midias.length, 'publicação', 'publicações') : null,
    topo: [
      blocoNumeros([
        numero({ id: 'midias', rotulo: 'Publicações listadas', valor: midias ? midias.length : null }),
        numero({ id: 'stories', rotulo: 'Stories no ar', valor: stories ? stories.length : null }),
        numero({ id: 'interacoes', rotulo: 'Interações (soma)', valor: midias ? somaDisponivel(midias.map((m) => m.interacoes)) : null, titulo: 'Soma das interações das publicações listadas.' }),
        numero({ id: 'alcance', rotulo: 'Maior alcance', valor: alcances.length ? Math.max(...alcances) : null, titulo: 'O alcance da publicação que mais alcançou.' }),
      ]),
    ],
    secoes: [
      secaoTabela('midias', 'Publicações', midias, [
        colData,
        colMidia,
        col('formato', 'Formato', 'texto', { valor: formatoDaMidia }),
        col('alcance', 'Alcance', 'int'),
        col('visualizacoes', 'Visualizações', 'int'),
        col('curtidas', 'Curtidas', 'int'),
        col('comentarios', 'Comentários', 'int'),
        col('salvamentos', 'Salvamentos', 'int'),
        col('compartilhamentos', 'Compart.', 'int'),
        col('repostagens', 'Repostagens', 'int'),
        col('interacoes', 'Interações', 'int'),
        col('visitas_perfil', 'Visitas ao perfil', 'int'),
        col('seguiram', 'Seguiram', 'int'),
        col('tempo_medio_reels_ms', 'Tempo médio (Reels)', 'ms'),
        col('taxa_pulo_reels', 'Pularam (Reels)', 'pct', { casas: 0 }),
      ], { hoje, aberta: true, unidade: ['publicação', 'publicações'], vazio: 'Nenhuma publicação nos últimos 90 dias.', semDado: 'A Meta não mandou as publicações nesta coleta.', nota: 'Com anúncio e impulsionamento: não são números só orgânicos.' }),
      midias && midias.length
        ? secaoTabela('midias_mais', 'Publicações: outros números', midias, [
          colData,
          colMidia,
          col('atividade_perfil', 'Ações no perfil', 'int', { titulo: () => 'Toques no perfil depois de ver a publicação (seguir, mensagem, link).' }),
          col('total_visualizacoes', 'Total de visualizações', 'int'),
          col('total_curtidas', 'Total de curtidas', 'int'),
          col('total_comentarios', 'Total de comentários', 'int'),
          col('tempo_total_reels_ms', 'Tempo total assistido (Reels)', 'durms'),
          col('visualizacoes_facebook', 'Visualizações no Facebook', 'int'),
          col('visualizacoes_cruzadas', 'Visualizações nas duas redes (Reels)', 'int'),
          col('ia', 'Feita com IA', 'sim'),
        ], { hoje, unidade: ['publicação', 'publicações'], nota: 'Os totais e as visualizações no Facebook só vêm quando a Meta informa (publicação compartilhada no Facebook, por exemplo).' })
        : null,
      secaoTabela('stories', 'Stories', stories, [
        col('data', 'Data', 'dia'),
        col('titulo', 'Story', 'texto', { valor: (m) => m.titulo || 'abrir', link: (m) => m.link }),
        col('visualizacoes', 'Visualizações', 'int'),
        col('alcance', 'Alcance', 'int'),
        col('respostas', 'Respostas', 'int'),
        col('compartilhamentos', 'Compart.', 'int'),
        col('cliques_link', 'Cliques no link', 'int'),
        col('interacoes', 'Interações', 'int'),
        col('repostagens', 'Repostagens', 'int'),
        col('seguiram', 'Seguiram', 'int'),
        col('visitas_perfil', 'Visitas ao perfil', 'int'),
        col('atividade_perfil', 'Ações no perfil', 'int'),
        col('navegacao', 'Navegação', 'texto', { valor: (m) => (objeto(m.navegacao) ? Object.entries(m.navegacao).map(([k, v]) => `${k.toLowerCase().replace(/_/g, ' ')} ${formatar('int', v)}`).join(', ') : null) }),
        // O número do story é o do instante da leitura (revisão 2: lido_em e
        // parcial), nunca o final: a coluna diz quando foi lido.
        col('lido_em', 'Lido em', 'instante', { valor: (m) => m.lido_em, tom: (m) => (m.parcial === true ? 'warn' : null), titulo: (m) => (m.parcial === true ? 'Leitura parcial: o story ainda estava no ar.' : null) }),
      ], { hoje, unidade: ['story', 'stories'], vazio: 'Nenhum story no ar agora.', nota: 'Leitura parcial: o número é o da hora da leitura, não o final do story (ele some em 24 horas e a coleta roda uma vez por dia). Com menos de 5 espectadores a Meta não dá número.' }),
    ],
  };
}

function corpoInstagramPublico(ig, hoje) {
  const demo = objeto(ig.demografia) ? ig.demografia : {};
  const seg = objeto(demo.seguidores) ? demo.seguidores : {};
  const eng = objeto(demo.engajados) ? demo.engajados : {};
  const q = objeto(ig.quebras) ? ig.quebras : {};
  const barras = (mapa, rotular, titulo, limite = 12) => {
    const itens = mapaEmBarras(mapa, rotular);
    return itens ? blocoBarras(itens.slice(0, limite), { titulo, total: somaDisponivel(itens.map((x) => x.valor)) }) : blocoTexto(`${titulo}: a Meta não mandou nesta coleta.`);
  };
  const quebra = (k) => (k ? traduzir(QUEBRAS_IG, k) : k);
  return {
    destaque: null,
    topo: [blocoTexto(`Retrato do mês corrente${demo.periodo && demo.periodo !== 'this_month' ? ` (${texto(demo.periodo, 30)})` : ''}, nos 45 maiores de cada lista.`)],
    secoes: [
      secao('seguidores', 'Quem segue', [
        barras(seg.idade, (k) => k, 'Idade'),
        barras(seg.genero, (k) => traduzir(GENERO_IG, k), 'Gênero'),
        barras(seg.cidade, (k) => k, 'Cidade'),
        barras(seg.pais, (k) => traduzir(PAISES, k), 'País'),
      ], { aberta: true }),
      secao('engajados', 'Quem interagiu', [
        barras(eng.idade, (k) => k, 'Idade'),
        barras(eng.genero, (k) => traduzir(GENERO_IG, k), 'Gênero'),
        barras(eng.cidade, (k) => k, 'Cidade'),
        barras(eng.pais, (k) => traduzir(PAISES, k), 'País'),
      ]),
      secao('quebras', `De onde veio o alcance${rotuloDia(q.semana, hoje) ? ` (semana de ${rotuloDia(q.semana, hoje)})` : ''}`, [
        barras(q.alcance_por_tipo, quebra, 'Alcance por tipo de publicação'),
        barras(q.alcance_por_seguidor, quebra, 'Alcance entre seguidores e não seguidores'),
        barras(q.visualizacoes_por_tipo, quebra, 'Visualizações por tipo de publicação'),
        barras(q.visualizacoes_por_seguidor, quebra, 'Visualizações entre seguidores e não seguidores'),
        barras(q.toques_por_botao, quebra, 'Toques nos botões do perfil'),
      ]),
    ],
  };
}

/** Os quadros do Instagram (ligação meta/instagram do canal instagram):
 *  conta e alcance, publicações, e público. */
export function quadrosInstagram(l, { hoje } = {}) {
  const ig = objeto(l?.dados) ? l.dados : null;
  const base = { ligacao: l, rotuloFonte: 'Meta (Instagram)', hoje };
  if (!ig) return [montarQuadro({ ...base, id: 'ig', titulo: 'Instagram', temDado: false })];
  return [
    montarQuadro({ ...base, id: 'ig-conta', titulo: 'Conta e alcance', temDado: medida(ig.seguidores) !== null || lista(ig.por_semana).length > 0 || !!texto(ig.usuario), corpo: () => corpoInstagramConta(ig, hoje) }),
    montarQuadro({ ...base, id: 'ig-publicacoes', titulo: 'Publicações e stories', temDado: Array.isArray(ig.midias) || Array.isArray(ig.stories), vazio: 'A Meta não mandou as publicações nesta coleta.', corpo: () => corpoInstagramPublicacoes(ig, hoje) }),
    montarQuadro({ ...base, id: 'ig-publico', titulo: 'Público', temDado: objeto(ig.demografia) || objeto(ig.quebras), vazio: 'A Meta não mandou o público nesta coleta.', corpo: () => corpoInstagramPublico(ig, hoje) }),
  ];
}

// Exposto para os testes: o nome de gente de uma ação da Meta.
export { nomeDaAcao };
