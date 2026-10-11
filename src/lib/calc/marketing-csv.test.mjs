// Importação de publicações por CSV (marketing-csv.js). Começa pelo caso
// ruim: o que gravaria um número errado calado, ou derrubaria o lote inteiro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerCsvPublicacoes, lerInteiro, lerData, textoDoArquivo, normalizarNome, LIMITE_LINHAS_CSV } from './marketing-csv.js';

const IG = '11111111-1111-4111-8111-111111111111';
const GMN = '22222222-2222-4222-8222-222222222222';
const LI = '33333333-3333-4333-8333-333333333333';
const canais = [
  { id: IG, codigo: 'instagram', nome: 'Instagram' },
  { id: GMN, codigo: 'google', nome: 'Google Meu Negócio' },
  { id: LI, codigo: 'linkedin', nome: 'LinkedIn' },
];
const CAB = 'canal;data;titulo;link;alcance;impressoes;engajamento;cliques;leads';
const ler = (corpo, op) => lerCsvPublicacoes(`${CAB}\n${corpo}`, canais, op);

/* ------------------------------------------------------------ casos ruins */

test('O CASO RUIM: célula vazia é "não informado" (null), nunca zero', () => {
  const r = ler('instagram;12/10/2026;Post;;;;;;');
  assert.deepEqual(r.erros, []);
  const l = r.linhas[0];
  for (const campo of ['alcance', 'impressoes', 'engajamento', 'cliques', 'leads']) assert.equal(l[campo], null, campo);
  assert.equal(l.url, null);
  // "-" da exportação também é não informado; "0" escrito é zero.
  const r2 = ler('instagram;12/10/2026;Post;;-;0; ;\u2013;\u2014');
  assert.deepEqual(r2.erros, []);
  assert.deepEqual(
    ['alcance', 'impressoes', 'engajamento', 'cliques', 'leads'].map((c) => r2.linhas[0][c]),
    [null, 0, null, null, null]
  );
});

test('O CASO RUIM: título com ";" SEM aspas empurra as colunas: a linha é recusada, não ajeitada', () => {
  const r = ler('instagram;12/10/2026;Promo; 20% off;https://instagram.com/p/a;100;200;30;4;1');
  assert.equal(r.linhas.length, 0);
  assert.equal(r.erros[0].linha, 2);
  assert.match(r.erros[0].motivo, /10 colunas.*9.*sem aspas/);
});

test('O CASO RUIM: título com ";" e com quebra de linha ENTRE aspas é texto, e a linha seguinte guarda o número certo', () => {
  const r = ler('instagram;12/10/2026;"Promo; 20% off\nsó hoje";https://instagram.com/p/a;1.234;2.000;30;4;1\nlinkedin;13/10/2026;Artigo;;10;;;;');
  assert.deepEqual(r.erros, []);
  assert.equal(r.linhas[0].titulo, 'Promo; 20% off só hoje');
  assert.equal(r.linhas[0].alcance, 1234);
  // A segunda linha de dados começa na linha 4 do arquivo (o título ocupou duas).
  assert.equal(r.linhas[1].linha, 4);
  assert.equal(r.linhas[1].canalId, LI);
});

test('O CASO RUIM: "1,234" é ambíguo e é recusado com o motivo, em vez de adivinhado', () => {
  const r = lerCsvPublicacoes('canal,data,alcance\ninstagram,12/10/2026,"1,234"', canais);
  assert.equal(r.linhas.length, 0);
  assert.match(r.erros[0].motivo, /Alcance.*ambíguo/);
});

test('O CASO RUIM: o mesmo link duas vezes no arquivo (o lote inteiro cairia no banco)', () => {
  const r = ler(
    'instagram;12/10/2026;A;https://instagram.com/p/x;1;;;;\n' +
      'instagram;13/10/2026;B;https://instagram.com/p/x;2;;;;\n' +
      'linkedin;13/10/2026;C;https://instagram.com/p/x;3;;;;'
  );
  assert.equal(r.linhas.length, 2); // em outro canal, o mesmo link pode
  assert.deepEqual(r.erros, [{ linha: 3, motivo: 'Link repetido no arquivo (já está na linha 2).' }]);
});

