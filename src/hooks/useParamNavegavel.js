import { useSearchParams } from 'react-router-dom';

/* UM PARÂMETRO DA URL QUE A TELA USA PARA NAVEGAR (aba, chip, sub-aba, mês).
 *
 * Nasceu do useAbaNavegavel, que só conhecia a chave "aba". O Marketing
 * precisa de várias ao mesmo tempo (?v=instagram&sub=resultados&mes=2026-10),
 * cada uma com a sua lista. O useAbaNavegavel continua existindo e chama este
 * com a chave "aba", do mesmo jeito de antes.
 *
 * O QUE ENTRA NA URL: só valor que passou em `permitidas`. Ela é uma lista
 * (nomes de aba, códigos de canal) ou uma função que confere o formato
 * (ex.: mês AAAA-MM). Nunca cliente, valor em dinheiro nem dado pessoal: a URL
 * vai para o histórico do navegador, para print e para mensagem.
 *
 * VALOR DESCONHECIDO NA URL não é apagado nem reescrito: a tela mostra o
 * padrão e a URL fica como veio. É o que segura o ?v=instagram enquanto os
 * canais ainda carregam (a lista de permitidas chega depois e o valor passa a
 * valer sozinho).
 *
 * `opcoes`:
 *  - replace: troca a entrada do histórico em vez de criar outra. Para
 *    filtro que muda a cada toque (o mês do calendário), o Voltar do celular
 *    não vira um rebobinar de filtros;
 *  - limpar: chaves que saem da URL quando esta muda (trocar de canal zera a
 *    sub-aba e o mês, para o canal novo não abrir no lugar do anterior).
 */
export function useParamNavegavel(chave, padrao, permitidas, opcoes = {}) {
  const [params, setParams] = useSearchParams();
  const aceita = typeof permitidas === 'function' ? permitidas : (v) => permitidas.includes(v);
  const escolhida = params.get(chave);
  const valor = escolhida !== null && aceita(escolhida) ? escolhida : padrao;
  const definir = (proxima) => {
    const nova = typeof proxima === 'function' ? proxima(valor) : proxima;
    if (typeof nova !== 'string' || !aceita(nova) || nova === valor) return;
    setParams(
      (atuais) => {
        const copia = new URLSearchParams(atuais);
        copia.set(chave, nova);
        for (const outra of opcoes.limpar || []) if (outra !== chave) copia.delete(outra);
        return copia;
      },
      opcoes.replace ? { replace: true } : undefined
    );
  };
  return [valor, definir];
}
