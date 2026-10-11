// A MEMÓRIA ÚNICA DAS FONTES (src/components/marketing/dados/useFontesMarketing.js)
// contra a porta da prévia (src/review/marketing-fontes.mjs, que responde
// como a de verdade, com os dados que os conectores geraram).
//
// O que se prova aqui é o pedido do 11/10: a página lê UMA vez. A faixa da
// Visão geral e o bloco Conexões dividem a leitura leve; a sub-aba Dados pede
// os dados só das fontes do canal aberto; trocar de sub-aba ou voltar a um
// canal já lido não pede nada; a coleta que anda é relida leve, só ela. E a
// regra do "restrito": trocar a pessoa limpa tudo, e a resposta que chega
// depois da troca não entra.
//
// O arquivo de verdade é empacotado (esbuild) com o servidor, a sessão e o
// React trocados; cada teste carrega um módulo novo (memória zerada). Começa
// pelo caso ruim.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { criarFontesDaPrevia } from '../src/review/marketing-fontes.mjs';
import { readFileSync } from 'node:fs';

const ler = (n) => JSON.parse(readFileSync(new URL(`../src/review/${n}`, import.meta.url), 'utf8'));
const VARIEDADE = ler('fontes-ficticias.json');
const CHEIAS = ler('fontes-ficticias-cheias.json');
const esperarTudo = () => new Promise((r) => setImmediate(r));

