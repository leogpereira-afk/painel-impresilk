import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { buildSync } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  filtrarOportunidades, resumoCobertura, prazoOportunidade,
  relatorioAntigo, urlOficialSegura, urlBotSegura, exportarCSV, paginar,
} from '../src/lib/licitacoes-pesquisa.mjs';

const arquivoComponente = new URL('../src/components/PesquisaLicitacoes.jsx', import.meta.url);
const compilado = buildSync({ stdin: { contents: readFileSync(arquivoComponente, 'utf8'), resolveDir: dirname(fileURLToPath(arquivoComponente)), loader: 'jsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom', 'lucide-react'], loader: { '.css': 'empty' } }).outputFiles[0].text;
const modulo = { exports: {} };
new Function('require', 'module', 'exports', compilado)(createRequire(import.meta.url), modulo, modulo.exports);
const PesquisaLicitacoes = modulo.exports.default;
const renderizar = props => renderToStaticMarkup(React.createElement(PesquisaLicitacoes, props));
function relatorio(overrides = {}) {
  return { estado: 'disponivel', origem: 'relatorio_publico_licitacoes', somenteLeitura: true, id: 'publico-exemplo', hash: 'hash-exemplo', versao: 'exemplo', periodo: { inicio: '2026-10-01', fim: '2026-10-07' }, geradoEm: '2026-10-07T10:00:00Z', consultadoEm: '2026-10-07T11:00:00Z', antigo: false,
    cobertura: { totalMunicipios: 89, concluidos: 0, parciais: 0, naoConsultados: 89, coberturaPercentual: 0 },
    coberturaInstituicoes: { totalRegistros: 0, concluidos: 0, parciais: 0, naoConsultados: 0 }, municipios: [], instituicoes: [], oportunidades: [], avisos: [], pendencias: [], candidatosRetidos: [], limites: [], ...overrides };
}

const oportunidades = [
  { id: 'exemplo-1', processo: 'Processo demonstrativo A', orgao: 'Instituto Exemplo', produto: 'Sinalização', item: 'Placas', lote: 'A', classificacao: 'GO', municipiosAbrangidos: ['Olhos-d’Água'], prazo: '2026-10-20T12:00:00-03:00' },
  { id: 'exemplo-2', processo: 'Processo demonstrativo B', orgao: 'Fundação Exemplo', produto: 'Adesivos', item: 'Envelopamento', lote: 'B', classificacao: 'REVISÃO HUMANA', municipiosAbrangidos: ['Águas Vermelhas'], prazo: '2026-10-22T12:00:00-03:00' },
  { id: 'exemplo-3', processo: 'Processo demonstrativo C', orgao: 'Instituto Exemplo', produto: 'Placas', item: 'Sinalização', lote: 'C', classificacao: 'NO-GO', municipiosAbrangidos: ['Olhos-d’Água'], prazo: '2026-10-15T12:00:00-03:00' },
];

test('busca encontra acentos e apóstrofos Unicode sem exigir grafia do portal', () => {
  assert.deepEqual(filtrarOportunidades(oportunidades, { busca: 'olhos dagua sinalizacao' }, '2026-10-12T12:00:00-03:00').map(x => x.id), ['exemplo-3', 'exemplo-1']);
});

test('filtros de classificação, destino, órgão e produto são combinados', () => {
  assert.deepEqual(filtrarOportunidades(oportunidades, { classificacao: 'GO', municipio: 'Olhos-d’Água', orgao: 'Instituto Exemplo', produto: 'Sinalização' }).map(x => x.id), ['exemplo-1']);
  assert.deepEqual(filtrarOportunidades(oportunidades, { classificacao: 'GO', municipio: 'Águas Vermelhas' }), []);
});

test('filtrar e ordenar não modifica a classificação ou ordem do acervo recebido', () => {
  const entrada = structuredClone(oportunidades);
  filtrarOportunidades(entrada, {});
  assert.deepEqual(entrada, oportunidades);
});

test('prazos abertos aparecem antes dos encerrados sem ocultar NO-GO ou alterar o histórico', () => {
  const entrada = structuredClone(oportunidades);
  const resultado = filtrarOportunidades(entrada, {}, '2026-10-18T12:00:00-03:00');
  assert.deepEqual(resultado.map(item => item.id), ['exemplo-1', 'exemplo-2', 'exemplo-3']);
  assert.equal(resultado[2].classificacao, 'NO-GO');
  assert.deepEqual(entrada, oportunidades);
});