test('O CASO RUIM: BOM do Excel grudado no "canal" não some com a coluna', () => {
  const r = lerCsvPublicacoes(`\uFEFF${CAB}\r\ninstagram;12/10/2026;Post;;10;;;;\r\n`, canais);
  assert.deepEqual(r.erros, []);
  assert.equal(r.linhas[0].canalId, IG);
});

test('O CASO RUIM: arquivo em Windows-1252 é lido com acento, e texto estragado é recusado', () => {
  // "Impressões" e "Negócio" em Windows-1252: õ = 0xF5, ó = 0xF3.
  const texto = 'canal;data;Impress\xf5es\nGoogle Meu Neg\xf3cio;12/10/2026;5';
  const bytes = Uint8Array.from([...texto].map((c) => c.charCodeAt(0)));
  const lido = textoDoArquivo(bytes);
  assert.equal(lido.split('\n')[0], 'canal;data;Impressões');
  const r = lerCsvPublicacoes(lido, canais);
  assert.deepEqual(r.erros, []);
  assert.equal(r.linhas[0].canalId, GMN);
  assert.equal(r.linhas[0].impressoes, 5);
  // Se o arquivo já chegou com o sinal de troca (U+FFFD), não grava lixo.
  const ruim = lerCsvPublicacoes('canal;data;titulo\ninstagram;12/10/2026;Promo\uFFFD', canais);
  assert.equal(ruim.linhas.length, 0);
  assert.match(ruim.erros[0].motivo, /UTF-8/);
});

test('textoDoArquivo: UTF-8 com BOM sai limpo', () => {
  const bytes = new TextEncoder().encode('\uFEFFcanal;data\ninstagram;12/10/2026');
  assert.equal(textoDoArquivo(bytes).charCodeAt(0), 'c'.charCodeAt(0));
});

test('O CASO RUIM: data trocada (mês 13) e data no futuro', () => {
  const r = ler('instagram;13/13/2026;A;;;;;;\ninstagram;31/02/2026;B;;;;;;\ninstagram;20/10/2026;C;;;;;;', { hoje: '2026-10-12' });
  assert.equal(r.linhas.length, 0);
  assert.match(r.erros[0].motivo, /Data "13\/13\/2026" inválida/);
  assert.match(r.erros[1].motivo, /Data "31\/02\/2026" inválida/);
  assert.match(r.erros[2].motivo, /futuro.*trocados/);
});

test('O CASO RUIM: aspas que nunca fecham não engolem o arquivo caladas', () => {
  const r = ler('instagram;12/10/2026;Bom;;1;;;;\ninstagram;13/10/2026;"Sem fim;;2;;;;\nlinkedin;14/10/2026;X;;3;;;;');
  assert.equal(r.linhas.length, 1);
  assert.equal(r.erros.at(-1).linha, 3);
  assert.match(r.erros.at(-1).motivo, /Aspas abertas/);
});

test('O CASO RUIM: canal desconhecido ou nome repetido não é adivinhado', () => {
  const repetidos = [...canais, { id: '44444444-4444-4444-8444-444444444444', codigo: 'insta2', nome: 'instagram ' }];
  const r = lerCsvPublicacoes(`${CAB}\nTikTok;12/10/2026;A;;;;;;\nInstagram;12/10/2026;B;;;;;;\ninsta2;12/10/2026;C;;;;;;`, repetidos);
  assert.match(r.erros[0].motivo, /canal "TikTok" não existe/);
  // "Instagram" é código de um e nome de dois: o código, que é único, decide.
  assert.equal(r.linhas[0].canalId, IG);
  assert.equal(r.linhas[1].canalId, '44444444-4444-4444-8444-444444444444');
  const soNome = lerCsvPublicacoes('canal;data\nmesmo nome;12/10/2026', [
    { id: 'a', codigo: 'um', nome: 'Mesmo Nome' },
    { id: 'b', codigo: 'dois', nome: 'mesmo nome' },
  ]);
  assert.match(soNome.erros[0].motivo, /mais de um canal/);
});

