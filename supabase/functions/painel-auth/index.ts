// ============================================================================
// painel-auth — login do Painel de Gestao (substitui netlify/functions/auth.mjs)
//
// O CONTRATO E O MESMO: { action, ... } e as mesmas respostas. So o backend
// mudou -- store "painel-auth" (1 blob por conta) -> tabela painel_contas.
//
// O painel NAO usa Supabase Auth de proposito: ele ja tem login proprio com
// permissao por modulo, e o hash das senhas (PBKDF2, 120 mil iteracoes) fica em
// painel_contas. Trocar isso agora significaria todo mundo recriar senha sem
// ganho nenhum -- e reescrever mecanismo de senha e a forma mais facil de
// enfraquecer um. O modulo _shared/cripto.ts e copia fiel do que roda hoje.
//
// PROJETO COMPARTILHADO: prefixo obrigatorio. "auth" seria uma function generica
// demais num projeto que hospeda cinco sistemas.
//
// verify_jwt = false: quem valida o cracha e esta funcao, com o JWT_SECRET
// proprio do painel. O gateway do Supabase nao conhece esse cracha.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  assinarJwt, hashSenha, conferirSenha, normalizarUsuario, sessaoDoPedido, crachaRevogado,
} from "../_shared/cripto.ts";
import { trocarSenhaConsistente, FalhaTroca, recusaCerta } from "../_shared/troca-senha.ts";
import { problemaDaSenha, falhaDeCredencial, motivoSeguro } from "../_shared/senha-regra.ts";
import { lerLojas, linhasDoLog, FalhaLeitura, type ItemSistema, type Lojas } from "../_shared/senha-lojas.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";
// Chave publica: signInWithPassword nao aceita a de servico.
const ANON_KEY = Deno.env.get("ANON_KEY_IMPRESILK") ?? "";
const TOKEN = Deno.env.get("PAINEL_TOKEN") ?? "";
const MASTER_USUARIO = normalizarUsuario(Deno.env.get("PAINEL_AUTH_MASTER_USUARIO") || "leonardo");
const MASTER_SENHA = Deno.env.get("PAINEL_AUTH_MASTER_SENHA") ?? "";

const EXP_SEG = 60 * 60 * 12; // cracha vale 12 horas

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Modulos que podem ser liberados. "inicio" nao entra: e a porta de entrada e
// fica sempre acessivel, senao a pessoa loga e cai numa tela sem lugar nenhum.
// A tela de Acessos so consegue conceder o que estiver AQUI: salvarConta filtra
// a lista recebida por esta constante, em silencio. "gestao" ficou de fora
// quando a tela de direcao nasceu -- marcar a caixa, salvar e receber {ok:true}
// nao concedia nada, e nao havia como perceber. Modulo novo entra nos DOIS
// lugares (aqui e em src/lib/modulos.js) ou nao entra em nenhum.
// fluxo-caixa e produtos sairam: as telas nao existem mais no painel (menu e
// rotas removidos). Conta antiga pode ter o id guardado; ele simplesmente nao
// abre nada, e some na proxima gravacao.
const MODULOS = ["gestao", "contas-atrasadas", "orcamentos", "bancos", "marketing", "licitacoes", "glossario", "compromissos",
  // As duas telas de agenda so para ver (14/09/2026): "agenda" e o calendario
  // e a programacao da producao; "calendario-empresa" sao os eventos da casa.
  // A porta das duas e a function painel-agenda, que nao tem acao de escrita.
  "agenda", "calendario-empresa",
  "manutencoes", "patrimonio", "permutas", "campanhas",
  // 14/09/2026 -- "Documentos e ativos" vira modulo de verdade. Ate aqui a
  // tela nao tinha modulo nenhum: rota sem `Restrito`, item no menu fora do
  // filtro, e a porta de dados abria documento/veiculo/maquina/seguro para
  // qualquer pessoa logada -- inclusive para APAGAR.
  "documentos",
  // 15/09/2026 -- "planilhas". O modulo e PLANO: cada planilha pertence a um
  // setor, e o setor e concedido a parte, nunca como "planilhas:FIN" dentro
  // desta lista. Medido antes de decidir: `somenteValidos` do cliente
  // (src/lib/modulos.js) descarta "planilhas:FIN" porque compara id inteiro, e
  // o `filter(includes)` do equipe-auth faz o mesmo na gravacao -- a concessao
  // de setor sumiria duas vezes, calada. A regua de setor mora na poda da
  // leitura, no painel-config.
  "planilhas",
  "configuracoes"];

