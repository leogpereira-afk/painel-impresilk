import {useId, useState} from 'react';
import {AlertTriangle, Plus, Save, Trash2} from 'lucide-react';
import JanelaFormulario from '../JanelaFormulario.jsx';
import PessoaRH from './PessoasRH.jsx';
import {conteudoManualVazio, pendenciasManual} from '../../lib/calc/manuais-maquinas.js';

const GUIA = [
  ['finalidade', 'Finalidade e materiais atendidos', 'O que esta máquina faz e os limites de uso confirmados.'],
  ['seguranca', 'Segurança e situações de parada', 'Riscos, proteções, EPIs e quando interromper o uso. Use uma fonte conferida.'],
  ['preparacao', 'Antes de começar', 'Conferências, material, ajustes e preparação autorizados.'],
  ['operacao', 'Operação passo a passo', 'Sequência de trabalho, parâmetros confirmados e verificações durante o uso.'],
  ['qualidade', 'Controle de qualidade', 'Como conferir a primeira peça e identificar desvios.'],
  ['encerramento', 'Encerramento', 'Como finalizar o trabalho e desligar com segurança.'],
  ['limpeza', 'Limpeza e conservação', 'Produtos e procedimentos permitidos pelo fabricante.'],
  ['problemas', 'Problemas e encaminhamento', 'Sintoma, ação permitida ao operador e quando chamar assistência.'],
];
const NOVO = {
  fontes: {titulo:'', url:'', tipo:'fabricante', modelo:'', versao:'', idioma:'', conferidoEm:'', pagina:'', situacao:'pendente'},
  consumiveis: {nome:'', codigo:'', uso:'', compatibilidade:'pendente', armazenamento:'', fonteId:''},
  assistencias: {nome:'', especialidade:'', telefone:'', whatsapp:'', email:'', endereco:'', url:'', conferidoEm:''},
  treinamentos: {titulo:'', objetivo:'', conteudo:'', criterio:'', url:''},
};

function Campo({rotulo, valor, aoMudar, longo=false, ajuda, tipo='text', ...resto}) {
  const id=useId();
  return <div className={`mm-campo${longo?' mm-campo-longo':''}`}><label htmlFor={id}>{rotulo}</label>{longo
    ? <textarea className="input" id={id} rows={4} value={valor||''} onChange={e=>aoMudar(e.target.value)} {...resto}/>
    : <input className="input" id={id} type={tipo} value={valor||''} onChange={e=>aoMudar(e.target.value)} {...resto}/>}{ajuda&&<small>{ajuda}</small>}</div>;
}
function Escolha({rotulo, valor, aoMudar, children}) {
  const id=useId();
  return <div className="mm-campo"><label htmlFor={id}>{rotulo}</label><select className="input" id={id} value={valor} onChange={e=>aoMudar(e.target.value)}>{children}</select></div>;
}
function Secao({titulo, resumo, aberta=false, children}) {
  return <details className="mm-editor-secao" open={aberta||undefined}><summary><strong>{titulo}</strong><span>{resumo}</span></summary><div className="mm-editor-conteudo">{children}</div></details>;
}

