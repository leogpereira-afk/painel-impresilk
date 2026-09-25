import { MISSAO, VISAO, VALORES } from './identidade.js';
import logo from '../assets/brand/logo-color.png';
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function imprimirIdentidade() {
  const janela = window.open('', '_blank');
  if (!janela) { window.alert('Permita abrir a janela de impressão para salvar o PDF.'); return; }
  janela.opener = null;
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Impresilk — Missão, visão e valores</title><style>
  @page{size:A4;margin:15mm}*{box-sizing:border-box}body{font:11pt/1.55 Arial,sans-serif;color:#17263c;margin:0}header{text-align:center;border-bottom:3px solid #007ba7;padding-bottom:15px}img{width:135px}h1{font-size:21pt}h2{font-size:15pt;color:#007ba7;margin-bottom:8px}h3{font-size:12pt;margin:0 0 8px}p{text-align:justify;hyphens:auto;margin:6px 0}section,li{break-inside:avoid}section{margin:20px 0}ol{list-style:none;padding:0}li{margin:14px 0;padding:12px 16px;border-left:4px solid #007ba7;background:#f7f9fc}li:nth-child(4n+2){border-color:#bb2872}li:nth-child(4n+3){border-color:#25835b}li:nth-child(4n){border-color:#b27600}.quebra{font-size:10pt;color:#475569}button{padding:12px;margin:15px 0;cursor:pointer}@media print{button{display:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
  </style></head><body><button onclick="window.print()">Imprimir / Salvar como PDF</button><header><img src="${esc(new URL(logo, window.location.href).href)}" alt="Impresilk"><h1>Missão, visão e valores</h1></header><section><h2>Missão</h2><p>${esc(MISSAO)}</p></section><section><h2>Visão</h2><p>${esc(VISAO)}</p></section><h2>Nossos valores</h2><ol>${VALORES.map(v=>`<li><h3>${v.n}. ${esc(v.titulo)}</h3><p>${esc(v.texto)}</p><p class="quebra"><strong>Se quebra:</strong> ${esc(v.quebra)}</p></li>`).join('')}</ol></body></html>`);
  janela.addEventListener('load', () => { janela.focus(); janela.print(); }, { once:true });
  janela.document.close();
}
