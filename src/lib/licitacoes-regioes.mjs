import {MUNICIPIOS} from '../../supabase/functions/_shared/licitacoes-controle.mjs';
import {dataValida} from './calc/documentos.js';
import {diaBrasilia,situacaoCadastro} from './licitacoes-cadastros.mjs';

export {MUNICIPIOS};

// A comparação territorial é sempre exata. Acentos, espaços, hífens e variantes
// de apóstrofo não criam outra cidade, mas sede e destino não são intercambiáveis.
export function normalizarMunicipio(valor) {
  return String(valor||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/[\s’‘ʼ'`´-]+/g,'');
}
const nomes=new Map(MUNICIPIOS.map(nome=>[normalizarMunicipio(nome),nome]));
const lista=valor=>Array.isArray(valor)?valor:[];
const texto=valor=>typeof valor==='string'?valor.trim():'';
const unicos=itens=>{
  const vistos=new Set();
  return lista(itens).filter(item=>{
    if(!item||typeof item!=='object')return false;
    const chave=item.id||item;
    if(vistos.has(chave))return false;
    vistos.add(chave);return true;
  });
};

export function pendenciasEntidade(entidade,cadastros=[],hoje=diaBrasilia()) {
  if(!entidade||entidade.situacao==='arquivado')return [];
  const pendencias=[];
  if(!texto(entidade.responsavel))pendencias.push('Definir responsável.');
  if(!texto(entidade.proximaAcao))pendencias.push('Definir próxima ação.');
  if(!entidade.prazoAcao)pendencias.push('Definir prazo de acompanhamento.');
  else if(!dataValida(entidade.prazoAcao))pendencias.push('Conferir prazo de acompanhamento.');
  else if(dataValida(hoje)&&entidade.prazoAcao<=hoje)pendencias.push(entidade.prazoAcao===hoje?'Ação vence hoje.':'Prazo de acompanhamento vencido.');
  if(!['sim','nao'].includes(entidade.cadastroExigido))pendencias.push('Confirmar se exige cadastro de fornecedor.');
  const porId=new Map(unicos(cadastros).map(c=>[c.id,c]));
  const ids=[...new Set(lista(entidade.cadastroIds))];
  const indisponivel='Há cadastro vinculado indisponível para conferência.';
  if(entidade.cadastrosRestritos)pendencias.push(indisponivel);
  if(entidade.cadastroExigido==='sim'&&!ids.length&&!entidade.cadastrosRestritos)pendencias.push('Vincular cadastro de fornecedor.');
  for(const id of ids){
    const cadastro=porId.get(id);
    if(!cadastro){pendencias.push(indisponivel);continue;}
    const sit=situacaoCadastro(cadastro,hoje);
    if(sit.grupo!=='ativo')pendencias.push(`${cadastro.nome||'Cadastro'}: ${sit.rotulo}.`);
  }
  return [...new Set(pendencias)];
}

export function formatarDataRegiao(valor) {
  if(dataValida(valor))return valor.split('-').reverse().join('/');
  const dia=prazoDoDia(valor);
  if(!dia)return 'A conferir';
  return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(valor));
}

function prazoDoDia(prazo) {
  if(typeof prazo!=='string'||!prazo)return '';
  if(dataValida(prazo))return prazo;
  // Datas/hora exigem fuso explícito. Não interpretar texto local ambíguo.
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(prazo)||!dataValida(prazo.slice(0,10)))return '';
  const data=new Date(prazo);
  return Number.isFinite(data.getTime())?diaBrasilia(data):'';
}

export function construirRegioes({pesquisa,entidades=[],cadastros=[],hoje=diaBrasilia()}={}) {
  const cidades=MUNICIPIOS.map(nome=>({nome,oportunidades:[],encerradas:[],pendentesTerritoriais:[],entidades:[],pendencias:[],cobertura:null}));
  const porNome=new Map(cidades.map(c=>[c.nome,c]));
  const destinos=valores=>[...new Set(lista(valores).map(v=>nomes.get(normalizarMunicipio(v))).filter(Boolean))];
  // A projeção pública já validou recibos e fontes. Esta camada somente agrupa;
  // nunca promove uma menção territorial retida a oportunidade validada.
  for(const oportunidade of unicos(pesquisa?.oportunidades)){
    const dia=prazoDoDia(oportunidade.prazo);
    const noPrazo=dataValida(hoje)&&dia&&dia>=hoje&&['GO','REVISÃO HUMANA'].includes(oportunidade.classificacao);
    for(const nome of destinos(oportunidade.municipiosAbrangidos))porNome.get(nome)[noPrazo?'oportunidades':'encerradas'].push(oportunidade);
  }
  for(const pendente of unicos(pesquisa?.candidatosRetidos)){
    for(const nome of destinos(pendente.localExecucaoRegistrado?.municipios))porNome.get(nome).pendentesTerritoriais.push(pendente);
  }
  for(const entidade of unicos(entidades).filter(e=>e.situacao!=='arquivado')){
    const motivos=pendenciasEntidade(entidade,cadastros,hoje);
    for(const nome of destinos(entidade.municipios)){
      const cidade=porNome.get(nome);cidade.entidades.push(entidade);
      if(motivos.length)cidade.pendencias.push({entidadeId:entidade.id,nome:entidade.nome,motivos});
    }
  }
  for(const cobertura of lista(pesquisa?.municipios)){
    const nome=nomes.get(normalizarMunicipio(cobertura?.municipio));
    if(nome&&!porNome.get(nome).cobertura)porNome.get(nome).cobertura=cobertura;
  }
  return cidades;
}

export function filtrarCidades(cidades,{busca='',filtro='todas'}={}) {
  const q=normalizarMunicipio(busca);
  const proximoPrazo=cidade=>cidade.oportunidades.map(o=>prazoDoDia(o.prazo)).filter(Boolean).sort()[0]||'9999-12-31';
  return lista(cidades).filter(c=>!q||normalizarMunicipio(c.nome).includes(q)).filter(c=>{
    if(filtro==='oportunidades')return c.oportunidades.length>0;
    if(filtro==='acompanhamento')return c.entidades.length>0;
    if(filtro==='pendencias')return c.pendencias.length>0;
    return true;
  }).sort((a,b)=>{
    // Oportunidades lideram a fila. Pendências sem oportunidade permanecem
    // visíveis logo depois, sem ultrapassar cidades que têm trabalho no prazo.
    const quantidade=b.oportunidades.length-a.oportunidades.length;
    if(quantidade)return quantidade;
    if(a.oportunidades.length)return proximoPrazo(a).localeCompare(proximoPrazo(b))||a.nome.localeCompare(b.nome,'pt-BR');
    return Number(b.pendencias.length>0)-Number(a.pendencias.length>0)||a.nome.localeCompare(b.nome,'pt-BR');
  });
}
