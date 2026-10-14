import {useState} from 'react';
import {Unlink,ArrowUpRight} from 'lucide-react';
import {podeAbrir} from '../../lib/sessao.js';
import {bensParaFicha} from '../../lib/calc/equipamentos-patrimonio.js';
import {ROTULO_FAMILIA_VINCULO,ROTULO_MODULO_VINCULO,familiaVinculo,fichaBaixada,moduloDoVinculo,podeVincularFamilia,vinculoDaFicha} from '../../lib/calc/vinculo-patrimonio.js';
import {desvincularFicha} from '../../services/vinculo-patrimonio.js';

const rotuloBem=b=>`${b?.codigo||'Etiqueta pendente'} · ${b?.nomeGenerico||'Bem'}`;
// Só a ficha livre e não baixada manda bemId ao salvar. Ficha ligada, com bem
// sumido ou em conflito troca o vínculo apenas por Desfazer, que confere as
// duas pontas; ficha baixada não se liga (o servidor recusa).
export const mandaBemId=(fichaSalva,bens)=>vinculoDaFicha(fichaSalva,bens).estado==='livre'&&!fichaBaixada(fichaSalva);
// O 409 que trava o formulário é o de outra gravação (versão velha). A recusa
// do vínculo (bem baixado, já ligado, ficha baixada) só mostra o motivo.
export const conflitoDeVersao=e=>e?.status===409&&!e?.recusaVinculo;
export const trocarNaLista=(lista,ficha)=>ficha?[...(lista||[]).filter(i=>i.id!==ficha.id),ficha]:lista;

// Campo "Bem do inventário" das fichas de computador, celular, ramal, elétrica,
// segurança, incêndio e itens da Estrutura. `ficha` é o registro salvo (nulo no
// cadastro novo) e `fichas`, a lista inteira do Patrimônio, para saber quem já
// está ligado em qualquer aba.
export default function BemDaFicha({ficha=null,valor='',aoMudar,bens=[],fichas=[],aoVerBem,aoDesfeito,desabilitado=false,rotulo='Bem do inventário',classe=''}) {
 const [ocupado,setOcupado]=useState(false),[aviso,setAviso]=useState(null);
 const v=vinculoDaFicha(ficha,bens);
 const pode=!!ficha&&podeVincularFamilia(familiaVinculo(ficha),podeAbrir);
 async function desfazer(bemId){
  const bem=bens.find(b=>b.id===bemId);
  if(!window.confirm(`Desfazer o vínculo entre ${ROTULO_FAMILIA_VINCULO[familiaVinculo(ficha)]||'Ficha'} · ${ficha.nome||'Sem nome'} e o bem ${bem?(bem.codigo||bem.nomeGenerico||'sem etiqueta'):'que não está mais no inventário'}?\n\nO bem e a ficha continuam cadastrados, e o histórico de manutenção continua na ficha.`))return;
  setOcupado(true);setAviso(null);
  try{
   const r=await desvincularFicha({bemId,ativoId:ficha.id,versaoFicha:ficha.atualizadoEm||'',versaoBem:bem?.atualizadoEm||'',origem:'ficha'});
   setAviso({texto:'Vínculo desfeito. O bem e a ficha continuam cadastrados.'});aoDesfeito?.(r);
  }catch(e){setAviso({erro:true,texto:e.message});}finally{setOcupado(false);}
 }
 const botao=(bemId,nome)=>pode?<button type="button" className="btn-outline" disabled={ocupado||desabilitado} onClick={()=>desfazer(bemId)} aria-label={nome?`Desfazer vínculo com ${nome}`:undefined}><Unlink size={15}/>Desfazer vínculo</button>
  :ficha&&<small>Para desfazer, é preciso a permissão {ROTULO_MODULO_VINCULO[moduloDoVinculo(ficha)]}.</small>;
 const mensagem=aviso&&<p className={`pat-notice ${aviso.erro?'is-error':''}`} role={aviso.erro?'alert':'status'}>{aviso.texto}</p>;
 if(v.estado==='livre'&&fichaBaixada(ficha))return <div className={`pat-bem-ficha ${classe}`.trim()} role="group" aria-label={rotulo}><span className="pat-bem-ficha-titulo">{rotulo}</span><p>Ficha baixada: não pode ser ligada a um bem.</p></div>;
 if(v.estado==='livre')return <div className={`pat-bem-ficha ${classe}`.trim()}><label>{rotulo}<select className="input" value={valor||''} disabled={desabilitado} onChange={e=>aoMudar?.(e.target.value)}><option value="">Sem vínculo</option>{bensParaFicha(bens,fichas,ficha?.id||'').map(b=><option key={b.id} value={b.id}>{rotuloBem(b)}</option>)}</select><small>Aparecem só bens livres e que não estão baixados. Para trocar o bem depois, desfaça o vínculo e ligue de novo.</small></label>{mensagem}</div>;
 return <div className={`pat-bem-ficha ${classe}`.trim()} role="group" aria-label={rotulo}><span className="pat-bem-ficha-titulo">{rotulo}</span>
  {v.estado==='ligado'&&<><p>Ligado ao bem {rotuloBem(v.bem)}</p><div className="pat-actions">{botao(v.bem.id)}{aoVerBem&&<button type="button" className="btn-ghost" onClick={()=>aoVerBem(v.bem)}><ArrowUpRight size={15}/>Ver bem</button>}</div></>}
  {v.estado==='sumido'&&<><p>Ligado a um bem que não está mais no inventário. Desfaça o vínculo para liberar a ficha.</p><div className="pat-actions">{botao(v.bemIds[0])}</div></>}
  {v.estado==='conflito'&&<><p>Vínculo com o inventário a conferir. Desfaça o vínculo errado aqui ou na ficha do bem.</p><ul className="pat-vinculo-ligacoes">{v.bemIds.map(id=>{const b=bens.find(x=>x.id===id),nome=b?rotuloBem(b):'Bem que não está mais no inventário';return <li key={id} className="pat-vinculo-linha"><p>{nome}</p><div className="pat-actions">{botao(id,nome)}</div></li>;})}</ul></>}
  {mensagem}
 </div>;
}
