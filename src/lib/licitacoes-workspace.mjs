// Navegação e filtros locais. Não alteram o acervo nem os registros salvos.
export function visaoLicitacoes(parametros) {
  const explicita=parametros.get('visao');
  if(['acompanhamento','pesquisa','interesses','regioes','empresas','resultados','documentos','cadastros'].includes(explicita))return explicita;
  if(['documentos','cadastros'].includes(parametros.get('aba')))return parametros.get('aba');
  return parametros.get('relatorio')||parametros.get('item')?'pesquisa':'acompanhamento';
}
const hojeLocal=()=>{const data=new Date();return `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`;};
export function pendenteAcompanhamento(item,hoje=hojeLocal()) {
  const prazo=item.acompanhamento?.prazoAcao;
  return (item.dias!==null&&item.dias<0)||(!!prazo&&prazo<hoje)||!item.responsavel?.trim()||!item.dataAcompanhamento||
    (item.acompanhamento?.checklist||[]).some(p=>!p.feito);
}
const normalizar=valor=>String(valor||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function filtrarAcompanhamento(itens,{busca='',filtro='todos',hoje}={}) {
  const termos=normalizar(busca).trim().split(/\s+/).filter(Boolean);
  return itens.filter(item=>{
    const texto=normalizar([item.nome,item.identificacao,item.edital,item.responsavel,item.categoria,item.acompanhamento?.proximaAcao].filter(Boolean).join(' '));
    if(!termos.every(t=>texto.includes(t)))return false;
    if(filtro==='semana')return item.dias!==null&&item.dias>=0&&item.dias<=7;
    if(filtro==='pendentes')return pendenteAcompanhamento(item,hoje);
    return filtro==='todos'||item.status===filtro;
  });
}

export const LIMITES_PREPARACAO={proximaAcao:500,decisao:2000,resultado:2000,textoChecklist:300,itensChecklist:30};
export function erroPreparacao(acompanhamento={}){
  for(const [campo,rotulo] of [['proximaAcao','Próxima ação'],['decisao','Decisão'],['resultado','Resultado']])if(String(acompanhamento[campo]||'').length>LIMITES_PREPARACAO[campo])return `${rotulo}: limite de ${LIMITES_PREPARACAO[campo]} caracteres. Seu texto foi mantido para revisão.`;
  if((acompanhamento.checklist||[]).length>30)return 'Checklist: limite de 30 itens. Revise as etapas antes de salvar.';
  if((acompanhamento.checklist||[]).some(c=>String(c.texto||'').length>300))return 'Cada descrição do checklist aceita até 300 caracteres. Seu texto foi mantido para revisão.';
  return '';
}

const CAMPOS_REVISAO=[['nome','Objeto'],['identificacao','Órgão'],['categoria','Modalidade'],['edital','Edital'],['validade','Data da sessão'],['hora','Hora'],['url','Portal'],['status','Situação'],['responsavel','Responsável'],['observacao','Observações'],['valor','Valor estimado'],['acompanhamento.proximaAcao','Próxima ação'],['acompanhamento.prazoAcao','Prazo da ação'],['acompanhamento.decisao','Decisão'],['acompanhamento.resultado','Resultado'],['acompanhamento.checklist','Checklist'],['acompanhamento.valorContratado','Valor contratado']];
// Os três valores usam o mesmo formato do formulário (inclusive números pt-BR).
// Campos intocados seguem a versão atual; alterações em ambos os lados exigem escolha.
export function revisarRascunhoLicitacao({base,rascunho,atual,escolhas={}}){
  const form=structuredClone(rascunho),diferencas=[];
  const ler=(obj,campo)=>campo.split('.').reduce((v,k)=>v?.[k],obj)??(campo.endsWith('.checklist')?[]:'');
  const igual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  let pendentes=0;
  for(const [campo,rotulo] of CAMPOS_REVISAO){
    const antes=ler(base,campo),local=ler(rascunho,campo),remoto=ler(atual,campo);
    const alteradoLocal=!igual(local,antes),alteradoRemoto=!igual(remoto,antes),conflito=alteradoLocal&&alteradoRemoto&&!igual(local,remoto);
    const escolha=conflito?escolhas[campo]:alteradoLocal?'rascunho':'atual';
    if(conflito&&!['rascunho','atual'].includes(escolha))pendentes+=1;
    const valor=escolha==='atual'?remoto:local;
    if(campo.startsWith('acompanhamento.'))form.acompanhamento={...form.acompanhamento,[campo.split('.')[1]]:structuredClone(valor)};
    else form[campo]=structuredClone(valor);
    if(!igual(local,remoto))diferencas.push({campo,rotulo,local,remoto,conflito,escolha});
  }
  return {form,diferencas,pendentes};
}
