import { useParamNavegavel } from './useParamNavegavel.js';

// Apenas nomes de abas: nenhum cliente, valor financeiro ou dado pessoal na URL.
// A chave "aba" de sempre; o trabalho mora no useParamNavegavel, que faz o
// mesmo para qualquer chave.
export function useAbaNavegavel(padrao, permitidas) {
  return useParamNavegavel('aba', padrao, permitidas);
}
