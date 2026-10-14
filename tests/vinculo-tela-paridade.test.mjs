// As tabelas do vínculo existem em dois lugares: no servidor
// (supabase/functions/_shared/patrimonio-vinculo.mjs) e na tela
// (src/lib/calc/vinculo-patrimonio.js). Este teste compara as duas sobre a mesma
// lista fictícia. Enquanto o arquivo do servidor não existir (cada frente roda
// sozinha), o teste fica ignorado; depois da junção ele precisa passar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as tela from '../src/lib/calc/vinculo-patrimonio.js';
import { CATEGORIAS_ESTRUTURA } from '../src/lib/calc/estrutura-patrimonio.js';
import { CATEGORIAS_COMPUTADOR } from '../src/lib/calc/informatica-patrimonio.js';
import { CATEGORIAS_SEGURANCA } from '../src/lib/calc/seguranca-patrimonio.js';

const SERVIDOR = new URL('../supabase/functions/_shared/patrimonio-vinculo.mjs', import.meta.url);
const NOMES = ['familiaVinculo', 'fichaAceitaBem', 'fichaBaixada', 'moduloDoVinculo', 'ROTULO_FAMILIA_VINCULO', 'ROTULO_MODULO_VINCULO'];

// Todas as categorias conhecidas (patrimonio-fisico.mjs, Estrutura, carro e
// máquina), mais tipos de fora e situações baixada e em uso.
const CATEGORIAS = {
  veiculo: ['', 'Utilitário'], maquina: ['', 'Impressão'],
  informatica: ['Telefone', 'Central telefônica', 'Celular', ...CATEGORIAS_COMPUTADOR, 'Rede'],
  seguranca: [...CATEGORIAS_SEGURANCA, 'Câmeras / CFTV', 'Portão / automatizador'],
  predial: ['Extintor', 'AVCB', 'Iluminação de emergência', 'Sinalização de segurança', 'Padrão de energia', 'Transformador', 'Usina fotovoltaica', ...CATEGORIAS_ESTRUTURA],
  documento: ['Certidão'], licitacao: [''], marketing: ['Manual'], '': [''],
};
const FICHAS = Object.entries(CATEGORIAS).flatMap(([tipo, categorias]) => [...new Set(categorias)].flatMap(categoria =>
  ['uso', 'baixado', undefined].map(situacao => ({ id: `${tipo}-${categoria}-${situacao}`, tipo, categoria, especificacao: situacao ? { situacao } : {} }))));

test('tabelas do vínculo iguais no servidor e na tela', { skip: !existsSync(SERVIDOR) && 'aguardando _shared/patrimonio-vinculo.mjs da frente do servidor' }, async () => {
  const servidor = await import(SERVIDOR.href);
  for (const nome of NOMES) assert.ok(nome in servidor, `${nome} falta no servidor`);
  assert.deepEqual(servidor.ROTULO_FAMILIA_VINCULO, tela.ROTULO_FAMILIA_VINCULO);
  assert.deepEqual(servidor.ROTULO_MODULO_VINCULO, tela.ROTULO_MODULO_VINCULO);
  for (const ficha of FICHAS) for (const nome of ['familiaVinculo', 'fichaAceitaBem', 'fichaBaixada', 'moduloDoVinculo'])
    assert.deepEqual(servidor[nome](ficha), tela[nome](ficha), `${nome}(${ficha.id})`);
});

test('a lista fictícia cobre as seis famílias, o AVCB e os tipos de fora', () => {
  const familias = new Set(FICHAS.map(tela.familiaVinculo));
  for (const familia of [...Object.keys(tela.ROTULO_FAMILIA_VINCULO), null]) assert.ok(familias.has(familia), String(familia));
  assert.ok(FICHAS.some(f => f.categoria === 'AVCB' && !tela.fichaAceitaBem(f)));
  assert.ok(FICHAS.some(tela.fichaBaixada));
});
