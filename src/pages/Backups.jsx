// BACKUPS: as copias de seguranca de cada sistema, baixar uma copia do Painel
// e restaurar de um arquivo. Morava dentro de pages/Acessos.jsx (BackupDados);
// desde 26/09/2026 e desta pagina so.
//
// A acao principal e "Copiar todos os sistemas agora". Antes o botao primario
// era "Baixar backup agora", que so baixa o Painel para o computador, e a copia
// de todos os sistemas era secundaria, com o mesmo icone de "Restaurar".
//
// A situacao (em dia, falhou, atrasado) sai de lib/backup-situacao.mjs, a mesma
// que a celula "Backup" da Visao geral usa: as duas telas dizem a mesma coisa.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, ArchiveRestore, CheckCircle2, DatabaseBackup, Download, Loader2, ShieldCheck,
} from "lucide-react";
import { baixarBackup, restaurarBackup, lerArquivoBackup, statusBackup, backupHubAgora } from "../services/backup.js";
import { situacaoDoBackup, quandoCurto } from "../lib/backup-situacao.mjs";
import { SISTEMAS, nomeCompletoSis } from "../lib/sistemas.js";
import { Card, ErroModulo, SectionTitle, Skeleton } from "../components/ui.jsx";
import { LinhaLista, Selo } from "../components/lista.jsx";
import JanelaFormulario from "../components/JanelaFormulario.jsx";
import {
  Aviso, AvisoGrudado, CabecalhoDaArea, IconeDoSistema, SaibaMais, sessaoDaArea,
} from "../components/AreaSistemas.jsx";

const PREVIA = import.meta.env.MODE === "review";
const COR = { ok: "text-ok-700", bad: "text-bad-700", warn: "text-warn-700", neutral: "text-slate-900" };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* AQUI HAVIA UMA LISTA DE NOMES escrita a mao, parada em CINCO sistemas. Os
   sete entram no backup, entao Compras e POPs apareciam nesta tabela como
   "compras" e "pops", em minusculo, ao lado de "Painel de Gestao", e quem
   olhasse pensaria em erro do backup, nao em nome faltando. Agora vem do
   registro (nomeCompletoSis): sistema novo entra na lista com nome de gente no
   primeiro dia. */
function LinhaBackup({ l, capacidades, enviando, aoRefazer, agora }) {
  const [vendo, setVendo] = useState(false);
  const temConteudo = !!l.porColecao && Object.keys(l.porColecao).length > 0;
  const selo = l.estado === "semRodada"
    ? { tom: "bad", texto: "não voltou na rodada" }
    : l.estado === "copiando"
      ? { tom: "neutral", texto: `copiando · ${plural(l.partes || 0, "parte", "partes")}` }
      : l.estado === "falhou"
        ? { tom: "bad", texto: "falhou" }
        : { tom: "ok", texto: typeof l.registros === "number" ? `ok · ${l.registros} registros` : "ok" };
  const fora = Array.isArray(l.colecoesForaDoBackup) ? l.colecoesForaDoBackup : [];
  const refazer = capacidades?.individual && (l.estado === "falhou" || l.estado === "copiando");
  return (
    <LinhaLista tom={selo.tom === "bad" ? "bad" : "neutral"}>
      <div className="area-backup-linha">
        <span className="c-nome flex min-w-0 items-center gap-2">
          <IconeDoSistema sistema={l.id} className="shrink-0 text-slate-500" />
          <span className="min-w-0 text-sm font-semibold text-slate-900">{l.nome}</span>
        </span>
        <span className="c-quando text-sm text-slate-600">
          {l.quando ? `Última cópia ${quandoCurto(l.quando, agora)}` : "Sem cópia confirmada"}
        </span>
        <span className="c-selo"><Selo tom={selo.tom}>{selo.texto}</Selo></span>
        <span className="c-acao flex flex-wrap items-center justify-end gap-2">
          {/* O QUE TEM DENTRO. "323 registros" exige acreditar; a lista mostra.
              Nasceu de um pedido direto: as permutas já estavam salvas e a tela
              não tinha como provar. */}
          {temConteudo && (
            <button type="button" className="btn-ghost h-10 px-3" aria-expanded={vendo} onClick={() => setVendo((v) => !v)}>
              {vendo ? "Esconder" : "O que foi salvo"}
            </button>
          )}
          {refazer && (
            <button type="button" className="btn-outline h-10" disabled={enviando} onClick={() => aoRefazer(l.id)}>
              {l.estado === "copiando" ? "Continuar cópia" : "Refazer"}
            </button>
          )}
        </span>
      </div>
      {l.estado === "falhou" && l.erro && <p className="mt-1 text-sm text-bad-700">{l.erro}</p>}
      {/* COLEÇÃO QUE O BACKUP NÃO COPIOU. Só aparece quando existe, e é a
          diferença entre "está tudo salvo" e "está salvo o que alguém lembrou
          de listar". Já aconteceu duas vezes: as assinaturas ficaram um dia
          fora, as permutas ficaram meses, e nada na tela dizia. Agora aparece
          ESCRITO, e não só num balão ao passar o mouse. */}
      {fora.length > 0 && (
        <p className="mt-1 text-sm text-bad-700">
          {fora.length === 1 ? "1 coleção fora do backup" : `${fora.length} coleções fora do backup`}: {fora.join(", ")}
        </p>
      )}
      {typeof l.arquivos === "number" && (
        <p className="mt-1 text-xs text-slate-500">{plural(l.arquivos, "arquivo com cópia conferida", "arquivos com cópia conferida")}</p>
      )}
      {temConteudo && vendo && (
        <ul className="mt-2 grid gap-x-6 gap-y-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 sm:grid-cols-2">
          {Object.entries(l.porColecao).map(([nome, n]) => (
            <li key={nome} className="flex justify-between gap-2">
              <span>{nome}</span>
              <span className="tnum">{n}</span>
            </li>
          ))}
        </ul>
      )}
    </LinhaLista>
  );
}

