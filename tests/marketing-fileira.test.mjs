// A FILEIRA DE CHIPS do Marketing (src/components/marketing/Fileira.jsx).
//
// O caso ruim que ela já teve: abrir DIRETO um canal do fim da fileira
// (/marketing?v=whatsapp a 1280px, o F5, o link mandado por mensagem, a
// recarga da GuardaDeRota) derrubava a página com "Maximum update depth
// exceeded". O efeito sem dependências chamava setLados a cada desenho, com
// uma função que montava um objeto novo; a medida da carga dos dados ficava
// pendente numa faixa de prioridade mais baixa, e cada desenho síncrono
// reaplicava a função sobre o estado antigo, ganhava outro objeto e pedia
// outro desenho. O clique no chip não quebrava, e por isso a prévia clicando
// passou.
//
// O teste de verdade é montar a página com ?v=<último canal>, e isso pede um
// DOM que a suíte não tem (sem jsdom nas dependências). Aqui fica a leitura do
// texto, como o recarga-de-versao.test.mjs faz com o App.jsx: barato, e pega
// a volta do desenho que quebrou.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fileira = await readFile(new URL('../src/components/marketing/Fileira.jsx', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/components/marketing/marketing.css', import.meta.url), 'utf8');
// O código sem os comentários: eles contam a história do defeito com o
// próprio trecho que quebrava. A Fileira não tem "//" dentro de texto.
const codigo = fileira.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// O texto entre o "(" da chamada e o ")" que fecha ela. Os efeitos da
// Fileira não têm parêntese dentro de texto, então contar basta.
function argumentos(fonte, inicio) {
  const abre = fonte.indexOf('(', inicio);
  let nivel = 0;
  for (let i = abre; i < fonte.length; i += 1) {
    if (fonte[i] === '(') nivel += 1;
    else if (fonte[i] === ')') {
      nivel -= 1;
      if (nivel === 0) return fonte.slice(abre + 1, i);
    }
  }
  throw new Error('parêntese sem par');
}

test('fileira: nenhum efeito de layout roda a cada desenho (todos com lista de dependências)', () => {
  const chamadas = [...codigo.matchAll(/useLayoutEffect\(/g)].map((m) => argumentos(codigo, m.index));
  assert.ok(chamadas.length >= 1, 'esperava o efeito de layout do chip escolhido');
  for (const args of chamadas) assert.match(args, /\},\s*\[[^\]]*\]\s*$/, `efeito de layout sem dependências:\n${args.slice(0, 120)}`);
});

test('fileira: o estado das setas só muda quando o valor muda, e nunca por função que monta objeto', () => {
  // A função no setLados era o que fechava o laço: reaplicada sobre o estado
  // antigo, devolvia um objeto novo a cada desenho.
  assert.doesNotMatch(codigo, /setLados\(\s*\(/);
  // A comparação é com o último par guardado, antes de chamar o React.
  assert.match(codigo, /if \(antes\.esq === esq && antes\.dir === dir\) return;/);
});

test('fileira: a largura da seta é uma só (scroll-padding, esmaecido e o chip escolhido)', () => {
  // Com a máscara indo até 56px e o chip posto a 44px, o começo do chip aceso
  // ficava lavado. O CSS guarda o número; o Fileira.jsx lê o scroll-padding.
  assert.match(css, /--mkt-seta:\s*44px;/);
  assert.match(css, /scroll-padding-inline:\s*var\(--mkt-seta\);/);
  const mascaras = css.match(/mask-image:[^;]+;/g) || [];
  assert.ok(mascaras.length >= 6, `esperava as 6 máscaras (com e sem -webkit-), achei ${mascaras.length}`);
  for (const m of mascaras) {
    assert.match(m, /var\(--mkt-seta\)/);
    assert.doesNotMatch(m, /\d+px/, `máscara com número escrito à mão: ${m}`);
  }
  assert.match(codigo, /scrollPaddingLeft/);
});
