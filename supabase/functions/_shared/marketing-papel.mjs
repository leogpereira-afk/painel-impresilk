// O PAPEL DE QUEM ENTROU, DENTRO DO MARKETING. Duas portas gravam coisas do
// Marketing: a painel-marketing (canais, playbook, ações, números) e a
// painel-ativos (logomarca, papel timbrado e os outros materiais). As duas
// leem o papel daqui, para "visualização" valer igual nas duas: uma regra
// copiada em dois lugares deixa de bater no primeiro conserto.
import { ehDirecaoMarketing, idPessoaDasContas, papelEfetivo } from "./marketing.mjs";

/* O id_pessoa de quem entrou: a conta cujo usuário é o login, ou a conta
   ligada a ele pelo papel do Painel (a mesma busca do identidadeRH em
   painel-processos). Duas contas, ou nenhuma: nulo. */
export async function idPessoaDoLogin(sb, login) {
  const [{ data: diretas, error: e1 }, { data: papeis, error: e2 }] = await Promise.all([
    sb.from('acesso_conta').select('id').eq('usuario', login),
    sb.from('acesso_papel').select('conta_id').eq('sistema', 'painel').eq('login', login),
  ]);
  if (e1 || e2) throw e1 || e2;
  const ids = [...new Set([...(diretas || []).map((x) => x.id), ...(papeis || []).map((x) => x.conta_id)].filter(Boolean))];
  if (ids.length !== 1) return null;
  const { data, error } = await sb.from('acesso_conta').select('id_pessoa').in('id', ids);
  if (error) throw error;
  return idPessoaDasContas(data || []);
}

export async function papelDaPessoa(sb, idPessoa) {
  const { data, error } = await sb.from('painel_mkt_papeis').select('papel').eq('id_pessoa', idPessoa).maybeSingle();
  if (error) throw error;
  return data;
}

/** Papel efetivo da sessão: a direção é gestão sem consultar nada; os
 *  outros, o que painel_mkt_papeis diz (sem linha, marketing). */
export async function papelNoMarketing(sb, s) {
  if (ehDirecaoMarketing(s)) return 'gestao';
  const id = await idPessoaDoLogin(sb, s?.sub);
  return papelEfetivo(s, id ? await papelDaPessoa(sb, id) : null);
}

export const papelGrava = (papel) => papel === 'gestao' || papel === 'marketing';