test('percentual municipal usa 89 mesmo quando dado recebido declara 83', () => {
  const resumo = resumoCobertura({ totalMunicipios: 83, concluidos: 83, parciais: 6, naoConsultados: 0, coberturaPercentual: 100 });
  assert.equal(resumo.totalMunicipios, 89);
  assert.equal(resumo.coberturaPercentual, 93.26);
  assert.equal(resumo.inconsistente, true);
});

test('zero consultas mantém 89 municípios não consultados', () => {
  assert.deepEqual(resumoCobertura({ totalMunicipios: 89, concluidos: 0, parciais: 0, naoConsultados: 89, coberturaPercentual: 0 }), { totalMunicipios: 89, concluidos: 0, parciais: 0, naoConsultados: 89, coberturaPercentual: 0, inconsistente: false });
});

test('prazo encerrado usa instante com fuso e preserva a classificação histórica', () => {
  const oportunidade = { ...oportunidades[0], prazo: '2026-10-12T11:00:00-03:00' };
  assert.equal(prazoOportunidade(oportunidade.prazo, '2026-10-12T14:00:01Z').encerrado, true);
  assert.equal(prazoOportunidade(oportunidade.prazo, '2026-10-12T13:59:59Z').encerrado, false);
  assert.equal(oportunidade.classificacao, 'GO');
});

test('data sem fuso ou inválida não vira prazo confirmado', () => {
  assert.equal(prazoOportunidade('2026-10-12').valido, false);
  assert.equal(prazoOportunidade('incerto').valido, false);
  assert.equal(prazoOportunidade('2026-10-12T11:00:00').valido, false);
});

test('relatório se torna antigo no limite de oito dias completos', () => {
  assert.equal(relatorioAntigo('2026-10-04T14:00:00Z', '2026-10-12T13:59:59Z'), false);
  assert.equal(relatorioAntigo('2026-10-04T14:00:00Z', '2026-10-12T14:00:00Z'), true);
});

test('links bloqueiam protocolos ativos, credenciais e endereços locais', () => {
  for (const url of ['javascript:alert(1)', 'http://portal.example/edital', 'https://usuario:senha@portal.example', 'https://localhost/edital', 'https://127.0.0.1/edital', 'https://[::1]/edital', 'https://0x7f000001/edital', 'https://portal.example/edital\n']) assert.equal(urlOficialSegura(url), null, url);
  assert.equal(urlOficialSegura('https://portal.example/edital?id=exemplo'), 'https://portal.example/edital?id=exemplo');
});

test('CSV impede fórmulas inclusive após espaços e protege aspas e quebras de linha', () => {
  const csv = exportarCSV(['Nome', 'Observação'], [[' =1+1', 'Texto "citado"\nsegunda linha'], ['@HYPERLINK("x")', '-1+2'], ['+SUM(A1)', '\t=CMD()']]);
  assert.equal(csv, '\uFEFF"Nome";"Observação"\r\n"\' =1+1";"Texto ""citado"" segunda linha"\r\n"\'@HYPERLINK(""x"")";"\'-1+2"\r\n"\'+SUM(A1)";"\'\t=CMD()"');
});

test('matriz mantém a última página acessível e corrige página fora do intervalo', () => {
  const linhas = Array.from({ length: 89 }, (_, i) => ({ municipio: `Município demonstrativo ${i + 1}` }));
  const ultima = paginar(linhas, 99, 12);
  assert.equal(ultima.pagina, 8);
  assert.equal(ultima.totalPaginas, 8);
  assert.equal(ultima.itens.length, 5);
  assert.equal(ultima.itens[4].municipio, 'Município demonstrativo 89');
});

test('carregamento e erro são anunciados e não inventam pesquisa concluída', () => {
  const carregando = renderizar({ dados: null, carregando: true, aoAtualizar() {} });
  assert.match(carregando, /role="status"/);
  assert.match(carregando, /aria-busy="true"/);
  const erro = renderizar({ dados: null, erro: 'Falha demonstrativa', aoAtualizar() {} });
  assert.match(erro, /role="alert"/);
  assert.match(erro, /Falha demonstrativa/);
  assert.doesNotMatch(erro, /100%/);
});

test('sem relatório distingue falta de acervo de ausência comprovada de oportunidades', () => {
  const html = renderizar({ dados: { estado: 'sem_relatorio' }, aoAtualizar() {} });
  assert.match(html, /Nenhum relatório publicado/);
  assert.doesNotMatch(html, /sem licitações|Pesquisa concluída/i);
});

