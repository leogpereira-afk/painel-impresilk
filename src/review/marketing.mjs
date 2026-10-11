// Porta painel-marketing de mentira, só na compilação review: tudo vive nesta
// memória e recarregar restaura o exemplo. As regras de campo, a trava de
// orçamento e o formato de tela são os MESMOS do servidor
// (_shared/marketing.mjs); o que muda é só onde se guarda.
//
// Etapa a2: canais (os 11 da carga padrão, com o Pinterest em implantação),
// playbook de 4 deles, publicações e números da semana do Instagram, e
// pessoas fictícias. Quem revisa é "gestao" (vê e mexe em tudo).
import {
  prepararAcao, acaoParaTela, ErroMarketing, prepararCanal, canalParaTela, prepararItemPlaybook, itemParaTela, prepararConclusao,
  prepararPublicacao, prepararLinhaCsv, publicacaoParaTela, prepararMetricas, metricasParaTela, prepararPapel, papelParaTela,
  padraoParaBanco, hojeSP, somarDias, segundaDaSemana, LIMITE_LINHAS_CSV, NUMEROS_SEMANA,
} from '../../supabase/functions/_shared/marketing.mjs';
import { CANAIS_PADRAO, PLAYBOOK_PADRAO } from '../../supabase/functions/_shared/marketing-padrao.mjs';

const QUEM = 'revisao';
const ID_PESSOA = '100001';
const hoje = hojeSP();
const agora = () => new Date().toISOString();
const carimbo = () => ({ criado_em: agora(), criado_por: QUEM, atualizado_em: agora(), atualizado_por: QUEM });

const acoes = new Map(), vinculo = new Map(), canais = new Map(), playbook = new Map();
const publicacoes = new Map(), metricas = new Map(), papeis = new Map();
const pessoas = [
  { idPessoa: '100001', nome: 'Ana Exemplo', area: 'Marketing' },
  { idPessoa: '100002', nome: 'Bruno Exemplo', area: 'Comercial' },
  { idPessoa: '100003', nome: 'Carla Exemplo', area: 'Produção' },
];

const padrao = padraoParaBanco(CANAIS_PADRAO, PLAYBOOK_PADRAO);
function gravarCanal(dados, id = crypto.randomUUID()) {
  const linha = { ...dados, id, versao: 1, ...carimbo() };
  canais.set(id, linha);
  return linha;
}
function gravarItem(dados, canalId, id = crypto.randomUUID()) {
  const { canal: _codigoCanal, ...resto } = dados;
  const linha = { codigo: null, ...resto, canal_id: canalId, id, concluido_em: null, concluido_por: null, evidencia_valor: null, versao: 1, ...carimbo() };
  playbook.set(id, linha);
  return linha;
}
function gravarPublicacao(dados, id = crypto.randomUUID()) {
  const linha = { ...dados, id, acao_id: dados.acao_id ?? null, coletado_em: agora(), retirada_em: null, retirada_por: null, versao: 1, ...carimbo() };
  publicacoes.set(id, linha);
  return linha;
}

// Os 11 canais da carga padrão, como no ar: a fileira de chips só se prova
// com a quantidade de verdade (com 4 canais tudo cabia, e o Facebook e o
// Google Meu Negócio sumindo à direita nunca apareceu na prévia). O id segue
// a ordem (Site 1, Instagram 2, ...), estável entre recargas.
const ID_CANAL = Object.fromEntries(padrao.canais.map((c) => [c.codigo, `c0000000-0000-4000-8000-${String(c.ordem / 10).padStart(12, '0')}`]));
for (const c of padrao.canais) gravarCanal(c, ID_CANAL[c.codigo]);
// Playbook só de Site, Instagram, Pinterest (em implantação) e WhatsApp: com
// os 11, o Fazer da prévia virava uma lista de dezenas de itens sem prazo. O
// resto entra pelo "Carregar o padrão" das Configurações.
const COM_PLAYBOOK = new Set(['site', 'instagram', 'pinterest', 'whatsapp']);
canais.get(ID_CANAL.instagram).url_perfil = 'https://example.com/perfil-exemplo';
canais.get(ID_CANAL.whatsapp).mensagem_whatsapp = 'Olá! Vi a Impresilk e quero um orçamento (exemplo).';
for (const i of padrao.playbook) if (COM_PLAYBOOK.has(i.canal)) gravarItem(i, ID_CANAL[i.canal]);
const primeiraDoPinterest = [...playbook.values()].find((i) => i.codigo === 'pinterest-1');
Object.assign(primeiraDoPinterest, { concluido_em: agora(), concluido_por: QUEM, evidencia_valor: 'Conta criada (exemplo)' });
const bioDoInstagram = [...playbook.values()].find((i) => i.codigo === 'instagram-1');
Object.assign(bioDoInstagram, { evidencia: 'link', responsavel_id: ID_PESSOA });

