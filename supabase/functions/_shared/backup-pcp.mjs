// A COPIA DO PCP NO HUB (auditoria do PCP v164, 11/10/2026: A2, M20, M21, M29).
//
// Ate aqui o painel-backup puxava o PCP pelo `list`, que entrega so O.S.
// vivas, e gravava "fotos nao incluidas": ficavam fora as lapides, o diario,
// os horarios das fotos, as Demandas, o selo do mes, as regras, a comissao e
// as 780 fotos de evidencia, e a tela dizia "PCP ok". Este modulo e a regua
// pura (sem rede, sem banco) da copia nova, para ser testada por inteiro:
//
//   1. exportarPCP: le a porta `exportarBackup` do pcp-sync (so da maquina),
//      pagina pelo cursor dela e recusa pagina repetida ou cursor que volta;
//   2. conferirExportacao: a contagem por colecao que o PCP declarou no
//      comeco e no fim contra o que chegou. Fora da faixa, ou colecao
//      faltando, vira divergencia, e divergencia e ok:false na tela;
//   3. copiarArquivosIncremental: os buckets pcp-arquivos e pcp-demandas vao
//      para o mesmo destino do painel-arquivos (arquivos/<bucket>/<sha256> no
//      repositorio privado), so o arquivo novo ou mudado, com teto por rodada.
//      Copia pela metade nunca e "ok": sobra pendente, a rodada diz quantos;
//   4. montarArquivoPCP: o arquivo do dia (formato pcp-backup-5), que a volta
//      (scripts/ensaio-backup-pcp.cjs, no repositorio do PCP) sabe ler.
//
// Revisao da onda-w1-backup (11/10/2026): o pcp_meta (a copia de desfazer do
// robo do ERP, carteira-auditoria:*, e o cache mensal, entregues:*) vem pela
// mesma porta, com a contagem dele; a chave "mubisys" (a credencial do ERP)
// nunca pode vir, e se vier a copia para sem gravar nada (R4). E a mesma
// divergencia ja gravada hoje espera 1 hora para tentar de novo, em vez de
// regravar o arquivo do dia a cada 5 minutos (S3: decidirExportacaoPCP).

export const BUCKETS_PCP = ["pcp-arquivos", "pcp-demandas"];
// As colecoes que a porta do PCP tem de declarar sempre, mesmo vazias. Se uma
// sumir da contagem, a porta regrediu: a copia falha em vez de ficar calada.
export const COLECOES_PCP_OBRIGATORIAS = ["os", "auditoria", "foto_evento", "performance_fechamentos",
  "performance_regras", "performance_comissao", "performance_comissao_os_versoes"];
// Teto por rodada. O GitHub aceita ate 80 gravacoes por minuto e 500 por hora;
// o agendador roda a cada 5 minutos, entao 25 por rodada da 300 por hora.
export const TETO_RODADA = { arquivos: 25, bytes: 8 * 1024 * 1024, ms: 90_000 };
// A chave do pcp_meta que guarda a credencial do ERP: nunca entra na copia.
export const META_PROIBIDA = ["mubisys"];
// A mesma divergencia ja gravada hoje: nova tentativa so depois disto (S3).
export const ESPERA_DIVERGENCIA_MS = 60 * 60 * 1000;

const SHA = /^[a-f0-9]{64}$/;