test('acervo com zero consultas apresenta 0 de 89 e pesquisa não executada', () => {
  const html = renderizar({ dados: relatorio(), aoAtualizar() {} });
  assert.match(html, /0 de 89/);
  assert.match(html, /Pesquisa ainda não executada/);
  assert.match(html, /não comprova inexistência/i);
});

test('erro de atualização mantém acervo anterior visível com ressalva', () => {
  const html = renderizar({ dados: relatorio({ oportunidades }), erro: 'Atualização indisponível', aoAtualizar() {} });
  assert.match(html, /Atualização indisponível/);
  assert.match(html, /Instituto Exemplo/);
  assert.match(html, /acervo anterior/i);
});

test('GO histórico com prazo vencido recebe aviso e não cria ação de participação', () => {
  const html = renderizar({ dados: relatorio({ oportunidades: [{ ...oportunidades[0], prazo: '2000-01-01T12:00:00-03:00', oficialUrl: 'https://portal.example/edital', exigencias: ['Amostra demonstrativa'], proximaAcao: 'Conferir retificações' }] }), aoAtualizar() {} });
  assert.match(html, /GO/);
  assert.match(html, /Prazo encerrado/);
  assert.match(html, /classificação registrada/i);
  assert.match(html, /Amostra demonstrativa/);
  assert.doesNotMatch(html, /Participar|Criar licitação|Enviar proposta/);
});

test('texto do portal é escapado e link inseguro não vira destino clicável', () => {
  const html = renderizar({ dados: relatorio({ oportunidades: [{ ...oportunidades[0], orgao: '<script>alert(1)</script>', oficialUrl: 'javascript:alert(1)', exigencias: [] }] }), aoAtualizar() {} });
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /href="javascript:|<script>/);
  assert.match(html, /Link oficial indisponível/);
});

test('cartão separa sessão, proposta e credenciamento e mostra os documentos no acordeão', () => {
  const edital = 'https://portal.example/edital-ficticio';
  const item = {
    ...oportunidades[0], oficialUrl: edital,
    datasEdital: {
      sessaoPublica: { dataHora: '2026-11-30T13:00:00Z', fonteUrl: edital, referencia: 'p. 2' },
      envioProposta: { dataHora: '2026-11-30T12:30:00Z', fonteUrl: edital },
      credenciamento: { dataHora: '2026-11-28', fonteUrl: edital },
    },
    documentosEdital: [{ id: 'credencial-exemplo', categoria: 'credenciamento', nome: 'Credencial do representante', escopo: 'item', itens: ['Lote fictício 1'], referencia: 'Item 5', fonteUrl: edital }],
  };
  const html = renderizar({ dados: relatorio({ oportunidades: [item] }) });
  assert.match(html, /Sessão pública[\s\S]*?30\/11\/2026, 10:00/);
  assert.match(html, /Prazo para proposta[\s\S]*?30\/11\/2026, 09:30/);
  assert.match(html, /Prazo de credenciamento[\s\S]*?28\/11\/2026[\s\S]*?Horário a confirmar/);
  assert.doesNotMatch(html, /Prazo registrado/);
  assert.match(html, /<details class="lp-documentos-edital"><summary>[\s\S]*?Documentos para participar[\s\S]*?Credencial do representante[\s\S]*?Lote fictício 1[\s\S]*?Item 5/);
});

test('cartão preserva prazo legado sem atribuí-lo a uma data oficial específica', () => {
  const html = renderizar({ dados: relatorio({ oportunidades: [oportunidades[0]] }) });
  assert.match(html, /Sessão pública[\s\S]*?A confirmar na fonte oficial/);
  assert.match(html, /Prazo para proposta[\s\S]*?A confirmar na fonte oficial/);
  assert.match(html, /Prazo registrado[\s\S]*?20\/10\/2026, 12:00/);
  assert.match(html, /Documentos a confirmar no edital e nos anexos oficiais/);
});

test('relatório antigo exige reconferência e mantém sua data de origem', () => {
  const html = renderizar({ dados: relatorio({ antigo: true, geradoEm: '2000-01-01T10:00:00Z' }), aoAtualizar() {} });
  assert.match(html, /Relatório antigo/);
  assert.match(html, /01\/01\/2000/);
  assert.match(html, /retificações/i);
});

