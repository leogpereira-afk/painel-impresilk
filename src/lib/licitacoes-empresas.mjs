import {dataValida} from './calc/documentos.js';
import {diaBrasilia,situacaoCadastro} from './licitacoes-cadastros.mjs';
import {normalizarMunicipio,pendenciasEntidade} from './licitacoes-regioes.mjs';

export const GRUPOS_EMPRESAS={
  'a-cadastrar':'A cadastrar',preparacao:'Em preparação',ativas:'Empresas em dia',pendencias:'Pendências',arquivadas:'Arquivadas',
};
const lista=v=>Array.isArray(v)?v:[];
const texto=v=>typeof v==='string'?v.trim():'';
const normalizar=v=>String(v||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();
const unicos=itens=>{
  const vistos=new Set();
  return lista(itens).filter(i=>{
    if(!i||!texto(i.id)||vistos.has(i.id))return false;
    vistos.add(i.id);return true;
  });
};
const situacoes=new Set(['planejado','preparacao','enviado','em-analise','exigencia','ativo','indeferido','inativo','arquivado']);

function ativoValido(cadastro,hoje){
  if(cadastro.situacao!=='ativo'||!dataValida(hoje))return false;
  if(cadastro.validade)return dataValida(cadastro.validade)&&cadastro.validade>=hoje;
  return cadastro.semVencimento===true;
}

function etapaEmpresa(entidade,vinculos,ativos,indisponiveis){
  if(entidade.situacao==='arquivado')return {grupo:'arquivadas',rotulo:'Arquivada',tom:'neutral'};
  if(ativos.length)return {grupo:'ativas',rotulo:'Cadastro ativo',tom:'ok'};
  if(vinculos.some(c=>['preparacao','enviado','em-analise'].includes(c.situacao)))return {grupo:'preparacao',rotulo:'Em preparação ou análise',tom:'info'};
  if(indisponiveis)return {grupo:'pendencias',rotulo:'Cadastro a conferir',tom:'warn'};
  if(vinculos.some(c=>!['planejado','preparacao','enviado','em-analise'].includes(c.situacao)))return {grupo:'pendencias',rotulo:'Cadastro a regularizar',tom:'warn'};
  if(!vinculos.length&&entidade.cadastroExigido==='nao')return {grupo:'preparacao',rotulo:'Relacionamento comercial',tom:'info'};
  return {grupo:'a-cadastrar',rotulo:entidade.cadastroExigido==='confirmar'?'Confirmar cadastro de fornecedor':'A cadastrar',tom:'neutral'};
}

// A empresa é o comprador; cadastroIds aponta para nossas inscrições de
// fornecedor. Nome, cidade e contato nunca criam vínculo nem oportunidade.
// A ficha original é devolvida intacta para conservar ID, versão e histórico.
export function construirCarteiraEmpresas({entidades=[],cadastros=[],hoje=diaBrasilia()}={}){
  const porId=new Map(unicos(cadastros).map(c=>[c.id,c]));
  return unicos(entidades).filter(e=>e.tipo==='empresa').map(entidade=>{
    const ids=[...new Set(lista(entidade.cadastroIds))];
    const cadastrosVinculados=ids.map(id=>porId.get(id)).filter(Boolean);
    const cadastrosIndisponiveis=entidade.cadastrosRestritos===true||ids.some(id=>!porId.has(id));
    const cadastrosAtivos=cadastrosVinculados.filter(c=>ativoValido(c,hoje));
    const etapa=etapaEmpresa(entidade,cadastrosVinculados,cadastrosAtivos,cadastrosIndisponiveis);
    const arquivada=entidade.situacao==='arquivado';
    const pendencias=pendenciasEntidade(entidade,cadastros,hoje);
    const acaoVencida=!arquivada&&dataValida(hoje)&&[entidade,...cadastrosVinculados.filter(c=>!['inativo','arquivado'].includes(c.situacao))].some(i=>dataValida(i.prazoAcao)&&i.prazoAcao<hoje);
    const acaoHojeOuInvalida=!!entidade.prazoAcao&&(!dataValida(entidade.prazoAcao)||(dataValida(hoje)&&entidade.prazoAcao<=hoje));
    const cadastroBloqueado=cadastrosVinculados.some(c=>{
      const sit=situacaoCadastro(c,hoje);
      return ['pendente','arquivo'].includes(sit.grupo)||!situacoes.has(c.situacao);
    });
    // Preparação planejada e ausência de contato não equivalem a bloqueio.
    // Cadastro válido continua visível na etapa, mesmo com retorno vencido.
    const grupo=arquivada?'arquivadas':cadastrosIndisponiveis||acaoVencida||acaoHojeOuInvalida||cadastroBloqueado?'pendencias':etapa.grupo;
    if(!arquivada)for(const c of cadastrosVinculados)if(!situacoes.has(c.situacao))pendencias.push(`${c.nome||'Cadastro'}: conferir situação do cadastro.`);
    const prazos=[entidade.prazoAcao,...cadastrosVinculados.filter(c=>!['inativo','arquivado'].includes(c.situacao)).flatMap(c=>[c.prazoAcao,c.validade])].filter(dataValida).sort();
    return {id:entidade.id,entidade,grupo,etapa,pendencias:[...new Set(pendencias)],cadastrosVinculados,cadastrosAtivos,cadastrosIndisponiveis,acaoVencida,proximoPrazo:prazos[0]||''};
  });
}

export function filtrarCarteiraEmpresas(carteira,{busca='',grupo='todas',municipio='',prioridade='',responsavel=''}={}){
  const q=normalizar(busca).trim(),cidade=normalizarMunicipio(municipio);
  const grupoValido=Object.hasOwn(GRUPOS_EMPRESAS,grupo);
  return lista(carteira).filter(i=>{
    if(grupo==='com-pendencias')return i.grupo!=='arquivadas'&&i.pendencias.length>0;
    return grupoValido?i.grupo===grupo:i.grupo!=='arquivadas';
  }).filter(i=>!cidade||lista(i.entidade.municipios).some(c=>normalizarMunicipio(c)===cidade))
    .filter(i=>!prioridade||i.entidade.prioridade===prioridade)
    .filter(i=>!responsavel||i.entidade.responsavel===responsavel)
    .filter(i=>!q||normalizar([i.entidade.nome,...lista(i.entidade.municipios),i.entidade.contato,i.entidade.email,i.entidade.telefone,i.entidade.responsavel,i.entidade.proximaAcao,...i.cadastrosVinculados.flatMap(c=>[c.nome,c.servicos,c.exigencias])].join(' ')).includes(q))
    .sort((a,b)=>{
      const peso={alta:0,media:1,baixa:2};
      return Number(b.acaoVencida)-Number(a.acaoVencida)||Number(b.grupo==='pendencias')-Number(a.grupo==='pendencias')
        ||(peso[a.entidade.prioridade]??1)-(peso[b.entidade.prioridade]??1)
        ||(a.proximoPrazo||'9999-12-31').localeCompare(b.proximoPrazo||'9999-12-31')
        ||String(a.entidade.nome||'').localeCompare(String(b.entidade.nome||''),'pt-BR')||a.id.localeCompare(b.id);
    });
}

export function metricasCarteiraEmpresas(carteira){
  const itens=unicos(carteira),abertas=itens.filter(i=>i.grupo!=='arquivadas');
  const contar=grupo=>itens.filter(i=>i.grupo===grupo).length;
  return {
    total:abertas.length,acadastrar:contar('a-cadastrar'),preparacao:contar('preparacao'),ativas:contar('ativas'),pendencias:contar('pendencias'),arquivadas:contar('arquivadas'),
    comPendencias:abertas.filter(i=>i.pendencias.length>0).length,
    cadastrosAtivos:new Set(abertas.flatMap(i=>i.cadastrosAtivos.map(c=>c.id))).size,
    acoesVencidas:abertas.filter(i=>i.acaoVencida).length,
  };
}
