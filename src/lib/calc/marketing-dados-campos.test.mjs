// OS CAMPOS QUE FALTAVAM NA ABA "DADOS" (o pedido do Léo: "puxar todos os
// dados possíveis"): o SEO de cada página do site, e não só o da inicial; o
// valor e o custo de cada ação dos anúncios da Meta; a parcela de impressões,
// o vídeo e o Display de cada campanha do Google Ads; e o resto do FORMATO
// dos seis conectores que não aparecia em lugar nenhum da aba.
//
// Começa pelo caso ruim: a parcela de 0,0999 virando "10%" (ou "9,99%"),
// número que não veio virando 0, dinheiro sem o R$, e o valor de um campo
// que vem como objeto virando "[object Object]" na tela.
//
// Os retratos são os das duas prévias (src/review/fontes-ficticias*.json,
// gerados pelos conectores de verdade). O que as prévias não trazem (vídeo,
// Display, valor de ação) é posto numa cópia, dentro de cada teste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUSENTE, NAO_MEDIDO, celula, formatar, juntar, textoDoMapa, textoParcela, textoPerdida } from './marketing-dados.js';
import { diasDasCampanhas, linhasDaParcela, linhasDeDisplay, linhasDeVideo, quadrosGoogleAds } from './marketing-dados-ads.js';
import { acoesDaLinha, acoesDoPeriodo, quadrosAnunciosMeta, quadrosPaginaFacebook, quadrosPixelMeta, situacaoDoPixel, textoCustoPorResultado, textoResultados } from './marketing-dados-meta.js';
import { chavesDoConsentimento, enderecoRelativo, quadrosSite, resumoDasPaginas, situacaoDaConferencia } from './marketing-dados-site.js';
import { dataDoGoogle, quadrosGa4, quadrosPerfilEmpresa, quadrosSearchConsole, valoresDoAtributo } from './marketing-dados-google.js';
import { quadrosLinkedin, quadrosPinterest, textoExtras } from './marketing-dados-social.js';
import { quadrosDoCanal } from './marketing-dados-canal.js';
import { FONTES_DO_CANAL, fontesDoCanal } from './marketing-fontes.js';
import { tirarRestrito } from '../../../supabase/functions/_shared/mkt-fontes/info.mjs';

const ler = (n) => JSON.parse(readFileSync(new URL(`../../review/${n}`, import.meta.url), 'utf8'));
const VARIEDADE = ler('fontes-ficticias.json');
const CHEIAS = ler('fontes-ficticias-cheias.json');
const copia = (x) => JSON.parse(JSON.stringify(x));
const HOJE = '2026-10-11';
const ctx = { hoje: HOJE };
const sem = (t) => String(t ?? '').replace(/ /g, ' ');

/** A ligação de uma fonte num canal, de uma cópia das prévias. */
const ligacao = (r, canal, fonte, parte = undefined) => copia(fontesDoCanal(canal, r.fontes).find((l) => l.fonte === fonte && (parte === undefined || l.parte === parte)));
/** As tabelas de uma seção do quadro. */
const tabelasDa = (q, secaoId) => (q.secoes.find((s) => s.id === secaoId)?.blocos ?? []).filter((b) => b.tipo === 'tabela');
/** A célula da linha `i` na coluna de rótulo `rotulo`. */
function celulaDe(tabela, i, rotulo) {
  const k = tabela.colunas.findIndex((c) => c.rotulo === rotulo);
  assert.ok(k >= 0, `coluna "${rotulo}" em ${tabela.colunas.map((c) => c.rotulo).join(', ')}`);
  return tabela.linhas[i].celulas[k];
}
/** Todo texto que a tela escreveria de um quadro. */
function textos(q) {
  const t = [q.titulo, q.destaque, q.vazio, ...q.notas];
  for (const s of q.secoes) {
    t.push(s.titulo, s.resumo);
    for (const b of s.blocos) t.push(...textosDoBloco(b));
  }
  for (const b of q.topo) t.push(...textosDoBloco(b));
  return t.filter((x) => typeof x === 'string');
}
function textosDoBloco(b) {
  if (!b) return [];
  if (b.tipo === 'tabela') return [b.titulo, b.nota, ...b.colunas.map((c) => c.rotulo), ...b.linhas.flatMap((l) => l.celulas.flatMap((c) => [c.texto, c.titulo]))];
  if (b.tipo === 'numeros') return [b.titulo, ...b.itens.flatMap((n) => [n.rotulo, n.texto, n.titulo])];
  if (b.tipo === 'pares') return b.itens.flatMap((p) => [p.rotulo, p.texto]);
  if (b.tipo === 'barras') return [b.titulo, ...b.itens.flatMap((i) => [i.rotulo, i.texto])];
  if (b.tipo === 'lista') return b.itens.flatMap((i) => [i.titulo, i.sub, i.texto, i.detalhe]);
  if (b.tipo === 'avisos') return b.itens.map((a) => a.texto);
  if (b.tipo === 'texto') return [b.texto];
  if (b.tipo === 'grafico') return [b.titulo, b.resumo];
  return [];
}

