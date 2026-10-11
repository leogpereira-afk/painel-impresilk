/* A GAVETA: o detalhe de uma ação, publicação ou item do playbook.
 *
 * Variação do JanelaFormulario: o mesmo <dialog> nativo (o navegador cuida
 * de prender o foco dentro, do Esc e do véu), a mesma borda e o mesmo tema
 * escuro. Muda a posição: no computador encosta na lateral direita (420px) e
 * deixa a lista à vista ao lado; no celular sobe de baixo, até 90% da altura.
 * O desenho mora em marketing-kit.css.
 *
 * Quem manda é a página: `aberta` abre, onFechar pede para fechar (Esc, X ou
 * toque fora). A gaveta nunca fecha sozinha sem avisar a página, senão o
 * estado dela diria "aberta" com a gaveta fechada.
 *
 * TOCAR FORA FECHA, A NÃO SER QUE ALGO TENHA SIDO DIGITADO. Detalhe só de
 * leitura fecha com um toque no véu, como toda gaveta. Formulário com algo
 * digitado não: um toque sem querer no véu jogaria fora o que a pessoa
 * escreveu (o JanelaFormulario, pelo mesmo motivo, não fecha no véu). Aí
 * fecha pelo X, pelo Esc ou pelo rodapé.
 *
 * `ocupado` (gravando): nada fecha, para a resposta do servidor não chegar
 * numa gaveta que já sumiu.
 */
import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import './marketing-kit.css';

const CAMPO = 'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])';

export default function Gaveta({ aberta, titulo, onFechar, children, rodape, ocupado = false }) {
  const ref = useRef(null);
  const id = useId();
  const digitou = useRef(false);
  const apertouNoVeu = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!aberta || !el) return undefined;
    const anterior = document.activeElement;
    const rolagem = document.body.style.overflow;
    digitou.current = false;
    if (!el.open) el.showModal();
    document.body.style.overflow = 'hidden';
    // O showModal põe o foco no primeiro botão (o X). Com campo, o foco vai
    // para o primeiro campo, que é onde a pessoa vai escrever.
    el.querySelector('.gaveta-corpo')?.querySelector(CAMPO)?.focus();
    return () => {
      if (el.open) el.close();
      document.body.style.overflow = rolagem;
      if (anterior?.isConnected) anterior.focus();
    };
  }, [aberta]);

  if (!aberta) return null;

  const pedirParaFechar = () => {
    if (!ocupado) onFechar?.();
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      className="gaveta"
      onCancel={(e) => {
        // Esc: a página decide (fecha pelo estado dela, não pelo navegador).
        e.preventDefault();
        pedirParaFechar();
      }}
      onInput={() => {
        digitou.current = true;
      }}
      onMouseDown={(e) => {
        apertouNoVeu.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // O véu é o próprio <dialog>: a .gaveta-caixa cobre a caixa inteira,
        // então clique dentro nunca chega aqui com o dialog como alvo. Mas
        // arrastar a seleção de texto de dentro para fora também termina no
        // dialog: por isso o toque precisa COMEÇAR no véu.
        const noVeu = e.target === e.currentTarget && apertouNoVeu.current;
        apertouNoVeu.current = false;
        if (noVeu && !digitou.current) pedirParaFechar();
      }}
    >
      <div className="gaveta-caixa">
        <span className="gaveta-alca" aria-hidden="true" />
        <header>
          <h2 id={id} className="font-display text-slate-900">
            {titulo}
          </h2>
          <button type="button" className="btn-ghost gaveta-fechar" disabled={ocupado} onClick={pedirParaFechar} aria-label="Fechar">
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        <div className="gaveta-corpo">{children}</div>
        {rodape && <footer className="gaveta-rodape">{rodape}</footer>}
      </div>
    </dialog>
  );
}
