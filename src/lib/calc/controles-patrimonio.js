export const CONTROLES = {
 celulares:{titulo:'Celulares',singular:'Celular',novo:'Novo celular',pessoa:'Com quem está',descricao:'Modelo, número do telefone e pessoa que está com o aparelho.'},
 ramais:{titulo:'Ramais',singular:'Ramal',novo:'Novo ramal',pessoa:'Pessoa / local',descricao:'Número, telefone e contato de cada ramal.'},
 armarios:{titulo:'Armários',singular:'Armário',novo:'Novo armário',pessoa:'Pessoa responsável',descricao:'Identifique cada armário e quem está usando.'},
 ferramentas:{titulo:'Caixas de ferramentas',singular:'Caixa de ferramentas',novo:'Nova caixa',pessoa:'Dono / responsável',descricao:'Número da caixa e pessoa responsável pelas ferramentas.'},
 camas:{titulo:'Camas',singular:'Cama',novo:'Nova cama',pessoa:'Dono / responsável',descricao:'Número da cama e pessoa que a utiliza.'},
};
const normalizar=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const temResponsavel = registro => Boolean(String(registro?.pessoa ?? '').trim());
export function resumirControles(mapa,tipo) {
 const itens=Object.values(mapa||{}).filter(r=>r.tipo===tipo);
 const atribuidos=itens.filter(temResponsavel).length;
 return {total:itens.length,atribuidos,disponiveis:itens.length-atribuidos};
}
export function listarControles(mapa,tipo,busca='',situacao='todos') {
 const termos=normalizar(busca).split(/\s+/).filter(Boolean);
 return Object.entries(mapa||{}).map(([id,r])=>({...r,id})).filter(r=>r.tipo===tipo&&(situacao==='atribuidos'?temResponsavel(r):situacao==='disponiveis'?!temResponsavel(r):true)&&termos.every(t=>normalizar([r.numero,r.modelo,r.telefone,r.pessoa,r.observacao].join(' ')).includes(t)))
 .sort((a,b)=>String(a.numero).localeCompare(String(b.numero),'pt-BR',{numeric:true})||a.id.localeCompare(b.id));
}
export function textoAtualizacao(r) {
 if(!r?.atualizadoEm || !Number.isFinite(Date.parse(r.atualizadoEm)))return 'Sem registro de atualização';
 return `Atualizado em ${new Date(r.atualizadoEm).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} por ${r.atualizadoPorNome||r.atualizadoPor||'autor não informado'}`;
}
