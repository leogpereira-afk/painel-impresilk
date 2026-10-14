// Contrato de saída fechado: nenhum campo financeiro, documento ou campo
// futuro passa para a consulta operacional sem a permissão de inventário.
// Regras do vínculo bem ↔ ficha moram em módulo próprio; daqui elas saem
// junto, para as functions e os testes que já espalham este módulo.
export * from './patrimonio-vinculo.mjs';
import {eventoPublicoVinculo} from './patrimonio-vinculo.mjs';
export const INVENTARIO = 'inventario-valores';
export const SEGURANCA = 'seguranca';
export function temPermissao(sessao, modulo) {
  return !!sessao && (sessao.master === true || sessao.perms?.includes('*') || sessao.perms?.includes(modulo)) === true;
}
export const FAMILIAS_EQUIPAMENTO = ['veiculo', 'maquina', 'predial', 'informatica', 'seguranca'];
const CAMPOS_VINCULO = ['id', 'codigo', 'situacao', 'origemAtivoId', 'setorSigla'];
// O Desfazer pelo bem grava o evento inteiro em bem.historico. Para a tela ele
// sai como no historicoVinculo: sem o login e, a quem não tem Segurança, sem o
// nome e o id da ficha de Segurança. O registro gravado não muda.
function historicoPermitido(historico, sessao) {
  const veSeguranca = temPermissao(sessao, SEGURANCA);
  return historico.map(e => !['vinculado', 'desvinculado'].includes(e?.acao) ? e
    : { ...eventoPublicoVinculo(e), ...(e.familia === 'seguranca' && !veSeguranca ? { nome: 'Ficha de Segurança', ativoId: '' } : {}) });
}
export function bemPermitido(bem, sessao) {
  if (temPermissao(sessao, INVENTARIO)) return Array.isArray(bem?.historico) ? { ...bem, historico: historicoPermitido(bem.historico, sessao) } : bem;
  return Object.fromEntries(CAMPOS_VINCULO.filter(k => Object.hasOwn(bem || {}, k)).map(k => [k, bem[k]]));
}
export function inventarioPermitido(mapa, sessao) {
  return Object.fromEntries(Object.entries(mapa || {}).map(([id, b]) => [id, bemPermitido(b, sessao)]));
}
// Veículos também têm documentos no cadastro compartilhado. Quem não pode
// ver aquisição não recebe arquivos livres (podem conter a nota fiscal).
const CAMPOS_ATIVO = ['id','tipo','nome','categoria','identificacao','responsavel','responsavelId','bemId','especificacao','unidadeMedidor','medidorAtual','medidorProximo','validade','emissao','criadoEm','atualizadoEm','atualizadoPor'];
export function ativoPermitido(ativo, sessao) {
  if (!FAMILIAS_EQUIPAMENTO.includes(ativo?.tipo) || temPermissao(sessao, INVENTARIO)) return ativo;
  const seguro=Object.fromEntries(CAMPOS_ATIVO.filter(k => Object.hasOwn(ativo, k)).map(k => [k, ativo[k]]));
  const campos=['placa','marcaModelo','ano','cor','combustivel','renavam','chassi','lugares','possuiGrade','motorista','motoristaId','fabricante','modelo','numeroSerie','setor','potencia','local','quantidade','instalacao','setorId','situacao','numero','tipoExtintor','capacidade','testeAutonomiaMinutos','tipoSinalizacao','rede','enderecoIP','backup','tecnicoId','endereco','unidadeConsumidora','tensao','kva','potenciaInstalada','placas','inversores','unidadesConsumidoras'];
  seguro.especificacao=Object.fromEntries(campos.flatMap(k=>{
    const v=ativo.especificacao?.[k];
    if(k==='unidadesConsumidoras')return Array.isArray(v)?[[k,v.filter(x=>typeof x==='string'&&/^[0-9a-f-]{36}$/i.test(x)).slice(0,200)]]:[];
    if(typeof v==='string')return [[k,v.slice(0,2000)]];
    if(typeof v==='number'&&Number.isFinite(v)||typeof v==='boolean')return [[k,v]];
    return [];
  }));
  return seguro;
}
export function exigeInventario(sessao) {
  if (!temPermissao(sessao, INVENTARIO)) throw Object.assign(new Error('Esta operação exige Inventário e valores.'), {status:403});
}
