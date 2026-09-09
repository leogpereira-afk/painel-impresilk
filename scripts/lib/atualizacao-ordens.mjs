// Um retrato mesclado contém O.S. antigas: regravá-las não é atualizar o ERP.
export function ordensParaTabela(pesados, modo) {
  return modo === 'completo' ? (pesados?.ordens ?? []) : (pesados?.ordensAtualizadas ?? []);
}

// Só confirma a varredura quando as fontes e os dois destinos receberam dados.
export function completaConfirmada(modo, pesados, recusados = []) {
  return modo === 'completo'
    && Array.isArray(pesados?.ordens) && pesados.ordens.length > 0
    && Array.isArray(pesados?.orcamentos) && pesados.orcamentos.length > 0
    && !recusados.some(f => ['painel_ordens', 'vazio-recusado:ordens', 'vazio-recusado:orcamentos'].includes(f));
}
