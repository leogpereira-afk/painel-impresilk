/* OS CONECTORES "linkedin" E "pinterest" NA SUB-ABA "DADOS" (cada um no canal
 * de mesmo nome).
 *
 * Formatos nas seções FORMATO de supabase/functions/_shared/mkt-fontes/
 * linkedin.mjs e pinterest.mjs. As duas são fontes inteiras: cada quadro diz
 * quais partes mostra, e o estado dele é o pior entre elas.
 *
 * Regras das duas APIs que a tela segura:
 *  - LinkedIn: o "alcance" do conteúdo é o alcance de cada dia SOMADO (passa
 *    do alcance único da semana) e a tela diz isso; os códigos de país,
 *    função e setor vêm sem tradução (urn:li:...), e aparecem sem o prefixo;
 *    o post vai sem texto e sem imagem (regra de guarda do LinkedIn);
 *  - Pinterest: dias em UTC, com uns 2 dias de atraso, e o dia que ainda não
 *    está pronto (ESTIMATE, PROCESSING) fica mais claro no gráfico; o
 *    engajamento por Pin é aproximado (o Pinterest não dá) e os seguidores
 *    somados dos Pins medidos são um piso, não o total. As métricas além das
 *    nove confirmadas (as "extras": ampliações, vídeo) aparecem com o nome
 *    de gente, e a que a tela não conhece, como "outra métrica" (nunca o
 *    nome da API).
 */
import {
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
  notaDoFuturo,
  numero,
  objeto,
  ordenar,
  plural,
  rotuloDia,
  rotuloPeriodo,
  secao,
  secaoTabela,
  separarPorHoje,
  somaDisponivel,
  somaEstrita,
  texto,
  textoDoMapa,
  traduzir,
  ultimasDuas,
} from './marketing-dados.js';
import { rotuloSemana } from './marketing-dados-google.js';

const recentesPrimeiro = (linhas, campo) => [...lista(linhas)].filter(objeto).sort((a, b) => String(b[campo] ?? '').localeCompare(String(a[campo] ?? '')));

/* ------------------------------------------------------------ LinkedIn -- */

export const PARTES_LINKEDIN = Object.freeze(['pagina', 'seguidores', 'visitas', 'conteudo', 'posts']);

const PORTE = Object.freeze({
  SIZE_1: 'só o dono', SIZE_2_TO_10: '2 a 10 pessoas', SIZE_11_TO_50: '11 a 50 pessoas', SIZE_51_TO_200: '51 a 200 pessoas', SIZE_201_TO_500: '201 a 500 pessoas',
  SIZE_501_TO_1000: '501 a 1.000 pessoas', SIZE_1001_TO_5000: '1.001 a 5.000 pessoas', SIZE_5001_TO_10000: '5.001 a 10.000 pessoas', SIZE_10001_OR_MORE: 'mais de 10.000 pessoas',
});
const TIPO_ORG = Object.freeze({ PRIVATELY_HELD: 'empresa privada', PUBLIC_COMPANY: 'empresa de capital aberto', SELF_EMPLOYED: 'autônomo', NON_PROFIT: 'sem fins lucrativos', GOVERNMENT_AGENCY: 'órgão público', EDUCATIONAL: 'ensino', PARTNERSHIP: 'sociedade', SELF_OWNED: 'empresa própria' });
const VINCULO = Object.freeze({ EMPLOYEE: 'funcionários', NON_EMPLOYEE: 'não funcionários', MEMBER: 'membros', NON_MEMBER: 'não membros' });
const URN = Object.freeze({ geo: 'lugar', function: 'função', industry: 'setor', seniority: 'senioridade', organization: 'organização', title: 'cargo', school: 'escola', skill: 'competência' });
// Os tipos de post que o conector manda (linkedin.mjs, FORMATO).
const TIPO_POST_LI = Object.freeze({
  texto: 'texto', imagem: 'imagem', imagens: 'várias imagens', video: 'vídeo', documento: 'documento', artigo: 'artigo', enquete: 'enquete',
  celebracao: 'celebração', carrossel: 'carrossel', compartilhamento: 'compartilhamento',
});
// As reações do LinkedIn com o nome da tela dele em português. CELEBRATION
// é o "parabéns" com o nome em inglês da tela ("Celebrate"): soma com PRAISE.
const REACOES_LI = Object.freeze({
  LIKE: 'gostei', PRAISE: 'parabéns', CELEBRATION: 'parabéns', EMPATHY: 'amei', INTEREST: 'genial', APPRECIATION: 'apoio', ENTERTAINMENT: 'engraçado',
  MAYBE: 'curioso',
});
const DIMENSOES = Object.freeze([
  ['vinculo', 'Vínculo'], ['pais', 'País'], ['regiao', 'Região'], ['funcao', 'Função'], ['setor', 'Setor'], ['senioridade', 'Senioridade'], ['porte', 'Porte da empresa'],
]);
// As abas da página do LinkedIn (o nome da API das visualizações que o
// conector não separa em campo próprio: "aboutPageViews").
const ABAS_LI = Object.freeze({
  all: 'Todas as páginas', overview: 'Página inicial', about: 'Sobre', people: 'Pessoas', insights: 'Insights', products: 'Produtos', jobs: 'Vagas',
  careers: 'Carreiras', lifeAt: 'Vida na empresa', events: 'Eventos', posts: 'Posts', videos: 'Vídeos', services: 'Serviços',
});

/** O nome de gente de uma aba nas visualizações do LinkedIn
 *  ("desktopAboutPageViews" vira "Sobre, no computador"); a aba que o mapa
 *  não conhece vira "Outra aba", nunca o nome da API. */
export function nomeDaAbaLinkedin(k) {
  const m = /^(desktop|mobile)?([A-Za-z]+?)PageViews$/.exec(String(k ?? ''));
  if (!m) return 'Outra aba';
  const base = `${m[2].charAt(0).toLowerCase()}${m[2].slice(1)}`;
  const nome = conhecido(ABAS_LI, base) ?? 'Outra aba';
  return m[1] ? `${nome}, no ${m[1] === 'desktop' ? 'computador' : 'celular'}` : nome;
}

/** O código do LinkedIn sem o prefixo ("urn:li:geo:103644278" vira
 *  "lugar 103644278": o LinkedIn não manda o nome, só o número); faixa de
 *  porte e vínculo viram palavra. O que nenhum mapa conhece vira "outro",
 *  nunca o código cru (EMPLOYEE ia como veio: o primeiro mapa devolvia o
 *  código e o segundo nem era consultado). */
export function rotuloDoCodigo(codigo, rotulo) {
  const c = String(codigo ?? '').trim();
  // A faixa de porte que o mapa conhece vai com o nome dele ("só o dono",
  // e não o "1" que o conector escreve para SIZE_1).
  if (conhecido(PORTE, c)) return conhecido(PORTE, c);
  if (texto(rotulo, 80)) return texto(rotulo, 80);
  if (!c) return null;
  const urn = /^urn:li:([a-zA-Z]+):(.+)$/.exec(c);
  if (urn) return `${conhecido(URN, urn[1]) ?? 'item'} ${urn[2]}`;
  return conhecido(PORTE, c) ?? conhecido(VINCULO, c) ?? 'outro';
}

/** Itens {rotulo, valor} com o mesmo rótulo (dois códigos que o mapa não
 *  conhece viram "outro") somados num item só, do maior para o menor. */
function juntarPorRotulo(itens) {
  const porNome = new Map();
  for (const i of itens) porNome.set(i.rotulo, porNome.has(i.rotulo) ? somaDisponivel([porNome.get(i.rotulo), i.valor]) : medida(i.valor));
  return ordenar([...porNome].map(([rotulo, valor]) => ({ rotulo, valor })), 'valor');
}

/** As barras de um perfil do LinkedIn ({vinculo: [{codigo, n}], pais: ...}). */
function perfilEmSecoes(perfil, prefixo) {
  if (!objeto(perfil)) return [blocoTexto('O LinkedIn não mandou o perfil nesta coleta.')];
  return DIMENSOES.filter(([k]) => Array.isArray(perfil[k]) && perfil[k].length).map(([k, titulo]) =>
    blocoBarras(juntarPorRotulo(perfil[k].filter(objeto).map((x) => ({ rotulo: rotuloDoCodigo(x.codigo, x.rotulo) ?? 'sem código', valor: x.n }))).slice(0, 10), { titulo: `${prefixo}: ${titulo.toLowerCase()}` })
  );
}