const STUBS = {
  servicos: `export const lerFontesMarketing = (o) => globalThis.__mem.ler(o);
    export const coletarAgoraMarketing = (f) => globalThis.__mem.coletar(f);`,
  sessao: `export const getToken = () => globalThis.__mem.token;
    export const aoMudarSessao = (fn) => { globalThis.__mem.mudou = fn; return () => {}; };`,
  // Sem React: o hook vira uma função comum (os efeitos não rodam; o teste
  // chama a leitura como os efeitos chamariam), e quem chama o hook passa a
  // "olhar" a memória (é o que deixa a releitura rodar).
  react: `export const useCallback = (f) => f; export const useEffect = () => {}; export const useMemo = (f) => f();
    export const useSyncExternalStore = (assinar, ver) => { assinar(() => {}); return ver(); };`,
};
let pacote = null;
let carga = 0;
async function novaMemoria() {
  if (!pacote) {
    const saida = await build({
      entryPoints: [fileURLToPath(new URL('../src/components/marketing/dados/useFontesMarketing.js', import.meta.url))],
      bundle: true, format: 'esm', platform: 'neutral', write: false, logLevel: 'silent',
      plugins: [{ name: 'stubs', setup(b) {
        b.onResolve({ filter: /services\/marketing\.js$/ }, () => ({ path: 'servicos', namespace: 'stub' }));
        b.onResolve({ filter: /lib\/sessao\.js$/ }, () => ({ path: 'sessao', namespace: 'stub' }));
        b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' }));
      } }],
    });
    pacote = saida.outputFiles[0].text;
  }
  // Um comentário diferente a cada carga: o import() devolve um módulo novo.
  return import(`data:text/javascript;base64,${Buffer.from(`${pacote}\n// carga ${++carga}`).toString('base64')}`);
}

/** A porta da prévia atrás da memória: cada pedido é anotado ({leve,
 *  fontes} como a memória pediu) e respondido pela prévia, com o relógio de
 *  mentira dela. `segurar` deixa a próxima resposta presa até o teste soltar. */
function servidor({ papel = 'gestao', cenarios = [], token = 'cracha-ana' } = {}) {
  const relogio = { t: Date.parse('2026-10-11T15:00:00.000Z') };
  const previa = criarFontesDaPrevia({
    carregar: async () => VARIEDADE, carregarCheias: async () => CHEIAS, papel, cenarios: new Set(cenarios),
    agora: () => relogio.t, esperar: async (ms) => { relogio.t += ms; },
  });
  const s = { token, relogio, pedidos: [], coletas: [], presos: [], segurar: false };
  s.ler = async ({ leve = false, fontes = null } = {}) => {
    s.pedidos.push({ leve, fontes });
    const corpo = { action: 'fontes', ...(leve ? { leve: true } : {}), ...(Array.isArray(fontes) ? { fontes } : {}) };
    if (s.segurar) await new Promise((soltar) => s.presos.push(soltar));
    const r = await previa.responder('fontes', corpo);
    if (r.status !== 200) throw Object.assign(new Error(r.corpo.erro), { status: r.status });
    return r.corpo;
  };
  s.coletar = async (fonte) => {
    s.coletas.push(fonte);
    const r = await previa.responder('coletarAgora', { action: 'coletarAgora', fonte });
    if (r.status !== 200) throw Object.assign(new Error(r.corpo.erro), { status: r.status, aguardarSegundos: r.corpo.aguardarSegundos });
    return { andando: r.corpo.andando === true, fonte: r.corpo.andando === true ? null : (r.corpo.fonte ?? null) };
  };
  globalThis.__mem = s;
  return s;
}

/* ------------------------------------------------------- o caso ruim -- */

test('O CASO RUIM: a página lê uma vez: a faixa e o Conexões dividem a leitura leve, e a sub-aba pede só as fontes do canal', async () => {
  const s = servidor();
  const m = await novaMemoria();
  // A faixa e o Conexões abrindo juntos (e o StrictMode montando duas vezes): uma ida só.
  const [a, b, c] = await Promise.all([m.lerFontes({ leve: true }), m.lerFontes({ leve: true }), m.lerFontes({ leve: true })]);
  assert.deepEqual(s.pedidos, [{ leve: true, fontes: null }]);
  assert.ok(a);
  assert.deepEqual([b, c], [a, a], 'as três telas recebem o mesmo retrato');
  assert.equal(a.lista.length, 6);
  assert.ok(a.lista.every((f) => !('dados' in f)), 'a faixa e o Conexões não recebem os dados');
  // Voltar à Visão geral: a memória vale, nada é pedido.
  await m.lerFontes({ leve: true });
  assert.equal(s.pedidos.length, 1);
  // A sub-aba Dados do Facebook: só a Meta, com os dados.
  const face = await m.lerFontes({ fontes: ['meta'] });
  assert.deepEqual(s.pedidos.at(-1), { leve: false, fontes: ['meta'] });
  assert.deepEqual(Object.keys(face.porFonte), ['meta']);
  assert.deepEqual(face.porFonte.meta.dados, VARIEDADE.fontes.meta.dados);
  // Trocar de sub-aba (Fazer, Dados) e o Instagram (a mesma Meta): nada.
  await m.lerFontes({ fontes: ['meta'] });
  assert.equal(s.pedidos.length, 2);
  // O canal Site: site, google e google_ads, numa ida só.
  await m.lerFontes({ fontes: ['site', 'google', 'google_ads'] });
  assert.deepEqual(s.pedidos.at(-1), { leve: false, fontes: ['site', 'google', 'google_ads'] });
  // De volta ao Facebook: já lido.
  await m.lerFontes({ fontes: ['meta'] });
  assert.equal(s.pedidos.length, 3);
  // E o hook entrega a cada tela o seu retrato, da mesma memória.
  assert.equal(m.useFontesMarketing({ leve: true }).retrato.lista.length, 6);
  const site = m.useFontesMarketing({ fontes: ['google_ads', 'site', 'google', 'site'] });
  assert.deepEqual(Object.keys(site.retrato.porFonte).sort(), ['google', 'google_ads', 'site']);
  assert.equal(site.carregando, false);
  assert.equal(site.erro, '');
  // A leitura forçada ("Tentar de novo") vai de novo, só do que pediu.
  await site.recarregar();
  assert.deepEqual(s.pedidos.at(-1), { leve: false, fontes: ['site', 'google', 'google_ads'] });
});

test('O CASO RUIM: trocar a pessoa limpa a memória; a resposta que chega depois da troca não entra; crachá diferente não enxerga o retrato de antes', async () => {
  const s = servidor({ papel: 'gestao', cenarios: ['fontes-cheias'] });
  const m = await novaMemoria();
  await m.lerFontes({ fontes: ['google_ads'] });
  const gestao = m.useFontesMarketing({ fontes: ['google_ads'] }).retrato;
  assert.ok(gestao.porFonte.google_ads.dados.leads.restrito, 'a gestão vê o dado pessoal');
  // Outro crachá no aparelho (outra aba entrou com outra pessoa): nenhuma tela enxerga o retrato de antes.
  s.token = 'cracha-bia';
  assert.equal(m.useFontesMarketing({ fontes: ['google_ads'] }).retrato, null);
  assert.equal(m.useFontesMarketing({ leve: true }).retrato, null);
  // A próxima leitura limpa e lê de novo, com o crachá novo.
  const antes = s.pedidos.length;
  await m.lerFontes({ fontes: ['google_ads'] });
  assert.equal(s.pedidos.length, antes + 1, 'a memória do crachá anterior não serviu');
  // Sair e entrar no meio de uma leitura: a resposta da pessoa anterior não entra.
  s.segurar = true;
  const lendo = m.lerFontes({ fontes: ['meta'], forcar: true });
  await esperarTudo();
  globalThis.__mem.mudou();
  s.segurar = false;
  s.presos.forEach((soltar) => soltar());
  assert.equal(await lendo, null);
  assert.equal(m.useFontesMarketing({ fontes: ['meta'] }).retrato, null);
  assert.equal(JSON.stringify(m.useFontesMarketing({ fontes: ['google_ads'] })).includes('restrito'), false);
});

test('O CASO RUIM: "Atualizar agora" que fica andando: a memória relê leve SÓ a fonte que anda, nas esperas, até ela terminar; a sub-aba pede de novo só ela', async (t) => {
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => mock.timers.reset());
  const s = servidor({ papel: 'marketing', cenarios: ['fontes-andando'] });
  const m = await novaMemoria();
  // Alguém olhando a sub-aba do Site (a releitura só roda com tela aberta).
  m.useFontesMarketing({ fontes: ['site', 'google', 'google_ads'] });
  await m.lerFontes({ leve: true });
  await m.lerFontes({ fontes: ['site', 'google', 'google_ads'] });
  const antes = m.useFontesMarketing({ fontes: ['site'] }).retrato.porFonte.site;
  const [r] = await m.atualizarFontes(['site']);
  assert.deepEqual([r.ok, r.andando, r.nova], [true, true, null]);
  assert.equal(m.useFontesMarketing({ fontes: ['site'] }).retrato.porFonte.site.andando, true, 'a sub-aba mostra "coletando"');
  assert.deepEqual(m.useFontesMarketing({ fontes: ['site'] }).retrato.porFonte.site.dados, antes.dados, 'com os números de antes');
  const lidas = s.pedidos.length;
  // 5 s: relê leve só o site (a prévia ainda anda: 8 s).
  s.relogio.t += 5000;
  mock.timers.tick(5000);
  await esperarTudo();
  assert.deepEqual(s.pedidos.slice(lidas), [{ leve: true, fontes: ['site'] }]);
  assert.equal(m.useFontesMarketing({ leve: true }).retrato.porFonte.site.andando, true);
  // Mais 10 s: terminou. A leve traz a coleta nova, e a sub-aba sabe que o retrato dela envelheceu.
  s.relogio.t += 10_000;
  mock.timers.tick(10_000);
  await esperarTudo();
  assert.deepEqual(s.pedidos.slice(lidas), [{ leve: true, fontes: ['site'] }, { leve: true, fontes: ['site'] }]);
  const leve = m.useFontesMarketing({ leve: true }).retrato.porFonte.site;
  assert.equal(leve.andando, false);
  assert.notEqual(leve.coletadoEm, antes.coletadoEm);
  const aba = m.useFontesMarketing({ fontes: ['site', 'google', 'google_ads'] }).retrato.porFonte.site;
  assert.equal(aba.coletadoEm, antes.coletadoEm, 'a data nova não vai para cima dos números de antes');
  // Nada anda mais: a releitura parou.
  mock.timers.tick(120_000);
  await esperarTudo();
  assert.equal(s.pedidos.length, lidas + 2);
  // O efeito da sub-aba (o retrato envelheceu) pede de novo só o site.
  await m.lerFontes({ fontes: ['site', 'google', 'google_ads'] });
  assert.deepEqual(s.pedidos.at(-1), { leve: false, fontes: ['site'] });
  assert.equal(m.useFontesMarketing({ fontes: ['site'] }).retrato.porFonte.site.coletadoEm, leve.coletadoEm);
});