export async function exportarPCP(chamar, { maxPaginas = 400 } = {}) {
  const registros = [], demandas = [], meta = [], vistos = new Set(), cursores = new Set();
  let cursor = null, primeira = null, ultima = null, paginas = 0;
  for (; paginas < maxPaginas; paginas++) {
    const r = await chamar(cursor == null ? { action: "exportarBackup" } : { action: "exportarBackup", cursor });
    if (!r || !Array.isArray(r.registros) || !Array.isArray(r.demandas)) throw new Error("PCP: a exportação respondeu sem registros.");
    if (paginas === 0) {
      if (!r.contagemInicio) throw new Error("PCP: a exportação não trouxe a contagem inicial.");
      primeira = r;
    }
    for (const l of r.registros) {
      const chave = "r\u0000" + l?.colecao + "\u0000" + l?.id;
      if (!l || typeof l.colecao !== "string" || typeof l.id !== "string") throw new Error("PCP: linha sem coleção ou id.");
      if (vistos.has(chave)) throw new Error(`PCP: linha repetida na exportação (${l.colecao}).`);
      vistos.add(chave);registros.push(l);
    }
    for (const d of r.demandas) {
      const chave = "d\u0000" + d?.id;
      if (!d || typeof d.id !== "string") throw new Error("PCP: demanda sem id.");
      if (vistos.has(chave)) throw new Error("PCP: demanda repetida na exportação.");
      vistos.add(chave);demandas.push(d);
    }
    for (const m of Array.isArray(r.meta) ? r.meta : []) {
      if (!m || typeof m.chave !== "string" || !m.chave) throw new Error("PCP: linha do pcp_meta sem chave.");
      if (META_PROIBIDA.includes(m.chave)) throw new Error("PCP: a exportação trouxe a credencial do ERP (pcp_meta). Nada foi gravado; o pcp-sync precisa ser corrigido.");
      const chave = "m\u0000" + m.chave;
      if (vistos.has(chave)) throw new Error("PCP: linha do pcp_meta repetida na exportação.");
      vistos.add(chave);meta.push(m);
    }
    ultima = r;
    if (r.nextCursor == null) break;
    if (typeof r.nextCursor !== "string" || cursores.has(r.nextCursor)) throw new Error("PCP: exportação interrompida (cursor repetido).");
    cursores.add(r.nextCursor);
    cursor = r.nextCursor;
  }
  if (ultima?.nextCursor != null) throw new Error("PCP: exportação incompleta (limite de páginas atingido).");
  if (!ultima.contagemFim) throw new Error("PCP: a exportação não trouxe a contagem final.");
  return {
    pcp_registros: registros, pcp_demandas: demandas, pcp_meta: meta,
    cfg: primeira.cfg ?? null, cfgVersao: primeira.cfgVersao ?? "",
    contagemInicio: primeira.contagemInicio, contagemFim: ultima.contagemFim,
    formato: primeira.formato ?? "", paginas: paginas + 1,
  };
}

const num = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

