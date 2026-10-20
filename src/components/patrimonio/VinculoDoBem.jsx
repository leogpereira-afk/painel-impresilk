import CadastroEquipamento from './CadastroEquipamento.jsx';
import {caminhoCadastroPatrimonio} from '../../lib/calc/navegacao-patrimonio.js';
import {opcoesVinculo} from '../../lib/calc/vinculo-patrimonio.js';
import {useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {Link2,Unlink,AlertTriangle,ArrowUpRight,RefreshCw} from 'lucide-react';
import {podeAbrir} from '../../lib/sessao.js';
import {caminhoFichaVinculada} from '../../lib/calc/navegacao-patrimonio.js';
import {FAMILIAS_VINCULO,ROTULO_FAMILIA_VINCULO,ROTULO_MODULO_VINCULO,familiaVinculo,moduloDoVinculo,podeVincularFamilia,rotuloFicha,rotuloLigadoA,setorDivergente} from '../../lib/calc/vinculo-patrimonio.js';
import {vincularFicha,desvincularFicha,lerHistoricoVinculo} from '../../services/vinculo-patrimonio.js';

const DESFEITO='Vínculo desfeito. O bem e a ficha continuam cadastrados.';
const quando=em=>{const d=new Date(em);return Number.isNaN(d.getTime())?'Data pendente':d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});};
const linhaEvento=e=>`${quando(e.em)} · ${e.porNome||'Autoria registrada'} ${e.acao==='vinculado'?'ligou a':'desfez o vínculo com'} ${ROTULO_FAMILIA_VINCULO[e.familia]||'Ficha'} · ${e.nome||'Sem nome'}`;
const abaDoCaminho=caminho=>new URLSearchParams(caminho.split('?')[1]||'').get('aba');

