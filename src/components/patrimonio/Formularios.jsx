import {useState} from "react";
import {SectionTitle} from "../ui.jsx";
import {SITUACOES,NOMES_GENERICOS} from "../../lib/calc/patrimonio.js";
import {paraNumero,paraCampo,ymdLocal} from "../../lib/format.js";
export function FormBem({ inicial, setores, salvando, aoSalvar, aoFechar }) {
  const [f, setF] = useState(inicial);
  const trocar = (campo) => (e) => setF((v) => ({ ...v, [campo]: e.target.value }));
  return (
    <div className="pat-form">
      <SectionTitle
        titulo={f.id ? (f.codigo || "Equipamento") : "Cadastre o equipamento"}
        sub={
          f.id
            ? "O código da etiqueta não muda -- ele já esta colado no bem."
            : "O código da etiqueta é gerado ao salvar, com a sigla do setor."
        }

      />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          aoSalvar(f);
        }}
      >
        <fieldset disabled={salvando} className="grid gap-4 sm:grid-cols-2"><legend className="pat-form-section">Identificação e localização</legend>
          <div>
            <label className="label" htmlFor="b-setor">Setor</label>
            <select id="b-setor" className="input" value={f.setorSigla} onChange={trocar("setorSigla")} required>
              <option value="">escolha o setor</option>
              {setores.map((s) => (
                <option key={s.id} value={s.sigla}>
                  {s.sigla} — {s.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="b-nome">Tipo do bem</label>
            <input
              id="b-nome"
              className="input"
              list="nomes-genericos"
              placeholder="ex: Computador, Cadeira, Compressor"
              value={f.nomeGenerico}
              onChange={trocar("nomeGenerico")}
              required
            />
            <datalist id="nomes-genericos">
              {NOMES_GENERICOS.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <p className="mt-1 text-xs text-slate-500">Use o mesmo tipo para agrupar equipamentos semelhantes.</p>
          </div>

          <div>
            <label className="label" htmlFor="b-situacao">Situação</label>
            <select id="b-situacao" className="input" value={f.situacao} onChange={trocar("situacao")}>
              {Object.entries(SITUACOES).map(([id, s]) => (
                <option key={id} value={id}>
                  {s.rotulo}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="b-descricao">Descrição técnica</label>
            <input
              id="b-descricao"
              className="input"
              placeholder="marca, modelo, número de série, capacidade, cor..."
              value={f.descricaoTecnica}
              onChange={trocar("descricaoTecnica")}
            />
            <p className="mt-1 text-xs text-slate-500">
              Marca, modelo e série ajudam na identificação: &quot;Dell Optiplex 7090, i5, 16 GB, SSD 512, série 8HJ2K1&quot;.
            </p>
          </div>

        </fieldset><fieldset disabled={salvando} className="grid gap-4 sm:grid-cols-2"><legend className="pat-form-section">Compra e documentação</legend>
          <div>
            <label className="label" htmlFor="b-nf">Nota fiscal</label>
            <input id="b-nf" className="input" placeholder="número da NF" value={f.nf} onChange={trocar("nf")} />
            {!f.nf && <label className="label mt-3">Motivo da ausência da nota<input className="input mt-1" value={f.motivoSemNota || ''} onChange={trocar('motivoSemNota')} placeholder="Ex.: documento ainda não localizado"/></label>}
          </div><div><label className="label" htmlFor="b-responsavel">Responsável pelo cadastro</label><input id="b-responsavel" className="input" value={f.responsavel || ''} onChange={trocar('responsavel')}/>
          </div>

          <div>
            <label className="label" htmlFor="b-data">Data de aquisição</label>
            <input id="b-data" type="date" max={ymdLocal(new Date())} className="input" value={f.dataAquisicao} onChange={trocar("dataAquisicao")} />
          </div>

          <div>
            {/* Texto, nao type=number: 1.250,00 num campo numerico vira lixo. */}
            <label className="label" htmlFor="b-valor">Valor pago (R$)</label>
            <input
              id="b-valor"
              inputMode="decimal"
              className="input"
              placeholder="ex: 3.480,00"
              value={f.valor}
              onChange={trocar("valor")}
              onBlur={(e) => setF((v) => ({ ...v, valor: paraCampo(paraNumero(e.target.value)) }))}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="b-obs">Observação</label>
            <input
              id="b-obs"
              className="input"
              placeholder="garantia até, fornecedor, com quem esta..."
              value={f.observacao}
              onChange={trocar("observacao")}
            />
          </div>
        </fieldset>

        <div className="pat-form-footer flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={salvando}>
            {salvando ? "Salvando..." : f.id ? "Salvar alterações" : "Cadastrar e gerar etiqueta"}
          </button>
          <button type="button" className="btn-ghost" disabled={salvando} onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

export function FormSetor({ inicial, salvando, aoSalvar, aoFechar }) {
  const [f, setF] = useState(inicial);
  const trocar = (campo) => (e) => setF((v) => ({ ...v, [campo]: e.target.value }));
  return (
    <div className="pat-form">
      <SectionTitle
        titulo={f.id ? `Editar setor ${f.sigla}` : "Novo setor"}
        sub="A sigla vai na etiqueta (PRD-001). Curta: etiqueta comprida não cabe na lateral da máquina."

      />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          aoSalvar(f);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="s-sigla">Sigla</label>
            <input
              id="s-sigla"
              className="input uppercase"
              maxLength={4}
              placeholder="ex: PRD"
              value={f.sigla}
              onChange={(e) => setF((v) => ({ ...v, sigla: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") }))}
              required
              disabled={!!f.id}
            />
            {f.id && <p className="mt-1 text-xs text-slate-500">A sigla não muda: ela já esta nas etiquetas coladas.</p>}
          </div>
          <div>
            <label className="label" htmlFor="s-nome">Nome do setor</label>
            <input id="s-nome" className="input" placeholder="ex: Produção" value={f.nome} onChange={trocar("nome")} required />
          </div>
          <div>
            <label className="label" htmlFor="s-area">Área (opcional)</label>
            <input id="s-area" className="input" placeholder="ex: Operações" value={f.area} onChange={trocar("area")} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar setor"}
          </button>
          <button type="button" className="btn-ghost" disabled={salvando} onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

