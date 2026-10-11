/* O CHIP DO CANAL: a pílula da fileira do Marketing.
 *
 * Inteiro, mostra da esquerda para a direita: ícone, nome, o indicador com a
 * seta, o semáforo (ponto com o texto ao lado) e o número de pendentes, numa
 * pílula de 44px.
 *
 * `compacto` (o que a fileira usa, em toda largura, desde 11/10/2026): com 11
 * canais o chip inteiro deixava 3 ou 4 à vista, e o dono não achou o Facebook
 * nem o Google Meu Negócio (estavam lá, fora da tela). Fica ícone, nome, o
 * indicador só quando passa de zero, o semáforo só como ponto (com um sinal
 * dentro, ✓, relógio ou !, para não depender da cor) e os pendentes num
 * número pequeno. Desenho de 36px, texto de 13px; o toque continua em 44px
 * (.alvo-44). Nada some: o texto do semáforo, o indicador (inclusive o zero
 * e a comparação) e os pendentes vão por extenso no aria-label e no title.
 *
 * A COR DO CANAL é detalhe, nunca fundo: um fio de 3px na borda esquerda, por
 * `style` (classe montada com a cor some no build do Tailwind, e o fundo
 * colorido brigaria com o verde e o vermelho do semáforo: o verde do WhatsApp
 * ao lado de um ponto verde de "em dia" confunde). O chip escolhido usa o
 * padrão da casa, `chip-sel`.
 *
 * Nada aqui calcula: o indicador e o semáforo chegam prontos de
 * lib/calc/marketing-canais.js (indicadorCanal, semaforoCanal).
 */
import { clsx } from 'clsx';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Clock3,
  Facebook,
  Globe,
  Handshake,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  Megaphone,
  MessageCircle,
  Minus,
  Phone,
  Pin,
  Store,
  Youtube,
} from 'lucide-react';
import { numero, numeroCompacto } from '../lib/format.js';

/* Os ícones que o canal pode ter: a mesma lista do check da tabela
   painel_mkt_canais. A tela de Configurações oferece estes, e só estes. */
export const ICONES_CANAL = {
  globe: Globe,
  instagram: Instagram,
  linkedin: Linkedin,
  facebook: Facebook,
  pin: Pin,
  'map-pin': MapPin,
  'message-circle': MessageCircle,
  phone: Phone,
  mail: Mail,
  handshake: Handshake,
  megaphone: Megaphone,
  youtube: Youtube,
  store: Store,
};

/** A cor do canal, só se for #RRGGBB (o formato que o banco aceita). */
export function corDoCanal(canal) {
  return typeof canal?.cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(canal.cor) ? canal.cor : null;
}

/** O ícone pelo nome gravado no canal. Nome desconhecido cai no megafone,
 *  em vez de sumir e desalinhar a fileira. */
export function IconeCanal({ nome, size = 16, className }) {
  const Icone = ICONES_CANAL[nome] || Megaphone;
  return <Icone size={size} strokeWidth={2.2} className={clsx('shrink-0', className)} aria-hidden="true" />;
}

/* A SETA DO MARKETING. O TrendArrow de ui.jsx tem a regra do DSO: prazo de
   recebimento subindo é ruim, então a seta para cima é vermelha. No marketing
   é o contrário (mais publicação, mais alcance, mais lead é bom). Em vez de
   uma segunda seta com a regra oposta escondida (o ui.jsx conta que um
   DeltaBadge assim já esperou alguém escolher a régua errada), esta exige
   dizer a regra em cada uso: `subirE="bom"` ou `subirE="ruim"`. Sem dizer, a
   seta só aponta e fica cinza: direção sem julgamento.
   A forma da seta já diz subiu ou caiu; quem usa põe o texto para leitor de
   tela (o ChipCanal põe no aria-label). */
export function SetaVariacao({ variacao, subirE, size = 14 }) {
  if (typeof variacao !== 'number' || !Number.isFinite(variacao)) return null;
  if (variacao === 0) return <Minus size={size} strokeWidth={2.4} className="shrink-0 text-slate-400" aria-hidden="true" />;
  const subiu = variacao > 0;
  const bom = subirE === 'bom' ? subiu : subirE === 'ruim' ? !subiu : null;
  const Seta = subiu ? ArrowUpRight : ArrowDownRight;
  const cor = bom === null ? 'text-slate-500' : bom ? 'text-ok-600' : 'text-bad-600';
  return <Seta size={size} strokeWidth={2.4} className={clsx('shrink-0', cor)} aria-hidden="true" />;
}

const TOM_TEXTO = { ok: 'text-ok-700', warn: 'text-warn-700', bad: 'text-bad-700', neutral: 'text-slate-500' };
const TOM_PONTO = { ok: 'bg-ok-600', warn: 'bg-warn-600', bad: 'bg-bad-600', neutral: 'bg-slate-400' };
/* O ponto do chip compacto é a ÚNICA marca do estado à vista (o texto foi
   para o title e o aria-label), e precisa de 3:1 contra o chip. Os tons do
   ponto inteiro não chegavam lá no tema claro: o âmbar dava 2,9:1 no chip
   comum e 2,5:1 no escolhido, o verde 3,0 e 2,6, o cinza 2,3. No claro vai um
   tom mais escuro (4,3 a 4,6:1 no chip comum, 3,7 a 3,9:1 no escolhido, e o
   sinal branco a 4,8:1 ou mais). No escuro é o contrário: o tom escuro
   sumia no chip escolhido (2,7:1), então o par `dark:` fica no tom de antes
   (4,1 a 5,1:1), e o vermelho sobe um tom (o 600 dava 2,8:1 no escolhido; o
   500 dá 3,6). */
