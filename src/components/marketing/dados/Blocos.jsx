/* OS BLOCOS DE DENTRO DE UM QUADRO DA SUB-ABA DADOS: números, gráfico,
 * tabela, pares, lista, barras, texto e avisos.
 *
 * Cada bloco chega PRONTO das contas (lib/calc/marketing-dados*.js): o texto
 * já formatado, o "não medido" já escrito, o link já conferido pelo
 * linkSeguro. Aqui só se desenha. Todo texto vem de fora (o HTML do site, o
 * título de um post) e vai como texto: o React escapa, e nada aqui monta
 * HTML.
 *
 * A TABELA ROLA DE LADO DENTRO DELA (a página nunca rola de lado no celular):
 * a primeira coluna fica presa à esquerda para a linha não perder o nome.
 * Mostra as primeiras linhas e um "Ver todas"; o resto já está ali.
 */
import { useState } from 'react';
import { clsx } from 'clsx';
import { ArrowDownRight, ArrowUpRight, Check, Minus, X } from 'lucide-react';
import GraficoBarras from './GraficoBarras.jsx';

// Pílula de estado numa célula (nota do PageSpeed, situação de campanha):
// todas com par no tema escuro (index.css).
const PILULA = { ok: 'bg-ok-50 text-ok-700', warn: 'bg-warn-50 text-warn-800', bad: 'bg-bad-50 text-bad-700' };
const NOTA = { ok: 'text-ok-700', bad: 'text-bad-700', neutral: 'text-slate-500' };
const PONTO_AVISO = { alerta: 'bg-bad-600', atencao: 'bg-warn-500', info: 'bg-slate-400' };
const NIVEL_AVISO = { alerta: 'Alerta', atencao: 'Atenção', info: 'Para saber' };
const MARCA = {
  sim: { Icone: Check, cor: 'text-ok-700', fala: 'instalada' },
  falta: { Icone: X, cor: 'text-warn-700', fala: 'falta' },
  nao: { Icone: Minus, cor: 'text-slate-400', fala: 'não aparece' },
};

function Link({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="mkt-dados-link">
      {children}
    </a>
  );
}

function Nota({ nota }) {
  if (!nota) return null;
  const Seta = nota.direcao === 'sobe' ? ArrowUpRight : nota.direcao === 'desce' ? ArrowDownRight : null;
  return (
    <dd className="mkt-dados-numero-nota" title={[nota.texto, nota.antes].filter(Boolean).join(', ')}>
      {nota.texto && (
        <span className={clsx('inline-flex items-center font-medium', NOTA[nota.tom] || NOTA.neutral)}>
          {Seta && <Seta size={12} strokeWidth={2.6} aria-hidden="true" />}
          {nota.texto}
        </span>
      )}
      <span className="text-slate-400">{nota.antes}</span>
    </dd>
  );
}