function corpoLinkedinSeguidores(d, hoje) {
  const pg = objeto(d.pagina) ? d.pagina : {};
  const sg = objeto(d.seguidores) ? d.seguidores : null;
  const { atual, anterior } = ultimasDuas(sg?.semanas, 'semana', (s) => medida(s.ganho) !== null);
  const comparar = (campo) => (anterior ? anterior[campo] : undefined);
  return {
    destaque: medida(sg?.total) !== null ? `${formatar('int', sg.total)} seguidores` : texto(pg.nome, 60),
    topo: [
      blocoNumeros([
        numero({ id: 'total', rotulo: 'Seguidores', valor: sg?.total }),
        numero({ id: 'fim', rotulo: 'No fim da última semana', valor: atual?.total_fim, titulo: 'Estimativa: o total de hoje menos os ganhos desde a segunda.' }),
        numero({ id: 'pronto', rotulo: 'Ganhos medidos até', tipo: 'dia', valor: sg?.pronto_ate, hoje, titulo: 'O LinkedIn fecha os ganhos com 2 dias de atraso.' }),
      ], 'Agora'),
      atual
        ? blocoNumeros([
          numero({ id: 'ganho', rotulo: 'Novos seguidores', valor: atual.ganho, anterior: comparar('ganho') }),
          numero({ id: 'organicos', rotulo: 'Orgânicos', valor: atual.organicos, anterior: comparar('organicos') }),
          numero({ id: 'pagos', rotulo: 'Por anúncio', valor: atual.pagos, anterior: comparar('pagos') }),
        ], rotuloSemana(atual.semana, anterior?.semana, hoje))
        : null,
      sg ? blocoGrafico(sg.por_dia, { x: 'dia', y: 'total', titulo: 'Novos seguidores por dia', unidade: 'seguidores', hoje }) : null,
    ],
    secoes: [
      secaoTabela('semanas', 'Por semana', sg ? recentesPrimeiro(sg.semanas, 'semana') : null, [
        col('semana', 'Semana de', 'dia'), col('ganho', 'Novos', 'int'), col('organicos', 'Orgânicos', 'int'), col('pagos', 'Por anúncio', 'int'), col('total_fim', 'Total no fim (estimativa)', 'int'),
      ], { hoje, unidade: ['semana', 'semanas'], semDado: 'Não veio nesta coleta.', nota: 'O ganho da semana só sai com os 7 dias medidos.' }),
      secaoTabela('dias', 'Por dia', sg ? recentesPrimeiro(sg.por_dia, 'dia') : null, [
        col('dia', 'Dia', 'dia'), col('organicos', 'Orgânicos', 'int'), col('pagos', 'Por anúncio', 'int'), col('total', 'Total', 'int'),
      ], { hoje, limite: 14, unidade: ['dia', 'dias'], semDado: 'Não veio nesta coleta.' }),
      secao('perfil', 'Quem segue', perfilEmSecoes(sg?.perfil, 'Seguidores')),
      secao('pagina', 'Sobre a página', [
        blocoPares([
          { rotulo: 'Página', valor: pg.nome },
          { rotulo: 'Endereço', valor: pg.url, link: pg.url },
          { rotulo: 'Site', valor: pg.site, link: pg.site },
          { rotulo: 'Porte', valor: traduzir(PORTE, pg.porte, 'outro porte') },
          { rotulo: 'Setores', valor: lista(pg.setores).map((s) => rotuloDoCodigo(s)).filter(Boolean).join(', ') || null },
          { rotulo: 'Tipo', valor: traduzir(TIPO_ORG, pg.tipo, 'outro tipo') },
        ]),
      ]),
    ],
    notas: ['Os dias do LinkedIn são em UTC (3 horas à frente de Brasília). Os códigos de lugar, função e setor vêm do LinkedIn sem tradução.'],
  };
}

const VISTAS_LI = Object.freeze([
  ['total', 'Todas as páginas'], ['total_computador', 'Todas, no computador'], ['total_celular', 'Todas, no celular'], ['inicio', 'Página inicial'],
  ['inicio_computador', 'Inicial, no computador'], ['inicio_celular', 'Inicial, no celular'], ['carreiras', 'Carreiras'], ['carreiras_computador', 'Carreiras, no computador'],
  ['carreiras_celular', 'Carreiras, no celular'], ['vagas', 'Vagas'], ['vagas_computador', 'Vagas, no computador'], ['vagas_celular', 'Vagas, no celular'],
  ['vida', 'Vida na empresa'], ['vida_computador', 'Vida na empresa, no computador'], ['vida_celular', 'Vida na empresa, no celular'],
]);

function corpoLinkedinVisitas(v, hoje) {
  const { atual, anterior } = ultimasDuas(v.semanas);
  const comparar = (campo) => (anterior ? anterior[campo] : undefined);
  const ds = objeto(v.desde_sempre) ? v.desde_sempre : null;
  const vistas = objeto(ds?.vistas) ? ds.vistas : {};
  const botoes = objeto(ds?.cliques_botao) ? ds.cliques_botao : null;
  const linhasVistas = [
    ...VISTAS_LI.filter(([k]) => objeto(vistas[k])).map(([k, rotulo]) => ({ rotulo, ...vistas[k] })),
    // As outras abas vêm com o nome da API ("aboutPageViews"): vai o nome
    // de gente ("Sobre").
    ...(objeto(vistas.outras) ? Object.entries(vistas.outras).filter(([, x]) => objeto(x)).map(([k, x]) => ({ ...x, rotulo: nomeDaAbaLinkedin(k) })) : []),
  ];
  return {
    destaque: atual && medida(atual.visualizacoes) !== null ? `${formatar('int', atual.visualizacoes)} visualizações na semana` : null,
    topo: [
      atual
        ? blocoNumeros([
          numero({ id: 'visualizacoes', rotulo: 'Visualizações', valor: atual.visualizacoes, anterior: comparar('visualizacoes') }),
          numero({ id: 'inicio', rotulo: 'Na página inicial', valor: atual.inicio, anterior: comparar('inicio') }),
          numero({ id: 'botao', rotulo: 'Cliques no botão', valor: atual.cliques_botao, anterior: comparar('cliques_botao') }),
        ], rotuloSemana(atual.semana, anterior?.semana, hoje))
        : blocoTexto('Nenhuma semana medida ainda.'),
      ds
        ? blocoNumeros([
          numero({ id: 'ds-vis', rotulo: 'Visualizações', valor: vistas.total?.visualizacoes }),
          numero({ id: 'ds-unicas', rotulo: 'Visitantes únicos', valor: vistas.total?.unicas }),
          // Computador mais celular é o total: com uma das partes sem número,
          // a soma parcial passaria por total (e o celular 0 com o
          // computador null virava "0"). Soma estrita, como o conector
          // (somaOuNulo).
          numero({ id: 'ds-botao', rotulo: 'Cliques no botão', valor: botoes ? somaEstrita([botoes.computador, botoes.celular]) : null }),
        ], 'Desde sempre')
        : null,
      blocoGrafico(v.por_dia, { x: 'dia', y: 'visualizacoes', titulo: 'Visualizações por dia', unidade: 'visualizações', hoje }),
    ],
    secoes: [
      secaoTabela('semanas', 'Por semana', recentesPrimeiro(v.semanas, 'semana'), [
        col('semana', 'Semana de', 'dia'), col('visualizacoes', 'Visualizações', 'int'), col('inicio', 'Página inicial', 'int'), col('cliques_botao', 'Cliques no botão', 'int'),
      ], { hoje, unidade: ['semana', 'semanas'] }),
      secaoTabela('dias', 'Por dia', recentesPrimeiro(v.por_dia, 'dia'), [
        col('dia', 'Dia', 'dia'),
        col('visualizacoes', 'Visualizações', 'int'),
        col('unicas', 'Únicas', 'int'),
        col('inicio', 'Inicial', 'int'),
        col('inicio_unicas', 'Inicial, únicas', 'int'),
        col('carreiras', 'Carreiras', 'int'),
        col('carreiras_unicas', 'Carreiras, únicas', 'int'),
        col('cliques_botao_computador', 'Botão, computador', 'int'),
        col('cliques_botao_celular', 'Botão, celular', 'int'),
      ], { hoje, limite: 14, unidade: ['dia', 'dias'] }),
      secaoTabela('desde_sempre', 'Desde sempre, por página', ds ? linhasVistas : null, [
        col('rotulo', 'Página'), col('visualizacoes', 'Visualizações', 'int'), col('unicas', 'Únicas', 'int'),
      ], {
        unidade: ['página', 'páginas'], semDado: 'Não veio nesta coleta.',
        depois: botoes ? [blocoPares([{ rotulo: 'Cliques no botão, no computador', valor: botoes.computador, tipo: 'int' }, { rotulo: 'Cliques no botão, no celular', valor: botoes.celular, tipo: 'int' }])] : [],
      }),
      secao('perfil', 'Quem visitou', perfilEmSecoes(v.perfil, 'Visitantes')),
    ],
  };
}