test('coberturas municipal e institucional permanecem em matrizes separadas', () => {
  const html = renderizar({ dados: relatorio({ municipios: [{ municipio: 'Município Exemplo', fontesConsultadas: [], resultado: 'NÃO CONSULTADO', pendencia: 'Sem consulta registrada' }], instituicoes: [{ instituicao: 'Instituição Exemplo', fontesConsultadas: [], resultado: 'PESQUISA PARCIAL.', pendencia: 'Pendente', abrangenciaDemonstrada: [] }] }), aoAtualizar() {} });
  assert.match(html, /Cobertura municipal/);
  assert.match(html, /Órgãos e instituições/);
  assert.match(html, /Município Exemplo/);
  assert.match(html, /Instituição Exemplo/);
});

test('link do bot exige o mesmo usuário validado e não aceita outro destino', () => {
  assert.equal(urlBotSegura({ nome: 'BotImpresilk', username: 'bot_demonstrativo', url: 'https://t.me/bot_demonstrativo' }), 'https://t.me/bot_demonstrativo');
  for (const bot of [null, { username: 'bot_demonstrativo', url: 'https://t.me/outro_bot' }, { username: 'bot_demonstrativo', url: 'https://portal.example/bot_demonstrativo' }, { username: 'bot_demonstrativo', url: 'https://t.me:8443/bot_demonstrativo' }, { username: 'bot_demonstrativo', url: 'https://t.me/bot_demonstrativo?start=segredo' }, { username: '../x', url: 'https://t.me/x' }]) assert.equal(urlBotSegura(bot), null);
});

test('bot validado pode ser aberto mesmo antes da primeira publicação sem enviar mensagem', () => {
  const html = renderizar({ dados: { estado: 'sem_relatorio', bot: { nome: 'BotImpresilk', username: 'bot_demonstrativo', url: 'https://t.me/bot_demonstrativo' } }, aoAtualizar() {} });
  assert.match(html, /href="https:\/\/t.me\/bot_demonstrativo"/);
  assert.match(html, /Conversar com o bot/);
  assert.doesNotMatch(html, /start=|text=|telegram\/send/);
});

test('consultas operacionais são preparadas para cópia sem prometer envio automático', () => {
  const html = renderizar({ dados: relatorio(), aoAtualizar() {} });
  assert.match(html, /Quais licitações GO/);
  assert.match(html, /Quais municípios/);
  assert.match(html, /Copiar pergunta/);
  assert.match(html, /cole no Telegram/i);
  assert.doesNotMatch(html, /href="https:\/\/t.me/);
});

test('rodar pesquisa é ação separada de atualizar leitura e só aparece para direção',()=>{
 const html=renderizar({dados:relatorio(),podeRodar:true,aoRodar(){},aoAtualizar(){}});
 assert.match(html,/Rodar pesquisa/);assert.match(html,/Atualizar leitura/);
 assert.match(html,/Varredura pública automática de propostas no PNCP/);
 assert.match(html,/Portais municipais, Diário Oficial, anexos e demais consultas pendentes/);
 const restrita=renderizar({dados:relatorio(),podeRodar:false,aoRodar(){},aoAtualizar(){}});assert.doesNotMatch(restrita,/Rodar pesquisa/);
});
test('execução concluída não altera cobertura e apresenta link de execução seguro',()=>{
 const html=renderizar({dados:relatorio(),execucao:{dados:{estado:'concluida',execucao:{id:123,url:'https://github.com/empresa-exemplo/painel-exemplo/actions/runs/123',iniciadaEm:'2026-01-01T12:00:00Z'},consultadoEm:'2026-01-01T12:10:00Z'}},aoAtualizar(){}});
 assert.match(html,/Etapa automática concluída/);assert.match(html,/0 de 89/);assert.match(html,/cobertura.*relatório/i);assert.match(html,/Abrir execução/);
 const insegura=renderizar({dados:relatorio(),execucao:{dados:{estado:'falhou',execucao:{url:'javascript:alert(1)'},erro:'Falha demonstrativa'}},aoAtualizar(){}});assert.doesNotMatch(insegura,/href="javascript/);assert.match(insegura,/Falha demonstrativa/);
});
test('execução ativa trava novo disparo e não faz promessa de cobertura integral',()=>{
 const html=renderizar({dados:relatorio(),podeRodar:true,aoRodar(){},aoAtualizar(){},execucao:{dados:{estado:'em_andamento'}}});
 assert.match(html,/disabled=""[^>]*>.*?Rodar pesquisa|disabled=""[^>]*>.*?Pesquisando/s);assert.match(html,/em andamento/i);assert.doesNotMatch(html,/100% concluída/);
});
test('prompt geral e prompts dos editais são ações de copiar texto público sem envio',()=>{
 const html=renderizar({dados:relatorio({oportunidades}),aoAtualizar(){}});assert.match(html,/Copiar prompt geral/);assert.equal((html.match(/>Copiar prompt</g)||[]).length,3);assert.match(html,/não.*envia/i);
});

test('copiar prompt executa clipboard apenas com o contexto público selecionado do edital',async()=>{
  const anterior=Object.getOwnPropertyDescriptor(globalThis,'navigator');let copiado='';
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{writeText:async texto=>{copiado=texto;}}}});
  const dispatcher=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;
  const previo=dispatcher.current;
  dispatcher.current={useRef:()=>({current:null}),useEffect:()=>{},useId:()=> 'exemplo',useMemo:fn=>fn(),useState:inicial=>[typeof inicial==='function'?inicial():inicial,()=>{}]};
  function encontrar(elemento){
    if(Array.isArray(elemento)){for(const e of elemento){const r=encontrar(e);if(r)return r;}return null;}
    if(!elemento?.props)return null;
    if(elemento.type?.name==='Oportunidade')return encontrar(elemento.type(elemento.props));
    if(elemento.type==='button'&&React.Children.toArray(elemento.props.children).some(v=>v==='Copiar prompt'))return elemento;
    return encontrar(elemento.props.children);
  }
  try{
    const item={...oportunidades[0],oficialUrl:'https://portal.example/edital-ficticio',exigencias:['Material fictício'],custoInterno:'NÃO COPIAR DADO INTERNO FICTÍCIO'};
    const arvore=PesquisaLicitacoes({dados:relatorio({oportunidades:[item]})});const botao=encontrar(arvore);assert.ok(botao);
    await botao.props.onClick();assert.match(copiado,/Processo demonstrativo A/);assert.match(copiado,/Instituto Exemplo/);assert.match(copiado,/https:\/\/portal.example\/edital-ficticio/);assert.match(copiado,/Material fictício/);assert.doesNotMatch(copiado,/NÃO COPIAR DADO INTERNO/);
  }finally{dispatcher.current=previo;if(anterior)Object.defineProperty(globalThis,'navigator',anterior);else delete globalThis.navigator;}
});


