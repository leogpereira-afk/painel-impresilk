const indisponivel=motivo=>({disponivel:false,pontos:null,motivo});
const diaValido=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const distancia=(a,b)=>Math.round((Date.parse(b+'T12:00:00Z')-Date.parse(a+'T12:00:00Z'))/864e5);
const chave=(p,grupo)=>grupo==='dia'?p.data||p.de:grupo==='mes'?p.mes||p.de.slice(0,7):p.ano||p.de.slice(0,4);
const anteriorAno=k=>String(Number(k.slice(0,4))-1).padStart(4,'0')+k.slice(4);
const listaValida=xs=>Array.isArray(xs)&&xs.length>0&&xs.every(p=>p&&diaValido(p.de)&&diaValido(p.ate)&&p.de<=p.ate)&&xs.every((p,i)=>!i||p.de>xs[i-1].ate);
const resultado=pontos=>pontos.some(Boolean)?{disponivel:true,pontos,motivo:null}:indisponivel('Não há datas equivalentes para sobrepor estes períodos.');

// Align only dates/buckets whose meaning is equivalent. Monetary values,
// nulls and source coverage are preserved verbatim; this does not authorize
// a comparison when the server has reported comparavel:false.
export function alinharComparacaoGrafica({atuais,anteriores,agrupamento,tipo,modo}={}) {
  if(modo==='todos')return indisponivel('Selecione um mês, ano ou intervalo para comparar períodos.');
  if(!['dia','mes','ano'].includes(agrupamento)||!['anterior','anoAnterior'].includes(tipo)||!['mes','ano','personalizado'].includes(modo))return indisponivel('A combinação de período e agrupamento não permite esta comparação.');
  if(!listaValida(atuais)||!listaValida(anteriores))return indisponivel('Faltam períodos válidos e únicos para alinhar a comparação.');
  const mapa=new Map(anteriores.map(p=>[chave(p,agrupamento),p]));
  if(mapa.size!==anteriores.length)return indisponivel('Há períodos repetidos na comparação; confira a origem dos dados.');

  if(modo==='personalizado'&&agrupamento!=='dia') {
    const deAtual=atuais[0].de,deAnterior=anteriores[0].de;
    const equivalentes=atuais.length===anteriores.length&&atuais.every((p,i)=>{
      const a=anteriores[i];
      return distancia(p.de,p.ate)===distancia(a.de,a.ate)&&distancia(deAtual,p.de)===distancia(deAnterior,a.de);
    });
    if(!equivalentes)return indisponivel('Estes blocos têm durações ou posições diferentes. Selecione Dia para comparar os intervalos sem distorção.');
    return resultado(anteriores.slice());
  }

  if(tipo==='anoAnterior'||modo==='ano') {
    // An absent February 29 stays absent. Never shift March onto another day
    // merely because the preceding year contained one fewer array element.
    return resultado(atuais.map(p=>mapa.get(anteriorAno(chave(p,agrupamento)))||null));
  }

  if(modo==='mes') {
    if(agrupamento!=='dia') {
      // Monthly selection contains a single bucket even when grouped by year;
      // October versus September still compares those months, not entire years.
      if(atuais.length!==1||anteriores.length!==1)return indisponivel('O mês selecionado precisa corresponder a um único bloco para esta comparação.');
      return resultado([anteriores[0]]);
    }
    const mesesAtuais=new Set(atuais.map(p=>p.data?.slice(0,7)||p.de.slice(0,7))),mesesAnteriores=new Set(anteriores.map(p=>p.data?.slice(0,7)||p.de.slice(0,7)));
    if(mesesAtuais.size!==1||mesesAnteriores.size!==1)return indisponivel('A comparação por dia do mês precisa de um único mês em cada série.');
    const mesAnterior=[...mesesAnteriores][0];
    return resultado(atuais.map(p=>mapa.get(mesAnterior+'-'+chave(p,'dia').slice(8))||null));
  }

  // A custom previous interval has the same duration, but may cross month and
  // year boundaries differently. Align exact offsets from each interval start.
  const deAtual=atuais[0].de,deAnterior=anteriores[0].de;
  if(distancia(deAtual,atuais.at(-1).ate)!==distancia(deAnterior,anteriores.at(-1).ate))return indisponivel('Os intervalos diários têm durações diferentes; confira as datas da comparação.');
  const porPosicao=new Map(anteriores.map(p=>[distancia(deAnterior,p.de),p]));
  return resultado(atuais.map(p=>porPosicao.get(distancia(deAtual,p.de))||null));
}