const exemplo = {
  id: '7b0f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5b', nome: 'Apresentação de fachadas (exemplo)', objetivo: 'Gerar oportunidades de sinalização para lojas',
  publico: 'Comércio local', canal_id: ID_CANAL.instagram, canal_texto: 'Portfólio e redes sociais', responsavel_id: ID_PESSOA, responsavel_texto: 'Ana Exemplo',
  prazo: hoje, situacao: 'Produção', investimento: 500, url: null, versao: 1,
};
acoes.set(exemplo.id, exemplo);
acoes.set('7b0f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5c', {
  id: '7b0f6a52-1c2d-4e5f-8a9b-0c1d2e3f4a5c', nome: 'Lista de transmissão de outubro (exemplo)', objetivo: null, publico: null,
  canal_id: ID_CANAL.whatsapp, canal_texto: null, responsavel_id: '100002', responsavel_texto: null,
  prazo: somarDias(hoje, -2), situacao: 'Ideia', investimento: 0, url: null, versao: 1,
});

const numerosExemplo = [[2, 1840, 3100, 212, 38, 3], [5, 960, 1500, 88, 12, 1], [9, 2210, 4020, 305, 51, 4], [12, 700, 1100, null, 9, 0], [18, 1300, 2050, 140, 20, 2]];
numerosExemplo.forEach(([dias, alcance, impressoes, engajamento, cliques, leads], n) => gravarPublicacao({
  canal_id: ID_CANAL.instagram, data: somarDias(hoje, -dias), titulo: `Reel de obra entregue ${n + 1} (exemplo)`,
  url: `https://example.com/p/exemplo-${n + 1}`, alcance, impressoes, engajamento, cliques, leads, fonte: n === 4 ? 'csv' : 'manual',
}));
gravarPublicacao({ canal_id: ID_CANAL.site, data: somarDias(hoje, -4), titulo: 'Página de obra: fachada em ACM (exemplo)', url: 'https://example.com/obra-exemplo',
  alcance: 420, impressoes: null, engajamento: null, cliques: 31, leads: 2, fonte: 'manual' });
const semanaAtual = segundaDaSemana(hoje);
for (const [semana, seguidores, alcance, conversas] of [[semanaAtual, 5230, 6100, 14], [somarDias(semanaAtual, -7), 5190, 5400, 11]]) {
  const id = crypto.randomUUID();
  metricas.set(`${ID_CANAL.instagram}|${semana}`, { id, canal_id: ID_CANAL.instagram, semana, seguidores, alcance, impressoes: null, engajamento: null,
    cliques: null, conversas, leads: null, fonte: 'manual', coletado_em: agora(), versao: 1, ...carimbo() });
}
papeis.set('100003', { id_pessoa: '100003', papel: 'visualizacao', definido_por: QUEM, definido_em: agora() });

const falhar = (mensagem, status = 422) => { throw new ErroMarketing(mensagem, status); };
const orcamentosDe = (id) => [...vinculo].filter(([, a]) => a === id).map(([o]) => o);
const lista = () => [...acoes.values()].map((a) => acaoParaTela(a, orcamentosDe(a.id)));
const objeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const versaoConfere = (atual, versao, mensagem) => { if (atual.versao !== versao) falhar(mensagem, 409); };

function salvarAcao(b) {
  const { dados: d, orcamentos } = prepararAcao(b.acao);
  const antes = b.acao?.id ? acoes.get(b.acao.id) : null;
  if (b.novo && antes) return { acao: acaoParaTela(antes, orcamentosDe(antes.id)) };
  if (b.acao?.id && !b.novo && !antes) falhar('Esta ação não existe mais. Recarregue a página.', 404);
  if (antes) versaoConfere(antes, b.versao, 'Esta ação mudou enquanto você editava. Reabra e confira.');
  if (d.canal_id && !canais.has(d.canal_id)) falhar('Este canal não existe mais. Recarregue a página.', 404);
  const id = antes?.id || b.acao?.id || crypto.randomUUID();
  const ocupado = orcamentos.find((o) => vinculo.has(o) && vinculo.get(o) !== id);
  if (ocupado) falhar(`O orçamento ${ocupado} já está na ação "${acoes.get(vinculo.get(ocupado))?.nome}". Um orçamento só pode estar numa ação, para a venda não ser contada duas vezes.`, 409);
  for (const [o, a] of [...vinculo]) if (a === id && !orcamentos.includes(o)) vinculo.delete(o);
  for (const o of orcamentos) vinculo.set(o, id);
  // Campo que não veio fica como estava (o mesmo do banco).
  const linha = { ...antes, ...d, id, versao: (antes?.versao || 0) + 1 };
  acoes.set(id, linha);
  return { acao: acaoParaTela(linha, orcamentos) };
}

