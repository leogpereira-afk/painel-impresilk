// Reclassificação explícita por categoria existente, nunca por semelhança.
export const DESTINOS_ESTRUTURA = Object.freeze({
 'Câmeras / CFTV':'seguranca', 'Alarme':'seguranca',
 'Portão / automatizador':'seguranca', 'Portão':'seguranca',
 'Rede e internet':'informatica',
});
export function previaReclassificacao(linhas=[]) {
 return linhas.flatMap(({id,registro:r}) => r?.tipo==='predial' && Object.hasOwn(DESTINOS_ESTRUTURA,r.categoria)
  ? [{id,nome:r.nome||'',categoria:r.categoria,de:'predial',para:DESTINOS_ESTRUTURA[r.categoria],bemId:r.bemId||null,versao:r.atualizadoEm||null}] : []);
}