function Numeros({ bloco }) {
  return (
    <div>
      {bloco.titulo && <p className="mkt-dados-legenda-bloco">{bloco.titulo}</p>}
      <div className="mkt-dados-numeros">
        <dl className="mkt-dados-numeros-grade">
          {bloco.itens.map((n) => (
            <div key={n.id} className="mkt-dados-numero" title={n.titulo}>
              {/* O rótulo quebra em até duas linhas em vez de cortar: na
                  célula estreita, "Taxa de engajamento" perdia o fim. */}
              <dt className="line-clamp-2 text-[11.5px] leading-tight text-slate-500">{n.rotulo}</dt>
              <dd className={clsx('tnum truncate leading-tight', n.vazio ? 'pt-0.5 text-[13px] text-slate-400' : 'text-[17px] font-semibold text-slate-900')}>
                {n.texto}
              </dd>
              <Nota nota={n.nota} />
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function Marca({ marca }) {
  const m = MARCA[marca];
  if (!m) return null;
  const { Icone } = m;
  return (
    <span className={clsx('inline-flex', m.cor)}>
      <Icone size={15} strokeWidth={2.6} aria-hidden="true" />
      <span className="sr-only">{m.fala}</span>
    </span>
  );
}

function Celula({ c, coluna, primeira }) {
  let conteudo = c.texto;
  if (c.marca) conteudo = <Marca marca={c.marca} />;
  else if (c.link && !c.vazio) conteudo = <Link href={c.link}>{c.texto}</Link>;
  if (c.tom && !c.vazio && PILULA[c.tom]) conteudo = <span className={clsx('mkt-dados-pilula', PILULA[c.tom])}>{conteudo}</span>;
  const classe = clsx(coluna.alinhar === 'dir' && 'dir', c.vazio && 'vazio', c.marca && 'marca');
  // A primeira célula é o nome da linha: cabeçalho da linha para o leitor de
  // tela, e presa à esquerda quando a tabela rola de lado.
  if (primeira) {
    return (
      <th scope="row" className={classe} title={c.titulo}>
        {conteudo}
      </th>
    );
  }
  return (
    <td className={classe} title={c.titulo}>
      {conteudo}
    </td>
  );
}

function Tabela({ bloco, rotulo }) {
  const [todas, setTodas] = useState(false);
  const linhas = todas ? bloco.linhas : bloco.linhas.slice(0, bloco.limite);
  const sobram = bloco.linhas.length - bloco.limite;
  return (
    <div>
      {/* O título só vem na tabela que divide a seção com outra. */}
      {bloco.titulo && <p className="mkt-dados-legenda-bloco">{bloco.titulo}</p>}
      {/* tabIndex: quem usa o teclado rola a tabela larga com as setas. */}
      <div className="mkt-dados-rolagem" role="region" aria-label={bloco.titulo ? `${rotulo}: ${bloco.titulo}` : rotulo} tabIndex={0}>
        <table className="mkt-dados-tabela">
          <thead>
            <tr>
              {bloco.colunas.map((c) => (
                <th key={c.id} scope="col" className={c.alinhar === 'dir' ? 'dir' : undefined}>
                  {c.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                {l.celulas.map((c, i) => (
                  <Celula key={bloco.colunas[i].id} c={c} coluna={bloco.colunas[i]} primeira={i === 0} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(sobram > 0 || bloco.nota) && (
        <div className="mkt-dados-tabela-pe">
          {bloco.nota && <p className="mkt-dados-nota min-w-0 flex-1">{bloco.nota}</p>}
          {sobram > 0 && (
            <button type="button" className="mkt-dados-mais alvo-40" onClick={() => setTodas((v) => !v)} aria-expanded={todas}>
              {todas ? 'Mostrar menos' : `Ver todas as ${bloco.linhas.length} linhas`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Pares({ bloco }) {
  return (
    <dl className="mkt-dados-pares">
      {bloco.itens.map((p) => (
        <div key={p.rotulo} className="mkt-dados-par">
          <dt>{p.rotulo}</dt>
          <dd className={p.vazio ? 'text-slate-400' : 'text-slate-800'}>{p.link && !p.vazio ? <Link href={p.link}>{p.texto}</Link> : p.texto}</dd>
        </div>
      ))}
    </dl>
  );
}

const BORDA_LISTA = { bad: 'border-bad-200', warn: 'border-warn-200', neutral: 'border-slate-200' };

function Lista({ bloco }) {
  return (
    <ul className="mkt-dados-lista">
      {bloco.itens.map((i) => (
        <li key={i.id} className={clsx('border-l-2 pl-2.5', BORDA_LISTA[i.tom] || BORDA_LISTA.neutral)}>
          <p className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="text-[13px] font-medium text-slate-800">{i.link ? <Link href={i.link}>{i.titulo}</Link> : i.titulo}</span>
            {i.sub && <span className="text-xs text-slate-500">{i.sub}</span>}
          </p>
          {i.texto && <p className="mt-0.5 break-words text-[13px] text-slate-700">{i.texto}</p>}
          {i.detalhe && <p className={clsx('mt-0.5 break-words text-xs', i.tomDetalhe === 'warn' ? 'text-warn-700' : 'text-slate-500')}>{i.detalhe}</p>}
        </li>
      ))}
    </ul>
  );
}

function Barras({ bloco }) {
  return (
    <div>
      {bloco.titulo && <p className="mkt-dados-legenda-bloco">{bloco.titulo}</p>}
      <ul className="mkt-dados-barras">
        {bloco.itens.map((b, i) => (
          <li key={`${b.rotulo}-${i}`}>
            <span className="mkt-dados-barras-rotulo" title={b.rotulo}>
              {b.rotulo}
            </span>
            <span className="mkt-dados-barras-trilho" aria-hidden="true">
              {/* Zero medido: trilho vazio (o número ao lado diz 0). Não
                  medido: trilho vazio e "não medido" ao lado. */}
              {b.fracao > 0 && <span className="mkt-dados-barras-cheio" style={{ width: `${Math.max(2, Math.min(100, b.fracao * 100))}%` }} />}
            </span>
            <span className={clsx('mkt-dados-barras-valor tnum', b.fracao === null && 'text-slate-400')}>{b.texto}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const LIMITE_AVISOS = 8;

function Avisos({ bloco }) {
  const [todos, setTodos] = useState(false);
  const itens = todos ? bloco.itens : bloco.itens.slice(0, LIMITE_AVISOS);
  return (
    <div>
      <ul className="mkt-dados-avisos">
        {itens.map((a, i) => (
          <li key={i}>
            <span className={clsx('mkt-dados-avisos-ponto', PONTO_AVISO[a.nivel] || PONTO_AVISO.info)} aria-hidden="true" />
            <span className="min-w-0">
              <span className="sr-only">{NIVEL_AVISO[a.nivel] || NIVEL_AVISO.info}: </span>
              {a.texto}
            </span>
          </li>
        ))}
      </ul>
      {bloco.itens.length > LIMITE_AVISOS && (
        <button type="button" className="mkt-dados-mais alvo-40" onClick={() => setTodos((v) => !v)} aria-expanded={todos}>
          {todos ? 'Mostrar menos' : `Ver todos os ${bloco.itens.length} avisos`}
        </button>
      )}
    </div>
  );
}

/** Um bloco qualquer; tipo desconhecido não desenha nada. */
export function Bloco({ bloco, rotulo }) {
  if (!bloco) return null;
  switch (bloco.tipo) {
    case 'numeros':
      return bloco.itens.length ? <Numeros bloco={bloco} /> : null;
    case 'grafico':
      return <GraficoBarras bloco={bloco} />;
    case 'tabela':
      return <Tabela bloco={bloco} rotulo={rotulo} />;
    case 'pares':
      return bloco.itens.length ? <Pares bloco={bloco} /> : null;
    case 'lista':
      return <Lista bloco={bloco} />;
    case 'barras':
      return bloco.itens.length ? <Barras bloco={bloco} /> : null;
    case 'avisos':
      return bloco.itens.length ? <Avisos bloco={bloco} /> : null;
    case 'texto':
      return <p className={clsx('text-[13px]', bloco.tom === 'ok' ? 'text-ok-700' : 'text-slate-600')}>{bloco.texto}</p>;
    default:
      return null;
  }
}