function salvarCanal(b) {
  if (!objeto(b.canal)) falhar('Canal inválido.', 400);
  const atual = b.canal.id ? canais.get(b.canal.id) : null;
  if (b.novo && atual) return { canal: canalParaTela(atual) };
  if (b.canal.id && !b.novo) {
    if (!atual) falhar('Este canal não existe mais. Recarregue a página.', 404);
    versaoConfere(atual, b.versao, 'Este canal mudou enquanto você editava. Reabra e confira.');
    const dados = prepararCanal({ ...canalParaTela(atual), ...b.canal }, { novo: false, codigoAtual: atual.codigo });
    const { codigo: _fixo, ...resto } = dados;
    Object.assign(atual, resto, { versao: atual.versao + 1, atualizado_em: agora(), atualizado_por: QUEM });
    return { canal: canalParaTela(atual) };
  }
  const dados = prepararCanal(b.canal, { novo: true });
  if ([...canais.values()].some((c) => c.codigo === dados.codigo)) falhar('Já existe um canal com este código. Escolha outro nome ou outro código.', 409);
  return { canal: canalParaTela(gravarCanal(dados, b.canal.id || undefined)) };
}

function salvarPlaybook(b) {
  if (!objeto(b.item)) falhar('Item do playbook inválido.', 400);
  const atual = b.item.id ? playbook.get(b.item.id) : null;
  if (b.novo && atual) return { item: itemParaTela(atual) };
  if (b.item.id && !b.novo) {
    if (!atual) falhar('Este item do playbook não existe mais. Recarregue a página.', 404);
    versaoConfere(atual, b.versao, 'Este item do playbook mudou enquanto você editava. Reabra e confira.');
    const dados = prepararItemPlaybook({ ...itemParaTela(atual), ...b.item });
    if (!canais.has(dados.canal_id)) falhar('Este canal não existe mais. Recarregue a página.', 404);
    const conclusao = dados.tipo === 'unica' ? {} : { concluido_em: null, concluido_por: null, evidencia_valor: null };
    Object.assign(atual, dados, conclusao, { versao: atual.versao + 1, atualizado_em: agora(), atualizado_por: QUEM });
    return { item: itemParaTela(atual) };
  }
  const dados = prepararItemPlaybook(b.item);
  if (!canais.has(dados.canal_id)) falhar('Este canal não existe mais. Recarregue a página.', 404);
  return { item: itemParaTela(gravarItem(dados, dados.canal_id, b.item.id || undefined)) };
}

function itemAtivo(id) {
  const item = playbook.get(id);
  if (!item || !item.ativo) falhar('Este item do playbook não existe mais. Recarregue a página.', 404);
  return item;
}

function salvarPublicacao(b) {
  if (!objeto(b.publicacao)) falhar('Publicação inválida.', 400);
  const atual = b.publicacao.id ? publicacoes.get(b.publicacao.id) : null;
  if (b.novo && atual) return { publicacao: publicacaoParaTela(atual) };
  const editar = b.publicacao.id && !b.novo;
  if (editar) {
    if (!atual || atual.retirada_em) falhar('Esta publicação não existe mais. Recarregue a página.', 404);
    versaoConfere(atual, b.versao, 'Esta publicação mudou enquanto você editava. Reabra e confira.');
  }
  const dados = prepararPublicacao(editar ? { ...publicacaoParaTela(atual), ...b.publicacao } : b.publicacao);
  if (!canais.has(dados.canal_id)) falhar('Este canal não existe mais. Recarregue a página.', 404);
  if (dados.acao_id && !acoes.has(dados.acao_id)) falhar('Esta ação não existe mais. Recarregue a página.', 404);
  const mesmoLink = dados.url ? [...publicacoes.values()].filter((p) => p.id !== atual?.id && p.canal_id === dados.canal_id && p.url === dados.url) : [];
  // Como o banco: link de publicação retirada volta (a mesma linha, ativa).
  const retirada = !editar && mesmoLink.find((p) => p.retirada_em);
  if (retirada) {
    Object.assign(retirada, dados, { fonte: 'manual', coletado_em: agora(), retirada_em: null, retirada_por: null, versao: retirada.versao + 1, atualizado_em: agora(), atualizado_por: QUEM });
    return { publicacao: publicacaoParaTela(retirada) };
  }
  if (mesmoLink.length) falhar('Esta publicação já foi lançada neste canal. Procure no Histórico do canal e edite por lá.', 409);
  if (!editar) return { publicacao: publicacaoParaTela(gravarPublicacao({ ...dados, fonte: 'manual' }, b.publicacao.id || undefined)) };
  const mudou = ['alcance', 'impressoes', 'engajamento', 'cliques', 'leads'].some((k) => atual[k] !== dados[k]);
  Object.assign(atual, dados, mudou ? { fonte: 'manual', coletado_em: agora() } : {}, { versao: atual.versao + 1, atualizado_em: agora(), atualizado_por: QUEM });
  return { publicacao: publicacaoParaTela(atual) };
}

