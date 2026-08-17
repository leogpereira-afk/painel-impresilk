// Quem entra em cada sistema, num lugar so.
//
// Antes desta tela, saber "o que a Barbara acessa" era abrir tres sistemas e
// somar de cabeca -- as contas viviam em duas tabelas, uma delas com uma linha
// por pessoa POR SISTEMA. Aqui e uma linha por PESSOA, e o que muda por sistema
// e o papel.
//
// O QUE MUDOU EM 16/08/2026, E POR QUE
// Ate hoje esta tela mostrava a TABELA CONSOLIDADA e chamava aquilo de verdade.
// So que a tabela guardava intencao, nao fato: ela dizia "o Leonardo entra no
// PCP" enquanto a conta que existe la se chama `leo`. O dono passou cinco
// tentativas digitando um usuario que nao existe, olhando para uma tela que
// dizia que ele tinha acesso. Vinte e uma linhas estavam assim.
//
// Agora cada sistema e PERGUNTADO, e a tela mostra tres coisas que antes nao
// existiam: o LOGIN com que a pessoa entra ali, se aquela conta EXISTE, e as
// contas que existem la e nao sao de ninguem aqui (as "soltas" -- quase sempre
// a mesma pessoa com o nome escrito de outro jeito).
//
// E ha duas lentes, porque sao duas perguntas diferentes:
//   · Por pessoa  — "o que o Pedro acessa?"
//   · Por sistema — "quem entra no PCP, e com que login?"

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users, KeyRound, DoorOpen, Pencil, AlertTriangle, Search, UserPlus, Power,
  Link2, Plus, X, Check, ChevronRight, ExternalLink,
} from "lucide-react";
import {
  lerAcessos, salvarConta, salvarPapel, removerPapel,
  criarPessoa, definirSenha, desativar, apontarLogin, senhaDoSistema,
} from "../services/acesso.js";
import { Card, SectionTitle, Empty } from "./ui.jsx";
import { Selo, FaixaNumeros, LinhaLista } from "./lista.jsx";
import { MODULOS, COM_DINHEIRO, somenteValidos } from "../lib/modulos.js";

const NOME_SISTEMA = {
  painel: "Painel", rh: "RH", pcp: "PCP", brief: "Brief",
  dre: "DRE", compras: "Compras", pops: "POPs", central: "Central do Léo",
};

// Papeis que cada sistema aceita. COPIA FIEL da lista fechada do equipe-auth
// (supabase/functions/equipe-auth/index.ts, const PAPEIS) -- o servidor valida
// com includes(), sem normalizar: papel que nao esta la e recusado, e papel
// gravado so na tabela nova (que nao tem CHECK) nao e recusado por ninguem e
// simplesmente nao funciona em lugar nenhum.
//
// Esta lista JA ESTEVE ERRADA aqui: "compras" tinha compras/obra (os papeis do
// app antigo) e "pops" nao tinha gestor. Ao mexer, confira na origem.
const PAPEIS = {
  brief: ["vendedor", "designer", "medidor", "admin"],
  pcp: ["admin", "pcp", "montagem", "operacao", "comercial"],
  compras: ["admin", "comprador", "solicitante"],
  dre: ["equipe"],
  pops: ["admin", "gestor", "equipe"],
  rh: ["ADMIN_RH", "GESTOR", "COLABORADOR"],
  // App pessoal do Leo: uma pessoa so, um papel so.
  central: ["dono"],
  // O painel nao usa papel: quem manda la e a lista de modulos (permissoes).
  painel: [],
};

// COM O QUE A PESSOA COMECA ao marcar a caixa. Antes era o primeiro da lista --
// e o primeiro de pcp, compras e pops e "admin", e o de rh e "ADMIN_RH". Um
// clique numa caixa dava a chave do sistema inteiro, sem confirmar nada.
// Comeca sempre pelo menor; subir e escolha explicita no seletor ao lado.
const PAPEL_INICIAL = {
  brief: "medidor",
  pcp: "montagem",
  compras: "solicitante",
  dre: "equipe",
  pops: "equipe",
  rh: "COLABORADOR",
  central: "dono",
  painel: "",
};

const nomeSis = (s) => NOME_SISTEMA[s] || s;

// Para comparar nome com login sem tropecar em acento e maiuscula -- a mesma
// regra que o servidor usa. "Barbara Patrícia" tem de casar com "barbara patricia".
const norma = (s) =>
  String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

// Sistemas que esta tela MOSTRA mas nao administra. A Central do Léo tem porta
// propria (leo-sync) e nao mora em equipe_contas: criar conta ou trocar senha
// nela por aqui fabricaria uma SEGUNDA senha, valida, para o app pessoal do
// dono. O servidor recusa igual -- ver SO_LEITURA em painel-acesso.
const SO_LEITURA = new Set(["central"]);

// Onde cada sistema mora, para abrir dali mesmo. A Central e o app pessoal do
// dono e nao tem atalho no dominio da empresa.
const ENDERECO = {
  painel: "https://impresilk.com.br/painel",
  rh: "https://impresilk.com.br/rh",
  pcp: "https://impresilk.com.br/pcp",
  brief: "https://impresilk.com.br/brief",
  dre: "https://impresilk.com.br/dre",
  compras: "https://impresilk.com.br/compras",
  pops: "https://impresilk.com.br/pops",
  central: "https://leogpereira-afk.github.io/vida-leo/",
};

// O estado de uma linha pessoa×sistema, em uma palavra. E o que decide a cor do
// trilho e o texto do selo -- e o unico lugar onde essa regra mora.
function estadoDoPapel(p) {
  if (!p?.real?.existe) return { chave: "fantasma", rotulo: "não existe lá", tom: "bad" };
  if (p.real.ativo === false) return { chave: "desativada", rotulo: "desativada", tom: "bad" };
  if (p.real.temporaria) return { chave: "temporaria", rotulo: "senha temporária", tom: "warn" };
  return { chave: "ok", rotulo: "ok", tom: "ok" };
}

// A senha temporaria aparece UMA vez. Ela nao fica guardada em lugar nenhum
// legivel -- se a direcao fechar esta caixa sem anotar, o caminho e gerar outra.
function SenhaNova({ senha, nome, aoFechar }) {
  if (!senha) return null;
  return (
    <div className="mb-4 rounded-xl border-2 border-brand bg-brand-50 p-4">
      <p className="font-display text-sm font-semibold text-slate-900">
        Senha de {nome}: <span className="font-mono text-base">{senha}</span>
      </p>
      <p className="mt-1 text-xs text-slate-600">
        Anote e passe para a pessoa agora — esta senha não aparece de novo. Ela é obrigada a
        trocar na primeira entrada.
      </p>
      <button type="button" className="btn-ghost mt-2 h-8 px-2 text-xs" onClick={aoFechar}>
        Já anotei
      </button>
    </div>
  );
}