// ------------------------------------------------------------- a parcela --

test('o caso ruim: a parcela de 0,0999 é "menos de 10%", nunca "10%" nem "9,99%", com ou sem a marca do conector', () => {
  for (const p of [{ valor: 0.0999, menosDe10: true }, { valor: 0.0999 }, { valor: 0.0999, menosDe10: false }, 0.0999, '0.0999', { valor: 0.05 }]) {
    assert.equal(textoParcela(p), 'menos de 10%', JSON.stringify(p));
    assert.equal(formatar('parcela', p), 'menos de 10%');
  }
  assert.equal(textoParcela({ valor: 0.1, menosDe10: false }), '10%');
  assert.equal(textoParcela({ valor: 0.456, menosDe10: false }), '46%');
  assert.equal(textoParcela(1), '100%');
  // A perdida: 0,9001 é "mais de 90%"; abaixo disso, o número (e o zero
  // medido continua zero).
  for (const p of [{ valor: 0.9001, maisDe90: true }, { valor: 0.9001 }, 0.9001]) assert.equal(textoPerdida(p), 'mais de 90%', JSON.stringify(p));
  assert.equal(textoPerdida({ valor: 0.05, maisDe90: false }), '5%');
  assert.equal(textoPerdida(0), '0%');
  // Nulo nunca vira 0.
  for (const p of [null, undefined, {}, { valor: null }, { valor: null, menosDe10: false }, 'lixo']) {
    assert.equal(textoParcela(p), NAO_MEDIDO, JSON.stringify(p));
    assert.equal(textoPerdida(p), NAO_MEDIDO, JSON.stringify(p));
    assert.deepEqual(celula('parcela', p), { texto: AUSENTE, vazio: true, titulo: NAO_MEDIDO });
    assert.deepEqual(celula('perdida', p), { texto: AUSENTE, vazio: true, titulo: NAO_MEDIDO });
  }
});

test('Google Ads: a parcela de cada campanha, semana a semana, com "menos de 10%" e "mais de 90%" escritos assim', () => {
  const l = ligacao(CHEIAS, 'site', 'google_ads');
  const c = l.dados.campanhas.lista[0];
  c.parcela = [
    { semana: '2026-09-28', impressoes: { valor: 0.0999, menosDe10: true }, topo: 0.0999, topoAbsoluto: { valor: 0.2, menosDe10: false }, perdidaOrcamento: { valor: 0.9001, maisDe90: true }, perdidaClassificacao: null },
    { semana: '2026-09-21', impressoes: { valor: 0.55, menosDe10: false }, topo: null, topoAbsoluto: null, perdidaOrcamento: { valor: 0, maisDe90: false }, perdidaClassificacao: { valor: 0.12, maisDe90: false } },
  ];
  const [q] = quadrosGoogleAds(l, ctx);
  const [t] = tabelasDa(q, 'parcela');
  assert.equal(t.linhas.length, 2, 'uma linha por semana da campanha');
  assert.equal(celulaDe(t, 0, 'Semana de').texto, '28/09', 'a semana mais nova primeiro');
  assert.equal(celulaDe(t, 0, 'Parcela de impressões').texto, 'menos de 10%');
  assert.equal(celulaDe(t, 0, 'No topo').texto, 'menos de 10%', 'a fração pura de 0,0999 também');
  assert.equal(celulaDe(t, 0, 'Em primeiro').texto, '20%');
  assert.equal(celulaDe(t, 0, 'Perdida por orçamento').texto, 'mais de 90%');
  assert.equal(celulaDe(t, 0, 'Perdida por orçamento').tom, 'warn');
  assert.deepEqual(celulaDe(t, 0, 'Perdida por classificação'), { texto: AUSENTE, vazio: true, titulo: NAO_MEDIDO });
  assert.equal(celulaDe(t, 1, 'Perdida por orçamento').texto, '0%', 'zero medido continua zero');
  assert.equal(celulaDe(t, 1, 'No topo').texto, AUSENTE);
  // Sem a consulta da parcela (nenhuma campanha com a lista): "não medida",
  // e não uma tabela de zeros. Lista vazia: medida, e nenhuma campanha.
  const sem = copia(l);
  for (const x of sem.dados.campanhas.lista) x.parcela = null;
  assert.equal(linhasDaParcela(sem.dados.campanhas.lista), null);
  const secaoSem = quadrosGoogleAds(sem, ctx)[0].secoes.find((s) => s.id === 'parcela');
  assert.equal(secaoSem.blocos[0].tipo, 'texto');
  assert.match(secaoSem.blocos[0].texto, /^Não medida nesta coleta/);
  for (const x of sem.dados.campanhas.lista) x.parcela = [];
  assert.deepEqual(linhasDaParcela(sem.dados.campanhas.lista), []);
  assert.match(quadrosGoogleAds(sem, ctx)[0].secoes.find((s) => s.id === 'parcela').blocos[0].texto, /Nenhuma campanha de Pesquisa/);
});