function importarPublicacoes(b) {
  const linhas = b.linhas;
  if (!Array.isArray(linhas) || !linhas.length) falhar('O arquivo não tem linhas para importar.');
  if (linhas.length > LIMITE_LINHAS_CSV) falhar(`Importe até ${LIMITE_LINHAS_CSV} linhas por vez.`);
  const recusadas = [], vistos = new Map(), boas = [];
  linhas.forEach((l, i) => {
    const linha = Number.isInteger(l?.linha) ? l.linha : i + 1;
    try {
      const d = prepararLinhaCsv(l);
      if (!canais.has(d.canal_id)) falhar('Canal não encontrado. Confira o nome ou o código do canal.');
      if (d.url) {
        const chave = `${d.canal_id} ${d.url}`;
        if (vistos.has(chave)) falhar(`Link repetido no arquivo (igual ao da linha ${vistos.get(chave)}).`);
        vistos.set(chave, linha);
      }
      boas.push({ ...d, linha });
    } catch (e) {
      if (!(e instanceof ErroMarketing)) throw e;
      recusadas.push({ linha, motivo: e.message });
    }
  });
  let inseridas = 0, atualizadas = 0, iguais = 0;
  for (const { linha, ...d } of boas) {
    const achou = d.url ? [...publicacoes.values()].find((p) => p.canal_id === d.canal_id && p.url === d.url) : null;
    if (!achou) { gravarPublicacao({ ...d, fonte: 'csv' }); inseridas++; continue; }
    if (achou.retirada_em) { recusadas.push({ linha, motivo: 'Esta publicação foi retirada da lista antes; o link não volta pela importação. Para trazer de volta, lance o link à mão no canal.' }); continue; }
    const novo = { data: d.data, titulo: d.titulo ?? achou.titulo };
    for (const k of ['alcance', 'impressoes', 'engajamento', 'cliques', 'leads']) novo[k] = d[k] ?? achou[k];
    if (Object.entries(novo).every(([k, v]) => achou[k] === v)) { iguais++; continue; }
    const mudou = ['alcance', 'impressoes', 'engajamento', 'cliques', 'leads'].some((k) => achou[k] !== novo[k]);
    Object.assign(achou, novo, mudou ? { fonte: 'csv', coletado_em: agora() } : {}, { versao: achou.versao + 1, atualizado_em: agora(), atualizado_por: QUEM });
    atualizadas++;
  }
  recusadas.sort((x, y) => x.linha - y.linha);
  return { inseridas, atualizadas, iguais, recusadas };
}

function salvarMetricas(b) {
  const { canal, semana, dados } = prepararMetricas({ canalId: b.canalId, semana: b.semana, numeros: b.numeros });
  if (!canais.has(canal)) falhar('Este canal não existe mais. Recarregue a página.', 404);
  const chave = `${canal}|${semana}`;
  const atual = metricas.get(chave);
  const vazio = Object.fromEntries(NUMEROS_SEMANA.map((k) => [k, null]));
  const linha = atual
    ? Object.assign(atual, dados, { fonte: 'manual', coletado_em: agora(), versao: atual.versao + 1, atualizado_em: agora(), atualizado_por: QUEM })
    : { id: crypto.randomUUID(), canal_id: canal, semana, ...vazio, ...dados, fonte: 'manual', coletado_em: agora(), versao: 1, ...carimbo() };
  metricas.set(chave, linha);
  return { metricas: metricasParaTela(linha) };
}

