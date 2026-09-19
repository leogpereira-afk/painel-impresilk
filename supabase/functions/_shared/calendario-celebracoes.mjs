// Projeta somente os campos necessários à celebração. Nunca devolve a ficha.
export function celebracoesRH(colaboradores, status, mes) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return [];
  const ano=Number(mes.slice(0,4)), numeroMes=Number(mes.slice(5,7));
  const ultimo=new Date(Date.UTC(ano,numeroMes,0)).getUTCDate();
  const ativos=new Set(status.filter(s=>s.contaComoAtivo===true).map(s=>s.id));
  const eventos=[];
  for(const c of colaboradores){
    if(c.ehDirecao||c.dataDesligamento||!ativos.has(c.statusId))continue;
    for(const [campo,tipo,cor] of [['dataNascimento','Aniversário','#db2777'],['dataAdmissao','Tempo de empresa','#7c3aed']]){
      const valor=String(c[campo]||'').slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(valor))continue;
      const data=new Date(valor+'T12:00:00Z');
      if(!Number.isFinite(+data)||data.toISOString().slice(0,10)!==valor||Number(valor.slice(5,7))!==numeroMes)continue;
      const anos=ano-Number(valor.slice(0,4));
      if(anos<0)continue;
      eventos.push({id:`rh-${campo}-${String(c.id).slice(0,60)}`,titulo:String(c.nome||'').trim().slice(0,160),tipo,cor,
        data:`${mes}-${String(Math.min(Number(valor.slice(8,10)),ultimo)).padStart(2,'0')}`,
        descricao:campo==='dataAdmissao'?(anos?`${anos} ${anos===1?'ano':'anos'} de empresa`:'Ano de admissão'):'',
        recorrenteAnual:true,hora:''});
    }
  }
  return eventos;
}