test('histórico agrupa por mês e identifica períodos sem prometer todas as semanas',()=>{
  const registros=[{id:'semana-exemplo-a',periodo_de:'2026-10-26',periodo_ate:'2026-11-01',gerado_em:'2026-11-01T18:00:00Z',recebido_em:'2026-11-01T19:00:00Z',versao:'v-exemplo'},{id:'semana-exemplo-b',periodo_de:'2026-10-19',periodo_ate:'2026-10-25',gerado_em:'2026-10-25T18:00:00Z',recebido_em:'2026-10-25T19:00:00Z',versao:'v-exemplo'}];
  const html=renderizar({dados:relatorio(),historico:{dados:{registros,temMais:true}},paginaHistorico:1,relatorioSelecionado:'semana-exemplo-b',aoSelecionarRelatorio(){},aoPaginarHistorico(){}});
  assert.match(html,/Novembro de 2026/);assert.match(html,/Outubro de 2026/);assert.match(html,/Relatório de 25\/10\/2026/);
  assert.match(html,/período pesquisado: 19\/10\/2026 a 25\/10\/2026/);assert.doesNotMatch(html,/versão v-exemplo/);assert.match(html,/somente os registros desta página/);assert.match(html,/aria-pressed="true"/);assert.match(html,/Última pesquisa/);assert.match(html,/Próxima página do histórico/);
});

test('candidato pendente exibe identidade, motivo e dados registrados sem receber GO',()=>{
  const html=renderizar({dados:relatorio({candidatosRetidos:[{id:'retido-exemplo',processo:'Processo pendente fictício',orgao:'Órgão pendente fictício',produto:'Placas pendentes fictícias',motivos:['Destino de entrega não demonstrado.'],oficialUrl:'https://portal.example/pendente',prazo:'2026-11-14T12:00:00Z',localExecucaoRegistrado:{municipios:['Município fictício'],apenasSede:true,evidencia:'Apenas sede registrada.'},classificacao:'GO'}]})});
  const trecho=html.slice(html.indexOf('lp-pendentes'),html.indexOf('lp-matrizes'));
  assert.match(trecho,/Processo pendente fictício/);assert.match(trecho,/Órgão pendente fictício/);assert.match(trecho,/Placas pendentes fictícias/);
  assert.match(trecho,/Destino de entrega não demonstrado/);assert.match(trecho,/Prazo registrado \(a confirmar\)/);assert.match(trecho,/Destino registrado \(a confirmar\)/);
  assert.match(trecho,/Sem classificação validada/);assert.doesNotMatch(trecho,/>GO</);assert.match(trecho,/href="https:\/\/portal.example\/pendente"/);
});

