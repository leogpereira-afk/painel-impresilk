// Aviso de erro novo dentro da janela (ex.: recusa do servidor depois de Salvar). No celular ele
// fica no topo do formulário, longe do botão Salvar: a janela rola até ele. Só role="alert" com texto.
export function avisoNovo(registros){
  for(const r of registros||[]){
    const alvo=r.type==='characterData'?r.target?.parentElement:r.target;
    const dentro=alvo?.closest?.('[role="alert"]');if(dentro?.textContent?.trim())return dentro;
    for(const n of r.addedNodes||[]){if(n?.nodeType!==1)continue;const a=n.matches?.('[role="alert"]')?n:n.querySelector?.('[role="alert"]');if(a?.textContent?.trim())return a;}
  }
  return null;
}
