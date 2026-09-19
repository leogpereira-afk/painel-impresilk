// ============================================================================
// painel-agenda — a agenda, SO PARA VER.
//
// Tres telas do Painel bebem daqui:
//   Calendario da producao  (acao "producao")  -> modulo "agenda"
//   Programacao             (acao "producao")  -> modulo "agenda"
//   Calendario da empresa   (acao "empresa")   -> modulo "calendario-empresa"
//
// ESTA PORTA NAO ESCREVE. Nao ha acao de gravar, nem de apagar, nem de
// carimbar "mensagem enviada". Isso e de proposito e e a coisa mais importante
// do arquivo: "modo visualizacao" que so esconde botao na tela nao e modo
// visualizacao nenhum -- o endereco da function continua ai, e quem abre o
// inspetor do navegador manda o que quiser. A regua estreita mora AQUI, na
// porta, e nao na tela.
//
// DE ONDE VEM O DADO (o banco e o mesmo dos tres sistemas, ref heveemylixartyijxewh):
//   producao -> public.pcp_registros, colecao='os'          (dono: PCP)
//               public.pcp_config_global, config.agendaPCP  (eventos, plantoes)
//   empresa  -> public.registros, colecao='eventos'         (dono: RH)
//               public.config_global, tiposEventoPersonalizados
//
// POR QUE UMA FUNCTION NOVA, e nao reaproveitar rh-programacao ou pcp-sync:
// as duas existentes pedem credencial de OUTRO sistema -- pcp-sync exige um
// cracha assinado com EQUIPE_JWT_SECRET e sis==="pcp"; rh-programacao exige
// sessao do Supabase Auth com perfil ADMIN_RH. O cracha do Painel e assinado
// com PAINEL_JWT_SECRET. Emitir cracha de outro sistema para o Painel seria
// furar a regra 1 do PADRAO-DOS-SISTEMAS (a porta confere o SISTEMA). O
// caminho limpo e este: porta propria, sob o segredo do proprio Painel.
//
// O QUE ESTA PORTA NUNCA DEVOLVE, e por que:
//   - VALOR da O.S. (valorTotal, itens[].subtotal, painel_ordens). Estas telas
//     existem para "outras pessoas verem a agenda"; quem precisa do dinheiro
//     da producao tem a tela do PCP. Modulo sem dinheiro fica fora do
//     COM_DINHEIRO de src/lib/modulos.js -- e continua fora enquanto for assim.
//   - CNPJ/CPF, WhatsApp e telefone do cliente.
//   - Ficha completa, idade, ano de nascimento, documentos, saúde e pagamentos.
// Autorização de 19/09/2026: exibir nome e dia do aniversário e tempo de empresa,
// derivados dos mesmos cadastros e status utilizados pelo calendário do RH.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verificarJwt, crachaRevogado } from "../_shared/cripto.ts";
import { diasCasa, encerradaERP, projetarOS, hojeSP } from "../_shared/agenda-pcp.ts";

import { celebracoesRH } from "../_shared/calendario-celebracoes.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json" } });

/* Porteiro: o MESMO de painel-dados, de proposito -- porteiro reescrito e
   porteiro que sai diferente. Fail-closed: sem PAINEL_JWT_SECRET no ambiente,
   recusa tudo em vez de liberar. */
async function exigirSessao(req: Request, modulo: string | string[]) {
  if (!JWT_SECRET) {
    console.error("painel-agenda: PAINEL_JWT_SECRET ausente -- recusando tudo (fail-closed)");
    return { resposta: json({ erro: "Login nao configurado no servidor." }, 503) };
  }
  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const s = m ? await verificarJwt(m[1], JWT_SECRET) : null;
  if (s && await crachaRevogado(sb, "painel", s)) {
    return { resposta: json({ erro: "Seu acesso foi encerrado.", semSessao: true }, 401) };
  }
  if (!s) return { resposta: json({ erro: "Entre no sistema.", semSessao: true }, 401) };
  const perms: string[] = s.perms || [];
  const aceitos = Array.isArray(modulo) ? modulo : [modulo];
  const pode = aceitos.length === 0 || s.master === true || perms.includes("*") ||
               aceitos.some((x) => perms.includes(x));
  if (!pode) return { resposta: json({ erro: "Voce nao tem acesso a este modulo." }, 403) };
  return { sessao: s };
}

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/* LER PAGINADO, SEMPRE. O PostgREST corta em 1000 linhas por pedido e nao
   avisa: um .select() simples devolveria um recorte e a tela mostraria um mes
   com metade das O.S., sem erro nenhum. O PCP tem ~2 mil O.S. e cresce.
   Teto de 100 paginas para uma consulta defeituosa nao virar laco infinito. */