test('candidato pendente não transforma texto do portal ou URL ativa em código',()=>{
  const html=renderizar({dados:relatorio({candidatosRetidos:[{id:'exemplo-inseguro',processo:'<script>exemplo</script>',oficialUrl:'javascript:alert(1)',motivos:['<img src=x>']}]})});
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|href="javascript:|<img src=x>/);assert.match(html,/Fonte segura indisponível/);
});

test('resumo PDF apresenta geração e falha sem depender dos filtros de oportunidades',()=>{
  const carregando=renderizar({dados:relatorio(),pdf:{carregando:true},aoBaixarPDF(){}});
  assert.match(carregando,/disabled=""[^>]*>.*?Gerando resumo PDF/s);
  const erro=renderizar({dados:relatorio(),pdf:{erro:'Falha de exportação fictícia'},aoBaixarPDF(){}});
  assert.match(erro,/role="alert"[^>]*>Falha de exportação fictícia/);assert.match(erro,/Resumo da pesquisa selecionada/);
});

test('ID ausente não é apresentado como ausência global de relatórios',()=>{
  const html=renderizar({dados:{estado:'sem_relatorio'},relatorioSelecionado:'inexistente-exemplo',historico:{dados:{registros:[],temMais:false}},aoSelecionarRelatorio(){}});
  assert.match(html,/Relatório selecionado indisponível/);assert.doesNotMatch(html,/Nenhum relatório publicado/);assert.match(html,/Última pesquisa/);
});

test('calendário distingue oportunidade de conferência pendente',()=>{
  const dados=relatorio({oportunidades:[oportunidades[0]],candidatosRetidos:[{id:'pendente-demo',motivos:['Conferir destino.']}]});
  const html=renderizar({dados,aoAgendar(){}});
  assert.match(html,/Adicionar ao calendário/);assert.match(html,/Agendar conferência/);
  assert.doesNotMatch(renderizar({dados}),/Adicionar ao calendário|Agendar conferência/);
});

test('prazo descritivo retido é preservado e não recebe hora ou fuso inventado',()=>{
  const html=renderizar({dados:relatorio({candidatosRetidos:[{id:'prazo-descritivo-exemplo',prazo:'Entrega em 20 dias após autorização.',motivos:['Conferir o prazo de novas propostas.']}]})});
  assert.match(html,/Entrega em 20 dias após autorização\./);
  assert.doesNotMatch(html,/Não informado \(Brasília\)/);
});