function corpoLinkedinConteudo(c, hoje) {
  const { atual, anterior } = ultimasDuas(c.semanas);
  const comparar = (campo) => (anterior ? anterior[campo] : undefined);
  const s = (campo, rotulo, extra = {}) => numero({ id: campo, rotulo, valor: atual?.[campo], anterior: comparar(campo), ...extra });
  const ds = objeto(c.desde_sempre) ? c.desde_sempre : null;
  return {
    destaque: atual && medida(atual.impressoes) !== null ? `${formatar('int', atual.impressoes)} impressões na semana` : null,
    topo: [
      atual
        ? blocoNumeros([
          s('impressoes', 'Impressões'),
          s('alcance', 'Alcance (dias somados)', { titulo: 'O alcance de cada dia somado: passa do alcance único da semana.' }),
          s('cliques', 'Cliques'),
          s('curtidas', 'Curtidas'),
          s('comentarios', 'Comentários'),
          s('compartilhamentos', 'Compartilhamentos'),
          s('engajamento', 'Engajamento'),
          numero({ id: 'taxa', rotulo: 'Taxa de engajamento', tipo: 'fracao', valor: atual.taxa, anterior: comparar('taxa') }),
        ], rotuloSemana(atual.semana, anterior?.semana, hoje))
        : blocoTexto('Nenhuma semana medida ainda.'),
      ds
        ? blocoNumeros([
          numero({ id: 'ds-impressoes', rotulo: 'Impressões', valor: ds.impressoes }),
          numero({ id: 'ds-alcance', rotulo: 'Alcance (dias somados)', valor: ds.alcance, titulo: 'O alcance de cada dia somado: passa do alcance único do período.' }),
          numero({ id: 'ds-cliques', rotulo: 'Cliques', valor: ds.cliques }),
          numero({ id: 'ds-curtidas', rotulo: 'Curtidas', valor: ds.curtidas }),
          numero({ id: 'ds-comentarios', rotulo: 'Comentários', valor: ds.comentarios }),
          numero({ id: 'ds-compartilhamentos', rotulo: 'Compartilhamentos', valor: ds.compartilhamentos }),
          numero({ id: 'ds-engajamento', rotulo: 'Engajamento', valor: ds.engajamento }),
          numero({ id: 'ds-taxa', rotulo: 'Taxa de engajamento', tipo: 'fracao', valor: ds.taxa }),
        ], 'Últimos 12 meses (o que o LinkedIn guarda)')
        : null,
      blocoGrafico(c.por_dia, { x: 'dia', y: 'impressoes', titulo: 'Impressões por dia', unidade: 'impressões', hoje }),
    ],
    secoes: [
      secaoTabela('semanas', 'Por semana', recentesPrimeiro(c.semanas, 'semana'), [
        col('semana', 'Semana de', 'dia'), col('impressoes', 'Impressões', 'int'), col('alcance', 'Alcance (dias somados)', 'int'), col('cliques', 'Cliques', 'int'),
        col('curtidas', 'Curtidas', 'int'), col('comentarios', 'Comentários', 'int'), col('compartilhamentos', 'Compart.', 'int'), col('engajamento', 'Engajamento', 'int'), col('taxa', 'Taxa', 'fracao'),
      ], { hoje, unidade: ['semana', 'semanas'] }),
      secaoTabela('dias', 'Por dia', recentesPrimeiro(c.por_dia, 'dia'), [
        col('dia', 'Dia', 'dia'), col('impressoes', 'Impressões', 'int'), col('alcance', 'Alcance', 'int'), col('cliques', 'Cliques', 'int'),
        col('curtidas', 'Curtidas', 'int'), col('comentarios', 'Comentários', 'int'), col('compartilhamentos', 'Compart.', 'int'), col('engajamento', 'Engajamento', 'int'), col('taxa', 'Taxa', 'fracao'),
      ], { hoje, limite: 14, unidade: ['dia', 'dias'] }),
    ],
    notas: ['Soma de todos os posts, só orgânico. O alcance é o de cada dia somado, e por isso passa do alcance único real da semana.'],
  };
}

/** Os fora do feed e os rascunhos que o conector ignorou, numa frase. Só
 *  soma as duas partes quando as duas vieram; com uma só, diz qual. */
function textoIgnorados(ig) {
  const rascunhos = medida(ig?.nao_publicados), semFeed = medida(ig?.sem_feed);
  const total = somaEstrita([rascunhos, semFeed]);
  if (total !== null) return total > 0 ? `Ficaram de fora ${plural(total, 'post', 'posts')} (rascunho ou fora do feed).` : null;
  if (rascunhos) return `Ficaram de fora ${plural(rascunhos, 'rascunho', 'rascunhos')}.`;
  if (semFeed) return `Ficaram de fora ${plural(semFeed, 'post fora do feed', 'posts fora do feed')}.`;
  return null;
}

function corpoLinkedinPosts(p, cota, hoje) {
  const itens = recentesPrimeiro(p.itens, 'publicado_em');
  // As somas e a contagem do período só com o que já foi publicado (regra
  // 5): o post de data que ainda não chegou fica na tabela e fora delas.
  const { ate: publicados, depois: futuros } = separarPorHoje(itens, (x) => x.data ?? x.publicado_em, hoje);
  const ig = objeto(p.ignorados) ? p.ignorados : {};
  const comVideo = itens.filter((x) => objeto(x.video));
  const colData = col('data', 'Data', 'dia');
  const colPost = col('tipo', 'Post', 'texto', { valor: (x) => traduzir(TIPO_POST_LI, x.tipo, 'post') ?? 'post', link: (x) => x.url });
  return {
    destaque: plural(publicados.length, 'post', 'posts'),
    topo: [
      blocoNumeros([
        numero({ id: 'posts', rotulo: 'Posts', valor: publicados.length }),
        numero({ id: 'impressoes', rotulo: 'Impressões (soma)', valor: somaDisponivel(publicados.map((x) => x.impressoes)) }),
        numero({ id: 'engajamento', rotulo: 'Engajamento (soma)', valor: somaDisponivel(publicados.map((x) => x.engajamento)) }),
        numero({ id: 'cliques', rotulo: 'Cliques (soma)', valor: somaDisponivel(publicados.map((x) => x.cliques)) }),
      ], rotuloDia(p.desde, hoje) ? `Desde ${rotuloDia(p.desde, hoje)}` : null),
    ],
    secoes: [
      secaoTabela('posts', 'Posts', itens, [
        colData,
        colPost,
        col('patrocinado', 'Patrocinado', 'sim'),
        col('impressoes', 'Impressões', 'int'),
        col('alcance', 'Alcance', 'int'),
        col('cliques', 'Cliques', 'int'),
        col('curtidas', 'Curtidas', 'int'),
        col('comentarios', 'Comentários', 'int'),
        col('compartilhamentos', 'Compart.', 'int'),
        col('engajamento', 'Engajamento', 'int'),
        col('taxa', 'Taxa', 'fracao'),
        col('reacoes_total', 'Reações', 'int'),
        col('reacoes', 'Reações por tipo', 'texto', { valor: (x) => (objeto(x.reacoes) ? textoDoMapa(x.reacoes, { rotular: (k) => conhecido(REACOES_LI, k), outros: 'outras reações' }) ?? 'nenhuma' : null) }),
        col('comentarios_total', 'Comentários, com respostas', 'int'),
        col('comentarios_principais', 'Comentários principais', 'int'),
        col('video', 'Vídeo (vis.)', 'int', { valor: (x) => x.video?.visualizacoes }),
      ], { hoje, aberta: true, unidade: ['post', 'posts'], vazio: 'Nenhum post nos últimos 60 dias.', nota: 'Sem texto e sem imagem: a regra do LinkedIn não deixa guardar. Reações e comentários com respostas só nos 15 posts mais novos; vídeo só nos 3 mais novos.' }),
      comVideo.length
        ? secaoTabela('videos', 'Vídeos dos posts', comVideo, [
          colData,
          colPost,
          col('v_vis', 'Visualizações', 'int', { valor: (x) => x.video.visualizacoes }),
          col('v_esp', 'Espectadores', 'int', { valor: (x) => x.video.espectadores }),
          col('v_tempo', 'Tempo assistido', 'durms', { valor: (x) => x.video.tempo_assistido_ms }),
          col('v_tempo_vis', 'Tempo nas visualizações', 'durms', { valor: (x) => x.video.tempo_das_visualizacoes_ms }),
        ], { hoje, unidade: ['vídeo', 'vídeos'], nota: 'Espectadores: pessoas diferentes. Tempo nas visualizações: só o das visualizações que contaram.' })
        : null,
    ],
    notas: [
      textoIgnorados(ig),
      notaDoFuturo(futuros, (x) => x.data ?? x.publicado_em, hoje, { oQue: ['o post', 'os posts'], verbo: ['tem data que ainda não chegou', 'têm data que ainda não chegou'] }),
      objeto(cota) ? `Chamadas à API nesta coleta: ${formatar('int', cota.usadas)} de ${formatar('int', cota.orcamento)} (o LinkedIn dá ${formatar('int', cota.teto_dia)} por dia).` : null,
    ],
  };
}