export function conferirExportacao(exp) {
  const divergencias = [];
  const ini = exp.contagemInicio?.pcp_registros ?? {}, fim = exp.contagemFim?.pcp_registros ?? {};
  const exportado = {};
  for (const l of exp.pcp_registros) {
    const c = (exportado[l.colecao] ||= { total: 0, apagados: 0 });
    c.total++;if (l.apagado === true) c.apagados++;
  }
  for (const c of COLECOES_PCP_OBRIGATORIAS)
    if (!ini[c] || !fim[c]) divergencias.push(`${c}: coleção fora da contagem do PCP`);
  const todas = [...new Set([...Object.keys(ini), ...Object.keys(fim), ...Object.keys(exportado)])].sort();
  const faixa = (a, b) => (a === b ? `${a}` : `entre ${a} e ${b}`);
  for (const c of todas) {
    const e = exportado[c] ?? { total: 0, apagados: 0 };
    if (!fim[c]) { divergencias.push(`${c}: exportada sem contagem do PCP`); continue; }
    const a = num(ini[c]?.total) ?? 0, b = num(fim[c].total);
    if (b === null) { divergencias.push(`${c}: contagem inválida`); continue; }
    // Nada é apagado de pcp_registros: o exportado fica entre o antes e o depois.
    if (e.total < a || e.total > b) divergencias.push(`${c}: ${e.total} exportadas, esperadas ${faixa(a, b)}`);
    const la = num(ini[c]?.apagados), lb = num(fim[c].apagados);
    // Lápide pode voltar a ser O.S. viva no meio (restaurar); só confere quando parada.
    if (la !== null && la === lb && e.apagados !== la) divergencias.push(`${c}: ${e.apagados} excluídas (lápides) exportadas, esperadas ${la}`);
  }
  const da = num(exp.contagemInicio?.pcp_demandas), db = num(exp.contagemFim?.pcp_demandas);
  if (da === null || db === null) divergencias.push("pcp_demandas: fora da contagem do PCP");
  else if (exp.pcp_demandas.length < da || exp.pcp_demandas.length > db)
    divergencias.push(`pcp_demandas: ${exp.pcp_demandas.length} exportadas, esperadas ${faixa(da, db)}`);
  // O pcp_meta (R4): a porta que não o conta regrediu (ou é o pcp-sync de antes dele).
  const meta = Array.isArray(exp.pcp_meta) ? exp.pcp_meta : [];
  const ma = num(exp.contagemInicio?.pcp_meta), mb = num(exp.contagemFim?.pcp_meta);
  if (ma === null || mb === null) divergencias.push("pcp_meta: fora da contagem do PCP");
  else if (meta.length < ma || meta.length > mb)
    divergencias.push(`pcp_meta: ${meta.length} exportadas, esperadas ${faixa(ma, mb)}`);
  if (!exp.cfg || typeof exp.cfg !== "object" || Array.isArray(exp.cfg)) divergencias.push("config: configuração ausente");
  const porColecao = Object.fromEntries(todas.map((c) => [c, exportado[c]?.total ?? 0]));
  porColecao.pcp_demandas = exp.pcp_demandas.length;
  porColecao.pcp_meta = meta.length;
  porColecao.config = exp.cfg ? 1 : 0;
  const lapides = Object.values(exportado).reduce((n, c) => n + c.apagados, 0);
  return {
    divergencias, porColecao, lapides,
    registros: exp.pcp_registros.length + exp.pcp_demandas.length + meta.length,
    exportado: { pcp_registros: exportado, pcp_demandas: exp.pcp_demandas.length, pcp_meta: meta.length },
  };
}

export const resumoSha256 = async (bytes) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((n) => n.toString(16).padStart(2, "0")).join("");

// Todos os arquivos de um bucket, só os metadados (nada é baixado aqui).
async function listarBucket(bucket) {
  const out = [];
  const visitar = async (prefixo, nivel) => {
    if (nivel > 5) throw new Error("Pastas demais no bucket.");
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(prefixo, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error("Não foi possível listar os arquivos: " + error.message);
      for (const item of data || []) {
        const caminho = [prefixo, item.name].filter(Boolean).join("/");
        if (!item.id) { await visitar(caminho, nivel + 1); continue; }
        const m = item.metadata || {};
        out.push({ caminho, bytes: Number(m.size ?? -1), tipo: m.mimetype || "application/octet-stream",
          marca: [m.eTag ?? "", m.size ?? "", item.updated_at ?? m.lastModified ?? ""].join("|") });
      }
      if (!data || data.length < 100) break;
    }
  };
  await visitar("", 0);
  return out.sort((a, b) => (a.caminho < b.caminho ? -1 : a.caminho > b.caminho ? 1 : 0));
}

/* INCREMENTAL POR sha256. `estado.buckets[nome][caminho]` guarda o sha256 do
   que ja tem copia e a marca (eTag, tamanho, data) de quando foi copiado.
   Marca igual: nada a baixar. Marca diferente ou caminho novo: baixa, calcula
   o sha256 e `guardar` confere/grava arquivos/<bucket>/<sha256>. Arquivo que
   falha fica pendente e a rodada segue com os outros; a falha e dita.
   Arquivo que saiu do bucket sai do estado (a copia por sha256 continua no
   destino, e os arquivos de dias anteriores ainda a citam). */
