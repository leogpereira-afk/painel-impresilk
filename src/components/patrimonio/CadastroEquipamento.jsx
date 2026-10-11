import {useState} from 'react';
import {X,Car,Cog,Wrench,Building2} from 'lucide-react';
import PessoaRH from './PessoasRH.jsx';
import {podeAbrir} from '../../lib/sessao.js';
import {salvarAtivo,salvarEquipamento} from '../../services/ativos.js';
import {FAMILIAS,CATEGORIAS_POR_FAMILIA,ESPEC_CAMPOS,UNIDADE_PADRAO} from '../../lib/calc/manutencoes.js';
import {paraNumero,paraCampo} from '../../lib/format.js';
import {Card,SectionTitle} from '../ui.jsx';
const ICONE_FAMILIA={veiculo:Car,maquina:Cog,predial:Building2};
const ITEM_VAZIO = {
  id: "",
  tipo: "predial",
  nome: "",
  categoria: "",
  identificacao: "",
  responsavel: "",
  observacao: "",
  especificacao: {},
  medidorAtual: "",
  medidorProximo: "",
};

const identificacaoDe = (f) => {
  const e = f.especificacao || {};
  if (f.tipo === "veiculo") {
    const placa = String(e.placa || "").trim();
    if (placa) return placa;
  }
  if (f.tipo === "maquina") {
    const serie = String(e.numeroSerie || "").trim();
    if (serie) return serie;
  }
  return String(f.identificacao || "").trim();
};

const AJUDA_TIPO = {
  veiculo: "Carro, moto, van ou caminhão da empresa.",
  maquina: "Impressora, router, laser, DTF, compressor — o que produz.",
  predial: "Ar condicionado, quadro elétrico, bomba e instalações do prédio.",
  informatica:"Computadores, rede, telefones e celulares.",
  seguranca:"Câmeras, alarmes, portões e controle de acesso. Nunca cadastre senhas ou biometria.",
};
const EXEMPLO_NOME = {
  veiculo: "ex: Strada da instalação",
  maquina: "ex: Laser fibra 1530",
  predial: "ex: Ar condicionado da produção",
};