export default function ManualMaquinaFormulario({item, manual, aoFechar, aoSalvar}) {
  const [versaoBase]=useState(()=>manual?.atualizadoEm??null);
  const [conteudo,setConteudo]=useState(()=>{
    const vazio=conteudoManualVazio(), atual=manual?.conteudo||{};
    return {...vazio,...structuredClone(atual),foto:{...vazio.foto,...atual.foto}};
  });
  const [ocupado,setOcupado]=useState(false), [erro,setErro]=useState('');
  const pendencias=pendenciasManual(conteudo);
  const mudar=(campo,valor)=>setConteudo(c=>({...c,[campo]:valor}));
  const mudarItem=(grupo,id,campo,valor)=>setConteudo(c=>({...c,[grupo]:(c[grupo]||[]).map(i=>i.id===id?{...i,[campo]:valor}:i)}));
  const adicionar=grupo=>setConteudo(c=>({...c,[grupo]:[...(c[grupo]||[]),{...NOVO[grupo],id:crypto.randomUUID()}]}));
  const remover=(grupo,id)=>setConteudo(c=>({...c,[grupo]:(c[grupo]||[]).filter(i=>i.id!==id),...(grupo==='fontes'?{consumiveis:(c.consumiveis||[]).map(i=>i.fonteId===id?{...i,fonteId:'',compatibilidade:'pendente'}:i)}:{})}));
  const campoItem=(grupo,i,campo,rotulo,opcoes={})=><Campo key={campo} rotulo={rotulo} valor={i[campo]} aoMudar={v=>mudarItem(grupo,i.id,campo,v)} {...opcoes}/>;
  const excluir=(grupo,i,rotulo)=><button type="button" className="btn-ghost mm-remover" aria-label={`Remover ${rotulo}`} onClick={()=>remover(grupo,i.id)}><Trash2 size={15}/>Remover</button>;
  const salvar=async e=>{
    e.preventDefault();setOcupado(true);setErro('');
    try{await aoSalvar(conteudo,versaoBase);}
    catch(e){setErro(e.status===409?'Este manual mudou em outra sessão. Seu texto continua neste formulário. Copie as alterações antes de fechar e consulte a revisão atual para reconciliar.':e.message||'Não foi possível salvar o manual. Seu texto foi preservado.');}
    finally{setOcupado(false);}
  };
  return <JanelaFormulario titulo={`${manual?'Editar':'Preparar'} manual · ${item.nome||'Máquina'}`} ocupado={ocupado} aoFechar={aoFechar} classe="mm-janela">
    <form onSubmit={salvar} onInvalid={e=>{const secao=e.target.closest('details');if(secao)secao.open=true;}} className="mm-formulario">
      <p className="mm-editor-intro">Cada salvamento cria uma revisão em rascunho. Registre apenas informações confirmadas para esta máquina; a aprovação é uma etapa separada.</p>
      {erro&&<p role="alert" className="pat-notice is-error"><AlertTriangle size={18}/>{erro}</p>}
      <fieldset disabled={ocupado} className="mm-editor-campos">
        <Secao titulo="1. Identificação e responsabilidade" resumo="Modelo exato, pessoa responsável e revisão" aberta>
          <div className="mm-form-grid">
            <Campo rotulo="Fabricante" valor={conteudo.fabricante} aoMudar={v=>mudar('fabricante',v)}/>
            <Campo rotulo="Modelo exato" valor={conteudo.modelo} aoMudar={v=>mudar('modelo',v)}/>
            <Campo rotulo="Variante / configuração" valor={conteudo.variante} aoMudar={v=>mudar('variante',v)} ajuda="Ex.: largura ou conjunto instalado, se confirmado."/>
            <PessoaRH rotulo="Responsável pelo manual" valor={conteudo.responsavelId} aoMudar={v=>mudar('responsavelId',v)}/>
            <Campo rotulo="Revisar até" tipo="date" valor={conteudo.revisarEm} aoMudar={v=>mudar('revisarEm',v)}/>
          </div>
          <label className="mm-checkbox"><input type="checkbox" checked={!!conteudo.identificacaoConfirmada} onChange={e=>mudar('identificacaoConfirmada',e.target.checked)}/><span>Conferi fabricante, modelo e variante na identificação desta máquina.</span></label>
        </Secao>
        <Secao titulo="2. Fontes e manual original" resumo={`${conteudo.fontes?.length||0} fontes · registre origem e conferência`}>
          <p className="mm-ajuda">Use links do fabricante, documentos internos ou do Drive. Documentos privados mantêm a exigência de acesso à conta. Marque “Verificada” só depois de conferir a correspondência do modelo.</p>
          {(conteudo.fontes||[]).map((i,n)=><div className="mm-editor-item" key={i.id}><header><strong>Fonte {n+1}</strong>{excluir('fontes',i,i.titulo||`fonte ${n+1}`)}</header><div className="mm-form-grid">
            {campoItem('fontes',i,'titulo','Título')}{campoItem('fontes',i,'url','Link HTTPS',{tipo:'url',placeholder:'https://…'})}
            <Escolha rotulo="Tipo de fonte" valor={i.tipo} aoMudar={v=>mudarItem('fontes',i.id,'tipo',v)}><option value="fabricante">Fabricante</option><option value="interno">Documento interno</option><option value="video">Vídeo</option><option value="ficha-seguranca">Ficha de segurança</option></Escolha>
            <Escolha rotulo="Conferência" valor={i.situacao} aoMudar={v=>mudarItem('fontes',i.id,'situacao',v)}><option value="pendente">Pendente de conferência</option><option value="verificado">Verificada para esta máquina</option></Escolha>
            {campoItem('fontes',i,'modelo','Modelo coberto')}{campoItem('fontes',i,'versao','Edição / versão')}{campoItem('fontes',i,'idioma','Idioma')}{campoItem('fontes',i,'pagina','Páginas / trecho consultado')}{campoItem('fontes',i,'conferidoEm','Conferida em',{tipo:'date'})}
          </div></div>)}
          <button className="btn-outline" type="button" onClick={()=>adicionar('fontes')}><Plus size={16}/>Adicionar fonte</button>
        </Secao>
        <Secao titulo="3. Guia operacional" resumo="Segurança, preparação, trabalho e encerramento">
          <div className="mm-form-grid">{GUIA.map(([campo,rotulo,ajuda])=><Campo key={campo} rotulo={rotulo} ajuda={ajuda} longo valor={conteudo[campo]} aoMudar={v=>mudar(campo,v)}/>)}</div>
        </Secao>
        <Secao titulo="4. Consumíveis e compatibilidade" resumo={`${conteudo.consumiveis?.length||0} itens · código, uso e armazenamento`}>
          {(conteudo.consumiveis||[]).map((i,n)=><div className="mm-editor-item" key={i.id}><header><strong>Consumível {n+1}</strong>{excluir('consumiveis',i,i.nome||`consumível ${n+1}`)}</header><div className="mm-form-grid">
            {campoItem('consumiveis',i,'nome','Nome do consumível')}{campoItem('consumiveis',i,'codigo','Código / especificação')}{campoItem('consumiveis',i,'uso','Uso na máquina')}
            <Escolha rotulo="Compatibilidade" valor={i.compatibilidade} aoMudar={v=>mudarItem('consumiveis',i.id,'compatibilidade',v)}><option value="pendente">Pendente de confirmação</option><option value="fabricante">Confirmada pelo fabricante</option><option value="uso-interno">Validada internamente</option></Escolha>
            {campoItem('consumiveis',i,'armazenamento','Armazenamento e cuidados',{longo:true})}
            <Escolha rotulo="Fonte da compatibilidade" valor={i.fonteId||''} aoMudar={v=>mudarItem('consumiveis',i.id,'fonteId',v)}><option value="">Sem fonte vinculada</option>{(conteudo.fontes||[]).map((f,k)=><option key={f.id} value={f.id}>{f.titulo||`Fonte ${k+1}`}</option>)}</Escolha>
          </div></div>)}
          <button className="btn-outline" type="button" onClick={()=>adicionar('consumiveis')}><Plus size={16}/>Adicionar consumível</button>
        </Secao>
        <Secao titulo="5. Treinamento" resumo={`${conteudo.treinamentos?.length||0} etapas · prática e critério de conclusão`}>
          <p className="mm-ajuda">Organize etapas de estudo e prática supervisionada. Este manual não registra presença nem certifica o operador.</p>
          {(conteudo.treinamentos||[]).map((i,n)=><div className="mm-editor-item" key={i.id}><header><strong>Etapa {n+1}</strong>{excluir('treinamentos',i,i.titulo||`etapa ${n+1}`)}</header><div className="mm-form-grid">
            {campoItem('treinamentos',i,'titulo','Título da etapa')}{campoItem('treinamentos',i,'objetivo','Objetivo')}{campoItem('treinamentos',i,'conteudo','Conteúdo e prática',{longo:true})}{campoItem('treinamentos',i,'criterio','Critério de conclusão',{longo:true})}{campoItem('treinamentos',i,'url','Material de apoio (HTTPS)',{tipo:'url'})}
          </div></div>)}
          <button className="btn-outline" type="button" onClick={()=>adicionar('treinamentos')}><Plus size={16}/>Adicionar etapa</button>
        </Secao>
        <Secao titulo="6. Assistência técnica" resumo={`${conteudo.assistencias?.length||0} contatos · canais e data de conferência`}>
          {(conteudo.assistencias||[]).map((i,n)=><div className="mm-editor-item" key={i.id}><header><strong>Assistência {n+1}</strong>{excluir('assistencias',i,i.nome||`assistência ${n+1}`)}</header><div className="mm-form-grid">
            {campoItem('assistencias',i,'nome','Empresa / profissional')}{campoItem('assistencias',i,'especialidade','Especialidade / cobertura')}{campoItem('assistencias',i,'telefone','Telefone',{tipo:'tel'})}{campoItem('assistencias',i,'whatsapp','WhatsApp com DDD e país',{tipo:'tel',ajuda:'Ex.: +55…; confira o número antes de registrar.'})}{campoItem('assistencias',i,'email','E-mail',{tipo:'email'})}{campoItem('assistencias',i,'endereco','Endereço / região')}{campoItem('assistencias',i,'url','Site (HTTPS)',{tipo:'url'})}{campoItem('assistencias',i,'conferidoEm','Contato conferido em',{tipo:'date'})}
          </div></div>)}
          <button className="btn-outline" type="button" onClick={()=>adicionar('assistencias')}><Plus size={16}/>Adicionar assistência</button>
        </Secao>
        <Secao titulo="7. Imagem de referência" resumo="Opcional · a foto do patrimônio tem prioridade">
          <p className="mm-ajuda">A galeria do patrimônio é reutilizada quando disponível. Se precisar, informe uma imagem HTTPS autorizada para este modelo e registre sua origem.</p>
          <div className="mm-form-grid">{[['url','Link direto da imagem'],['fonteUrl','Página de origem'],['legenda','Legenda / identificação']].map(([campo,rotulo])=><Campo key={campo} rotulo={rotulo} tipo={campo==='legenda'?'text':'url'} valor={conteudo.foto?.[campo]} aoMudar={v=>mudar('foto',{...conteudo.foto,[campo]:v})}/>)}</div>
          <label className="mm-checkbox"><input type="checkbox" checked={!!conteudo.foto?.usoConfirmado} onChange={e=>mudar('foto',{...conteudo.foto,usoConfirmado:e.target.checked})}/><span>Conferi a identificação e a autorização de uso desta imagem.</span></label>
        </Secao>
      </fieldset>
      <footer className="mm-editor-rodape"><div><strong>Salvar como rascunho</strong><span>{pendencias.length?`${pendencias.length} pendência${pendencias.length===1?'':'s'} para aprovação.`:'Requisitos para aprovação preenchidos; a conferência ainda é necessária.'}</span></div><button type="button" className="btn-ghost" disabled={ocupado} onClick={aoFechar}>Cancelar</button><button className="btn-primary" disabled={ocupado} type="submit"><Save size={17}/>{ocupado?'Salvando…':'Salvar revisão'}</button></footer>
    </form>
  </JanelaFormulario>;
}