test('Google Ads: vídeo e Display de cada campanha, com o CPV em reais e o quartil que não veio sem número', () => {
  const l = ligacao(CHEIAS, 'site', 'google_ads');
  // As prévias não têm campanha de vídeo nem de Display: entram aqui.
  const [a, b] = l.dados.campanhas.lista;
  Object.assign(a, { alcance: 5400, video: { visualizacoes: 1200, taxaVisualizacao: 0.31, cpvMedio: 0.12, quartis: { p25: 0.8, p50: 0.5, p75: null, p100: 0.2 }, curtidas: null, comentarios: 3, compartilhamentos: 0 } });
  Object.assign(b, { display: { parcela: { valor: 0.0999, menosDe10: true }, perdidaOrcamento: { valor: 0.35, maisDe90: false }, perdidaClassificacao: null } });
  const [q] = quadrosGoogleAds(l, ctx);
  const [video, display] = tabelasDa(q, 'video_display');
  assert.equal(video.titulo, 'Vídeo (YouTube)');
  assert.equal(sem(celulaDe(video, 0, 'CPV médio').texto), 'R$ 0,12');
  assert.equal(celulaDe(video, 0, 'Visualizações').texto, '1.200');
  assert.equal(celulaDe(video, 0, 'Taxa de visualização').texto, '31%');
  assert.equal(celulaDe(video, 0, 'Viram 25%').texto, '80%');
  assert.equal(celulaDe(video, 0, 'Viram 75%').texto, AUSENTE, 'quartil null não vira 0%');
  assert.equal(celulaDe(video, 0, 'Curtidas').texto, AUSENTE);
  assert.equal(celulaDe(video, 0, 'Compartilhamentos').texto, '0');
  assert.equal(celulaDe(video, 0, 'Pessoas alcançadas').texto, '5.400');
  assert.equal(display.titulo, 'Rede de Display');
  assert.equal(celulaDe(display, 0, 'Parcela de impressões').texto, 'menos de 10%');
  assert.equal(celulaDe(display, 0, 'Perdida por orçamento').texto, '35%');
  assert.equal(celulaDe(display, 0, 'Perdida por classificação').texto, AUSENTE);
  // Com alcance em alguma campanha, a tabela das campanhas ganha a coluna
  // (e a campanha de Pesquisa fica com o ponto de ausente, não com 0).
  const [campanhas] = tabelasDa(q, 'campanhas');
  const i = campanhas.linhas.findIndex((x) => x.celulas[0].texto === a.nome);
  assert.equal(celulaDe(campanhas, i, 'Pessoas alcançadas').texto, '5.400');
  assert.ok(campanhas.linhas.some((x, j) => j !== i && celulaDe(campanhas, j, 'Pessoas alcançadas').texto === AUSENTE));
  // Sem vídeo nem Display, a seção nem aparece (as prévias).
  const [semVideo] = quadrosGoogleAds(ligacao(CHEIAS, 'site', 'google_ads'), ctx);
  assert.equal(semVideo.secoes.some((s) => s.id === 'video_display'), false);
  assert.deepEqual(linhasDeVideo(null), []);
  assert.deepEqual(linhasDeDisplay([{ nome: 'x', display: 'lixo' }]), []);
});

test('Google Ads: a configuração e o dia a dia de cada campanha, e os campos que só iam no title', () => {
  const l = ligacao(CHEIAS, 'site', 'google_ads');
  const c = l.dados.campanhas.lista[0];
  c.motivos = ['BUDGET_CONSTRAINED', 'CODIGO_NOVO_DO_GOOGLE'];
  c.orcamento = { ...(c.orcamento ?? {}), valor: 50, periodo: 'DAILY', entrega: 'STANDARD', recomendado: 72.5 };
  const [q] = quadrosGoogleAds(l, ctx);
  const [config] = tabelasDa(q, 'config');
  const i = config.linhas.findIndex((x) => x.celulas[0].texto === c.nome);
  // Código novo não some calado (a linha diz que há outro motivo) e não
  // aparece cru: a regra da revisão final (nunca o código da API na tela).
  assert.equal(celulaDe(config, i, 'Motivos da situação').texto, 'limitada pelo orçamento, outro motivo', 'código novo vira "outro motivo", nunca o código cru');
  assert.equal(sem(celulaDe(config, i, 'Orçamento recomendado').texto), 'R$ 72,50');
  assert.equal(celulaDe(config, i, 'Entrega do orçamento').texto, 'padrão');
  // O dia a dia das campanhas vai na seção "Por dia", numa tabela própria.
  const dias = tabelasDa(q, 'dias');
  assert.deepEqual(dias.map((t) => t.titulo), ['A conta', 'Por campanha']);
  assert.equal(dias[1].linhas.length, diasDasCampanhas(l.dados.campanhas.lista).length);
  // A qualidade da palavra-chave: os três componentes em coluna (o title
  // não aparece no celular).
  const [palavras] = tabelasDa(q, 'palavras');
  assert.ok(['Relevância do anúncio', 'Experiência na página', 'CTR esperado'].every((r) => palavras.colunas.some((x) => x.rotulo === r)));
  // A régua da semana (leads e conversas) e a tag da conta.
  const [semanas] = tabelasDa(q, 'semanas');
  assert.ok(semanas.colunas.some((x) => x.rotulo === 'Leads da semana'));
  const conta = q.secoes.find((s) => s.id === 'conta').blocos[0].itens;
  assert.match(conta.find((p) => p.rotulo === 'Tag de conversão').texto, /^AW-\d+$/);
});

