// Validação e autoria de cadastros numerados. A identidade vem da sessão.
import { aplicarOperacaoCaixa } from './patrimonio-caixas.mjs';
export const TIPOS_CONTROLE = ['ramais', 'armarios', 'ferramentas', 'camas', 'celulares'];
export function prepararControle(campos, anterior, sessao, agora) {
  const falhar = (mensagem, status=422) => { throw Object.assign(new Error(mensagem), {status}); };
  if (!campos || typeof campos !== 'object' || Array.isArray(campos)) falhar('Cadastro inválido.');
  if (!Object.hasOwn(campos,'versaoAnterior') || campos.versaoAnterior !== (anterior?.atualizadoEm ?? null)) falhar('Este cadastro mudou. Atualize a lista antes de editar novamente.',409);
  const tipo = String(campos.tipo || '');
  if (!TIPOS_CONTROLE.includes(tipo) || (anterior && anterior.tipo !== tipo)) falhar('Tipo de controle inválido.');
  const numero = String(campos.numero ?? '').trim();
  if (tipo==='celulares' ? (!/^[+\d() .-]{1,40}$/.test(numero) || !/\d/.test(numero)) : !/^\d{1,12}$/.test(numero)) falhar(tipo==='celulares'?'Informe o número do telefone.':'Informe um número de até 12 dígitos.');
  const texto = (campo,max) => { const v=String(campos[campo]??'').trim();if(v.length>max) falhar('O campo '+campo+' ultrapassa '+max+' caracteres.');return v; };
  const telefone = tipo==='ramais' ? texto('telefone',40) : '';
  if(tipo==='ramais' && telefone && !/^[+\d() .-]{1,40}$/.test(telefone)) falhar('Informe um telefone válido ou deixe o campo em branco.');
  if(tipo==='ramais' && telefone && !/\d/.test(telefone)) falhar('Informe um telefone válido ou deixe o campo em branco.');
  const modelo=tipo==='celulares'?texto('modelo',120):'';
  if(tipo==='celulares'&&!modelo)falhar('Informe o modelo do celular.');
  if(tipo!=='ferramentas' && campos.operacaoCaixa!=null)falhar('Esta operação é exclusiva das caixas de ferramentas.');
  const caixa=tipo==='ferramentas'?aplicarOperacaoCaixa(anterior,campos.operacaoCaixa,sessao,agora):{};
  // Duas gravações no mesmo milissegundo também precisam de versões diferentes.
  const anteriorMs=Date.parse(anterior?.atualizadoEm),agoraMs=Date.parse(agora);
  const atualizadoEm=Number.isFinite(anteriorMs)&&anteriorMs>=agoraMs?new Date(anteriorMs+1).toISOString():agora;
  return {tipo,numero,numeroChave:numero.replace(/\D/g,'').replace(/^0+(?=\d)/,''),modelo,telefone,pessoa:texto('pessoa',120),observacao:texto('observacao',1000),
    criadoEm:anterior?.criadoEm || agora,criadoPor:anterior?.criadoPor || String(sessao.sub),
    atualizadoEm,atualizadoPor:String(sessao.sub),atualizadoPorNome:String(sessao.nome || sessao.sub),...caixa};
}
export function carimbarPatrimonio(registro, anterior, sessao, agora) {
 return {...registro,criadoEm:anterior?.criadoEm || (anterior ? null : agora),criadoPor:anterior?.criadoPor || (anterior ? null : String(sessao.sub)),
 atualizadoEm:agora,atualizadoPor:String(sessao.sub),atualizadoPorNome:String(sessao.nome || sessao.sub)};
}
