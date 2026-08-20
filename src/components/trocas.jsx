/* O QUE PERMUTA E CAMPANHA TÊM EM COMUM.
 *
 * As duas telas fazem o mesmo trabalho: escolher clientes da carteira, aceitar
 * O.S. uma a uma, agrupar por CNPJ. No banco é a mesma função (`troca_mexer`).
 * O que muda é a PERGUNTA que cada uma faz com o resultado -- "quanto sobra do
 * crédito" contra "quanto vendemos para este evento" -- e pergunta é conta, que
 * mora em `lib/calc`.
 *
 * Estes pedaços vivem aqui, e não copiados nas duas telas, pelo motivo que já
 * custou caro hoje: a mesma regra escrita duas vezes vira uma regra corrigida e
 * outra esquecida. Foi assim que o contas a pagar ficou sem descontar o
 * pagamento parcial enquanto o contas a receber já descontava.
 */

import { ChevronDown, Trash2, X, Check, AlertTriangle, Paperclip } from "lucide-react";
import { moedaCheia, dataCurta, dataLonga } from "../lib/format.js";
import { Card, Empty } from "./ui.jsx";

/* AQUI O CENTAVO CONTA, ao contrário do resto do painel. Nas outras telas o
   dinheiro é grandeza e o `moeda()` corta os centavos. Permuta e campanha são
   CONTAS que fecham com alguém de fora: meio real inventado é a primeira coisa
   que o outro lado encontra. */
export const dinheiro = moedaCheia;

/* A DATA PRECISA DO ANO. As outras telas olham o mês corrente e dd/MM basta.
   Estas duas atravessam anos -- "30/09" ao lado de "05/08" parece anterior
   quando é um ano depois. */
export const dataDaOS = (iso) => {
  if (!iso) return "";
  const ano = String(iso).slice(0, 4);
  return ano === String(new Date().getFullYear()) ? dataCurta(iso) : dataLonga(iso);
};

/* CNPJ só para conferir com o olho: o cadastro pode trazer CPF de pessoa
   física no mesmo campo. Formata os dois. */
export const formatarDoc = (d) => {
  const s = String(d || "");
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return s;
};

export const hojeISO = () => new Date().toISOString().slice(0, 10);
export const novoId = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export function Aviso({ aviso, aoFechar }) {
  if (!aviso) return null;
  const erro = aviso.tom === "erro";
  return (
    /* GRUDADO NO TOPO DA TELA. O aviso ficava no fluxo da página, e a página
       de permuta é longa: quem estava rolando na lista de O.S. lá embaixo
       recebia um erro que aparecia fora do campo de visão, e o clique parecia
       simplesmente não ter feito nada. Erro que não é visto é erro que não
       existe para quem usa. */
    <Card
      role="status"
      aria-live="polite"
      className={`sticky top-2 z-20 flex items-start justify-between gap-3 text-sm shadow-lg ${
        erro ? "border-bad-200 bg-bad-50 text-bad-700" : "border-ok-200 bg-ok-50 text-ok-700"
      }`}
    >
      <span className="flex items-start gap-2">
        {erro ? <AlertTriangle size={16} className="mt-0.5 shrink-0" /> : <Check size={16} className="mt-0.5 shrink-0" />}
        {aviso.texto}
      </span>
      <button type="button" onClick={aoFechar} className="shrink-0 text-current opacity-60 hover:opacity-100" aria-label="Fechar aviso">
        <X size={14} />
      </button>
    </Card>
  );
}

/* SEÇÃO QUE RECOLHE. A tela de uma permuta é alta -- crédito, consumo, O.S.
   aceitas, o que falta escolher, histórico -- e a direção quase sempre quer o
   saldo, não tudo. Clicar no título recolhe.

   O CONTEÚDO CONTINUA MONTADO, escondido pela classe `.recolhido`, e não
   desmontado por um `&&`. Duas razões: recolher e reabrir não perde o que
   estava digitado no formulário aberto ali dentro; e, principalmente, o PDF
   sai completo -- `.recolhido` volta a aparecer no `@media print`. Recolher é
   um gesto de leitura, não uma decisão sobre o que o parceiro recebe.

   A escolha fica guardada no aparelho: quem trabalha com o consumo recolhido
   não quer reabri-lo a cada visita. */
