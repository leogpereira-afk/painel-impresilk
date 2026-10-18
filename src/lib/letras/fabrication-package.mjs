import { fabricationHTML } from './fabrication.mjs';
import { buildLetterCutPlan, letterCutSheetSVG, CUT_MACHINE_NAMES, CUT_MATERIAL_NAMES } from './cut-plan.mjs';
import { escapeHTML } from '../acm/documents.mjs';
const esc = value => escapeHTML(String(value ?? ''));
export function fabricationPackageHTML(project, result, options = {}) {
  const route = fabricationHTML(project, result, options);
  if (options.stepId) return route;
  const plan = buildLetterCutPlan(project, result, options);
  if (plan.errors.length) throw Error(plan.errors.join(' '));
  const sheets = plan.sheets.map(sheet => `<section class="sheet"><h2>Plano ${esc(sheet.id)} · ${esc(CUT_MATERIAL_NAMES[sheet.material.core] || sheet.material.core)} · ${esc(sheet.material.thickness)} mm</h2><p>${esc(CUT_MACHINE_NAMES[sheet.operation])} · ${esc(sheet.width)} × ${esc(sheet.length)} mm · ${sheet.parts.length} peças. ${sheet.status === 'nominal' ? 'Contém faixas nominais com desenvolvimento pendente.' : 'Dimensões informadas, sujeitas à conferência de oficina.'}</p>${letterCutSheetSVG(project, result, sheet.id, options)}<table><thead><tr><th>Peça</th><th>ID</th><th>Componente</th><th>Dimensões mm</th><th>Giro</th></tr></thead><tbody>${sheet.parts.map(part => `<tr><td>${part.number}</td><td>${esc(part.id)}</td><td>${esc(part.label)}</td><td>${esc(part.width.toFixed(2))} × ${esc(part.height.toFixed(2))}</td><td>${part.placement.rotated ? '90°' : '0°'}</td></tr>`).join('')}</tbody></table></section>`).join('');
  const appendix = `<section class="sheet"><h2>Plano de corte por material e processo</h2><p>Projeto ${esc(project.id)} · R${project.revision} · gerado em ${esc(new Date(options.generatedAt || Date.now()).toISOString())}</p><p>${esc(plan.limit)}</p><p>${plan.totals.sheets} chapas / retalhos · ${plan.totals.placed} peças alocadas · ${plan.totals.unplaced} sem espaço. Azul: contornos. Laranja: envelopes. Verde: referência de emenda/aba. Anotações não são corte. Impressão ajustada à página não mantém escala 1:1.</p>${plan.unplaced.length ? `<h3>Peças não alocadas</h3><ul>${plan.unplaced.map(item => `<li>${esc(item.pieceId)} · ${esc(item.reason)}</li>`).join('')}</ul>` : ''}${plan.linearStock.length ? `<h3>Perfis lineares fora das chapas</h3><ul>${plan.linearStock.map(item => `<li>${esc(item.id)} · ${esc(item.width)} × ${esc(item.height)} mm</li>`).join('')}</ul>` : ''}</section>${sheets}`;
  return route.replace('</body>', `${appendix}</body>`);
}