/** Os quadros do LinkedIn (ligação linkedin do canal linkedin). */
export function quadrosLinkedin(l, { hoje } = {}) {
  const d = objeto(l?.dados) ? l.dados : {};
  const base = { ligacao: l, rotuloFonte: 'LinkedIn', hoje };
  if (!PARTES_LINKEDIN.some((p) => objeto(d[p]))) return [montarQuadro({ ...base, id: 'linkedin', titulo: 'LinkedIn', partes: [...PARTES_LINKEDIN], temDado: false })];
  return [
    montarQuadro({ ...base, id: 'li-seguidores', titulo: 'Página e seguidores', partes: ['pagina', 'seguidores'], temDado: objeto(d.pagina) || objeto(d.seguidores), corpo: () => corpoLinkedinSeguidores(d, hoje) }),
    montarQuadro({ ...base, id: 'li-visitas', titulo: 'Visitas à página', partes: ['visitas'], temDado: objeto(d.visitas), corpo: () => corpoLinkedinVisitas(d.visitas, hoje) }),
    montarQuadro({ ...base, id: 'li-conteudo', titulo: 'Conteúdo', partes: ['conteudo'], temDado: objeto(d.conteudo), corpo: () => corpoLinkedinConteudo(d.conteudo, hoje) }),
    montarQuadro({ ...base, id: 'li-posts', titulo: 'Posts', partes: ['posts'], temDado: objeto(d.posts) && Array.isArray(d.posts.itens), corpo: () => corpoLinkedinPosts(d.posts, d.cota, hoje) }),
  ];
}

/* ----------------------------------------------------------- Pinterest -- */

export const PARTES_PINTEREST = Object.freeze(['perfil', 'conta', 'top', 'pins', 'pastas', 'anuncios', 'analise_pins']);

const GRUPO_PIN = Object.freeze({
  MOBILE: 'celular', DESKTOP: 'computador', TABLET: 'tablet', WEB: 'navegador', YOUR_PINS: 'seus Pins', OTHER_PINS: 'Pins de outros',
  ORGANIC_IMAGE: 'imagem orgânica', ORGANIC_VIDEO: 'vídeo orgânico', ORGANIC_PRODUCT: 'produto orgânico', ORGANIC_CAROUSEL: 'carrossel orgânico',
  PAID_IMAGE: 'imagem paga', PAID_VIDEO: 'vídeo pago', PAID_CAROUSEL: 'carrossel pago', OWNED: 'do site reivindicado', NOT_OWNED: 'de outros sites',
});
const QUEBRAS_PIN = Object.freeze([['aparelho', 'Aparelho'], ['origem', 'De quem é o Pin'], ['formato', 'Formato'], ['conteudo_proprio', 'Conteúdo do site']]);
const METRICAS_PIN = Object.freeze([
  ['impressoes', 'Impressões', 'int'], ['engajamento', 'Engajamento', 'int'], ['taxa_engajamento', 'Taxa de engajamento', 'fracao'],
  ['cliques_pin', 'Cliques no Pin', 'int'], ['taxa_cliques_pin', 'Taxa de cliques no Pin', 'fracao'], ['cliques_saida', 'Cliques de saída', 'int'],
  ['taxa_cliques_saida', 'Taxa de cliques de saída', 'fracao'], ['salvamentos', 'Salvamentos', 'int'], ['taxa_salvamento', 'Taxa de salvamento', 'fracao'],
]);
/** As métricas além das nove confirmadas, com o nome que o conector dá
 *  (pinterest.mjs, NOMES) e o tipo do número. */
export const EXTRAS_PIN = Object.freeze({
  ampliacoes: ['ampliações', 'int'], taxa_ampliacoes: ['taxa de ampliação', 'fracao'], visitas_perfil: ['visitas ao perfil', 'int'],
  seguidores_ganhos: ['seguidores ganhos', 'int'], comentarios: ['comentários', 'int'], reacoes: ['reações', 'int'],
  video_visualizacoes: ['visualizações de vídeo', 'int'], video_inicios: ['vídeos iniciados', 'int'], video_10s: ['vídeo visto por 10 s', 'int'],
  video_95: ['vídeo visto até 95%', 'int'], video_tempo_medio: ['tempo médio de vídeo', 'ms'], video_tempo_v50: ['tempo assistido com metade na tela', 'durms'],
});
const ORDEM_TOP = Object.freeze({ ENGAGEMENT: 'engajamento', IMPRESSION: 'impressões', OUTBOUND_CLICK: 'cliques de saída', PIN_CLICK: 'cliques no Pin', SAVE: 'salvamentos', VIDEO_MRC_VIEW: 'visualizações de vídeo' });
const TIPO_CRIATIVO = Object.freeze({ REGULAR: 'imagem', VIDEO: 'vídeo', CAROUSEL: 'carrossel', MAX_VIDEO: 'vídeo grande', SHOP_THE_PIN: 'compra no Pin', COLLECTION: 'coleção', IDEA: 'Pin de ideia', SHOWCASE: 'vitrine', QUIZ: 'quiz' });
// As métricas da conta pelo nome da API (o aviso de métrica recusada), com
// o nome de gente; a que não está aqui vira "outra métrica".
const METRICAS_API_PIN = Object.freeze({
  IMPRESSION: 'impressões', ENGAGEMENT: 'engajamento', ENGAGEMENT_RATE: 'taxa de engajamento', PIN_CLICK: 'cliques no Pin', PIN_CLICK_RATE: 'taxa de cliques no Pin',
  OUTBOUND_CLICK: 'cliques de saída', OUTBOUND_CLICK_RATE: 'taxa de cliques de saída', SAVE: 'salvamentos', SAVE_RATE: 'taxa de salvamento',
  CLOSEUP: 'ampliações', CLOSEUP_RATE: 'taxa de ampliação', PROFILE_VISIT: 'visitas ao perfil', USER_FOLLOW: 'seguidores ganhos', TOTAL_COMMENTS: 'comentários',
  TOTAL_REACTIONS: 'reações', VIDEO_MRC_VIEW: 'visualizações de vídeo', VIDEO_START: 'vídeos iniciados', VIDEO_10S_VIEW: 'vídeo visto por 10 s',
  QUARTILE_95_PERCENT_VIEW: 'vídeo visto até 95%', VIDEO_AVG_WATCH_TIME: 'tempo médio de vídeo', VIDEO_V50_WATCH_TIME: 'tempo assistido com metade na tela',
});
/** A situação do dia nos números do Pinterest (data_status): pronto,
 *  estimativa, processando, e os BEFORE_ (dia antes de a conta, o Pin ou a
 *  medição existirem). O código que a tela não conhece vira "outra
 *  situação". */
export function situacaoDoDia(status) {
  if (status == null || status === '') return null;
  const s = String(status);
  if (/^BEFORE_/.test(s)) return 'antes da medição';
  return traduzir({ READY: 'pronto', ESTIMATE: 'estimativa', PROCESSING: 'processando' }, s, 'outra situação');
}

/** As métricas extras do Pinterest ({nome: n}) numa linha, com o nome de
 *  gente ("ampliações 30, visitas ao perfil 12"). A que a tela não conhece
 *  vira "outra métrica", nunca o nome da API; extra sem número fica de fora
 *  (não vira 0); `sem` tira as que a tabela já mostra em coluna própria. */
export function textoExtras(extras, { sem = [] } = {}) {
  if (!objeto(extras)) return null;
  const l = Object.entries(extras)
    .filter(([k]) => !sem.includes(k))
    .map(([k, v]) => {
      const n = medida(v);
      if (n === null) return null;
      const [rotulo, tipo] = Object.hasOwn(EXTRAS_PIN, k) ? EXTRAS_PIN[k] : ['outra métrica', 'int'];
      return `${rotulo} ${formatar(tipo, n)}`;
    })
    .filter(Boolean);
  return l.length ? l.join(', ') : null;
}

const COLS_M = [
  col('impressoes', 'Impressões', 'int'),
  col('engajamento', 'Engajamento', 'int'),
  col('cliques_pin', 'Cliques no Pin', 'int'),
  col('cliques_saida', 'Cliques de saída', 'int'),
  col('salvamentos', 'Salvamentos', 'int'),
];
const COLS_TAXAS = [
  col('taxa_engajamento', 'Taxa de engajamento', 'fracao'),
  col('taxa_cliques_pin', 'Taxa de cliques no Pin', 'fracao'),
  col('taxa_cliques_saida', 'Taxa de cliques de saída', 'fracao'),
  col('taxa_salvamento', 'Taxa de salvamento', 'fracao'),
];

