import {useEffect, useState} from 'react';
import {estadoInicialInteresses, lerInteresses} from '../lib/licitacoes-interesses.mjs';

const avisoLeitura = 'Não foi possível consultar os itens salvos neste navegador.';
const avisoEscrita = 'Não foi possível salvar a alteração neste navegador. Tente novamente.';

function carregar(chave) {
  try {
    return {estado: lerInteresses(window.localStorage, chave), erro: ''};
  } catch {
    return {estado: estadoInicialInteresses(), erro: avisoLeitura};
  }
}

export default function useInteressesLicitacoes(usuario) {
  const chave = usuario ? `painel-licitacoes-interesses-v1:${encodeURIComponent(usuario)}` : '';
  const [registro, setRegistro] = useState(() => chave ? carregar(chave) : {estado: estadoInicialInteresses(), erro: ''});

  useEffect(() => {
    if (!chave) return;
    const atualizar = evento => {
      if (evento.key === chave || evento.key === null) setRegistro(carregar(chave));
    };
    window.addEventListener('storage', atualizar);
    return () => window.removeEventListener('storage', atualizar);
  }, [chave]);

  const alterar = async operacao => {
    if (!chave) return false;
    function salvar() {
      const armazenamento = window.localStorage;
      const atual = lerInteresses(armazenamento, chave);
      const estado = operacao(atual);
      if (estado !== atual) armazenamento.setItem(chave, JSON.stringify(estado));
      setRegistro({estado, erro: ''});
    }
    try {
      if (navigator.locks) await navigator.locks.request(chave, salvar);
      else salvar();
      return true;
    } catch (erro) {
      if (erro instanceof Error && erro.name === 'RequisitoInvalido') throw erro;
      setRegistro(atual => ({...atual, erro: avisoEscrita}));
      return false;
    }
  };
  return {...registro, alterar};
}
