// A VISAO GERAL da area: "esta tudo certo? onde eu mexo?".
//
// Ate 26/09/2026 a primeira dobra era propaganda: um bloco "Seu ponto de
// partida" com escudo, quatro quadros que nao clicavam ("9 sistemas na
// central" com o mesmo peso de "1 acesso para revisar") e nove cartoes iguais
// com "Gerenciar acessos" repetido nove vezes. Agora sao quatro numeros que
// decidem, cada um abrindo a lista que ele conta, e uma linha por sistema.
//
// O NUMERO E O TAMANHO DA LISTA QUE ELE ABRE: "Com pendencia" e "Senha
// provisoria" contam PESSOAS, que e o que o recorte da aba Pessoas lista. O
// numero de acessos vai embaixo, menor.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, ExternalLink, RefreshCw } from "lucide-react";
import { lerAcessos } from "../services/acesso.js";
import { statusBackup } from "../services/backup.js";
import { contarAcessos } from "../lib/acesso-state.mjs";
import { contasDoSistema, seloDoSistema, contagemDoSistema, ehExterna } from "../lib/acesso-sistema.mjs";
import { situacaoDoBackup } from "../lib/backup-situacao.mjs";
import { SISTEMAS, doSistema, nomeCompletoSis } from "../lib/sistemas.js";
import { AvisoAtualizacao, ErroModulo, SectionTitle, Skeleton } from "./ui.jsx";
import { FaixaNumeros, Selo } from "./lista.jsx";
import { Aviso, IconeDoSistema } from "./AreaSistemas.jsx";

const ORDEM = new Map(SISTEMAS.map((s, i) => [s.id, i]));
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const COR_DO_TOM = { ok: "text-ok-700", bad: "text-bad-700", warn: "text-warn-700", neutral: "text-slate-900" };

function SeloComMais({ selo }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Selo tom={selo.tom}>{selo.texto}</Selo>
      {selo.mais > 0 && (
        <span className="text-xs text-slate-500" aria-label={`e mais ${selo.mais} ${selo.mais === 1 ? "aviso" : "avisos"}`}>+{selo.mais}</span>
      )}
    </span>
  );
}