/** O nome de um Pin: o título que a lista de Pins trouxe, ou o fim do id. */
function nomesDosPins(d) {
  const mapa = new Map();
  for (const p of [...lista(d.pins?.itens), ...lista(d.pins?.do_site?.de_fora)]) if (objeto(p) && p.id) mapa.set(String(p.id), texto(p.titulo, 120));
  return (id) => mapa.get(String(id)) || `Pin ${String(id ?? '').slice(-6)}`;
}

function corpoPinterestConta(d, hoje) {
  const pf = objeto(d.perfil) ? d.perfil : {};
  const c = objeto(d.conta) ? d.conta : null;
  const total = objeto(c?.total) ? c.total : null;
  const { atual, anterior } = ultimasDuas(total?.semanas, 'semana', (s) => s.pronta !== false);
  const comparar = (campo) => (anterior ? anterior[campo] : undefined);
  const s = (campo, rotulo, tipo = 'int') => numero({ id: `s-${campo}`, rotulo, tipo, valor: atual?.[campo], anterior: comparar(campo) });
  const resumo = (k) => (objeto(c?.[k]?.resumo) ? c[k].resumo : {});
  const extrasDe = (k) => (objeto(resumo(k).extras) ? resumo(k).extras : {});
  const chavesExtras = [...new Set(['total', 'organico', 'pago'].flatMap((k) => Object.keys(extrasDe(k))))];
  const linhasPeriodo = [
    ...METRICAS_PIN.map(([k, rotulo, tipo]) => ({ k, rotulo, tipo, total: resumo('total')[k], organico: resumo('organico')[k], pago: resumo('pago')[k] })),
    ...chavesExtras.map((k) => {
      const [rotulo, tipo] = Object.hasOwn(EXTRAS_PIN, k) ? EXTRAS_PIN[k] : ['outra métrica', 'int'];
      return { k, rotulo: `${rotulo.charAt(0).toUpperCase()}${rotulo.slice(1)}`, tipo, total: extrasDe('total')[k], organico: extrasDe('organico')[k], pago: extrasDe('pago')[k] };
    }),
  ];
  const colsSemana = [
    col('semana', 'Semana de', 'dia'),
    colSemanaFechada('pronta', 'ainda não pronta', { hoje }),
    col('dias_com_dado', 'Dias medidos', 'int'),
    ...COLS_M,
    col('taxa_engajamento', 'Taxa de engaj.', 'fracao'),
  ];
  const semanasDe = (k) => (objeto(c?.[k]) && Array.isArray(c[k].semanas) ? recentesPrimeiro(c[k].semanas, 'semana') : null);
  const organicas = semanasDe('organico'), pagas = semanasDe('pago');
  return {
    destaque: medida(pf.seguidores) !== null ? `${formatar('int', pf.seguidores)} seguidores` : null,
    topo: [
      blocoNumeros([
        numero({ id: 'seguidores', rotulo: 'Seguidores', valor: pf.seguidores }),
        numero({ id: 'seguindo', rotulo: 'Seguindo', valor: pf.seguindo }),
        numero({ id: 'pins', rotulo: 'Pins', valor: pf.pins, titulo: 'Criados e salvos.' }),
        numero({ id: 'pastas', rotulo: 'Pastas', valor: pf.pastas }),
        numero({ id: 'mensais', rotulo: 'Visualizações no mês', valor: pf.visualizacoes_mensais }),
      ], 'Agora'),
      atual
        ? blocoNumeros([
          s('impressoes', 'Impressões'), s('engajamento', 'Engajamento'), s('cliques_pin', 'Cliques no Pin'), s('cliques_saida', 'Cliques de saída'), s('salvamentos', 'Salvamentos'),
          s('taxa_engajamento', 'Taxa de engajamento', 'fracao'),
        ], `${rotuloSemana(atual.semana, anterior?.semana, hoje)}. Orgânico e pago`)
        : c ? blocoTexto('Nenhuma semana pronta ainda (o Pinterest atrasa uns 2 dias).') : null,
      total ? blocoGrafico(total.por_dia, { x: 'dia', y: 'impressoes', titulo: 'Impressões por dia', unidade: 'impressões', hoje, fraco: (x) => x.status && x.status !== 'READY' }) : null,
      lista(c?.metricas_recusadas).length ? blocoAvisos([{ nivel: 'atencao', texto: `O Pinterest recusou nesta coleta: ${[...new Set(lista(c.metricas_recusadas).map((m) => traduzir(METRICAS_API_PIN, m, 'outra métrica')).filter(Boolean))].join(', ')}.` }]) : null,
    ],
    secoes: [
      c
        ? secaoTabela('periodo', 'Orgânico e pago no período', linhasPeriodo, [
          col('rotulo', 'Medida'),
          ...[['total', 'Total'], ['organico', 'Orgânico'], ['pago', 'Pago']].map(([k, r]) => col(k, r, 'texto', { valor: (x) => (medida(x[k]) === null ? null : formatar(x.tipo, x[k])), numerico: true })),
        ], { aberta: true, chave: 'k', unidade: ['medida', 'medidas'], nota: rotuloPeriodo(d.janela?.inicio, d.janela?.fim, hoje) ? `Período ${rotuloPeriodo(d.janela.inicio, d.janela.fim, hoje)}.` : null })
        : null,
      secaoTabela('semanas', 'Por semana', total ? recentesPrimeiro(total.semanas, 'semana') : null, colsSemana, {
        hoje, unidade: ['semana', 'semanas'], semDado: 'Não veio nesta coleta.', nota: 'Pronta: os 7 dias vieram fechados pelo Pinterest.',
        titulo: organicas || pagas ? 'Orgânico e pago' : null,
        depois: [
          organicas ? blocoTabela(organicas, colsSemana, { hoje, titulo: 'Só orgânico' }) : null,
          pagas ? blocoTabela(pagas, colsSemana, { hoje, titulo: 'Só pago' }) : null,
        ],
      }),
      c && objeto(c.quebras)
        ? secao('quebras', 'Por aparelho, origem e formato', QUEBRAS_PIN.filter(([k]) => Array.isArray(c.quebras[k])).map(([k, titulo]) =>
          blocoTabela(ordenar(c.quebras[k], 'impressoes'), [
            col('grupo', titulo, 'texto', { valor: (x) => traduzir(GRUPO_PIN, x.grupo, 'outro grupo') }),
            ...COLS_M,
            ...COLS_TAXAS,
            col('extras', 'Outras métricas', 'texto', { valor: (x) => textoExtras(x.extras), max: 300 }),
          ])
        ), { resumo: plural(QUEBRAS_PIN.filter(([k]) => Array.isArray(c.quebras[k])).length, 'quebra', 'quebras') })
        : null,
      secaoTabela('dias', 'Por dia', total ? recentesPrimeiro(total.por_dia, 'dia') : null, [
        col('dia', 'Dia', 'dia'),
        col('status', 'Situação', 'texto', { valor: (x) => situacaoDoDia(x.status), tom: (x) => (x.status && x.status !== 'READY' ? 'warn' : null) }),
        ...COLS_M,
      ], { hoje, limite: 14, unidade: ['dia', 'dias'], semDado: 'Não veio nesta coleta.' }),
      secao('perfil', 'Sobre o perfil', [
        blocoPares([
          { rotulo: 'Usuário', valor: pf.usuario ? `@${pf.usuario}` : null, link: pf.url },
          { rotulo: 'Nome', valor: pf.nome },
          { rotulo: 'Tipo de conta', valor: traduzir({ BUSINESS: 'empresa', PINNER: 'pessoal' }, pf.tipo_conta, 'outro tipo') },
          { rotulo: 'Site', valor: pf.site, link: pf.site },
          { rotulo: 'Sobre', valor: pf.sobre },
        ]),
      ]),
    ],
    notas: ['Os dias do Pinterest são em UTC (3 horas à frente de Brasília) e chegam com uns 2 dias de atraso; os dias ainda não fechados ficam mais claros no gráfico.'],
  };
}