export async function copiarArquivosIncremental({ buckets = BUCKETS_PCP, estado, bucketDe, guardar, teto = TETO_RODADA, relogio = () => Date.now() }) {
  const inicio = relogio();
  const novo = { buckets: {} }, porBucket = {}, pendentes = [], falhas = [];
  for (const nome of buckets) {
    const antes = estado?.buckets?.[nome] ?? {};
    const atual = (novo.buckets[nome] = {});
    const lista = await listarBucket(bucketDe(nome));
    porBucket[nome] = { existem: lista.length, comCopia: 0, copiadosNaRodada: 0, pendentes: 0 };
    for (const a of lista) {
      const e = antes[a.caminho];
      if (e && e.marca === a.marca && SHA.test(e.sha256)) { atual[a.caminho] = e; porBucket[nome].comCopia++; }
      else pendentes.push({ nome, ...a });
    }
  }
  let copiados = 0, bytes = 0, pausou = false;
  for (const p of pendentes) {
    // O primeiro da rodada sempre vai: a rodada nunca termina sem andar.
    if (copiados + falhas.length > 0 && (copiados + falhas.length >= teto.arquivos || bytes >= teto.bytes || relogio() - inicio >= teto.ms)) break;
    try {
      const { data, error } = await bucketDe(p.nome).download(p.caminho);
      if (error || !data) throw new Error("download recusado");
      const conteudo = new Uint8Array(await data.arrayBuffer());
      const sha256 = await resumoSha256(conteudo);
      await guardar(p.nome, sha256, conteudo, p.tipo);
      novo.buckets[p.nome][p.caminho] = { sha256, bytes: conteudo.length, tipo: data.type || p.tipo, marca: p.marca };
      porBucket[p.nome].comCopia++;porBucket[p.nome].copiadosNaRodada++;
      copiados++;bytes += conteudo.length;
    } catch (e) {
      // O destino pediu pausa (limite de gravações do GitHub): não é falha do
      // arquivo; a rodada para e a seguinte continua dele.
      if (e?.pausa === true) { pausou = true; break; }
      falhas.push({ bucket: p.nome, caminho: p.caminho, erro: String(e?.message || e).slice(0, 160) });
    }
  }
  for (const nome of buckets) porBucket[nome].pendentes = porBucket[nome].existem - porBucket[nome].comCopia;
  const existem = buckets.reduce((n, b) => n + porBucket[b].existem, 0);
  const comCopia = buckets.reduce((n, b) => n + porBucket[b].comCopia, 0);
  const manifesto = Object.fromEntries(buckets.map((b) => [b, Object.entries(novo.buckets[b])
    .map(([caminho, e]) => ({ caminho, tipo: e.tipo, bytes: e.bytes, sha256: e.sha256 }))
    .sort((x, y) => (x.caminho < y.caminho ? -1 : 1))]));
  return { estado: novo, manifesto, porBucket, existem, comCopia, copiados, falhas, pausou, completo: comCopia === existem };
}

export function montarArquivoPCP({ nome, exportadoEm, exportacao, conferencia, copia }) {
  return {
    versao: 5, formato: "pcp-backup-5", sistema: "pcp", nome, exportadoEm,
    origem: { acao: "exportarBackup", formato: exportacao.formato, paginas: exportacao.paginas },
    cfg: exportacao.cfg, cfgVersao: exportacao.cfgVersao,
    pcp_registros: exportacao.pcp_registros, pcp_demandas: exportacao.pcp_demandas, pcp_meta: exportacao.pcp_meta ?? [],
    contagem: { inicio: exportacao.contagemInicio, fim: exportacao.contagemFim, exportado: conferencia.exportado },
    divergencias: conferencia.divergencias,
    destinoArquivos: "arquivos/<bucket>/<sha256>",
    arquivos: copia.manifesto,
    arquivosCompletos: copia.completo,
    arquivosPendentes: copia.existem - copia.comCopia,
  };
}

