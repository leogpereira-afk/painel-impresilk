import { useSearchParams } from 'react-router-dom';

// Apenas nomes de abas: nenhum cliente, valor financeiro ou dado pessoal na URL.
export function useAbaNavegavel(padrao, permitidas) {
  const [params, setParams] = useSearchParams();
  const escolhida = params.get('aba');
  const valor = permitidas.includes(escolhida) ? escolhida : padrao;
  const definir = proxima => {
    const nova = typeof proxima === 'function' ? proxima(valor) : proxima;
    if (!permitidas.includes(nova) || nova === valor) return;
    setParams(atuais => {
      const copia = new URLSearchParams(atuais);
      copia.set('aba', nova);
      return copia;
    });
  };
  return [valor, definir];
}