function corpoPinterestTop(d, hoje) {
  const top = objeto(d.top) ? d.top : {};
  const nome = nomesDosPins(d);
  const lista3 = [['semana', 'Da última semana', true], ['periodo', 'Do período', false], ['video', 'Vídeos', false]];
  return {
    destaque: objeto(top.semana) ? plural(lista(top.semana.pins).length, 'Pin na semana', 'Pins na semana') : null,
    topo: [blocoTexto('Os 50 melhores Pins por engajamento (vídeo: por visualizações). Orgânico e pago juntos.')],
    secoes: lista3.map(([k, titulo, aberta]) => {
      const t = objeto(top[k]) ? top[k] : null;
      return secaoTabela(`top-${k}`, titulo, t ? lista(t.pins).filter(objeto) : null, [
        col('pin', 'Pin', 'texto', { valor: (x) => nome(x.id), link: (x) => x.url }),
        col('pronto', 'Dados prontos', 'sim', { tom: (x) => (x.pronto === false ? 'warn' : null) }),
        ...COLS_M,
        ...COLS_TAXAS,
        ...(k === 'video'
          ? [col('vv', 'Visualizações de vídeo', 'int', { valor: (x) => x.extras?.video_visualizacoes }), col('vt', 'Tempo médio', 'ms', { valor: (x) => x.extras?.video_tempo_medio })]
          : []),
        col('extras', 'Outras métricas', 'texto', { valor: (x) => textoExtras(x.extras, { sem: k === 'video' ? ['video_visualizacoes', 'video_tempo_medio'] : [] }), max: 300 }),
      ], {
        aberta, unidade: ['Pin', 'Pins'], semDado: 'Não veio nesta coleta.', vazio: 'Nenhum Pin nesta lista.',
        nota: t
          ? [
            rotuloPeriodo(t.inicio, t.fim, hoje),
            traduzir(ORDEM_TOP, t.ordem, 'outra medida') ? `ordenados por ${traduzir(ORDEM_TOP, t.ordem, 'outra medida')}` : null,
            t.dados_ate ? `dados até ${rotuloDia(t.dados_ate, hoje) ?? 'data não informada'}` : null,
            t.tempo_real === true ? 'dados em tempo real, que ainda mudam' : null,
          ].filter(Boolean).join('; ') || null
          : null,
      });
    }),
  };
}

function corpoPinterestPins(d, hoje) {
  const pins = objeto(d.pins) ? d.pins : null;
  const site = objeto(pins?.do_site) ? pins.do_site : null;
  const pastas = objeto(d.pastas) ? d.pastas : null;
  const nomeDaPasta = new Map(lista(pastas?.itens).filter(objeto).map((p) => [String(p.id), texto(p.nome, 80)]));
  const colsPin = [
    col('data', 'Data', 'dia'),
    col('titulo', 'Pin', 'texto', { valor: (x) => x.titulo || `Pin ${String(x.id ?? '').slice(-6)}`, link: (x) => x.url, max: 120 }),
    col('midia', 'Mídia', 'texto', { valor: (x) => (x.video ? 'vídeo' : x.tipo_midia ? 'imagem' : null) }),
    col('tipo_criativo', 'Tipo', 'texto', { valor: (x) => traduzir(TIPO_CRIATIVO, x.tipo_criativo, 'outro tipo') }),
    col('pasta', 'Pasta', 'texto', { valor: (x) => (x.pasta_id == null ? null : nomeDaPasta.get(String(x.pasta_id)) ?? 'outra pasta') }),
    col('descricao', 'Descrição', 'texto', { max: 200 }),
    col('destino', 'Destino', 'texto', { link: (x) => x.destino, max: 120 }),
    col('leva_ao_site', 'Leva ao site', 'sim'),
    col('promovido', 'Promovido', 'sim'),
    col('ia', 'Feito com IA', 'sim'),
    col('i90', 'Impressões (90 dias)', 'int', { valor: (x) => x.ultimos_90_dias?.impressoes }),
    col('c90', 'Cliques no Pin (90 dias)', 'int', { valor: (x) => x.ultimos_90_dias?.cliques_pin }),
    col('s90', 'Cliques de saída (90 dias)', 'int', { valor: (x) => x.ultimos_90_dias?.cliques_saida }),
    col('ids', 'Impressões (desde sempre)', 'int', { valor: (x) => x.desde_sempre?.impressoes }),
    col('cds', 'Cliques no Pin (desde sempre)', 'int', { valor: (x) => x.desde_sempre?.cliques_pin }),
    col('sds', 'Cliques de saída (desde sempre)', 'int', { valor: (x) => x.desde_sempre?.cliques_saida }),
    col('reacoes', 'Reações', 'int', { valor: (x) => x.desde_sempre?.reacoes }),
    col('comentarios', 'Comentários', 'int', { valor: (x) => x.desde_sempre?.comentarios }),
  ];
  return {
    destaque: pins && medida(pins.total) !== null ? `${formatar('int', pins.total)} Pins criados` : null,
    topo: [
      blocoNumeros([
        numero({ id: 'pins', rotulo: 'Pins criados', valor: pins?.total }),
        numero({ id: 'site', rotulo: 'Pins do site', valor: site?.total }),
        numero({ id: 'imp90', rotulo: 'Impressões dos Pins do site (90 dias)', valor: site?.ultimos_90_dias?.impressoes }),
        numero({ id: 'saida90', rotulo: 'Cliques de saída para o site (90 dias)', valor: site?.ultimos_90_dias?.cliques_saida }),
        numero({ id: 'pastas', rotulo: 'Pastas', valor: pastas?.total }),
      ]),
    ],
    secoes: [
      secaoTabela('pins', 'Pins', pins ? recentesPrimeiro(pins.itens, 'criado_em') : null, colsPin, {
        hoje, aberta: true, unidade: ['Pin', 'Pins'], semDado: 'Não veio nesta coleta.', vazio: 'Nenhum Pin criado pela conta.',
        nota: [pins?.completo === false ? 'A lista passou do teto de páginas: o total conta todos, a tabela mostra os mais novos.' : null, '"Desde sempre" só existe para Pin criado a partir de 20/03/2023.'].filter(Boolean).join(' '),
      }),
      site
        ? secao('do_site', `Pins do site${site.dominio ? ` (${texto(site.dominio, 80)})` : ''}`, [
          blocoPares([
            { rotulo: 'Pins que levam ao site', valor: site.total, tipo: 'int' },
            { rotulo: 'Impressões (90 dias)', valor: site.ultimos_90_dias?.impressoes, tipo: 'int' },
            { rotulo: 'Cliques no Pin (90 dias)', valor: site.ultimos_90_dias?.cliques_pin, tipo: 'int' },
            { rotulo: 'Cliques de saída (90 dias)', valor: site.ultimos_90_dias?.cliques_saida, tipo: 'int' },
            { rotulo: 'Impressões (desde sempre)', valor: site.desde_sempre?.impressoes, tipo: 'int' },
            { rotulo: 'Cliques no Pin (desde sempre)', valor: site.desde_sempre?.cliques_pin, tipo: 'int' },
            { rotulo: 'Cliques de saída (desde sempre)', valor: site.desde_sempre?.cliques_saida, tipo: 'int' },
          ]),
          site.completo === false ? blocoTexto('A busca dos Pins do site passou do teto de páginas: os números somam só os Pins que vieram.') : null,
          lista(site.de_fora).length ? blocoTabela(recentesPrimeiro(site.de_fora, 'criado_em'), colsPin, { hoje, titulo: 'Salvos por outras contas', nota: 'Pins com o endereço do site que outras contas salvaram.' }) : null,
        ])
        : null,
      secaoTabela('pastas', 'Pastas', pastas ? ordenar(pastas.itens, 'pins') : null, [
        col('nome', 'Pasta', 'texto', { max: 100 }),
        col('descricao', 'Descrição', 'texto', { max: 200 }),
        col('pins', 'Pins', 'int'),
        col('seguidores', 'Seguidores', 'int'),
        col('colaboradores', 'Colaboradores', 'int'),
        col('privacidade', 'Privacidade', 'texto', { valor: (x) => traduzir({ PUBLIC: 'pública', PROTECTED: 'protegida', SECRET: 'secreta' }, x.privacidade, 'outra') }),
        col('criada_em', 'Criada', 'dia'),
        col('pins_alterados_em', 'Último Pin', 'dia'),
      ], { hoje, unidade: ['pasta', 'pastas'], semDado: 'Não veio nesta coleta.', vazio: 'Nenhuma pasta.', nota: pastas?.completo === false ? 'A lista passou do teto de páginas: o total conta todas, a tabela mostra as que vieram.' : null }),
    ],
  };
}