// Mensagem UNICA para qualquer falha de login: usuario inexistente e senha
// errada precisam ser indistinguiveis, senao da para descobrir quem tem acesso.
// (Confirmado atacando o sistema no ar em 2026-07-22.)
const ERRO_LOGIN = "Usuario ou senha incorretos.";

// Registro de mentira, so para GASTAR o mesmo tempo quando o usuario nao
// existe. Sem isso a mensagem era igual mas o RELOGIO nao: conta inexistente
// respondia em milissegundos (nem chega a calcular hash) e conta real levava os
// ~100 ms do PBKDF2 de 120 mil voltas -- da para listar quem trabalha aqui so
// cronometrando. O salt e fixo e publico de proposito: ele nao protege nada,
// so faz a conta demorar.
const CONTA_FANTASMA = {
  hash: "0".repeat(64),
  salt: "00112233445566778899aabbccddeeff",
  iter: 120000,
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json" } });

// Comparacao em tempo constante (nao vaza o tamanho do acerto).
function igual(a: unknown, b: unknown): boolean {
  const x = String(a), y = String(b);
  let dif = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) dif |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return dif === 0;
}

async function lerConta(usuario: string) {
  const { data } = await sb.from("painel_contas").select("*").eq("usuario", usuario).maybeSingle();
  return data;
}

// Tira hash/salt antes de devolver uma conta para a tela.
const publica = (c: any) => ({
  usuario: c.usuario,
  nome: c.nome || c.usuario,
  permissoes: c.permissoes || [],
  vendedorId: c.vendedor_id || "",
  atualizadoEm: c.atualizado_em,
});

async function conferirIdentidade(id:string,senha:string) {
  if(!ANON_KEY) return false;
  const {data,error}=await sb.auth.admin.getUserById(id);
  if(error || !data?.user?.email) return false;
  const cliente=createClient(SUPABASE_URL,ANON_KEY,{auth:{persistSession:false}});
  const {data:entrada,error:falha}=await cliente.auth.signInWithPassword({email:data.user.email,password:senha});
  return !falha && !!entrada?.session;
}

/* A MESMA CONFERENCIA, com a resposta em TRES, para a troca de senha: "ok",
   "errada" ou "fora" (nao deu para saber). A de cima fica como esta, porque no
   login a resposta tem de ser uma frase so para qualquer falha. Na troca a
   pessoa ja esta dentro, e dizer "senha atual incorreta" quando o GoTrue caiu
   a fazia errar de novo, contra o proprio freio. */
async function conferirNoAuth(id: string, senha: string): Promise<"ok" | "errada" | "fora"> {
  if (!ANON_KEY) return "fora";
  const { data, error } = await sb.auth.admin.getUserById(id);
  if (error || !data?.user?.email) return "fora";
  const cliente = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: entrada, error: falha } = await cliente.auth.signInWithPassword({ email: data.user.email, password: senha });
  if (!falha && entrada?.session) return "ok";
  return falhaDeCredencial(falha) ? "errada" : "fora";
}