/* ----------------------------------------------------------- o resto -- */

test('"Atualizar agora" que termina: a fonte nova entra na memória sem outra leitura; a trava volta com os segundos', async () => {
  const s = servidor({ papel: 'marketing' });
  const m = await novaMemoria();
  await m.lerFontes({ leve: true });
  const [r] = await m.atualizarFontes(['meta']);
  assert.deepEqual([r.ok, r.andando, r.nova?.fonte], [true, false, 'meta']);
  assert.equal(s.pedidos.length, 1, 'a fonte veio na resposta do Atualizar agora');
  assert.equal(m.useFontesMarketing({ leve: true }).retrato.porFonte.meta.coletadoEm, r.nova.coletadoEm, 'a faixa vê a coleta nova');
  // A sub-aba do Facebook já tem os dados dela (a resposta do Atualizar agora vem cheia).
  await m.lerFontes({ fontes: ['meta'] });
  assert.equal(s.pedidos.length, 1);
  const [trava] = await m.atualizarFontes(['meta']);
  assert.deepEqual([trava.ok, trava.status, trava.aguardarSegundos > 0, typeof trava.erro], [false, 429, true, 'string']);
});

test('a confirmação da conexão (guardarFonte) entra na memória: a faixa e o Conexões veem sem outra leitura', async () => {
  const s = servidor();
  const m = await novaMemoria();
  await m.lerFontes({ leve: true });
  const pin = { ...m.useFontesMarketing({ leve: true }).retrato.porFonte.pinterest, conexao: { conectadoEm: '2026-10-11T15:00:00.000Z', conectadoPor: 'demo', conta: null, escopos: [], expiraEm: null, refreshExpiraEm: null } };
  m.guardarFonte(pin);
  assert.deepEqual(m.useFontesMarketing({ leve: true }).retrato.porFonte.pinterest.conexao, pin.conexao);
  assert.equal(s.pedidos.length, 1);
  // Fonte torta não entra nem quebra.
  m.guardarFonte(null);
  m.guardarFonte({ fonte: '__proto__' });
  assert.equal(m.useFontesMarketing({ leve: true }).retrato.lista.length, 6);
});

