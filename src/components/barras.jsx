/* AS BARRAS DAS ANÁLISES -- módulo próprio porque a tela de Campanhas e as
 * abas de análise de vendas (vendedores, clientes, produtos) desenham as
 * mesmas barras. Importar da página criaria ciclo; duplicar criaria duas
 * réguas para o mesmo desenho.
 */

const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (mes) => {
  const [a, m] = String(mes).split("-");
  return `${MES_CURTO[Number(m) - 1] || m}/${String(a).slice(2)}`;
};

const mil = (v) => (v >= 1000 ? `${Math.round(v / 1000).toLocaleString("pt-BR")} mil` : String(Math.round(v)));

function BarrasAno({ casas, aoClicar, ativo }) {
  const teto = Math.max(...casas.map((c) => c.valor), 1);
  const ALT = 72;
  return (
    <div className="flex items-end gap-1 overflow-x-auto pb-1">
      {casas.map((c) => {
        const alt = c.valor > 0 ? Math.max(2, (c.valor / teto) * ALT) : 0;
        const altCamp = c.valorCampanha > 0 ? Math.min(alt, Math.max(2, (c.valorCampanha / teto) * ALT)) : 0;
        const clicavel = aoClicar && !c.fora;
        const Tag = clicavel ? "button" : "div";
        return (
          <Tag
            key={c.chave}
            {...(clicavel ? { type: "button", onClick: () => aoClicar(c.chave) } : {})}
            className={`flex min-w-[2.4rem] flex-1 flex-col items-center gap-1 rounded-md pt-1 ${
              ativo === c.chave ? "bg-brand-50" : clicavel ? "hover:bg-slate-50" : ""
            }`}
            title={c.titulo}
          >
            <span className="text-[10px] tabular-nums text-slate-400">{c.valor > 0 ? mil(c.valor) : ""}</span>
            <span className="flex w-full flex-col justify-end" style={{ height: `${ALT}px` }}>
              {c.fora ? (
                <span className="h-0.5 w-full rounded bg-slate-200" />
              ) : (
                <>
                  <span
                    className="w-full rounded-t bg-brand-300"
                    style={{ height: `${Math.max(0, alt - altCamp)}px` }}
                  />
                  {altCamp > 0 && (
                    <span
                      className={`w-full bg-warn-400 ${alt - altCamp <= 0 ? "rounded-t" : ""}`}
                      style={{ height: `${altCamp}px` }}
                    />
                  )}
                </>
              )}
            </span>
            <span className={`whitespace-nowrap text-[10px] ${c.fora ? "text-slate-300" : "text-slate-400"}`}>
              {c.rotulo}
              {c.parcial ? "*" : ""}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}

export { MES_CURTO, rotuloMes, mil, BarrasAno };
