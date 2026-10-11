// O CARTÃO COMPACTO de Bancos e Pix (src/pages/Bancos.jsx + bancos.css).
//
// 11/10/2026: o Léo olhou o cartão a 1000 px e disse "se isso é o card
// compactado eu não vi nada, está grande e cheio de espaço desperdiçado". O
// cartão caiu de 460 para 256 px (com Pix) e de 299 para 178 (sem Pix). A
// compactação tenta exatamente as quatro coisas que a casa proíbe, e por isso
// elas ficam guardadas aqui:
//   1. alvo de toque abaixo de 40 px (o desenho encolheu para 22, 28 e 32 px;
//      o toque continua 40 pelo .alvo-40, MAS só se o vão até o vizinho
//      deixar: alvo que cobre o do lado rouba o toque);
//   2. número cortado com reticências (CNPJ, agência, conta, chave Pix);
//   3. ação que some do cartão;
//   4. cor nova sem par no tema escuro.
//
// A suíte não tem DOM (sem jsdom), então a leitura é do texto, como o
// marketing-fileira.test.mjs faz. A conferência de verdade, com régua, foi na
// prévia (375, 768, 1280 e 1440, claro e escuro). Cada guarda começa pelo
// caso ruim: guarda que nunca dispara não prova nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const jsx = await readFile(new URL('../src/pages/Bancos.jsx', import.meta.url), 'utf8');
const cssBruto = await readFile(new URL('../src/pages/bancos.css', import.meta.url), 'utf8');
const css = cssBruto.replace(/\/\*[\s\S]*?\*\//g, '');

/* As regras do CSS na ordem do arquivo: {seletor normalizado: declarações}.
   Fica a PRIMEIRA ocorrência de cada seletor, que é a do topo do arquivo; as
   de @media e @container vêm depois e não substituem. */
function regras(texto) {
  const mapa = new Map();
  for (const m of texto.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    if (mapa.has(sel)) continue;
    const decl = {};
    for (const par of m[2].split(';')) {
      const i = par.indexOf(':');
      if (i > 0) decl[par.slice(0, i).trim()] = par.slice(i + 1).trim();
    }
    mapa.set(sel, decl);
  }
  return mapa;
}
const R = regras(css);
const regra = (sel) => {
  const r = R.get(sel);
  assert.ok(r, `regra ${sel} não encontrada em bancos.css`);
  return r;
};
const px = (v) => {
  const n = parseFloat(String(v));
  assert.ok(Number.isFinite(n), `valor sem número: ${v}`);
  return n;
};
// "12px 2px" -> 12 (o primeiro valor: linha no gap, topo na margem).
const primeiro = (v) => px(String(v).split(/\s+/)[0]);

/* O ALVO ESTICADO PELO .alvo-40 (src/index.css) é centrado no desenho:
   cresce (40 - desenho) / 2 para cada lado. Dois alvos não se cobrem quando
   o vão entre os desenhos é pelo menos a soma do que cada um cresce. */
const cresce = (desenho) => Math.max(0, (40 - desenho) / 2);
const vaoBasta = (vao, desenhoA, desenhoB) => vao >= cresce(desenhoA) + cresce(desenhoB) - 0.01;

test('O CASO RUIM: a régua acusa alvo que cobre o vizinho e número com reticências', () => {
  // Duas linhas de 28 px coladas: cada alvo cresce 6 px e eles se cobrem em 12.
  assert.equal(vaoBasta(0, 28, 28), false);
  assert.equal(vaoBasta(12, 28, 28), true);
  // Chip de 22 px sobre célula de 40: o chip cresce 9 px, a célula nada.
  assert.equal(vaoBasta(8, 22, 40), false);
  assert.equal(vaoBasta(9, 22, 40), true);
  // O leitor de regras acha a reticência quando ela está lá.
  const ruim = regras('.x .bk-valor { overflow: hidden; text-overflow: ellipsis; }');
  assert.equal(ruim.get('.x .bk-valor')['text-overflow'], 'ellipsis');
});

test('alvos de 40 px: o que desenha menos usa .alvo-40 e tem vão para crescer sem cobrir o vizinho', () => {
  // Lápis e lixeira: 32 px de desenho, lado a lado.
  const mini = regra('.bk-icone.mini');
  assert.ok(px(mini.width) < 40 && px(mini.height) < 40, 'o lápis encolheu; se voltou a 40, este teste pode ser revisto');
  assert.match(jsx, /className="bk-icone mini alvo-40"[^>]*aria-label=\{`Editar/);
  assert.match(jsx, /className="bk-icone mini perigo alvo-40"[^>]*aria-label=\{`Remover/);
  assert.ok(vaoBasta(px(regra('.bk-conta-acoes').gap), px(mini.width), px(mini.width)), 'lápis e lixeira se cobrem');

  // Chip do número (e "confirmar", "Sem número"): desce sobre a linha dos dados.
  const chip = px(regra('.bk-chip').height);
  const chips = [...jsx.matchAll(/className=\{?[`"]bk-chip[^`"]*[`"]/g)].map((m) => m[0]);
  assert.equal(chips.length, 3, `esperava os 3 chips (número, confirmar, sem número): ${chips}`);
  for (const c of chips) assert.match(c, /alvo-40/, `chip sem alvo de 40: ${c}`);
  const celula = px(regra('.bk-dado')['min-height']);
  assert.ok(celula >= 40, 'a célula do dado é o próprio alvo e precisa de 40 px');
  assert.ok(vaoBasta(primeiro(regra('.bk-dados').margin), chip, celula), 'o alvo do chip cobre a célula de baixo');

  // As ações secundárias do Pix: 28 px de desenho, numa linha que pode quebrar.
  const acao = px(regra('.bk-quieto, .bk-junto').height);
  assert.match(jsx, /className="bk-quieto alvo-40"[\s\S]{0,400}Copia e cola/);
  assert.match(jsx, /className="bk-quieto alvo-40"[\s\S]{0,400}Chave no Whats/);
  assert.match(jsx, /className="bk-junto alvo-40"/);
  const extras = regra('.bk-pix-extras');
  const chave = px(regra('.bk-pix-chave')['min-height']);
  assert.ok(chave >= 40, 'a linha da chave é o botão de copiar e precisa de 40 px');
  assert.ok(vaoBasta(px(extras['margin-top']), acao, chave), 'o alvo das ações cobre o botão da chave');
  assert.ok(vaoBasta(primeiro(extras.gap), acao, acao), 'quebrada em duas linhas, uma cobre a outra');
  assert.ok(vaoBasta(px(regra('.bk-cc')['margin-top']), acao, 40), 'o alvo das ações cobre o copia e cola aberto');

  // A ação principal e o copiar tudo continuam com 40 desenhados.
  assert.ok(px(regra('.bk-whats')['min-height']) >= 40);
  const tudo = regra('.bk-tudo');
  assert.ok(px(tudo.width) >= 40 && px(tudo.height) >= 40);
});

test('número nunca sai cortado: CNPJ, agência, conta, chave Pix e número do banco', () => {
  for (const sel of ['.bk-copiavel .bk-valor', '.bk-pix-valor', '.bk-chip strong']) {
    const r = regra(sel);
    assert.notEqual(r['text-overflow'], 'ellipsis', `${sel} com reticências`);
    assert.notEqual(r.overflow, 'hidden', `${sel} escondendo o que não cabe`);
  }
  // O valor que não cabe quebra (a chave aleatória vai para duas linhas)...
  assert.equal(regra('.bk-copiavel .bk-valor')['overflow-wrap'], 'anywhere');
  assert.equal(regra('.bk-pix-valor')['overflow-wrap'], 'anywhere');
  // ...e o número do banco não encolhe: quem cede é o nome oficial ao lado.
  assert.equal(regra('.bk-chip strong')['flex-shrink'], '0');
  // A chave vai inteira no title e no aria-label do botão que copia.
  assert.match(jsx, /title=\{`Copiar a chave Pix \(\$\{tipo\}\) no formato que o app do banco aceita: \$\{paraCopiar\}`\}/);
  assert.match(jsx, /aria-label=\{`Copiar a chave Pix, \$\{tipo\}: \$\{chaveVisivel\}`\}/);
  assert.match(jsx, /title=\{`Copiar \$\{rotulo\}: \$\{valor\}`\}/);
});

test('nenhuma ação nem dado sumiu do cartão (o que saiu do desenho foi para title ou aria-label)', () => {
  const precisa = [
    // cabeçalho
    ['editar', /aria-label=\{`Editar \$\{b\.banco\}`\}/],
    ['remover', /aria-label=\{`Remover \$\{b\.banco\}`\}/],
    ['copiar o número do banco', /onClick=\{\(\) => copiar\(cod\.codigo,/],
    ['nome oficial do banco', /\{cod\.banco && <span>\{cod\.banco\.nome\}<\/span>\}/],
    ['confirmar o número deduzido', /onClick=\{\(\) => confirmarCodigo\(b, cod\.codigo\)\}/],
    ['por que confirmar', /title="Número deduzido pelo nome do banco: ele já vai na mensagem/],
    ['cadastrar o número que falta', /Sem número · cadastrar/],
    ['titular igual à seção, para o leitor de tela', /<span className="sr-only">, de \{b\.titular\}<\/span>/],
    ['titular no title', /title=\{`\$\{b\.banco\} · titular: \$\{b\.titular\}`\}/],
    ['titular diferente da seção, à vista', /className="bk-conta-titular" title=\{b\.titular\}/],
    // dados
    ['documento', /valor=\{b\.doc\}/],
    ['agência', /valor=\{b\.agencia\}/],
    ['conta', /valor=\{b\.conta\}/],
    ['conta sem chave Pix', /Sem chave: por agência e conta/],
    // Pix
    ['copiar a chave', /copiar\(paraCopiar, `\$\{b\.id\}-pix`/],
    ['fala da cópia da chave', /Chave Pix copiada: cole no app do banco\./],
    ['tipo da chave', /className=\{`bk-pix-selo\$\{extra\}`\}/],
    ['tipo da chave na linha das ações (cartão largo)', /seloDoTipo\(" bk-pix-selo-linha"\)/],
    ['aviso de tipo errado', /\{info\.aviso && \(/],
    ['Pix copia e cola', /Copia e cola/],
    ['só a chave no WhatsApp', /Chave no Whats/],
    ['mandar a conta junto', /onChange=\{\(e\) => aoMudarComConta\(e\.target\.checked\)\}/],
    ['nome inteiro da caixinha', /aria-label="com a conta: mandar a conta completa junto com o Pix"/],
    ['copiar o código', /Copiar código/],
    ['só o código no WhatsApp', /Só o código no Whats/],
    // rodapé
    ['mandar dados no WhatsApp', /Mandar dados no WhatsApp/],
    ['copiar a conta inteira', /aria-label="Copiar a conta inteira"/],
  ];
  for (const [nome, re] of precisa) assert.match(jsx, re, `sumiu: ${nome}`);
});

test('cor nova tem par no tema escuro', () => {
  const bloco = (sel) => {
    const m = css.match(new RegExp(`(?:^|\\n)${sel.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`));
    assert.ok(m, `bloco ${sel} não encontrado`);
    return Object.fromEntries([...m[1].matchAll(/(--bk-[\w-]+)\s*:\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]));
  };
  const claro = bloco('.bk-page');
  const escuro = bloco('.dark .bk-page');
  const ehCor = (v) => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(v);
  /* Sem par DE PROPÓSITO: o verde do botão do WhatsApp tem texto branco e é o
     mesmo nos dois temas (o ok-700 foi escolhido por passar de 4,5:1 com o
     branco; clarear no escuro devolveria o 3,3:1 do verde 600). */
  const iguaisNosDois = new Set(['--bk-ok', '--bk-ok-forte']);
  const semPar = (c, e) => Object.keys(c).filter((k) => ehCor(c[k]) && !iguaisNosDois.has(k) && !(k in e));

  // O caso ruim: um token de cor só no claro é pego.
  assert.deepEqual(semPar({ '--bk-novo': '#123456' }, {}), ['--bk-novo']);
  assert.deepEqual(semPar(claro, escuro), []);
  // As duas cores que esta compactação criou estão nos dois temas.
  for (const k of ['--bk-icone-suave', '--bk-marca-anel']) {
    assert.ok(ehCor(claro[k]) && ehCor(escuro[k]), `${k} sem par`);
  }
});

test('sem travessão nem meia-risca no texto da tela', () => {
  const TRAVESSAO = /[–—]/;
  assert.equal(TRAVESSAO.test('mandar — agora'), true); // o caso ruim
  assert.equal(TRAVESSAO.test('Pix copia-e-cola · confirmar'), false);
  assert.equal(TRAVESSAO.test(jsx), false, 'Bancos.jsx tem travessão');
  assert.equal(TRAVESSAO.test(cssBruto), false, 'bancos.css tem travessão');
});

/* ── Segunda revisão (11/10/2026) ──────────────────────────────────────────
   As guardas abaixo vêm dos achados da revisão do cartão compacto: a cópia
   da chave no aviso fixo do rodapé (cobria botões, mentia depois de outra
   cópia, apagava erro e calava o leitor de tela), a chave partida no meio da
   palavra, o ícone de copiar sem contraste, o nome acessível sem o texto à
   vista e o selo com letra de 8 px. */

// O corpo de copiar(), do `const copiar` até o fim da função.
const corpoCopiar = (() => {
  const i = jsx.indexOf('const copiar = async');
  assert.ok(i > 0, 'copiar() não encontrado em Bancos.jsx');
  const fim = jsx.indexOf('\n  };', i);
  return jsx.slice(i, fim);
})();

test('cópia que deu certo sempre fala, e nunca abre o aviso do rodapé', () => {
  // O caso ruim (o que a revisão achou): falar só quando não há aviso.
  const ruim = 'setCopiado(chave);\n    if (avisoVisivel) setAviso({ tom: "ok", texto: avisoVisivel });\n    else falar(`${rotulo} copiado`);';
  const falaSempre = (t) => /setCopiado\(chave\);\s*falar\(/.test(t) && !/setAviso\(\{\s*tom:\s*"ok"/.test(t);
  assert.equal(falaSempre(ruim), false);

  assert.ok(falaSempre(corpoCopiar), 'copiar() precisa chamar falar() logo depois de setCopiado, sem condição, e não abrir aviso ok');
  // O único aviso que copiar() abre é o de erro, quando a cópia falhou.
  const avisos = [...corpoCopiar.matchAll(/setAviso\(([^)]*)\)/g)].map((m) => m[1]);
  assert.equal(avisos.length, 1, `copiar() abre ${avisos.length} avisos`);
  assert.match(avisos[0], /tom:\s*"erro"/);
  // falar() zera a região antes de escrever: a segunda cópia igual também é dita.
  assert.match(jsx, /const falar = \(t\) => \{ setFalado\(""\); requestAnimationFrame\(\(\) => setFalado\(t\)\); \};/);
  assert.match(jsx, /<span className="sr-only" role="status" aria-live="polite">\{falado\}<\/span>/);
});

// pedacosDaChave() roda aqui de verdade: ela é JavaScript puro, sem JSX.
const pedacosDaChave = (() => {
  const m = jsx.match(/function pedacosDaChave\(chave\) \{[\s\S]*?\n\}\n/);
  assert.ok(m, 'pedacosDaChave() não encontrada em Bancos.jsx');
  return new Function(`${m[0]}; return pedacosDaChave;`)();
})();

/* Quebra de linha como o navegador faz com <wbr> e fonte mono: enche a linha
   com pedaços inteiros; o pedaço que sozinho não cabe é partido letra a
   letra (o overflow-wrap:anywhere). `largura` em caracteres. */
function quebrar(pedacos, largura) {
  const linhas = [];
  let atual = '';
  for (let p of pedacos) {
    if ((atual + p).length <= largura) { atual += p; continue; }
    if (atual) linhas.push(atual);
    atual = '';
    while (p.length > largura) { linhas.push(p.slice(0, largura)); p = p.slice(largura); }
    atual = p;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

test('a chave Pix quebra na fronteira de um pedaço, nunca deixa letra sozinha', () => {
  const email = 'financeiro@exemplo.com.br';
  // O caso ruim: sem ponto de quebra, a 24 caracteres sobra o "r" sozinho.
  assert.deepEqual(quebrar([email], 24), ['financeiro@exemplo.com.b', 'r']);

  assert.deepEqual(pedacosDaChave(email), ['financeiro@', 'exemplo', '.com', '.br']);
  assert.deepEqual(pedacosDaChave('123e4567-e12b-12d1-a456-426655440000'), ['123e4567-', 'e12b-', '12d1-', 'a456-', '426655440000']);
  // O "-81" do CNPJ fica junto: quebra só depois da barra.
  assert.deepEqual(pedacosDaChave('11.222.333/0001-81'), ['11.222.333/', '0001-81']);
  assert.deepEqual(pedacosDaChave('111.444.777-35'), ['111.444.777-35']);
  // Nada se perde nem se acrescenta: juntos, os pedaços são a chave.
  for (const k of [email, '123e4567-e12b-12d1-a456-426655440000', '11.222.333/0001-81', '(38) 99999-0000', '']) {
    assert.equal(pedacosDaChave(k).join(''), k);
  }
  // Em toda largura em que o maior pedaço cabe, nenhuma linha tem 1 caractere.
  for (const k of [email, '123e4567-e12b-12d1-a456-426655440000', '11.222.333/0001-81']) {
    const pedacos = pedacosDaChave(k);
    const maior = Math.max(...pedacos.map((p) => p.length));
    for (let largura = maior; largura <= k.length; largura++) {
      const linhas = quebrar(pedacos, largura);
      assert.ok(linhas.every((l) => l.length > 1), `${k} a ${largura}: ${JSON.stringify(linhas)}`);
    }
  }
  // A tela usa os pedaços, com <wbr> entre eles.
  assert.match(jsx, /pedacosDaChave\(chaveVisivel\)\.map\(\(p, i\) => \(\s*<Fragment key=\{i\}>\s*\{p\}\s*<wbr \/>/);
});

test('cartão largo: o selo sai do botão da chave e vira legenda da linha das ações', () => {
  const bloco = (cond) => {
    const i = css.indexOf(`@container bk-conta (${cond})`);
    assert.ok(i >= 0, `@container bk-conta (${cond}) não encontrado`);
    let n = 0;
    for (let j = css.indexOf('{', i); j < css.length; j++) {
      if (css[j] === '{') n++;
      if (css[j] === '}' && --n === 0) return regras(css.slice(css.indexOf('{', i) + 1, j));
    }
    throw new Error('bloco sem fim');
  };
  const largo = bloco('min-width: 440px');
  assert.equal(largo.get('.bk-pix-chave .bk-pix-selo')?.display, 'none');
  assert.equal(largo.get('.bk-pix-selo.bk-pix-selo-linha')?.display, 'inline-flex');
  // Fora do cartão largo, a cópia da linha fica escondida (um selo por vez).
  assert.equal(regra('.bk-pix-selo.bk-pix-selo-linha').display, 'none');
  // O estreito e o largo não se sobrepõem.
  assert.ok(bloco('max-width: 347px').get('.bk-pix-acao span'), 'regra do cartão estreito sumiu');
  assert.ok(440 > 347);
});

test('nome acessível começa pelo texto à vista (Controle por Voz)', () => {
  const pares = [
    ['Copia e cola', /aria-label="([^"]*)"\s*>\s*<QrCode/],
    ['Chave no Whats', /aria-label=\{comConta \? "([^"]*)"/],
    ['Chave no Whats', /aria-label=\{comConta \? "[^"]*" : "([^"]*)"\}/],
    ['com a conta', /onChange=\{\(e\) => aoMudarComConta\(e\.target\.checked\)\}\s*aria-label="([^"]*)"/],
  ];
  // O caso ruim: o nome de antes não continha o texto à vista.
  assert.equal('Mandar só a chave Pix no WhatsApp'.toLowerCase().startsWith('chave no whats'), false);
  for (const [visivel, re] of pares) {
    const m = jsx.match(re);
    assert.ok(m, `aria-label de "${visivel}" não encontrado`);
    assert.ok(m[1].toLowerCase().startsWith(visivel.toLowerCase()), `"${m[1]}" não começa por "${visivel}"`);
  }
});

test('ícone de copiar em repouso com 3:1 no tema claro', () => {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
  const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  assert.ok(contraste('#b4b8cc', '#ffffff') < 3, 'o caso ruim (a cor de antes) devia falhar');
  const icone = css.match(/\.bk-page\s*\{[^}]*--bk-icone-suave:\s*(#[0-9a-f]{6})/i)?.[1];
  assert.ok(icone, '--bk-icone-suave do tema claro não encontrado');
  assert.ok(contraste(icone, '#ffffff') >= 3, `${icone} sobre o branco do cartão: ${contraste(icone, '#ffffff').toFixed(2)}:1`);
  // E o ícone do chip do número usa esse token (ele é a única pista de que copia).
  assert.equal(regra('.bk-chip svg').color, 'var(--bk-icone-suave)');
});

test('selo compacto nunca abaixo de 9 px; titular diferente quebra em vez de cortar; foco sem raio fixo', () => {
  const linha = jsx.match(/const letra = compacto\s*\n\s*\? ([^\n]+)/)?.[1];
  assert.ok(linha, 'tamanhos do selo compacto não encontrados');
  const tamanhos = [...linha.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].map((m) => Number(m[1]));
  assert.ok(tamanhos.length >= 3, `tamanhos: ${tamanhos}`);
  assert.ok(Math.min(...tamanhos) >= 9, `selo compacto com ${Math.min(...tamanhos)} px`);

  const titular = regra('.bk-conta-titular');
  assert.notEqual(titular['text-overflow'], 'ellipsis');
  assert.notEqual(titular['white-space'], 'nowrap');

  const foco = regra('.bk-page :is(button, a, input, select, textarea):focus-visible');
  assert.equal(foco['border-radius'], undefined, 'o raio fixo do foco vence o raio de chip, lápis e chave');
  // Token sem uso não fica no arquivo.
  assert.equal(/--bk-aviso-fio/.test(css), false);
});
