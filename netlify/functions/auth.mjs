// Login do painel de gestao. A senha e conferida NO SERVIDOR e o crente recebe
// um cracha assinado (JWT); as funcoes de dados so respondem a quem tem cracha
// valido. Mesmo mecanismo do app de RH (netlify/lib/cripto).
//
// Variaveis no Netlify:
//   JWT_SECRET          (obrigatoria) segredo que assina/verifica o cracha.
//   AUTH_MASTER_USUARIO (opcional, padrao "leonardo") usuario da direcao.
//   AUTH_MASTER_SENHA   (obrigatoria p/ a direcao entrar na 1a vez) senha inicial.
//
// A senha do master vinda da variavel e apenas a INICIAL: assim que ele troca a
// senha dentro do painel, passa a valer a conta gravada no Blobs -- a senha
// definitiva nunca fica escrita numa configuracao.
//
// PERMISSOES: cada conta tem uma lista de modulos que pode abrir. "*" = todos.
// A direcao (master) sempre tem "*".

import { getStore } from "@netlify/blobs";
import {
  assinarJwt,
  hashSenha,
  conferirSenha,
  normalizarUsuario,
  sessaoDoPedido,
} from "../lib/cripto.mjs";

const EXP_SEG = 60 * 60 * 12; // cracha vale 12 horas
const LOJA = "painel-auth";

// Mensagem UNICA para qualquer falha de login: usuario inexistente e senha
// errada precisam ser indistinguiveis, senao da para descobrir quem tem acesso.
const ERRO_LOGIN = "Usuario ou senha incorretos.";

// Modulos que podem ser liberados. "inicio" nao entra: e a porta de entrada e
// fica sempre acessivel, senao a pessoa loga e cai numa tela sem lugar nenhum.
export const MODULOS = ["contas-atrasadas", "fluxo-caixa", "produtos", "orcamentos", "configuracoes"];

