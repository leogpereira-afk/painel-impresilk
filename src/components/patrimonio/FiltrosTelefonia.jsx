import {List,UserCheck,CircleCheck,Search} from 'lucide-react';
import './controles.css';

export function aceitaSituacao(registro,situacao) {
 if(situacao==='responsavel')return !!(registro.pessoaId||registro.pessoa);
 if(situacao==='disponivel')return registro.status==='disponivel';
 return true;
}

export default function FiltrosTelefonia({registros,carregando,situacao,aoSituacao,busca,aoBusca,titulo,children}) {
 return <div className="pat-control-tools">
  <div className="pat-control-summary" role="group" aria-label="Filtrar por responsável">
   {[["todos","Todos",List],["responsavel","Com responsável",UserCheck],["disponivel","Disponíveis",CircleCheck]].map(([id,rotulo,Icone])=><button key={id} type="button" aria-pressed={situacao===id} onClick={()=>aoSituacao(id)}><Icone size={17} aria-hidden="true"/><span>{rotulo}</span><strong>{carregando?'—':registros.filter(r=>aceitaSituacao(r,id)).length}</strong></button>)}
  </div>
  <label className="pat-search pat-control-search"><Search size={18} aria-hidden="true"/><input className="input" aria-label={`Buscar em ${titulo}`} placeholder="Número, pessoa, setor ou aparelho..." value={busca} onChange={e=>aoBusca(e.target.value)}/></label>
  {children}
 </div>;
}