test('o dado pessoal ("restrito") das tabelas novas continua só para a gestão', () => {
  const gestao = quadrosGoogleAds(ligacao(CHEIAS, 'site', 'google_ads'), ctx)[0];
  const r = copia(CHEIAS);
  for (const f of Object.values(r.fontes)) f.dados = tirarRestrito(f.dados);
  const marketing = quadrosGoogleAds(ligacao(r, 'site', 'google_ads'), ctx)[0];
  const titulos = (q) => q.secoes.flatMap((s) => s.blocos).filter((b) => b.tipo === 'tabela').map((b) => b.titulo);
  for (const t of ['Cada ligação', 'Cada lead', 'Cada alteração']) {
    assert.ok(titulos(gestao).includes(t), `a gestão vê "${t}"`);
    assert.equal(titulos(marketing).includes(t), false, `quem não é gestão não vê "${t}"`);
  }
});

// ------------------------------------------------------------ a Meta --

test('o caso ruim: ação da Meta sem valor fica sem valor (nunca R$ 0), e o custo de zero ações não existe', () => {
  assert.deepEqual(acoesDaLinha({ acoes: { lead: 3 }, valores_acoes: {}, custo_por_acao: { lead: 15.066667 } }), [{ chave: 'lead', quantidade: 3, valor: null, custo: 15.066667 }]);
  assert.deepEqual(acoesDaLinha({}), []);
  assert.deepEqual(acoesDaLinha(null), []);
  // Valor e custo que vieram sem a quantidade: a quantidade fica null.
  assert.deepEqual(acoesDaLinha({ acoes: {}, valores_acoes: { purchase: '120.5' }, custo_por_acao: {} }), [{ chave: 'purchase', quantidade: null, valor: 120.5, custo: null }]);
  const periodo = acoesDoPeriodo([
    { semana: '2026-09-21', gasto: 100, acoes: { lead: 2, link_click: 0 }, valores_acoes: { lead: 50 } },
    { semana: '2026-09-28', gasto: 50, acoes: { lead: 1 } },
  ]);
  const lead = periodo.find((a) => a.chave === 'lead');
  assert.deepEqual(lead, { chave: 'lead', quantidade: 3, valor: 50, custo: 50 });
  const clique = periodo.find((a) => a.chave === 'link_click');
  assert.equal(clique.quantidade, 0, 'zero medido continua zero');
  assert.equal(clique.custo, null, 'gasto dividido por zero ações não é custo');
  assert.equal(clique.valor, null);
  // Sem gasto medido, sem custo.
  assert.equal(acoesDoPeriodo([{ gasto: null, acoes: { lead: 4 } }])[0].custo, null);
  // Os resultados e o custo por resultado (listas da Meta), em reais.
  assert.equal(sem(textoCustoPorResultado([{ indicador: 'actions:onsite_conversion.lead_grouped', valor: 15.07 }], 'BRL')), 'leads de formulário: R$ 15,07');
  assert.equal(textoResultados([{ indicador: 'actions:lead', valor: null }]), `leads: ${NAO_MEDIDO}`);
  assert.equal(textoResultados(null), null);
  assert.equal(textoCustoPorResultado(null), null);
});

test('Meta: o valor e o custo de cada ação aparecem no período, por campanha e por semana, em reais', () => {
  const l = ligacao(CHEIAS, 'facebook', 'meta', 'anuncios');
  const conta = l.dados.contas[0];
  conta.campanhas[0].valores_acoes = { lead: 300.5 };
  conta.por_semana[0].valores_acoes = { lead: 99.9 };
  const [q] = quadrosAnunciosMeta(l, ctx);
  const [periodo, porCampanha, porSemana] = tabelasDa(q, 'acoes');
  assert.deepEqual([periodo.titulo, porCampanha.titulo, porSemana.titulo], ['No período', 'Por campanha (números da Meta)', 'Por semana (números da Meta)']);
  // No período: o custo por ação é dinheiro, com R$.
  const iLead = periodo.linhas.findIndex((x) => x.celulas[0].texto === 'leads');
  assert.match(sem(celulaDe(periodo, iLead, 'Custo por ação').texto), /^R\$ \d/);
  assert.equal(sem(celulaDe(periodo, iLead, 'Valor').texto), 'R$ 99,90');
  // Por campanha: os números da Meta, e a ação sem valor com o ponto de ausente.
  const iCamp = porCampanha.linhas.findIndex((x) => x.celulas[0].texto === conta.campanhas[0].nome && x.celulas[1].texto === 'leads');
  assert.equal(sem(celulaDe(porCampanha, iCamp, 'Valor').texto), 'R$ 300,50');
  assert.equal(sem(celulaDe(porCampanha, iCamp, 'Custo por ação').texto), 'R$ 15,07');
  const iClique = porCampanha.linhas.findIndex((x) => x.celulas[1].texto === 'cliques no link');
  assert.deepEqual(celulaDe(porCampanha, iClique, 'Valor'), { texto: AUSENTE, vazio: true, titulo: NAO_MEDIDO });
  // Campanha sem entrega (os mapas vazios) não inventa linha de ação.
  assert.equal(porCampanha.linhas.some((x) => x.celulas[0].texto === 'Campanha parada'), false);
  // As outras colunas da LINHA que não apareciam.
  const [campanhas] = tabelasDa(q, 'campanhas');
  for (const r of ['Início', 'Fim', 'Frequência', 'CPM', 'Cliques no link', 'Cliques de saída', 'Primeiras respostas', 'Custo por resultado']) assert.ok(campanhas.colunas.some((c) => c.rotulo === r), r);
  assert.ok(q.topo[0].itens.some((n) => n.rotulo === 'Cliques de saída'));
});

