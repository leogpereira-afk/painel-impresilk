import {useMemo,useState} from 'react';
import {Link2} from 'lucide-react';
import JanelaFormulario from '../JanelaFormulario.jsx';
import {salvarControle} from '../../services/patrimonio.js';
import {semIdDoRH,nomeSemId,camposVinculoPessoa} from '../../lib/calc/controles-patrimonio.js';
import {rotuloPessoa,sugerirPessoa,MOTIVO_SEM_SUGESTAO} from '../../lib/calc/pessoas-rh.js';

// Nome da pessoa com o ID da empresa ao lado; nome digitado sem ficha do RH vem marcado.
export function PessoaComId({registro,vazio=''}) {
 if(!String(registro?.pessoa||'').trim())return vazio;
 return <span className="pat-control-pessoa-id">{registro.pessoa}{registro.pessoaIdPessoa&&<small className="pat-control-id">ID {registro.pessoaIdPessoa}</small>}{nomeSemId(registro)&&<small className="pat-control-sem-id">sem ID do RH</small>}</span>;
}

// Aviso e janela para trocar o nome digitado pelo vínculo com a ficha do RH. Cada linha
// abre em "Deixar como está": a sugestão pelo nome só entra com o clique em "Usar sugestão",
// linha a linha. Grava um cadastro por vez, pelo mesmo caminho do formulário: o servidor
// confere a pessoa e grava o nome oficial e o ID da empresa.
export default function VincularPeloId({controles,tipo,pessoas,tituloNumero='Número',singular,permitirLocal=false,desabilitado=false,aoGravar}) {
 const pendentes=useMemo(()=>semIdDoRH(controles,tipo),[controles,tipo]);
 const ativas=useMemo(()=>pessoas.filter(p=>p.disponivel),[pessoas]);
 const [linhas,setLinhas]=useState(null),[ocupado,setOcupado]=useState(false),[erro,setErro]=useState('');
 if(controles===null||(!pendentes.length&&!linhas))return null;
 const abrir=()=>{
  setErro('');
  setLinhas(pendentes.map(r=>{const s=sugerirPessoa(r.pessoa,pessoas);return {id:r.id,numero:r.numero,nomeAntigo:r.pessoa,local:r.local||'',escolha:'',sugestao:s.pessoa?.id||'',motivo:s.motivo,erro:''};}));
 };
 const escolher=(id,escolha)=>setLinhas(ls=>ls.map(l=>l.id===id?{...l,escolha,erro:''}:l));
 const escolhidas=(linhas||[]).filter(l=>l.escolha);
 function ajuda(l){
  if(l.erro)return l.erro;
  const p=ativas.find(x=>x.id===l.escolha);
  if(p)return `${p.idPessoa?'ID '+p.idPessoa:'Sem ID da empresa no RH'}${l.escolha===l.sugestao?' · sugestão pelo nome':''}`;
  if(l.escolha==='__local__')return 'Vai para Local de atendimento.';
  const s=l.sugestao&&ativas.find(x=>x.id===l.sugestao);
  if(s)return <>Sugestão pelo nome: <strong>{rotuloPessoa(s)}</strong> <button type="button" className="btn-ghost" disabled={ocupado} onClick={()=>escolher(l.id,s.id)}>Usar sugestão</button></>;
  return MOTIVO_SEM_SUGESTAO[l.motivo]||'';
 }
 async function salvar(){
  setOcupado(true);setErro('');
  let atual=controles,feitos=0;const falhas={};
  for(const l of escolhidas){
   const r=atual?.[l.id];
   if(!r||!nomeSemId(r)){falhas[l.id]='Este cadastro mudou. Feche e abra de novo.';continue;}
   const pessoa=l.escolha==='__local__'?null:ativas.find(p=>p.id===l.escolha);
   if(l.escolha!=='__local__'&&!pessoa){falhas[l.id]='Pessoa indisponível no RH.';continue;}
   try{atual=await salvarControle(l.id,camposVinculoPessoa(r,pessoa),r.atualizadoEm??null);feitos++;}
   catch(e){falhas[l.id]=e.message;}
  }
  setOcupado(false);
  if(feitos)aoGravar(atual,feitos);
  const n=Object.keys(falhas).length;
  if(!n){setLinhas(null);return;}
  setErro(`${n} ${n===1?'cadastro não foi gravado':'cadastros não foram gravados'}. Veja o motivo na linha.`);
  setLinhas(ls=>ls.filter(l=>!l.escolha||falhas[l.id]).map(l=>({...l,erro:falhas[l.id]||''})));
 }
 return <>
  {pendentes.length>0&&<div className="pat-control-pendente" role="note"><span><strong>{pendentes.length}</strong> {pendentes.length===1?'cadastro está':'cadastros estão'} só com o nome digitado, sem o ID do RH.</span><button type="button" className="btn-outline" disabled={desabilitado||ocupado||!ativas.length} onClick={abrir}><Link2 size={16}/>Vincular pelo ID</button></div>}
  {linhas&&<JanelaFormulario titulo="Vincular pelo ID do RH" ocupado={ocupado} aoFechar={()=>{if(!ocupado)setLinhas(null);}}>
   <div className="pat-control-vinculos">
    <p className="pat-control-form-help">Escolha a pessoa no RH para cada nome digitado. O vínculo grava o ID da empresa. A sugestão aparece só quando uma única pessoa ativa tem esse nome e só entra com “Usar sugestão”. Linha em “Deixar como está” não muda.</p>
    {erro&&<p className="pat-notice is-error" role="alert">{erro}</p>}
    <div className="pat-table-wrap"><table className="pat-table pat-controles-table"><thead><tr><th>{tituloNumero}</th><th>Nome digitado</th><th>Pessoa no RH</th></tr></thead>
     <tbody>{linhas.map(l=><tr key={l.id}>
      <td data-label={tituloNumero}><strong className="pat-control-number">{l.numero}</strong></td>
      <td data-label="Nome digitado">{l.nomeAntigo}</td>
      <td data-label="Pessoa no RH"><select className="input" aria-label={`Pessoa do RH para ${String(singular||'cadastro').toLowerCase()} ${l.numero}`} value={l.escolha} disabled={ocupado} onChange={e=>escolher(l.id,e.target.value)}>
        <option value="">Deixar como está</option>
        {permitirLocal&&!l.local&&<option value="__local__">É um local: mover para Local de atendimento</option>}
        {ativas.map(p=><option key={p.id} value={p.id}>{rotuloPessoa(p)}</option>)}
       </select>
       <small className={l.erro?'pat-control-erro':undefined}>{ajuda(l)}</small></td>
     </tr>)}</tbody>
    </table></div>
    <div className="pat-form-footer pat-actions"><button type="button" className="btn-primary" disabled={ocupado||!escolhidas.length} onClick={salvar}>{ocupado?'Salvando…':`Salvar ${escolhidas.length} ${escolhidas.length===1?'vínculo':'vínculos'}`}</button><button type="button" className="btn-ghost" disabled={ocupado} onClick={()=>setLinhas(null)}>Fechar</button></div>
   </div>
  </JanelaFormulario>}
 </>;
}