test('link de item abre página e detalhes da oportunidade indicada sem duplicá-la',()=>{
  const itens=Array.from({length:13},(_,i)=>({...oportunidades[0],id:`item-ficticio-${i}`,processo:`Processo fictício ${String(i).padStart(2,'0')}`}));
  const html=renderizar({dados:relatorio({oportunidades:itens}),itemSelecionado:'item-ficticio-10'});
  assert.match(html,/página 2 de 3/);assert.equal((html.match(/data-licitacao-id="item-ficticio-10"/g)||[]).length,1);
  const card=html.match(/<article[^>]*data-licitacao-id="item-ficticio-10"[\s\S]*?<\/article>/)?.[0];
  assert.ok(card);assert.match(card,/lp-item-selecionado/);assert.match(card,/aria-current="true"/);assert.match(card,/tabindex="-1"/);assert.match(card,/lp-detalhes-oportunidade" open=""/);assert.match(card,/Item indicado no link/);
});

test('link de candidato retido abre sua página sem promover classificação',()=>{
  const itens=Array.from({length:14},(_,i)=>({id:`retido-ficticio-${i}`,processo:`Retido fictício ${i}`,motivos:['Conferir destino.']}));
  const html=renderizar({dados:relatorio({candidatosRetidos:itens}),itemSelecionado:'retido-ficticio-13'});
  assert.match(html,/página 3 de 3/);
  const card=html.match(/<article[^>]*data-licitacao-id="retido-ficticio-13"[\s\S]*?<\/article>/)?.[0];
  assert.ok(card);assert.match(card,/lp-item-selecionado/);assert.match(card,/aria-current="true"/);assert.match(card,/lp-detalhes-oportunidade" open=""/);assert.match(card,/Sem classificação validada/);assert.doesNotMatch(card,/>GO</);
});

test('item ausente avisa sem trocar relatório nem ocultar os demais registros',()=>{
  const html=renderizar({dados:relatorio({oportunidades:[oportunidades[0]]}),itemSelecionado:'item-ausente-ficticio'});
  assert.match(html,/O item indicado no link não foi encontrado neste relatório/);assert.match(html,/Processo demonstrativo A/);assert.doesNotMatch(html,/aria-current="true"/);
});

// Exerce os callbacks reais e a recomposição do componente; efeitos respeitam
// dependências, para reproduzir mudanças de relatório/item após filtros ativos.
function comPesquisaInterativa(props,executar){
  const dispatcher=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher,anterior=dispatcher.current;
  const estados=[],efeitos=[];let estadoIndice=0,efeitoIndice=0,pendentes=[],atuais=props;
  dispatcher.current={useId:()=> 'interativo',useRef:()=>({current:null}),useMemo:fn=>fn(),useState:inicial=>{
    const indice=estadoIndice++;if(!(indice in estados))estados[indice]=typeof inicial==='function'?inicial():inicial;
    return [estados[indice],valor=>{estados[indice]=typeof valor==='function'?valor(estados[indice]):valor;}];
  },useEffect:(fn,deps)=>{const indice=efeitoIndice++,previos=efeitos[indice];if(!previos||deps.some((valor,i)=>!Object.is(valor,previos[i]))){efeitos[indice]=deps;pendentes.push(fn);}}};
  function renderizar(proximas=atuais){atuais=proximas;let arvore;for(let n=0;n<4;n++){estadoIndice=0;efeitoIndice=0;pendentes=[];arvore=PesquisaLicitacoes(atuais);if(!pendentes.length)return arvore;for(const efeito of pendentes)efeito();}throw Error('Efeitos não estabilizaram.');}
  function buscar(arvore,predicado,achados=[]){if(Array.isArray(arvore)){for(const item of arvore)buscar(item,predicado,achados);}else if(arvore?.props){if(predicado(arvore))achados.push(arvore);buscar(arvore.props.children,predicado,achados);}return achados;}
  const componente=(arvore,nome)=>buscar(arvore,no=>no.type?.name===nome);
  const botao=(arvore,texto)=>buscar(arvore,no=>no.type==='button'&&React.Children.toArray(no.props.children).some(item=>item===texto))[0];
  try{return executar({renderizar,componente,botao});}finally{dispatcher.current=anterior;}
}

test('categoria e busca filtram serviços dos dois grupos e podem ser limpas sem alterar origem',()=>{
  const dados=relatorio({oportunidades,candidatosRetidos:[{id:'pendente-adesivo',orgao:'Órgão Fictício',processo:'Processo Fictício',produto:'Adesivos',motivos:['Conferir execução.']}]});
  const antes=structuredClone(dados);
  comPesquisaInterativa({dados},({renderizar,componente,botao})=>{
    let arvore=renderizar(),explorador=componente(arvore,'ExploradorServicos')[0];
    explorador.props.aoCategoria('adesivos');arvore=renderizar();explorador=componente(arvore,'ExploradorServicos')[0];
    assert.equal(explorador.props.encontrados.itens,2);assert.equal(componente(arvore,'Oportunidade').length,1);
    assert.equal(componente(arvore,'CandidatosPendentes')[0].props.categoria,'adesivos');
    explorador.props.aoBusca('pendente-adesivo');arvore=renderizar();
    assert.equal(componente(arvore,'ExploradorServicos')[0].props.encontrados.itens,1);assert.equal(componente(arvore,'Oportunidade').length,0);
    botao(arvore,'Limpar todos os filtros').props.onClick();arvore=renderizar();
    assert.equal(componente(arvore,'ExploradorServicos')[0].props.categoria,'');assert.equal(componente(arvore,'ExploradorServicos')[0].props.busca,'');
    assert.equal(componente(arvore,'ExploradorServicos')[0].props.encontrados.itens,4);
  });
  assert.deepEqual(dados,antes);
});

test('filtros avançados afetam somente analisados e PDF/calendário recebem o registro original',()=>{
  const pendente={id:'pendente-ficticio',produto:'Adesivos',motivos:['Conferir destino.']},dados=relatorio({oportunidades,candidatosRetidos:[pendente]});
  let pdf;const agendados=[],props={dados,aoBaixarPDF:valor=>{pdf=valor;},aoAgendar:(...args)=>agendados.push(args)};
  comPesquisaInterativa(props,({renderizar,componente,botao})=>{
    let arvore=renderizar();componente(arvore,'FiltroSelect').find(item=>item.props.titulo==='Classificação').props.aoMudar('GO');arvore=renderizar();
    const cards=componente(arvore,'Oportunidade'),retidos=componente(arvore,'CandidatosPendentes')[0];
    assert.equal(cards.length,1);assert.equal(retidos.props.candidatos,dados.candidatosRetidos);assert.equal(retidos.props.categoria,'');
    botao(arvore,'Baixar resumo PDF').props.onClick();assert.equal(pdf,dados);
    cards[0].props.aoAgendar(cards[0].props.item);retidos.props.aoAgendar(pendente);
    assert.equal(agendados[0][0],oportunidades[0]);assert.deepEqual(agendados[0][1],{pendente:false,relatorio:dados});assert.equal(agendados[1][0],pendente);assert.deepEqual(agendados[1][1],{pendente:true,relatorio:dados});
  });
});

test('Quero participar seleciona o item e o cartão selecionado abre a aba de interesse', () => {
  const item = { ...oportunidades[2], prazo: undefined };
  const dados = relatorio({ oportunidades: [item] });
  let chamadas = [], abrir = 0;
  const props = { dados, aoSelecionarInteresse: (...args) => { chamadas = args; }, aoAbrirInteresses: () => { abrir++; } };
  comPesquisaInterativa(props, ({renderizar, componente, botao}) => {
    const avaliacao = () => componente(renderizar(), 'Oportunidade')[0];
    let card = avaliacao();
    let acao = botao(card.type(card.props), 'Quero participar');
    assert.ok(acao);
    assert.equal(acao.props.disabled, undefined);
    acao.props.onClick();
    assert.deepEqual(chamadas, [item, dados]);
    card = componente(renderizar({ ...props, interesseSelecionado: () => true }), 'Oportunidade')[0];
    assert.equal(botao(card.type(card.props), 'Quero participar'), undefined);
    acao = botao(card.type(card.props), 'Selecionado');
    assert.ok(acao);
    acao.props.onClick();
    assert.equal(abrir, 1);
  });
});

test('trocar relatório ou abrir deep link limpa categoria e busca antigas',()=>{
  const dados=relatorio({oportunidades}),outro=relatorio({id:'relatorio-outro',oportunidades:[{...oportunidades[0],id:'outro-item',produto:'ACM'}]});
  comPesquisaInterativa({dados},({renderizar,componente})=>{
    let arvore=renderizar(),explorador=componente(arvore,'ExploradorServicos')[0];explorador.props.aoCategoria('adesivos');explorador.props.aoBusca('adesivos');arvore=renderizar();
    arvore=renderizar({dados,itemSelecionado:'exemplo-1'});explorador=componente(arvore,'ExploradorServicos')[0];
    assert.equal(explorador.props.categoria,'');assert.equal(explorador.props.busca,'');assert.equal(componente(arvore,'Oportunidade').find(card=>card.props.item.id==='exemplo-1').props.selecionado,true);
    explorador.props.aoCategoria('adesivos');arvore=renderizar({dados:outro});explorador=componente(arvore,'ExploradorServicos')[0];
    assert.equal(explorador.props.categoria,'');assert.deepEqual(explorador.props.categorias.map(item=>item.id),['acm']);assert.equal(componente(arvore,'Oportunidade')[0].props.item.id,'outro-item');
  });
});

test('descrição longa tem título compacto e conteúdo integral acessível nos detalhes',()=>{
  const produto='Fornecimento de placas de sinalização demonstrativas, incluindo instalação, acabamento, arte e preparação do local em todas as unidades do órgão fictício. FINAL DA DESCRIÇÃO FICTÍCIA.';
  const html=renderizar({dados:relatorio({candidatosRetidos:[{id:'longo-ficticio',produto,motivos:['Conferir documentação.','Conferir destino.']}]})});
  const titulo=html.match(/<h4 class="lp-servico-produto">([^<]*)<\/h4>/)?.[1];assert.ok(titulo.length<=110);assert.ok(titulo.endsWith('…'));
  assert.match(html,/Descrição do serviço/);assert.match(html,/FINAL DA DESCRIÇÃO FICTÍCIA/);assert.match(html,/Conferência pendente/);assert.match(html,/Motivos da pendência/);
  assert.match(html,/<details class="lp-cobertura-painel">/);assert.doesNotMatch(html,/<details class="lp-cobertura-painel" open/);
});