function corpoPinterestAnalise(a, d, hoje) {
  const nome = nomesDosPins(d);
  const itens = ordenar(lista(a.itens).filter(objeto), (x) => x.soma?.impressoes);
  const seguidores = lista(a.seguidores_por_semana).filter(objeto);
  // Uma linha por Pin e semana: a curva de cada Pin.
  const semanasDosPins = itens.flatMap((x) => recentesPrimeiro(x.semanas, 'semana').map((s) => ({ ...s, pinId: x.id, url: x.url })));
  const MOSTRADAS = ['comentarios', 'reacoes', 'seguidores_ganhos', 'visitas_perfil'];
  return {
    destaque: medida(a.medidos) !== null ? `${formatar('int', a.medidos)} Pins medidos` : null,
    topo: [
      blocoNumeros([
        numero({ id: 'medidos', rotulo: 'Pins medidos', valor: a.medidos, titulo: `De ${formatar('int', a.pedidos)} escolhidos.` }),
        numero({ id: 'seguidores', rotulo: 'Seguidores ganhos (piso)', valor: somaDisponivel(separarPorHoje(seguidores, 'semana', hoje).ate.map((s) => s.ganhos)), titulo: 'Somados só dos Pins medidos: o total da conta é maior ou igual.' }),
      ], rotuloPeriodo(a.inicio, a.fim, hoje) ? `Período ${rotuloPeriodo(a.inicio, a.fim, hoje)}` : null),
    ],
    secoes: [
      secaoTabela('itens', 'Por Pin', itens, [
        col('pin', 'Pin', 'texto', { valor: (x) => nome(x.id), link: (x) => x.url }),
        col('midia', 'Mídia', 'texto', { valor: (x) => (x.video === true ? 'vídeo' : x.video === false ? 'imagem' : null) }),
        col('origem', 'Escolhido por', 'texto', { valor: (x) => traduzir({ recente: 'ser recente', top: 'estar no top' }, x.origem, 'outro motivo') }),
        col('impressoes', 'Impressões', 'int', { valor: (x) => x.soma?.impressoes }),
        col('cliques_pin', 'Cliques no Pin', 'int', { valor: (x) => x.soma?.cliques_pin }),
        col('cliques_saida', 'Cliques de saída', 'int', { valor: (x) => x.soma?.cliques_saida }),
        col('salvamentos', 'Salvamentos', 'int', { valor: (x) => x.soma?.salvamentos }),
        col('taxa_salvamento', 'Taxa de salvamento', 'fracao', { valor: (x) => x.soma?.taxa_salvamento }),
        col('taxa_cliques_saida', 'Taxa de cliques de saída', 'fracao', { valor: (x) => x.soma?.taxa_cliques_saida }),
        col('taxa_cliques_pin', 'Taxa de cliques no Pin', 'fracao', { valor: (x) => x.soma?.taxa_cliques_pin }),
        col('seguidores', 'Seguidores ganhos', 'int', { valor: (x) => x.soma?.seguidores_ganhos }),
        col('visitas', 'Visitas ao perfil', 'int', { valor: (x) => x.soma?.visitas_perfil }),
        col('reacoes', 'Reações', 'int', { valor: (x) => x.soma?.reacoes }),
        col('comentarios', 'Comentários', 'int', { valor: (x) => x.soma?.comentarios }),
        col('reacoes_ds', 'Reações (desde sempre)', 'int', { valor: (x) => x.desde_sempre?.reacoes }),
        col('comentarios_ds', 'Comentários (desde sempre)', 'int', { valor: (x) => x.desde_sempre?.comentarios }),
        col('aprox', 'Engajamento (aprox.)', 'int', { valor: (x) => x.engajamento_aprox, titulo: () => 'Salvamentos, cliques no Pin e cliques de saída somados: o Pinterest não dá o engajamento por Pin.' }),
        col('extras', 'Outras métricas', 'texto', { valor: (x) => textoExtras(x.soma?.extras, { sem: MOSTRADAS }), max: 300 }),
      ], { aberta: true, unidade: ['Pin', 'Pins'], vazio: 'Nenhum Pin medido.' }),
      semanasDosPins.length
        ? secaoTabela('pin_semanas', 'Por Pin, semana a semana', semanasDosPins, [
          col('pin', 'Pin', 'texto', { valor: (x) => nome(x.pinId), link: (x) => x.url }),
          col('semana', 'Semana de', 'dia'),
          colSemanaFechada('pronta', 'ainda não pronta', { hoje }),
          col('impressoes', 'Impressões', 'int'),
          col('cliques_pin', 'Cliques no Pin', 'int'),
          col('cliques_saida', 'Cliques de saída', 'int'),
          col('salvamentos', 'Salvamentos', 'int'),
          col('seguidores_ganhos', 'Seguidores ganhos', 'int'),
          col('visitas_perfil', 'Visitas ao perfil', 'int'),
          col('video_visualizacoes', 'Visualizações de vídeo', 'int'),
        ], { hoje, limite: 9, unidade: ['linha', 'linhas'], chave: (x, i) => `${x.pinId ?? ''}-${x.semana ?? i}` })
        : null,
      secaoTabela('seguidores', 'Seguidores ganhos por semana', recentesPrimeiro(seguidores, 'semana'), [
        col('semana', 'Semana de', 'dia'), col('ganhos', 'Ganhos', 'int'), col('pins_medidos', 'Pins medidos', 'int'),
      ], { hoje, unidade: ['semana', 'semanas'], nota: 'Somados só dos Pins medidos: um piso, não o total da conta.' }),
    ],
    notas: ['Engajamento aproximado: o Pinterest não dá o engajamento por Pin.'],
  };
}

/** O público dos anúncios do Pinterest (total ou engajado): o tamanho, o dia
 *  do retrato, as barras de idade, gênero, país, região e aparelho, e a
 *  tabela dos interesses com o índice de afinidade e as subcategorias. */
function publicoEmBlocos(p, titulo, hoje) {
  if (!objeto(p)) return [blocoTexto(`${titulo}: não veio nesta coleta.`)];
  // O Pinterest manda o nome em inglês (female, Brazil, Mobile): o que a
  // tela conhece pela chave vira português; o resto vai como veio.
  // O nome em inglês que o Pinterest manda é nome ("Minas Gerais"); sem
  // nome, a chave crua não vai: vira "outro".
  const nomeDe = (mapa) => (x) => conhecido(mapa, x.chave) ?? texto(x.nome, 60) ?? 'outro';
  const barras = (l, t, rotular = nomeDe({})) => (lista(l).length ? blocoBarras(ordenar(lista(l).filter(objeto).map((x) => ({ rotulo: rotular(x), valor: x.proporcao })), 'valor').slice(0, 10), { tipo: 'fracao', titulo: `${titulo}: ${t}` }) : null);
  const interesses = ordenar(lista(p.interesses).filter(objeto), 'proporcao');
  return [
    blocoPares([
      { rotulo: `${titulo}: tamanho`, valor: medida(p.tamanho) === null ? null : `${p.tamanho_e_teto ? 'mais de ' : ''}${formatar('int', p.tamanho)} pessoas` },
      { rotulo: `${titulo}: retrato de`, valor: p.data, tipo: 'dia', hoje },
    ]),
    barras(p.idades, 'idade'),
    barras(p.generos, 'gênero', nomeDe({ female: 'feminino', male: 'masculino', unknown: 'não informado', unspecified: 'não informado' })),
    barras(p.paises, 'país', (x) => nomeDoPais(x.chave, null) ?? texto(x.nome, 60) ?? 'outro país'),
    barras(p.regioes, 'região'),
    barras(p.aparelhos, 'aparelho', nomeDe({ MOBILE: 'celular', WEB: 'navegador', TABLET: 'tablet', DESKTOP: 'computador' })),
    interesses.length
      ? blocoTabela(interesses.slice(0, 15), [
        col('nome', 'Interesse', 'texto', { valor: (x) => texto(x.nome, 80) ?? 'interesse sem nome' }),
        col('proporcao', 'Parte do público', 'fracao', { casas: 0 }),
        col('indice', 'Afinidade', 'dec1', { titulo: () => 'Quantas vezes mais que a média do Pinterest (1 é igual à média).' }),
        col('subcategorias', 'Subcategorias', 'texto', {
          valor: (x) => lista(x.subcategorias).filter(objeto).map((s) => `${texto(s.nome, 60) ?? 'sem nome'} ${formatar('fracao', s.proporcao, { casas: 0 })}${medida(s.indice) !== null ? ` (afinidade ${formatar('dec1', s.indice)})` : ''}`).join(', ') || null,
          max: 400,
        }),
      ], { chave: 'chave', titulo: `${titulo}: interesses`, nota: 'Afinidade: quantas vezes mais que a média do Pinterest (1 é igual à média).' })
      : null,
  ];
}