test('Meta: os detalhes dos posts (por tipo e de vídeo) saem do title e viram tabela; o tempo total vem em minutos', () => {
  const [q] = quadrosPaginaFacebook(ligacao(CHEIAS, 'facebook', 'meta', 'pagina'), ctx);
  const [tipos] = tabelasDa(q, 'posts_tipos');
  assert.equal(celulaDe(tipos, 0, 'Reações por tipo').texto, 'curtir 26, amei 4');
  assert.equal(celulaDe(tipos, 0, 'Cliques por tipo').texto, 'cliques no link 20, outros cliques 15');
  const [video] = tabelasDa(q, 'posts_video');
  assert.equal(celulaDe(video, 0, 'Tempo total').texto, '40 min 40 s', '2.440.000 ms, e não "2.440 s"');
  assert.equal(formatar('durms', 440), '440 ms', 'menos de um minuto não arredonda para "0 s"');
  assert.equal(formatar('durms', null), NAO_MEDIDO);
});

// ------------------------------------------------------------- o site --

test('o caso ruim: o resumo das páginas sem a parte medida é "não medido", não 0', () => {
  assert.deepEqual(resumoDasPaginas([]), { abertas: null, naoAbriram: null, semDescricao: null, semCanonico: null, h1ForaDoPadrao: null, foraDoGoogle: null, semImagem: null });
  const semSeo = resumoDasPaginas([{ url: 'https://exemplo.com.br/' }, { url: 'https://exemplo.com.br/x', erro: 'http_503' }]);
  assert.equal(semSeo.abertas, 1);
  assert.equal(semSeo.naoAbriram, 1);
  assert.equal(semSeo.semDescricao, null, 'nenhuma página trouxe o SEO: não medido');
  const comSeo = resumoDasPaginas([{ url: 'a', seo: { descricao: 'tem', canonical: null, h1: 1, noindex: false } }, { url: 'b', seo: { descricao: null, canonical: 'b', h1: 0, noindex: true }, og: { imagem: null } }]);
  assert.deepEqual(comSeo, { abertas: 2, naoAbriram: 0, semDescricao: 1, semCanonico: 1, h1ForaDoPadrao: 1, foraDoGoogle: 1, semImagem: 1 });
  assert.equal(chavesDoConsentimento([]), null);
  assert.equal(chavesDoConsentimento([{ url: 'a', consentimento: { consent_chaves: [] } }]), 'nenhuma');
});

