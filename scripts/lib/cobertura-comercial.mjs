import { confirmarJanelaComercial } from './carga-comercial.mjs';

// A carga regular prolonga somente a janela efetivamente lida e persistida de
// cada fonte. O histórico e o diagnóstico da última carga manual permanecem.
export async function confirmarCoberturaRegular(pesados, gravados, cache, agora = () => new Date().toISOString()) {
  const fontes = ['ordens', 'orcamentos'].filter(fonte =>
    pesados.janelasConsultadas?.[fonte] && Array.isArray(pesados[fonte])
    && gravados[fonte] === true && !pesados.falhas?.includes(fonte));
  if (!fontes.length) return false;
  const anterior = (await cache({ action: 'ler', chave: 'comercial_carga_status' })).valor;
  let status = { ...anterior, versao: anterior?.versao ?? 1, janelas: { ordens: [], orcamentos: [], ...anterior?.janelas } };
  const concluidaEm = agora();
  for (const fonte of fontes) status = confirmarJanelaComercial(status, fonte, {
    ...pesados.janelasConsultadas[fonte], concluidaEm, origem: 'carga_regular',
  });
  status.atualizacaoEm = concluidaEm;
  const resposta = await cache({ chave: 'comercial_carga_status', valor: status });
  if (resposta.recusouVazio || resposta.pulou) throw new Error('Confirmação da cobertura comercial recusada.');
  return true;
}