export default function CentralResumo() {
  const navegar = useNavigate();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [verificadoEm, setVerificadoEm] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [backup, setBackup] = useState(null);
  const [erroBackup, setErroBackup] = useState("");
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    // `ativo`: resposta que chega depois de sair da tela (ou depois de uma
    // leitura mais nova) nao pinta nada.
    let ativo = true;
    setCarregando(true);
    lerAcessos()
      .then((d) => { if (ativo) { setDados(d); setErro(null); setVerificadoEm(new Date()); } })
      .catch((e) => { if (ativo) setErro(e.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    // O backup tem leitura propria: se ele falhar, so a celula dele diz, e o
    // resto da tela segue.
    statusBackup()
      .then((s) => { if (ativo) { setBackup(s); setErroBackup(""); } })
      .catch((e) => { if (ativo) setErroBackup(e.message || "falhou"); });
    return () => { ativo = false; };
  }, [tentativa]);

  const atualizar = () => setTentativa((n) => n + 1);

  if (!dados && erro) return <ErroModulo mensagem={erro} aoTentar={atualizar} />;
  if (!dados) {
    return (
      <div className="area-bloco" role="status" aria-label="Carregando a visão geral">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <div className="area-linhas-sistemas">
          {Array.from({ length: 9 }, (_, i) => <Skeleton key={i} className="h-16" />)}
        </div>
      </div>
    );
  }

  const numeros = contarAcessos(dados);
  const bk = backup ? situacaoDoBackup(backup, SISTEMAS) : null;
  const celulas = [
    {
      id: "fora", rotulo: "Com pendência", valor: numeros.pessoasFora,
      cor: numeros.pessoasFora ? "text-bad-700" : "text-slate-900",
      sub: numeros.foraDoLugar ? `${plural(numeros.foraDoLugar, "acesso", "acessos")} para resolver` : "nada a resolver",
      curto: numeros.foraDoLugar ? "resolver agora" : "nada a resolver",
      para: "/acessos?visao=pessoas&recorte=fora",
    },
    {
      id: "temporaria", rotulo: "Senha provisória", valor: numeros.pessoasTemporarias,
      cor: numeros.pessoasTemporarias ? "text-warn-700" : "text-slate-900",
      sub: numeros.pessoasTemporarias ? "ainda não trocaram" : "ninguém com senha provisória",
      curto: numeros.pessoasTemporarias ? "não trocaram" : "ninguém",
      para: "/acessos?visao=pessoas&recorte=temporaria",
    },
    {
      id: "porta", rotulo: "Falhas de entrada", valor: numeros.naPorta,
      cor: numeros.naPorta ? "text-warn-700" : "text-slate-900",
      sub: "últimos 30 dias", curto: "30 dias",
      para: "/acessos?visao=pessoas&recorte=porta",
    },
    erroBackup ? {
      id: "backup", rotulo: "Backup", valor: "Sem leitura", cor: "text-slate-900",
      sub: "não consegui ler o backup", curto: "sem leitura", para: "/backups",
    } : bk ? {
      id: "backup", rotulo: "Backup", valor: bk.palavra, cor: COR_DO_TOM[bk.tom] || "text-slate-900",
      sub: bk.sub, curto: bk.curto, para: "/backups",
    } : {
      id: "backup", rotulo: "Backup", valor: "…", cor: "text-slate-400", sub: "lendo as cópias", curto: "lendo", para: "/backups",
    },
  ];
  const pendencias = dados.pendencias || [];
  const sistemas = [...dados.sistemas].sort((a, b) => (ORDEM.get(a) ?? 999) - (ORDEM.get(b) ?? 999));
  const hora = verificadoEm?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="area-bloco">
      {erro && <AvisoAtualizacao erro={erro} aoTentar={atualizar} />}
      <FaixaNumeros
        celulas={celulas}
        ativo={null}
        aoEscolher={(id) => navegar(celulas.find((c) => c.id === id).para)}
      />

      {pendencias.length > 0 && (
        <Aviso tom="aviso" acao={(
          <Link to="/acessos?visao=pessoas" className="btn-ghost h-10">Ver na aba Pessoas</Link>
        )}>
          {plural(pendencias.length, "pendência", "pendências")} de vínculo com o RH.
        </Aviso>
      )}

      <section aria-labelledby="vg-sistemas">
        <SectionTitle
          titulo={<span id="vg-sistemas">Sistemas</span>}
          acao={(
            <div className="flex items-center gap-1 text-xs text-slate-600">
              <span role="status">{carregando ? "Atualizando…" : hora ? `Verificado às ${hora}` : ""}</span>
              <button type="button" onClick={atualizar} disabled={carregando} aria-label="Atualizar" title="Atualizar"
                className="grid h-10 w-10 place-items-center rounded-lg text-slate-600 hover:bg-slate-100">
                <RefreshCw size={16} aria-hidden="true" className={carregando ? "animate-spin" : ""} />
              </button>
            </div>
          )}
        />
        <ul className="area-linhas-sistemas">
          {sistemas.map((id) => {
            const reg = doSistema(id);
            const externa = ehExterna(id, dados.fontes?.[id]);
            const d = contasDoSistema(id, dados.contas, dados.soltas, dados.elenco);
            const selo = seloDoSistema(d, { externa });
            const nome = nomeCompletoSis(id);
            return (
              <li key={id} className="flex min-h-16 items-center rounded-xl border bg-white">
                <Link to={`/acessos?visao=sistemas&sistema=${id}`}
                  className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl py-2 pl-4 pr-2 hover:bg-slate-50">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                    <IconeDoSistema sistema={id} size={18} />
                  </span>
                  {/* No celular o selo desce para a segunda linha: ao lado do
                      nome ele cortava "Painel de Gestao" em "Painel ...". */}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{nome}</span>
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span>{contagemDoSistema(d, { externa })}</span>
                      <span className="area-so-estreito-720"><SeloComMais selo={selo} /></span>
                    </span>
                  </span>
                  <span className="area-esconde-estreito shrink-0"><SeloComMais selo={selo} /></span>
                  <ChevronRight size={16} aria-hidden="true" className="area-esconde-estreito shrink-0 text-slate-400" />
                </Link>
                {reg.url && (
                  <a href={reg.url} target="_blank" rel="noreferrer" aria-label={`Abrir o ${nome} em outra aba`}
                    title={`Abrir o ${nome} em outra aba`}
                    className="mr-2 grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">
                    <ExternalLink size={16} aria-hidden="true" />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