test('Site: o SEO, o compartilhamento e os dados estruturados de TODAS as páginas lidas, e não só da inicial', () => {
  const l = ligacao(CHEIAS, 'site', 'site');
  const lista = l.dados.paginas.lista;
  const valores = lista.findIndex((p) => /page_id=144/.test(p.url));
  lista[valores].seo.descricao = 'Descrição da página de valores';
  lista[valores].og = { ...lista[valores].og, url: 'javascript:alert(1)', imagem: 'https://cdn.outro.com/og.jpg' };
  lista[valores].seo.canonical = 'https://outro-site.com/valores';
  // Uma página que não abriu (firewall da hospedagem).
  lista.push({ url: 'https://exemplo.com.br/?page_id=999', status: 503, erro: 'http_503', trecho: 'Service Unavailable' });
  const q = quadrosSite(l, ctx).find((x) => x.id === 'site-paginas');
  assert.ok(q, 'o quadro das páginas existe');
  const [seo] = tabelasDa(q, 'seo');
  const abertas = lista.filter((p) => !p.erro).length;
  assert.equal(seo.linhas.length, abertas, 'uma linha por página que abriu');
  const i = seo.linhas.findIndex((x) => x.celulas[0].texto === '/?page_id=144');
  assert.ok(i > 0, 'a página de valores, que não é a inicial');
  assert.equal(celulaDe(seo, i, 'Descrição').texto, 'Descrição da página de valores');
  assert.equal(celulaDe(seo, i, 'Canônico').texto, 'outro-site.com/valores', 'o canônico que aponta para fora mostra o site dele');
  const j = seo.linhas.findIndex((x) => x.celulas[0].texto === '/?page_id=151');
  assert.equal(celulaDe(seo, j, 'Descrição').texto, 'sem descrição');
  assert.equal(celulaDe(seo, j, 'Descrição').tom, 'warn');
  assert.equal(celulaDe(seo, j, 'Títulos H1').tom, 'warn', 'dois H1');
  // O link perigoso do Open Graph não vira link; a imagem de outro site
  // mostra o nome dele.
  const [og] = tabelasDa(q, 'compartilhamento');
  assert.equal(celulaDe(og, i, 'Endereço compartilhado').link, undefined);
  assert.equal(celulaDe(og, i, 'Imagem').texto, 'cdn.outro.com/og.jpg');
  // A página que não abriu fica só na resposta, com o erro, e a nota diz.
  assert.equal(seo.linhas.some((x) => x.celulas[0].texto === '/?page_id=999'), false);
  assert.match(seo.nota, /Uma página não abriu/);
  const [resposta] = tabelasDa(q, 'resposta');
  const k = resposta.linhas.findIndex((x) => x.celulas[0].texto === '/?page_id=999');
  assert.equal(celulaDe(resposta, k, 'Erro').texto, 'respondeu 503: Service Unavailable');
  // Os outros assuntos por página.
  for (const s of ['estruturados', 'contatos', 'plataforma']) assert.equal(tabelasDa(q, s)[0].linhas.length, abertas, s);
  assert.equal(q.topo[0].itens.find((n) => n.id === 'falharam').texto, '1');
  // E os scripts, os eventos e o consentimento de cada página.
  const etiquetas = quadrosSite(l, ctx).find((x) => x.id === 'site-etiquetas');
  const [scripts] = tabelasDa(etiquetas, 'scripts');
  assert.equal(scripts.linhas.length, abertas);
  assert.ok(scripts.colunas.some((c) => c.rotulo === 'Chaves do consentimento'));
  assert.equal(enderecoRelativo('https://www.exemplo.com.br/a?b=1', 'https://exemplo.com.br/'), '/a?b=1', 'com e sem www é o mesmo site');
  assert.equal(enderecoRelativo('lixo', 'https://exemplo.com.br/'), 'lixo');
});

test('PageSpeed: a conferência dos agentes de IA usa a régua do conector (nota 0,9 passa), e "não se aplica" não é falha', () => {
  assert.equal(situacaoDaConferencia(0.98, 'numeric'), 'passou', 'a tela dizia "não passou" com 0,98');
  assert.equal(situacaoDaConferencia(1, 'binary'), 'passou');
  assert.equal(situacaoDaConferencia(0, 'binary'), 'não passou');
  assert.equal(situacaoDaConferencia(null, 'notApplicable'), 'não se aplica');
  assert.equal(situacaoDaConferencia(null, 'informative'), 'só informa');
  assert.equal(situacaoDaConferencia(null, 'binary'), null, 'sem nota: sem situação');
  const q = quadrosSite(ligacao(CHEIAS, 'site', 'site'), ctx).find((x) => x.id === 'site-pagespeed');
  const agentes = q.secoes.find((s) => s.id === 'agentes');
  assert.equal(agentes.blocos[0].tipo, 'pares', 'o resumo de cada aparelho antes da tabela');
  assert.match(agentes.blocos[0].itens[0].texto, /^nota \d+, passou em \d+ de \d+ conferências$/);
});

// --------------------------------------------------- Google e redes sociais --

test('o caso ruim: o valor de um atributo do Perfil que vem como objeto não vira "[object Object]"', () => {
  assert.equal(valoresDoAtributo([{ uri: 'https://wa.me/5531900000000' }]), 'https://wa.me/5531900000000');
  assert.equal(valoresDoAtributo([true]), 'sim');
  assert.equal(valoresDoAtributo([false, 'texto']), 'não, texto');
  assert.equal(valoresDoAtributo({ setValues: ['entrega'], unsetValues: ['retirada'] }), 'sim: entrega; não: retirada');
  assert.equal(valoresDoAtributo(null), null);
  assert.equal(valoresDoAtributo([{}]), null);
  const [, , , , dados] = quadrosPerfilEmpresa(ligacao(CHEIAS, 'google', 'google', 'perfil'), ctx);
  const [atributos] = tabelasDa(dados, 'atributos');
  const w = atributos.linhas.findIndex((x) => x.celulas[0].texto === 'link do WhatsApp');
  assert.equal(celulaDe(atributos, w, 'Valor').texto, 'https://wa.me/5531900000000');
  assert.equal(celulaDe(atributos, w, 'Valor').link, 'https://wa.me/5531900000000');
  assert.equal(dataDoGoogle({ year: 2026, month: 10, day: 3 }), '2026-10-03');
  assert.equal(dataDoGoogle({ year: 2026 }), null);
  assert.equal(dataDoGoogle({}), null);
});

