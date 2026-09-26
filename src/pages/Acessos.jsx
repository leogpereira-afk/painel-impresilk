// Sistemas e configuracoes: a Visao geral, as abas Sistemas e Pessoas e a
// Minha conta. As acoes do servidor moram em supabase/functions/painel-acesso
// (acessos, so a direcao) e painel-auth (a propria senha, todo mundo).
// (Ate 08/2026 este comentario apontava para netlify/functions/auth.mjs, que ja
// tinha sido migrado e foi apagado.)
//
// Backups mora em pages/Backups.jsx e Configuracoes em pages/Configuracoes.jsx;
// as seis abas da area sao as mesmas nas tres paginas (components/AreaSistemas.jsx).

import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ehDirecao } from "../lib/sessao.js";
import CentralResumo from "../components/CentralResumo.jsx";
import AcessoUnico from "../components/AcessoUnico.jsx";
import MinhaConta from "../components/central/MinhaConta.jsx";
import { AvisoGrudado, CabecalhoDaArea, sessaoDaArea } from "../components/AreaSistemas.jsx";

/* Qual aba o endereco pede. `sistema=` e `recorte=soltas` sao da aba Sistemas;
   `pessoa=` e os recortes de gente sao da aba Pessoas. Sem nada: Visao geral.
   Parametro de endereco nao dispara carga do ERP (fontesDaRota olha so o
   caminho). */
function abaDoEndereco(params) {
  const visao = params.get("visao");
  const recorte = params.get("recorte") || "";
  if (visao === "pessoas" || params.get("pessoa") || ["fora", "temporaria", "porta"].includes(recorte)) return "pessoas";
  if (visao === "sistemas" || params.get("sistema") || recorte === "soltas") return "sistemas";
  return "geral";
}

export default function Acessos({ minhaConta = false }) {
  const sessao = sessaoDaArea();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  // QUEM ADMINISTRA ACESSO: a regra e a de lib/sessao.js (`ehDirecao`, so a
  // conta `master` desde 16/08/2026). Ate 26/09 este comentario dizia "Master
  // OU acesso total", que ja nao era verdade; escrever a regra a mao aqui era o
  // que fazia quem tinha "*" ler a promessa e nao achar a tela.
  const direcao = ehDirecao(sessao);
  // A resposta de toda acao da area (ver AvisoGrudado).
  const [aviso, setAviso] = useState(null);

  // Para quem nao e direcao, esta pagina e so a troca da propria senha.
  // A ORDEM MUDOU EM 16/08/2026: para a direcao, "Minha senha" vinha primeiro
  // e ocupava a tela inteira. Quem abre esta area como direcao vem resolver
  // acesso de OUTRA pessoa; trocar a propria senha e o caso raro, e mora na
  // propria aba.
  if (minhaConta || !direcao) return <MinhaConta sessao={sessao} />;

  const aba = abaDoEndereco(params);
  const sistema = params.get("sistema") || "";
  const recorte = params.get("recorte") || "";
  const pessoa = params.get("pessoa") || "";

  return (
    <div className="area-sistemas">
      <CabecalhoDaArea ativa={aba} sessao={sessao} />
      <AvisoGrudado aviso={aviso} aoFechar={() => setAviso(null)} />
      {aba === "geral" ? (
        <CentralResumo />
      ) : (
        /* UMA lista de gente, so. Havia duas nesta pagina (um formulario
           "Novo/Editar acesso" e uma tabela "Quem tem acesso", as duas mandando
           so no Painel) e logo abaixo esta, que manda nos SETE. Tres blocos
           pedindo as mesmas coisas, e nenhum deles dizendo qual valia.

           A `key` e o que o endereco pede de especifico (sistema, recorte,
           pessoa). Trocar entre as abas Sistemas e Pessoas pelo link NAO
           remonta nem recarrega: a lista ja lida e a mesma. */
        <AcessoUnico
          key={`${sistema}|${recorte}|${pessoa}`}
          lente={aba === "pessoas" ? "pessoa" : "sistema"}
          sistemaInicial={sistema}
          recorteInicial={recorte}
          pessoaInicial={pessoa}
          usuarioDaSessao={sessao?.usuario || ""}
          aoAvisar={setAviso}
        />
      )}
    </div>
  );
}