function FormItem({ inicial, salvando, aoSalvar, aoFechar, setores }) {
  const [f, setF] = useState(inicial);
  const trocar = (campo) => (e) => setF((v) => ({ ...v, [campo]: e.target.value }));
  const trocarEspec = (campo, maiusculo) => (e) => {
    const v = maiusculo ? e.target.value.toUpperCase() : e.target.value;
    setF((old) => ({ ...old, especificacao: { ...(old.especificacao || {}), [campo]: v } }));
  };
  // Trocar o tipo de um item JÁ cadastrado o servidor recusa (o edital viraria
  // documento e mudaria de permissão). Então o seletor só existe no cadastro.
  const novo = !f.id;
  const campos = ESPEC_CAMPOS[f.tipo] || [];
  const categorias = CATEGORIAS_POR_FAMILIA[f.tipo] || [];
  const unidade = UNIDADE_PADRAO[f.tipo] || "";
  const meta = FAMILIAS[f.tipo] || FAMILIAS.predial;

  return (
    <Card>
      <SectionTitle
        titulo={f.id ? `Editar ${meta.singular.toLowerCase()}` : "Novo item"}
        sub={
          f.id
            ? "O que você mudar aqui vale também na tela Documentos e ativos — é o mesmo cadastro."
            : "Cadastre o equipamento aqui para selecionar nas manutenções."
        }
        acao={
          <button className="btn-ghost" onClick={aoFechar}>
            <X size={15} /> Fechar
          </button>
        }
      />
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          aoSalvar(f);
        }}
      >
        {novo ? (
          <div>
            <span className="label">O que é</span>
            <div className="grid gap-2 sm:grid-cols-3">
              {Object.entries(FAMILIAS).filter(([id])=>['veiculo','maquina'].includes(id)).map(([id, m]) => {
                const Icone = ICONE_FAMILIA[id] || Wrench;
                const marcado = f.tipo === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={marcado}
                    onClick={() =>
                      // Trocar de tipo LIMPA a ficha, a categoria E o medidor:
                      // placa não faz sentido numa câmera (o servidor
                      // descartaria a chave em silêncio, e a pessoa veria o dado
                      // sumir sem entender), e o km digitado para um carro
                      // ficava escondido no estado e ia gravado num item predial
                      // -- que nem mostra o campo.
                      setF((v) => ({
                        ...v, tipo: id, especificacao: {}, categoria: "",
                        medidorAtual: "", medidorProximo: "",
                      }))
                    }
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                      marcado ? "border-brand-300 bg-brand-50" : "hover:bg-slate-50"
                    }`}
                    style={marcado ? undefined : { borderColor: "var(--hairline)" }}
                  >
                    <Icone size={18} strokeWidth={2.2} className={marcado ? "text-brand" : "text-slate-400"} />
                    <span className="min-w-0">
                      <span className={`block font-display text-sm font-semibold ${marcado ? "text-brand-700" : "text-slate-900"}`}>
                        {m.singular}
                      </span>
                      <span className="block text-xs leading-snug text-slate-500">{AJUDA_TIPO[id]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Tipo: <b>{meta.singular}</b> — não dá para trocar depois de cadastrado. Se errou, retire e
            cadastre de novo.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label" htmlFor="i-nome">Nome</label>
            <input
              id="i-nome"
              className="input"
              placeholder={EXEMPLO_NOME[f.tipo]}
              value={f.nome}
              onChange={trocar("nome")}
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="i-categoria">Categoria</label>
            <input
              id="i-categoria"
              className="input"
              list={`cats-${f.tipo}`}
              placeholder="escolha ou digite"
              value={f.categoria}
              onChange={trocar("categoria")}
            />
            <datalist id={`cats-${f.tipo}`}>
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            {['veiculo','maquina','predial','informatica','seguranca'].includes(f.tipo)?<PessoaRH valor={f.responsavelId||''} nome={f.responsavel||''} aoMudar={(responsavelId,responsavel)=>setF(v=>({...v,responsavelId,responsavel}))}/>:<><label className="label" htmlFor="i-responsavel">Responsável</label><input className="input" id="i-responsavel" value={f.responsavel} onChange={trocar('responsavel')}/></>}
          </div>
        </div>

        {/* A ficha técnica da família. Os campos moram em `especificacao` e a
            lista é a mesma que o servidor aceita (ESPEC_PERMITIDA). */}
        <div>
          <p className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-slate-500">
            Ficha {f.tipo === "veiculo" ? "do veículo" : f.tipo === "maquina" ? "da máquina" : "do item"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campos.map((c) => {
              const valor = (f.especificacao || {})[c.id] || "";
              const id = `e-${c.id}`;
              return (
                <div key={c.id} className={c.curto ? "" : ""}>
                  {c.id!=='motorista'&&<label className="label" htmlFor={id}>{c.rotulo}</label>}
                  {c.id==='motorista'?<PessoaRH rotulo={c.rotulo} valor={f.especificacao?.motoristaId||''} nome={valor} aoMudar={(motoristaId,motorista)=>setF(v=>({...v,especificacao:{...v.especificacao,motoristaId,motorista}}))}/>:c.opcoes ? (
                    <>
                      <input
                        id={id}
                        className="input"
                        list={`op-${c.id}`}
                        placeholder="escolha ou digite"
                        value={valor}
                        onChange={trocarEspec(c.id)}
                      />
                      <datalist id={`op-${c.id}`}>
                        {c.opcoes.map((o) => (
                          <option key={o} value={o} />
                        ))}
                      </datalist>
                    </>
                  ) : (
                    <input
                      id={id}
                      type={c.data ? "date" : "text"}
                      className="input"
                      placeholder={c.ph || ""}
                      value={valor}
                      onChange={trocarEspec(c.id, c.maiusculo)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Medidor só onde ele existe. A câmera não roda km nem hora. */}
        {unidade && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label" htmlFor="i-medatual">
                {unidade === "km" ? "Km atual" : "Horas de uso"}
              </label>
              <input
                id="i-medatual"
                inputMode="decimal"
                className="input"
                placeholder={unidade === "km" ? "ex: 92.400" : "ex: 1.340"}
                value={f.medidorAtual}
                onChange={trocar("medidorAtual")}
                onBlur={(e) => setF((v) => ({ ...v, medidorAtual: paraCampo(paraNumero(e.target.value)) }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="i-medprox">
                {unidade === "km" ? "Próxima revisão em (km)" : "Próxima revisão em (horas)"}
              </label>
              <input
                id="i-medprox"
                inputMode="decimal"
                className="input"
                placeholder={unidade === "km" ? "ex: 100.000" : "ex: 1.500"}
                value={f.medidorProximo}
                onChange={trocar("medidorProximo")}
                onBlur={(e) => setF((v) => ({ ...v, medidorProximo: paraCampo(paraNumero(e.target.value)) }))}
              />
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Identificação só no predial. Em veículo e máquina ela é o espelho
              da placa / do nº de série da ficha -- ter os dois na mesma tela
              era convidar a pessoa a digitar valores diferentes para a mesma
              coisa, e a outra tela mostraria um deles. */}
          {f.tipo === "predial" && (
            <div>
              <label className="label" htmlFor="i-identificacao">Onde fica / identificação</label>
              <input
                id="i-identificacao"
                className="input"
                placeholder="ex: sala da produção, 3º andar"
                value={f.identificacao}
                onChange={trocar("identificacao")}
              />
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="label" htmlFor="i-observacao">Observação</label>
            <input
              id="i-observacao"
              className="input"
              placeholder="telefone da assistência, particularidades..."
              value={f.observacao}
              onChange={trocar("observacao")}
            />
          </div>

          {/* Aquisição é opcional e restrita à permissão de inventário.
              A ficha física usa o mesmo ID em Bens e nas manutenções. */}
          {podeAbrir('inventario-valores') && <><div className="sm:col-span-2 mt-1 border-t pt-3" style={{ borderColor: "var(--hairline)" }}>
            <p className="label">Aquisição e inventário <span className="font-normal text-slate-400">— preenchimento opcional</span></p>
          </div>
          <div>
            <label className="label" htmlFor="i-setor">Setor</label>
            <select id="i-setor" className="input" value={f.setorSigla || ""} onChange={trocar("setorSigla")}>
              <option value="">onde fica...</option>
              {(setores || []).map((s) => (
                <option key={s.sigla} value={s.sigla}>{s.sigla} — {s.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="i-nf">Nota fiscal</label>
            <input id="i-nf" className="input" placeholder="número da NF"
              value={f.nf || ""} onChange={trocar("nf")} />
          </div>
          <div>
            <label className="label" htmlFor="i-aquisicao">Data de aquisição</label>
            <input id="i-aquisicao" type="date" className="input"
              value={f.dataAquisicao || ""} onChange={trocar("dataAquisicao")} />
          </div>
          <div>
            <label className="label" htmlFor="i-valor">Valor pago (R$)</label>
            <input id="i-valor" className="input" inputMode="decimal" placeholder="ex: 78.500,00"
              value={f.valor || ""} onChange={trocar("valor")} />
          </div></>}
        </div>

        {novo && f.tipo === "veiculo" && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            IPVA, licenciamento e seguro não se cadastram aqui: este veículo vai aparecer em{" "}
            <b>Documentos e ativos</b>, que é a tela do vencimento de documento.
          </p>
        )}
        {novo && f.tipo === "maquina" && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Contrato de assistência e seguro com data de vencimento se cadastram em{" "}
            <b>Documentos e ativos</b>, que é a tela do vencimento.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" disabled={salvando}>
            {salvando ? "Salvando..." : f.id ? "Salvar" : "Cadastrar item"}
          </button>
          <button type="button" className="btn-ghost" onClick={aoFechar}>
            Cancelar
          </button>
        </div>
      </form>
    </Card>
  );
}


export default function CadastroEquipamento({inicial,setores=[],aoConcluir,aoFechar}) {
 const [salvando,setSalvando]=useState(false),[erro,setErro]=useState('');
 const ficha={...ITEM_VAZIO,...inicial,especificacao:{...inicial.especificacao},medidorAtual:paraCampo(inicial.medidorAtual),medidorProximo:paraCampo(inicial.medidorProximo)};
  async function gravar(f) {
    if (!FAMILIAS[f.tipo]) return setErro("Escolha o tipo do equipamento.");
    setSalvando(true);
    setErro('');
    try {
      // MANDA SÓ O QUE ESTA TELA EDITA -- nada de espalhar `...f`.
      //
      // O servidor mantém o campo que NÃO vem no corpo. Se eu mandasse o
      // registro inteiro, mandaria junto a `validade` e o `temArquivo` que
      // foram lidos quando a página abriu: alguém mexe no IPVA em "Documentos
      // e ativos", eu salvo a ficha aqui meia hora depois e gravo o valor
      // velho por cima. A proteção do servidor só funciona com o campo
      // ausente de verdade -- reenviar o cache da tela a anula.
      const doBem={nomeGenerico:f.nome,descricaoTecnica:[f.categoria,identificacaoDe(f)].filter(Boolean).join(' · '),observacao:f.observacao || ''};
      if(!f.id) Object.assign(doBem,{setorSigla:f.setorSigla || '',nf:f.nf || '',dataAquisicao:f.dataAquisicao || '',valor:paraNumero(f.valor),situacao:'uso'});
      else {
        if(f.setorSigla) doBem.setorSigla=f.setorSigla;
        if(f.nf) doBem.nf=f.nf;
        if(f.dataAquisicao) doBem.dataAquisicao=f.dataAquisicao;
        if(paraNumero(f.valor)>0) doBem.valor=paraNumero(f.valor);
      }
      const salvarFicha=podeAbrir('inventario-valores')?salvarEquipamento:salvarAtivo;
      const salvo=await salvarFicha({
        id:f.id || undefined,cadastroId:f.cadastroId,tipo:f.tipo,nome:f.nome,categoria:f.categoria,responsavel:f.responsavel,responsavelId:f.responsavelId||'',
        identificacao:identificacaoDe(f),observacao:f.observacao,especificacao:f.especificacao || {},
        unidadeMedidor:UNIDADE_PADRAO[f.tipo] || '',medidorAtual:paraNumero(f.medidorAtual),medidorProximo:paraNumero(f.medidorProximo),
      },doBem,f.bemId);

      await aoConcluir(salvo);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

 return <div>{erro&&<p className="pat-notice is-error" role="alert">{erro}</p>}<FormItem inicial={ficha} setores={setores} salvando={salvando} aoSalvar={gravar} aoFechar={aoFechar}/></div>;
}
