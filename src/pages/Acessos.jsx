// Acessos: trocar a propria senha e (para a direcao) definir quem entra e o que
// cada um ve. As acoes do servidor moram em supabase/functions/painel-auth.
// (Ate 08/2026 este comentario apontava para netlify/functions/auth.mjs, que ja
// tinha sido migrado e foi apagado.)

import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import CentralResumo, {CentralNavegacao} from "../components/CentralResumo.jsx";
import { KeyRound, ShieldCheck, AlertTriangle, Check, Download, Upload } from "lucide-react";
import { chamarAuth, ehDirecao as souDirecao, getSessao } from "../lib/sessao.js";
import { baixarBackup, restaurarBackup, lerArquivoBackup, statusBackup, backupHubAgora } from "../services/backup.js";
import { Card, PageTitle, SectionTitle } from "../components/ui.jsx";
import AcessoUnico from "../components/AcessoUnico.jsx";
import { nomeCompletoSis, SISTEMAS } from "../lib/sistemas.js";


function Aviso({ tom, children }) {
  if (!children) return null;
  const cor =
    tom === "ok" ? "bg-ok-50 text-ok-700" : tom === "erro" ? "bg-bad-50 text-bad-700" : "bg-warn-50 text-warn-700";
  return (
    <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${cor}`}>
      {tom === "ok" ? (
        <Check size={15} className="mt-0.5 shrink-0" />
      ) : (
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      )}
      {children}
    </p>
  );
}


export default function Acessos({ minhaConta = false }) {
  const sessao = import.meta.env.MODE === "review" ? {usuario:"direcao.exemplo",nome:"Conta de demonstração",master:true,permissoes:["*"]} : getSessao();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const geral = !minhaConta && params.get("visao") !== "sistemas";
  const sistemaEscolhido = params.get("sistema") || "";
  // Master OU acesso total -- a mesma regra que o servidor aplica em
  // painel-acesso. Ver ehDirecao em lib/sessao.js: escrever isso a mao aqui era
  // o que fazia quem tinha "*" ler a promessa e nao achar a tela.
  const ehDirecao = souDirecao(sessao);

  // A conta da direcao nao mora na lista de acessos: ela e a dona do painel e
  // enxerga tudo. Digitar o proprio usuario no cadastro e um caminho sem saida
  // -- entao a tela desvia para "Minha senha", que e onde essa conta se troca.

  // --- trocar a propria senha
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [repetir, setRepetir] = useState("");
  const [msgSenha, setMsgSenha] = useState(null); // {tom, texto}
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  async function trocarSenha(e) {
    e.preventDefault();
    if (import.meta.env.MODE === "review") return setMsgSenha({tom:"aviso",texto:"Prévia local: nenhuma senha foi enviada ou alterada."});
    setMsgSenha(null);
    if (nova.length < 6) return setMsgSenha({ tom: "erro", texto: "A nova senha precisa ter ao menos 6 caracteres." });
    if (nova !== repetir) return setMsgSenha({ tom: "erro", texto: "As duas senhas novas não são iguais." });
    setSalvandoSenha(true);
    try {
      await chamarAuth("trocarMinhaSenha", {
        senhaAtual: atual,
        novaSenha: nova,
      });
      setMsgSenha({ tom: "ok", texto: "Senha trocada. Use a nova da próxima vez que entrar." });
      setAtual("");
      setNova("");
      setRepetir("");
    } catch (err) {
      setMsgSenha({ tom: "erro", texto: err.message });
    } finally {
      setSalvandoSenha(false);
    }
  }

  // A direcao precisa do config/dados so para a lista de vendedores do cartao
  // de cada pessoa (dentro de AcessoUnico) e para o backup.
  const [msgConta, setMsgConta] = useState(null);

  return (
    <div className="space-y-8">
      {/* O titulo acompanha o menu da lateral: para quem nao e direcao, a tela
          e so a troca da propria senha, e chamar isso de "Acessos" dava a
          entender que dava para liberar modulo por aqui. */}
      <PageTitle
        titulo={ehDirecao && !minhaConta ? "Sistemas e configurações" : "Minha conta"}
        descricao={
          ehDirecao && !minhaConta
            ? "Gerencie quem entra e o que cada pessoa pode fazer."
            : "Troque a sua senha de entrada no painel."
        }
      />

      {<CentralNavegacao ativa={!ehDirecao || minhaConta ? "conta" : geral ? "geral" : "sistemas"}/>}
      {ehDirecao && geral && <CentralResumo/>}

      {/* A ORDEM MUDOU EM 16/08/2026. "Minha senha" vinha primeiro e ocupava a
          tela inteira -- no celular, uma rolagem inteira de formulario antes de
          qualquer coisa sobre acesso. Quem abre esta tela como direcao vem
          resolver acesso de OUTRA pessoa; trocar a propria senha e o caso raro.
          Para quem nao e direcao nada muda: la a propria senha e a tela toda. */}
      {!ehDirecao || minhaConta || geral ? null : (
        <>
          {/* GRUDADO NO TOPO. A lista de gente é longa e o cartão da pessoa
              fica bem abaixo: quem marcava um módulo na Karen recebia o aviso
              aqui em cima, fora do campo de visão, e o clique parecia não ter
              feito nada. Foi assim que a direção passou dois dias achando que
              a marcação de Permutas simplesmente "não pegava" — o servidor
              estava recusando e dizendo, e ninguém via. */}
          {msgConta && (
            <div className="sticky top-2 z-30" role="status" aria-live="polite">
              <Aviso tom={msgConta.tom}>{msgConta.texto}</Aviso>
            </div>
          )}

          {/* UMA lista de gente, so.
              Havia duas nesta pagina: um formulario "Novo/Editar acesso" com
              usuario, nome e senha, e uma tabela "Quem tem acesso" -- as duas
              mandando so no Painel -- e logo abaixo esta, que manda nos SETE.
              Tres blocos pedindo as mesmas coisas, e nenhum deles dizendo qual
              valia. Os dois primeiros sairam: o que eles faziam (modulos do
              painel, senha, remover) agora esta dentro do cartao da pessoa. */}
          <AcessoUnico key={sistemaEscolhido} sistemaInicial={sistemaEscolhido} aoAvisar={setMsgConta} />
        </>
      )}

      {(minhaConta || !ehDirecao) && <Card>
        <SectionTitle
          titulo="Minha senha"
          sub={
            ehDirecao
              ? "Atualize a senha usada para entrar no Painel."
              : "Confirme sua senha atual e escolha uma nova senha."
          }
        />
        {import.meta.env.MODE === "review" && <p className="mb-4 text-sm text-slate-500">Demonstração do formulário. Não informe sua senha real.</p>}
        <form onSubmit={trocarSenha} className="grid max-w-md gap-4">
          <div>
              <label className="label" htmlFor="s-atual">
                Senha atual
              </label>
              <input
                id="s-atual"
                type="password"
                className="input"
                value={atual}
                onChange={(e) => setAtual(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
          <div>
            <label className="label" htmlFor="s-nova">
              Nova senha
            </label>
            <input
              id="s-nova"
              type="password"
              className="input"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              autoComplete="new-password"
              placeholder="ao menos 6 caracteres"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="s-rep">
              Repita a nova senha
            </label>
            <input
              id="s-rep"
              type="password"
              className="input"
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          {msgSenha && <Aviso tom={msgSenha.tom}>{msgSenha.texto}</Aviso>}
          <button className="btn-primary w-fit" disabled={salvandoSenha}>
            <KeyRound size={16} strokeWidth={2.4} />
            {salvandoSenha ? "Salvando..." : "Trocar minha senha"}
          </button>
        </form>
      </Card>}
    </div>
  );
}

/* AQUI HAVIA UMA LISTA DE NOMES escrita a mao, parada em CINCO sistemas. Os
   sete entram no backup, entao Compras e POPs apareciam nesta tabela como
   "compras" e "pops", em minusculo, ao lado de "Painel de Gestao" -- e quem
   olhasse pensaria em erro do backup, nao em nome faltando. Agora vem do
   registro: sistema novo entra na tabela com nome de gente no primeiro dia. */

function quandoBR(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

// Ultimo backup de CADA sistema, e onde esta salvo.
// Quantas horas desde o ultimo backup gravado.
function horasDesde(iso) {
  const t = Date.parse(iso || "");
  return Number.isFinite(t) ? (Date.now() - t) / 36e5 : Infinity;
}

function UltimoBackup({ status, aoRepetir, enviando }) {
  const sistemas = status?.sistemas || (status?.em ? { painel: status } : null);
  if (!sistemas) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-warn-50 px-3 py-2 text-sm text-warn-700">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
        Nenhum backup feito ainda. Rode o backup ou baixe uma copia agora.
      </p>
    );
  }
  const linhas = Object.entries(sistemas);
  /* QUEM ESTÁ NO ELENCO E NÃO APARECEU NA ÚLTIMA RODADA. O registry do backup
     (SISTEMAS_BACKUP, um secret) é invisível daqui -- e foi assim que sistema
     novo ficou meses sem backup sem ninguém ver. O elenco da tela é o
     src/lib/sistemas.js; quem está lá, não é só-leitura (central/dre,
     aposentados, não têm o que copiar) e não veio na rodada vira linha
     vermelha em vez de silêncio. */
  const noStatus = new Set(Object.keys(sistemas));
  const semBackup = SISTEMAS.filter((sx) => !sx.soLeitura && !noStatus.has(sx.id));
  /* O DISPARO DIÁRIO É CEGO: quem chama não lê a resposta, então uma noite
     inteira pode passar sem gravar nada e nada muda de cor. Aqui a própria data
     denuncia: passou de 36h, o aviso aparece. É o único lugar onde a direção
     olharia. */
  const maisVelho = Math.max(...linhas.map(([, sx]) => horasDesde(sx.ok?sx.em:sx.ultimoValido)));
  const atrasado = maisVelho > 36;
  return (
    <div className="space-y-2">
      {atrasado && (
        <p className="flex items-start gap-2 rounded-lg bg-bad-50 px-3 py-2 text-sm text-bad-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            <b className="font-display">Backup atrasado.</b> O mais velho tem{" "}
            {Number.isFinite(maisVelho) ? `${Math.round(maisVelho)} horas` : "data desconhecida"} —
            o normal é rodar todo dia. Consulte a situação de cada sistema e execute uma nova cópia se necessário.
          </span>
        </p>
      )}
      <p className="text-sm text-slate-500">
        Salvo no repositório privado <strong>backups-impresilk</strong> no GitHub — um arquivo por
        dia, por sistema (versionado). {status?.atualizadoEm && `Última rodada: ${quandoBR(status.atualizadoEm)}.`}
      </p>
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--hairline)" }}>
        <table className="w-full min-w-[440px] border-collapse text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th scope="col" className="px-3 py-3">Sistema</th><th scope="col" className="px-3 py-3">Última cópia</th><th scope="col" className="px-3 py-3">Situação e conteúdo</th></tr></thead>
          <tbody>
            {semBackup.map((sx) => (
              <tr key={`sem-${sx.id}`} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                <td className="px-3 py-2 font-display font-medium text-slate-800">
                  {sx.nomeCompleto || sx.nome}
                </td>
                <td className="px-3 py-2 text-slate-500">—</td>
                <td className="px-3 py-2">
                  <span className="chip-bad">não retornou na última consulta</span>
                </td>
              </tr>
            ))}
            {linhas.map(([k, s]) => (
              <tr key={k} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                <td className="px-3 py-2 font-display font-medium text-slate-800">
                  {nomeCompletoSis(k) || s.nome || k}
                </td>
                <td className="px-3 py-2 text-slate-500">{quandoBR(s.ok?s.em:s.ultimoValido) || "Sem cópia confirmada"}</td>
                <td className="px-3 py-2">
                  {s.ok === false ? (
                    <span className="chip-bad" title={s.erro || ""}>
                      falhou
                    </span>
                  ) : (
                    <span className="chip-ok">
                      ok{typeof s.registros === "number" ? ` · ${s.registros} reg.` : ""}
                    </span>
                  )}
                  {s.ok===false && <div className="mt-2"><p className="text-xs text-bad-700">{s.erro}</p>{status.capacidades?.individual && <button type="button" className="btn-outline mt-2" disabled={enviando} onClick={()=>aoRepetir(k)}>Refazer este sistema</button>}</div>}
                  {typeof s.arquivos==='number' && <p className="text-xs text-slate-500 mt-2">{s.arquivos} arquivos com cópia dos bytes e conferência.</p>}
                  {/* COLEÇÃO QUE O BACKUP NÃO COPIOU. Só aparece quando existe,
                      e é a diferença entre "está tudo salvo" e "está salvo o que
                      alguém lembrou de listar". Já aconteceu duas vezes: as
                      assinaturas ficaram um dia fora, as permutas ficaram meses
                      — e nada na tela dizia. */}
                  {Array.isArray(s.colecoesForaDoBackup) && s.colecoesForaDoBackup.length > 0 && (
                    <span
                      className="ml-1.5 chip-bad"
                      title={`Existe no banco e NÃO está sendo copiado: ${s.colecoesForaDoBackup.join(", ")}`}
                    >
                      {s.colecoesForaDoBackup.length} fora do backup
                    </span>
                  )}
                  {/* O QUE TEM DENTRO. "323 reg." exige acreditar; a lista
                      mostra. Nasceu de um pedido direto — as permutas já
                      estavam salvas e a tela não tinha como provar. */}
                  {s.porColecao && Object.keys(s.porColecao).length > 0 && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px] text-slate-400 hover:text-slate-600">
                        ver o que foi salvo
                      </summary>
                      <ul className="mt-1 grid gap-x-4 gap-y-0.5 text-[11px] text-slate-500 sm:grid-cols-2">
                        {Object.entries(s.porColecao).map(([nome, n]) => (
                          <li key={nome} className="flex justify-between gap-2">
                            <span>{nome}</span>
                            <span className="tabular-nums">{n}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {status?.email && (
        <p className="text-sm text-slate-500">
          Segunda copia por e-mail (via n8n):{" "}
          {status.email.ok ? (
            <span className="chip-ok">
              enviado{typeof status.email.enviados === "number" ? ` · ${status.email.enviados} arq.` : ""}
              {status.email.em ? ` · ${quandoBR(status.email.em)}` : ""}
            </span>
          ) : (
            <span className="chip-bad" title={status.email.erro || ""}>
              não enviado
            </span>
          )}
        </p>
      )}
    </div>
  );
}

// Backup dos dados do painel: baixar agora, restaurar de um arquivo.
export function BackupDados() {
  const [baixando, setBaixando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [progresso,setProgresso] = useState(null);
  const [status, setStatus] = useState(null);
  const [erroStatus,setErroStatus] = useState(null);
  const [msg, setMsg] = useState(null);
  const [pendente, setPendente] = useState(null); // backup lido, aguardando confirmacao

  const lerStatus = () => statusBackup().then(s=>{setStatus(s);setErroStatus(null);}).catch(e=>setErroStatus(e.message));
  useEffect(() => {
    lerStatus();
  }, []);

  async function baixar() {
    setBaixando(true);
    setMsg(null);
    try {
      const { nome, tamanho } = await baixarBackup();
      setMsg({ tom: "ok", texto: `Backup baixado: ${nome} (${Math.round(tamanho / 1024)} KB). Guarde num lugar seguro.` });
      lerStatus();
    } catch (e) {
      setMsg({ tom: "erro", texto: e.message });
    } finally {
      setBaixando(false);
    }
  }

  async function rodarBackup(sistema) {
    setEnviando(true);
    setMsg(null);
    try {
      const r = await backupHubAgora(typeof sistema==='string'?sistema:undefined,setProgresso);
      const sis = r.sistemas || {};
      const falharam = Object.entries(sis).filter(([, v]) => v.ok === false);
      if (falharam.length === 0) {
        setMsg({ tom: "ok", texto: `Backup dos sistemas concluído: ${Object.keys(sis).length} sistemas.` });
      } else {
        setMsg({
          tom: "erro",
          texto: `Alguns falharam: ${falharam.map(([k, v]) => `${k} (${v.erro || "erro"})`).join(", ")}.`,
        });
      }
      lerStatus();
    } catch (e) {
      setMsg({ tom: "erro", texto: e.message });
    } finally {
      setEnviando(false);
      setProgresso(null);
    }
  }

  async function escolher(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg(null);
    try {
      const bk = await lerArquivoBackup(file);
      if (bk.sistema !== "painel") throw new Error("Este arquivo nao e um backup do painel.");
      const nItens = Object.keys(bk.painel || {}).length;
      const nContas = Object.keys(bk.contas || {}).length;
      setPendente({ bk, nItens, nContas });
    } catch (err) {
      setMsg({ tom: "erro", texto: err.message });
    }
  }

  async function confirmarRestauro() {
    setRestaurando(true);
    setMsg(null);
    try {
      const r = await restaurarBackup(pendente.bk, false);
      // Contas que NAO existiam mais e voltaram do arquivo. Um restauro traz
      // tudo de volta, inclusive quem foi desligado depois do backup -- com a
      // senha antiga funcionando. Isso tem de aparecer na cara, nao no log.
      const voltaram = Array.isArray(r.ressuscitadas) ? r.ressuscitadas : [];
      setMsg({
        tom: voltaram.length ? "aviso" : "ok",
        texto:
          `Recuperação conferida: ${r.gravou} registros, ${r.contas} contas e ${r.arquivos || 0} arquivos. Recarregue a página para ver.` +
          (voltaram.length
            ? ` ATENCAO: ${voltaram.join(", ")} ${voltaram.length === 1 ? "voltou" : "voltaram"} do arquivo. Confira suas permissões e remova quem não deve mais entrar.`
            : ""),
      });
      setPendente(null);
    } catch (e) {
      setMsg({ tom: "erro", texto: e.message });
    } finally {
      setRestaurando(false);
    }
  }

  return (
    <Card>
      <SectionTitle
        titulo="Backup dos dados"
        sub="Cópias dos dados do painel. Confira abaixo quais sistemas e arquivos têm uma cópia confirmada. Os números do Mubisys são atualizados pelo ERP."
      />

      <div className="mb-4">
        {erroStatus ? <p role="alert">{erroStatus} <button className="underline" onClick={lerStatus}>Tentar novamente</button></p> : status ? <UltimoBackup status={status} aoRepetir={rodarBackup} enviando={enviando}/> : <p role="status">Consultando backups…</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={baixar} disabled={baixando}>
          <Download size={16} strokeWidth={2.4} />
          {baixando ? "Preparando..." : "Baixar backup agora"}
        </button>

        <button className="btn-outline" onClick={rodarBackup} disabled={enviando}>
          <Upload size={16} strokeWidth={2.4} />
          {enviando ? progresso ? `Copiando ${progresso.numero} de ${progresso.total}…` : "Preparando..." : "Executar backup dos sistemas"}
        </button>

        {status?.capacidades?.restauroAtomico ? <label className="btn-outline cursor-pointer">
          <Upload size={16} strokeWidth={2.4} />
          Restaurar de um arquivo
          <input type="file" accept="application/json,.json" className="hidden" onChange={escolher} />
        </label> : <p role="status" className="text-sm text-slate-500">A recuperação segura ainda não está disponível. As cópias existentes continuam preservadas.</p>}
      </div>

      {pendente && (
        <div className="mt-4 rounded-xl border border-warn-200 bg-warn-50 p-4">
          <p className="flex items-start gap-2 text-sm font-medium text-warn-700">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            Restaurar vai gravar {pendente.nItens} coleções e {pendente.nContas} contas por cima
            do que existe hoje. O que já está lá e não está no backup continua.
            <span className="mt-1 block font-normal">{pendente.bk.versao<3 && "Este backup antigo não contém os arquivos de fotos e anexos. "}
              <b>Cuidado com os acessos:</b> as contas locais voltam com a <b>senha e as permissões do dia
              do backup</b>. Contas já migradas mantêm a senha da entrada única; quem você desligou ou
              rebaixou desde então <b>volta a entrar</b>. Confira a lista de acessos logo depois.
            </span>
          </p>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" onClick={confirmarRestauro} disabled={restaurando}>
              {restaurando ? "Restaurando..." : "Sim, restaurar"}
            </button>
            <button className="btn-ghost" onClick={() => setPendente(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p
          className={`mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
            msg.tom === "ok"
              ? "bg-ok-50 text-ok-700"
              : msg.tom === "aviso"
                ? "bg-warn-50 text-warn-700"
                : "bg-bad-50 text-bad-700"
          }`}
        >
          {msg.tom === "ok" ? <Check size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
          {msg.texto}
        </p>
      )}

      <p className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        Este arquivo contém o hash das senhas e as marcações financeiras -- guarde num lugar
        seguro e não compartilhe.
      </p>
    </Card>
  );
}