test('a falha não apaga o que está na tela, e cada tela vê o erro da leitura dela', async () => {
  const s = servidor();
  const m = await novaMemoria();
  await m.lerFontes({ leve: true });
  // A leitura da sub-aba falha: a faixa não mostra erro; a sub-aba mostra.
  s.ler = async () => { throw new Error('O servidor falhou agora.'); };
  assert.equal(await m.lerFontes({ fontes: ['meta'] }), null);
  assert.equal(m.useFontesMarketing({ leve: true }).erro, '');
  assert.equal(m.useFontesMarketing({ fontes: ['meta'] }).erro, 'O servidor falhou agora.');
  assert.equal(m.useFontesMarketing({ fontes: ['meta'] }).retrato, null, 'a sub-aba espera (Tentar de novo), sem "sem dados"');
  // A leve forçada falha: o retrato leve de antes continua, com o erro ao lado.
  assert.equal(await m.lerFontes({ leve: true, forcar: true }), null);
  const faixa = m.useFontesMarketing({ leve: true });
  assert.equal(faixa.retrato.lista.length, 6);
  assert.equal(faixa.erro, 'O servidor falhou agora.');
});

/* --------------------------------------------- revisão de 12/10/2026 -- */

test('O CASO RUIM (revisão de 12/10): o ler() depois do Desconectar não aproveita a leitura que saiu ANTES (a linha não fica "conectada" embaixo do aviso)', async (t) => {
  const conectado = { conectadoEm: '2026-10-01T12:00:00.000Z', conectadoPor: 'leo', conta: 'leo', escopos: [], expiraEm: null, refreshExpiraEm: null };
  const fonte = (conexao) => ({ fonte: 'pinterest', nome: 'Pinterest', oauth: true, estado: conexao ? 'ok' : 'falta_conectar', conta: 'x', partes: {}, avisos: [],
    coletadoEm: '2026-10-11T09:30:00.000Z', ultimaBoaEm: '2026-10-11T09:30:00.000Z', configurado: true, opcionais: [], conexao, andando: false, ultimas: [] });
  const servidor = { conexao: conectado };
  const presos = [];
  const s = globalThis.__mem = {
    token: 'cracha-leo', pedidos: 0, segurar: false,
    async ler() {
      s.pedidos++;
      // O servidor responde com o estado do instante em que RECEBEU o pedido.
      const corpo = { ok: true, papel: 'gestao', ordem: ['pinterest'], fontes: { pinterest: fonte(servidor.conexao) }, avisos: [], motivos: {} };
      if (s.segurar) await new Promise((r) => presos.push(r));
      return JSON.parse(JSON.stringify(corpo));
    },
  };
  const m = await novaMemoria();
  await m.lerFontes({ leve: true });
  // O relógio parado: as duas leituras saem no MESMO milissegundo (o que a
  // rede rápida faz de verdade), e a que saiu antes não pode ganhar por
  // empate quando chega por último.
  const dateNow = Date.now;
  const parado = dateNow();
  Date.now = () => parado;
  t.after(() => { Date.now = dateNow; });
  s.segurar = true;
  const aoAbrir = m.lerFontes({ leve: true, forcar: true }); // o ler() do abrir do Conexões, numa rede lenta
  await esperarTudo();
  servidor.conexao = null; // o Desconectar respondeu
  s.segurar = false;
  const depois = m.lerFontes({ leve: true, forcar: true }); // o ler() depois do Desconectar
  assert.equal(s.pedidos, 3, 'a leitura de depois saiu de verdade');
  presos.forEach((r) => r());
  await Promise.all([aoAbrir, depois]);
  assert.equal(m.useFontesMarketing({ leve: true }).retrato.porFonte.pinterest.conexao, null, 'a linha mostra o estado de depois');
  // A leitura NÃO forçada continua aproveitando a que está em andamento.
  s.segurar = true;
  const a = m.lerFontes({ leve: true, forcar: true });
  await esperarTudo();
  const b = m.lerFontes({ fontes: null, leve: false });
  s.segurar = false;
  presos.forEach((r) => r());
  await Promise.all([a, b]);
  assert.equal(s.pedidos, 5, 'leve e cheia são pedidos diferentes');
});