export function Secao({ id, titulo, sub, acao, aberta, aoAlternar, semImpressao, children }) {
  return (
    <Card className={`space-y-3 ${semImpressao ? "sem-impressao" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => aoAlternar(id)}
          aria-expanded={aberta}
          className="group flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <ChevronDown
            size={16}
            className={`mt-0.5 shrink-0 text-slate-400 transition-transform group-hover:text-slate-600 ${
              aberta ? "" : "-rotate-90"
            }`}
          />
          <span className="min-w-0">
            <span className="block font-display font-medium text-slate-800">{titulo}</span>
            {sub && <span className="block text-xs text-slate-500">{sub}</span>}
          </span>
        </button>
        {acao && <div className="shrink-0 sem-impressao">{acao}</div>}
      </div>
      <div className={aberta ? "space-y-3" : "recolhido"}>{children}</div>
    </Card>
  );
}

/* UM PAINEL POR CNPJ nas O.S. aceitas.
 *
 * Uma permuta grande abrange várias empresas do mesmo dono -- a do material
 * político tem cinco candidaturas, cada uma com o seu CNPJ. Numa lista corrida
 * as O.S. das cinco ficam intercaladas por data, e "quanto saiu por esta
 * candidatura" -- a pergunta que se faz conferindo com o parceiro -- exige
 * somar à mão.
 *
 * NASCE RECOLHIDO quando há mais de um grupo: aí a primeira coisa que se vê são
 * cinco linhas com cinco totais, em vez de vinte e cinco linhas misturadas. Com
 * um grupo só, agrupar não separa nada e ele já abre.
 */
export function GrupoCliente({ g, aberto, aoAlternar, aoTirar, onde = "permuta" }) {
  return (
    <div className="border-b border-slate-100 last:border-0">
      <button
        type="button"
        onClick={() => aoAlternar(g.chave)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 py-2.5 text-left hover:bg-slate-50"
      >
        <ChevronDown
          size={15}
          className={`shrink-0 text-slate-400 transition-transform ${aberto ? "" : "-rotate-90"}`}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-slate-800">{g.cliente}</span>
          <span className="text-[11px] text-slate-400">
            {g.cnpj ? formatarDoc(g.cnpj) : "sem CNPJ no cadastro"} · {g.qtd} O.S.
          </span>
        </span>
        <span className="shrink-0 font-medium tabular-nums text-slate-700">{dinheiro(g.valor)}</span>
      </button>
      {aberto && (
        <div className="pb-1 pl-6">
          {g.linhas.map((l) => (
            <LinhaAceita onde={onde} key={l.id} l={l} aoTirar={aoTirar} />
          ))}
        </div>
      )}
    </div>
  );
}

export function LinhaAceita({ l, aoTirar, onde = "permuta" }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium text-slate-800">O.S. {l.numero}</span>
          <span className="truncate text-xs text-slate-500">{l.cliente}</span>
          {l.mudou && (
            <span className="rounded bg-warn-50 px-1.5 py-0.5 text-[11px] text-warn-700">
              era {dinheiro(l.congelado)} no aceite
            </span>
          )}
          {l.sumiu && (
            <span className="rounded bg-bad-50 px-1.5 py-0.5 text-[11px] text-bad-700">
              cancelada no ERP — ainda abate
            </span>
          )}
          {l.semConferir && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">valor do aceite</span>
          )}
        </div>
        <div className="text-[11px] text-slate-400">
          {dataDaOS(l.data)}
          {/* A CONTA À VISTA quando houve desconto. "R$ 2.000,00" sozinho não
              responde de onde saiu, e foi guardar só o resultado que deixou o
              desconto passar batido. Assim a direção confere contra o PDF do
              ERP na frente do parceiro, sem abrir o ERP. */}
          {l.desconto > 0 && (
            <span className="ml-2">
              {dinheiro(l.bruto)} − {dinheiro(l.desconto)} de desconto
            </span>
          )}
        </div>
      </div>
      <span className="shrink-0 tabular-nums text-slate-700">{dinheiro(l.valor)}</span>
      <button
        type="button"
        onClick={() => aoTirar(l)}
        className="shrink-0 rounded p-1 text-slate-300 hover:bg-bad-50 hover:text-bad-600"
        title={`Tirar esta O.S. da ${onde}`}
        aria-label={`Tirar a O.S. ${l.numero} da ${onde}`}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

/* Uma entrada do razão da permuta: data, o que foi, quanto, e a nota.
   A NOTA MORA AQUI, não numa gaveta da permuta. Um documento solto não diz a
   qual entrada pertence -- e é justamente isso que o parceiro pergunta quando
   confere: "esses R$ 7.000 são de quê?". */

export function LinhaEscolher({ o, aoMarcar, onde = "permuta" }) {
  const presa = !!o.presaEm;
  return (
    <label
      className={`flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-0 ${
        presa ? "cursor-not-allowed opacity-55" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        className="h-4 w-4 shrink-0 accent-brand-600"
        checked={o.nesta}
        disabled={presa}
        onChange={(e) => aoMarcar(o, e.target.checked)}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2">
          <span className="font-medium text-slate-800">O.S. {o.numero}</span>
          <span className="truncate text-xs text-slate-500">{o.cliente}</span>
          {presa && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
              já está na {onde} “{o.presaEm}”
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400">{dataDaOS(o.data)}</div>
      </div>
      <span className="shrink-0 tabular-nums text-slate-700">{dinheiro(o.valor)}</span>
    </label>
  );
}

/* QUANDO FOI, no fuso de quem lê.
   O servidor carimba em UTC. A primeira versão misturava as duas réguas --
   `dataLonga` converte para o fuso local, mas a hora saía do texto cru
   ("18/08/2026 00:29" quando aqui eram 21:29 do dia 18). Num histórico que
   existe para conferir com alguém de fora, hora errada é pior que hora
   nenhuma. */
export const quandoFoi = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${dataLonga(iso)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/* O QUE ACONTECEU, escrito pelo SERVIDOR.
 *
 * A mecânica é a mesma nas duas telas -- quem, quando, em ordem, no fuso de
 * quem lê. O que muda é a FRASE: a permuta fala de crédito, a campanha fala de
 * venda. Por isso o dicionário entra por fora (`conta`), em vez de existirem
 * dois componentes iguais com textos diferentes.
 *
 * Tipo desconhecido não some: aparece cru. Um evento novo no servidor que a
 * tela ainda não sabe contar tem de ser VISTO -- histórico que engole o que
 * não entende deixa de servir para conferir. */
/* UM CLIQUE, UMA LINHA -- mesmo quando o clique foi um lote.
 *
 * "Marcar todas" grava quarenta O.S. numa transação só, e o servidor carimba um
 * evento por O.S. -- está certo: cada uma entrando é um fato, e é assim que se
 * reconstrói o número depois. Só que quarenta linhas iguais no histórico
 * enterram todo o resto, e o histórico existe para ser LIDO.
 *
 * Junta na leitura, nunca na gravação. Os eventos do mesmo lote têm o mesmo
 * carimbo de hora exato (a função calcula `v_agora` uma vez só), então agrupar
 * por tipo+quem+instante é exato, não é heurística. Os números vão na linha,
 * para nada se perder.
 */
function agrupar(eventos) {
  const saida = [];
  for (const e of eventos) {
    const ultimo = saida[saida.length - 1];
    if (ultimo && ultimo.tipo === e.tipo && ultimo.em === e.em
        && (ultimo.quemNome || ultimo.quem) === (e.quemNome || e.quem)
        && (e.tipo === "aceitouOS" || e.tipo === "tirouOS")) {
      ultimo.juntos.push(e);
      continue;
    }
    saida.push({ ...e, juntos: [e] });
  }
  return saida;
}

export function Historico({ eventos, conta }) {
  if (!eventos.length) return <Empty>Nada registrado ainda.</Empty>;
  return (
    <ol className="space-y-2">
      {agrupar(eventos).map((e, i) => {
        const n = e.juntos.length;
        const total = e.juntos.reduce((s, x) => s + (Number(x.valor) || 0), 0);
        const numeros = e.juntos.map((x) => x.numero).filter(Boolean);
        return (
          <li key={`${e.em}-${i}`} className="flex gap-3 text-sm">
            <span className="w-32 shrink-0 text-[11px] tabular-nums text-slate-400">{quandoFoi(e.em)}</span>
            <span className="min-w-0 text-slate-600">
              <span className="font-medium text-slate-800">{e.quemNome || e.quem}</span>{" "}
              {n === 1 ? (
                (conta[e.tipo] || (() => e.tipo))(e)
              ) : (
                <>
                  {e.tipo === "aceitouOS" ? "marcou" : "tirou"} {n} O.S. de uma vez ({moedaCheia(total)})
                  {numeros.length > 0 && (
                    <span className="text-slate-400">
                      {" — "}
                      {numeros.slice(0, 6).join(", ")}
                      {numeros.length > 6 && ` e mais ${numeros.length - 6}`}
                    </span>
                  )}
                </>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