const TOM_PONTO_COMPACTO = {
  ok: 'bg-ok-700 dark:bg-ok-600',
  warn: 'bg-warn-700 dark:bg-warn-600',
  bad: 'bg-bad-600 dark:bg-bad-500',
  neutral: 'bg-slate-500 dark:bg-slate-400',
};

/** O ponto do semáforo. Inteiro: ponto e texto. Compacto: ponto de 14px com
 *  um sinal dentro (a forma diz o estado sem depender da cor) e o texto para
 *  o leitor de tela e para o dedo que pousa em cima (title). */
export function PontoSemaforo({ semaforo, compacto = false }) {
  if (!semaforo?.texto) return null;
  const tom = TOM_PONTO[semaforo.tom] ? semaforo.tom : 'neutral';
  if (compacto) {
    // `relative` segura o sr-only aqui dentro. Sem ele, o texto escondido
    // (position absolute) sobe até o <body>, escapa da fileira que rola de
    // lado e alarga a PÁGINA no celular: foi o que a prévia em 375px mostrou.
    return (
      <span
        className={clsx('relative grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full text-white', TOM_PONTO_COMPACTO[tom])}
        title={semaforo.texto}
      >
        {tom === 'ok' && <Check size={9} strokeWidth={3.5} aria-hidden="true" />}
        {tom === 'warn' && <Clock3 size={9} strokeWidth={3} aria-hidden="true" />}
        {tom === 'bad' && (
          <span aria-hidden="true" className="text-[10px] font-bold leading-none">
            !
          </span>
        )}
        <span className="sr-only">{semaforo.texto}</span>
      </span>
    );
  }
  return (
    <span className={clsx('inline-flex items-center gap-1 text-xs font-medium', TOM_TEXTO[tom])}>
      <span className={clsx('h-2 w-2 shrink-0 rounded-full', TOM_PONTO[tom])} aria-hidden="true" />
      {semaforo.texto}
    </span>
  );
}

const ehNumero = (v) => typeof v === 'number' && Number.isFinite(v);

/** O indicador em palavras, para o title e o leitor de tela: o valor exato,
 *  e não o arredondado do chip. */
function indicadorEmPalavras({ valor, variacao, rotulo }) {
  const base = `${numero(valor)}${rotulo ? ` ${rotulo}` : ''}`;
  if (!ehNumero(variacao)) return base;
  if (variacao === 0) return `${base}, igual ao período anterior`;
  return `${base}, ${numero(Math.abs(variacao))} a ${variacao > 0 ? 'mais' : 'menos'} que no período anterior`;
}

export default function ChipCanal({ canal, indicador, pendentes, semaforo, ativo = false, onClick, compacto = false, icone: Icone }) {
  const cor = corDoCanal(canal);
  const nome = canal?.nome || 'Canal';
  // Indicador sem número (lista que não chegou) não aparece: nada de "0".
  const temIndicador = ehNumero(indicador?.valor);
  // No compacto, nem o zero medido aparece (ocupava lugar em quase todo chip
  // dizendo "nada"); ele continua no aria-label e no title.
  const mostraIndicador = temIndicador && (!compacto || indicador.valor > 0);
  const nPendentes = Number.isInteger(pendentes) && pendentes > 0 ? pendentes : 0;
  const descricao = [
    nome,
    temIndicador && indicadorEmPalavras(indicador),
    semaforo?.texto,
    nPendentes && `${nPendentes} ${nPendentes === 1 ? 'pendente' : 'pendentes'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!ativo}
      aria-label={descricao}
      title={descricao}
      className={clsx(
        ativo ? 'chip-sel' : 'chip-btn',
        // relative: nada posicionado aqui dentro escapa da fileira que rola.
        'sem-impressao relative shrink-0 snap-start whitespace-nowrap',
        compacto ? 'alvo-44 h-9 gap-1 px-2.5 text-[13px]' : 'min-h-11 gap-2 px-3.5 text-sm'
      )}
      style={cor ? { borderLeft: `3px solid ${cor}` } : undefined}
    >
      {Icone ? (
        <Icone size={compacto ? 15 : 16} strokeWidth={2.2} className="shrink-0" aria-hidden="true" />
      ) : (
        <IconeCanal nome={canal?.icone} size={compacto ? 15 : 16} />
      )}
      <span className="max-w-[10rem] truncate">{nome}</span>
      {mostraIndicador && (
        <span className={clsx('tnum inline-flex items-center gap-0.5', compacto ? 'text-[12px]' : 'text-xs')} aria-hidden="true">
          {numeroCompacto(indicador.valor)}
          {/* Sem mudança, sem seta: o traço do "estável" ao lado de um 0
              parecia um sinal de menos. O "igual ao período anterior" fica
              no aria-label e no title. */}
          {indicador.variacao !== 0 && <SetaVariacao variacao={indicador.variacao} subirE="bom" size={compacto ? 12 : 13} />}
        </span>
      )}
      <span aria-hidden="true" className="inline-flex">
        <PontoSemaforo semaforo={semaforo} compacto={compacto} />
      </span>
      {nPendentes > 0 && (
        <span
          aria-hidden="true"
          className={clsx(
            'tnum rounded-full bg-white text-center font-semibold leading-none text-slate-700',
            compacto ? 'min-w-[1.125rem] px-1 py-[3px] text-[11px]' : 'min-w-[1.25rem] px-1.5 py-0.5 text-[11px]'
          )}
        >
          {nPendentes}
        </span>
      )}
    </button>
  );
}