function corpoPinterestAnuncios(c, hoje) {
  const moeda = texto(c.moeda, 3) || 'BRL';
  const r = objeto(c.resumo) ? c.resumo : {};
  const publico = objeto(c.publico) ? c.publico : null;
  const colsA = [
    col('gasto', 'Gasto', 'moeda'),
    col('impressoes_pagas', 'Impressões pagas', 'int'),
    col('impressoes_total', 'Impressões totais', 'int'),
    col('cliques', 'Cliques', 'int'),
    col('cliques_saida', 'Cliques de saída', 'int'),
    col('engajamento', 'Engajamento', 'int'),
    col('salvamentos', 'Salvamentos', 'int'),
    col('leads', 'Leads', 'int'),
    col('leads_tag', 'Leads pela tag', 'int'),
    col('conversoes', 'Conversões', 'int'),
    col('sessoes_site', 'Sessões no site', 'int'),
    col('visitas_pagina', 'Visitas à página', 'int'),
    col('video_visualizacoes', 'Visualizações de vídeo', 'int'),
    col('ctr', 'CTR', 'fracao', { casas: 2 }),
    col('cpc', 'CPC', 'moeda'),
    col('cpm', 'CPM', 'moeda'),
    col('custo_por_lead', 'Custo por lead', 'moeda'),
  ];
  return {
    destaque: medida(r.gasto) !== null ? `${formatar('moeda', r.gasto, { moeda })} no período` : null,
    topo: [
      blocoNumeros([
        numero({ id: 'gasto', rotulo: 'Gasto', tipo: 'moeda', moeda, valor: r.gasto }),
        numero({ id: 'impressoes', rotulo: 'Impressões pagas', valor: r.impressoes_pagas }),
        numero({ id: 'cliques', rotulo: 'Cliques', valor: r.cliques }),
        numero({ id: 'saida', rotulo: 'Cliques de saída', valor: r.cliques_saida }),
        numero({ id: 'leads', rotulo: 'Leads', valor: r.leads }),
        numero({ id: 'conversoes', rotulo: 'Conversões', valor: r.conversoes }),
        numero({ id: 'ctr', rotulo: 'CTR', tipo: 'fracao', valor: r.ctr }),
        numero({ id: 'cpc', rotulo: 'CPC', tipo: 'moeda', moeda, valor: r.cpc }),
        numero({ id: 'cpm', rotulo: 'CPM', tipo: 'moeda', moeda, valor: r.cpm }),
        numero({ id: 'cpl', rotulo: 'Custo por lead', tipo: 'moeda', moeda, valor: r.custo_por_lead }),
      ], 'No período'),
      blocoGrafico(c.semanas, { x: 'semana', y: 'gasto', titulo: 'Gasto por semana', tipo: 'moeda', moeda, hoje }),
      c.colunas_recusadas === true ? blocoAvisos([{ nivel: 'atencao', texto: 'O Pinterest recusou parte das colunas dos anúncios: elas ficam sem número.' }]) : null,
    ],
    secoes: [
      secaoTabela('campanhas', 'Campanhas', Array.isArray(c.campanhas) ? ordenar(c.campanhas, 'gasto') : null, [
        col('nome', 'Campanha', 'texto', { max: 120 }),
        col('objetivo', 'Objetivo', 'texto', { valor: (x) => traduzir({ LEADS: 'leads', AWARENESS: 'reconhecimento', CONSIDERATION: 'consideração', WEB_CONVERSION: 'conversão no site', CATALOG_SALES: 'catálogo', VIDEO_COMPLETION: 'vídeo', VIDEO_VIEW: 'visualizações de vídeo', WEB_SESSIONS: 'visitas ao site', APP_INSTALL: 'instalações do app' }, x.objetivo, 'outro objetivo') }),
        col('situacao', 'Situação', 'texto', { valor: (x) => traduzir({ ACTIVE: 'ativa', PAUSED: 'pausada', ARCHIVED: 'arquivada', DRAFT: 'rascunho', DELETED_DRAFT: 'rascunho apagado' }, x.situacao, 'outra situação') }),
        col('limite_diario', 'Limite por dia', 'moeda'),
        col('limite_total', 'Limite total', 'moeda'),
        col('inicio', 'Início', 'dia'),
        col('fim', 'Fim', 'dia'),
        ...colsA,
      ], { moeda, hoje, aberta: true, unidade: ['campanha', 'campanhas'], semDado: 'Não veio nesta coleta.', vazio: 'Nenhuma campanha no período.' }),
      secao('periodo', 'Outros números do período', [
        blocoPares([
          { rotulo: 'Impressões totais', valor: r.impressoes_total, tipo: 'int' },
          { rotulo: 'Engajamento', valor: r.engajamento, tipo: 'int' },
          { rotulo: 'Salvamentos', valor: r.salvamentos, tipo: 'int' },
          { rotulo: 'Leads pela tag do site', valor: r.leads_tag, tipo: 'int' },
          { rotulo: 'Sessões no site', valor: r.sessoes_site, tipo: 'int' },
          { rotulo: 'Visitas à página', valor: r.visitas_pagina, tipo: 'int' },
          { rotulo: 'Visualizações de vídeo', valor: r.video_visualizacoes, tipo: 'int' },
          // O alcance pago é de pessoas únicas no dia: no período, só quando o
          // Pinterest manda.
          medida(r.alcance_pago) !== null && { rotulo: 'Alcance pago', valor: r.alcance_pago, tipo: 'int' },
        ]),
      ]),
      secaoTabela('semanas', 'Por semana', recentesPrimeiro(c.semanas, 'semana'), [col('semana', 'Semana de', 'dia'), ...colsA], { moeda, hoje, unidade: ['semana', 'semanas'] }),
      secaoTabela('dias', 'Por dia', recentesPrimeiro(c.por_dia, 'dia'), [
        col('dia', 'Dia', 'dia'),
        col('alcance_pago', 'Alcance pago', 'int', { titulo: () => 'Pessoas únicas no dia: não soma entre dias.' }),
        ...colsA,
      ], {
        moeda, hoje, limite: 14, unidade: ['dia', 'dias'], nota: 'O Pinterest não manda o dia sem entrega; esse dia vale zero (é a regra dele). O alcance pago é de pessoas únicas no dia e não soma.',
      }),
      publico ? secao('publico', 'Público', [...publicoEmBlocos(publico.total, 'Público total', hoje), ...publicoEmBlocos(publico.engajado, 'Público engajado', hoje)]) : null,
      secao('conta', 'Sobre a conta', [
        blocoPares([
          { rotulo: 'Conta', valor: c.nome },
          { rotulo: 'Moeda', valor: c.moeda, tipo: 'nomeMoeda' },
          { rotulo: 'País', valor: c.pais, tipo: 'pais' },
          { rotulo: 'Fuso', valor: c.fuso, tipo: 'fuso' },
          { rotulo: 'Dias contados no fuso', valor: c.fuso_dos_dias === 'UTC' ? 'UTC' : c.fuso_dos_dias === 'conta' ? 'da conta' : null },
        ]),
      ]),
    ],
  };
}

/** Os quadros do Pinterest (ligação pinterest do canal pinterest). */
export function quadrosPinterest(l, { hoje } = {}) {
  const d = objeto(l?.dados) ? l.dados : {};
  const base = { ligacao: l, rotuloFonte: 'Pinterest', hoje };
  if (!PARTES_PINTEREST.some((p) => objeto(d[p]))) return [montarQuadro({ ...base, id: 'pinterest', titulo: 'Pinterest', partes: [...PARTES_PINTEREST], temDado: false })];
  const anuncios = objeto(d.anuncios) ? d.anuncios : null;
  const contas = lista(anuncios?.contas).filter(objeto);
  const cota = objeto(d.cota) ? d.cota : null;
  const quadros = [
    montarQuadro({ ...base, id: 'pin-conta', titulo: 'Perfil e números da conta', partes: ['perfil', 'conta'], temDado: objeto(d.perfil) || objeto(d.conta), corpo: () => corpoPinterestConta(d, hoje) }),
    montarQuadro({ ...base, id: 'pin-top', titulo: 'Melhores Pins', partes: ['top'], temDado: objeto(d.top), corpo: () => corpoPinterestTop(d, hoje) }),
    montarQuadro({ ...base, id: 'pin-pins', titulo: 'Pins e pastas', partes: ['pins', 'pastas'], temDado: objeto(d.pins) || objeto(d.pastas), corpo: () => corpoPinterestPins(d, hoje) }),
    montarQuadro({ ...base, id: 'pin-analise', titulo: 'Análise por Pin', partes: ['analise_pins'], temDado: objeto(d.analise_pins), corpo: () => corpoPinterestAnalise(d.analise_pins, d, hoje) }),
    ...(contas.length
      ? contas.map((c, i) => montarQuadro({
        ...base,
        id: contas.length > 1 ? `pin-anuncios-${c.id ?? i}` : 'pin-anuncios',
        titulo: contas.length > 1 ? `Anúncios do Pinterest: ${texto(c.nome, 60) ?? `conta ${i + 1}`}` : 'Anúncios do Pinterest',
        partes: ['anuncios'],
        temDado: true,
        corpo: () => corpoPinterestAnuncios(c, hoje),
      }))
      : [montarQuadro({ ...base, id: 'pin-anuncios', titulo: 'Anúncios do Pinterest', partes: ['anuncios'], temDado: false, vazio: texto(anuncios?.observacao, 200) ?? (anuncios ? 'Nenhuma conta de anúncios.' : 'Não veio nesta coleta (os anúncios pedem o acesso ads:read).') })]),
  ];
  // A cota do dia vai no último quadro: é da fonte inteira, não de uma parte.
  if (cota && quadros.length) {
    const ultimo = quadros[quadros.length - 1];
    ultimo.notas = [...ultimo.notas, `Chamadas à API nesta coleta: ${formatar('int', cota.usadas)} de ${formatar('int', cota.orcamento)} (o Pinterest dá ${formatar('int', cota.teto_dia)} por dia).`];
  }
  return quadros;
}
