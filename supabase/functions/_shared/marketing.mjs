/* AS REGRAS DO MARKETING QUE O SERVIDOR E A TELA DIVIDEM.
 *
 * Centro de Comando do Marketing (especificação do Léo, 10/10/2026). Este
 * arquivo mora em _shared porque a Edge Function painel-marketing é quem
 * decide; a tela importa daqui para avisar antes de mandar, e o teste em
 * tests/marketing.test.mjs prova as duas coisas de uma vez.
 *
 * O banco guarda (supabase/migrations/20261010a_marketing_base.sql); aqui
 * fica o que é regra de campo: tamanho, formato, situação, dinheiro.
 */

export class ErroMarketing extends Error {
  constructor(mensagem, status = 422) { super(mensagem); this.status = status; }
}

// As situações de hoje, as mesmas da tela antiga. Ficam no código de
// propósito: o banco confere a mesma lista (check da tabela), e uma situação
// nova muda a régua de "atrasada" e os relatórios, não é ajuste de tela.
export const SITUACOES_ACAO = ['Ideia', 'Produção', 'Aprovação', 'Programada', 'Publicada', 'Encerrada'];
export const SITUACOES_FEITAS = ['Publicada', 'Encerrada'];

const ID_ORCAMENTO = /^[A-Za-z0-9_.-]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(valor, max, rotulo, obrigatorio = false) {
  const t = valor == null ? '' : String(valor).replace(/\s+/g, ' ').trim();
  if (obrigatorio && !t) throw new ErroMarketing(`Preencha ${rotulo}.`);
  if (t.length > max) throw new ErroMarketing(`${rotulo[0].toUpperCase()}${rotulo.slice(1)} passou de ${max} letras.`);
  return t || null;
}

function dataValida(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return a >= 2000 && a <= 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Confere e normaliza o que a tela mandou. Devolve os campos no formato da
 *  tabela e a lista de orçamentos (ids do ERP, sem repetição). */
export function prepararAcao(entrada) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) throw new ErroMarketing('Ação inválida.', 400);
  const nome = texto(entrada.nome, 200, 'o nome da ação', true);
  const responsavel = texto(entrada.responsavel, 120, 'o responsável', true);
  const prazo = String(entrada.prazo ?? '');
  if (!dataValida(prazo)) throw new ErroMarketing('Informe um prazo válido.');
  const situacao = entrada.status == null || entrada.status === '' ? 'Ideia' : String(entrada.status);
  if (!SITUACOES_ACAO.includes(situacao)) throw new ErroMarketing('Situação inválida.');
  const investimento = entrada.investimento == null || entrada.investimento === '' ? 0 : Number(entrada.investimento);
  if (!Number.isFinite(investimento) || investimento < 0) throw new ErroMarketing('O investimento não pode ser negativo.');
  if (investimento > 1e9) throw new ErroMarketing('Investimento alto demais. Confira o valor.');
  const url = texto(entrada.url, 500, 'o link');
  if (url && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url)) throw new ErroMarketing('O link precisa começar com http:// ou https://.');
  const lista = entrada.orcamentos == null ? [] : entrada.orcamentos;
  if (!Array.isArray(lista) || lista.length > 300) throw new ErroMarketing('Lista de orçamentos inválida.');
  const orcamentos = [...new Set(lista.map((o) => String(o ?? '').trim()).filter(Boolean))];
  if (orcamentos.some((o) => !ID_ORCAMENTO.test(o))) throw new ErroMarketing('Orçamento inválido na lista.');
  return {
    dados: {
      nome,
      objetivo: texto(entrada.objetivo, 500, 'o objetivo'),
      publico: texto(entrada.publico, 300, 'o público'),
      canal_texto: texto(entrada.canal, 120, 'o canal'),
      responsavel_texto: responsavel,
      prazo,
      situacao,
      investimento: Math.round(investimento * 100) / 100,
      url,
    },
    orcamentos: orcamentos.sort(),
  };
}

export function idAcao(id) {
  if (typeof id !== 'string' || !UUID.test(id)) throw new ErroMarketing('Ação inválida.', 400);
  return id.toLowerCase();
}

/** Linha do banco no formato que a tela usa (os nomes de campo da tela
 *  antiga, para nada mudar para quem já usava). */
export function acaoParaTela(linha, orcamentos = []) {
  return {
    id: linha.id,
    nome: linha.nome,
    objetivo: linha.objetivo ?? '',
    publico: linha.publico ?? '',
    canal: linha.canal_texto ?? '',
    responsavel: linha.responsavel_texto ?? '',
    prazo: linha.prazo,
    status: linha.situacao,
    investimento: Number(linha.investimento ?? 0),
    url: linha.url ?? '',
    orcamentos: [...orcamentos].sort(),
    versao: linha.versao,
    criadoEm: linha.criado_em ?? null,
    atualizadoEm: linha.atualizado_em ?? null,
    migrada: !!linha.legado_id,
  };
}

/** Direção: quem tem o painel inteiro. A mesma régua da lixeira de
 *  cadastros (master ou "*"). */
export const ehDirecaoMarketing = (s) => s?.master === true || (Array.isArray(s?.perms) && s.perms.includes('*'));
export const podeMarketing = (s) => ehDirecaoMarketing(s) || (Array.isArray(s?.perms) && s.perms.includes('marketing'));

/** Erro do banco em mensagem para gente. */
export function erroDoBanco(error) {
  const code = error?.code;
  if (code === '40001') return new ErroMarketing('Esta ação mudou enquanto você editava. Reabra e confira.', 409);
  if (code === 'P0002') return new ErroMarketing('Esta ação não existe mais. Recarregue a página.', 404);
  if (code === '23505') {
    let d = null;
    try { d = JSON.parse(error.details || 'null'); } catch { d = null; }
    if (d?.orcamento) return new ErroMarketing(`O orçamento ${d.orcamento} já está na ação "${d.acao}". Um orçamento só pode estar numa ação, para a venda não ser contada duas vezes.`, 409);
    if (/repetido/i.test(error.message || '')) return new ErroMarketing(String(error.message), 409);
    return new ErroMarketing('Um desses orçamentos já está ligado a outra ação. Recarregue e confira.', 409);
  }
  return null;
}