test('GA4, Search Console e Perfil: os campos do FORMATO que não apareciam', () => {
  const [ga4] = quadrosGa4(ligacao(CHEIAS, 'site', 'google', 'ga4'), ctx);
  assert.ok(tabelasDa(ga4, 'semanas')[0].colunas.some((c) => c.rotulo === 'Usuários totais'));
  assert.ok(tabelasDa(ga4, 'dias')[0].colunas.some((c) => c.rotulo === 'Teve registro'));
  const [saidas] = tabelasDa(ga4, 'cliques_saida');
  assert.equal(celulaDe(saidas, 0, 'Link').link, 'https://wa.me/5531900000000');
  const [sc] = quadrosSearchConsole(ligacao(CHEIAS, 'site', 'google', 'search_console'), ctx);
  const [insp] = tabelasDa(sc, 'inspecoes');
  for (const r of ['Indexação', 'robots.txt', 'Ao buscar a página', 'Canônica do site']) assert.ok(insp.colunas.some((c) => c.rotulo === r), r);
  assert.equal(celulaDe(insp, 0, 'Indexação').texto, 'liberada');
  assert.equal(celulaDe(tabelasDa(sc, 'sitemaps')[0], 0, 'Tipo').texto, 'índice de sitemaps');
  assert.match(tabelasDa(sc, 'paginas')[0].nota, /Contado por página/, 'a agregação por página explica a soma');
  const [, , , posts] = quadrosPerfilEmpresa(ligacao(CHEIAS, 'google', 'google', 'perfil'), ctx);
  const [tp] = tabelasDa(posts, 'posts');
  const kTipo = tp.colunas.findIndex((c) => c.rotulo === 'Tipo');
  const oferta = tp.linhas.findIndex((x) => x.celulas[kTipo].texto === 'oferta');
  assert.equal(celulaDe(tp, oferta, 'Oferta').texto, 'cupom TESTE10');
});

test('LinkedIn e Pinterest: os campos do FORMATO que não apareciam, e as métricas extras com nome de gente', () => {
  assert.equal(textoExtras({ ampliacoes: 30, video_tempo_medio: 3200, METRICA_NOVA: 5, visitas_perfil: null }), 'ampliações 30, tempo médio de vídeo 3,2 s, outra métrica 5', 'a nova vira "outra métrica" (nunca o nome da API); a nula sai');
  assert.equal(textoExtras(null), null);
  assert.equal(textoExtras({ visitas_perfil: 2 }, { sem: ['visitas_perfil'] }), null);
  const li = quadrosLinkedin(ligacao(CHEIAS, 'linkedin', 'linkedin'), ctx);
  const [posts] = tabelasDa(li.find((q) => q.id === 'li-posts'), 'posts');
  assert.ok(['Comentários principais', 'Comentários, com respostas', 'Reações por tipo'].every((r) => posts.colunas.some((c) => c.rotulo === r)));
  assert.match(celulaDe(posts, 0, 'Reações por tipo').texto, /^gostei \d+/);
  const pin = quadrosPinterest(ligacao(CHEIAS, 'pinterest', 'pinterest'), ctx);
  const [pins] = tabelasDa(pin.find((q) => q.id === 'pin-pins'), 'pins');
  assert.equal(celulaDe(pins, 0, 'Pasta').texto, 'Fachadas', 'o id da pasta vira o nome dela');
  const semanas = tabelasDa(pin.find((q) => q.id === 'pin-conta'), 'semanas');
  assert.deepEqual(semanas.map((t) => t.titulo), ['Orgânico e pago', 'Só orgânico', 'Só pago']);
  const analise = pin.find((q) => q.id === 'pin-analise');
  assert.ok(tabelasDa(analise, 'pin_semanas')[0].linhas.length > 0, 'a curva de cada Pin, semana a semana');
});

// -------------------------------------------------------- as duas prévias --

test('as duas prévias montam todos os quadros sem texto quebrado, e o lixo no lugar do formato não derruba a aba', () => {
  const QUEBRADO = /\[object Object\]|undefined|NaN|Infinity/;
  for (const r of [VARIEDADE, CHEIAS]) {
    for (const canal of Object.keys(FONTES_DO_CANAL)) {
      for (const q of quadrosDoCanal(canal, r.fontes, ctx)) {
        for (const t of textos(q)) assert.equal(QUEBRADO.test(t), false, `${canal} ${q.id}: ${t}`);
      }
    }
  }
  // O formato com o tipo trocado (texto no lugar de lista, número no lugar
  // de objeto): a aba mostra o que der, sem quebrar.
  const r = copia(CHEIAS);
  r.fontes.site.dados.paginas.lista = [{ url: 'https://exemplo.com.br/', seo: 'lixo', og: 5, contatos: { whatsapp: 'não é lista' }, dados_estruturados: { tipos: 'x', geo: 'y' } }];
  r.fontes.google_ads.dados.campanhas.lista[0].parcela = 'lixo';
  r.fontes.google_ads.dados.campanhas.lista[0].video = [];
  r.fontes.meta.dados.anuncios.contas[0].por_semana[0].valores_acoes = 'lixo';
  r.fontes.pinterest.dados.analise_pins.itens[0].semanas = 'lixo';
  for (const canal of Object.keys(FONTES_DO_CANAL)) {
    for (const q of quadrosDoCanal(canal, r.fontes, ctx)) for (const t of textos(q)) assert.equal(QUEBRADO.test(t), false, `${canal} ${q.id}: ${t}`);
  }
  assert.equal(textoDoMapa({ a: null, b: 'x' }), null);
  assert.equal(juntar(['', null, 'a']), 'a');
});