// Bloco "Ligado a" da ficha de leitura do bem. Fica fora do "Editar ficha" de
// propósito: o bem grava pelo painel-config e o vínculo pelo painel-ativos, e
// um "Salvar" com as duas gravações não seria atômico.
export default function VinculoDoBem({bem,vinculo,fichas=[],bens=[],setores=[],abasPermitidas=[],carregando=false,erro='',aoTentar,aoAtualizar,aoMudou,aoAbrirFicha,aoOrganizarBem,salvandoArea=false}) {
 const [busca,setBusca]=useState(''),[novaFicha,setNovaFicha]=useState(null);
 const [familia,setFamilia]=useState(''),[fichaId,setFichaId]=useState(''),[ocupado,setOcupado]=useState(false),[aviso,setAviso]=useState(null);
 const [historicoAberto,setHistoricoAberto]=useState(false),[eventos,setEventos]=useState(null),[erroHistorico,setErroHistorico]=useState('');
 const pedidoHistorico=useRef(0);
 const nomeBem=bem.codigo||bem.nomeGenerico||'sem etiqueta';
 async function carregarHistorico(){
  const n=++pedidoHistorico.current;setEventos(null);setErroHistorico('');
  try{const lista=await lerHistoricoVinculo(bem.id);if(n===pedidoHistorico.current)setEventos(lista);}
  catch(e){if(n===pedidoHistorico.current)setErroHistorico(e.message);}
 }
 const alternarHistorico=()=>{const abrir=!historicoAberto;setHistoricoAberto(abrir);if(abrir)carregarHistorico();};
 const depois=r=>{aoMudou?.({ficha:r?.ficha||null,bem:r?.bem||null});if(historicoAberto)carregarHistorico();};
 const falhou=e=>setAviso({erro:true,texto:e.message,atualizar:e.status===409||e.parcial===true});
 const familias=FAMILIAS_VINCULO.filter(f=>podeVincularFamilia(f.id,podeAbrir));
 const opcoes=opcoesVinculo(fichas,bens,familia,busca).filter(o=>podeVincularFamilia(familiaVinculo(o.ficha),podeAbrir));
 const livres=opcoes.filter(o=>!o.motivo).map(o=>o.ficha);
 const organizarOutros=familia==='area-outros';
 const podeOrganizar=abasPermitidas.includes('outros')&&!!aoOrganizarBem;
 const tipoNovo=familia==='carro'?'veiculo':familia==='maquina'?'maquina':familia?null:bem.areaPatrimonio==='carros'?'veiculo':bem.areaPatrimonio==='maquinas'?'maquina':null;
 function criarFicha(){setNovaFicha({cadastroId:crypto.randomUUID(),tipo:tipoNovo,tipoFixo:true,nome:bem.descricaoTecnica||bem.nomeGenerico||'',bemEscolha:bem.id,responsavel:bem.responsavel||'',responsavelId:bem.responsavelId||'',especificacao:{setor:setores.find(s=>s.sigla===bem.setorSigla)?.nome||bem.setorSigla||''}});}
 async function ligar(){
  const ficha=livres.find(f=>f.id===fichaId);if(!ficha||ocupado)return;
  setOcupado(true);setAviso(null);
  try{
   const r=await vincularFicha({bemId:bem.id,ativoId:ficha.id,versaoFicha:ficha.atualizadoEm||'',versaoBem:bem.atualizadoEm||'',origem:'bem'});
   setFamilia('');setFichaId('');depois(r);setAviso({texto:`Bem ligado a ${rotuloLigadoA({ficha:r?.ficha||ficha})}.`});
  }catch(e){falhou(e);}finally{setOcupado(false);}
 }
 async function desfazer(ligacao){
  if(ocupado)return;
  const rotulo=ligacao.ficha?rotuloLigadoA(ligacao):'uma ficha retirada';
  if(!window.confirm(`Desfazer o vínculo entre o bem ${nomeBem} e ${rotulo}?\n\nO bem e a ficha continuam cadastrados, e o histórico de manutenção continua na ficha.`))return;
  setOcupado(true);setAviso(null);
  try{
   const r=await desvincularFicha({bemId:bem.id,ativoId:ligacao.ativoId,versaoFicha:ligacao.ficha?.atualizadoEm||'',versaoBem:bem.atualizadoEm||'',origem:'bem'});
   depois(r);setAviso({texto:DESFEITO});
  }catch(e){falhou(e);}finally{setOcupado(false);}
 }
 // Cada ligação mostra o próprio Desfazer, ou diz qual permissão falta.
 function acoes(ligacao){
  const abrir=ligacao.ficha&&!ligacao.oculta?caminhoFichaVinculada(ligacao.ficha):'';
  const pode=ligacao.oculta?false:ligacao.ficha?podeVincularFamilia(familiaVinculo(ligacao.ficha),podeAbrir):podeAbrir('inventario-valores');
  return <div className="pat-actions">
   {abrir&&abasPermitidas.includes(abaDoCaminho(abrir))&&<Link className="btn-outline" to={abrir} onClick={()=>aoAbrirFicha?.()}><ArrowUpRight size={15}/>Abrir ficha</Link>}
   {pode?<button type="button" className="btn-ghost" disabled={ocupado} onClick={()=>desfazer(ligacao)} aria-label={`Desfazer vínculo com ${rotuloLigadoA(ligacao)}`}><Unlink size={15}/>Desfazer vínculo</button>
    :ligacao.oculta?<small>Só quem tem a permissão Segurança vê os detalhes e pode desfazer.</small>
    :<small>Para desfazer, é preciso a permissão {ROTULO_MODULO_VINCULO[moduloDoVinculo(ligacao.ficha)]}.</small>}
  </div>;
 }
 function conteudo(){
  if(erro)return <p className="pat-notice is-error" role="alert">Não foi possível conferir as fichas ligadas. <button type="button" className="btn-ghost" onClick={aoTentar}>Tentar novamente</button></p>;
  if(carregando||!vinculo)return <p role="status">Conferindo as fichas ligadas…</p>;
  if(vinculo.estado==='ligado'&&vinculo.oculta)return <p>Ligado a uma ficha de Segurança. Só quem tem a permissão Segurança vê os detalhes e pode desfazer.</p>;
  if(vinculo.estado==='ligado'){
   const setor=setorDivergente(bem,vinculo.ficha,setores);
   return <><div className="pat-vinculo-linha"><p><Link2 size={15} aria-hidden="true"/><strong>{rotuloLigadoA(vinculo)}</strong></p>{acoes(vinculo.ligacoes[0]||{ativoId:vinculo.ficha.id,ficha:vinculo.ficha})}</div>
    {setor&&<p className="pat-vinculo-aviso">Setores diferentes: o bem está em {setor.bem} e a ficha em {setor.ficha}. Nada é copiado; corrija onde estiver errado.</p>}</>;
  }
  if(vinculo.estado==='a-conferir')return <><p className="pat-vinculo-aviso"><AlertTriangle size={15} aria-hidden="true"/>{vinculo.motivo==='ficha-retirada'?'A ficha ligada a este bem foi retirada ou não existe mais. Desfaça o vínculo para liberar o bem.':'Este bem aparece ligado a mais de uma ficha, ou a ficha aponta para outro bem. Desfaça o vínculo que estiver errado.'}</p>
   <ul className="pat-vinculo-ligacoes">{vinculo.ligacoes.map(l=><li key={l.ativoId} className="pat-vinculo-linha"><p><strong>{rotuloLigadoA(l)}</strong></p>{acoes(l)}</li>)}</ul></>;
  if(bem.situacao==='baixado')return <p>Bem baixado: não pode ser ligado a uma ficha.</p>;
  const abaFamilia=FAMILIAS_VINCULO.find(f=>f.id===familia)?.aba;
  return <>{novaFicha?<CadastroEquipamento key={novaFicha.cadastroId} inicial={novaFicha} setores={setores} bensLivres={[bem]} aoFechar={()=>setNovaFicha(null)} aoConcluir={async()=>{setNovaFicha(null);aoAtualizar?.();setAviso({texto:'Dados técnicos salvos. Atualizando o vínculo do bem.'});}}/>:<div className="pat-actions">{tipoNovo&&podeVincularFamilia(tipoNovo==='veiculo'?'carro':'maquina',podeAbrir)&&<button type="button" className="btn-outline" onClick={criarFicha}>Completar dados técnicos</button>}</div>}<p>A ficha técnica é opcional. Para mostrar o bem em uma aba, use “Área do patrimônio” acima.</p>
   {!novaFicha&&(!familias.length&&!podeOrganizar?<p className="pat-vinculo-aviso">Ligar a uma ficha exige, além de Inventário e valores, a permissão da aba da ficha: Patrimônio, Patrimônio · Manutenções ou Segurança.</p>:<div className="pat-vinculo-form"><h4>Vincular ou organizar</h4><label>Buscar ficha<input className="input" placeholder="Nome, modelo, série ou placa…" disabled={organizarOutros} value={busca} onChange={e=>{setBusca(e.target.value);setFichaId('');}}/></label>
    <label>Tipo de ficha<select className="input" value={familia} disabled={ocupado} onChange={e=>{setFamilia(e.target.value);setFichaId('');setAviso(null);}}><option value="">Todos os tipos</option>{podeOrganizar&&<option value="area-outros">Ferramentas & Outros</option>}{familias.map(f=><option key={f.id} value={f.id}>{f.rotulo}</option>)}</select></label>
    {organizarOutros?<div className="pat-vinculo-organizar"><p>Organize este bem em <strong>Ferramentas &amp; Outros</strong>. Ele continua com a mesma etiqueta, fotos e histórico.</p><div className="pat-actions"><button type="button" className="btn-primary" disabled={salvandoArea||bem.areaPatrimonio==='outros'} onClick={()=>aoOrganizarBem(bem,'outros')}>{salvandoArea?'Salvando…':bem.areaPatrimonio==='outros'?'Já organizado nesta área':'Confirmar organização'}</button><Link className="btn-outline" to="/patrimonio?aba=outros" onClick={()=>aoAbrirFicha?.()}>Abrir Ferramentas &amp; Outros <ArrowUpRight size={15}/></Link></div><small>Essa área reúne os bens do inventário; não cria uma segunda ficha técnica.</small></div>:<><label>Ficha<select className="input" value={fichaId} disabled={ocupado} onChange={e=>setFichaId(e.target.value)}><option value="">Escolha a ficha</option>{opcoes.map(({ficha:f,motivo})=><option key={f.id} value={f.id} disabled={!!motivo}>{rotuloFicha(f)}{motivo?` — ${motivo}`:' — Disponível'}</option>)}</select>{familia&&!livres.length&&<small>Nenhuma ficha livre deste tipo. As fichas ocupadas aparecem desabilitadas. Confira o vínculo existente antes de desfazê-lo.</small>}</label>
    <small>{livres.length} disponível(is) neste recorte. Fichas já vinculadas ou baixadas não podem receber outro bem.</small>
    {!opcoes.length&&<p>Nenhum cadastro encontrado. Limpe a busca ou confira outro tipo de ficha.</p>}
    {familia&&!tipoNovo&&<Link className="btn-outline" to={caminhoCadastroPatrimonio({familia:familia==='estrutura'?'predial':familia==='telefonia'?'informatica':familia==='incendio'?'predial':familia,categoria:familia==='telefonia'?'Celular':familia==='incendio'?'Extintor':''})} onClick={()=>aoAbrirFicha?.()}>Abrir cadastros de {abaFamilia}</Link>}
    <button type="button" className="btn-primary" disabled={!livres.some(f=>f.id===fichaId)||ocupado} onClick={ligar}>{ocupado?'Ligando…':'Confirmar vínculo'}</button></>}
   </div>)}</>;
 }
 return <section className="pat-vinculo" aria-label="Ligado a">
  <h3>{vinculo?.estado==='a-conferir'&&!erro?'Vínculo a conferir':'Ligado a'}</h3>
  {conteudo()}
  {aviso&&<p className={`pat-notice ${aviso.erro?'is-error':''}`} role={aviso.erro?'alert':'status'}>{aviso.texto}{aviso.atualizar&&<button type="button" className="btn-ghost" onClick={()=>{setAviso(null);setFichaId('');aoAtualizar?.();}}><RefreshCw size={15}/>Atualizar</button>}</p>}
  <div className="pat-vinculo-historico"><button type="button" aria-expanded={historicoAberto} onClick={alternarHistorico}>Histórico do vínculo {historicoAberto?'▴':'▾'}</button>
   {historicoAberto&&(erroHistorico?<p role="alert">{erroHistorico} <button type="button" className="btn-outline" onClick={carregarHistorico}>Tentar novamente</button></p>
    :eventos===null?<p role="status">Consultando histórico…</p>
    :!eventos.length?<p>Nenhuma ligação registrada ainda.</p>
    :<ol>{eventos.map(e=><li key={e.id}>{linhaEvento(e)}{e.motivo&&<small>{e.motivo}</small>}</li>)}</ol>)}
  </div>
 </section>;
}
