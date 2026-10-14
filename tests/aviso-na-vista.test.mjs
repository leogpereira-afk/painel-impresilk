// Aviso de erro novo dentro da JanelaFormulario: qual elemento a janela leva à vista.
// Nós de DOM simulados; o comportamento real (rolagem no celular) é conferido na prévia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avisoNovo } from '../src/lib/aviso-na-vista.js';

const no = (role, texto, filhos = []) => {
  const el = { nodeType: 1, role, textContent: texto, filhos, parentElement: null };
  el.matches = sel => sel === '[role="alert"]' && el.role === 'alert';
  el.closest = sel => { let x = el; while (x) { if (x.matches(sel)) return x; x = x.parentElement; } return null; };
  el.querySelector = sel => { for (const f of el.filhos) { if (f.matches?.(sel)) return f; const d = f.querySelector?.(sel); if (d) return d; } return null; };
  for (const f of filhos) f.parentElement = el;
  return el;
};

test('aviso de erro que aparece depois de Salvar é o escolhido', () => {
  const alerta = no('alert', 'Este bem está baixado e não pode ser ligado.');
  const bloco = no('', '', [alerta]);
  assert.equal(avisoNovo([{ type: 'childList', target: no('', ''), addedNodes: [bloco] }]), alerta);
  assert.equal(avisoNovo([{ type: 'childList', target: no('', ''), addedNodes: [alerta] }]), alerta);
});

test('texto novo num aviso que já estava na janela também conta', () => {
  const alerta = no('alert', 'Outra alteração foi salva. Recarregue antes de salvar.');
  const texto = { nodeType: 3, parentElement: alerta };
  assert.equal(avisoNovo([{ type: 'characterData', target: texto, addedNodes: [] }]), alerta);
});

test('mensagem de sucesso, aviso vazio e nós de texto soltos não fazem a janela rolar', () => {
  const status = no('status', 'Ficha física salva.');
  assert.equal(avisoNovo([{ type: 'childList', target: no('', ''), addedNodes: [status] }]), null);
  assert.equal(avisoNovo([{ type: 'childList', target: no('', ''), addedNodes: [no('alert', '   ')] }]), null);
  assert.equal(avisoNovo([{ type: 'childList', target: no('', ''), addedNodes: [{ nodeType: 3 }] }]), null);
  assert.equal(avisoNovo([]), null);
  assert.equal(avisoNovo(undefined), null);
});

test('a JanelaFormulario observa a própria janela e só rola o aviso que está fora da vista', () => {
  const fonte = readFileSync(new URL('../src/components/JanelaFormulario.jsx', import.meta.url), 'utf8');
  assert.match(fonte, /import \{avisoNovo\} from '\.\.\/lib\/aviso-na-vista\.js'/);
  assert.match(fonte, /new MutationObserver\(/);
  assert.match(fonte, /obs\.observe\(el,\{childList:true,subtree:true,characterData:true\}\)/);
  assert.match(fonte, /r\.top<0\|\|r\.bottom>window\.innerHeight/, 'aviso já à vista não mexe na rolagem');
  assert.match(fonte, /return \(\)=>obs\.disconnect\(\)/);
});