function carregarPadrao() {
  let nCanais = 0, nItens = 0;
  const porCodigo = new Map([...canais.values()].map((c) => [c.codigo, c.id]));
  for (const c of padrao.canais) if (!porCodigo.has(c.codigo)) { porCodigo.set(c.codigo, gravarCanal(c).id); nCanais++; }
  const codigos = new Set([...playbook.values()].map((i) => i.codigo).filter(Boolean));
  for (const i of padrao.playbook) if (!codigos.has(i.codigo)) { gravarItem(i, porCodigo.get(i.canal)); nItens++; }
  return { canais: nCanais, itens: nItens };
}

function painel() {
  const desde = somarDias(hoje, -400), desdeSemana = somarDias(segundaDaSemana(hoje), -7 * 25);
  return {
    papel: 'gestao', idPessoa: ID_PESSOA, hoje,
    canais: [...canais.values()].map(canalParaTela).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR')),
    playbook: [...playbook.values()].map(itemParaTela).sort((a, b) => a.canalId.localeCompare(b.canalId) || a.ordem - b.ordem),
    acoes: lista(),
    publicacoes: [...publicacoes.values()].filter((p) => !p.retirada_em && p.data >= desde).map(publicacaoParaTela).sort((a, b) => b.data.localeCompare(a.data)),
    metricas: [...metricas.values()].filter((m) => m.semana >= desdeSemana).map(metricasParaTela).sort((a, b) => b.semana.localeCompare(a.semana)),
    papeis: [...papeis.values()].map(papelParaTela),
    legado: { pendentes: 0 }, podeMigrar: true,
  };
}

const ACOES = {
  painel,
  pessoas: () => ({ pessoas: pessoas.map((p) => ({ ...p })), semId: 1 }),
  acoes: () => ({ acoes: lista(), legado: { pendentes: 0 }, podeMigrar: true }),
  salvarAcao,
  retirarAcao: (b) => {
    const a = acoes.get(b.id);
    if (!a) falhar('Esta ação não existe mais. Recarregue a página.', 404);
    versaoConfere(a, b.versao, 'Esta ação mudou enquanto você editava. Reabra e confira.');
    for (const [o, x] of [...vinculo]) if (x === b.id) vinculo.delete(o);
    acoes.delete(b.id);
    return {};
  },
  migrarLegado: () => ({ resultado: { total: 0, migradas: 0, vinculos: 0 } }),
  salvarCanal,
  salvarPlaybook,
  retirarPlaybook: (b) => {
    const item = itemAtivo(b.id);
    versaoConfere(item, b.versao, 'Este item do playbook mudou enquanto você editava. Reabra e confira.');
    Object.assign(item, { ativo: false, versao: item.versao + 1, atualizado_em: agora() });
    return {};
  },
  concluirPlaybook: (b) => {
    const item = itemAtivo(b.id);
    const evidencia = prepararConclusao(item, { feito: b.feito, evidencia: b.evidencia });
    versaoConfere(item, b.versao, 'Este item do playbook mudou enquanto você editava. Reabra e confira.');
    Object.assign(item, { concluido_em: b.feito ? agora() : null, concluido_por: b.feito ? QUEM : null, evidencia_valor: b.feito ? evidencia : null,
      versao: item.versao + 1, atualizado_em: agora() });
    return { item: itemParaTela(item) };
  },
  salvarPublicacao,
  retirarPublicacao: (b) => {
    const p = publicacoes.get(b.id);
    if (!p || p.retirada_em) falhar('Esta publicação não existe mais. Recarregue a página.', 404);
    versaoConfere(p, b.versao, 'Esta publicação mudou enquanto você editava. Reabra e confira.');
    Object.assign(p, { retirada_em: agora(), retirada_por: QUEM, versao: p.versao + 1 });
    return {};
  },
  importarPublicacoes,
  salvarMetricas,
  definirPapel: (b) => {
    const pedido = prepararPapel(b);
    if (pedido.papel_escolhido === null) papeis.delete(pedido.id_pessoa);
    else papeis.set(pedido.id_pessoa, { id_pessoa: pedido.id_pessoa, papel: pedido.papel_escolhido, definido_por: QUEM, definido_em: agora() });
    return {};
  },
  carregarPadrao,
};

const responder = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
export function respostaMarketing(b) {
  try {
    const fazer = Object.hasOwn(ACOES, b?.action) ? ACOES[b.action] : null;
    if (!fazer) falhar('Ação inválida.', 400);
    return responder({ ok: true, ...fazer(b) });
  } catch (e) {
    return responder({ erro: e.message }, e.status || 400);
  }
}
