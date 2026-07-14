// Motor de recomendacao de proxima acao. Le a regua de cobranca e as regras por
// motivo de Configuracoes. Nada fixo no codigo.

export function proximaAcao(motivoId, dias, config) {
  // Regra por motivo sempre tem prioridade (ex.: NF nao enviada, disputa).
  const regra = (config.regrasPorMotivo || []).find((r) => r.motivoId === motivoId);
  if (regra) return regra.acao;

  const faixas = [...(config.reguaCobranca || [])].sort((a, b) => a.ateDias - b.ateDias);
  const faixa = faixas.find((f) => dias <= f.ateDias);
  return faixa ? faixa.acao : "Definir acao de cobranca";
}

export function nomeMotivo(motivoId, config) {
  const m = (config.motivosAtraso || []).find((x) => x.id === motivoId);
  return m ? m.nome : "Sem motivo";
}

export function grupoDoMotivo(motivoId, config) {
  const m = (config.motivosAtraso || []).find((x) => x.id === motivoId);
  return m ? m.grupo : null;
}

export function nomeGrupo(grupoId, config) {
  const g = (config.gruposCausa || []).find((x) => x.id === grupoId);
  return g ? g.nome : grupoId;
}

export function nomeVendedor(vendedorId, config) {
  const v = (config.vendedores || []).find((x) => x.id === vendedorId);
  return v ? v.nome : "Sem vendedor";
}

export function nomeMotivoPerda(motivoId, config) {
  const m = (config.motivosPerda || []).find((x) => x.id === motivoId);
  return m ? m.nome : "Nao informado";
}
