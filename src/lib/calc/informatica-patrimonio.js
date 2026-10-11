export const CATEGORIAS_COMPUTADOR = ['Computador','Notebook','Servidor','Rede','Rede e internet'];
export const SITUACOES_INFORMATICA = {uso:'Em uso',reserva:'Reserva',conserto:'Em conserto',baixado:'Baixado'};
import {vinculoDoEquipamento} from './equipamentos-patrimonio.js';
export function idBemParaEdicao(item,bens=[]) {
 const {bem,vinculo}=vinculoDoEquipamento(item,bens);
 return vinculo==='vinculado'?bem.id:item.bemId||'';
}
const numero = valor => valor === '' || valor == null ? null : Number(valor);
export function dataValida(valor) {
 if(typeof valor!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(valor))return false;
 const [ano,mes,dia]=valor.split('-').map(Number);
 return new Date(Date.UTC(ano,mes-1,dia)).toISOString().slice(0,10)===valor;
}
export function hojeEmSaoPaulo(hoje=new Date()) {
 if(typeof hoje==='string')return dataValida(hoje)?hoje:null;
 const partes=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(hoje);
 const campo=tipo=>partes.find(p=>p.type===tipo)?.value;
 return `${campo('year')}-${campo('month')}-${campo('day')}`;
}
export function corte12Meses(hoje=new Date()) {
 const dia=hojeEmSaoPaulo(hoje);
 if(!dia)return null;
 const [ano,mes,d]=dia.split('-').map(Number),ultimo=new Date(Date.UTC(ano-1,mes,0)).getUTCDate();
 return `${ano-1}-${String(mes).padStart(2,'0')}-${String(Math.min(d,ultimo)).padStart(2,'0')}`;
}
export function manutencoesDoAtivo(mapa, ativoId, hoje = new Date(), aquisicao = '') {
 if(!mapa)return null;
 const hojeLocal=hojeEmSaoPaulo(hoje),corte=corte12Meses(hoje),inicio=dataValida(aquisicao)?aquisicao:null;
 const registros=Object.entries(mapa).filter(([,m])=>m?.ativoId===ativoId).map(([id,m])=>({...m,id})).sort((a,b)=>String(b.data||'').localeCompare(String(a.data||'')));
 const validos=registros.filter(m=>dataValida(m.data)&&m.data<=hojeLocal&&(!inicio||m.data>=inicio));
 const recentes=validos.filter(m=>m.data>=corte);
 const somar=lista=>lista.reduce((s,m)=>{const n=numero(m.valor);return s+(Number.isFinite(n)&&n>=0?n:0);},0);
 const pendentesValor=registros.filter(m=>{const n=numero(m.valor);return !Number.isFinite(n)||n<0;}).length;
 const pendentesData=registros.filter(m=>!dataValida(m.data)).length;
 return {registros,total:registros.length,ultimos12:recentes.length,ultimo:validos[0]||null,custo:somar(validos),custo12:somar(recentes),pendentesValor,pendentesData,foraPeriodo:registros.length-validos.length-pendentesData,inicio,corte};
}
export function resumoComputadores(ativos=[],setores=[],resumos=null) {
 const grupos={tipo:{},setor:{}};
 for(const item of ativos){
  const tipo=item.categoria||'Categoria pendente';
  const setor=setores.find(s=>s.id===item.especificacao?.setorId)?.nome||'Setor pendente';
  adicionar(grupos.tipo,tipo,resumos?.[item.id]);adicionar(grupos.setor,setor,resumos?.[item.id]);
 }
 return grupos;
}
function adicionar(grupo,chave,resumo){
 if(!grupo[chave])grupo[chave]={quantidade:0,custo:0,custo12:0,pendentesValor:0,pendentesData:0,foraPeriodo:0};
 const g=grupo[chave];g.quantidade++;
 if(resumo){g.custo+=resumo.custo;g.custo12+=resumo.custo12;g.pendentesValor+=resumo.pendentesValor;g.pendentesData+=resumo.pendentesData;g.foraPeriodo+=resumo.foraPeriodo;}
}
export function alertaManutencao(custo,valor,limite){
 const compra=numero(valor),percentual=numero(limite);
 if(!Number.isFinite(compra)||compra<=0||!Number.isFinite(percentual)||percentual<=0||!Number.isFinite(custo))return null;
 return {percentual:custo/compra*100,excedido:custo/compra*100>percentual};
}
