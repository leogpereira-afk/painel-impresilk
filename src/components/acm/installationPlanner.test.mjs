import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from '../../lib/acm/model.mjs';
import { createInstallation } from '../../lib/acm/installation.mjs';

// Exercise the real JSX through React SSR, with the same React instance for hooks.
const require = createRequire(import.meta.url);
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('./InstallationPlanner.jsx', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'node', jsx: 'automatic', loader: { '.css': 'empty' },
  plugins: [{ name: 'one-react-runtime', setup(builder) { builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: pathToFileURL(require.resolve(args.path)).href, external: true })); } }],
});
const temp = await mkdtemp(join(tmpdir(), 'acm-installation-ui-'));
let InstallationPlanner;
try { const path = join(temp, 'planner.mjs'); await writeFile(path, bundled.outputFiles[0].text); ({ default: InstallationPlanner } = await import(pathToFileURL(path).href)); } finally { await rm(temp, { recursive: true, force: true }); }
const render = project => renderToStaticMarkup(createElement(InstallationPlanner, { project, update: () => assert.fail('Rendering must not write to project'), orderPicker: createElement('div', null, 'ORDER_PICKER') }));
function configured() {
  const project = createProject(); project.installation = createInstallation();
  project.installation.space = { ...project.installation.space, width: 10000, height: 4000, baseGround: 0 };
  project.installation.plate = { ...project.installation.plate, width: 4000, height: 800 };
  return project;
}

test('installation opens without silently initializing dimensions or writing project data', () => {
  const project = createProject(), before = JSON.stringify(project);
  const html = render(project);
  assert.match(html, /Iniciar planejamento da instalação/);
  assert.match(html, /ORDER_PICKER/);
  assert.equal(JSON.stringify(project), before);
  assert.equal(project.installation, undefined);
});

test('requested 10x4m example presents calculated marks and keeps unknown weight absent', () => {
  const project = configured(), before = JSON.stringify(project);
  const html = render(project);
  assert.match(html, /Topo ao chão/); assert.match(html, /2,4/);
  assert.match(html, /1,6/); assert.match(html, /Recuo esquerdo/);
  assert.match(html, /As medidas da placa diferem da fachada ACM/);
  assert.match(html, /Peso informado da placa/);
  assert.equal(project.installation.plate.weight, null);
  assert.equal(JSON.stringify(project), before);
});

test('displaying metres and centimetres changes labels and field values, not stored measurements', () => {
  const project = configured(), before = structuredClone(project.installation.space);
  const metres = render(project);
  assert.match(metres, /value="10"/); assert.match(metres, /value="0\.8"/);
  project.installation.displayUnit = 'cm';
  const centimetres = render(project);
  assert.match(centimetres, /value="1000"/); assert.match(centimetres, /value="80"/);
  assert.deepEqual(project.installation.space, before);
  assert.equal(project.installation.plate.width, 4000); assert.equal(project.installation.plate.height, 800);
});

test('partially imported installation remains editable without assuming a zero ground reference', () => {
  const project = createProject(); project.installation = { version: 1, space: { width: 10000, height: 4000 }, plate: { width: 4000, height: 800 } };
  const before = JSON.stringify(project);
  const html = render(project);
  assert.match(html, /Aguardando medidas/);
  assert.match(html, /Base do espaço ao chão/);
  assert.equal(JSON.stringify(project), before);
});

test('equipment and tape details appear as entered data, with no recommended access size', () => {
  const project = configured();
  project.installation.equipment = [{ id: 'e', type: 'platform', characteristics: 'Modelo informado', availability: 'available', quantity: 1, unit: 'un', purpose: 'Posicionamento', notes: '' }];
  project.installation.materials = [{ id: 't', category: 'tape', product: '<script>não executar</script>', quantity: 1, width: 19, length: 10000, unit: 'rolo', position: 'Verso', purpose: 'Fixação', preparation: '', cure: '', notes: '' }];
  const html = render(project);
  assert.match(html, /Largura da fita/); assert.match(html, /Comprimento da fita/);
  assert.match(html, /&lt;script&gt;não executar&lt;\/script&gt;/);
  assert.ok(!html.includes('<script>não executar</script>'));
  assert.match(html, /não determina um tamanho seguro/);
});

test('partial import without position mode does not imply centered margins in the UI', () => {
  const project = createProject();
  project.installation = { version: 1, space: { width: 10000, height: 4000, baseGround: 0 }, plate: { width: 4000, height: 800 } };
  const before = JSON.stringify(project), html = render(project);
  assert.match(html, /ainda não informa o modo/);
  assert.match(html, /Escolha posição centralizada ou manual/);
  assert.doesNotMatch(html, /class="acmi-draggable"/);
  assert.equal(JSON.stringify(project), before);
});