test('O CASO RUIM (revisão de 12/10): a trava de 2 minutos mora na memória: os dois botões contam pela mesma, e ela sobrevive a sair e voltar', async () => {
  const s = servidor({ papel: 'marketing' });
  const m = await novaMemoria();
  await m.lerFontes({ leve: true });
  // Sem pedido, nada travado.
  assert.equal(m.useTravasDeColeta()('meta'), 0);
  const [r] = await m.atualizarFontes(['meta']);
  assert.equal(r.ok, true);
  // O botão do Conexões e o da sub-aba Dados (dois "componentes") veem a mesma trava.
  const conexoes = m.useTravasDeColeta(), dados = m.useTravasDeColeta();
  assert.ok(conexoes('meta') > 100 && conexoes('meta') <= 120, String(conexoes('meta')));
  assert.equal(dados('meta'), conexoes('meta'));
  assert.equal(conexoes('site'), 0, 'por fonte');
  // "Sair e voltar": um componente novo, montado depois, ainda vê a trava.
  assert.ok(m.useTravasDeColeta()('meta') > 100);
  // O 429 de outra pessoa (a trava é do servidor, para todos): a tela aprende os segundos dele.
  s.coletar = async () => { throw Object.assign(new Error('Esta fonte foi atualizada há pouco. Tente de novo em 37 segundos.'), { status: 429, aguardarSegundos: 37 }); };
  const [r2] = await m.atualizarFontes(['site']);
  assert.deepEqual([r2.ok, r2.status], [false, 429]);
  assert.ok(m.useTravasDeColeta()('site') > 30 && m.useTravasDeColeta()('site') <= 37);
  // Trocar a pessoa limpa a trava junto com o resto.
  globalThis.__mem.mudou();
  assert.equal(m.useTravasDeColeta()('meta'), 0);
});
