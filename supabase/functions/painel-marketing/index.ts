/* PORTA DO CENTRO DE COMANDO DO MARKETING.
 *
 * Etapa a1 (10/10/2026): as ações do Marketing e a trava de orçamento saem da
 * coleção genérica e passam a morar nas tabelas painel_mkt_* (ver
 * supabase/migrations/20261010a_marketing_base.sql). A tela nunca fala com o
 * banco: tudo passa aqui, com crachá e módulo conferidos no topo.
 *
 * Etapa a2 (11/10/2026): canais, playbook, publicações, números da semana e
 * papéis internos (20261011a_marketing_canais.sql; contrato em
 * docs/marketing/a2-contrato.md). O PAPEL dentro do Marketing é decidido
 * aqui, nunca pela tela:
 *  - direção (master ou "*") é sempre gestão;
 *  - os outros: o papel da pessoa em painel_mkt_papeis, achada pelo
 *    id_pessoa do login; sem linha (ou sem id_pessoa), marketing;
 *  - gestão mexe em canal, playbook e papéis; marketing e gestão lançam e
 *    concluem; visualização só olha.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { verificarJwt, crachaRevogado } from '../_shared/cripto.ts';
import {
  ErroMarketing, prepararAcao, idAcao, idMarketing, acaoParaTela, ehDirecaoMarketing, podeMarketing, papelEfetivo,
  prepararCanal, canalParaTela, prepararItemPlaybook, itemParaTela, prepararConclusao, prepararPublicacao, prepararLinhaCsv,
  publicacaoParaTela, prepararMetricas, metricasParaTela, prepararPapel, papelParaTela, pessoasParaMarketing, padraoParaBanco,
  erroDoBanco, hojeSP, somarDias, segundaDaSemana, LIMITE_LINHAS_CSV,
} from '../_shared/marketing.mjs';
import { CANAIS_PADRAO, PLAYBOOK_PADRAO } from '../_shared/marketing-padrao.mjs';
import { idPessoaDoLogin, papelDaPessoa } from '../_shared/marketing-papel.mjs';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const JWT_SECRET = Deno.env.get('PAINEL_JWT_SECRET') || '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (x: any, status = 200) => new Response(JSON.stringify(x), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const PASSO = 500;
// O maior pedido é a importação de CSV (até 2000 linhas com link e título).
const LIMITE_PEDIDO = 2_000_000;
// O que o "painel" devolve de números: o bastante para comparar períodos e
// montar o calendário, sem carregar o histórico inteiro a cada abertura.
const DIAS_PUBLICACOES = 400;
const SEMANAS_METRICAS = 26;

const SO_VER = 'Seu papel no Marketing é só de visualização.';
const SO_GESTAO = 'Só a gestão do Marketing mexe nisso.';
/* Quem grava. Visualização só olha; canal, playbook e papéis são da gestão. */
const podeGravar = (papel: string) => papel === 'gestao' || papel === 'marketing';
const ehGestao = (papel: string) => papel === 'gestao';

/* Leitura paginada: o PostgREST corta em 1000 linhas sem avisar. */
async function todas(tabela: string, colunas: string, filtro: (q: any) => any, ordem: string) {
  const out: any[] = [];
  for (let pag = 0; pag < 200; pag++) {
    const { data, error } = await filtro(sb.from(tabela).select(colunas)).order(ordem).range(pag * PASSO, pag * PASSO + PASSO - 1);
    if (error) throw error;
    out.push(...(data || []));
    if ((data || []).length < PASSO) return out;
  }
  throw new Error('Limite de leitura atingido.');
}