/* --------------------------------------- a Meta da Impresilk (12/10/2026) */

test('o caso ruim: anúncios sem entrega no período mostram zero e dizem que nada rodou, e não "não medido"', () => {
  // A conta real da Impresilk: 16 campanhas pausadas, nada rodou em 8 semanas.
  // A Meta não devolve semana sem entrega; a lista vem vazia.
  const l = ligacao(CHEIAS, 'facebook', 'meta', 'anuncios');
  Object.assign(l.dados.contas[0], { por_semana: [], por_dia: [], por_plataforma: [], campanhas_por_dia: [], situacao: 'pagamento pendente', situacao_codigo: 3 });
  const [q] = quadrosAnunciosMeta(l, ctx);
  const nums = q.topo.find((b) => b.tipo === 'numeros');
  assert.match(nums.titulo, /: nenhum anúncio rodou$/);
  const v = (id) => sem(nums.itens.find((n) => n.id === id).texto);
  assert.deepEqual([v('gasto'), v('impressoes'), v('cliques'), v('leads')], ['R$ 0,00', '0', '0', '0']);
  assert.equal(sem(q.destaque), 'R$ 0,00 no período');
  const avisos = q.topo.find((b) => b?.tipo === 'avisos');
  assert.ok(avisos && avisos.itens[0].texto.includes('"pagamento pendente"'), JSON.stringify(q.topo.map((b) => b?.tipo)));
  assert.ok(textos(q).includes('Nenhum anúncio rodou no período.'));
  // Sem a leitura das semanas (null), continua "não medido": aí é falta de leitura, e não zero.
  const l2 = ligacao(CHEIAS, 'facebook', 'meta', 'anuncios');
  Object.assign(l2.dados.contas[0], { por_semana: null, situacao_codigo: 1 });
  const [q2] = quadrosAnunciosMeta(l2, ctx);
  const nums2 = q2.topo.find((b) => b.tipo === 'numeros');
  assert.equal(nums2.itens.find((n) => n.id === 'gasto').texto, NAO_MEDIDO);
  assert.equal(q2.topo.some((b) => b?.tipo === 'avisos'), false, 'conta ativa: sem aviso');
});

test('Pixel: a situação vem do último disparo; o conjunto de dados que nunca disparou não aparece "recebendo"', () => {
  const hoje = '2026-10-12';
  assert.equal(situacaoDoPixel({ indisponivel: false, ultimo_disparo: '2026-10-11T22:10:00+0000' }, hoje), 'recebendo');
  assert.equal(situacaoDoPixel({ indisponivel: false, ultimo_disparo: '2026-09-20T10:00:00+0000' }, hoje), 'parado há 22 dias');
  assert.equal(situacaoDoPixel({ indisponivel: false, ultimo_disparo: null }, hoje), 'nunca disparou');
  assert.equal(situacaoDoPixel({ indisponivel: true, ultimo_disparo: '2026-10-11T22:10:00+0000' }, hoje), 'indisponível');
  assert.equal(situacaoDoPixel({}, hoje), null);
  const l = ligacao(CHEIAS, 'facebook', 'meta', 'pixel');
  l.dados.pixels[0] = { ...l.dados.pixels[0], indisponivel: false, ultimo_disparo: null };
  const [q] = quadrosPixelMeta(l, { hoje });
  const nums = q.topo.find((b) => b.tipo === 'numeros');
  assert.equal(nums.itens.find((n) => n.id === 'situacao').texto, 'nunca disparou');
});

test('Página com menos de 100 seguidores: país e cidade explicam o limite da Meta, e não "não mandou"', () => {
  const l = ligacao(CHEIAS, 'facebook', 'meta', 'pagina');
  Object.assign(l.dados, { seguidores: 41, seguidores_por_pais: null, seguidores_por_cidade: null });
  const [q] = quadrosPaginaFacebook(l, ctx);
  const s = (id) => q.secoes.find((x) => x.id === id);
  assert.equal(s('paises').resumo, 'menos de 100 seguidores');
  assert.equal(s('cidades').resumo, 'menos de 100 seguidores');
  assert.ok(s('paises').blocos[0].texto.includes('a partir de 100 (a Página tem 41)'), s('paises').blocos[0].texto);
  // Com 100 ou mais e sem o dado, é falta da coleta: continua "não medido".
  const l2 = ligacao(CHEIAS, 'facebook', 'meta', 'pagina');
  Object.assign(l2.dados, { seguidores: 5000, seguidores_por_pais: null });
  const [q2] = quadrosPaginaFacebook(l2, ctx);
  assert.equal(q2.secoes.find((x) => x.id === 'paises').resumo, 'não medido');
});