test('O CASO RUIM: canal de quem importa só vale se for um canal conhecido', () => {
  const r = lerCsvPublicacoes('data;titulo\n12/10/2026;A', canais, { canalId: 'id-que-nao-existe' });
  assert.equal(r.linhas.length, 0);
  assert.match(r.erros[0].motivo, /Falta a coluna "canal"/);
});

/* ------------------------------------------------------------ o que entra */

test('separador "," (Google Planilhas) e cabeçalho com acento e caixa', () => {
  const r = lerCsvPublicacoes(
    'Canal,Data,Título,Link,Alcance,Impressões,Engajamento,Cliques,Leads\n' +
      'google meu negocio,2026-10-12,"Foto, fachada",https://g.page/x,"1.500",,12,3,1',
    canais
  );
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.linhas[0], {
    linha: 2,
    canalId: GMN,
    data: '2026-10-12',
    titulo: 'Foto, fachada',
    url: 'https://g.page/x',
    alcance: 1500,
    impressoes: null,
    engajamento: 12,
    cliques: 3,
    leads: 1,
  });
});

test('canal pelo código ou pelo nome sem acento; canal da tela vale para célula vazia e para arquivo sem a coluna', () => {
  const r = ler('LINKEDIN;12/10/2026;A;;;;;;\n  Google Meu Negócio ;12/10/2026;B;;;;;;\n;12/10/2026;C;;;;;;', { canalId: IG });
  assert.deepEqual(r.linhas.map((l) => l.canalId), [LI, GMN, IG]);
  const semColuna = lerCsvPublicacoes('data;titulo;alcance\n12/10/2026;Post;10', canais, { canalId: IG });
  assert.deepEqual(semColuna.erros, []);
  assert.equal(semColuna.linhas[0].canalId, IG);
  // Sem a coluna e sem canal da tela: não há a quem atribuir.
  assert.match(lerCsvPublicacoes('data;titulo\n12/10/2026;A', canais).erros[0].motivo, /Falta a coluna "canal"/);
  // Célula vazia sem canal da tela.
  assert.match(ler(';12/10/2026;A;;;;;;').erros[0].motivo, /Falta o canal/);
});

test('linhas em branco no meio e no fim são puladas; a numeração continua a do arquivo', () => {
  const r = lerCsvPublicacoes(`${CAB}\n\ninstagram;12/10/2026;A;;;;;;\n;;;;;;;;\n\ninstagram;13/10/2026;B;;;;;;\n\n`, canais);
  assert.deepEqual(r.erros, []);
  assert.deepEqual(r.linhas.map((l) => l.linha), [3, 6]);
});

