// Acessos: trocar a propria senha e (para a direcao) definir quem entra e o que
// cada um ve. As acoes do servidor moram em supabase/functions/painel-auth.
// (Ate 08/2026 este comentario apontava para netlify/functions/auth.mjs, que ja
// tinha sido migrado e foi apagado.)

import { useCallback, useEffect, useState } from "react";
import { KeyRound, ShieldCheck, AlertTriangle, Check, Download, Upload } from "lucide-react";
import { chamarAuth, ehDirecao as souDirecao, getSessao } from "../lib/sessao.js";
import { baixarBackup, restaurarBackup, lerArquivoBackup, statusBackup, backupHubAgora } from "../services/backup.js";
import { Card, PageTitle, SectionTitle } from "../components/ui.jsx";
import { useApp } from "../config/store.jsx";
import AcessoUnico from "../components/AcessoUnico.jsx";
import { nomeCompletoSis } from "../lib/sistemas.js";


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


export default function Acessos() {
  const sessao = getSessao();
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
  // A direcao, ja logada, pode definir a senha sem lembrar a anterior. Quem tem
  // a sessao dela ja abre tudo no painel, entao a senha atual aqui protegeria
  // pouco -- e sem esta saida a unica alternativa e mexer no cofre do Supabase.
  const [semAtual, setSemAtual] = useState(false);

  async function trocarSenha(e) {
    e.preventDefault();
    setMsgSenha(null);
    if (nova.length < 6) return setMsgSenha({ tom: "erro", texto: "A nova senha precisa ter ao menos 6 caracteres." });
    if (nova !== repetir) return setMsgSenha({ tom: "erro", texto: "As duas senhas novas não são iguais." });
    setSalvandoSenha(true);
    try {
      await chamarAuth("trocarMinhaSenha", {
        senhaAtual: atual,
        novaSenha: nova,
        ...(semAtual && ehDirecao ? { semSenhaAtual: true } : {}),
      });
      setMsgSenha({ tom: "ok", texto: "Senha trocada. Use a nova da próxima vez que entrar." });
      setSemAtual(false);
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
  const { config, dados } = useApp();
  const [msgConta, setMsgConta] = useState(null);

  return (
    <div className="space-y-8">
      {/* O titulo acompanha o menu da lateral: para quem nao e direcao, a tela
          e so a troca da propria senha, e chamar isso de "Acessos" dava a
          entender que dava para liberar modulo por aqui. */}
      <PageTitle
        titulo={ehDirecao ? "Sistemas de Acessos" : "Minha senha"}
        descricao={
          ehDirecao
            ? "Os sistemas da casa, quem entra em cada um e por onde. E a sua senha."
            : "Troque a sua senha de entrada no painel."
        }
      />

      {/* A ORDEM MUDOU EM 16/08/2026. "Minha senha" vinha primeiro e ocupava a
          tela inteira -- no celular, uma rolagem inteira de formulario antes de
          qualquer coisa sobre acesso. Quem abre esta tela como direcao vem
          resolver acesso de OUTRA pessoa; trocar a propria senha e o caso raro.
          Para quem nao e direcao nada muda: la a propria senha e a tela toda. */}
      {!ehDirecao ? null : (
        <>
          {msgConta && <Aviso tom={msgConta.tom}>{msgConta.texto}</Aviso>}

          {/* UMA lista de gente, so.
              Havia duas nesta pagina: um formulario "Novo/Editar acesso" com
              usuario, nome e senha, e uma tabela "Quem tem acesso" -- as duas
              mandando so no Painel -- e logo abaixo esta, que manda nos SETE.
              Tres blocos pedindo as mesmas coisas, e nenhum deles dizendo qual
              valia. Os dois primeiros sairam: o que eles faziam (modulos do
              painel, senha, remover) agora esta dentro do cartao da pessoa. */}
          <AcessoUnico aoAvisar={setMsgConta} />
        </>
      )}

      {/* Minha senha -- todo mundo */}
      <Card>
        <SectionTitle
          titulo="Minha senha"
          sub={
            ehDirecao
              ? "Troque quando quiser, aqui mesmo. A senha que você definir aqui passa a valer no lugar da inicial -- e a definitiva não fica escrita em configuração nenhuma."
              : "Troque quando quiser. Precisa da senha atual para ninguém tomar sua conta."
          }
        />
        <form onSubmit={trocarSenha} className="grid max-w-md gap-4">
          {semAtual && ehDirecao ? (
            <Aviso tom="aviso">
              Definindo a senha sem a anterior. Isso só vale porque você já esta
              logado como direção.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => setSemAtual(false)}
              >
                lembrei, quero digitar
              </button>
            </Aviso>
          ) : (
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
              {ehDirecao && (
                <button
                  type="button"
                  className="mt-1 text-xs text-slate-500 underline hover:text-slate-900"
                  onClick={() => {
                    setSemAtual(true);
                    setAtual("");
                  }}
                >
                  não lembro minha senha atual
                </button>
              )}
            </div>
          )}
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
      </Card>

      {!ehDirecao ? null : <BackupDados />}
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

function UltimoBackup({ status }) {
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
  /* O DISPARO DIÁRIO É CEGO: quem chama não lê a resposta, então uma noite
     inteira pode passar sem gravar nada e nada muda de cor. Aqui a própria data
     denuncia: passou de 36h, o aviso aparece. É o único lugar onde a direção
     olharia. */
  const maisVelho = Math.max(...linhas.map(([, sx]) => horasDesde(sx.em)));
  const atrasado = maisVelho > 36;
  return (
    <div className="space-y-2">
      {atrasado && (
        <p className="flex items-start gap-2 rounded-lg bg-bad-50 px-3 py-2 text-sm text-bad-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            <b className="font-display">Backup atrasado.</b> O mais velho tem{" "}
            {Number.isFinite(maisVelho) ? `${Math.round(maisVelho)} horas` : "data desconhecida"} —
            o normal é rodar todo dia. Clique em “Rodar backup do hub agora” e veja se ele reclama.
          </span>
        </p>
      )}
      <p className="text-sm text-slate-500">
        Salvo no repositório privado <strong>backups-impresilk</strong> no GitHub — um arquivo por
        dia, por sistema (versionado). {status?.atualizadoEm && `Última rodada: ${quandoBR(status.atualizadoEm)}.`}
      </p>
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--hairline)" }}>
        <table className="w-full min-w-[440px] border-collapse text-sm">
          <tbody>
            {linhas.map(([k, s]) => (
              <tr key={k} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                <td className="px-3 py-2 font-display font-medium text-slate-800">
                  {nomeCompletoSis(k) || s.nome || k}
                </td>
                <td className="px-3 py-2 text-slate-500">{quandoBR(s.em) || "—"}</td>
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
function BackupDados() {
  const [baixando, setBaixando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState(null);
  const [pendente, setPendente] = useState(null); // backup lido, aguardando confirmacao

  const lerStatus = () => statusBackup().then(setStatus).catch(() => {});
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

  async function rodarBackup() {
    setEnviando(true);
    setMsg(null);
    try {
      const r = await backupHubAgora();
      const sis = r.sistemas || {};
      const falharam = Object.entries(sis).filter(([, v]) => v.ok === false);
      if (falharam.length === 0) {
        setMsg({ tom: "ok", texto: `Backup do hub inteiro feito: ${Object.keys(sis).length} sistemas.` });
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
          `Restaurado: ${r.gravou} registros e ${r.contas} contas. Recarregue a pagina para ver.` +
          (voltaram.length
            ? ` ATENCAO: ${voltaram.join(", ")} ${voltaram.length === 1 ? "voltou" : "voltaram"} do arquivo com a senha antiga. Se nao deve mais entrar, remova a conta aqui embaixo.`
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
        sub="Um retrato dos dados do painel: regras, marcações, documentos e usuários. Não inclui os números do Mubisys, que se reconstroem sozinhos."
      />

      <div className="mb-4">
        <UltimoBackup status={status} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={baixar} disabled={baixando}>
          <Download size={16} strokeWidth={2.4} />
          {baixando ? "Preparando..." : "Baixar backup agora"}
        </button>

        <button className="btn-outline" onClick={rodarBackup} disabled={enviando}>
          <Upload size={16} strokeWidth={2.4} />
          {enviando ? "Rodando..." : "Rodar backup do hub agora"}
        </button>

        <label className="btn-outline cursor-pointer">
          <Upload size={16} strokeWidth={2.4} />
          Restaurar de um arquivo
          <input type="file" accept="application/json,.json" className="hidden" onChange={escolher} />
        </label>
      </div>

      {pendente && (
        <div className="mt-4 rounded-xl border border-warn-200 bg-warn-50 p-4">
          <p className="flex items-start gap-2 text-sm font-medium text-warn-700">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            Restaurar vai gravar {pendente.nItens} coleções e {pendente.nContas} contas por cima
            do que existe hoje. O que já está lá e não está no backup continua.
            <span className="mt-1 block font-normal">
              <b>Cuidado com os acessos:</b> as contas voltam com a <b>senha e as permissões do dia
              do backup</b>. Quem trocou de senha depois volta para a antiga; quem você desligou ou
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