const VAZIA = { usuario: "", nome: "", tipo: "pessoa", colaborador: "" };

function NovaPessoa({ sistemas, aoCriar, aoCancelar }) {
  const [f, setF] = useState(VAZIA);
  const [papeis, setPapeis] = useState({});
  // O Painel nao tem papel: tem lista de partes. Sem escolher aqui, a pessoa
  // nascia com acesso a NADA dentro do painel -- entrava e nao via tela nenhuma.
  const [modulos, setModulos] = useState([]);
  const [salvando, setSalvando] = useState(false);

  const alternar = (sis) =>
    setPapeis((p) => {
      const n = { ...p };
      if (n[sis] === undefined) n[sis] = PAPEL_INICIAL[sis] ?? "";
      else delete n[sis];
      return n;
    });

  const enviar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    try {
      await aoCriar(f, Object.entries(papeis).map(([sistema, papel]) => ({
        sistema, papel, ...(sistema === "painel" ? { permissoes: modulos } : {}),
      })));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <form onSubmit={enviar} className="mb-4 space-y-3 rounded-xl border p-4"
      style={{ borderColor: "var(--hairline)" }}>
      <p className="font-display text-sm font-semibold text-slate-900">Nova pessoa</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="np-u">Usuário (como ela digita para entrar)</label>
          <input id="np-u" className="input" value={f.usuario} required
            placeholder="ex.: joao"
            onChange={(e) => setF((x) => ({ ...x, usuario: e.target.value }))} />
        </div>
        <div>
          <label className="label" htmlFor="np-n">Nome</label>
          <input id="np-n" className="input" value={f.nome}
            onChange={(e) => setF((x) => ({ ...x, nome: e.target.value }))} />
        </div>
        <div>
          <label className="label" htmlFor="np-t">O que é esta conta</label>
          <select id="np-t" className="input" value={f.tipo}
            onChange={(e) => setF((x) => ({ ...x, tipo: e.target.value }))}>
            <option value="pessoa">Uma pessoa</option>
            <option value="funcao">Porta compartilhada (uma função)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="np-c">Quem é no RH</label>
          <input id="np-c" className="input" list="rh-colaboradores" value={f.colaborador}
            placeholder="obrigatório para dar acesso ao RH"
            onChange={(e) => setF((x) => ({ ...x, colaborador: e.target.value }))} />
        </div>
      </div>

      <div>
        <p className="label mb-2">Em quais sistemas ela entra</p>
        <div className="space-y-2">
          {sistemas.map((sis) => (
            <div key={sis} className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-[7rem] cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={papeis[sis] !== undefined}
                  onChange={() => alternar(sis)}
                  className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand-200" />
                {nomeSis(sis)}
              </label>
              {papeis[sis] !== undefined && (PAPEIS[sis] || []).length > 0 && (
                <select className="input h-8 w-auto py-0 text-xs" value={papeis[sis]}
                  onChange={(e) => setPapeis((p) => ({ ...p, [sis]: e.target.value }))}>
                  {PAPEIS[sis].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              {papeis[sis] !== undefined && sis === "painel" && (
                <div className="w-full">
                  <ModulosDoPainel permissoes={modulos} aoMudar={setModulos} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        A senha é criada por mim e mostrada uma vez aqui na tela. A pessoa troca na primeira entrada.
      </p>
      <div className="flex gap-2">
        <button className="btn-primary" disabled={salvando}>
          {salvando ? "Criando..." : "Criar e dar acesso"}
        </button>
        <button type="button" className="btn-ghost" onClick={aoCancelar}>Cancelar</button>
      </div>
    </form>
  );
}

// O que a pessoa enxerga DENTRO do painel. Ficava numa segunda tela, que
// repetia usuario, nome e senha -- duas listas de conta na mesma pagina, cada
// uma mandando num pedaco. Agora e aqui, no cartao da propria pessoa.
function ModulosDoPainel({ permissoes, aoMudar }) {
  // Descarta na LEITURA o que nao existe mais (fluxo-caixa, produtos). Sem isto,
  // marcar qualquer caixa reenviaria o id aposentado junto e a tela levaria um
  // aviso de erro por causa de um dado velho que ela mesma carregou.
  const doServidor = somenteValidos(permissoes);

  /* ESTADO LOCAL, senao dois cliques seguidos perdem o primeiro.
     Cada clique montava a lista nova a partir da prop, que so muda quando o
     servidor responde e a lista inteira recarrega. Marcando duas caixas rapido,
     a segunda partia da lista ANTIGA e apagava a primeira -- e a tela mostrava
     o resultado errado como se fosse o certo. */
  const [local, setLocal] = useState(null);
  const atuais = local ?? doServidor;
  // Quando o servidor responde, ele passa a mandar de novo.
  useEffect(() => { setLocal(null); }, [permissoes]);

  const total = atuais.includes("*");
  const aplicar = (lista) => { setLocal(lista); aoMudar(lista); };
  const marcar = (id) =>
    aplicar(atuais.includes(id) ? atuais.filter((x) => x !== id) : [...atuais, id]);

  return (
    <div className="mt-2 rounded-lg bg-slate-50 p-3">
      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input type="checkbox" checked={total}
          onChange={() => aplicar(total ? [] : ["*"])}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand-200" />
        <span>
          <b className="font-display">Acesso total</b>
          {/* O texto dizia que isto tambem dava para cadastrar e tirar o acesso
              de todo mundo. Nao da, e a promessa era perigosa dos dois lados:
              quem recebia "*" procurava um botao que nao aparecia, e a porta de
              dados chegou a abrir para essa pessoa. Administrar acesso e so da
              conta da direcao. */}
          <span className="block text-xs text-slate-500">
            tudo o que existe <b>dentro do painel</b>, inclusive o que vier depois. Não inclui
            esta tela: cadastrar e tirar acesso continua sendo só da conta da direção.
          </span>
        </span>
      </label>

      {!total && (
        <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {MODULOS.map((m) => (
            <label key={m.id} className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" checked={atuais.includes(m.id)}
                onChange={() => marcar(m.id)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand-200" />
              <span className="min-w-0">
                {m.nome}
                {COM_DINHEIRO.has(m.id) && (
                  <span className="ml-1 text-[11px] text-warn-700">R$</span>
                )}
                <span className="block text-xs leading-tight text-slate-500">{m.sub}</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-400">
        O que não estiver marcado não aparece no menu nem responde se a pessoa digitar o endereço.
        <span className="ml-1 text-warn-700">R$</span> = mostra dinheiro.
      </p>
    </div>
  );
}

/* APONTAR O LOGIN. O campo vem com a lista das contas soltas daquele sistema,
   porque e de la que sai a resposta em quase todo caso: o login existe, so nao
   estava ligado a ninguem. Digitar outro tambem vale -- o servidor recusa o que
   nao existe, em vez de criar. */
function TrocarLogin({ sistema, atual, soltas, aoConfirmar, aoFechar }) {
  const [v, setV] = useState(atual || "");
  const [indo, setIndo] = useState(false);
  const idLista = `soltas-${sistema}`;
  return (
    <form
      className="mt-2 w-full rounded-lg bg-slate-50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setIndo(true);
        try { await aoConfirmar(v.trim()); } finally { setIndo(false); }
      }}
    >
      <label className="label" htmlFor={`lg-${sistema}`}>
        Login desta pessoa no {nomeSis(sistema)}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input id={`lg-${sistema}`} className="input h-9 w-auto min-w-[12rem] flex-1 font-mono text-sm"
          list={idLista} value={v} onChange={(e) => setV(e.target.value)}
          placeholder="como ela digita para entrar ali" autoFocus />
        <datalist id={idLista}>
          {(soltas || []).map((s) => (
            <option key={s.login} value={s.login}>{s.papel ? `${s.papel}` : ""}</option>
          ))}
        </datalist>
        <button className="btn-primary h-9 px-3 text-xs" disabled={indo}>
          {indo ? "Apontando..." : "Apontar"}
        </button>
        <button type="button" className="btn-ghost h-9 px-2 text-xs" onClick={aoFechar}>
          Cancelar
        </button>
      </div>
      {(soltas || []).length > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          Soltas no {nomeSis(sistema)}:{" "}
          {soltas.map((s) => (
            <button key={s.login} type="button" onClick={() => setV(s.login)}
              className="mr-1 rounded bg-white px-1.5 py-0.5 font-mono text-[11px] underline">
              {s.login}
            </button>
          ))}
        </p>
      )}
      <p className="mt-2 text-xs text-slate-500">
        Isto só acerta o apontamento — não cria nem apaga conta nenhuma. Deixe em branco
        para voltar ao palpite ({sistema === "rh" ? "o nome do colaborador" : "o usuário"}).
      </p>
    </form>
  );
}

/* UMA LINHA pessoa × sistema. E aqui que a tela deixou de mentir: alem da
   caixa e do papel, ela mostra COM QUE LOGIN a pessoa entra ali e se aquela
   conta existe. Quando nao existe, os tres caminhos ficam na cara -- apontar
   para a conta certa, criar la, ou tirar da lista. */
function LinhaSistema({ c, sis, p, soltas, vendedores, aoAlternar, aoPapel, aoModulos, aoApontar, aoSenha, aoCriarLa, aoVendedor }) {
  const [editando, setEditando] = useState(false);
  const [vendendo, setVendendo] = useState(false);
  const opcoes = PAPEIS[sis] || [];
  const est = p ? estadoDoPapel(p) : null;

  return (
    <LinhaLista tom={est?.tom || "neutral"}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex min-w-[6.5rem] cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={!!p} onChange={() => aoAlternar(sis)}
            className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand-200" />
          <span className="font-display font-medium text-slate-900">{nomeSis(sis)}</span>
        </label>

        {p && (
          <>
            {/* O LOGIN. Antes nao aparecia em lugar nenhum -- e era ele que
                estava errado. */}
            <span className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">entra como</span>
              <button type="button" onClick={() => setEditando((x) => !x)}
                title="Trocar o login desta pessoa neste sistema"
                className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800 hover:bg-slate-200">
                {p.login || "—"}
              </button>
            </span>

            {est && <Selo tom={est.tom}>{est.rotulo}</Selo>}

            {opcoes.length > 0 && p.real?.existe && (
              <select className="input h-8 w-auto py-0 text-xs"
                value={p.real.papel || p.papel || ""}
                onChange={(e) => aoPapel(sis, e.target.value)}>
                {[...new Set([...opcoes, p.real.papel].filter(Boolean))].map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            )}

            {/* A Central tem porta propria (leo-sync) e nao se administra por
                aqui: o botao chamaria a equipe-auth, que fabricaria uma segunda
                senha valida para o app pessoal do dono. O servidor recusa; o
                botao some para nao prometer. */}
            {p.real?.existe && !SO_LEITURA.has(sis) && (
              <button type="button" onClick={() => aoSenha(sis)}
                className="btn-ghost h-8 px-2 text-xs" title={`Nova senha só no ${nomeSis(sis)}`}>
                <KeyRound size={13} /> Senha aqui
              </button>
            )}

            {sis === "painel" && p.real?.existe && (
              <span className="text-xs text-slate-500">
                {somenteValidos(p.real.permissoes || p.permissoes).includes("*")
                  ? "acesso total"
                  : `${somenteValidos(p.real.permissoes || p.permissoes).length} de ${MODULOS.length} partes`}
              </span>
            )}

            {/* QUEM ELA É NO ERP. Sem isto a pessoa abre a mesa do time inteiro
                em vez da própria fila -- e sem aviso nenhum, porque uma lista
                cheia parece certa. Ficou 149 orçamentos assim com a Michelle.
                O nome tem de ser EXATO como o Mubisys escreve: a comparação só
                junta espaço, não normaliza acento nem sobrenome. */}
            {sis === "painel" && p.real?.existe && (
              <button type="button" onClick={() => setVendendo((x) => !x)}
                title="A quem pertence a fila de orçamentos desta pessoa"
                className={`rounded px-1.5 py-0.5 text-xs ${
                  p.vendedor_id
                    ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    : "bg-warn-50 text-warn-700 hover:bg-warn-100"
                }`}>
                {p.vendedor_id ? `fila de ${p.vendedor_id}` : "sem vendedor"}
              </button>
            )}
          </>
        )}
      </div>

      {/* A DIVERGENCIA, escrita por extenso e com saida. Selo vermelho sem
          caminho e so uma forma mais bonita de nao resolver. */}
      {p && !p.real?.existe && !editando && (
        <div className="mt-2 rounded-lg bg-bad-50 px-3 py-2 text-xs text-bad-700">
          <p>
            Esta tela diz que {c.nome || c.usuario} entra no {nomeSis(sis)} como{" "}
            <b className="font-mono">{p.login}</b>, e não existe conta com esse login lá.
            Enquanto ficar assim, gerar senha para esta pessoa <b>não alcança o {nomeSis(sis)}</b>.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className="btn-outline h-8 px-2 text-xs" onClick={() => setEditando(true)}>
              <Link2 size={13} /> Apontar para a conta certa
            </button>
            <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => aoCriarLa(sis)}>
              <Plus size={13} /> Criar a conta lá
            </button>
            <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={() => aoAlternar(sis)}>
              <X size={13} /> Tirar da lista
            </button>
          </div>
        </div>
      )}

      {p && editando && (
        <TrocarLogin
          sistema={sis} atual={p.login} soltas={soltas}
          aoFechar={() => setEditando(false)}
          aoConfirmar={async (login) => {
            const ok = await aoApontar(sis, login);
            if (ok) setEditando(false);
          }}
        />
      )}

      {p && vendendo && sis === "painel" && (
        <form
          className="mt-2 w-full rounded-lg bg-slate-50 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("vend");
            if (await aoVendedor(String(v || "").trim())) setVendendo(false);
          }}
        >
          <label className="label" htmlFor={`vd-${c.usuario}`}>
            Quem esta pessoa é no ERP (dono da fila de orçamentos)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input id={`vd-${c.usuario}`} name="vend" className="input h-9 w-auto min-w-[12rem] flex-1"
              list="vendedores-erp" defaultValue={p.vendedor_id || ""} autoFocus
              placeholder="em branco = vê a mesa inteira" />
            <datalist id="vendedores-erp">
              {(vendedores || []).map((v) => <option key={v.nome} value={v.nome}>{v.n} orçamentos</option>)}
            </datalist>
            <button className="btn-primary h-9 px-3 text-xs">Salvar</button>
            <button type="button" className="btn-ghost h-9 px-2 text-xs" onClick={() => setVendendo(false)}>
              Cancelar
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Tem de ser <b>exatamente</b> como o Mubisys escreve — a lista acima vem de lá, com
            quantos orçamentos cada nome tem. Deixando em branco, a pessoa passa a ver os
            orçamentos de todo mundo.
          </p>
        </form>
      )}

      {p && sis === "painel" && p.real?.existe && (
        <ModulosDoPainel
          permissoes={p.real.permissoes || p.permissoes || []}
          aoMudar={(perms) => aoModulos(perms)}
        />
      )}
    </LinhaLista>
  );
}

function Conta({ c, sistemas, soltas, vendedores, acoes, aoMudar, aoAvisar, aoSenha }) {
  const [aberta, setAberta] = useState(false);
  const [f, setF] = useState(null);

  const editar = () => {
    // `ativo` viaja junto: sem ele o servidor recebe undefined, assume true e
    // salvar o NOME de alguem desativado devolvia o acesso dela, calado.
    setF({ usuario: c.usuario, nome: c.nome || "", tipo: c.tipo,
           colaborador: c.colaborador || "", ativo: c.ativo !== false });
    setAberta(true);
  };

  const gravar = async (e) => {
    e.preventDefault();
    try {
      await salvarConta(f);
      setF(null);
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const alternarSistema = async (sis) => {
    const tem = c.papeis.some((p) => p.sistema === sis);
    if (tem && !confirm(`Tirar o acesso de ${c.nome || c.usuario} ao ${nomeSis(sis)}? A conta dela naquele sistema é APAGADA.`)) return;
    try {
      if (tem) { await removerPapel(c.usuario, sis); }
      else {
        // Marcar a caixa E dar acesso: aqui criar la e o que se pediu.
        const r = await salvarPapel(
          { usuario: c.usuario, sistema: sis, papel: PAPEL_INICIAL[sis] ?? "" },
          { criar: true });
        // Conta nova naquele sistema nasce com senha temporaria. Se ela nao
        // aparecer aqui, ninguem nunca a vera -- e a pessoa nao entra.
        if (r?.senha) aoSenha({ senha: r.senha, nome: `${c.nome || c.usuario} no ${nomeSis(sis)}` });
      }
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const trocarModulos = async (permissoes) => {
    if (permissoes.includes("*") &&
        !confirm(`Dar ACESSO TOTAL a ${c.nome || c.usuario}?\n\nEla passa a ver TUDO dentro do painel — inclusive dinheiro: contas a pagar, fluxo, margem por orçamento e a tela de Gestão.\n\nNão inclui esta tela: cadastrar e tirar acesso continua só na conta da direção.`)) {
      return;
    }
    try {
      const r = await salvarPapel({ usuario: c.usuario, sistema: "painel", papel: "", permissoes });
      // Modulo que o servidor nao conhece era descartado calado: a caixa ficava
      // marcada e a pessoa nao ganhava nada.
      if (r?.aviso) aoAvisar({ tom: "erro", texto: r.aviso });
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const trocarPapel = (sis, papel) => acoes.papel(c.usuario, sis, papel);

  const apontar = (sis, login) => acoes.apontar(c.usuario, c.nome || c.usuario, sis, login);

  const criarLa = async (sis) => {
    const p = c.papeis.find((x) => x.sistema === sis);
    if (!confirm(`Criar a conta "${p?.login}" no ${nomeSis(sis)}?\n\nSó faça isso se ${c.nome || c.usuario} REALMENTE não tem conta lá — se tiver com outro nome, use "Apontar para a conta certa", senão ficam duas.`)) return;
    try {
      const r = await salvarPapel(
        { usuario: c.usuario, sistema: sis, papel: p?.papel || PAPEL_INICIAL[sis] || "" },
        { criar: true });
      if (r?.senha) aoSenha({ senha: r.senha, nome: `${c.nome || c.usuario} no ${nomeSis(sis)}` });
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const trocarVendedor = async (vendedorId) => {
    try {
      await salvarPapel({ usuario: c.usuario, sistema: "painel", papel: "", vendedorId });
      aoAvisar({
        tom: "ok",
        texto: vendedorId
          ? `${c.nome || c.usuario} passa a ver a fila de "${vendedorId}".`
          : `${c.nome || c.usuario} passa a ver os orçamentos de todo mundo.`,
      });
      await aoMudar();
      return true;
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); return false; }
  };

  const senhaAqui = (sis) => acoes.senha(c.usuario, c.nome || c.usuario, sis);

  const novaSenha = async () => {
    if (!confirm(`Gerar uma senha nova para ${c.nome || c.usuario} em TODOS os sistemas dela?\n\nA senha atual para de valer em todos — inclusive na entrada pelo Painel, que é a porta que a equipe usa.`)) return;
    try {
      const r = await definirSenha(c.usuario);
      aoSenha({ senha: r.senha, nome: c.nome || c.usuario });
      if (r.recusados?.length) {
        aoAvisar({
          tom: "erro",
          texto: `Não alcancei: ${r.recusados.map((x) => `${nomeSis(x.sistema)} (${x.erro})`).join(" · ")}`,
        });
      }
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const alternarAtivo = async () => {
    const ligar = c.ativo === false;
    if (!ligar && !confirm(`Desativar ${c.nome || c.usuario}? Ela para de entrar. Quem já está com a sessão aberta continua até o crachá vencer.`)) return;
    try {
      const r = await desativar(c.usuario, ligar);
      if (r.recusados?.length) {
        aoAvisar({ tom: "erro", texto: r.recusados.map((x) => `${nomeSis(x.sistema)}: ${x.erro}`).join(" · ") });
      }
      await aoMudar();
    } catch (err) { aoAvisar({ tom: "erro", texto: err.message }); }
  };

  const ehFuncao = c.tipo === "funcao";
  const naoMigradas = c.senhas.filter((s) => !s.migrada).length;
  const fora = c.papeis.filter((p) => !p.real?.existe).length;

  return (
    <div className="rounded-xl border" style={{ borderColor: "var(--hairline)" }}>
      <button type="button" onClick={() => setAberta((a) => !a)}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left">
        {ehFuncao
          ? <DoorOpen size={17} className="shrink-0 text-warn-700" title="Porta compartilhada" />
          : <Users size={17} className="shrink-0 text-brand" title="Pessoa" />}
        <span className="min-w-0 flex-1">
          <span className="block font-display text-sm font-semibold text-slate-900">
            {c.nome || c.usuario}
            <span className="ml-2 font-normal text-slate-400">{c.usuario}</span>
          </span>
          <span className="block truncate text-xs text-slate-500">
            {c.papeis.length
              ? c.papeis.map((p) => nomeSis(p.sistema)).sort().join(" · ")
              : "sem sistema nenhum"}
            {c.colaborador ? ` — ${c.colaborador}` : ""}
          </span>
        </span>
        {/* O numero que faz abrir o cartao. Sem ele a divergencia so aparecia
            para quem ja tivesse aberto -- ou seja, para ninguem. */}
        {fora > 0 && (
          <span className="chip-bad shrink-0" title="acessos que não existem no sistema">
            {fora} fora do lugar
          </span>
        )}
        {c.ativo === false && <span className="chip-bad shrink-0">desativada</span>}
        {ehFuncao && <span className="chip-warn shrink-0">porta de função</span>}
      </button>

      {aberta && (
        <div className="space-y-4 border-t px-4 py-3" style={{ borderColor: "var(--hairline)" }}>
          {f ? (
            <form onSubmit={gravar} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`n-${c.usuario}`}>Nome</label>
                  <input id={`n-${c.usuario}`} className="input" value={f.nome}
                    onChange={(e) => setF((x) => ({ ...x, nome: e.target.value }))} />
                </div>
                <div>
                  <label className="label" htmlFor={`t-${c.usuario}`}>O que é esta conta</label>
                  <select id={`t-${c.usuario}`} className="input" value={f.tipo}
                    onChange={(e) => setF((x) => ({ ...x, tipo: e.target.value }))}>
                    <option value="pessoa">Uma pessoa</option>
                    <option value="funcao">Porta compartilhada (uma função)</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor={`c-${c.usuario}`}>Quem é no RH (opcional)</label>
                  <input id={`c-${c.usuario}`} className="input" list="rh-colaboradores"
                    value={f.colaborador} placeholder="escolha na lista do cadastro"
                    onChange={(e) => setF((x) => ({ ...x, colaborador: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2">
                <button className="btn-primary">Salvar</button>
                <button type="button" className="btn-ghost" onClick={() => setF(null)}>Cancelar</button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={editar}>
                <Pencil size={13} /> Editar nome, tipo e vínculo com o RH
              </button>
              <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={novaSenha}>
                <KeyRound size={13} /> Nova senha em todos
              </button>
              <button type="button" className="btn-ghost h-8 px-2 text-xs" onClick={alternarAtivo}>
                <Power size={13} /> {c.ativo === false ? "Reativar" : "Desativar"}
              </button>
            </div>
          )}

          <div>
            <p className="label mb-1">Sistemas, e o login em cada um</p>
            <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--hairline)" }}>
              {sistemas.map((sis) => (
                <LinhaSistema
                  key={sis} c={c} sis={sis}
                  p={c.papeis.find((x) => x.sistema === sis)}
                  soltas={soltas?.[sis]}
                  vendedores={vendedores}
                  aoAlternar={alternarSistema}
                  aoPapel={trocarPapel}
                  aoModulos={trocarModulos}
                  aoApontar={apontar}
                  aoSenha={senhaAqui}
                  aoCriarLa={criarLa}
                  aoVendedor={trocarVendedor}
                />
              ))}
            </div>
          </div>

          {c.senhas.length > 0 && (
            <p className="text-xs text-slate-500">
              {naoMigradas === c.senhas.length
                ? `Guardadas ${c.senhas.length === 1 ? "a senha atual" : `as ${c.senhas.length} senhas atuais`} desta pessoa. Na virada ela entra com qualquer uma delas e essa vira a única.`
                : `${c.senhas.length - naoMigradas} de ${c.senhas.length} já migraram.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* A OUTRA LENTE: "quem entra no PCP, e com que login?".
   Esta pergunta nao tinha resposta em lugar nenhum -- era abrir o sistema e
   olhar. Aqui ela sai do mesmo dado da lente por pessoa: as contas que existem
   de verdade la, com o nome de quem e (ou "de ninguem", que e o caso a
   resolver).

   O RECORTE E O SISTEMA, e o conjunto e FECHADO: o que existe naquele sistema
   esta nesta lista, ponto. Se aparecer alguem aqui que voce nao conhece, e
   porque essa pessoa entra la de verdade. */
function contasDoSistema(sistema, contas, soltas, elenco) {
  const fora = [];
  const dentro = [];
  for (const c of contas) {
    const p = c.papeis.find((x) => x.sistema === sistema);
    if (!p) continue;
    if (p.real?.existe) {
      dentro.push({
        login: p.real.login, papel: p.real.papel, ativo: p.real.ativo,
        temporaria: p.real.temporaria, dono: c, tom: estadoDoPapel(p).tom,
      });
    } else {
      fora.push({ login: p.login, dono: c });
    }
  }
  for (const s of soltas?.[sistema] || []) {
    dentro.push({
      login: s.login, papel: s.papel, ativo: s.ativo, temporaria: s.temporaria,
      dono: null, tom: "warn", nome: s.nome,
    });
  }
  dentro.sort((a, b) => a.login.localeCompare(b.login, "pt-BR"));

  /* O ELENCO DE DENTRO. Quem o sistema conhece e NAO tem conta aqui: as 40
     pessoas do POPs, as 93 fichas do RH, os 15 instaladores do PCP. Quem ja
     aparece como conta sai da lista para nao ser contado duas vezes. */
  const jaTem = new Set(dentro.map((l) => norma(l.login)).concat(dentro.map((l) => norma(l.dono?.nome))));
  const outros = (elenco?.[sistema] || []).filter((e) => !jaTem.has(norma(e.nome)));

  return {
    dentro,
    fora,
    outros,
    // Instalador do PCP nao e "so cadastro": ele ENTRA, tocando no nome.
    entramSemSenha: outros.filter((e) => e.como === "nome").length,
    semDono: dentro.filter((l) => !l.dono).length,
    temporarias: dentro.filter((l) => l.temporaria).length,
    desativadas: dentro.filter((l) => l.ativo === false).length,
  };
}

/* UMA SECAO POR SISTEMA, que abre e fecha. Fechada, ela ja diz o essencial:
   quantas pessoas entram ali e se ha algo torto. Aberta, mostra nome por nome.

   Fechadas por padrao de proposito: oito listas abertas de uma vez sao uma
   parede de nomes, e a pergunta que se faz aqui e sempre sobre UM sistema. */
function SecaoSistema({ sistema, dados, acoes, aberta, aoAlternar, endereco }) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--hairline)" }}>
      <button
        type="button"
        onClick={aoAlternar}
        aria-expanded={aberta}
        className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors ${
          aberta ? "bg-slate-50" : "hover:bg-slate-50"
        }`}
      >
        <ChevronRight
          size={16}
          className={`shrink-0 text-slate-400 transition-transform ${aberta ? "rotate-90" : ""}`}
        />
        <span className="font-display text-sm font-semibold text-slate-900">
          {nomeSis(sistema)}
        </span>
        <span className="tnum text-sm text-slate-500">
          {dados.dentro.length} {dados.dentro.length === 1 ? "conta" : "contas"}
          {dados.outros.length > 0 && (
            <span className="text-slate-400"> · {dados.outros.length} cadastrados</span>
          )}
        </span>
        <span className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
          {dados.fora.length > 0 && (
            <Selo tom="bad" title="a tela promete e o sistema não tem">
              {dados.fora.length} fora do lugar
            </Selo>
          )}
          {dados.semDono > 0 && (
            <Selo tom="warn" title="existe no sistema e não é de ninguém nesta tela">
              {dados.semDono} sem dono
            </Selo>
          )}
          {dados.entramSemSenha > 0 && (
            <Selo tom="warn" title="entram tocando no próprio nome, sem senha">
              {dados.entramSemSenha} entram sem senha
            </Selo>
          )}
          {dados.temporarias > 0 && (
            <Selo tom="warn">{dados.temporarias} senha temporária</Selo>
          )}
          {dados.desativadas > 0 && <Selo tom="bad">{dados.desativadas} desativada</Selo>}
          {dados.fora.length + dados.semDono + dados.temporarias + dados.desativadas === 0 && (
            <Selo tom="ok">em ordem</Selo>
          )}
        </span>
      </button>

      {aberta && (
        <div className="border-t" style={{ borderColor: "var(--hairline)" }}>
          <p className="flex flex-wrap items-center gap-x-2 px-4 pt-3 text-xs text-slate-500">
            <span>
              Lido do próprio {nomeSis(sistema)}, não desta tabela — quem está aqui entra lá.
            </span>
            {endereco && (
              <a href={endereco} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 underline">
                abrir o {nomeSis(sistema)} <ExternalLink size={11} />
              </a>
            )}
          </p>

          {dados.dentro.length === 0 ? (
            <Empty>Nenhuma conta no {nomeSis(sistema)}.</Empty>
          ) : (
            <div className="mt-2">
              {dados.dentro.map((l) => (
                <LinhaLista key={l.login} tom={l.tom}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-[8rem] font-mono text-sm font-semibold text-slate-900">
                      {l.login}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-600">
                      {l.dono ? (
                        l.dono.nome || l.dono.usuario
                      ) : (
                        <span className="text-warn-700">
                          de ninguém nesta tela
                          {l.nome && l.nome !== l.login ? ` — lá está como "${l.nome}"` : ""}
                        </span>
                      )}
                    </span>
                    {/* EDITAR DAQUI MESMO. Antes esta lista so mostrava: o dono
                        abria o PCP, via os nomes e tinha de ir para a outra aba,
                        achar a pessoa e abrir o cartao dela para mexer em uma
                        coisa que ja estava na frente dele. Sao as MESMAS acoes da
                        outra aba (`acoes`), nao uma segunda copia das regras. */}
                    {l.papel && (PAPEIS[sistema] || []).length > 0 && l.dono ? (
                      <select className="input h-8 w-auto py-0 text-xs" value={l.papel}
                        onChange={(e) => acoes.papel(l.dono.usuario, sistema, e.target.value)}>
                        {[...new Set([...(PAPEIS[sistema] || []), l.papel])].map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    ) : l.papel ? (
                      <span className="chip shrink-0">{l.papel}</span>
                    ) : null}
                    {l.ativo === false && <Selo tom="bad">desativada</Selo>}
                    {l.temporaria && <Selo tom="warn">senha temporária</Selo>}
                    {l.dono && !SO_LEITURA.has(sistema) && (
                      <span className="flex shrink-0 gap-1">
                        <button type="button" className="btn-ghost h-8 px-2 text-xs"
                          onClick={() => acoes.senha(l.dono.usuario, l.dono.nome || l.dono.usuario, sistema)}>
                          <KeyRound size={13} /> Senha
                        </button>
                        <button type="button" className="btn-ghost h-8 px-2 text-xs"
                          onClick={() => acoes.tirar(l.dono.usuario, l.dono.nome || l.dono.usuario, sistema)}>
                          <X size={13} /> Tirar
                        </button>
                      </span>
                    )}
                  </div>
                </LinhaLista>
              ))}
            </div>
          )}

          {/* O RESTO DO ELENCO: quem o sistema conhece e nao tem conta aqui. */}
          {dados.outros.length > 0 && (
            <div className="border-t" style={{ borderColor: "var(--hairline)" }}>
              <p className="px-4 pb-1 pt-3 text-xs text-slate-500">
                Mais <b>{dados.outros.length}</b>{" "}
                {dados.outros.length === 1 ? "pessoa cadastrada" : "pessoas cadastradas"} no{" "}
                {nomeSis(sistema)}
                {dados.entramSemSenha > 0
                  ? " — e as marcadas em amarelo ENTRAM, tocando no próprio nome, sem senha."
                  : ", sem conta de entrada."}
              </p>
              {dados.outros.map((e) => (
                <LinhaLista key={`${e.como}-${e.nome}`} tom={e.como === "nome" ? "warn" : "neutral"}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{e.nome}</span>
                    {e.detalhe && <span className="shrink-0 text-xs text-slate-500">{e.detalhe}</span>}
                    {e.como === "nome" && <Selo tom="warn">entra sem senha</Selo>}
                  </div>
                </LinhaLista>
              ))}
            </div>
          )}

          {dados.fora.length > 0 && (
            <div className="m-3 rounded-xl bg-bad-50 px-4 py-3 text-sm text-bad-700">
              <p className="font-display font-semibold">
                A tela promete {dados.fora.length} acesso{dados.fora.length > 1 ? "s" : ""} que
                o {nomeSis(sistema)} não tem
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {dados.fora.map((l) => (
                  <li key={l.login + l.dono.usuario}>
                    {l.dono.nome || l.dono.usuario} entraria como{" "}
                    <b className="font-mono">{l.login}</b> — não existe
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">
                Abra a pessoa em <b>Por pessoa</b> para apontar, criar ou tirar da lista.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AcessoUnico({ aoAvisar }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  const [senhaNova, setSenhaNova] = useState(null);
  /* COMECA EM SISTEMAS. Foi a vista que o dono pediu -- "clico em RH e sei todo
     mundo que esta la" -- e a que ele nao achou. A escolha fica lembrada neste
     aparelho: quem vem administrar UMA pessoa nao quer trocar de aba toda vez. */
  const [lente, setLente] = useState(() => {
    try { return localStorage.getItem("painel_acessos_lente") || "sistema"; } catch { return "sistema"; }
  });
  const trocarLente = useCallback((id) => {
    setLente(id);
    try { localStorage.setItem("painel_acessos_lente", id); } catch { /* aba anonima */ }
  }, []);
  // Quais secoes da lente por sistema estao abertas. Varias ao mesmo tempo e
  // permitido: comparar dois sistemas e uso legitimo, e fechar um para abrir
  // outro seria trabalho a toa.
  const [abertos, setAbertos] = useState({});
  const [recorte, setRecorte] = useState("todas");

  const carregar = useCallback(async () => {
    try {
      setDados(await lerAcessos());
      setErro(null);
    } catch (e) { setErro(e.message); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  /* AS ACOES DE UM ACESSO, NUMA IMPLEMENTACAO SO.
     Elas nasceram dentro do cartao da pessoa. Quando a aba de Sistemas passou a
     precisar das mesmas (o dono abriu o PCP, viu os nomes e nao conseguiu mexer
     em nada), copiar seria repetir regra -- e regra repetida foi exatamente o
     que produziu quase todos os defeitos desta semana. Entao elas subiram para
     ca e recebem `usuario` como argumento; as duas abas chamam as mesmas. */
  const acoes = useMemo(() => ({
    async papel(usuario, sistema, papel) {
      try {
        await salvarPapel({ usuario, sistema, papel });
        await carregar();
      } catch (e) { aoAvisar({ tom: "erro", texto: e.message }); }
    },
    async senha(usuario, nome, sistema) {
      if (!confirm(`Gerar uma senha nova para ${nome} SÓ no ${nomeSis(sistema)}?\n\nVale para quem entra pelo link direto do ${nomeSis(sistema)}. A senha de entrada dela (a do Painel, que abre todos) NÃO muda.`)) return;
      try {
        const r = await senhaDoSistema(usuario, sistema);
        setSenhaNova({ senha: r.senha, nome: `${nome} no ${nomeSis(sistema)} (login ${r.login})` });
        await carregar();
      } catch (e) { aoAvisar({ tom: "erro", texto: e.message }); }
    },
    async tirar(usuario, nome, sistema) {
      if (!confirm(`Tirar o acesso de ${nome} ao ${nomeSis(sistema)}? A conta dela naquele sistema é APAGADA.`)) return;
      try {
        await removerPapel(usuario, sistema);
        await carregar();
      } catch (e) { aoAvisar({ tom: "erro", texto: e.message }); }
    },
    async apontar(usuario, nome, sistema, login) {
      try {
        const r = await apontarLogin(usuario, sistema, login);
        aoAvisar({
          tom: "ok",
          texto: login
            ? `${nome} agora entra no ${nomeSis(sistema)} como "${r.login}"${r.papel ? ` (${r.papel})` : ""}.`
            : `Apontamento no ${nomeSis(sistema)} voltou ao padrão.`,
        });
        await carregar();
        return true;
      } catch (e) { aoAvisar({ tom: "erro", texto: e.message }); return false; }
    },
  }), [carregar, aoAvisar]);

  const criar = useCallback(async (conta, papeis) => {
    try {
      const r = await criarPessoa(conta, papeis);
      setSenhaNova({ senha: r.senha, nome: conta.nome || conta.usuario });
      setCriando(false);
      // Sistema que recusou nao pode virar silencio: a pessoa foi criada, mas
      // nao entra naquele -- e so aqui da para dizer por que.
      if (r.recusados?.length) {
        aoAvisar({
          tom: "erro",
          texto: r.recusados.map((x) => `${nomeSis(x.sistema)}: ${x.erro}`).join(" · "),
        });
      }
      await carregar();
    } catch (e) { aoAvisar({ tom: "erro", texto: e.message }); }
  }, [carregar, aoAvisar]);

  const numeros = useMemo(() => {
    if (!dados) return null;
    const contas = dados.contas;
    const foraDoLugar = contas.reduce(
      (n, c) => n + c.papeis.filter((p) => !p.real?.existe).length, 0);
    const temporarias = contas.reduce(
      (n, c) => n + c.papeis.filter((p) => p.real?.existe && p.real.temporaria).length, 0);
    const soltas = Object.values(dados.soltas || {}).reduce((n, l) => n + l.length, 0);
    return { pessoas: contas.length, foraDoLugar, temporarias, soltas };
  }, [dados]);

  const lista = useMemo(() => {
    if (!dados) return [];
    const q = busca.trim().toLowerCase();
    return dados.contas.filter((c) => {
      if (q && !`${c.usuario} ${c.nome} ${c.colaborador} ${c.papeis.map((p) => p.login).join(" ")}`
        .toLowerCase().includes(q)) return false;
      if (recorte === "fora") return c.papeis.some((p) => !p.real?.existe);
      if (recorte === "temporaria") return c.papeis.some((p) => p.real?.existe && p.real.temporaria);
      return true;
    });
  }, [dados, busca, recorte]);

  if (erro) {
    return (
      <Card>
        <p className="flex items-start gap-2 text-sm text-bad-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {erro}
        </p>
      </Card>
    );
  }
  if (!dados) return null;

  const celulas = [
    { id: "todas", rotulo: "Pessoas e portas", valor: numeros.pessoas,
      sub: "contas nesta tela", curto: "no total" },
    { id: "fora", rotulo: "Fora do lugar", valor: numeros.foraDoLugar,
      cor: numeros.foraDoLugar ? "text-bad-700" : "text-slate-900",
      sub: "a tela promete e o sistema não tem", curto: "não existem lá" },
    { id: "soltas", rotulo: "Soltas nos sistemas", valor: numeros.soltas,
      cor: numeros.soltas ? "text-warn-700" : "text-slate-900",
      sub: "existem lá e não são de ninguém aqui", curto: "sem dono" },
    { id: "temporaria", rotulo: "Senha temporária", valor: numeros.temporarias,
      sub: "ainda não trocaram a senha que receberam", curto: "não trocaram" },
  ];

  return (
    <Card>
      <SectionTitle
        titulo={`Quem entra nos ${dados.sistemas.length} sistemas`}
        sub="Uma linha por pessoa. O que muda de um sistema para outro é o papel — e o login, que nem sempre é o mesmo."
      />

      {/* AS ABAS VEM PRIMEIRO. Elas estavam la embaixo, depois do aviso, da faixa
          de numeros e do alerta vermelho -- seis blocos de texto antes. O dono
          rolou tudo, caiu na lista de pessoas e concluiu, com razao, que a aba
          de sistemas nao tinha sido feita. Escolha que a pessoa nao encontra e
          escolha que nao existe. */}
      <div className="mb-4 flex gap-1 border-b" style={{ borderColor: "var(--hairline)" }}>
        {[
          ["sistema", "Sistemas", dados.sistemas.length],
          ["pessoa", "Pessoas", dados.contas.length],
        ].map(([id, rot, n]) => (
          <button
            key={id}
            type="button"
            onClick={() => trocarLente(id)}
            aria-pressed={lente === id}
            className={`-mb-px border-b-2 px-4 py-2.5 font-display text-sm font-semibold transition-colors ${
              lente === id
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-900"
            }`}
          >
            {rot} <span className="tnum font-normal text-slate-400">{n}</span>
          </button>
        ))}
      </div>

      <p className="mb-4 flex items-start gap-2 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn-700">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        <span>
          <b className="font-display">Vale na hora.</b> Cadastrar, mudar papel, desativar e tirar
          acesso mexem no sistema de verdade — não é ensaio. Duas ressalvas: quem já está com a
          sessão aberta continua até o crachá vencer (30 dias no campo, 12 horas no painel); e
          <b> desativar não alcança o RH</b> — lá o acesso se tira removendo o sistema da pessoa.
        </span>
      </p>

      <div className="mb-4">
        <FaixaNumeros
          celulas={celulas}
          ativo={lente === "pessoa" ? recorte : null}
          aoEscolher={(id) => {
            if (id === "soltas") { trocarLente("sistema"); return; }
            trocarLente("pessoa");
            setRecorte((a) => (a === id ? "todas" : id));
          }}
        />
      </div>

      {numeros.foraDoLugar > 0 && recorte !== "fora" && (
        <p className="mb-4 flex items-start gap-2 rounded-lg bg-bad-50 px-3 py-2 text-sm text-bad-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            <b className="font-display">{numeros.foraDoLugar} acessos existem só nesta tela.</b>{" "}
            A pessoa aparece com o sistema marcado, mas não há conta com aquele login lá —
            então gerar senha para ela não alcança aquele sistema.{" "}
            <button type="button" className="underline" onClick={() => { trocarLente("pessoa"); setRecorte("fora"); }}>
              ver quem
            </button>
          </span>
        </p>
      )}

      <SenhaNova senha={senhaNova?.senha} nome={senhaNova?.nome}
        aoFechar={() => setSenhaNova(null)} />

      <datalist id="rh-colaboradores">
        {dados.colaboradores.map((n) => <option key={n} value={n} />)}
      </datalist>

      {lente === "sistema" ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">
            Um sistema por linha. Clique para abrir e ver, nome por nome, quem entra ali —
            e com que login. <b>O que existe no sistema está aqui</b>: a lista sai do próprio
            sistema, inclusive as contas que ninguém desta tela reivindica.
          </p>
          {dados.sistemas.map((s) => (
            <SecaoSistema
              key={s}
              sistema={s}
              endereco={ENDERECO[s]}
              dados={contasDoSistema(s, dados.contas, dados.soltas, dados.elenco)}
              acoes={acoes}
              aberta={!!abertos[s]}
              aoAlternar={() => setAbertos((a) => ({ ...a, [s]: !a[s] }))}
            />
          ))}
        </div>
      ) : (
        <>
          {criando ? (
            <NovaPessoa sistemas={dados.sistemas} aoCriar={criar} aoCancelar={() => setCriando(false)} />
          ) : (
            <button type="button" className="btn-primary mb-3" onClick={() => setCriando(true)}>
              <UserPlus size={15} /> Cadastrar pessoa
            </button>
          )}

          <div className="sem-impressao relative mb-3 max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" value={busca} onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar pessoa, usuário, login ou nome no RH" />
          </div>

          {recorte !== "todas" && (
            <p className="mb-3 flex items-center gap-2 text-sm text-slate-500">
              <Check size={14} />
              Mostrando só quem tem {recorte === "fora" ? "acesso fora do lugar" : "senha temporária"}.
              <button type="button" className="underline" onClick={() => setRecorte("todas")}>ver todas</button>
            </p>
          )}

          {lista.length ? (
            <div className="space-y-2">
              {lista.map((c) => (
                <Conta key={c.usuario} c={c} sistemas={dados.sistemas} soltas={dados.soltas}
                  vendedores={dados.vendedores} acoes={acoes} aoMudar={carregar}
                  aoAvisar={aoAvisar} aoSenha={setSenhaNova} />
              ))}
            </div>
          ) : (
            <Empty>Ninguém com esse nome.</Empty>
          )}
        </>
      )}
    </Card>
  );
}
