const ordenar=(a,b)=>String(a.numero||'').localeCompare(String(b.numero||''),'pt-BR',{numeric:true})||a.id.localeCompare(b.id);

export function montarRelacaoNumeros(controles={},pessoas=[],setores=[]) {
 const porPessoa=new Map(),porSetor=new Map(),pendentes=[];
 const pessoasPorId=new Map(pessoas.map(p=>[p.id,p]));
 const setoresPorId=new Map(setores.map(s=>[s.id,s]));
 const linhas=Object.entries(controles).filter(([,r])=>['celulares','ramais'].includes(r?.tipo)).map(([id,r])=>({...r,id})).sort(ordenar);
 for(const linha of linhas) {
  const pessoaId=linha.pessoaId||'';
  const pessoa=pessoasPorId.get(pessoaId);
  const setor=setoresPorId.get(linha.setorId);
  const status=linha.status||(!pessoaId&&!linha.pessoa?'disponivel':'ativo');
  const item={...linha,status,nomePessoa:pessoa?.nome||linha.pessoa||'',nomeSetor:setor?.nome||(linha.setorId?'Setor a conferir':'Setor pendente')};
  if(status==='disponivel') {
   const chave=linha.setorId||'__sem_setor__';
   if(!porSetor.has(chave))porSetor.set(chave,{id:chave,nome:item.nomeSetor,linhas:[]});
   porSetor.get(chave).linhas.push(item);
  } else if(pessoaId) {
   if(!porPessoa.has(pessoaId))porPessoa.set(pessoaId,{id:pessoaId,nome:pessoa?.nome||linha.pessoa||'Pessoa fora do quadro',linhas:[]});
   porPessoa.get(pessoaId).linhas.push(item);
  } else pendentes.push(item);
 }
 return {
  pessoas:[...porPessoa.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')||a.id.localeCompare(b.id)),
  disponiveis:[...porSetor.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')||a.id.localeCompare(b.id)),
  pendentes,
  total:linhas.length,
 };
}
