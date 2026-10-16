import { ErroNewsletter, REMETENTE_ID, TIPOS_NEWSLETTER, idNewsletter, prepararNewsletter } from './newsletter.mjs';
const erroBanco = (erro) => {
  if (!erro) return;
  if (erro.code === '23505') throw new ErroNewsletter('Esse e-mail já está cadastrado. Localize o contato para editar.', 409);
  if (erro.message?.includes('NEWSLETTER_CONFLITO')) throw new ErroNewsletter('Outra alteração foi salva. Atualize antes de tentar novamente.', 409);
  if (erro.message?.includes('NEWSLETTER_SUPRIMIDO')) throw new ErroNewsletter('Contato descadastrado ou bloqueado não pode ser reativado por esta tela.', 409);
  if (erro.message?.includes('NEWSLETTER_EMAIL_IMUTAVEL')) throw new ErroNewsletter('O e-mail identifica o contato. Cadastre outro endereço separadamente.', 409);
  if (erro.message?.includes('NEWSLETTER_LISTA_INVALIDA')) throw new ErroNewsletter('Uma lista não existe mais. Atualize o público.', 409);
  throw new ErroNewsletter('Não foi possível acessar a Newsletter. Confira a implantação do servidor.', 503);
};
export async function atenderNewsletter(sb, b, { papel, quem }) {
  if (!['gestao','marketing','visualizacao'].includes(papel)) throw new ErroNewsletter('Sem acesso à Newsletter.',403);
  if (b.action === 'newsletterListar') {
    if (!TIPOS_NEWSLETTER.includes(b.tipo)) throw new ErroNewsletter('Tipo inválido.');
    let q = sb.from('painel_newsletter').select('*').eq('tipo',b.tipo).order('id').limit(201);
    if (b.cursor) q = q.gt('id',idNewsletter(b.cursor));
    const r = await q; erroBanco(r.error);
    const linhas = r.data || [];
    return { ok:true, itens:linhas.slice(0,200), proximo:linhas.length>200 ? linhas[199].id : null, envio:{disponivel:false,motivo:'Configure e verifique o serviço de envio antes de disparar e-mails.'} };
  }
  if (b.action === 'newsletterHistorico') {
    const r = await sb.from('painel_newsletter_revisoes').select('*').eq('registro_id',idNewsletter(b.id)).order('versao',{ascending:false}).limit(51);
    erroBanco(r.error); return {ok:true,revisoes:(r.data || []).slice(0,50),mais:(r.data || []).length>50};
  }
  if (papel === 'visualizacao') throw new ErroNewsletter('Seu acesso permite apenas visualizar.',403);
  if (b.action === 'newsletterEnviar') throw new ErroNewsletter('Envio ainda não conectado. Nenhum e-mail foi enviado.',409);
  if (b.action !== 'newsletterSalvar') throw new ErroNewsletter('Ação inválida.',400);
  if (b.tipo === 'remetente' && papel !== 'gestao') throw new ErroNewsletter('Somente a gestão configura o remetente.',403);
  const id = idNewsletter(b.id);
  if (b.tipo === 'remetente' && id !== REMETENTE_ID) throw new ErroNewsletter('Remetente inválido.');
  if (b.versao != null && (!Number.isSafeInteger(b.versao) || b.versao<1)) throw new ErroNewsletter('Versão inválida.');
  const dados = prepararNewsletter(b.tipo,b.dados);
  const r = await sb.rpc('painel_newsletter_salvar',{p_id:id,p_tipo:b.tipo,p_dados:dados,p_versao:b.versao ?? null,p_quem:quem});
  erroBanco(r.error); return {ok:true,item:r.data};
}