/* QUANDO EXPORTAR DE NOVO (revisao da onda-w1-backup, S3). O arquivo do dia
   gravado e conferido vale ate os arquivos terminarem (ai sai de novo, com o
   manifesto completo). O gravado COM divergencia era refeito a cada rodada: o
   agendador roda a cada 5 minutos e volta ao PCP enquanto ele esta ok:false,
   entao eram ate 288 gravacoes de ~4 MB por dia e uma exportacao inteira do
   pcp-sync a cada 5 minutos. Agora a mesma divergencia espera 1 hora; o
   `forcar` (pedido explicito, depois de um conserto) passa na hora. */
export function decidirExportacaoPCP({ registros, hoje, agora, copiaCompleta, forcar = false }) {
  const gravadoHoje = registros?.dia === hoje && registros.gravado === true;
  const divergente = gravadoHoje && Array.isArray(registros.divergencias) && registros.divergencias.length > 0;
  if (gravadoHoje && !divergente) return { exportar: !!copiaCompleta, reaproveitar: true, novaTentativaEm: null };
  if (divergente && !forcar) {
    const desde = Date.parse(registros.em), t = Date.parse(agora);
    if (Number.isFinite(desde) && Number.isFinite(t) && t - desde < ESPERA_DIVERGENCIA_MS)
      return { exportar: false, reaproveitar: true, novaTentativaEm: new Date(desde + ESPERA_DIVERGENCIA_MS).toISOString() };
  }
  return { exportar: true, reaproveitar: false, novaTentativaEm: null };
}

const horaSP = (iso) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/* O que a tela mostra do PCP. ok so com as tres coisas: contagem que bate,
   arquivo do dia gravado e todos os arquivos com copia. Copia de arquivo
   pela metade e "copiando" (o agendador continua em 5 minutos), nunca ok. */
export function statusPCP({ nome, em, copia, registros, gravado, erroGravacao, novaTentativaEm = null }) {
  const divergencias = registros?.divergencias ?? [];
  const falhaArq = copia.falhas.length
    ? `${copia.falhas.length} ${copia.falhas.length === 1 ? "arquivo não copiado" : "arquivos não copiados"} (${copia.falhas[0].bucket}/${copia.falhas[0].caminho}: ${copia.falhas[0].erro})`
    : "";
  const emAndamento = !copia.completo && !copia.falhas.length;
  const ok = !!(copia.completo && registros && gravado && !divergencias.length);
  const erro = erroGravacao
    || (divergencias.length ? `A contagem não confere: ${divergencias.slice(0, 3).join("; ")}${divergencias.length > 3 ? ` (e mais ${divergencias.length - 3})` : ""}.`
      + (novaTentativaEm && Number.isFinite(Date.parse(novaTentativaEm)) ? ` Nova tentativa a partir das ${horaSP(novaTentativaEm)}.` : "") : "")
    || falhaArq
    || (emAndamento ? `${copia.pausou ? "O GitHub pediu pausa nas gravações; a cópia continua na próxima rodada" : "Cópia dos arquivos em andamento"}: ${copia.comCopia} de ${copia.existem}.` : "")
    || (!registros ? "Os registros do PCP ainda não foram copiados hoje." : null);
  return {
    nome, em, ok, emAndamento, erro: ok ? null : erro,
    registros: registros?.registros ?? null,
    porColecao: registros?.porColecao ?? null,
    lapides: registros?.lapides ?? null,
    divergencias,
    ...(novaTentativaEm && divergencias.length ? { novaTentativaEm } : {}),
    arquivos: copia.comCopia, arquivosExistentes: copia.existem,
    arquivosCopiadosNaRodada: copia.copiados, porBucket: copia.porBucket,
    // A rodada manual da tela anda enquanto este número cresce.
    partes: copia.comCopia,
  };
}
