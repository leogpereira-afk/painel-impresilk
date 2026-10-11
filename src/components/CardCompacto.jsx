/* O CARTÃO COMPACTO: título de uma linha, no máximo duas ações à vista e o
 * resto num menu "...".
 *
 * Por que o teto de duas: cartão com cinco botões vira um painel de controle
 * e a ação principal some no meio. As duas primeiras de `acoes` ficam à vista
 * (a primeira pode ser `primaria`); da terceira em diante, mais o que vier em
 * `menu`, vão para o "...".
 *
 * NUNCA CARTÃO DENTRO DE CARTÃO. Borda dentro de borda, sombra dentro de
 * sombra: o olho perde qual caixa é a de fora. Se este cartão for posto
 * dentro de outro `.card` (inclusive outro CardCompacto), ele mesmo tira a
 * moldura e vira um bloco separado por fio, como as linhas da lista.
 *
 * Ação: { rotulo, onClick, href, icone, primaria, perigo, desabilitado,
 *         titulo }. `href` só http(s), mailto, tel ou caminho do próprio
 *         painel: link "javascript:" não vira botão.
 *
 * `emLinha`: título, o que vem em `children` (uma linha de situação) e as
 * ações na MESMA linha, do sm para cima; no celular as ações descem para
 * baixo do título e o "..." fica no canto de cima. Os botões são desenhados
 * com 36px e tocam em 44px (.alvo-44). É o cabeçalho do canal aberto do
 * Marketing, que gastava três linhas onde cabe uma.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { MoreHorizontal } from 'lucide-react';
import './marketing-kit.css';

const HREF_SEGURO = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|\?)/i;
const externo = (href) => /^https?:\/\//i.test(href);

function BotaoAcao({ acao, compacto = false }) {
  const Icone = acao.icone;
  const classe = clsx(
    acao.primaria ? 'btn-primary' : acao.perigo ? 'btn-ghost text-bad-700' : 'btn-outline',
    compacto ? 'alvo-44 min-h-9 px-3 py-1.5' : 'min-h-11'
  );
  const conteudo = (
    <>
      {Icone && <Icone size={16} strokeWidth={2.2} aria-hidden="true" />}
      {acao.rotulo}
    </>
  );
  if (acao.href && HREF_SEGURO.test(acao.href) && !acao.desabilitado) {
    return (
      <a
        className={classe}
        href={acao.href}
        title={acao.titulo}
        {...(externo(acao.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {conteudo}
      </a>
    );
  }
  return (
    <button type="button" className={classe} onClick={acao.onClick} disabled={!!acao.desabilitado} title={acao.titulo}>
      {conteudo}
    </button>
  );
}

/* O menu "...". Abre sob o botão; fecha ao tocar fora, no Esc e ao escolher.
   As setas andam entre os itens. O Esc é segurado aqui: dentro de uma Gaveta,
   o mesmo Esc fecharia a gaveta inteira junto com o menu. */