export default function Backups() {
  const sessao = sessaoDaArea();
  const [baixando, setBaixando] = useState(false);
  const [restaurando, setRestaurando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [status, setStatus] = useState(null);
  const [erroStatus, setErroStatus] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [pendente, setPendente] = useState(null); // backup lido, aguardando confirmacao
  const agora = Date.now();

  const lerStatus = () => statusBackup()
    .then((s) => { setStatus(s); setErroStatus(null); })
    .catch((e) => setErroStatus(e.message));
  useEffect(() => { lerStatus(); }, []);

  async function baixar() {
    setBaixando(true);
    setAviso(null);
    try {
      const { nome, tamanho } = await baixarBackup();
      setAviso({ tom: "ok", texto: `Cópia baixada: ${nome} (${Math.round(tamanho / 1024)} KB). Guarde num lugar seguro.` });
      lerStatus();
    } catch (e) {
      setAviso({ tom: "erro", texto: e.message });
    } finally {
      setBaixando(false);
    }
  }

  async function rodarBackup(sistema) {
    setEnviando(true);
    setAviso(null);
    try {
      const r = await backupHubAgora(typeof sistema === "string" ? sistema : undefined, setProgresso);
      const sis = r.sistemas || {};
      const falharam = Object.entries(sis).filter(([, v]) => v.ok === false);
      if (falharam.length === 0) {
        setAviso({ tom: "ok", texto: `Cópia concluída: ${plural(Object.keys(sis).length, "sistema", "sistemas")}.` });
      } else {
        setAviso({
          tom: "erro",
          texto: `Alguns falharam: ${falharam.map(([k, v]) => `${nomeCompletoSis(k)} (${v.erro || "erro"})`).join(", ")}.`,
        });
      }
      lerStatus();
    } catch (e) {
      setAviso({ tom: "erro", texto: e.message });
    } finally {
      setEnviando(false);
      setProgresso(null);
    }
  }

  async function escolher(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAviso(null);
    try {
      const bk = await lerArquivoBackup(file);
      if (bk.sistema !== "painel") throw new Error("Este arquivo não é um backup do Painel.");
      const nItens = Object.keys(bk.painel || {}).length;
      const nContas = Object.keys(bk.contas || {}).length;
      setPendente({ bk, nItens, nContas });
    } catch (err) {
      setAviso({ tom: "erro", texto: err.message });
    }
  }

  async function confirmarRestauro() {
    setRestaurando(true);
    try {
      const r = await restaurarBackup(pendente.bk, false);
      // Contas que NAO existiam mais e voltaram do arquivo. Um restauro traz
      // tudo de volta, inclusive quem foi desligado depois do backup, com a
      // senha antiga funcionando. Isso tem de aparecer na cara, nao no log.
      const voltaram = Array.isArray(r.ressuscitadas) ? r.ressuscitadas : [];
      setAviso({
        tom: voltaram.length ? "aviso" : "ok",
        texto: (
          <>
            <p>Recuperação conferida: {r.gravou} registros, {r.contas} contas e {r.arquivos || 0} arquivos. Recarregue a página para ver.</p>
            {voltaram.length > 0 && (
              <p>
                Atenção: <b>{voltaram.join(", ")}</b> {voltaram.length === 1 ? "voltou" : "voltaram"} do arquivo.
                Confira as permissões e remova quem não deve mais entrar.
              </p>
            )}
          </>
        ),
        acao: voltaram.length ? <Link to="/acessos?visao=pessoas" className="btn-outline h-10">Abrir Pessoas</Link> : null,
      });
      setPendente(null);
    } catch (e) {
      setAviso({ tom: "erro", texto: e.message });
      setPendente(null);
    } finally {
      setRestaurando(false);
    }
  }

  const sit = status ? situacaoDoBackup(status, SISTEMAS, { agora, progresso: enviando ? progresso || { numero: 0, total: 0 } : null }) : null;
  const IconeSit = !sit ? null : sit.tom === "ok" ? CheckCircle2 : sit.tom === "neutral" ? Loader2 : AlertTriangle;
  const linhas = sit?.linhas || [];
  const daCasa = linhas.filter((l) => l.daCasa);
  const deFora = linhas.filter((l) => !l.daCasa);
  const textoBotao = enviando
    ? progresso ? `Copiando ${progresso.numero} de ${progresso.total}${progresso.parte ? ` · parte ${progresso.parte}` : ""}…` : "Preparando…"
    : "Copiar todos os sistemas agora";

  return (
    <div className="area-sistemas">
      <CabecalhoDaArea ativa="backup" sessao={sessao} />
      <AvisoGrudado aviso={aviso} aoFechar={() => setAviso(null)} />
      {PREVIA && <Aviso tom="info">Prévia: horários, quantidades e a falha abaixo são exemplos.</Aviso>}

      {erroStatus ? (
        <ErroModulo mensagem={erroStatus} aoTentar={lerStatus} />
      ) : !status ? (
        <div className="space-y-3" role="status" aria-label="Consultando as cópias">
          <Card><Skeleton className="h-10 w-48" /></Card>
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-4" aria-labelledby="bk-situacao">
            <div className="flex min-w-0 items-start gap-3">
              {IconeSit && (
                <IconeSit size={24} aria-hidden="true"
                  className={`mt-1 shrink-0 ${COR[sit.tom]} ${sit.tom === "neutral" ? "animate-spin" : ""}`} />
              )}
              <div className="min-w-0">
                <p className="label mb-0">Situação</p>
                <p id="bk-situacao" className={`kpi-value text-3xl ${COR[sit.tom]}`}>{sit.palavra}</p>
                <p className="mt-1 text-sm text-slate-600">{sit.sub}</p>
                {sit.segunda && <p className="text-sm text-slate-600">{sit.segunda}</p>}
              </div>
            </div>
            <button type="button" className="btn-primary area-cheio-estreito" onClick={() => rodarBackup()} disabled={enviando}>
              <DatabaseBackup size={16} aria-hidden="true" /> {textoBotao}
            </button>
          </Card>

          <Card className="px-0 py-2 sm:px-0 sm:py-2">
            <h2 className="px-4 pb-1 pt-2 text-lg font-semibold text-slate-900">Por sistema</h2>
            {linhas.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">Nenhuma cópia feita ainda.</p>
            ) : (
              <div>
                {daCasa.map((l) => (
                  <LinhaBackup key={l.id} l={l} capacidades={status.capacidades} enviando={enviando} aoRefazer={rodarBackup} agora={agora} />
                ))}
                {deFora.length > 0 && (
                  <>
                    <p className="label mb-0 border-t px-4 pb-1 pt-3">Fora da Impresilk</p>
                    {deFora.map((l) => (
                      <LinhaBackup key={l.id} l={l} capacidades={status.capacidades} enviando={enviando} aoRefazer={rodarBackup} agora={agora} />
                    ))}
                  </>
                )}
              </div>
            )}
            {status?.email && (
              <div className="border-t">
                <LinhaLista tom={status.email.ok ? "neutral" : "bad"}>
                  <div className="area-backup-linha">
                    <span className="c-nome text-sm font-semibold text-slate-900">Segunda cópia por e-mail</span>
                    <span className="c-quando text-sm text-slate-600">{status.email.em ? quandoCurto(status.email.em, agora) : "sem data"}</span>
                    <span className="c-selo">
                      {status.email.ok
                        ? <Selo tom="ok">enviada{typeof status.email.enviados === "number" ? ` · ${plural(status.email.enviados, "arquivo", "arquivos")}` : ""}</Selo>
                        : <Selo tom="bad">não enviada</Selo>}
                    </span>
                    <span className="c-acao" />
                  </div>
                  {!status.email.ok && status.email.erro && <p className="mt-1 text-sm text-bad-700">{status.email.erro}</p>}
                </LinhaLista>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Baixar funciona mesmo sem ler a situacao: este cartao fica sempre. */}
      <Card>
        <SectionTitle titulo="Cópia no computador e recuperação" />
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">Baixar uma cópia do Painel</p>
              <p className="text-sm text-slate-500">Um arquivo com os dados do Painel, para guardar fora da nuvem.</p>
            </div>
            <button type="button" className="btn-outline area-cheio-estreito" onClick={baixar} disabled={baixando}>
              <Download size={16} aria-hidden="true" /> {baixando ? "Preparando…" : "Baixar cópia do Painel"}
            </button>
          </div>
          <p className="flex items-start gap-2 text-xs text-slate-500">
            <ShieldCheck size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            O arquivo tem o hash das senhas e as marcações financeiras: guarde num lugar seguro e não compartilhe.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">Restaurar de um arquivo</p>
              <p className="text-sm text-slate-500">Grava por cima do Painel de hoje o conteúdo de um arquivo baixado antes.</p>
            </div>
            {status?.capacidades?.restauroAtomico ? (
              <label className="btn-outline area-cheio-estreito cursor-pointer">
                <ArchiveRestore size={16} aria-hidden="true" /> Restaurar de um arquivo
                <input type="file" accept="application/json,.json" className="sr-only" onChange={escolher} />
              </label>
            ) : (
              /* Sem a leitura da situacao nao se sabe se o restauro seguro existe,
                 entao o botao continua fora. Mas a frase diz o motivo certo:
                 "ainda nao esta disponivel" num erro de leitura mandava o dono
                 esperar por uma coisa que ja existe. */
              <p role="status" className="max-w-sm text-sm text-slate-600">
                {erroStatus
                  ? "Para restaurar, a tela precisa ler a situação das cópias. Use \"Tentar de novo\" acima."
                  : !status
                    ? "Conferindo se a recuperação segura está disponível…"
                    : "A recuperação segura ainda não está disponível. As cópias existentes continuam preservadas."}
              </p>
            )}
          </div>
        </div>
      </Card>

      <SaibaMais titulo="Onde as cópias ficam">
        <p>
          No repositório privado backups-impresilk, no GitHub: um arquivo por dia para cada sistema,
          com as versões anteriores guardadas.
          {status?.atualizadoEm ? ` Última rodada: ${quandoCurto(status.atualizadoEm, agora)}.` : ""}
        </p>
      </SaibaMais>

      {pendente && (
        <JanelaFormulario titulo="Restaurar o Painel a partir de um arquivo?" classe="janela-estreita"
          ocupado={restaurando} aoFechar={() => setPendente(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              Vai gravar {pendente.nItens} coleções e {pendente.nContas} contas por cima do que existe hoje.
              O que já está lá e não está no arquivo continua.
            </p>
            {pendente.bk.versao < 3 && (
              <p className="text-sm text-slate-700">Este arquivo é antigo e não traz as fotos e os anexos.</p>
            )}
            {/* O RESTAURO TRAZ DE VOLTA SENHA E PERMISSAO DO DIA DO BACKUP. Quem
                foi desligado ou rebaixado depois volta a entrar. Isto tem de ser
                dito ANTES de confirmar. */}
            <Aviso tom="aviso">
              <b>Cuidado com os acessos:</b> as contas locais voltam com a <b>senha e as permissões do dia
              do backup</b>. Contas já migradas mantêm a senha da entrada única; quem você desligou ou
              rebaixou desde então <b>volta a entrar</b>. Confira a lista de acessos logo depois.
            </Aviso>
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              <button type="button" className="btn-ghost" onClick={() => setPendente(null)} disabled={restaurando}>Cancelar</button>
              <button type="button" className="btn-danger" onClick={confirmarRestauro} disabled={restaurando}>
                {restaurando ? "Restaurando…" : "Sim, restaurar"}
              </button>
            </div>
          </div>
        </JanelaFormulario>
      )}
    </div>
  );
}
