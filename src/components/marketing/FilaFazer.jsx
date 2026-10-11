/* A FILA "FAZER": as linhas de tarefa separadas por prazo (atrasadas, hoje,
 * próximos 7 dias, depois e sem prazo). Serve à Visão geral (todos os canais)
 * e ao canal aberto (só o dele); quem chama manda as linhas já escolhidas
 * (derivar.js, linhasFazer) e as funções que gravam.
 *
 * Grupo comprido mostra as 8 primeiras e um "Mostrar todas": a fila é para
 * decidir o que fazer agora, e quinze itens sem prazo empurrariam o resto da
 * tela para baixo.
 *
 * Do lg para cima o rótulo do grupo (Atrasadas · 1) vira uma coluna à
 * esquerda, na altura da primeira linha, em vez de ocupar uma linha sozinho
 * (marketing.css, .mkt-fila-grupo). No celular ele continua em cima.
 */
import { useState } from 'react';
import LinhaTarefa from '../LinhaTarefa.jsx';
import { gruposFazer } from '../../lib/calc/marketing-canais.js';
import { nomeDoResponsavel } from './derivar.js';

const GRUPOS = [
  { id: 'atrasadas', rotulo: 'Atrasadas', classe: 'text-bad-700' },
  { id: 'hoje', rotulo: 'Hoje', classe: 'text-warn-700' },
  { id: 'semana', rotulo: 'Próximos 7 dias', classe: 'text-slate-600' },
  { id: 'proximas', rotulo: 'Depois', classe: 'text-slate-600' },
  { id: 'semData', rotulo: 'Sem prazo', classe: 'text-slate-500' },
];
const POR_VEZ = 8;

export default function FilaFazer({ linhas, hoje, canaisPorId, pessoas, podeGravar, onConcluir, onAbrir, onSair, vazio }) {
  const [abertos, setAbertos] = useState({});
  const grupos = gruposFazer(linhas, hoje);
  if (!grupos) return null;
  const total = GRUPOS.reduce((s, g) => s + grupos[g.id].length, 0);
  if (!total) return vazio || null;

  return (
    <div className="mkt-fila">
      {GRUPOS.filter((g) => grupos[g.id].length).map((g) => {
        const todas = grupos[g.id];
        const visiveis = abertos[g.id] ? todas : todas.slice(0, POR_VEZ);
        return (
          <section key={g.id} aria-label={g.rotulo} className="mkt-fila-grupo">
            <h3 className={`mkt-fila-rotulo font-display text-xs font-semibold uppercase leading-4 tracking-wide ${g.classe}`}>
              {g.rotulo} <span className="tnum font-normal text-slate-400">· {todas.length}</span>
            </h3>
            <div className="min-w-0">
              {visiveis.map((l) => (
                <LinhaTarefa
                  key={l.chave}
                  titulo={l.titulo}
                  canal={canaisPorId.get(l.canalId) || null}
                  prazo={l.prazo}
                  responsavel={nomeDoResponsavel(l, pessoas)}
                  feito={l.feito}
                  hoje={hoje}
                  desabilitado={!podeGravar}
                  onConcluir={(feito) => onConcluir(l, feito)}
                  onAbrir={() => onAbrir(l)}
                  onSair={() => onSair(l.chave)}
                />
              ))}
              {todas.length > POR_VEZ && (
                <button type="button" className="btn-ghost mt-1 min-h-11" onClick={() => setAbertos((a) => ({ ...a, [g.id]: !a[g.id] }))}>
                  {abertos[g.id] ? 'Mostrar menos' : `Mostrar todas (${todas.length})`}
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