test('vários problemas na mesma linha saem juntos, e as linhas boas entram', () => {
  const r = ler('instagram;12/10/2026;Boa;https://instagram.com/p/1;10;;;;\nninguem;;Ruim;ftp://x;abc;-5;1,5;;');
  assert.equal(r.linhas.length, 1);
  const m = r.erros[0].motivo;
  assert.match(m, /canal "ninguem" não existe/);
  assert.match(m, /Falta a data/);
  assert.match(m, /http:\/\/ ou https:\/\//);
  assert.match(m, /Alcance: "abc" não é número/);
  assert.match(m, /Impressões: "-5" é negativo/);
  assert.match(m, /Engajamento: "1,5" não é número inteiro/);
});

test('cabeçalho: coluna repetida e coluna "data" faltando param tudo; coluna desconhecida é listada', () => {
  assert.match(lerCsvPublicacoes('canal;data;data\ninstagram;12/10/2026;12/10/2026', canais).erros[0].motivo, /"Data" aparece duas vezes/);
  assert.match(lerCsvPublicacoes('canal;titulo\ninstagram;A', canais).erros[0].motivo, /Falta a coluna "data"/);
  const r = lerCsvPublicacoes('canal;data;Taxa de engajamento\ninstagram;12/10/2026;3,5%', canais);
  assert.deepEqual(r.ignoradas, ['Taxa de engajamento']);
  assert.equal(r.linhas.length, 1);
});

test('arquivo vazio, só cabeçalho e acima do limite', () => {
  assert.match(lerCsvPublicacoes('', canais).erros[0].motivo, /vazio/);
  assert.match(lerCsvPublicacoes(' \n \n', canais).erros[0].motivo, /vazio/);
  assert.deepEqual(lerCsvPublicacoes(CAB, canais), { linhas: [], erros: [], ignoradas: [] });
  const muitas = Array.from({ length: 3 }, (_, i) => `instagram;1${i}/10/2026;P${i};;;;;;`).join('\n');
  const r = ler(muitas, { limite: 2 });
  assert.equal(r.linhas.length, 0);
  assert.match(r.erros[0].motivo, /3 linhas e o limite é 2/);
  assert.equal(LIMITE_LINHAS_CSV, 2000);
});

test('título longo é cortado em 200 sem partir emoji; link longo é recusado', () => {
  const longo = `${'a'.repeat(198)}😀😀`;
  const r = ler(`instagram;12/10/2026;${longo};;;;;;`);
  assert.ok(r.linhas[0].titulo.length <= 200);
  assert.ok(r.linhas[0].titulo.endsWith('…'));
  assert.doesNotMatch(r.linhas[0].titulo, /[\ud800-\udbff](?![\udc00-\udfff])/); // sem metade de emoji
  const link = `https://instagram.com/${'x'.repeat(500)}`;
  assert.match(ler(`instagram;12/10/2026;A;${link};;;;;`).erros[0].motivo, /passou de 500/);
});

/* ------------------------------------------------------------ peças */

test('lerInteiro: o jeito brasileiro de escrever número', () => {
  assert.deepEqual(lerInteiro('1.234'), { valor: 1234 });
  assert.deepEqual(lerInteiro('1.234.567'), { valor: 1234567 });
  assert.deepEqual(lerInteiro('12,0'), { valor: 12 });
  assert.deepEqual(lerInteiro('1.234,00'), { valor: 1234 });
  assert.deepEqual(lerInteiro(' 1 234 '), { valor: 1234 });
  assert.deepEqual(lerInteiro('0'), { valor: 0 });
  assert.deepEqual(lerInteiro(''), { valor: null });
  assert.deepEqual(lerInteiro(undefined), { valor: null });
  assert.ok(lerInteiro('1.5').erro);
  assert.ok(lerInteiro('12.34').erro);
  assert.ok(lerInteiro('3,5%').erro);
  assert.ok(lerInteiro('2.000.000.000').erro); // passa de 1 bilhão
});

test('lerData: dd/mm/aaaa (com hora), aaaa-mm-dd e timestamp', () => {
  assert.equal(lerData('12/10/2026'), '2026-10-12');
  assert.equal(lerData('1/2/2026'), '2026-02-01');
  assert.equal(lerData('12/10/2026 14:30'), '2026-10-12');
  assert.equal(lerData('2026-10-12'), '2026-10-12');
  assert.equal(lerData('2026-10-12 23:30:00'), '2026-10-12'); // sem fuso: vale o dia escrito
  assert.equal(lerData('2026-10-12T12:00:00Z'), '2026-10-12');
  assert.equal(lerData('12/10/26'), null);
  assert.equal(lerData('10/12'), null);
  assert.equal(lerData('29/02/2027'), null);
});

test('normalizarNome: acento, caixa e espaços', () => {
  assert.equal(normalizarNome('  Google  Meu NEGÓCIO '), 'google meu negocio');
  assert.equal(normalizarNome(null), '');
});

test('o caso ruim: caractere nulo no título sai na prévia (o banco recusaria o arquivo inteiro)', () => {
  const r = ler('instagram;12/10/2026;Ru\u0000im;;10;;;;');
  assert.equal(r.erros.length, 0);
  assert.equal(r.linhas[0].titulo, 'Ruim');
});
