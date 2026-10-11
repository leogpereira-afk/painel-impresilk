/* "COMO LIGAR" DE UMA FONTE: o passo a passo do dono (conexoes-passos.js),
 * aberto dentro da linha da fonte em Configurações > Marketing > Conexões.
 *
 * Os passos são numerados em sequência na fonte inteira (o 7 do Google é um
 * só, mesmo com as etapas no meio), para o Léo poder dizer "travei no 7".
 * Nome de secret e escopo vão em fonte de código; endereço de página vira
 * link (em outra aba, sem levar o Painel junto); o endereço de retorno, que
 * tem de ser colado exato no provedor, ganha o botão Copiar. Endereço
 * comprido quebra em qualquer ponto: a 375px nada pode alargar a página.
 *
 * Antes dos passos, os secrets OPCIONAIS da fonte e se já estão cadastrados
 * no servidor (o `opcionais` da ação "fontes": só o nome, nunca o valor). Os
 * passos dizem quando cada um vale a pena.
 */
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { AVISO_DOS_VALORES, PASSOS, pedacosDoPasso } from './conexoes-passos.js';
import './conexoes.css';

function Copiar({ valor }) {
  const [estado, setEstado] = useState('');
  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setEstado('ok');
    } catch {
      // Sem permissão de área de transferência (http, navegador antigo): o
      // endereço está logo ao lado, para selecionar.
      setEstado('falhou');
    }
  }
  return (
    <>
      <button type="button" className="btn-ghost alvo-40 mkt-ligar-copiar" onClick={copiar} aria-label="Copiar o endereço de retorno">
        {estado === 'ok' ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
        {estado === 'ok' ? 'Copiado' : 'Copiar'}
      </button>
      {estado === 'falhou' && (
        <span role="status" className="text-slate-500">
          {' '}
          Não deu para copiar: selecione o endereço.
        </span>
      )}
    </>
  );
}

function Passo({ texto }) {
  return pedacosDoPasso(texto).map((p, i) => {
    if (p.tipo === 'link') {
      return (
        <a key={i} className="mkt-ligar-link" href={p.valor} target="_blank" rel="noopener noreferrer">
          {p.valor}
        </a>
      );
    }
    if (p.tipo === 'retorno') {
      return (
        <span key={i}>
          <code className="mkt-ligar-codigo">{p.valor}</code> <Copiar valor={p.valor} />
        </span>
      );
    }
    if (p.tipo === 'secret' || p.tipo === 'codigo') {
      return (
        <code key={i} className="mkt-ligar-codigo">
          {p.valor}
        </code>
      );
    }
    return <span key={i}>{p.valor}</span>;
  });
}

/** "Opcionais nesta fonte: X (cadastrado) e Y (não cadastrado). Os passos
 *  dizem quando vale a pena." Fonte sem opcional: nada. */
function Opcionais({ opcionais }) {
  if (!opcionais?.length) return null;
  return (
    <p>
      {opcionais.length === 1 ? 'Opcional nesta fonte: ' : 'Opcionais nesta fonte: '}
      {opcionais.map((o, i) => (
        <span key={o.nome}>
          {i > 0 && (i === opcionais.length - 1 ? ' e ' : ', ')}
          <code className="mkt-ligar-codigo">{o.nome}</code> ({o.cadastrado ? 'cadastrado' : 'não cadastrado'})
        </span>
      ))}
      . Os passos dizem quando vale a pena.
    </p>
  );
}

export default function ComoLigar({ fonte, id, opcionais = [] }) {
  const guia = PASSOS[fonte];
  if (!guia) return null;
  // O número do primeiro passo de cada etapa (a contagem segue de uma etapa
  // para a outra).
  const inicios = guia.etapas.reduce((lista, e, i) => [...lista, i === 0 ? 1 : lista[i - 1] + guia.etapas[i - 1].passos.length], []);
  return (
    <div id={id} className="mkt-ligar">
      <p>{guia.resumo}</p>
      <p className="mkt-ligar-aviso">{AVISO_DOS_VALORES}</p>
      <Opcionais opcionais={opcionais} />
      {guia.etapas.map((e, i) => (
        <section key={e.titulo}>
          <h5 className="font-display">{e.titulo}</h5>
          <ol start={inicios[i]}>
            {e.passos.map((p, j) => (
              <li key={j}>
                <Passo texto={p} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