function MenuMais({ itens }) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef(null);
  const botao = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => {
      if (!raiz.current?.contains(e.target)) setAberto(false);
    };
    document.addEventListener('pointerdown', fora);
    raiz.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
    return () => document.removeEventListener('pointerdown', fora);
  }, [aberto]);

  function teclas(e) {
    if (!aberto) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setAberto(false);
      botao.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const lista = [...(raiz.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
    if (!lista.length) return;
    e.preventDefault();
    const atual = lista.indexOf(document.activeElement);
    const proximo =
      e.key === 'Home' ? 0 : e.key === 'End' ? lista.length - 1 : (atual + (e.key === 'ArrowDown' ? 1 : -1) + lista.length) % lista.length;
    lista[proximo].focus();
  }

  function escolher(item) {
    setAberto(false);
    botao.current?.focus();
    item.onClick?.();
  }

  return (
    <div ref={raiz} className="relative -mr-1 -mt-1 shrink-0" onKeyDown={teclas}>
      <button
        ref={botao}
        type="button"
        className="btn-ghost sem-impressao h-11 w-11 p-0"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        aria-label="Mais ações"
        title="Mais ações"
        onClick={() => setAberto((a) => !a)}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
      </button>
      {aberto && (
        <div id={id} role="menu" className="menu-mais absolute right-0 top-full z-30 mt-1 min-w-[12rem] rounded-xl p-1 shadow-soft">
          {itens.map((item, i) => {
            const Icone = item.icone;
            const classe = clsx(
              'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50',
              item.perigo ? 'text-bad-700' : 'text-slate-700'
            );
            const conteudo = (
              <>
                {Icone && <Icone size={16} strokeWidth={2.2} aria-hidden="true" />}
                {item.rotulo}
              </>
            );
            if (item.href && HREF_SEGURO.test(item.href) && !item.desabilitado) {
              return (
                <a
                  key={item.id || item.rotulo || i}
                  role="menuitem"
                  className={classe}
                  href={item.href}
                  title={item.titulo}
                  onClick={() => setAberto(false)}
                  {...(externo(item.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {conteudo}
                </a>
              );
            }
            return (
              <button
                key={item.id || item.rotulo || i}
                type="button"
                role="menuitem"
                className={classe}
                disabled={!!item.desabilitado}
                title={item.titulo}
                onClick={() => escolher(item)}
              >
                {conteudo}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CardCompacto({ titulo, sub, acoes, menu, children, className, emLinha = false }) {
  const ref = useRef(null);
  const [dentroDeCard, setDentroDeCard] = useState(false);
  // Antes de pintar: se houver um .card acima, este perde a moldura sem
  // piscar com a borda dupla.
  useLayoutEffect(() => {
    setDentroDeCard(!!ref.current?.parentElement?.closest('.card'));
  }, []);

  const lista = (Array.isArray(acoes) ? acoes : []).filter(Boolean);
  const visiveis = lista.slice(0, 2);
  const noMenu = [...lista.slice(2), ...(Array.isArray(menu) ? menu : []).filter(Boolean)];
  const tituloTexto = typeof titulo === 'string' ? titulo : undefined;

  if (emLinha) {
    return (
      <section
        ref={ref}
        className={clsx('cartao-em-linha min-w-0', dentroDeCard ? 'border-t py-3 first:border-0' : 'card p-3', className)}
        style={dentroDeCard ? { borderColor: 'var(--fio-lista, #f0f0f5)' } : undefined}
      >
        <div className="cartao-em-linha-titulo">
          <h3 className="min-w-0 truncate font-display text-sm font-semibold text-slate-900" title={tituloTexto}>
            {titulo}
          </h3>
          {sub && <p className="line-clamp-2 text-xs text-slate-500">{sub}</p>}
          {children}
        </div>
        {visiveis.length > 0 && (
          <div className="cartao-em-linha-acoes">
            {visiveis.map((acao, i) => (
              <BotaoAcao key={acao.id || acao.rotulo || i} acao={acao} compacto />
            ))}
          </div>
        )}
        {noMenu.length > 0 && (
          <div className="cartao-em-linha-menu">
            <MenuMais itens={noMenu} />
          </div>
        )}
      </section>
    );
  }

  return (
    // min-w-0: numa grade ou fileira, o título de uma linha (nowrap) faria o
    // cartão exigir a largura do texto inteiro e a PÁGINA rolaria de lado no
    // celular. Com ele, o cartão cede e o título ganha as reticências.
    <section
      ref={ref}
      className={clsx('min-w-0', dentroDeCard ? 'border-t py-3 first:border-0' : 'card p-3', className)}
      style={dentroDeCard ? { borderColor: 'var(--fio-lista, #f0f0f5)' } : undefined}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-sm font-semibold text-slate-900" title={tituloTexto}>
            {titulo}
          </h3>
          {sub && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{sub}</p>}
        </div>
        {noMenu.length > 0 && <MenuMais itens={noMenu} />}
      </div>
      {children && <div className="mt-2">{children}</div>}
      {visiveis.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {visiveis.map((acao, i) => (
            <BotaoAcao key={acao.id || acao.rotulo || i} acao={acao} />
          ))}
        </div>
      )}
    </section>
  );
}
