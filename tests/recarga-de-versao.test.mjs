// A recarga que salva a tela branca depois de uma publicação nova
// (src/lib/recarga-de-versao.js, usada pela GuardaDeRota em volta das rotas).
// Começa pelo caso ruim: o laço. Recarregar sem fim é pior que a tela branca,
// porque a pessoa nem consegue ler o aviso.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAVE_RECARGA,
  JANELA_RECARGA_MS,
  ehFalhaDeCarga,
  marcarFalhaDeCarga,
  podeRecarregarSozinho,
} from '../src/lib/recarga-de-versao.js';

function armazemFalso(inicial = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => dados.set(k, String(v)),
    dados,
  };
}

const AGORA = 1_760_000_000_000;

test('o caso ruim: a segunda falha logo depois da recarga NÃO recarrega de novo', () => {
  const s = armazemFalso();
  assert.equal(podeRecarregarSozinho(s, AGORA), true);
  assert.equal(s.dados.get(CHAVE_RECARGA), String(AGORA));
  // A página voltou e a tela falhou de novo 5 s depois: mensagem, não laço.
  assert.equal(podeRecarregarSozinho(s, AGORA + 5_000), false);
  // E continua sem recarregar até o fim da janela.
  assert.equal(podeRecarregarSozinho(s, AGORA + JANELA_RECARGA_MS - 1), false);
});

test('o caso ruim: armazém que não lê ou não grava não recarrega (sem marca, o risco é o laço)', () => {
  assert.equal(podeRecarregarSozinho(null, AGORA), false);
  const quebrado = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => {} };
  assert.equal(podeRecarregarSozinho(quebrado, AGORA), false);
  const naoGrava = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  assert.equal(podeRecarregarSozinho(naoGrava, AGORA), false);
  // setItem que engole calado (armazém cheio em alguns navegadores).
  const engole = { getItem: () => null, setItem: () => {} };
  assert.equal(podeRecarregarSozinho(engole, AGORA), false);
});

test('uma publicação mais tarde, depois da janela, volta a recarregar sozinha', () => {
  const s = armazemFalso({ [CHAVE_RECARGA]: String(AGORA) });
  assert.equal(podeRecarregarSozinho(s, AGORA + JANELA_RECARGA_MS), true);
  assert.equal(s.dados.get(CHAVE_RECARGA), String(AGORA + JANELA_RECARGA_MS));
});

test('marca estragada ou do futuro (relógio mudou) não trava a recarga para sempre', () => {
  assert.equal(podeRecarregarSozinho(armazemFalso({ [CHAVE_RECARGA]: 'lixo' }), AGORA), true);
  assert.equal(podeRecarregarSozinho(armazemFalso({ [CHAVE_RECARGA]: String(AGORA + 3_600_000) }), AGORA), true);
});

test('falha de carga: o texto de cada navegador e o erro marcado pelo vite:preloadError', () => {
  assert.equal(ehFalhaDeCarga(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Marketing-abc.js')), true);
  assert.equal(ehFalhaDeCarga(new TypeError('error loading dynamically imported module')), true);
  assert.equal(ehFalhaDeCarga(new TypeError('Importing a module script failed.')), true);
  assert.equal(ehFalhaDeCarga(new Error('Unable to preload CSS for /assets/Marketing-abc.css')), true);
  // Texto que não diz nada, mas o Vite avisou pelo evento: conta.
  const mudo = new Error('Load failed');
  assert.equal(ehFalhaDeCarga(mudo), false);
  marcarFalhaDeCarga(mudo);
  assert.equal(ehFalhaDeCarga(mudo), true);
});

test('erro de programa não é falha de carga: recarregar não conserta e esconderia o erro', () => {
  assert.equal(ehFalhaDeCarga(new TypeError("Cannot read properties of undefined (reading 'map')")), false);
  assert.equal(ehFalhaDeCarga(null), false);
  assert.equal(ehFalhaDeCarga(undefined), false);
  // Marcar algo que não é objeto não quebra nada.
  marcarFalhaDeCarga('texto');
  marcarFalhaDeCarga(undefined);
  assert.equal(ehFalhaDeCarga('texto'), false);
});

test('todo Suspense de rota do App está dentro de uma GuardaDeRota', async () => {
  // Rota nova com um Suspense próprio e sem a guarda voltaria a dar tela
  // branca depois de uma publicação. Leitura do texto, como o
  // menu-tem-rota.test.mjs: barato e pega o esquecimento.
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
  const suspenses = app.match(/<Suspense\b/g) || [];
  const guardas = app.match(/<GuardaDeRota\b/g) || [];
  assert.ok(suspenses.length >= 3, `esperava os três Suspense de rota, achei ${suspenses.length}`);
  assert.equal(guardas.length, suspenses.length);
  // E cada guarda abre logo antes de um Suspense (nada entre os dois), com a
  // chave da NAVEGAÇÃO (location.key) e não só o caminho: com o caminho, o
  // erro de /marketing?v=google não saía clicando no "Marketing" do menu.
  const pares = app.match(/<GuardaDeRota chave=\{location\.key\}>\s*<Suspense\b/g) || [];
  assert.equal(pares.length, suspenses.length);
});

test('a guarda limpa o erro antes de desenhar (getDerivedStateFromProps), e não no componentDidUpdate', async () => {
  // No componentDidUpdate o erro que nasce no MESMO desenho da troca de
  // chave (o React.lazy que já falhou lança na hora) era apagado, a tela
  // falhava de novo e a segunda captura mostrava "Esta tela não carregou"
  // durante a recarga. Leitura do texto: o caso precisa de um navegador.
  const { readFile } = await import('node:fs/promises');
  const guarda = await readFile(new URL('../src/components/GuardaDeRota.jsx', import.meta.url), 'utf8');
  assert.match(guarda, /static getDerivedStateFromProps\(props, state\)/);
  // O método, e não a palavra (o comentário conta a história dele).
  assert.doesNotMatch(guarda, /^\s*componentDidUpdate\s*\(/m);
});

test('o evento do Vite marca a falha de carga sem recarregar por conta própria', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile(new URL('../src/main.jsx', import.meta.url), 'utf8');
  assert.match(main, /addEventListener\("vite:preloadError", \(e\) => marcarFalhaDeCarga\(e\.payload\)\)/);
  // O prefetch de segundo plano dispara o mesmo evento: recarregar daqui
  // derrubaria um formulário no meio.
  assert.doesNotMatch(main, /preloadError[^\n]*reload/);
});