async function lerUm(tabela: string, id: string) {
  const { data, error } = await sb.from(tabela).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

/* Ações antigas (coleção "marketing", tipo "acao") que ainda não vieram
   para a tabela. Em 10/10/2026 eram zero; a conta existe para ninguém
   perder uma ação criada na tela velha antes da troca. */
async function pendentesDoLegado() {
  const antigas = await todas('painel_registros', 'id', (q) => q.eq('colecao', 'marketing').eq('registro->>tipo', 'acao'), 'id');
  if (!antigas.length) return 0;
  const migradas = await todas('painel_mkt_acoes', 'legado_id', (q) => q.not('legado_id', 'is', null), 'legado_id');
  const ja = new Set(migradas.map((m: any) => m.legado_id));
  return antigas.filter((a: any) => !ja.has(a.id)).length;
}

async function listarAcoes() {
  const linhas = await todas('painel_mkt_acoes', '*', (q) => q.is('retirada_em', null), 'id');
  const vinculos = await todas('painel_mkt_orcamento_vinculo', 'orcamento_id,acao_id', (q) => q, 'orcamento_id');
  const porAcao = new Map<string, string[]>();
  for (const v of vinculos) {
    const l = porAcao.get(v.acao_id) || [];
    l.push(v.orcamento_id);
    porAcao.set(v.acao_id, l);
  }
  return linhas.map((l: any) => acaoParaTela(l, porAcao.get(l.id) || []));
}

/* O RH, como as Reuniões leem (registros, sem apagados). O CPF entra aqui só
   para virar id_pessoa em pessoasParaMarketing; não sai desta porta. */
async function lerRH(colecao: string, colunas: string) {
  const itens: any[] = [];
  for (let pag = 0; pag < 100; pag++) {
    const { data, error } = await sb.from('registros').select(colunas).eq('colecao', colecao).eq('apagado', false).order('id').range(pag * PASSO, pag * PASSO + PASSO - 1);
    if (error) throw error;
    itens.push(...(data || []));
    if ((data || []).length < PASSO) return itens;
  }
  throw new Error('Limite de leitura do RH atingido.');
}

async function pessoasMarketing() {
  const [colaboradores, status, areas, cargos] = await Promise.all([
    lerRH('colaboradores', 'id,nome:registro->>nome,cpf:registro->>cpf,areaId:registro->>areaId,cargoId:registro->>cargoId,statusId:registro->>statusId,dataDesligamento:registro->>dataDesligamento,ehDirecao:registro->>ehDirecao'),
    lerRH('status', 'id,contaComoAtivo:registro->>contaComoAtivo'),
    lerRH('areas', 'id,nome:registro->>nome'),
    lerRH('cargos', 'id,nome:registro->>nome'),
  ]);
  return pessoasParaMarketing(colaboradores, status, areas, cargos);
}

/* O banco responde; o erro dele vira mensagem para gente. A chamada fica
   escrita no ramo, `rpc(sb.rpc('painel_mkt_...'), ...)`, e não escondida
   aqui dentro: é assim que o scripts/conferir-papel.mjs enxerga que o ramo
   grava e cobra dele a conferência do papel. */
async function rpc(chamada: PromiseLike<any>, contexto: string) {
  const { data, error } = await chamada;
  if (error) {
    const humano = erroDoBanco(error, contexto);
    if (humano) throw humano;
    throw error;
  }
  return data;
}

const objeto = (x: any) => !!x && typeof x === 'object' && !Array.isArray(x);
const porOrdem = (a: any, b: any) => a.ordem - b.ordem || String(a.nome ?? a.titulo).localeCompare(String(b.nome ?? b.titulo), 'pt-BR');

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ erro: 'Use POST.' }, 405);
  try {
    if (!JWT_SECRET) return json({ erro: 'Acesso não configurado.' }, 503);
    const token = (req.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i)?.[1];
    const s = token ? await verificarJwt(token, JWT_SECRET) : null;
    if (!s || typeof s.sub !== 'string' || !s.sub || await crachaRevogado(sb, 'painel', s)) return json({ erro: 'Entre novamente.', semSessao: true }, 401);
    if (!podeMarketing(s)) return json({ erro: 'Sem acesso ao Marketing.' }, 403);
    const raw = await req.text();
    if (raw.length > LIMITE_PEDIDO) return json({ erro: 'Pedido grande demais.' }, 413);
    let b: any;
    try { b = JSON.parse(raw); } catch { return json({ erro: 'Pedido inválido.' }, 400); }
    if (!b || typeof b !== 'object' || Array.isArray(b)) return json({ erro: 'Pedido inválido.' }, 400);
    const quem = s.sub;

    // PAPEL EFETIVO. A direção é gestão sem consultar nada (o id_pessoa dela
    // só é buscado para devolver no "painel").
    const direcao = ehDirecaoMarketing(s);
    const idPessoaLogin = direcao && b.action !== 'painel' ? null : await idPessoaDoLogin(sb, quem);
    const papel = papelEfetivo(s, direcao || !idPessoaLogin ? null : await papelDaPessoa(sb, idPessoaLogin));

    switch (b.action) {
      case "painel": {
        const hoje = hojeSP();
        const [acoes, pendentes, canais, playbook, publicacoes, metricas, papeis] = await Promise.all([
          listarAcoes(),
          pendentesDoLegado(),
          todas('painel_mkt_canais', '*', (q) => q, 'id'),
          todas('painel_mkt_playbook', '*', (q) => q, 'id'),
          todas('painel_mkt_publicacoes', '*', (q) => q.is('retirada_em', null).gte('data', somarDias(hoje, -DIAS_PUBLICACOES)), 'id'),
          todas('painel_mkt_metricas_canal', '*', (q) => q.gte('semana', somarDias(segundaDaSemana(hoje), -7 * (SEMANAS_METRICAS - 1))), 'id'),
          // A lista de papéis é da tela de Configurações, que só a gestão vê.
          papel === 'gestao' ? todas('painel_mkt_papeis', '*', (q) => q, 'id_pessoa') : Promise.resolve([] as any[]),
        ]);
        return json({
          ok: true, papel, idPessoa: idPessoaLogin, hoje,
          canais: canais.map(canalParaTela).sort(porOrdem),
          playbook: playbook.map(itemParaTela).sort((x: any, y: any) => String(x.canalId).localeCompare(String(y.canalId)) || porOrdem(x, y)),
          acoes,
          publicacoes: publicacoes.map(publicacaoParaTela).sort((x: any, y: any) => y.data.localeCompare(x.data) || String(x.id).localeCompare(String(y.id))),
          metricas: metricas.map(metricasParaTela).sort((x: any, y: any) => y.semana.localeCompare(x.semana) || String(x.canalId).localeCompare(String(y.canalId))),
          papeis: papeis.map(papelParaTela),
          legado: { pendentes },
          podeMigrar: direcao,
        });
      }
      case "pessoas": {
        // Só id, nome e setor; o CPF fica no servidor.
        return json({ ok: true, ...(await pessoasMarketing()) });
      }
      case "acoes": {
        const [acoes, pendentes] = await Promise.all([listarAcoes(), pendentesDoLegado()]);
        return json({ ok: true, acoes, legado: { pendentes }, podeMigrar: direcao });
      }
      case "salvarAcao": {
        if (!podeGravar(papel)) return json({ erro: SO_VER }, 403);
        const { dados, orcamentos } = prepararAcao(b.acao);
        const id = b.acao?.id ? idAcao(b.acao.id) : null;
        // Ação NOVA chega com o id gerado na tela (novo: true) e sem versão:
        // repetir o pedido depois de uma resposta perdida devolve a mesma ação.
        const novo = b.novo === true;
        const versao = id && !novo ? Number(b.versao) : null;
        if (id && !novo && !Number.isInteger(versao)) return json({ erro: 'Versão da ação ausente. Recarregue a página.' }, 409);
        const linha = await rpc(sb.rpc('painel_mkt_salvar_acao', { p_id: id, p_dados: dados, p_orcamentos: orcamentos, p_versao: versao, p_quem: quem }), 'acao');
        return json({ ok: true, acao: acaoParaTela(linha, linha.orcamentos || []) });
      }
      case "retirarAcao": {
        // Na a1 qualquer um com o módulo retirava; com papéis, visualização
        // não grava nada, nem retirar.
        if (!podeGravar(papel)) return json({ erro: SO_VER }, 403);
        const id = idAcao(b.id);
        if (!Number.isInteger(b.versao)) return json({ erro: 'Versão da ação ausente. Recarregue a página.' }, 409);
        await rpc(sb.rpc('painel_mkt_retirar_acao', { p_id: id, p_versao: b.versao, p_quem: quem }), 'acao');
        return json({ ok: true });
      }
      case "migrarLegado": {
        // Mexe no dado de todo mundo: só a direção, conferido aqui.
        if (!ehDirecaoMarketing(s)) return json({ erro: 'Só a direção traz as ações antigas.' }, 403);
        const resultado = await rpc(sb.rpc('painel_mkt_migrar_legado', { p_quem: quem }), 'acao');
        return json({ ok: true, resultado });
      }
      case "salvarCanal": {
        if (!ehGestao(papel)) return json({ erro: SO_GESTAO }, 403);
        if (!objeto(b.canal)) return json({ erro: 'Canal inválido.' }, 400);
        const id = b.canal.id ? idMarketing(b.canal.id, 'Canal inválido.') : null;
        const editar = !!id && b.novo !== true;
        let dados;
        if (editar) {
          if (!Number.isInteger(b.versao)) return json({ erro: 'Versão do canal ausente. Recarregue a página.' }, 409);
          // O canal vai inteiro para o banco: o que a tela não mandou vem do
          // que está gravado (mudar só a ordem não zera o resto).
          const atual = await lerUm('painel_mkt_canais', id);
          if (!atual) return json({ erro: 'Este canal não existe mais. Recarregue a página.' }, 404);
          dados = prepararCanal({ ...canalParaTela(atual), ...b.canal }, { novo: false, codigoAtual: atual.codigo });
        } else {
          dados = prepararCanal(b.canal, { novo: true });
        }
        const linha = await rpc(sb.rpc('painel_mkt_salvar_canal', { p_id: id, p_dados: dados, p_versao: editar ? b.versao : null, p_quem: quem }), 'canal');
        return json({ ok: true, canal: canalParaTela(linha) });
      }
      case "salvarPlaybook": {
        if (!ehGestao(papel)) return json({ erro: SO_GESTAO }, 403);
        if (!objeto(b.item)) return json({ erro: 'Item do playbook inválido.' }, 400);
        const id = b.item.id ? idMarketing(b.item.id, 'Item do playbook inválido.') : null;
        const editar = !!id && b.novo !== true;
        let dados;
        if (editar) {
          if (!Number.isInteger(b.versao)) return json({ erro: 'Versão do item ausente. Recarregue a página.' }, 409);
          const atual = await lerUm('painel_mkt_playbook', id);
          if (!atual) return json({ erro: 'Este item do playbook não existe mais. Recarregue a página.' }, 404);
          dados = prepararItemPlaybook({ ...itemParaTela(atual), ...b.item });
        } else {
          dados = prepararItemPlaybook(b.item);
        }
        const linha = await rpc(sb.rpc('painel_mkt_salvar_playbook', { p_id: id, p_dados: dados, p_versao: editar ? b.versao : null, p_quem: quem }), 'playbook');
        return json({ ok: true, item: itemParaTela(linha) });
      }
      case "retirarPlaybook": {
        if (!ehGestao(papel)) return json({ erro: SO_GESTAO }, 403);
        const id = idMarketing(b.id, 'Item do playbook inválido.');
        if (!Number.isInteger(b.versao)) return json({ erro: 'Versão do item ausente. Recarregue a página.' }, 409);
        await rpc(sb.rpc('painel_mkt_retirar_playbook', { p_id: id, p_versao: b.versao, p_quem: quem }), 'playbook');
        return json({ ok: true });
      }
      case "concluirPlaybook": {
        if (!podeGravar(papel)) return json({ erro: SO_VER }, 403);
        const id = idMarketing(b.id, 'Item do playbook inválido.');
        if (!Number.isInteger(b.versao)) return json({ erro: 'Versão do item ausente. Recarregue a página.' }, 409);
        // A evidência que o item pede (link, texto) depende do item gravado,
        // não do que a tela acha que ele pede.
        const atual = await lerUm('painel_mkt_playbook', id);
        if (!atual || atual.ativo === false) return json({ erro: 'Este item do playbook não existe mais. Recarregue a página.' }, 404);
        const evidencia = prepararConclusao(atual, { feito: b.feito, evidencia: b.evidencia });
        const linha = await rpc(sb.rpc('painel_mkt_concluir_playbook', { p_id: id, p_versao: b.versao, p_feito: b.feito, p_evidencia: evidencia, p_quem: quem }), 'playbook');
        return json({ ok: true, item: itemParaTela(linha) });
      }
      case "salvarPublicacao": {
        if (!podeGravar(papel)) return json({ erro: SO_VER }, 403);
        if (!objeto(b.publicacao)) return json({ erro: 'Publicação inválida.' }, 400);
        const id = b.publicacao.id ? idMarketing(b.publicacao.id, 'Publicação inválida.') : null;
        const editar = !!id && b.novo !== true;
        let dados;
        if (editar) {
          if (!Number.isInteger(b.versao)) return json({ erro: 'Versão da publicação ausente. Recarregue a página.' }, 409);
          const atual = await lerUm('painel_mkt_publicacoes', id);
          if (!atual || atual.retirada_em) return json({ erro: 'Esta publicação não existe mais. Recarregue a página.' }, 404);
          dados = prepararPublicacao({ ...publicacaoParaTela(atual), ...b.publicacao });
        } else {
          dados = prepararPublicacao(b.publicacao);
        }
        const linha = await rpc(sb.rpc('painel_mkt_salvar_publicacao', { p_id: id, p_dados: { ...dados, fonte: 'manual' }, p_versao: editar ? b.versao : null, p_quem: quem }), 'publicacao');
        return json({ ok: true, publicacao: publicacaoParaTela(linha) });
      }
      case "retirarPublicacao": {
        if (!podeGravar(papel)) return json({ erro: SO_VER }, 403);
        const id = idMarketing(b.id, 'Publicação inválida.');
        if (!Number.isInteger(b.versao)) return json({ erro: 'Versão da publicação ausente. Recarregue a página.' }, 409);
        await rpc(sb.rpc('painel_mkt_retirar_publicacao', { p_id: id, p_versao: b.versao, p_quem: quem }), 'publicacao');
        return json({ ok: true });
      }
      case "importarPublicacoes": {
        if (!podeGravar(papel)) return json({ erro: SO_VER }, 403);
        const linhas = b.linhas;
        if (!Array.isArray(linhas) || !linhas.length) return json({ erro: 'O arquivo não tem linhas para importar.' }, 422);
        if (linhas.length > LIMITE_LINHAS_CSV) return json({ erro: `Importe até ${LIMITE_LINHAS_CSV} linhas por vez.` }, 422);
        // LINHA RUIM NÃO DERRUBA O ARQUIVO: cada uma é conferida aqui e a
        // recusada volta com o motivo; as boas entram juntas, numa transação.
        const canais = new Set((await todas('painel_mkt_canais', 'id', (q) => q, 'id')).map((c: any) => c.id));
        const boas: any[] = [], recusadas: { linha: number; motivo: string }[] = [], vistos = new Map<string, number>();
        linhas.forEach((l: any, i: number) => {
          const linha = Number.isInteger(l?.linha) ? l.linha : i + 1;
          try {
            const d = prepararLinhaCsv(l);
            if (!canais.has(d.canal_id)) throw new ErroMarketing('Canal não encontrado. Confira o nome ou o código do canal.');
            if (d.url) {
              const chave = `${d.canal_id} ${d.url}`;
              if (vistos.has(chave)) throw new ErroMarketing(`Link repetido no arquivo (igual ao da linha ${vistos.get(chave)}).`);
              vistos.set(chave, linha);
            }
            boas.push({ ...d, linha });
          } catch (e) {
            if (!(e instanceof ErroMarketing)) throw e;
            recusadas.push({ linha, motivo: e.message });
          }
        });
        let r: any = { inseridas: 0, atualizadas: 0, iguais: 0, retiradas: [] };
        if (boas.length) r = await rpc(sb.rpc('painel_mkt_importar_publicacoes', { p_linhas: boas, p_quem: quem }), 'publicacao');
        for (const linha of r.retiradas || []) recusadas.push({ linha, motivo: 'Esta publicação foi retirada da lista antes; o link não volta pela importação. Para trazer de volta, lance o link à mão no canal.' });
        recusadas.sort((x, y) => x.linha - y.linha);
        return json({ ok: true, inseridas: r.inseridas, atualizadas: r.atualizadas, iguais: r.iguais, recusadas });
      }
      case "salvarMetricas": {
        if (!podeGravar(papel)) return json({ erro: SO_VER }, 403);
        const { canal, semana, dados } = prepararMetricas({ canalId: b.canalId, semana: b.semana, numeros: b.numeros });
        const linha = await rpc(sb.rpc('painel_mkt_salvar_metricas', { p_canal: canal, p_semana: semana, p_dados: { ...dados, fonte: 'manual' }, p_quem: quem }), 'metricas');
        return json({ ok: true, metricas: metricasParaTela(linha) });
      }
      case "definirPapel": {
        if (!ehGestao(papel)) return json({ erro: SO_GESTAO }, 403);
        const pedido = prepararPapel(b);
        await rpc(sb.rpc('painel_mkt_definir_papel', { p_id_pessoa: pedido.id_pessoa, p_papel: pedido.papel_escolhido, p_quem: quem }), 'papel');
        return json({ ok: true });
      }
      case "carregarPadrao": {
        if (!ehGestao(papel)) return json({ erro: SO_GESTAO }, 403);
        const padrao = padraoParaBanco(CANAIS_PADRAO, PLAYBOOK_PADRAO);
        const r = await rpc(sb.rpc('painel_mkt_carregar_padrao', { p_padrao: padrao, p_quem: quem }), 'canal');
        return json({ ok: true, canais: r.canais, itens: r.itens });
      }
      default:
        return json({ erro: 'Ação inválida.' }, 400);
    }
  } catch (e) {
    if (e instanceof ErroMarketing) return json({ erro: e.message }, e.status);
    console.error('painel-marketing', e);
    return json({ erro: 'Não foi possível concluir. Tente novamente.' }, 500);
  }
});
