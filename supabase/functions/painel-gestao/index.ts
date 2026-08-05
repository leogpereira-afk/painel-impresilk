// ============================================================================
// painel-gestao — identidade, plano do ano, taticas, reunioes/atas e ciclo.
//
// FONTE UNICA (R1/R2). Esta function e a UNICA porta para gestao_*. O Painel
// (React) e a Central do Leo (JS puro) sao duas telas diferentes falando com
// ela -- editar uma tatica da Impresilk de qualquer um dos dois lados altera o
// MESMO registro. Nao existe tabela paralela para a empresa.
//
// POR QUE A PERMISSAO ESTA AQUI E NAO EM RLS: nem o Painel nem a Central usam
// Supabase Auth. Os dois tem login proprio (JWT HS256 + PBKDF2 em
// painel_contas) e toda leitura passa por Edge Function com a service_role,
// que IGNORA RLS. Politica de RLS neste desenho seria enfeite: nunca seria
// avaliada. As tabelas ficam com RLS ligada e sem policy (porta fechada para
// anon/authenticated) e o papel e conferido aqui, como ja e em painel-config.
//
// PAPEIS, mapeados no que o painel ja tem (modulos por conta):
//   diretoria    = master, ou perms com "*"        -> ve e edita tudo
//   gestor       = tem o modulo "gestao"           -> le identidade/plano/tatica,
//                                                     edita tatica, e so ve as
//                                                     reunioes em que participa
//   colaborador  = qualquer sessao valida          -> le SO a identidade
//
// A ata interna nao pode aparecer para quem nao participou: isso e filtrado no
// SERVIDOR (ver `reunioesVisiveis`), nao escondendo cartao na tela.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verificarJwt } from "../_shared/cripto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";
// A Central do Leo nao tem cracha do painel: ela fala com esta function pelo
// token de servidor, e so enxerga escopo de EMPRESA (nunca o pessoal de
// ninguem, nunca ata). E a ponte do item 4 do briefing.
const TOKEN = Deno.env.get("PAINEL_TOKEN") ?? "";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const texto = (v: unknown, max = 4000) => String(v ?? "").trim().slice(0, max);

