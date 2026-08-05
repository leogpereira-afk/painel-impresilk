// PDF da conversa de um compromisso, sem biblioteca nenhuma.
//
// POR QUE ESCREVER O PDF NA MAO: o painel gera os outros PDFs por
// window.print(), que abre a caixa de impressao do navegador e NAO devolve
// arquivo -- e para mandar no WhatsApp e preciso um arquivo de verdade. A
// alternativa era somar o jsPDF ao bundle (~150 KB gzip num pacote que ja tem
// 265 KB) por causa de um botao usado de vez em quando. Uma conversa e texto:
// oitenta linhas de PDF 1.4 resolvem, e o resultado abre em qualquer leitor.
//
// Limite conhecido e aceito: fonte padrao Helvetica com codificacao WinAnsi,
// que cobre o portugues inteiro (acentos, cedilha, travessao). Caractere fora
// disso -- emoji, por exemplo -- vira "?" em vez de quebrar o arquivo.

const LARGURA = 595; // A4 em pontos
const ALTURA = 842;
const MARGEM = 56;
const TAMANHO = 10;
const ALTURA_LINHA = 14;
const LINHAS_POR_PAGINA = Math.floor((ALTURA - MARGEM * 2) / ALTURA_LINHA);
// Helvetica tem ~0,5 de largura media por ponto de corpo.
const MAX_COLUNAS = Math.floor((LARGURA - MARGEM * 2) / (TAMANHO * 0.5));

// WinAnsi (CP1252) e latin-1 MAIS uma faixa propria em 0x80-0x9F, onde moram
// justamente os sinais que a gente mais usa: travessao, aspas curvas e
// reticencias. Sem esta tabela, "-- urgente" virava "? urgente" no papel.
const CP1252 = {
  "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85,
  "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a,
  "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92,
  "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97,
  "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c,
  "ž": 0x9e, "Ÿ": 0x9f,
};
const paraWinAnsi = (s) =>
  String(s ?? "").replace(/[^\x00-\xFF]/g, (c) =>
    CP1252[c] !== undefined ? String.fromCharCode(CP1252[c]) : "?"
  );

// Parenteses e barra invertida sao sintaxe dentro de uma string PDF.
const escapar = (s) => paraWinAnsi(s).replace(/([\\()])/g, "\\$1");

// Quebra em palavras; palavra maior que a linha e partida na forca.
function quebrar(texto, colunas = MAX_COLUNAS) {
  const linhas = [];
  for (const bruta of String(texto ?? "").split("\n")) {
    let atual = "";
    for (const palavra of bruta.split(/\s+/)) {
      if (!palavra) continue;
      if (palavra.length > colunas) {
        if (atual) { linhas.push(atual); atual = ""; }
        for (let i = 0; i < palavra.length; i += colunas) linhas.push(palavra.slice(i, i + colunas));
        continue;
      }
      if ((atual + " " + palavra).trim().length > colunas) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = (atual ? atual + " " : "") + palavra;
      }
    }
    linhas.push(atual);
  }
  return linhas;
}

// linhas: [{ texto, negrito }]
function montarPdf(linhas) {
  const paginas = [];
  for (let i = 0; i < linhas.length; i += LINHAS_POR_PAGINA) {
    paginas.push(linhas.slice(i, i + LINHAS_POR_PAGINA));
  }
  if (!paginas.length) paginas.push([]);

  const objetos = [];
  const push = (corpo) => { objetos.push(corpo); return objetos.length; }; // 1-based

  const idCatalogo = push(""); // reservado: precisa saber o id de Pages
  const idPaginas = push("");
  const idNormal = push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const idNegrito = push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  const idsPagina = [];
  for (const pagina of paginas) {
    let fluxo = "BT\n";
    let y = ALTURA - MARGEM;
    for (const linha of pagina) {
      fluxo += `/${linha?.negrito ? "FB" : "FN"} ${TAMANHO} Tf\n`;
      fluxo += `1 0 0 1 ${MARGEM} ${y} Tm\n`;
      fluxo += `(${escapar(linha?.texto ?? "")}) Tj\n`;
      y -= ALTURA_LINHA;
    }
    fluxo += "ET";
    const idConteudo = push(`<< /Length ${paraWinAnsi(fluxo).length} >>\nstream\n${fluxo}\nendstream`);
    idsPagina.push(
      push(
        `<< /Type /Page /Parent ${idPaginas} 0 R /MediaBox [0 0 ${LARGURA} ${ALTURA}] ` +
        `/Resources << /Font << /FN ${idNormal} 0 R /FB ${idNegrito} 0 R >> >> ` +
        `/Contents ${idConteudo} 0 R >>`
      )
    );
  }

  objetos[idCatalogo - 1] = `<< /Type /Catalog /Pages ${idPaginas} 0 R >>`;
  objetos[idPaginas - 1] =
    `<< /Type /Pages /Kids [${idsPagina.map((i) => `${i} 0 R`).join(" ")}] /Count ${idsPagina.length} >>`;

  let arquivo = "%PDF-1.4\n";
  const posicoes = [];
  objetos.forEach((corpo, i) => {
    posicoes.push(arquivo.length);
    arquivo += `${i + 1} 0 obj\n${corpo}\nendobj\n`;
  });
  const inicioXref = arquivo.length;
  arquivo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const p of posicoes) arquivo += `${String(p).padStart(10, "0")} 00000 n \n`;
  arquivo += `trailer\n<< /Size ${objetos.length + 1} /Root ${idCatalogo} 0 R >>\nstartxref\n${inicioXref}\n%%EOF`;

  const bytes = new Uint8Array(arquivo.length);
  for (let i = 0; i < arquivo.length; i++) bytes[i] = arquivo.charCodeAt(i) & 0xff;
  return new Blob([bytes], { type: "application/pdf" });
}

