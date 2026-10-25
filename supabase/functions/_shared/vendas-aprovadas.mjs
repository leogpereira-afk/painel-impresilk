// A projeção de vendas usa a aprovação; o cadastro original continua disponível
// para carteira, operação, Permutas e outras telas que dependem dessa data.
export function dataAprovacaoComercial(valor) {
 const d=String(valor??'').slice(0,10);
 return /^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d?d:null;
}
export function ordensPorAprovacao(ordens) {
 return ordens.flatMap(o=>{
  const data=dataAprovacaoComercial(o.dataAprovacao);
  // Sem aprovação na origem não existe venda confirmada neste critério.
  // A cobertura é certificada separadamente pela consulta APROVACAO ao ERP.
  return data?[{...o,dataCadastro:o.dataCadastro??o.data,data}]:[];
 });
}
