// ============================================================================
// painel-dados — leituras do Painel (substitui contas-atrasadas.js,
// fluxo-caixa.js, produtos.js e orcamentos.js)
//
// As quatro faziam a MESMA coisa: conferir o cracha, ler uma chave do cache e
// devolver { itens, atualizadoEm }. Viraram uma function com ?modulo=, porque
// quatro copias do mesmo porteiro sao quatro lugares para ele sair diferente.
//
// O cache e preenchido por FORA (GitHub Actions -- ver .github/workflows/
// cache-mubisys.yml). Aqui so se le: resposta instantanea, e a normalizacao dos
// campos continua vivendo em quem carrega.
//
// PORTEIRO FAIL-CLOSED: sem PAINEL_JWT_SECRET no ambiente, tudo trava em vez de
// liberar. Um painel financeiro fora do ar e um problema; um painel financeiro
// aberto e outro bem maior. (Antes do porteiro, qualquer um com o endereco lia
// 225 titulos, 1.479 O.S e 2.545 orcamentos -- conferido em 2026-07-22.)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verificarJwt, crachaRevogado } from "../_shared/cripto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";

// Opcional: token do GitHub com permissao de Actions. Se existir, uma leitura
// com cache velho dispara a recarga (auto-cura). Sem ele, vale so o agendamento
// -- que e o caso normal. A auto-cura existe porque o cron do Netlify ja congelou
// por 11 horas e ninguem percebeu ate abrir o painel.
const GH_TOKEN = Deno.env.get("PAINEL_GH_ACTIONS_TOKEN") ?? "";
const GH_REPO = Deno.env.get("PAINEL_GH_REPO") ?? "leogpereira-afk/painel-impresilk";
const MINUTOS_ATE_AQUECER = 22;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json" } });

// Porteiro: cracha valido E permissao para o modulo pedido.
/* `modulo` aceita UMA lista porque a mesma fonte serve a mais de um modulo. As
   ordens de servico sao o caso: quem tem "permutas" precisa delas para escolher
   as O.S. que entram na permuta, e quem tinha "produtos" ja as lia. Sem isso, a
   tela de Permutas abriria vazia para todo mundo que nao e direcao -- e o store
   trata 403 como "fonte negada", em SILENCIO, entao o defeito nao apareceria
   como erro: apareceria como cliente nenhum na lista. */
async function exigirSessao(req: Request, modulo: string | string[]) {
  if (!JWT_SECRET) {
    console.error("painel-dados: PAINEL_JWT_SECRET ausente -- recusando tudo (fail-closed)");
    return { resposta: json({ erro: "Login nao configurado no servidor." }, 503) };
  }
  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const s = m ? await verificarJwt(m[1], JWT_SECRET) : null;
  /* Cracha revogado sai pela MESMA porta da sessao ausente: 401 com semSessao,
     que e o sinal que faz o cliente deslogar sozinho. Antes isto devolvia
     `null`, e o `g.resposta` de cada ramo estourava TypeError -- fechava a
     porta (o 500 nao entrega dado), mas o navegador ficava preso numa tela de
     erro generico com um cracha que ja nao vale, sem nunca voltar ao login. */
  if (s && await crachaRevogado(sb, "painel", s)) {
    return { resposta: json({ erro: "Seu acesso foi encerrado.", semSessao: true }, 401) };
  }
  if (!s) return { resposta: json({ erro: "Entre no sistema.", semSessao: true }, 401) };
  const perms: string[] = s.perms || [];
  const aceitos = Array.isArray(modulo) ? modulo : [modulo];
  // Lista VAZIA = qualquer cracha valido serve (a saude da carga, por
  // exemplo). Sem esta linha, `[]` cairia no `some` que e sempre falso e a
  // porta nasceria fechada para todo mundo, master inclusive.
  const pode = aceitos.length === 0 || s.master === true || perms.includes("*") ||
               aceitos.some((x) => perms.includes(x));
  if (!pode) return { resposta: json({ erro: "Voce nao tem acesso a este modulo." }, 403) };
  return { sessao: s };
}

const lerCache = async (chave: string) => {
  const { data } = await sb.from("painel_cache").select("valor").eq("chave", chave).maybeSingle();
  return data?.valor ?? null;
};

