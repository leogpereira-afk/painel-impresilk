/* Gera o PDF da missão, da visão e dos doze valores.
 *
 * Pedido do Léo (23/09/2026): "me mandar a missão visão e valores em pdf".
 * Serve para imprimir, para colar na parede da produção e para entrar no
 * Welcome Kit de entrada do RH.
 *
 * O TEXTO VEM DE src/lib/identidade.js, fonte única. Este script não tem uma
 * linha de texto dos valores dentro dele: se eu tivesse copiado os doze para
 * cá, o PDF e a tela viravam duas versões diferentes no primeiro ajuste, e
 * ninguém saberia qual é a boa -- que é exatamente o motivo de existir um
 * arquivo só.
 *
 * FERRAMENTA LOCAL, NÃO ENTRA NA CI: imprime pelo Chrome deste Mac. Rodar com
 *   node scripts/valores-pdf.mjs [caminho-de-saida.pdf]
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { MISSAO, VISAO, VALORES } from "../src/lib/identidade.js";

const execFileP = promisify(execFile);
const aqui = dirname(fileURLToPath(import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Escapa o que vai para dentro do HTML. O texto é nosso, mas um "&" solto
 *  quebraria a página em silêncio e ninguém confere um PDF caractere a
 *  caractere. */
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const base64 = async (caminho) => (await readFile(resolve(aqui, "..", caminho))).toString("base64");

async function montarHtml() {
  const logo = await base64("src/assets/brand/logo-color.png");
  const poppinsBold = await base64("src/assets/fonts/poppins-bold.ttf");
  const poppinsSemi = await base64("src/assets/fonts/poppins-semibold.ttf");

  const valores = VALORES.map(
    (v) => `
      <li class="valor">
        <div class="numero">${v.n}</div>
        <div>
          <h3>${esc(v.titulo)}</h3>
          <p class="texto">${esc(v.texto)}</p>
          <p class="quebra"><span>Se quebra:</span> ${esc(v.quebra)}</p>
        </div>
      </li>`,
  ).join("");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Impresilk — Missão, Visão e Valores</title>
<style>
  @font-face { font-family: "Poppins"; font-weight: 600;
    src: url(data:font/ttf;base64,${poppinsSemi}) format("truetype"); }
  @font-face { font-family: "Poppins"; font-weight: 700;
    src: url(data:font/ttf;base64,${poppinsBold}) format("truetype"); }

  @page { size: A4; margin: 11mm 12mm 10mm; }

  * { box-sizing: border-box; }
  body {
    margin: 0; color: #1e293b;
    font: 400 10pt/1.5 "Helvetica Neue", Helvetica, Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1, h2, h3, .numero { font-family: "Poppins", sans-serif; }

  /* CABEÇALHO */
  header { display: flex; align-items: center; gap: 12px;
           border-bottom: 2px solid #3840E8; padding-bottom: 9px; }
  header img { height: 29px; }
  header h1 { margin: 0; font-size: 14pt; font-weight: 700; color: #1b1f6b; letter-spacing: -.01em; }
  header p  { margin: 2px 0 0; font-size: 8.5pt; color: #64748b; }

  /* MISSÃO E VISÃO lado a lado */
  .frases { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 11px; }
  .frase { border: 1px solid #c2c6fb; border-left: 4px solid #3840E8;
           border-radius: 10px; padding: 9px 12px; background: #f7f8ff; }
  .rotulo { margin: 0; font-size: 7.5pt; font-weight: 700; letter-spacing: .12em;
            text-transform: uppercase; color: #3840E8; }
  .frase h2 { margin: 4px 0 0; font-size: 11.5pt; font-weight: 600;
              line-height: 1.25; color: #1b1f6b; }

  /* OS DOZE */
  .titulo-secao { margin: 13px 0 7px; font-size: 7.5pt; font-weight: 700;
                  letter-spacing: .12em; text-transform: uppercase; color: #3840E8; }
  ol { list-style: none; margin: 0; padding: 0;
       display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
  .valor { display: flex; gap: 10px; break-inside: avoid; page-break-inside: avoid;
           border: 1px solid #e2e8f0; border-radius: 9px; padding: 10px 12px; }
  .numero { flex: 0 0 auto; width: 19px; font-size: 12pt; font-weight: 700;
            line-height: 1.1; color: #9ba1f6; }
  .valor h3 { margin: 0 0 2px; font-size: 9.8pt; font-weight: 600; color: #0f172a; line-height: 1.25; }
  .texto  { margin: 0; font-size: 8.8pt; line-height: 1.46; color: #475569; }
  /* O "Se quebra" fica discreto de propósito: quem passa o olho lê os doze
     títulos; quem para para ler entende o que está sendo cobrado. */
  .quebra { margin: 5px 0 0; font-size: 7.9pt; line-height: 1.42; color: #7b8798; }
  .quebra span { font-weight: 700; }

  footer { margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 6px;
           font-size: 7.2pt; color: #94a3b8; }
</style></head>
<body>
  <header>
    <img src="data:image/png;base64,${logo}" alt="Impresilk">
    <div>
      <h1>Missão, Visão e Valores</h1>
      <p>Impresilk Comunicação Visual</p>
    </div>
  </header>

  <section class="frases">
    <div class="frase"><p class="rotulo">Missão</p><h2>${esc(MISSAO)}</h2></div>
    <div class="frase"><p class="rotulo">Visão</p><h2>${esc(VISAO)}</h2></div>
  </section>

  <p class="titulo-secao">Nossos valores</p>
  <ol>${valores}</ol>

  <footer>
    Cada valor traz o que acontece quando ele é quebrado. Valor que ninguém
    consegue desobedecer é decoração de parede.
  </footer>
</body></html>`;
}

const saida = resolve(process.argv[2] ?? join(aqui, "..", "Impresilk-Missao-Visao-Valores.pdf"));
const pasta = await mkdtemp(join(tmpdir(), "valores-"));
const html = join(pasta, "valores.html");

try {
  await writeFile(html, await montarHtml(), "utf8");
  await execFileP(CHROME, [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${saida}`,
    `file://${html}`,
  ]);
  console.log(`PDF em ${saida}`);
} finally {
  await rm(pasta, { recursive: true, force: true });
}
