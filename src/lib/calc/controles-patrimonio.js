export const CONTROLES = {
 celulares:{titulo:'Celulares',singular:'Celular',novo:'Novo celular',pessoa:'Com quem está',descricao:'Modelo, número do telefone e pessoa que está com o aparelho.'},
 ramais:{titulo:'Ramais',singular:'Ramal',novo:'Novo ramal',pessoa:'Pessoa / local',descricao:'Número, telefone e contato de cada ramal.'},
 armarios:{titulo:'Armários',singular:'Armário',novo:'Novo armário',pessoa:'Pessoa responsável',descricao:'Identifique cada armário e quem está usando.'},
 ferramentas:{titulo:'Caixas de ferramentas',singular:'Caixa de ferramentas',novo:'Nova caixa',pessoa:'Dono / responsável',descricao:'Número da caixa e pessoa responsável pelas ferramentas.'},
 camas:{titulo:'Camas',singular:'Cama',novo:'Nova cama',pessoa:'Dono / responsável',descricao:'Número da cama e pessoa que a utiliza.'},
};
const normalizar=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const temResponsavel = registro => Boolean(String(registro?.pessoa || registro?.local || '').trim());
export function resumirControles(mapa,tipo) {
 const itens=Object.values(mapa||{}).filter(r=>r.tipo===tipo);
 const atribuidos=itens.filter(temResponsavel).length;
 return {total:itens.length,atribuidos,disponiveis:itens.length-atribuidos};
}
export function listarControles(mapa,tipo,busca='',situacao='todos') {
 const termos=normalizar(busca).split(/\s+/).filter(Boolean);
 return Object.entries(mapa||{}).map(([id,r])=>({...r,id})).filter(r=>r.tipo===tipo&&(situacao==='atribuidos'?temResponsavel(r):situacao==='disponiveis'?!temResponsavel(r):true)&&termos.every(t=>normalizar([r.numero,r.modelo,r.telefone,r.local,r.pessoa,r.pessoaIdPessoa,r.observacao].join(' ')).includes(t)))
 .sort((a,b)=>String(a.numero).localeCompare(String(b.numero),'pt-BR',{numeric:true})||a.id.localeCompare(b.id));
}
// Nome digitado antes do vínculo pelo RH: tem pessoa escrita e nenhuma ficha ligada.
export const nomeSemId = r => Boolean(String(r?.pessoa || '').trim()) && !String(r?.pessoaId || '').trim();
export function semIdDoRH(mapa,tipo) {
 return Object.entries(mapa||{}).map(([id,r])=>({...r,id})).filter(r=>r.tipo===tipo&&nomeSemId(r))
  .sort((a,b)=>String(a.numero).localeCompare(String(b.numero),'pt-BR',{numeric:true})||a.id.localeCompare(b.id));
}
// O que "Vincular pelo ID" manda ao servidor: o cadastro como está, com a pessoa
// escolhida no RH, ou, no ramal sem local, o nome digitado movido para o local.
// Setor, aparelho, plano e operadora o servidor mantém (campo ausente fica como estava).
export function camposVinculoPessoa(r,pessoa) {
 const base={tipo:r.tipo,numero:r.numero,modelo:r.modelo||'',telefone:r.telefone||'',observacao:r.observacao||''};
 if(!pessoa)return {...base,pessoaId:'',pessoa:'',local:r.tipo==='ramais'&&!String(r.local||'').trim()?String(r.pessoa||'').trim():String(r.local||'')};
 // Linha ou ramal com pessoa não fica "disponível", como no formulário.
 const ocupa=['ramais','celulares'].includes(r.tipo)&&r.status==='disponivel'?{status:'ativo'}:{};
 return {...base,pessoaId:pessoa.id,pessoa:pessoa.nome,local:String(r.local||''),...ocupa};
}
export function textoAtualizacao(r) {
 if(!r?.atualizadoEm || !Number.isFinite(Date.parse(r.atualizadoEm)))return 'Sem registro de atualização';
 return `Atualizado em ${new Date(r.atualizadoEm).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} por ${r.atualizadoPorNome||r.atualizadoPor||'autor não informado'}`;
}