// O log da troca e testemunha, nao dono: falhar aqui nao desfaz a troca.
const registrarTroca = (linha: { p_sistema: string; p_usuario: string; p_acao: string; p_por: string; p_detalhe: string }) =>
  sb.rpc("porta_registrar", linha).then(() => {}, () => {});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);
  if (!JWT_SECRET) return json({ erro: "Login nao configurado (falta PAINEL_JWT_SECRET).", semConfig: true }, 501);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ erro: "JSON invalido." }, 400);
  }
  const action = String(body.action || "");

  /* SESSAO VIVA = crachá válido E não revogado. Esta era a ÚNICA das três
     portas do Painel que não perguntava pela revogação: painel-config e
     painel-dados conferem a cada pedido, e aqui o crachá de até 12h de alguém
     DESATIVADO continuava listando a equipe, trocando a própria senha e -- se
     era master -- administrando contas. Desativar tem de valer nas três portas
     no mesmo instante. */
  const sessaoViva = async () => {
    const s = await sessaoDoPedido(req, JWT_SECRET);
    if (!s) return null;
    return (await crachaRevogado(sb, "painel", s)) ? null : s;
  };
  const exigirMaster = async () => {
    const s = await sessaoViva();
    return s && s.master === true ? s : null;
  };

  try {
    switch (action) {
      // Diz se o ambiente esta montado, NUNCA os valores. Existe porque "senha
      // incorreta" tem duas causas muito diferentes -- senha errada de verdade,
      // ou a variavel invisivel para a funcao -- e sem isto nao da para separar.
      case "diag": {
        if (!TOKEN || req.headers.get("x-token") !== TOKEN) return json({ erro: "nao autorizado" }, 401);
        const { count } = await sb.from("painel_contas").select("usuario", { count: "exact", head: true });
        return json({
          temJwtSecret: !!JWT_SECRET,
          temMasterSenha: !!MASTER_SENHA,
          usuarioMaster: MASTER_USUARIO,
          contaMasterJaGravada: !!(await lerConta(MASTER_USUARIO)),
          totalContas: count ?? 0,
        });
      }

      case "login": {
        const usuario = normalizarUsuario(body.usuario);
        const senha = String(body.senha || "");
        if (!usuario || !senha) return json({ erro: "Informe usuario e senha." }, 400);

        /* FREIO E RASTRO. Esta porta nao registrava NADA -- nem entrada, nem
           falha -- e nao tinha limite de tentativa: um martelo online contra o
           usuario da direcao era invisivel. Agora ela usa as mesmas duas funcoes
           de banco que as outras quatro portas de senha da casa, e as falhas
           caem no MESMO equipe_acessos_log que a tela ja mostra. */
        const trancar = async () => {
          const { data: t } = await sb.rpc("porta_travada", { p_sistema: "painel", p_usuario: usuario });
          return t === true;
        };
        const anotar = (acao: string, detalhe = "") =>
          sb.rpc("porta_registrar", {
            p_sistema: "painel", p_usuario: usuario, p_acao: acao, p_por: "-", p_detalhe: detalhe,
          }).then(() => {}, () => {});   // log e testemunha: falhar aqui nao derruba o login
        if (await trancar()) {
          await anotar("login-barrado", "porta travada por tentativas");
          return json({
            erro: "Muitas tentativas seguidas. Espere 15 minutos ou peca uma senha nova a direcao.",
          }, 429);
        }

        if (usuario === MASTER_USUARIO) {
          /* MESMO NUMERO DE IDAS AO BANCO que o caminho comum. O ramo do master
             pulava a consulta a acesso_conta, e isso o denunciava pelo relogio:
             ~0,49s constante contra 0,7-1,2s de todo mundo (medido em 6 amostras
             por usuario). Quem cronometrasse a porta descobria QUEM e o dono. */
          /* `*` e nao a lista de colunas: `trocar_senha` nasce na migracao das
             senhas, e pedir a coluna pelo nome antes dela existir derrubaria o
             login inteiro (400 do PostgREST vira 503 aqui). A tabela nao guarda
             hash; o que viaja a mais sao nome e tipo. */
          const {data:identidade,error:erroIdentidade}=await sb.from("acesso_conta").select("*").eq("usuario",usuario).maybeSingle();
          if(erroIdentidade) return json({erro:"Entrada temporariamente indisponível."},503);
          if(identidade?.ativo===false) return json({erro:ERRO_LOGIN},401);
          const propria = await lerConta(MASTER_USUARIO);
          // A senha do ambiente e apenas a INICIAL: assim que a direcao troca a
          // senha dentro do painel, passa a valer a conta gravada -- a senha
          // definitiva nunca fica escrita numa configuracao.
          const ok = identidade?.auth_user_id ? await conferirIdentidade(identidade.auth_user_id,senha) : propria ? await conferirSenha(senha,propria) : !!MASTER_SENHA && igual(senha,MASTER_SENHA);
          if (!ok) { await anotar("login-falhou", "senha errada"); return json({ erro: ERRO_LOGIN }, 401); }
          const token = await assinarJwt(
            { sub: MASTER_USUARIO, nome: propria?.nome || "Direcao", master: true, perms: ["*"], vend: "" },
            JWT_SECRET, EXP_SEG);
          await anotar("entrou", "direcao");
          return json({
            token, usuario: MASTER_USUARIO, nome: propria?.nome || "Direcao",
            permissoes: ["*"], master: true, vendedorId: "",
            /* OBRIGA A TROCAR quando a senha em uso e a INICIAL do ambiente
               (sem identidade no Auth e sem linha propria) ou quando a pessoa
               esta marcada como provisoria. Antes era so `!propria`, e a tela
               ignorava o campo; agora ela obedece, entao o campo tem de ser
               exato: a direcao ja migrada, sem linha no Painel, usa a senha do
               Auth, e obriga-la a trocar toda entrada seria castigo. */
            trocarSenha: (!identidade?.auth_user_id && !propria) || identidade?.trocar_senha === true,
          });
        }

        /* DESATIVAR TEM DE VALER AQUI TAMBEM.
           `painel_contas` nao tem coluna de ativo: quem manda sobre estar ativo
           e a tabela nova (acesso_conta). Sem esta consulta, desativar alguem na
           tela de Acessos fechava a porta nova e deixava ESTA aberta -- a pessoa
           digitava usuario e senha e entrava com todas as permissoes. */
        // `*` pelo mesmo motivo do ramo da direcao: `trocar_senha` e da migracao.
        const { data: unica, error: falhaIdentidade } = await sb.from("acesso_conta")
          .select("*").eq("usuario", usuario).maybeSingle();
        if(falhaIdentidade) return json({erro:"Entrada temporariamente indisponível."},503);
        if (unica && unica.ativo === false) return json({ erro: ERRO_LOGIN }, 401);

        const conta = await lerConta(usuario);
        // Confere SEMPRE, mesmo sem conta: o tempo de resposta tem de ser o
        // mesmo nos dois casos (ver CONTA_FANTASMA).
        const senhaOk = unica?.auth_user_id ? await conferirIdentidade(unica.auth_user_id,senha) : await conferirSenha(senha,conta ?? CONTA_FANTASMA);
        if (!conta || !senhaOk) {
          await anotar("login-falhou", conta ? "senha errada" : "usuario nao existe");
          return json({ erro: ERRO_LOGIN }, 401);
        }
        const perms = conta.permissoes || [];
        const vend = conta.vendedor_id || "";
        const token = await assinarJwt(
          { sub: conta.usuario, nome: conta.nome, master: false, perms, vend }, JWT_SECRET, EXP_SEG);
        await anotar("entrou", "");
        return json({
          token, usuario: conta.usuario, nome: conta.nome,
          permissoes: perms, master: false, vendedorId: vend,
          /* A SENHA PROVISORIA OBRIGA TAMBEM NA PORTA ANTIGA. A marca mora na
             pessoa (acesso_conta.trocar_senha), e e ela que a entrada unica
             devolve; sem isto, quem entrasse pelo login antigo do Painel
             nunca seria obrigado a trocar. */
          trocarSenha: unica?.trocar_senha === true,
        });
      }

      case "eu": {
        const s = await sessaoViva();
        if (!s) return json({ erro: "Sessao invalida ou expirada.", semSessao: true }, 401);
        /* A OBRIGACAO SOBREVIVE A RECARREGAR A PAGINA. Sem este campo, abrir
           outra aba ou apertar F5 apagava o "crie a sua senha" que o login
           tinha mandado. Banco sem responder deixa passar (trocarSenha falso):
           e leitura de tela, e trancar a casa por uma consulta que falhou e
           pior que a obrigacao esperar a proxima entrada. */
        const chaveEu = normalizarUsuario(s.sub);
        const { data: marca, error: erroMarca } = await sb.from("acesso_conta").select("*").eq("usuario", chaveEu).maybeSingle();
        let trocarSenha = marca?.trocar_senha === true;
        if (!trocarSenha && !erroMarca && s.master === true && !marca?.auth_user_id) {
          // Ainda na senha inicial do ambiente? So quando a leitura RESPONDEU que
          // nao ha linha: erro de leitura nao pode virar "obrigar a trocar".
          const { data: linha, error: erroLinha } = await sb.from("painel_contas")
            .select("usuario").eq("usuario", MASTER_USUARIO).maybeSingle();
          trocarSenha = !erroLinha && !linha;
        }
        return json({
          usuario: s.sub, nome: s.nome || s.sub,
          permissoes: s.perms || [], master: s.master === true, vendedorId: s.vend || "",
          trocarSenha,
        });
      }

      /* ================================================================
         (A) TROCAR A MINHA SENHA EM TODOS OS SISTEMAS (contrato das senhas).
         Qualquer pessoa com cracha do Painel. O alvo e SEMPRE o dono do
         cracha: `usuario` no corpo e ignorado, senao um cracha qualquer
         trocaria a senha de outra pessoa.

         Por que aqui e nao na painel-acesso: aquela porta so abre para a
         direcao e tem de continuar assim; esta e para todo mundo. Mesmo nome
         e mesmo corpo de antes, de proposito: uma segunda acao para o mesmo
         fim deixaria a antiga viva e divergente (foi o que aconteceu com
         listarContas/salvarConta, aposentadas com 410). A tela antiga, presa
         numa aba, continua funcionando e ganha o comportamento novo.

         O que ela deixou de fazer, e por que:
           * gravar `equipe_contas where usuario = <nome>`: o `leo` do PCP
             nunca recebia a senha do `leonardo`. As lojas agora saem por id
             (_shared/senha-lojas.ts);
           * deixar o RH com identidade propria para tras, e com isso trancar
             a entrada unica de quem nao migrou (409 "e a senha de la que
             vale"). O RH agora recebe a nova, por ultimo;
           * dizer "senha atual incorreta" quando o GoTrue caiu (vira 503);
           * aceitar tentativa sem freio e sem rastro.
         ================================================================ */
      case "trocarMinhaSenha": {
        /* 1. CRACHA NO MODO ESTRITO. Para ler tela, cair aberto quando o banco
           nao responde e aceitavel; para gravar senha, nao: um cracha de quem
           acabou de ser desligado nao escolhe a senha de ninguem. */
        const s = await sessaoDoPedido(req, JWT_SECRET);
        // semSessao: true e o sinal que o cliente usa para deslogar e mostrar
        // "sua sessao expirou". Sem ele, quem passou das 12 horas do cracha
        // ficava preso numa tela de erro que nao dizia o que fazer.
        if (!s?.sub || (await crachaRevogado(sb, "painel", s, true))) {
          return json({ erro: "Sua sessão expirou. Entre de novo para trocar a senha.", semSessao: true }, 401);
        }
        const chave = normalizarUsuario(s.sub);
        const ehMaster = s.master === true;
        const por = `painel:${chave}`;

        // 2. AS REGRAS, antes de gastar ficha do freio: digitar curto nao e
        // tentativa contra a senha de ninguem.
        const atual = typeof body.senhaAtual === "string" ? body.senhaAtual : "";
        const nova = body.novaSenha;
        if (!atual) return json({ erro: "Digite a sua senha atual." }, 400);
        const furo = problemaDaSenha(nova, atual);
        if (furo) return json({ erro: furo }, 400);

        /* 3. O FREIO, com a ficha consumida ANTES de conferir, na mesma
           operacao que decide (a rajada de 17/08: 16 tentativas no mesmo
           segundo passaram por um freio que lia antes de escrever).
           Balde PROPRIO ("senha-atual") e nao o `*` da entrada: quem tem um
           cracha roubado errando a senha atual nao pode trancar o dono fora
           do login por 15 minutos. Banco sem responder aqui NAO deixa passar:
           e caminho de escrita de senha. */
        const { data: travou, error: erroFreio } = await sb.rpc("porta_travada", { p_sistema: "senha-atual", p_usuario: chave });
        if (erroFreio) return json({ erro: "Não consegui conferir a sua senha agora. Tente de novo em instantes." }, 503);
        if (travou === true) {
          await registrarTroca({ p_sistema: "senha-atual", p_usuario: chave, p_acao: "troca-barrada", p_por: por, p_detalhe: "freio de tentativas" });
          return json({ erro: "Muitas tentativas seguidas. Espere 15 minutos e tente de novo." }, 429);
        }

        /* A RESERVA VEM ANTES DE CONFERIR, e nao depois. Conferida a atual e so
           entao reservada, uma "Definir senha" da direcao que terminasse no meio
           dessas duas etapas era atropelada por uma senha provada contra a
           senha VELHA; e, se o banco recusasse, a compensacao devolvia a senha
           velha a entrada, por cima da que a direcao acabara de definir.
           (A) e (B) da mesma pessoa ao mesmo tempo: a segunda espera. */
        const operacao = crypto.randomUUID();
        const { data: reservou, error: falhaReserva } = await sb.rpc("painel_senha_reservar", { p_usuario: chave, p_operacao: operacao });
        if (falhaReserva) return json({ erro: "Não foi possível iniciar a troca. Tente de novo." }, 503);
        if (!reservou) return json({ erro: "Já há uma troca de senha em andamento. Espere um minuto e tente de novo." }, 409);
        try {
          /* 4. A SENHA ATUAL E CONFERIDA ONDE ELA VALE (PADRAO §3): no Auth para
             quem migrou; senao no hash do Painel; a direcao sem linha propria,
             na senha inicial do ambiente.
             5. E NUNCA E PULADA, nem com a senha marcada como provisoria: e a
             prova de que quem troca e a pessoa. (A equipe-auth pula quando a
             conta e provisoria; aqui esse caminho nao existe.) */
          const indisponivel = () => json({ erro: "Não consegui conferir a sua senha agora. Tente de novo em instantes." }, 503);
          const { data: pessoa, error: erroPessoa } = await sb.from("acesso_conta").select("*").eq("usuario", chave).maybeSingle();
          if (erroPessoa) return indisponivel();
          const idAuth: string | null = pessoa?.auth_user_id ?? null;
          const { data: propria, error: erroPropria } = await sb.from("painel_contas").select("*").eq("usuario", chave).maybeSingle();
          if (erroPropria) return indisponivel();
          const conferencia = idAuth
            ? await conferirNoAuth(idAuth, atual)
            : propria
              ? ((await conferirSenha(atual, propria)) ? "ok" : "errada")
              : (ehMaster && !!MASTER_SENHA && igual(atual, MASTER_SENHA) ? "ok" : "errada");
          if (conferencia === "fora") return indisponivel();
          if (conferencia !== "ok") {
            // O texto digitado NUNCA vai para o log: so o fato.
            await registrarTroca({ p_sistema: "senha-atual", p_usuario: chave, p_acao: "senha-atual-errada", p_por: por, p_detalhe: "" });
            return json({ erro: "Senha atual incorreta." }, 401);
          }

          // 7. AS LOJAS. Sem acesso_conta (conta ainda nao consolidada), so o Painel.
          let lojas: Lojas;
          try {
            lojas = await lerLojas(sb, {
              modo: "propria", conta: pessoa ?? null, painelAlvo: chave,
              ehDirecao: ehMaster, nomeDirecao: propria?.nome || "Direção",
              direcao: MASTER_USUARIO,
            });
          } catch (e) {
            if (e instanceof FalhaLeitura) return indisponivel();
            throw e;
          }
          // A entrada desta pessoa e tambem a de outra: trocar aqui trocaria a
          // senha da outra na porta que abre todos. Nada e gravado.
          if (lojas.conflito) {
            await registrarTroca({ p_sistema: "*", p_usuario: chave, p_acao: "troca-barrada", p_por: por, p_detalhe: lojas.conflito });
            return json({ erro: `Não troquei nada: ${lojas.conflito}. Peça à direção para corrigir o vínculo.` }, 409);
          }
          const reg = await hashSenha(nova as string);
          const mudarE = async (password: string) => {
            const { error } = await sb.auth.admin.updateUserById(idAuth, { password });
            if (error) {
              // O status viaja junto: 4xx e recusa certa, o resto e duvida
              // (ver recusaCerta em _shared/troca-senha.ts).
              const falha: any = new Error(motivoSeguro(error, [nova as string, atual]));
              falha.status = (error as any)?.status;
              throw falha;
            }
          };

          /* 8. TUDO OU NADA. Tudo que mora no banco (Painel, Brief, PCP,
             Compras, POPs, V.O.F. e a guarda da entrada) muda numa transacao
             so, pela funcao de banco, e so nas colunas de senha. A entrada (E)
             vem antes e e desfeita com a senha atual se o banco recusar. */
          try {
            await trocarSenhaConsistente({
              aplicarAuth: idAuth ? () => mudarE(nova as string) : undefined,
              reporAuth: idAuth ? () => mudarE(atual) : undefined,
              salvarLegado: async () => {
                const { data, error } = await sb.rpc("acesso_senha_gravar", {
                  p_conta: lojas.contaId, p_equipe: lojas.equipe, p_painel: lojas.painel,
                  p_hash: reg, p_temporaria: false, p_origem: "propria",
                });
                if (error || !data) throw new Error(motivoSeguro(error ?? "gravação não confirmada"));
              },
            });
          } catch (e) {
            const causa = e instanceof FalhaTroca ? `${e.etapa}: ${e.causa}` : (e as Error)?.message;
            await registrarTroca({
              p_sistema: "*", p_usuario: chave, p_acao: "troca-falhou", p_por: por,
              p_detalhe: motivoSeguro(causa, [nova as string, atual]),
            });
            return json({ erro: e instanceof FalhaTroca ? e.message : "A troca não foi concluída. A sua senha anterior continua valendo em todos os sistemas." }, 500);
          }

          /* 9. O RH COM IDENTIDADE PROPRIA, POR ULTIMO. Se ele recusar, nao ha
             como desfazer o banco e a entrada com seguranca, e nem precisa: a
             resposta sai PARCIAL, dizendo que no RH ficou a anterior e por que. */
          const falhasRh: string[] = [];
          for (const r of lojas.rh) {
            const { error } = await sb.auth.admin.updateUserById(r.userId, { password: nova as string });
            if (!error) continue;
            // Erro que nao e recusa certa pode ter gravado: pergunta ao Auth se
            // a nova abre, para o relatorio nao dizer "ficou a anterior" a toa.
            if (!recusaCerta(error) && (await conferirNoAuth(r.userId, nova as string)) === "ok") continue;
            falhasRh.push(motivoSeguro(error, [nova as string, atual]));
          }
          const sistemas: ItemSistema[] = lojas.sistemas.map((item) =>
            item.sistema === "rh" && item.resultado === "trocada" && falhasRh.length
              ? {
                  sistema: "rh", resultado: "falhou",
                  motivo: lojas.rh.length > 1 ? `${falhasRh.length} de ${lojas.rh.length} identidades do RH recusaram: ${falhasRh[0]}` : falhasRh[0],
                }
              : item);
          const parcial = sistemas.some((i) => i.resultado === "falhou");

          // 10. O RASTRO: uma linha por loja, com o login daquele sistema.
          for (const linha of linhasDoLog(lojas, sistemas, { entrada: !!lojas.contaId, por, detalhe: "própria" })) {
            await registrarTroca(linha);
          }
          return json({ ok: true, parcial, entrada: lojas.contaId ? "trocada" : "nao-consolidada", sistemas });
        } finally {
          const { error } = await sb.from("painel_senha_operacao").delete().eq("usuario", chave).eq("operacao", operacao);
          if (error) console.error("[painel-auth] reserva de troca aguarda expiração");
        }
      }

      // Quem trabalha aqui -- so nome e usuario, para montar o "encaminhar para"
      // dos compromissos. Qualquer pessoa logada pode ver: para passar uma
      // tarefa para a colega e preciso saber que ela existe. NAO devolve hash,
      // permissao nem vendedor: isso continua sendo coisa da direcao.
      case "listarPessoas": {
        const s = await sessaoViva();
        if (!s) return json({ erro: "Entre no sistema.", semSessao: true }, 401);
        const { data, error } = await sb.from("painel_contas")
          .select("usuario, nome, permissoes").order("nome");
        if (error) throw new Error(error.message);
        // SO quem tem a agenda liberada. Mandar compromisso para quem nao tem o
        // modulo fazia a tarefa sumir dos DOIS lados: saia da lista de quem
        // passou e o destinatario nunca a via (o menu esconde e a rota recusa).
        const temAgenda = (perms: any) =>
          Array.isArray(perms) && (perms.includes("*") || perms.includes("compromissos"));
        const pessoas = (data ?? [])
          .filter((c: any) => temAgenda(c.permissoes))
          .map((c: any) => ({ usuario: c.usuario, nome: c.nome || c.usuario }));
        // A direcao pode nao ter linha em painel_contas (enquanto usa a senha
        // inicial do ambiente), mas existe e recebe compromisso como todo mundo.
        if (!pessoas.some((p) => p.usuario === MASTER_USUARIO)) {
          pessoas.unshift({ usuario: MASTER_USUARIO, nome: "Direcao" });
        }
        return json({ pessoas });
      }

      /* AS TRES ACTIONS DE ADMINISTRAR CONTA (listarContas/salvarConta/
         removerConta) FORAM APOSENTADAS (23/08). Quem administra e SINCRONIZA a
         senha nos tres lugares e a painel-acesso -- estas eram a versao antiga
         e DIVERGENTE: gravavam so em painel_contas, e uma chamada por engano
         deixava a pessoa com duas senhas validas em portas diferentes. O 410
         nomeia o caminho novo em vez de sumir calado. */
      case "listarContas":
      case "salvarConta":
      case "removerConta":
        return json({ erro: "Esta acao mudou de casa: use a painel-acesso (tela Sistemas de Acessos)." }, 410);

      default:
        return json({ erro: `Acao desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[painel-auth] erro:", e);
    return json({ erro: "Falha interna no login." }, 500);
  }
});