const json = (corpo, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

const usuarioMaster = () => normalizarUsuario(process.env.AUTH_MASTER_USUARIO || "leonardo");

// Dispara o backup automatico (fire-and-forget). A funcao de backup gateia por
// tempo -- se ja houve backup nas ultimas 20h, ela mesma ignora.
function dispararBackupAuto() {
  try {
    const SEGREDO = process.env.TOKEN;
    if (!SEGREDO) return;
    const base = process.env.URL || "https://impresilk.netlify.app";
    fetch(`${base}/.netlify/functions/backup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-token": SEGREDO },
      body: JSON.stringify({ action: "auto" }),
    }).catch(() => {});
  } catch {
    /* nunca deixa o login falhar por causa do backup */
  }
}

// Comparacao de strings em tempo constante (nao vaza o tamanho do acerto).
function igual(a, b) {
  const x = String(a);
  const y = String(b);
  let dif = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) dif |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return dif === 0;
}

// Tira hash/salt antes de devolver uma conta para a tela.
const publica = (c) => ({
  usuario: c.usuario,
  nome: c.nome || c.usuario,
  permissoes: c.permissoes || [],
  atualizadoEm: c.atualizadoEm,
});

export default async (req) => {
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return json({ erro: "Login nao configurado no servidor (falta JWT_SECRET).", semConfig: true }, 501);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ erro: "JSON invalido." }, 400);
  }
  const action = String(body.action || "");
  const contas = getStore(LOJA);

  // Diagnostico: diz se o ambiente esta montado, NUNCA os valores. Protegido
  // pelo TOKEN do servidor. Existe porque "Senha incorreta" tem duas causas
  // muito diferentes -- senha errada de verdade, ou a variavel AUTH_MASTER_SENHA
  // invisivel para a funcao -- e sem isto nao da para distinguir de fora.
  if (action === "diag") {
    const t = req.headers.get("x-token") || "";
    if (!process.env.TOKEN || t !== process.env.TOKEN) return json({ erro: "nao autorizado" }, 401);
    const conta = await contas.get(usuarioMaster(), { type: "json" }).catch(() => null);
    return json({
      temJwtSecret: !!process.env.JWT_SECRET,
      temMasterSenha: !!process.env.AUTH_MASTER_SENHA,
      // Nao devolve o tamanho da senha: e uma dica gratuita para quem for
      // tentar adivinhar, e nao ajuda em nada no diagnostico.
      usuarioMaster: usuarioMaster(),
      contaMasterJaGravada: !!conta,
      totalContas: (await contas.list().catch(() => ({ blobs: [] }))).blobs.length,
    });
  }

  // Quem pode administrar acessos: so a direcao.
  const exigirMaster = async () => {
    const s = await sessaoDoPedido(req, secret);
    return s && s.master === true ? s : null;
  };

  try {
    switch (action) {
      // ---------------- login ----------------
      case "login": {
        const usuario = normalizarUsuario(body.usuario);
        const senha = String(body.senha || "");
        if (!usuario || !senha) return json({ erro: "Informe usuario e senha." }, 400);

        const master = usuarioMaster();
        if (usuario === master) {
          const propria = await contas.get(master, { type: "json" }).catch(() => null);
          const inicial = process.env.AUTH_MASTER_SENHA || "";
          // Senha inicial tambem em tempo constante: comparar com === vazaria,
          // pelo tempo de resposta, quantos caracteres bateram.
          const ok = propria ? await conferirSenha(senha, propria) : !!inicial && igual(senha, inicial);
          // MESMA mensagem do caminho comum: mensagens diferentes deixavam
          // enumerar quem existe ("Senha incorreta" so aparecia para usuario
          // valido). Confirmado atacando o sistema no ar em 2026-07-22.
          if (!ok) return json({ erro: ERRO_LOGIN }, 401);
          // Backup diario piggyback no login (nao depende do cron, que ja
          // falhou). A propria funcao ignora se ja fez backup nas ultimas 20h.
          dispararBackupAuto();
          const token = await assinarJwt(
            { sub: master, nome: propria?.nome || "Direcao", master: true, perms: ["*"] },
            secret,
            EXP_SEG
          );
          return json({
            token,
            usuario: master,
            nome: propria?.nome || "Direcao",
            permissoes: ["*"],
            master: true,
            // Avisa a tela para pedir a troca da senha inicial.
            trocarSenha: !propria,
          });
        }

        const conta = await contas.get(usuario, { type: "json" }).catch(() => null);
        // Mensagem unica para usuario inexistente e senha errada: dizer "usuario
        // nao existe" entregaria a lista de quem tem acesso a quem tentar.
        if (!conta || !(await conferirSenha(senha, conta))) {
          return json({ erro: ERRO_LOGIN }, 401);
        }
        const perms = conta.permissoes || [];
        dispararBackupAuto(); // backup diario piggyback (gateado por tempo)
        const token = await assinarJwt(
          { sub: conta.usuario, nome: conta.nome, master: false, perms },
          secret,
          EXP_SEG
        );
        return json({ token, usuario: conta.usuario, nome: conta.nome, permissoes: perms, master: false });
      }

      // ---------------- conferir o cracha (a tela chama no boot) ----------------
      case "eu": {
        const s = await sessaoDoPedido(req, secret);
        if (!s) return json({ erro: "Sessao invalida ou expirada." }, 401);
        return json({
          usuario: s.sub,
          nome: s.nome || s.sub,
          permissoes: s.perms || [],
          master: s.master === true,
        });
      }

      // ---------------- trocar a PROPRIA senha ----------------
      // Exige a senha atual: um cracha roubado nao pode tomar a conta.
      case "trocarMinhaSenha": {
        const s = await sessaoDoPedido(req, secret);
        if (!s?.sub) return json({ erro: "Entre no sistema para trocar sua senha." }, 401);
        const atual = String(body.senhaAtual || "");
        const nova = String(body.novaSenha || "");
        if (nova.length < 6) return json({ erro: "A nova senha precisa ter ao menos 6 caracteres." }, 400);

        const chave = normalizarUsuario(s.sub);
        const conta = await contas.get(chave, { type: "json" }).catch(() => null);
        const ehMaster = s.master === true;
        const confere = conta
          ? await conferirSenha(atual, conta)
          : ehMaster && !!process.env.AUTH_MASTER_SENHA && atual === process.env.AUTH_MASTER_SENHA;
        if (!confere) return json({ erro: "Senha atual incorreta." }, 401);

        const reg = await hashSenha(nova);
        await contas.setJSON(chave, {
          usuario: chave,
          nome: conta?.nome || (ehMaster ? "Direcao" : chave),
          permissoes: ehMaster ? ["*"] : conta?.permissoes || [],
          ...reg,
          atualizadoEm: new Date().toISOString(),
        });
        return json({ ok: true });
      }

      // ---------------- administrar acessos (so a direcao) ----------------
      case "listarContas": {
        if (!(await exigirMaster())) return json({ erro: "Apenas a direcao." }, 403);
        const { blobs } = await contas.list();
        const itens = await Promise.all(
          blobs.map((b) => contas.get(b.key, { type: "json" }).catch(() => null))
        );
        return json({
          contas: itens.filter(Boolean).map(publica),
          modulos: MODULOS,
          master: usuarioMaster(),
        });
      }

      case "salvarConta": {
        if (!(await exigirMaster())) return json({ erro: "Apenas a direcao." }, 403);
        const usuario = normalizarUsuario(body.usuario);
        const nome = String(body.nome || "").trim() || usuario;
        const senha = body.senha ? String(body.senha) : "";
        const permissoes = Array.isArray(body.permissoes)
          ? body.permissoes.filter((p) => p === "*" || MODULOS.includes(p))
          : [];
        if (!usuario) return json({ erro: "Informe o usuario." }, 400);
        if (usuario === usuarioMaster()) {
          return json({ erro: "A conta da direcao e definida pelo Netlify (AUTH_MASTER_SENHA)." }, 400);
        }

        const atual = await contas.get(usuario, { type: "json" }).catch(() => null);
        // Conta nova exige senha; conta existente pode ser editada sem trocar a
        // senha (o campo fica em branco = mantem a que ja tem).
        if (!atual && senha.length < 6) {
          return json({ erro: "Defina uma senha de ao menos 6 caracteres." }, 400);
        }
        if (senha && senha.length < 6) {
          return json({ erro: "A senha precisa ter ao menos 6 caracteres." }, 400);
        }
        const reg = senha ? await hashSenha(senha) : { hash: atual.hash, salt: atual.salt, iter: atual.iter };
        await contas.setJSON(usuario, {
          usuario,
          nome,
          permissoes,
          ...reg,
          atualizadoEm: new Date().toISOString(),
        });
        return json({ ok: true });
      }

      case "removerConta": {
        if (!(await exigirMaster())) return json({ erro: "Apenas a direcao." }, 403);
        const usuario = normalizarUsuario(body.usuario);
        if (!usuario) return json({ erro: "Informe o usuario." }, 400);
        if (usuario === usuarioMaster()) return json({ erro: "A conta da direcao nao pode ser removida." }, 400);
        await contas.delete(usuario);
        return json({ ok: true });
      }

      default:
        return json({ erro: `Acao desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[auth] erro:", e);
    return json({ erro: "Falha interna no login." }, 500);
  }
};
