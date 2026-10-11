/* O BLOCO COMPACTO do Marketing: o cartão da casa (.card) com menos
 * respiro, e o cabeçalho dele numa linha só (marketing.css, .mkt-bloco).
 *
 * Por que não o <Card> de ui.jsx com className: ele já traz p-5 sm:p-6, e um
 * p-4 posto por cima PERDE (as duas classes ficam no elemento e o Tailwind
 * escreve p-5 depois de p-4). Era o que acontecia aqui: os cartões do canal
 * pediam p-4 e saíam com 20px. Classe própria, sem disputa.
 *
 * TopoBloco: o título, a frase de apoio ao lado (no celular ela sai do
 * desenho e fica para o leitor de tela e no title do título) e as ações à
 * direita, que descem para a linha de baixo quando não cabem. O title vai
 * também na própria frase: no computador ela ganha reticências, e quem
 * passava o mouse no trecho cortado não via nada.
 * `subSempre`: a frase é DADO (de onde veio o número, quantos passos faltam,
 * o recorte da lista) ou instrução de uso, e não explicação; aí ela fica à
 * vista também no celular, embaixo do título (o title não abre no toque).
 */
import { clsx } from 'clsx';

export function Bloco({ className, children, ...resto }) {
  return (
    <section className={clsx('card mkt-bloco', className)} {...resto}>
      {children}
    </section>
  );
}

export function TopoBloco({ titulo, sub, subSempre = false, acao, id, className }) {
  return (
    <div className={clsx('mkt-bloco-topo', className)}>
      <div className="mkt-bloco-topo-texto">
        <h2 id={id} className="mkt-bloco-titulo font-display font-semibold text-slate-900" title={typeof sub === 'string' ? sub : undefined}>
          {titulo}
        </h2>
        {sub && (
          // O texto num <span> próprio: quando sobra um fiapo de largura,
          // é ele que sai do desenho, e não a frase (marketing.css).
          <p className={clsx('mkt-bloco-sub text-slate-500', subSempre && 'sempre')} title={typeof sub === 'string' ? sub : undefined}>
            <span className="mkt-bloco-sub-texto">{sub}</span>
          </p>
        )}
      </div>
      {acao && <div className="mkt-bloco-acoes">{acao}</div>}
    </div>
  );
}
