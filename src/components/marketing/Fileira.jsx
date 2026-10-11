/* A FILEIRA DE CHIPS do Marketing: a faixa presa no topo, que rola de lado.
 *
 * Com 11 canais a fileira não cabe na tela nem no computador, e a barra de
 * rolagem fina embaixo dos chips não dizia que havia mais: o dono procurou o
 * Facebook e o Google Meu Negócio, que estavam lá, à direita, fora da vista.
 * Daí, desde 11/10/2026:
 *  - SETAS NAS PONTAS (44px), só para o lado em que há o que ver. Por cima
 *    dos chips, e não ao lado: seta que entra e sai do fluxo muda a largura
 *    da faixa, que muda se há o que rolar, que faz a seta entrar e sair;
 *  - ESMAECIDO NAS BORDAS com mais conteúdo (máscara do CSS: vale para o
 *    tema claro e o escuro sem cor nenhuma escrita aqui);
 *  - o CHIP ESCOLHIDO SEMPRE À VISTA, fora da área da seta, e o chip que
 *    recebe o foco pelo Tab também.
 * A barra de rolagem some: as setas, o dedo e o gesto de lado (trackpad,
 * Shift+roda) fazem o trabalho dela, e a faixa fica mais baixa.
 *
 * A RODA DO MOUSE EM PÉ É DA PÁGINA. Ela já rolou a fileira de lado, e a
 * faixa presa no topo segurava 7 voltas da roda (a 1280px) antes de a página
 * andar, nos dois sentidos: quem subia a tela com o ponteiro na altura da
 * faixa via os chips correrem e a página parada. Com as setas à vista, a roda
 * voltou a ser só da página.
 *
 * `escolhido` é a chave do chip aceso (muda quando a pessoa troca de canal);
 * `quantos` é o número de chips (os canais chegam depois do primeiro desenho).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

// A largura da seta. O número mora num lugar só, a variável --mkt-seta de
// .mkt-fileira-trilho (marketing.css), que dá também o scroll-padding-inline
// e o fim do esmaecido; daqui ele é lido pelo scroll-padding. No celular o
// encaixe (scroll-snap) puxa a fileira para o ponto de encaixe mais perto, e
// um chip posto em qualquer outra distância era empurrado de volta para
// baixo da seta (foi o que a prévia em 375px mostrou com o Instagram). Os
// 44 abaixo só valem se o CSS não chegou.
function margemDaSeta(t) {
  try {
    const m = parseFloat(window.getComputedStyle(t).scrollPaddingLeft);
    return Number.isFinite(m) && m > 0 ? m : 44;
  } catch {
    return 44;
  }
}

function semAnimacao() {
  try {
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

// Foco que veio do teclado. O clique do mouse também dá foco ao botão, e
// rolar a fileira entre o apertar e o soltar do botão do mouse tirava o chip
// de baixo do ponteiro: o clique se perdia. Navegador sem :focus-visible
// fica sem o ajuste (o Tab ainda rola o chip que está todo fora da vista).
function focoDoTeclado(el) {
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
}

export default function Fileira({ rotulo, escolhido, quantos, children }) {
  const trilho = useRef(null);
  const conteudo = useRef(null);
  const [lados, setLados] = useState({ esq: false, dir: false });
  // O último par entregue ao React. A comparação é com ele, e não dentro de
  // um setLados((l) => ...): abrindo direto um canal do fim da fileira, a
  // medida da carga dos dados ficava pendente numa faixa de prioridade mais
  // baixa, cada desenho síncrono reaplicava a função sobre o estado antigo e
  // ganhava um objeto novo, e o React desenhava de novo até o limite de 50
  // ("Esta tela encontrou um erro"). Com o par guardado aqui, valor igual
  // nem chega ao React.
  const ladosRef = useRef(lados);

  // Há o que ver à esquerda? E à direita? 1px de folga: o zoom do navegador
  // deixa o scrollLeft fracionado e a seta nunca sumiria no fim.
  const medir = useCallback(() => {
    const t = trilho.current;
    if (!t) return;
    const max = t.scrollWidth - t.clientWidth;
    const esq = t.scrollLeft > 1;
    const dir = t.scrollLeft < max - 1;
    const antes = ladosRef.current;
    if (antes.esq === esq && antes.dir === dir) return;
    ladosRef.current = { esq, dir };
    setLados(ladosRef.current);
  }, []);

  // Ao rolar, e ao mudar a largura da faixa ou do conteúdo (janela, fonte
  // que terminou de chegar, chips que chegam, pendentes que mudam a largura
  // de um chip): o ResizeObserver vê tudo isso, e não é preciso medir a cada
  // desenho.
  useEffect(() => {
    const t = trilho.current;
    if (!t) return undefined;
    t.addEventListener('scroll', medir, { passive: true });
    window.addEventListener('resize', medir);
    let ro = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(medir);
      ro.observe(t);
      if (conteudo.current) ro.observe(conteudo.current);
    }
    return () => {
      t.removeEventListener('scroll', medir);
      window.removeEventListener('resize', medir);
      ro?.disconnect();
    };
  }, [medir]);

  // Um chip à vista, e não embaixo da seta nem do esmaecido. Fora da vista
  // (inteiro ou em parte), ele vai para o começo da faixa, logo depois da
  // seta da esquerda: é um ponto de encaixe, e o encaixe do celular não o
  // desloca. Sem animação: a rolagem suave era cancelada no celular quando a
  // página ainda estava montando, e o chip aberto ficava cortado.
  const trazerParaVista = useCallback(
    (b) => {
      const t = trilho.current;
      if (!t || !b) return;
      const margem = margemDaSeta(t);
      const caixa = t.getBoundingClientRect();
      const chip = b.getBoundingClientRect();
      const esq = chip.left - caixa.left + t.scrollLeft;
      const dir = esq + chip.width;
      const max = t.scrollWidth - t.clientWidth;
      // A seta só existe se há o que rolar daquele lado: no começo e no fim
      // da fileira a margem é zero.
      const margemEsq = t.scrollLeft > 1 ? margem : 0;
      const margemDir = t.scrollLeft < max - 1 ? margem : 0;
      const visivel = esq >= t.scrollLeft + margemEsq && dir <= t.scrollLeft + t.clientWidth - margemDir;
      if (!visivel) t.scrollLeft = Math.max(0, Math.min(max, esq - margem));
      medir();
    },
    [medir]
  );

  // O chip escolhido, ao abrir a página e a cada troca. Efeito de LAYOUT: a
  // rolagem e a medida caem no mesmo desenho, antes de pintar, e a fileira
  // não aparece num lugar para pular para outro.
  useLayoutEffect(() => {
    trazerParaVista(trilho.current?.querySelector('[aria-pressed="true"]'));
  }, [escolhido, quantos, trazerParaVista]);

  // O chip que recebe o foco pelo Tab. O navegador só rola sozinho o chip
  // que está TODO fora da vista; o que está em parte embaixo da seta ficava
  // lá, com o anel do foco escondido (medido a 375 e a 1280px).
  const aoFocar = (e) => {
    const b = e.target.closest?.('button');
    if (b && focoDoTeclado(b)) trazerParaVista(b);
  };

  const rolar = (sentido) => {
    const t = trilho.current;
    if (!t) return;
    // Três quartos da faixa: o último chip à vista vira o primeiro, e a
    // pessoa não perde o fio de onde estava.
    t.scrollBy({ left: sentido * Math.max(120, t.clientWidth * 0.75), behavior: semAnimacao() ? 'auto' : 'smooth' });
  };

  return (
    <nav className="mkt-fileira sem-impressao" aria-label={rotulo}>
      <div className="mkt-fileira-caixa">
        <div
          ref={trilho}
          className={`mkt-fileira-trilho${lados.esq ? ' mais-esq' : ''}${lados.dir ? ' mais-dir' : ''}`}
          onFocus={aoFocar}
        >
          <div ref={conteudo} className="mkt-fileira-conteudo">
            {children}
          </div>
        </div>
        {/* Fora do Tab (tabIndex -1): pelo teclado, o Tab anda de chip em
            chip e a fileira rola junto (aoFocar); uma seta que some no fim
            da fileira jogaria o foco no nada. O mouse e o dedo usam. */}
        {lados.esq && (
          <button type="button" tabIndex={-1} className="mkt-fileira-seta esq" aria-label="Ver os canais anteriores" title="Ver os canais anteriores" onClick={() => rolar(-1)}>
            <span>
              <ChevronLeft size={18} strokeWidth={2.4} aria-hidden="true" />
            </span>
          </button>
        )}
        {lados.dir && (
          <button type="button" tabIndex={-1} className="mkt-fileira-seta dir" aria-label="Ver mais canais" title="Ver mais canais" onClick={() => rolar(1)}>
            <span>
              <ChevronRight size={18} strokeWidth={2.4} aria-hidden="true" />
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}