// ── QUEM E A EQUIPE (lido do RH, nunca copiado) ───────────────────────────
//
// O esquema tatico precisa saber quem existe na casa: digitar o nome do
// responsavel a mao gera "Jessica", "jessica" e "Jéssica" como tres pessoas
// diferentes, e o quadro por setor nunca fecha.
//
// A ficha do RH (colecao 'colaboradores') tem salario, CPF, endereco, conjuge,
// perfil comportamental, risco de saida e potencial. NADA DISSO ATRAVESSA:
// daqui saem so nome, area, cargo e gestor. A lista de campos e por INCLUSAO,
// nunca "o registro menos alguns" -- campo novo no RH nao pode vazar sozinho
// por esquecimento.
//
// Nao ha copia: e leitura ao vivo da mesma tabela que o RH grava. Um espelho
// precisaria de sincronizacao e envelheceria calado.
async function equipeDoRH() {
  // PROJETA no banco em vez de trazer o registro inteiro. As 91 fichas somam
  // ~496 kB (29 delas com `fotoDataUrl` em base64, ate 20 kB cada) e nada disso
  // e usado aqui. Alem do peso a cada abertura da tela, o que nao entra na
  // memoria da function nao pode vazar por log nem por dump de erro.
  const COLUNAS = "pid:registro->>id, nome:registro->>nome, areaId:registro->>areaId," +
    " cargoId:registro->>cargoId, cargoLivre:registro->>cargoLivre, setor:registro->>setor," +
    " gestorId:registro->>gestorId, ehDirecao:registro->>ehDirecao," +
    " saiu:registro->>dataDesligamento";
  let linhas: any[] | null = null;
  const proj = await sb.from("registros").select(COLUNAS).eq("colecao", "colaboradores");
  if (!proj.error && (proj.data ?? []).some((r: any) => r?.nome)) {
    linhas = (proj.data ?? []).map((r: any) => ({
      id: r.pid, nome: r.nome, areaId: r.areaId, cargoId: r.cargoId,
      cargoLivre: r.cargoLivre, setor: r.setor, gestorId: r.gestorId,
      ehDirecao: r.ehDirecao === "true" || r.ehDirecao === true,
      dataDesligamento: r.saiu,
    }));
  } else {
    // Rede de seguranca. Cai aqui por ERRO da projecao ou -- o caso traicoeiro --
    // quando ela e ACEITA mas devolve linhas sem `nome`: aí nao ha erro nenhum e
    // a tela ficaria com a equipe vazia sem ninguem entender por que.
    console.warn("[gestao] projecao nao serviu, lendo o registro inteiro:",
      proj.error?.message ?? "sem nome nas linhas");
    const { data } = await sb.from("registros").select("registro").eq("colecao", "colaboradores");
    linhas = (data ?? []).map((l: any) => l.registro ?? {});
  }
  if (!linhas?.length) return [];

  // `areaId` e `cargoId` sao referencias: sem resolver, 27 das 39 pessoas
  // ficariam "(sem area)" -- o campo `setor` em texto so esta preenchido em 12.
  const nomePor = async (colecao: string) => {
    const proj = await sb.from("registros").select("id, nome:registro->>nome").eq("colecao", colecao);
    if (!proj.error) return new Map((proj.data ?? []).map((r: any) => [r.id, texto(r.nome, 80)]));
    const { data } = await sb.from("registros").select("id, registro").eq("colecao", colecao);
    return new Map((data ?? []).map((r: any) => [r.id, texto(r.registro?.nome, 80)]));
  };
  const [areas, cargos] = await Promise.all([nomePor("areas"), nomePor("cargos")]);

  // `linhas` ja vem PLANA dos dois caminhos (projetado e fallback).
  return linhas
    .filter((r: any) => !texto(r.dataDesligamento))          // so quem esta na casa
    .map((r: any) => ({
      id: texto(r.id, 60),
      nome: texto(r.nome, 90),
      // area resolvida > setor em texto > nada. "Sem area" e um estado honesto:
      // inventar "Producao" para quem nao tem cadastro esconderia o buraco.
      area: areas.get(texto(r.areaId)) || texto(r.setor, 60) || "",
      cargo: cargos.get(texto(r.cargoId)) || texto(r.cargoLivre, 80) || "",
      gestorId: texto(r.gestorId, 60),
      direcao: r.ehDirecao === true || r.ehDirecao === "true",
    }))
    .filter((p: any) => p.nome)
    .sort((a: any, b: any) => a.nome.localeCompare(b.nome, "pt-BR"));
}
const dataOuNulo = (v: unknown) => {
  const s = String(v ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "use POST" }, 405);
  if (!JWT_SECRET) return resposta({ erro: "Login nao configurado no servidor." }, 503);

  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: "json invalido" }, 400);
  }

  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const sessao = m ? await verificarJwt(m[1], JWT_SECRET) : null;
  const pelaPonte = !!TOKEN && req.headers.get("x-token") === TOKEN;
  if (!sessao && !pelaPonte) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);

  const perms: string[] = Array.isArray(sessao?.perms) ? sessao!.perms : [];
  const ehDiretoria = !pelaPonte && (sessao?.master === true || perms.includes("*"));
  const ehGestor = ehDiretoria || perms.includes("gestao");
  const quem = pelaPonte ? "central" : String(sessao?.nome || sessao?.sub || "alguem");
  const usuario = pelaPonte ? "central" : String(sessao?.sub ?? "");

  const soDiretoria = () =>
    ehDiretoria ? null : resposta({ erro: "So a diretoria altera esta parte." }, 403);
  const soGestor = () =>
    ehGestor ? null : resposta({ erro: "Voce nao tem acesso a Gestao." }, 403);

  // Empresa da vez. Uma so hoje (Impresilk); resolvida por nome para a Central
  // nao precisar guardar uuid.
  async function empresaId(nome = "Impresilk"): Promise<string | null> {
    const { data } = await sb.from("gestao_empresa").select("id").eq("nome", nome).maybeSingle();
    return data?.id ?? null;
  }

  // Plano ativo do ano corrente (ou o mais recente ativo).
  async function planoAtivo(emp: string) {
    const { data } = await sb.from("gestao_plano_ano").select("*")
      .eq("empresa_id", emp).eq("status", "ativo").order("ano", { ascending: false }).limit(1).maybeSingle();
    return data ?? null;
  }

  // Reunioes que ESTA pessoa pode ver. Diretoria ve todas; gestor ve so
  // aquelas em que o nome dele consta nos participantes. A ponte nao ve ata.
  async function reunioesVisiveis(emp: string) {
    if (pelaPonte) return [];
    const { data } = await sb.from("gestao_reuniao").select("*")
      .eq("empresa_id", emp).order("data", { ascending: false });
    const todas = data ?? [];
    if (ehDiretoria) return todas;
    const meu = String(sessao?.nome || sessao?.sub || "").toLowerCase();
    return todas.filter((r: any) =>
      (Array.isArray(r.participantes) ? r.participantes : [])
        .some((p: any) => String(p?.nome ?? p ?? "").toLowerCase() === meu));
  }

  try {
    switch (corpo.action) {
      // ── leitura de tudo o que a tela precisa, num pedido so ───────────────
      case "tudo": {
        const emp = await empresaId(texto(corpo.empresa) || "Impresilk");
        if (!emp) return resposta({ erro: "Empresa nao cadastrada." }, 404);

        const { data: identidade } = await sb.from("gestao_identidade")
          .select("*").eq("empresa_id", emp).maybeSingle();
        const { data: valores } = await sb.from("gestao_valor")
          .select("*").eq("empresa_id", emp).order("ordem");

        // Colaborador para por aqui: le SO a identidade.
        if (!ehGestor) {
          return resposta({ ok: true, papel: "colaborador", identidade, valores: valores ?? [] });
        }

        const plano = await planoAtivo(emp);
        const { data: objetivos } = plano
          ? await sb.from("gestao_objetivo").select("*").eq("plano_ano_id", plano.id).order("ordem")
          : { data: [] as any[] };
        const ids = (objetivos ?? []).map((o: any) => o.id);
        const { data: indicadores } = ids.length
          ? await sb.from("gestao_indicador").select("*").in("objetivo_id", ids).order("ordem")
          : { data: [] as any[] };

        // R2: a tela Gestao ve SO escopo empresa desta empresa. As taticas
        // pessoais do Leonardo nunca passam por aqui -- nem para a diretoria.
        const { data: taticas } = await sb.from("gestao_tatica").select("*")
          .eq("escopo", "empresa").eq("empresa_id", emp)
          .order("prazo", { ascending: true, nullsFirst: false });

        const reunioes = await reunioesVisiveis(emp);
        const idsReuniao = reunioes.map((r: any) => r.id);
        const { data: decisoes } = idsReuniao.length
          ? await sb.from("gestao_decisao").select("*").in("reuniao_id", idsReuniao)
          : { data: [] as any[] };

        const { data: ciclos } = plano
          ? await sb.from("gestao_ciclo_fechamento").select("*")
              .eq("plano_ano_id", plano.id).order("criado_em", { ascending: false })
          : { data: [] as any[] };

        const { data: prefs } = await sb.from("gestao_preferencia_ui")
          .select("bloco, aberto").eq("usuario", usuario);

        // A equipe vai junto no MESMO pedido: uma chamada a mais faria o quadro
        // do time aparecer depois da tela, pulando na cara de quem ja estava
        // lendo. Falha em silencio -- gestao sem a lista do RH continua
        // funcionando com o nome digitado a mao.
        const equipe = await equipeDoRH().catch(() => []);

        return resposta({
          ok: true,
          papel: ehDiretoria ? "diretoria" : "gestor",
          empresaId: emp,
          identidade, valores: valores ?? [],
          plano, objetivos: objetivos ?? [], indicadores: indicadores ?? [],
          taticas: taticas ?? [], reunioes, decisoes: decisoes ?? [],
          ciclos: ciclos ?? [],
          equipe,
          preferencias: Object.fromEntries((prefs ?? []).map((p: any) => [p.bloco, p.aberto])),
        });
      }

      // ── A PONTE: a Central do Leo pede as taticas da empresa ──────────────
      // Devolve SO escopo empresa. Mesmo registro que o Painel edita: mexer de
      // um lado aparece no outro na hora, sem copia.
      case "taticasDaEmpresa": {
        const emp = await empresaId(texto(corpo.empresa) || "Impresilk");
        if (!emp) return resposta({ erro: "Empresa nao cadastrada." }, 404);
        const { data } = await sb.from("gestao_tatica").select("*")
          .eq("escopo", "empresa").eq("empresa_id", emp)
          .order("prazo", { ascending: true, nullsFirst: false });
        return resposta({ ok: true, taticas: data ?? [] });
      }

      // ── identidade e valores (R6: so diretoria, com autor e data) ─────────
      case "salvarIdentidade": {
        const b = soDiretoria(); if (b) return b;
        const emp = await empresaId(texto(corpo.empresa) || "Impresilk");
        if (!emp) return resposta({ erro: "Empresa nao cadastrada." }, 404);
        const { error } = await sb.from("gestao_identidade").upsert({
          empresa_id: emp,
          missao: texto(corpo.missao),
          visao: texto(corpo.visao),
          visao_prazo: dataOuNulo(corpo.visaoPrazo),
          atualizado_por: quem,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: "empresa_id" });
        if (error) throw new Error(error.message);
        return resposta({ ok: true });
      }

      case "salvarValor": {
        const b = soDiretoria(); if (b) return b;
        const emp = await empresaId(texto(corpo.empresa) || "Impresilk");
        if (!emp) return resposta({ erro: "Empresa nao cadastrada." }, 404);
        const v = corpo.valor ?? {};
        if (!texto(v.nome)) return resposta({ erro: "Escreva o nome do valor." }, 400);
        const linha: any = {
          empresa_id: emp,
          nome: texto(v.nome, 120),
          significado: texto(v.significado),
          comportamento_esperado: texto(v.comportamentoEsperado),
          comportamento_inaceitavel: texto(v.comportamentoInaceitavel),
          ordem: Number(v.ordem) || 0,
        };
        if (v.id) linha.id = v.id;
        const { data, error } = await sb.from("gestao_valor").upsert(linha).select().single();
        if (error) throw new Error(error.message);
        return resposta({ ok: true, valor: data });
      }

      case "removerValor": {
        const b = soDiretoria(); if (b) return b;
        await sb.from("gestao_valor").delete().eq("id", texto(corpo.id, 60));
        return resposta({ ok: true });
      }

      // ── plano do ano (R6) ────────────────────────────────────────────────
      case "salvarPlano": {
        const b = soDiretoria(); if (b) return b;
        const emp = await empresaId(texto(corpo.empresa) || "Impresilk");
        if (!emp) return resposta({ erro: "Empresa nao cadastrada." }, 404);
        const ano = Number(corpo.ano) || new Date().getFullYear();
        const atual = await planoAtivo(emp);
        if (atual && atual.ano === ano) {
          const { error } = await sb.from("gestao_plano_ano")
            .update({ tese: texto(corpo.tese) }).eq("id", atual.id);
          if (error) throw new Error(error.message);
          return resposta({ ok: true, plano: { ...atual, tese: texto(corpo.tese) } });
        }
        const { data, error } = await sb.from("gestao_plano_ano")
          .insert({ empresa_id: emp, ano, tese: texto(corpo.tese) }).select().single();
        if (error) throw new Error(error.message);
        return resposta({ ok: true, plano: data });
      }

      case "salvarObjetivo": {
        const b = soDiretoria(); if (b) return b;
        const o = corpo.objetivo ?? {};
        if (!texto(o.titulo)) return resposta({ erro: "Escreva o objetivo." }, 400);
        if (!o.planoAnoId) return resposta({ erro: "Crie o plano do ano antes." }, 400);
        const linha: any = {
          plano_ano_id: o.planoAnoId,
          titulo: texto(o.titulo, 300),
          responsavel: texto(o.responsavel, 120),
          situacao: ["no_rumo", "atencao", "travado"].includes(o.situacao) ? o.situacao : "no_rumo",
          ordem: Number(o.ordem) || 0,
        };
        if (o.id) linha.id = o.id;
        const { data, error } = await sb.from("gestao_objetivo").upsert(linha).select().single();
        if (error) throw new Error(error.message);
        return resposta({ ok: true, objetivo: data });
      }

      case "removerObjetivo": {
        const b = soDiretoria(); if (b) return b;
        // A tatica NAO cai junto (on delete set null): ela vira "sem objetivo"
        // e aparece destacada, para alguem decidir o destino. Apagar trabalho
        // combinado como efeito colateral de reorganizar o plano seria pior.
        await sb.from("gestao_objetivo").delete().eq("id", texto(corpo.id, 60));
        return resposta({ ok: true });
      }

      case "salvarIndicador": {
        const b = soDiretoria(); if (b) return b;
        const i = corpo.indicador ?? {};
        if (!texto(i.nome)) return resposta({ erro: "Escreva o nome do indicador." }, 400);
        if (!i.objetivoId) return resposta({ erro: "Indicador precisa de um objetivo." }, 400);
        const linha: any = {
          objetivo_id: i.objetivoId,
          nome: texto(i.nome, 200),
          unidade: texto(i.unidade, 30),
          meta: Number(i.meta) || 0,
          atual: Number(i.atual) || 0,
          ordem: Number(i.ordem) || 0,
        };
        if (i.id) linha.id = i.id;
        const { data, error } = await sb.from("gestao_indicador").upsert(linha).select().single();
        if (error) throw new Error(error.message);
        return resposta({ ok: true, indicador: data });
      }

      case "removerIndicador": {
        const b = soDiretoria(); if (b) return b;
        await sb.from("gestao_indicador").delete().eq("id", texto(corpo.id, 60));
        return resposta({ ok: true });
      }

      // ── taticas: o coracao compartilhado ─────────────────────────────────
      case "salvarTatica": {
        const b = soGestor(); if (b) return b;
        const t = corpo.tatica ?? {};
        if (!texto(t.titulo)) return resposta({ erro: "Escreva o que precisa ser feito." }, 400);

        const escopo = t.escopo === "pessoal" ? "pessoal" : "empresa";
        let emp: string | null = null;
        if (escopo === "empresa") {
          emp = await empresaId(texto(t.empresa) || "Impresilk");
          // R3 dito com todas as letras. A trava tambem esta no banco (check
          // constraint), mas o erro do Postgres nao serve para ler na tela.
          if (!t.objetivoId) {
            return resposta({
              erro: "Toda tatica da empresa precisa estar ligada a um objetivo do ano. Escolha o objetivo -- se nao houver um que sirva, o que voce quer fazer ainda nao virou plano.",
            }, 400);
          }
        }

        const linha: any = {
          escopo,
          empresa_id: escopo === "empresa" ? emp : null,
          objetivo_id: t.objetivoId ?? null,
          titulo: texto(t.titulo, 300),
          responsavel: texto(t.responsavel, 120),
          prazo: dataOuNulo(t.prazo),
          status: ["aberta", "em_andamento", "concluida", "cancelada"].includes(t.status) ? t.status : "aberta",
          origem: t.origem === "ata" ? "ata" : "manual",
          decisao_id: t.decisaoId ?? null,
        };
        if (t.id) linha.id = t.id;
        else linha.criado_por = quem;
        // concluido_em e derivado do status: quem grava a data e o servidor, e
        // reabrir limpa a data (senao fica "concluida em" numa tatica aberta).
        linha.concluido_em = linha.status === "concluida" ? new Date().toISOString() : null;

        const { data, error } = await sb.from("gestao_tatica").upsert(linha).select().single();
        if (error) {
          if (String(error.message).includes("gestao_tatica_empresa_exige_vinculo")) {
            return resposta({ erro: "Tatica da empresa exige objetivo do ano." }, 400);
          }
          throw new Error(error.message);
        }
        return resposta({ ok: true, tatica: data });
      }

      case "removerTatica": {
        const b = soGestor(); if (b) return b;
        await sb.from("gestao_tatica").delete().eq("id", texto(corpo.id, 60));
        return resposta({ ok: true });
      }

      // ── reunioes e atas ──────────────────────────────────────────────────
      case "salvarReuniao": {
        const b = soGestor(); if (b) return b;
        const emp = await empresaId(texto(corpo.empresa) || "Impresilk");
        if (!emp) return resposta({ erro: "Empresa nao cadastrada." }, 404);
        const r = corpo.reuniao ?? {};

        // Ata aprovada nao volta a ser editavel: e o ponto do "aprovar".
        if (r.id) {
          const { data: antes } = await sb.from("gestao_reuniao").select("status").eq("id", r.id).maybeSingle();
          if (antes?.status === "aprovada") {
            return resposta({ erro: "Esta ata ja foi aprovada e nao pode mais ser alterada." }, 409);
          }
        }

        const linha: any = {
          empresa_id: emp,
          data: dataOuNulo(r.data) ?? new Date().toISOString().slice(0, 10),
          tipo: ["semanal_gestao", "mensal_resultado", "extraordinaria"].includes(r.tipo) ? r.tipo : "semanal_gestao",
          participantes: Array.isArray(r.participantes) ? r.participantes.slice(0, 50) : [],
          pauta: texto(r.pauta, 8000),
          registro: texto(r.registro, 20000),
          status: ["agendada", "realizada", "aprovada"].includes(r.status) ? r.status : "agendada",
        };
        if (linha.status === "aprovada") return resposta({ erro: "Use 'aprovarAta' para aprovar." }, 400);
        if (r.id) linha.id = r.id;
        const { data, error } = await sb.from("gestao_reuniao").upsert(linha).select().single();
        if (error) throw new Error(error.message);
        return resposta({ ok: true, reuniao: data });
      }

      case "aprovarAta": {
        const b = soDiretoria(); if (b) return b;
        const { data, error } = await sb.from("gestao_reuniao").update({
          status: "aprovada", aprovada_por: quem, aprovada_em: new Date().toISOString(),
        }).eq("id", texto(corpo.id, 60)).select().single();
        if (error) throw new Error(error.message);
        return resposta({ ok: true, reuniao: data });
      }

      case "salvarDecisao": {
        const b = soGestor(); if (b) return b;
        const d = corpo.decisao ?? {};
        if (!texto(d.texto)) return resposta({ erro: "Escreva a decisao." }, 400);
        if (!d.reuniaoId) return resposta({ erro: "Decisao precisa de uma reuniao." }, 400);
        const { data: r } = await sb.from("gestao_reuniao").select("status").eq("id", d.reuniaoId).maybeSingle();
        if (r?.status === "aprovada") {
          return resposta({ erro: "Esta ata ja foi aprovada e nao pode mais ser alterada." }, 409);
        }
        const linha: any = {
          reuniao_id: d.reuniaoId,
          texto: texto(d.texto, 2000),
          responsavel: texto(d.responsavel, 120),
          prazo: dataOuNulo(d.prazo),
          valor_id: d.valorId ?? null,
          status: ["aberta", "concluida", "cancelada"].includes(d.status) ? d.status : "aberta",
        };
        if (d.id) linha.id = d.id;
        const { data, error } = await sb.from("gestao_decisao").upsert(linha).select().single();
        if (error) throw new Error(error.message);
        return resposta({ ok: true, decisao: data });
      }

      // R4: decisao de ata vira tatica, com responsavel, prazo e link de volta.
      // Idempotente: rodar duas vezes nao cria duas taticas para a mesma
      // decisao (o botao "Gerar acoes" e clicado mais de uma vez, sempre).
      case "gerarAcoes": {
        const b = soGestor(); if (b) return b;
        const emp = await empresaId(texto(corpo.empresa) || "Impresilk");
        const reuniaoId = texto(corpo.reuniaoId, 60);
        if (!emp || !reuniaoId) return resposta({ erro: "Informe a reuniao." }, 400);

        const { data: decisoes } = await sb.from("gestao_decisao")
          .select("*").eq("reuniao_id", reuniaoId).eq("status", "aberta");
        const lista = decisoes ?? [];
        if (!lista.length) return resposta({ ok: true, criadas: 0, semObjetivo: 0 });

        const { data: jaTem } = await sb.from("gestao_tatica")
          .select("decisao_id").in("decisao_id", lista.map((d: any) => d.id));
        const feitas = new Set((jaTem ?? []).map((t: any) => t.decisao_id));

        // R3 continua valendo para decisao de ata. Sem objetivo escolhido, a
        // tatica NAO e criada em silencio -- a tela pergunta a qual objetivo
        // cada uma pertence e manda de novo.
        const objetivoId = corpo.objetivoId ?? null;
        let criadas = 0;
        const semObjetivo: any[] = [];
        for (const d of lista) {
          if (feitas.has(d.id)) continue;
          if (!objetivoId) { semObjetivo.push({ id: d.id, texto: d.texto }); continue; }
          const { error } = await sb.from("gestao_tatica").insert({
            escopo: "empresa", empresa_id: emp, objetivo_id: objetivoId,
            titulo: texto(d.texto, 300), responsavel: d.responsavel ?? "",
            prazo: d.prazo, status: "aberta", origem: "ata", decisao_id: d.id,
            criado_por: quem,
          });
          if (!error) criadas++;
        }
        return resposta({ ok: true, criadas, semObjetivo });
      }

      // ── fechamento de ciclo (R5) ─────────────────────────────────────────
      case "encerrarCiclo": {
        const b = soDiretoria(); if (b) return b;
        const emp = await empresaId(texto(corpo.empresa) || "Impresilk");
        if (!emp) return resposta({ erro: "Empresa nao cadastrada." }, 404);
        const plano = await planoAtivo(emp);
        if (!plano) return resposta({ erro: "Nao ha plano ativo para encerrar." }, 400);

        const { data: objetivos } = await sb.from("gestao_objetivo")
          .select("*").eq("plano_ano_id", plano.id).order("ordem");
        const ids = (objetivos ?? []).map((o: any) => o.id);
        const { data: indicadores } = ids.length
          ? await sb.from("gestao_indicador").select("*").in("objetivo_id", ids)
          : { data: [] as any[] };
        const { data: taticas } = await sb.from("gestao_tatica").select("*")
          .eq("escopo", "empresa").eq("empresa_id", emp);

        // O retrato do que estava planejado, congelado. Depois disso objetivo
        // e indicador podem mudar a vontade: o ciclo antigo continua legivel.
        const snapshot = {
          plano: { ano: plano.ano, tese: plano.tese },
          objetivos: objetivos ?? [],
          indicadores: indicadores ?? [],
          taticas: (taticas ?? []).map((t: any) => ({
            id: t.id, titulo: t.titulo, responsavel: t.responsavel,
            prazo: t.prazo, status: t.status, objetivo_id: t.objetivo_id, origem: t.origem,
          })),
        };

        const tipo = corpo.tipo === "anual" ? "anual" : "trimestral";
        const { error: e1 } = await sb.from("gestao_ciclo_fechamento").insert({
          plano_ano_id: plano.id, tipo,
          periodo: texto(corpo.periodo, 60) || String(plano.ano),
          snapshot_planejado: snapshot,
          realizado: texto(corpo.realizado, 8000),
          desvios: texto(corpo.desvios, 8000),
          aprendizados: texto(corpo.aprendizados, 8000),
          criado_por: quem,
        });
        if (e1) throw new Error(e1.message);

        // Ciclo trimestral NAO encerra o plano do ano: e um marco dentro dele.
        if (tipo !== "anual") return resposta({ ok: true, encerrouPlano: false });

        const { error: e2 } = await sb.from("gestao_plano_ano")
          .update({ status: "encerrado", encerrado_em: new Date().toISOString() })
          .eq("id", plano.id);
        if (e2) throw new Error(e2.message);

        const { data: novo, error: e3 } = await sb.from("gestao_plano_ano").insert({
          empresa_id: emp, ano: plano.ano + 1, tese: "",
          plano_anterior_id: plano.id,
        }).select().single();
        if (e3) throw new Error(e3.message);

        // O que ficou pendente atravessa para o plano novo. As taticas ficam
        // SEM objetivo de proposito: o objetivo era do plano velho, e quem
        // decide onde elas entram no plano novo e a diretoria. Elas aparecem
        // destacadas ate serem religadas.
        const { data: pendentes } = await sb.from("gestao_tatica").select("id")
          .eq("escopo", "empresa").eq("empresa_id", emp).in("status", ["aberta", "em_andamento"]);
        return resposta({
          ok: true, encerrouPlano: true, planoNovo: novo,
          taticasQueAtravessaram: (pendentes ?? []).length,
        });
      }

      // ── acordeao lembrado por pessoa ─────────────────────────────────────
      case "preferencia": {
        if (pelaPonte) return resposta({ ok: true });
        const bloco = texto(corpo.bloco, 40);
        if (!bloco) return resposta({ erro: "informe o bloco" }, 400);
        await sb.from("gestao_preferencia_ui").upsert(
          { usuario, bloco, aberto: !!corpo.aberto }, { onConflict: "usuario,bloco" });
        return resposta({ ok: true });
      }

      default:
        return resposta({ erro: "acao desconhecida" }, 400);
    }
  } catch (e) {
    console.error("[painel-gestao] erro:", e);
    return resposta({ erro: "erro interno" }, 500);
  }
});