/* O MESMO valor, mais a data em que ELE foi gravado.
   Funcao separada de proposito: mudar a forma de retorno do `lerCache` quebraria
   em silencio tres chamadas (talvezAquecer le status.em; o fluxo mensal le
   mensal.em; e `dsoHist` iria embrulhado, sendo que o front faz
   `Array.isArray(body.dsoHist)` e descartaria a curva inteira sem erro nenhum).

   POR QUE ISTO IMPORTA: os cinco modulos devolviam o carimbo GLOBAL, lido da
   chave `status`, que ganha data nova em todo ciclo em que ALGUMA fonte veio.
   A fonte que falhou ficava com o dado velho e o carimbo novo -- carga parcial
   aparecia como verde. A coluna certa sempre existiu (`painel_cache
   .atualizado_em`, escrita em todo upsert) e era descartada no `select`. */
const lerCacheComData = async (chave: string): Promise<{ valor: any; em: string | null }> => {
  const { data } = await sb
    .from("painel_cache").select("valor, atualizado_em").eq("chave", chave).maybeSingle();
  return { valor: data?.valor ?? null, em: data?.atualizado_em ?? null };
};

// Dispara a recarga se o cache estiver velho. Fire-and-forget: a leitura NUNCA
// espera por isto -- quem abriu o painel quer o dado que ja existe, mesmo velho.
function talvezAquecer(status: any) {
  try {
    if (!GH_TOKEN) return; // sem token de Actions: vale so o agendamento
    const em = status?.em ? new Date(status.em).getTime() : 0;
    if (em && Date.now() - em < MINUTOS_ATE_AQUECER * 60000) return;
    fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/cache-mubisys.yml/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "painel-impresilk",
      },
      body: JSON.stringify({ ref: "main" }),
    }).catch(() => {});
  } catch { /* auto-cura nunca derruba a leitura */ }
}

