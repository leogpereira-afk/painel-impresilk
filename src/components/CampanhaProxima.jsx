/* A PRÓXIMA EDIÇÃO, de dentro da campanha (pedido do dono, 24/10/2026):
 * "um botão para já criar a próxima campanha", "um recado do que posso melhorar
 * para a próxima", "uma pequena estratégia para a próxima" e "já criar essas
 * metas para a próxima campanha".
 *
 * Três partes, nesta ordem, porque é a ordem em que se lê no fim de um evento:
 *   1. o RECADO que a edição anterior deixou (se deixou) e o recado desta para a
 *      próxima -- é o campo `proximaCampanha` do planejamento, que antes vivia
 *      escondido num bloco recolhido e ninguém via na hora de criar a seguinte;
 *   2. a ESTRATÉGIA sugerida pelos números (meta, quando, quem, o quê), com a
 *      conta de cada número à vista: é sugestão, quem decide é a direção;
 *   3. o botão que CRIA a edição seguinte já com ano, meta e datas.
 *
 * O recado é NÃO-CONTROLADO, como os campos da ficha: controlado, a resposta
 * de uma gravação chegando no meio da digitação devolvia o texto ao do
 * servidor. Quem remonta ao trocar de campanha é o `key` que o pai põe neste
 * componente inteiro.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { dinheiro, dataDaOS } from "./trocas.jsx";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (ch) => { const [a, m] = String(ch || "").split("-"); return m ? `${MESES[Number(m) - 1] || m}/${a}` : ""; };
const diaMes = (iso) => { const [, m, d] = String(iso || "").split("-"); return d ? `${d}/${m}` : ""; };
const pct = (f) => `${Math.round(Math.abs(Number(f) || 0) * 100)}%`;

function Quadro({ titulo, children }) {
  return (
    <div className="rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-100">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</div>
      {children}
    </div>
  );
}

function Lista({ itens, vazio, extra }) {
  if (!itens?.length) return <div className="text-xs text-slate-500">{vazio}</div>;
  return (
    <ol className="space-y-1 text-sm">
      {itens.map((c, i) => (
        <li key={c.chave || i} className="flex items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-slate-800" title={c.cliente}>{i + 1}. {c.cliente}</span>
          <span className="shrink-0 text-xs tabular-nums text-slate-500">{extra(c)}</span>
        </li>
      ))}
    </ol>
  );
}

export default function CampanhaProxima({ campanha, estrategia: e, proxima, anosUsados = [], recadoAnterior, aoCriar, aoSalvarRecado, salvando }) {
  const recadoRef = useRef(null);
  const recadoGravado = String(campanha?.planejamento?.proximaCampanha || "");
  const [recadoSujo, setRecadoSujo] = useState(false);
  const [recadoAviso, setRecadoAviso] = useState("");
  /* AS SUGESTÕES MUDAM DEPOIS DA MONTAGEM: as O.S. chegam depois, marcar uma
     O.S. recalcula a meta e corrigir o ano no cabeçalho muda o ano seguinte.
     Enquanto a pessoa não mexeu no campo, ele acompanha a sugestão; mexeu,
     fica o que ela digitou. Sem isto, o quadro dizia um número e o campo
     gravava outro. */
  const anoSugerido = proxima?.ano || "";
  const metaSugerida = e?.metaSugerida > 0 ? String(e.metaSugerida) : "";
  const [ano, setAno] = useState(anoSugerido);
  const [meta, setMeta] = useState(metaSugerida);
  const [anoMexido, setAnoMexido] = useState(false);
  const [metaMexida, setMetaMexida] = useState(false);
  useEffect(() => { if (!anoMexido) setAno(anoSugerido); }, [anoSugerido, anoMexido]);
  useEffect(() => { if (!metaMexida) setMeta(metaSugerida); }, [metaSugerida, metaMexida]);
  const [criando, setCriando] = useState(false);
  /* AS AÇÕES DA ESTRATÉGIA (pedido do dono, 24/10/2026): "procurar primeiro"
     vira ações com responsável e data no planejamento da edição nova. */
  const [responsavel, setResponsavel] = useState("");
  const [comAcoes, setComAcoes] = useState(true);
  const nProcurar = e?.procurarPrimeiro?.length || 0;
  const nRecuperar = e?.naoVoltaram?.length || 0;
  const nAcoes = nProcurar + nRecuperar;
  const anoAtual = String(campanha?.ano || "").trim();
  const anoLimpo = ano.replace(/\D/g, "").slice(0, 4);
  const anoOk = /^\d{4}$/.test(anoLimpo);
  const eDoAtual = anoOk && anoLimpo === anoAtual;
  const jaExiste = anoOk && !eDoAtual && anosUsados.map(String).includes(anoLimpo);
  const podeCriar = anoOk && !eDoAtual && !jaExiste && !criando && !salvando;

  async function salvarRecado() {
    const texto = recadoRef.current?.value ?? "";
    setRecadoAviso("");
    const salvo = await aoSalvarRecado(texto);
    /* "Não deu erro" nunca foi prova de que gravou: confere o que voltou. */
    if (salvo && String(salvo.planejamento?.proximaCampanha || "") === texto.trim()) {
      setRecadoSujo(false);
      setRecadoAviso(texto.trim() ? "Recado salvo. Ele aparece na edição seguinte." : "Recado apagado.");
    } else {
      setRecadoAviso("Não consegui confirmar o recado salvo. Confira e tente de novo.");
    }
  }

  async function criar() {
    setCriando(true);
    try { await aoCriar({ ano: anoLimpo, meta, responsavel, comAcoes: comAcoes && nAcoes > 0 }); } finally { setCriando(false); }
  }

  return (
    <div className="space-y-4">
      {recadoAnterior && (
        <div className="rounded-lg border border-warn-200 bg-warn-50 px-3 py-2 text-sm text-warn-800">
          <div className="text-[11px] font-semibold uppercase tracking-wide">Recado da edição de {recadoAnterior.ano}</div>
          <p className="mt-0.5 whitespace-pre-wrap">{recadoAnterior.texto}</p>
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-slate-700" htmlFor="recado-proxima">O que melhorar na próxima edição</label>
        <textarea
          id="recado-proxima"
          ref={recadoRef}
          defaultValue={recadoGravado}
          maxLength={10000}
          rows={3}
          className="input mt-1 w-full"
          placeholder="O que faltou, o que deu certo e o que fazer diferente. Fica guardado aqui e aparece na edição seguinte."
          onChange={() => { setRecadoSujo(true); setRecadoAviso(""); }}
        />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost" disabled={salvando || !recadoSujo} onClick={salvarRecado}>
            Salvar recado
          </button>
          {/* A região viva fica montada sempre: criada junto com o texto, o
              leitor de tela costuma não anunciar. */}
          <span role="status" aria-live="polite" className="text-xs text-slate-500">{recadoAviso}</span>
          {!recadoAviso && !recadoSujo && recadoGravado && (
            <span className="text-xs text-slate-500">Vai aparecer na edição seguinte.</span>
          )}
        </div>
      </div>

      {e && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
            <Sparkles size={14} className="text-brand-600" /> Estratégia sugerida para {proxima?.ano || "a próxima edição"}
          </div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Quadro titulo="Meta sugerida">
              <div className="text-xl font-semibold tabular-nums text-slate-800">
                {e.metaSugerida > 0 ? dinheiro(e.metaSugerida) : "sem base ainda"}
              </div>
              <div className="text-xs text-slate-500">
                {e.vendido > 0
                  ? e.crescimento === null
                    ? `vendido de ${e.ano} ${dinheiro(e.vendido)} + 10%, ${e.anterior ? `a edição de ${e.anterior.ano} não tem venda marcada para comparar` : "sem edição anterior para comparar"}`
                    : `vendido de ${e.ano} ${dinheiro(e.vendido)} ${e.crescimento >= 0 ? "cresceu" : "caiu"} ${pct(e.crescimento)} contra ${e.anterior.ano}; a meta sobe ${pct(e.fator)}`
                  : "esta edição ainda não tem O.S. marcada"}
                {e.metaAtual > 0 ? ` · meta desta edição ${dinheiro(e.metaAtual)}` : ""}
              </div>
            </Quadro>
            <Quadro titulo="Quando começar">
              {e.primeiraVenda ? (
                <>
                  <div className="text-sm text-slate-800">
                    Primeira venda em <b>{dataDaOS(e.primeiraVenda)}</b>
                    {e.pico && <> · pico em <b>{mesCurto(e.pico.mes)}</b> ({dinheiro(e.pico.valor)})</>}
                  </div>
                  <div className="text-xs text-slate-500">Comece a procurar os clientes um mês antes de {diaMes(e.primeiraVenda)}.</div>
                </>
              ) : (
                <div className="text-xs text-slate-500">Sem O.S. marcada nesta edição para dizer quando as vendas começam.</div>
              )}
            </Quadro>
            <Quadro titulo="Procurar primeiro">
              <Lista itens={e.procurarPrimeiro} vazio="Nenhum comprador marcado ainda." extra={(c) => `${dinheiro(c.valor)} · ${c.qtd} O.S.`} />
            </Quadro>
            <Quadro titulo={e.anterior ? `Compraram em ${e.anterior.ano} e não voltaram` : "Quem não voltou"}>
              {e.anterior
                ? <Lista itens={e.naoVoltaram} vazio={`Todos os compradores de ${e.anterior.ano} voltaram.`} extra={(c) => dinheiro(c.valor)} />
                : <div className="text-xs text-slate-500">Sem edição anterior ligada para comparar.</div>}
            </Quadro>
            <Quadro titulo="Compram toda edição">
              {e.totalEdicoes > 1
                ? <Lista itens={e.fieis} vazio="Ninguém comprou em mais de uma edição." extra={(c) => `${c.edicoes} de ${e.totalEdicoes} edições`} />
                : <div className="text-xs text-slate-500">Aparece quando houver mais de uma edição ligada.</div>}
            </Quadro>
            <Quadro titulo="O que mais vendeu">
              <Lista
                itens={e.produtosLider.map((p) => ({ chave: p.rotulo, cliente: p.rotulo, valor: p.valor }))}
                vazio="Sem itens lidos nesta carga."
                extra={(c) => dinheiro(c.valor)}
              />
            </Quadro>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Sugestão calculada com as O.S. marcadas nesta edição e nas anteriores ligadas a ela. Quem decide é a direção.
          </p>
        </div>
      )}

      {proxima ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-600">
              Ano
              <input
                className="input mt-1 h-9 w-24 text-center"
                inputMode="numeric"
                maxLength={4}
                value={ano}
                onChange={(ev) => { setAnoMexido(true); setAno(ev.target.value); }}
              />
            </label>
            <label className="text-xs text-slate-600">
              Meta (R$)
              <input
                className="input mt-1 h-9 w-40 text-right tabular-nums"
                inputMode="decimal"
                value={meta}
                placeholder="0"
                onChange={(ev) => { setMetaMexida(true); setMeta(ev.target.value); }}
              />
            </label>
            <label className="text-xs text-slate-600">
              Responsável pelas ações
              <input
                className="input mt-1 h-9 w-48"
                maxLength={120}
                value={responsavel}
                placeholder="quem vai procurar"
                disabled={!comAcoes || nAcoes === 0}
                onChange={(ev) => setResponsavel(ev.target.value)}
              />
            </label>
            <button type="button" className="btn-primary h-9" disabled={!podeCriar} onClick={criar}>
              <ArrowRight size={15} /> Criar a edição de {anoOk ? anoLimpo : "…"}
            </button>
          </div>
          <label className="mt-2 flex items-start gap-2 text-xs text-slate-600">
            <input type="checkbox" className="mt-0.5" checked={comAcoes && nAcoes > 0} disabled={nAcoes === 0} onChange={(ev) => setComAcoes(ev.target.checked)} />
            <span>
              {nAcoes > 0
                ? <>Criar {nAcoes + 1} ações no planejamento da nova: {[nProcurar > 0 ? `${nProcurar} a procurar` : "", nRecuperar > 0 ? `${nRecuperar} a recuperar` : ""].filter(Boolean).join(", ")} e 1 lembrete no Calendário, um mês antes {e?.primeiraVenda ? "da primeira venda desta edição" : "do começo da edição nova"}. Cada uma se marca como concluída no quadro Planejamento.</>
                : "Sem comprador marcado nesta edição para virar ação no planejamento."}
            </span>
          </label>
          {proxima.salto > 1 && !anoMexido && (
            <div className="mt-2 text-xs text-warn-800">
              Este evento já tem edição depois de {anoAtual}; a próxima livre é {proxima.ano}. A estratégia acima vem dos números de {anoAtual}.
            </div>
          )}
          <div className="mt-2 text-xs text-slate-600">
            {eDoAtual && <span className="text-bad-700">{anoLimpo} é o ano desta campanha. Escolha outro ano.</span>}
            {jaExiste && <span className="text-bad-700">Este evento já tem a edição de {anoLimpo}. Abra a que existe em vez de criar outra.</span>}
            {!eDoAtual && !jaExiste && (
              <>
                Nasce com o mesmo nome, ligada a esta, com {campanha?.clientes?.length || 0} {(campanha?.clientes?.length || 0) === 1 ? "comprador" : "compradores"},
                a meta acima e a estratégia gravada no planejamento. As datas acompanham as desta edição; as O.S., os lançamentos e os anexos ficam aqui.
                {recadoGravado ? " Seu recado aparece lá." : " Deixe um recado acima e ele aparece lá."}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-500">Informe o ano desta campanha (4 dígitos) para criar a próxima.</div>
      )}
    </div>
  );
}