async function lerColecao(tabela: string, colecao: string): Promise<any[]> {
  const saida: any[] = [];
  let ultimo = "";
  for (let pagina = 0; pagina < 100; pagina++) {
    const { data, error } = await sb.from(tabela)
      .select("id, registro")
      .eq("colecao", colecao)
      .eq("apagado", false)
      .gt("id", ultimo)
      .order("id", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    const lote = data ?? [];
    /* A CHAVE DA LINHA entra junto. O registro quase sempre traz o proprio
       `id`, mas o da tabela e o que existe com certeza -- e sem uma identidade
       estavel a tela fica sem chave de lista boa (o numero da O.S. nasce
       vazio). Preferimos a do registro para nao trocar a identidade de nada
       que ja circula; a da linha e a rede de seguranca. */
    for (const linha of lote as any[]) {
      const reg = linha.registro ?? {};
      saida.push({ ...reg, id: reg.id ?? linha.id });
    }
    if (lote.length < 500) return saida;
    ultimo = String((lote as any[])[lote.length - 1].id);
  }
  /* Estourar o teto e uma anomalia (50 mil registros numa colecao). Melhor
     falhar alto do que devolver um recorte silencioso como se fosse tudo --
     "zero nao e resultado", e meio tambem nao. */
  throw new Error(`Leitura de ${colecao} passou de 100 paginas; conferir a origem.`);
}

const texto = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

// ---------------------------------------------------------------- producao --
/* Os EVENTOS e os PLANTOES da producao nao tem tabela: moram dentro do blob
   de configuracao (pcp_config_global.config.agendaPCP). Nao e escolha minha --
   e como o PCP grava. Ler daqui e so ler a mesma chave. */
async function agendaDaProducao(mes: string) {
  const { data, error } = await sb.from("pcp_config_global").select("config").eq("id", true).maybeSingle();
  if (error) throw new Error(error.message);
  const ag = ((data?.config ?? {}) as any).agendaPCP ?? {};
  const eventos = (Array.isArray(ag.eventos) ? ag.eventos : [])
    .filter((e: any) => texto(e?.data, 10).startsWith(mes))
    .map((e: any) => ({ id: texto(e?.id, 60), titulo: texto(e?.titulo, 160), data: texto(e?.data, 10) }));
  /* `cancelado` nao apaga o plantao no PCP -- marca. Quem so ve nao tem por
     que enxergar o que foi cancelado. */
  const plantoes = (Array.isArray(ag.plantoes) ? ag.plantoes : [])
    .filter((p: any) => !p?.cancelado && texto(p?.data, 10).startsWith(mes))
    .map((p: any) => ({
      id: texto(p?.id, 60),
      data: texto(p?.data, 10),
      tipo: ["diarista", "sobreaviso", "folga"].includes(String(p?.tipo)) ? String(p.tipo) : "diarista",
      quem: texto(p?.quem, 80),
      titulo: texto(p?.titulo, 160),
      inicio: texto(p?.inicio, 5),
      fim: texto(p?.fim, 5),
      // `obs` e `osIds` ficam de fora: observacao e texto livre do PCP e a
      // lista de O.S. vinculadas nao programa nada (o proprio PCP avisa isso
      // no formulario). Quem so ve nao precisa de nenhum dos dois.
    }));
  return { eventos, plantoes };
}

async function producao(mes: string) {
  const todas = await lerColecao("pcp_registros", "os");
  /* A MESMA regua da tela do PCP (casa.js:osNoMesCasa): fora as encerradas
     pelo ERP, dentro as que tocam o mes por diasCasa. Se as duas divergirem,
     o calendario do Painel mostra um dia que o PCP nao mostra -- e quem olha
     os dois perde a confianca nos dois. */
  const doMes = todas.filter((o) => !encerradaERP(o) && diasCasa(o).some((d) => d.startsWith(mes)));
  const { eventos, plantoes } = await agendaDaProducao(mes);
  return {
    os: doMes.map(projetarOS),
    eventos,
    plantoes,
    hoje: hojeSP(),
    consultadoEm: new Date().toISOString(),
  };
}

// ----------------------------------------------------------------- empresa --
// Cores dos eventos registrados no RH.
const CORES_DE_FABRICA: Record<string, string> = {
  "Comemorativa": "#2563eb",
  "Reunião": "#16334f",
  "Feriado": "#dc2626",
  "Empresa": "#16a34a",
  "Outro": "#64748b",
};
const COR_PADRAO = "#64748b";

async function empresa(mes: string) {
  const [eventos,colaboradores,status] = await Promise.all([
    lerColecao("registros", "eventos"),
    lerColecao("registros", "colaboradores"),
    lerColecao("registros", "status"),
  ]);
  /* O `error` E CONFERIDO. Descartado, uma falha passageira devolveria 200 com
     todo tipo criado pela empresa em cinza -- e quem olhasse concluiria que a
     cor tinha se perdido no RH. Falhar alto e melhor do que mentir baixo. */
  const { data, error } = await sb.from("config_global").select("config").eq("id", true).maybeSingle();
  if (error) throw new Error(error.message);
  const personalizados = ((data?.config ?? {}) as any).tiposEventoPersonalizados;
  const cores: Record<string, string> = { ...CORES_DE_FABRICA };
  for (const t of Array.isArray(personalizados) ? personalizados : []) {
    const nome = texto((t as any)?.nome, 40);
    if (nome && !cores[nome]) cores[nome] = texto((t as any)?.cor, 9) || COR_PADRAO;
  }

  const ano = Number(mes.slice(0, 4));
  const numeroDoMes = Number(mes.slice(5, 7));
  /* RECORRENTE ANUAL bate so o MES (feriado fixo, data comemorativa, fundacao
     da empresa); os demais batem ano E mes. A regra e a de
     rh/src/pages/Calendario.tsx:159 -- e tem de continuar sendo. */
  const doMes = eventos.filter((e: any) => {
    const d = texto(e?.data, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    const m = Number(d.slice(5, 7));
    return e?.recorrenteAnual ? m === numeroDoMes : (Number(d.slice(0, 4)) === ano && m === numeroDoMes);
  });

  /* 29 DE FEVEREIRO. A recorrencia anual casa so pelo mes, entao um evento
     gravado em 2024-02-29 casa com fevereiro de TODO ano. Remontar a data como
     `${mes}-29` em 2027 produz "2027-02-29", que nao existe: a grade do mes vai
     ate 28 e o evento sumiria do calendario, enquanto a lista lateral o
     mostraria com o dia da semana quebrado. Prende-se ao ultimo dia do mes --
     o evento aparece em 28/02, que e onde a empresa o comemora. */
  const ultimoDia = new Date(Date.UTC(ano, numeroDoMes, 0)).getUTCDate();

  return {
    eventos: [...celebracoesRH(colaboradores,status,mes), ...doMes.map((e: any) => {
      const tipo = texto(e?.tipo, 40) || "Outro";
      const d = texto(e?.data, 10);
      const diaDoMes = Math.min(Number(d.slice(8, 10)), ultimoDia);
      return {
        id: texto(e?.id, 60),
        titulo: texto(e?.titulo, 160),
        // Recorrente anual aparece NO ANO PEDIDO, nao no ano em que foi
        // lancado -- senao um feriado cadastrado em 2024 cairia fora da grade.
        data: e?.recorrenteAnual ? `${mes}-${String(diaDoMes).padStart(2, "0")}` : d,
        tipo,
        cor: cores[tipo] || COR_PADRAO,
        hora: texto(e?.hora, 5),
        descricao: texto(e?.descricao, 400),
        recorrenteAnual: !!e?.recorrenteAnual,
      };
    })],
    hoje: hojeSP(),
    consultadoEm: new Date().toISOString(),
  };
}

// -------------------------------------------------------------------------- //
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Metodo nao suportado." }, 405);

  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "Pedido invalido." }, 400);
  }
  const acao = String(corpo?.action ?? "");
  const mes = String(corpo?.mes ?? "");
  if (!MES.test(mes)) return json({ erro: "Informe o mes no formato AAAA-MM." }, 400);

  try {
    switch (acao) {
      case "producao": {
        const g = await exigirSessao(req, "agenda");
        if (g.resposta) return g.resposta;
        return json(await producao(mes));
      }
      case "empresa": {
        const g = await exigirSessao(req, "calendario-empresa");
        if (g.resposta) return g.resposta;
        return json(await empresa(mes));
      }
      default:
        return json({ erro: "Acao desconhecida." }, 400);
    }
  } catch (e) {
    /* A mensagem do banco vai para o log, nao para a tela: nome de tabela e
       texto de erro do Postgres sao mapa da casa para quem esta sondando. */
    console.error("painel-agenda:", acao, e instanceof Error ? e.message : e);
    return json({ erro: "Nao foi possivel ler a agenda agora." }, 500);
  }
});