const PRECISA_AQUECER = {
  preparando: true,
  erro: "Cache do Mubisys ainda nao aquecido. Aguarde uns 2 minutos.",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const modulo = url.searchParams.get("modulo") ?? "";
  const parte = url.searchParams.get("parte") ?? "pagar";

  try {
    switch (modulo) {
      case "contas-atrasadas": {
        const g = await exigirSessao(req, "contas-atrasadas");
        if (g.resposta) return g.resposta;
        const [rec, status, dsoHist] = await Promise.all([
          lerCacheComData("recebiveis"), lerCache("status"), lerCache("dso_hist"),
        ]);
        talvezAquecer(status);
        if (!rec.valor) return json(PRECISA_AQUECER, 503);
        // Carimbo DESTA chave, com o global como reserva (linha nunca tocada
        // desde antes da coluna existir).
        return json({ itens: rec.valor, atualizadoEm: rec.em ?? status?.em ?? null, dsoHist: dsoHist ?? [] });
      }

      case "fluxo-caixa": {
        const g = await exigirSessao(req, "fluxo-caixa");
        if (g.resposta) return g.resposta;

        // Realizado mes a mes: forma diferente (por ano), responde separado.
        if (parte === "mensal") {
          const [mensal, status] = await Promise.all([lerCache("fluxo_mensal"), lerCache("status")]);
          talvezAquecer(status);
          // Ainda nao rodou a carga do realizado: nao e erro, so nao ha historico.
          if (!mensal) return json({ anos: {}, disponiveis: [], atualizadoEm: null, preparando: true });
          return json({
            anos: mensal.anos ?? {},
            disponiveis: mensal.disponiveis ?? [],
            atualizadoEm: mensal.em ?? status?.em ?? null,
          });
        }

        const [fonte, status] = await Promise.all([
          lerCacheComData(parte === "bancos" ? "bancos" : "pagar"), lerCache("status"),
        ]);
        talvezAquecer(status);
        if (!fonte.valor) return json(PRECISA_AQUECER, 503);
        return json({ itens: fonte.valor, atualizadoEm: fonte.em ?? status?.em ?? null });
      }

      case "produtos": {
        // "produtos" e modulo APOSENTADO (ver APOSENTADOS em src/lib/modulos.js):
        // ninguem consegue mais receber esse id, entao na pratica so master/`*`
        // carregava as ordens. "permutas" e o modulo vivo que precisa delas.
        const g = await exigirSessao(req, ["produtos", "permutas", "campanhas"]);
        if (g.resposta) return g.resposta;
        const [os, status] = await Promise.all([lerCacheComData("ordens"), lerCache("status")]);
        talvezAquecer(status);
        if (!os.valor) return json(PRECISA_AQUECER, 503);
        return json({ itens: os.valor, atualizadoEm: os.em ?? status?.em ?? null });
      }

      /* A BUSCA DE O.S. DA TELA DE PERMUTAS.
         Le a TABELA `painel_ordens`, nao o cache. O cache guarda 2025 em
         diante num vetor JSON que viaja inteiro no login; o historico desde
         2020 sao ~19.500 O.S. e ~10 MB, e nao pode entrar nesse caminho -- o
         painel abre com 85 kB e isso o multiplicaria por cem para todo mundo
         por causa de uma tela que so a direcao usa.

         Aqui desce SO o que foi pedido: os clientes que casam com o que a
         pessoa digitou, ou as O.S. de um cliente escolhido. */
      case "ordensBusca": {
        const g = await exigirSessao(req, ["permutas", "campanhas"]);
        if (g.resposta) return g.resposta;
        const url = new URL(req.url);
        const desde = String(url.searchParams.get("desde") ?? "").slice(0, 10);
        /* 100 CLIENTES, NAO 20 -- e o corte DEIXOU DE SER MUDO. A campanha
           "Politica 2024 - Prefeito" tem 30 candidaturas ligadas (prefeito +
           vereadores de uma eleicao municipal e assim); o slice(0,20) antigo
           descartava as chaves 21+ EM SILENCIO: o Leo ligava o candidato,
           marcava as O.S., e elas "nao ficavam no sistema" -- estavam gravadas,
           mas a busca nunca mais as trazia. Limite calado e o defeito de
           familia da casa (a lista de modulos ja custou dois dias). Se um dia
           passar de 100, o retorno DIZ quantos cortou e a tela avisa. */
        const todasChaves = String(url.searchParams.get("clientes") ?? "")
          .split("|").map((x) => x.trim()).filter(Boolean);
        /* 200 a pedido do dono (23/08): a Politica 2024 ja chegou a 30
           candidaturas e ha campanhas maiores por vir. O aviso de corte
           continua valendo acima disso. */
        const clientes = todasChaves.slice(0, 200);
        const clientesCortados = todasChaves.length - clientes.length;
        const termo = String(url.searchParams.get("termo") ?? "").trim().slice(0, 80);
        /* ATE QUANDO. A campanha tem inicio E FIM -- uma eleicao acaba em
           outubro, e a O.S. de dezembro para o mesmo cliente e outra venda.
           Sem o corte de cima, a lista de escolher trazia a carteira inteira
           do candidato desde o inicio do ano ate hoje. */
        const ate = String(url.searchParams.get("ate") ?? "").slice(0, 10);
        /* OS ITENS SO DESCEM QUANDO PEDIDOS (`itens=1`). A lista de escolher
           mostra numero, cliente e valor -- carregar os itens de 2.000 O.S.
           para isso multiplicaria a resposta por dez sem ninguem olhar. Quem
           pede e o ranking de produtos da campanha aberta, que trabalha sobre
           dezenas de O.S. ja marcadas. */
        const comItens = url.searchParams.get("itens") === "1";
        const COLUNAS = "id, numero, cliente, cnpj, data, valor, bruto, desconto";
        const colunas = comItens ? `${COLUNAS}, itens` : COLUNAS;

        /* POR ID: as O.S. que as permutas ja aceitaram, para a tela de abertura
           poder conferir TODOS os saldos contra o ERP de uma vez. Sem isto ela
           mostraria a soma congelada e teria de admitir que nao conferiu --
           com a lista aberta na frente, e a hora em que uma O.S. cancelada
           precisa aparecer. */
        /* O TETO DE 1.000 E DO SERVIDOR, nao do codigo. O PostgREST deste
           projeto esta com `max_rows: 1000` (conferido na Management API):
           `.limit(2000)` era cortado em 1.000 e o aviso `linhasNoTeto`, que
           so disparava em 2.000, NUNCA disparava -- corte mudo com cara de
           corte falante, que e pior que nao ter aviso. A saida e paginar:
           trazer de 1.000 em 1.000 ate acabar, com um teto declarado. */
        const PAGINA = 1000;
        const TETO = 6000;
        const buscarTudo = async (monta: (de: number, ate: number) => any) => {
          const linhas: any[] = [];
          for (let de = 0; de < TETO; de += PAGINA) {
            const { data, error } = await monta(de, de + PAGINA - 1);
            if (error) throw new Error(error.message);
            const lote = data ?? [];
            linhas.push(...lote);
            if (lote.length < PAGINA) return { linhas, noTeto: false };
          }
          return { linhas, noTeto: true };
        };

        const idsTodos = String(url.searchParams.get("ids") ?? "")
          .split("|").map((x) => x.trim()).filter(Boolean);
        // O `.in()` tambem nao pode ficar sem limite: URL gigante estoura no
        // proxy antes de chegar ao banco. 500 por vez, sem descartar nada.
        const ids = idsTodos.slice(0, 5000);
        if (ids.length) {
          const itens: any[] = [];
          for (let i = 0; i < ids.length; i += 500) {
            const fatia = ids.slice(i, i + 500);
            const { linhas } = await buscarTudo((de, ate) =>
              sb.from("painel_ordens").select(colunas).in("id", fatia).range(de, ate));
            itens.push(...linhas);
          }
          return json({
            itens,
            // Quantos ids nem chegaram a ser perguntados: sem isto, a O.S. de
            // numero 5.001 aparecia como "sumiu do ERP".
            ...(idsTodos.length > ids.length ? { idsCortados: idsTodos.length - ids.length } : {}),
          });
        }

        // Com clientes escolhidos: as O.S. DELES. Sem clientes: a lista de
        // nomes que casam com o termo, para a pessoa escolher.
        if (clientes.length) {
          const { linhas, noTeto } = await buscarTudo((de, ate2) => {
            let q = sb.from("painel_ordens")
              .select(colunas)
              .in("cliente_chave", clientes)
              .order("data", { ascending: false })
              .range(de, ate2);
            if (/^\d{4}-\d{2}-\d{2}$/.test(desde)) q = q.gte("data", desde);
            if (/^\d{4}-\d{2}-\d{2}$/.test(ate)) q = q.lte("data", ate);
            return q;
          });
          return json({
            itens: linhas,
            // Bater no teto (6.000 linhas, paginadas de 1.000) nao pode ser
            // silencioso: e a diferenca entre "esses clientes nao tem mais
            // O.S." e "ha mais e eu nao trouxe".
            ...(clientesCortados > 0 ? { clientesCortados } : {}),
            ...(noTeto ? { linhasNoTeto: true } : {}),
          });
        }

        /* ATE ONDE O PAINEL TEM O.S. GUARDADA.
           Vai junto com toda resposta porque sem isso a tela nao consegue
           distinguir "esse cliente nao tem O.S. nesse periodo" de "o painel
           ainda nao foi buscar esse periodo no ERP" -- e as duas aparecem
           iguais: lista vazia. A permuta pode procurar desde 2018; se a carga
           do historico so trouxe 2025, a tela precisa DIZER isso em vez de
           deixar a direcao concluir que o cliente nunca comprou. */
        if (url.searchParams.get("cobertura") === "1") {
          const { data, error } = await sb.rpc("painel_ordens_cobertura");
          if (error) throw new Error(error.message);
          /* QUANTAS O.S. JA TEM ITEM GRAVADO. Vai junto porque um ranking de
             produtos VAZIO tem duas causas opostas -- "essas O.S. nao tem item"
             e "a carga ainda nao passou por elas" -- e as duas aparecem iguais
             na tela. Medicao que da zero pode ser "nao cheguei la": ja reportei
             o sistema mais pesado da casa como o mais leve por nao distinguir. */
          const { data: it } = await sb.rpc("ordens_cobertura_itens");
          return json({ cobertura: { ...(data?.[0] ?? {}), itens: it?.[0] ?? null } });
        }

        if (termo.length < 2) return json({ clientes: [] });
        /* Agrupar por cliente e somar no banco. Trazer as linhas e agrupar
           aqui obrigaria a puxar a carteira inteira de cada nome que casa --
           um "a" traria as vinte mil. */
        const { data, error } = await sb.rpc("painel_ordens_clientes", {
          p_termo: termo,
          p_desde: /^\d{4}-\d{2}-\d{2}$/.test(desde) ? desde : null,
          /* O FIM TAMBEM CORTA AQUI. Sem isto o "12 O.S. · R$ 84.000" ao lado
             do nome contava o que o cliente comprou DEPOIS do evento, enquanto
             a lista de O.S. logo abaixo ja cortava -- duas reguas para o mesmo
             periodo na mesma tela. */
          p_ate: /^\d{4}-\d{2}-\d{2}$/.test(ate) ? ate : null,
        });
        if (error) throw new Error(error.message);
        return json({ clientes: data ?? [] });
      }

      case "orcamentos": {
        const g = await exigirSessao(req, "orcamentos");
        if (g.resposta) return g.resposta;
        const [orc, status] = await Promise.all([lerCacheComData("orcamentos"), lerCache("status")]);
        talvezAquecer(status);
        if (!orc.valor) return json(PRECISA_AQUECER, 503);
        return json({ itens: orc.valor, atualizadoEm: orc.em ?? status?.em ?? null });
      }

      /* Os vendedores REAIS do ERP, para a tela de Configuracoes oferecer a
         lista em vez de digitacao livre. Um espaco a mais no nome criava uma
         linha zerada para sempre no funil -- "vendedor sem venda" que nao
         existe. So quem calibra (modulo configuracoes) precisa disto. */
      case "vendedoresErp": {
        const g = await exigirSessao(req, "configuracoes");
        if (g.resposta) return g.resposta;
        const { data, error } = await sb.rpc("painel_vendedores");
        if (error) throw new Error(error.message);
        return json({ vendedores: (data ?? []).map((v: any) => ({ nome: v.vendedor, orcamentos: Number(v.orcamentos) })) });
      }

      /* A ABA "ANOS" -- o padrao de consumo, automatico. Nada de marcar O.S.
         uma a uma: a base INTEIRA (painel_ordens, 2020 ate hoje) e somada no
         banco e desce um panorama de ~80 linhas (mes, valor, O.S., clientes,
         e a fatia ACUMULADA de campanha). O detalhe de um mes -- quem comprou
         e o que foi vendido -- so desce quando o mes e aberto. */
      case "anosPanorama": {
        const g = await exigirSessao(req, "campanhas");
        if (g.resposta) return g.resposta;
        /* A REGUA DA COBERTURA VIAJA JUNTO. Mes sem linha so e "vendeu zero"
           DENTRO da regua: do inicio da varredura (a mesma funcao que a carga
           usa) ate o dia da ultima carga DA FONTE DAS ORDENS -- o carimbo
           global `status.em` fica verde mesmo quando so outra fonte veio.
           Fora dela, o painel nao tem o mes, e afirmar zero seria mentira. */
        const [pan, regua, cob] = await Promise.all([
          sb.rpc("painel_anos_panorama"),
          sb.rpc("permutas_historico_desde"),
          sb.rpc("painel_ordens_cobertura"),
        ]);
        if (pan.error) throw new Error(pan.error.message);
        const linhas = (pan.data ?? []).map((m: any) => ({
          ano: m.ano, mes: m.mes, valor: Number(m.valor), os: Number(m.os),
          clientes: Number(m.clientes),
          valorCampanha: Number(m.valor_campanha), osCampanha: Number(m.os_campanha),
        }));
        /* ATE ONDE A TABELA FOI CARREGADA -- carimbo da PROPRIA tabela, nao
           do cache `ordens`, que e outra fonte com outra cadencia. Dia LOCAL
           da casa (UTC-3): carga de 23h e do dia em que rodou, nao do dia
           seguinte em UTC -- na virada do mes isso mudaria a regua. */
        const linhaCob = Array.isArray(cob.data) ? cob.data[0] : cob.data;
        const carregado = linhaCob?.carregado_em ?? null;
        const ate = carregado
          ? new Date(new Date(carregado).getTime() - 3 * 3600000).toISOString().slice(0, 10)
          : null;
        /* O INICIO DA COBERTURA E A MAIS ANTIGA DAS DUAS DATAS: a regua da
           varredura e a primeira O.S. guardada. So a regua deixava a aba
           refem da permuta mais antiga (mexer no `desde` dela escondia 64
           meses e R$ 22,5 milhoes -- provado no banco); so o min(data) faria
           janeiro de 2020, varrido e sem venda, parecer mes que o painel nao
           tem. A menor das duas responde certo nos dois casos. */
        const primeiraOS = linhaCob?.desde ?? null;
        const desde = [regua.data, primeiraOS].filter(Boolean).sort()[0] ?? null;
        return json({
          // mes=null e a linha do ANO (o distinct de clientes que a soma dos
          // meses nao da); as demais sao os meses.
          meses: linhas.filter((l: any) => l.mes),
          anos: linhas.filter((l: any) => !l.mes).map(({ mes: _m, ...resto }: any) => resto),
          cobertura: { desde, ate },
        });
      }

      case "anosMes": {
        const g = await exigirSessao(req, "campanhas");
        if (g.resposta) return g.resposta;
        const mes = String(url.searchParams.get("mes") ?? "");
        // Formato estrito: o parametro vai direto ao filtro do banco.
        if (!/^\d{4}-\d{2}$/.test(mes)) return json({ erro: "Mes invalido (use AAAA-MM)." }, 400);
        const { data, error } = await sb.rpc("painel_anos_mes", { p_mes: mes });
        if (error) throw new Error(error.message);
        return json({ detalhe: data ?? null });
      }

      /* O MES-CALENDARIO: os produtos de TODOS os janeiros (ou fevereiros...)
         comparados por ano -- e a recorrencia diz se o comportamento se
         repete. `semCampanha=1` tira as O.S. marcadas nas campanhas, senao
         agosto/setembro seriam so material de eleicao. */
      case "anosMesCal": {
        const g = await exigirSessao(req, "campanhas");
        if (g.resposta) return g.resposta;
        const n = Number(url.searchParams.get("n"));
        if (!Number.isInteger(n) || n < 1 || n > 12) return json({ erro: "Mes invalido (use 1 a 12)." }, 400);
        const { data, error } = await sb.rpc("painel_anos_mes_cal", {
          p_n: n,
          p_sem_campanha: url.searchParams.get("semCampanha") === "1",
        });
        if (error) throw new Error(error.message);
        return json({ detalhe: data ?? null });
      }

      /* O ALARME DA CARGA, que ate agora nao tinha porta: o vigia (pg_cron,
         de hora em hora) escrevia `carga_alarme` no cache e NINGUEM lia --
         nem tela, nem function. Vigia que ninguem ouve e metade de vigia.
         Qualquer sessao pode ler: e sinal de saude do painel, nao dado de
         negocio, e a Home da direcao e quem mostra. */
      case "carga": {
        const g = await exigirSessao(req, []);
        if (g.resposta) return g.resposta;
        const [alarme, status] = await Promise.all([lerCache("carga_alarme"), lerCache("status")]);
        /* CARGA DEGRADADA TAMBEM E NOTICIA. A carga marca `parcial` e lista o
           que falhou quando uma fonte cai, mas isso ficava so na tabela: no
           dia 24/08 o catalogo do ERP estava fora ha horas -- item novo
           entrando sem categoria (45 em agosto contra 0 em maio) -- e nenhuma
           tela dizia nada. */
        return json({
          alarme: alarme?.parado ? alarme : null,
          degradada: status?.parcial
            ? { em: status.em ?? null, fontes: status.fontesQueFalharam ?? [] }
            : null,
        });
      }

      /* AS TRES ABAS DE ANALISE DE VENDAS (vendedores, clientes, produtos).
         Mesmo dono da aba Anos: modulo campanhas, agregacao no banco, corte
         falante. Parametros validados aqui porque vao direto ao SQL. */
      case "vendedoresPanorama": {
        const g = await exigirSessao(req, "campanhas");
        if (g.resposta) return g.resposta;
        const { data, error } = await sb.rpc("painel_vendedores_panorama");
        if (error) throw new Error(error.message);
        return json({
          linhas: (data ?? []).map((v: any) => ({
            ano: v.ano, vendedor: v.vendedor, valor: Number(v.valor),
            os: Number(v.os), clientes: Number(v.clientes),
          })),
        });
      }

      case "vendedorDetalhe": {
        const g = await exigirSessao(req, "campanhas");
        if (g.resposta) return g.resposta;
        const vendedor = String(url.searchParams.get("vendedor") ?? "").slice(0, 80);
        if (!vendedor) return json({ erro: "Vendedor vazio." }, 400);
        const ano = String(url.searchParams.get("ano") ?? "");
        const { data, error } = await sb.rpc("painel_vendedor_detalhe", {
          p_vendedor: vendedor,
          p_ano: /^\d{4}$/.test(ano) ? ano : null,
        });
        if (error) throw new Error(error.message);
        return json({ detalhe: data ?? null });
      }

      case "clientesAbc": {
        const g = await exigirSessao(req, "campanhas");
        if (g.resposta) return g.resposta;
        const ano = String(url.searchParams.get("ano") ?? "");
        const { data, error } = await sb.rpc("painel_clientes_abc", {
          p_ano: /^\d{4}$/.test(ano) ? ano : null,
        });
        if (error) throw new Error(error.message);
        return json({ detalhe: data ?? null });
      }

      case "clienteDetalhe": {
        const g = await exigirSessao(req, "campanhas");
        if (g.resposta) return g.resposta;
        const chave = String(url.searchParams.get("chave") ?? "").slice(0, 200);
        if (!chave) return json({ erro: "Cliente vazio." }, 400);
        const { data, error } = await sb.rpc("painel_cliente_detalhe", { p_chave: chave });
        if (error) throw new Error(error.message);
        return json({ detalhe: data ?? null });
      }

      case "produtosPanorama": {
        const g = await exigirSessao(req, "campanhas");
        if (g.resposta) return g.resposta;
        const ano = String(url.searchParams.get("ano") ?? "");
        const { data, error } = await sb.rpc("painel_produtos_panorama", {
          p_ano: /^\d{4}$/.test(ano) ? ano : null,
        });
        if (error) throw new Error(error.message);
        return json({ detalhe: data ?? null });
      }

      case "produtoDetalhe": {
        const g = await exigirSessao(req, "campanhas");
        if (g.resposta) return g.resposta;
        const chave = String(url.searchParams.get("chave") ?? "").slice(0, 300);
        if (!chave) return json({ erro: "Produto vazio." }, 400);
        const { data, error } = await sb.rpc("painel_produto_detalhe", { p_chave: chave });
        if (error) throw new Error(error.message);
        return json({ detalhe: data ?? null });
      }

      /* PAGO × EM ABERTO das O.S. pedidas — a fatia financeira da campanha.
         Os títulos apontam a O.S. pelo número (`despesa` do ERP). Desce só o
         que foi pedido, magro: a régua estreita fica na porta, não na tela.
         A CONTA (juntar título a título, estorno, tolerância) mora em
         src/lib/calc/financeiroOS.js, onde tem teste — aqui é só o recorte. */
      case "osFinanceiro": {
        const g = await exigirSessao(req, "campanhas");
        if (g.resposta) return g.resposta;
        const todos = String(url.searchParams.get("numeros") ?? "")
          .split("|").map((x) => x.trim()).filter((x) => /^\d{1,12}$/.test(x));
        if (!todos.length) return json({ erro: "Sem numeros de O.S." }, 400);
        // Corte declarado, nunca mudo: a tela avisa quantas ficaram de fora.
        const TETO = 600;
        const pedidos = new Set(todos.slice(0, TETO));
        const [rec, pag] = await Promise.all([
          lerCacheComData("recebiveis"), lerCacheComData("recebidos_os"),
        ]);

        /* UM TÍTULO PODE COBRIR VÁRIAS O.S. — e é comum: o ERP escreve
           "23208-23206-23051-23021" no campo `despesa`. Casar o texto inteiro
           com um número deixava esses títulos INVISÍVEIS, e não era detalhe:
           medido na produção em 04/09/2026, R$ 173.759 dos R$ 442.312 em
           aberto (39%) e R$ 2,48 milhões dos R$ 9,07 milhões pagos (27%)
           estavam em títulos assim. A campanha do print (R$ 115 mil, 10 O.S.)
           aparecia inteira como "sem título no ERP" tendo R$ 41.400 em aberto.

           O título é REPARTIDO entre as O.S. que ele cita, proporcional ao
           valor de cada uma em painel_ordens -- quando a soma das O.S. bate
           com o título (o caso normal: 30.800+300+300+10.000 = 41.400), cada
           uma recebe exatamente o seu. Se alguma O.S. do título for
           desconhecida aqui, o rateio vira divisão igual e a resposta carrega
           `incerto: true`: a tela mostra o número como aproximado em vez de
           afirmar centavo que não pode provar. */
        const numerosDo = (s: unknown): string[] => {
          const achados = String(s ?? "").match(/\d{1,12}/g) || [];
          return [...new Set(achados)];
        };
        const cem = (n: number) => Math.round(n * 100) / 100;

        const titulos = pag.valor?.titulos && typeof pag.valor.titulos === "object"
          ? pag.valor.titulos : null;

        // Passo 1: quais títulos tocam alguma O.S. pedida, e todas as O.S. que
        // eles citam (inclusive as de FORA da campanha -- elas puxam a parte
        // delas, senão a fatia da campanha ficaria inflada).
        type Bruto = { id: string; oss: string[]; valor: number; pago: number; vencimento: string; em: string; pago_lado: boolean };
        const brutos: Bruto[] = [];
        const envolvidas = new Set<string>();
        for (const r of (Array.isArray(rec.valor) ? rec.valor : [])) {
          const oss = numerosDo((r as any)?.os);
          if (!oss.some((n) => pedidos.has(n))) continue;
          oss.forEach((n) => envolvidas.add(n));
          brutos.push({
            id: String((r as any).id), oss,
            valor: Number((r as any).valor) || 0, pago: Number((r as any).pago) || 0,
            vencimento: String((r as any).vencimento || ""), em: "", pago_lado: false,
          });
        }
        if (titulos) {
          for (const [id, t] of Object.entries(titulos as Record<string, any>)) {
            const oss = numerosDo(t?.os);
            if (!oss.some((n) => pedidos.has(n))) continue;
            oss.forEach((n) => envolvidas.add(n));
            brutos.push({
              id, oss, valor: 0, pago: Number(t?.pago) || 0,
              vencimento: "", em: String(t?.em || ""), pago_lado: true,
            });
          }
        }

        // Passo 2: o valor de cada O.S. envolvida, para pesar o rateio.
        const valorDaOS = new Map<string, number>();
        const lista = [...envolvidas];
        for (let i = 0; i < lista.length; i += 500) {
          const { data } = await sb.from("painel_ordens")
            .select("numero, valor").in("numero", lista.slice(i, i + 500));
          for (const o of data ?? []) valorDaOS.set(String(o.numero), Number(o.valor) || 0);
        }

        // Passo 3: reparte cada título entre as O.S. pedidas que ele cita.
        const abertos: Array<Record<string, unknown>> = [];
        const pagos: Array<Record<string, unknown>> = [];
        let incertos = 0;
        for (const b of brutos) {
          const pesos = b.oss.map((n) => valorDaOS.get(n) ?? 0);
          const soma = pesos.reduce((s, x) => s + x, 0);
          const incerto = b.oss.length > 1 && (soma <= 0 || pesos.some((p) => p <= 0));
          if (incerto) incertos += 1;
          const fatia = (i: number) => (b.oss.length === 1 ? 1 : incerto ? 1 / b.oss.length : pesos[i] / soma);
          b.oss.forEach((n, i) => {
            if (!pedidos.has(n)) return;
            const f = fatia(i);
            const compartilhado = b.oss.length > 1;
            if (b.pago_lado) {
              pagos.push({ id: b.id, os: n, pago: cem(b.pago * f), em: b.em, compartilhado, incerto });
            } else {
              abertos.push({
                id: b.id, os: n, valor: cem(b.valor * f), pago: cem(b.pago * f),
                vencimento: b.vencimento, compartilhado, incerto,
              });
            }
          });
        }

        return json({
          abertos, pagos,
          cortados: Math.max(0, todos.length - TETO),
          /* `temPagos` separa "o mapa existe e não achou nada" (pode afirmar
             'sem título') de "o mapa ainda não foi montado" (não afirmar). */
          temPagos: !!titulos,
          desdeDados: pag.valor?.desde ?? null,
          // Quantos títulos foram divididos por igual por falta do valor de
          // alguma O.S. -- a tela avisa em vez de fingir precisão.
          incertos,
          atualizadoEm: rec.em ?? null,
          pagosEm: pag.em ?? null,
        });
      }

      default:
        return json({ erro: `Modulo desconhecido: ${modulo || "(vazio)"}` }, 400);
    }
  } catch (e) {
    console.error("[painel-dados] erro:", e);
    return json({ erro: "Erro interno." }, 500);
  }
});