const dataHora = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const FRASE = {
  criou: "abriu o compromisso",
  passou: "passou para",
  recado: "",
  concluiu: "marcou como resolvido",
  reabriu: "reabriu",
};

// Monta as linhas da conversa AGRUPADAS POR PESSOA: um cabecalho por bloco de
// eventos seguidos da mesma pessoa, como numa conversa de verdade.
export function linhasDaConversa(c) {
  const linhas = [];
  linhas.push({ texto: c.titulo || "Compromisso", negrito: true });
  const ficha = [
    c.tipoRotulo,
    c.cliente ? `Cliente: ${c.cliente}` : "",
    c.data ? `Data: ${dataHora(`${c.data}T${c.hora || "00:00"}`).replace(", 00:00", "")}` : "Sem data marcada",
    c.donoNome ? `Com: ${c.donoNome}` : "",
  ].filter(Boolean).join("   |   ");
  linhas.push({ texto: ficha });
  if (c.obs) quebrar(`Observacao: ${c.obs}`).forEach((t) => linhas.push({ texto: t }));
  linhas.push({ texto: "" });
  linhas.push({ texto: "HISTORICO", negrito: true });
  linhas.push({ texto: "" });

  const hist = Array.isArray(c.historico) ? c.historico : [];
  if (!hist.length) linhas.push({ texto: "(sem registros)" });

  let ultimo = null;
  for (const ev of hist) {
    if (ev?.quem !== ultimo) {
      if (ultimo !== null) linhas.push({ texto: "" });
      linhas.push({ texto: ev?.quemNome || ev?.quem || "alguem", negrito: true });
      ultimo = ev?.quem;
    }
    const quando = dataHora(ev?.em);
    const acao = ev?.tipo === "passou"
      ? `${FRASE.passou} ${ev?.paraNome || ev?.para || "outra pessoa"}`
      : FRASE[ev?.tipo] || "";
    if (acao) linhas.push({ texto: `  ${quando} - ${acao}` });
    if (ev?.texto) {
      // O recuo entra DEPOIS da quebra: quebrar() separa por espacos e comeria
      // qualquer espaco no comeco, deixando a continuacao colada na margem.
      const primeira = acao ? "    " : `  ${quando} - `;
      quebrar(ev.texto, MAX_COLUNAS - 6).forEach((t, i) =>
        linhas.push({ texto: (i === 0 ? primeira : "    ") + t })
      );
    }
    if (ev?.arquivo?.nome) linhas.push({ texto: `    [anexo] ${ev.arquivo.nome}` });
  }

  linhas.push({ texto: "" });
  linhas.push({ texto: `Impresilk - gerado em ${dataHora(new Date().toISOString())}` });
  return linhas;
}

export const pdfDaConversa = (c) => montarPdf(linhasDaConversa(c));

// A mesma conversa em texto puro -- e o que vai no corpo da mensagem quando o
// aparelho nao souber compartilhar arquivo.
export const textoDaConversa = (c) =>
  linhasDaConversa(c)
    .map((l) => (l.negrito && l.texto ? `*${l.texto}*` : l.texto))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

export const nomeDoArquivo = (c) =>
  `conversa-${String(c.titulo || "compromisso").toLowerCase().normalize("NFKD").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)}.pdf`;
