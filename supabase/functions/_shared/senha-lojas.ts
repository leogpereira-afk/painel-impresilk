// ============================================================================
// AS LOJAS DE SENHA DE UMA PESSOA (contrato das senhas, 26/09/2026).
//
// "Loja" e cada lugar onde uma senha dela esta guardada e e conferida:
//   * a entrada unica: a identidade no Supabase Auth (E) e a guarda
//     `acesso_senha_legado`, para quem ainda nao migrou;
//   * o RH: a identidade (ou as identidades) do Supabase Auth ligadas a ficha;
//   * o Painel: `painel_contas`;
//   * Brief, PCP, Compras, POPs e V.O.F.: uma linha de `equipe_contas` cada.
//
// A PESSOA E A LINHA DE acesso_conta, e as lojas dela saem por ID
// (acesso_papel.conta_id, colaborador_id, auth_user_id), nunca por
// coincidencia de nome. A troca antiga gravava `equipe_contas where usuario =
// <nome da pessoa>`: o `leo` do PCP, que e o dono com o nome curto, nunca
// recebia a senha do `leonardo`, e a pessoa ficava com duas senhas sem saber.
//
// Duas metades, de proposito:
//   * `lojasDaPessoa` e PURA: recebe as linhas ja lidas e decide. E ela que os
//     testes exercitam sem banco (tests/senha-lojas.test.mjs).
//   * `lerLojas` faz as leituras e chama a pura. Leitura que falha LANCA: uma
//     loja que nao foi lida nao pode virar "a pessoa nao tem conta ali".
//
// A REGRA DO "LOGIN DESTA PESSOA NAQUELE SISTEMA" MORA AQUI (normalizar,
// alvoNoSistema, SO_LEITURA). Foi MOVIDA da painel-acesso, nao copiada: duas
// copias da mesma regra envelhecem separadas, e a troca de senha passaria a
// procurar a pessoa num login diferente do que a tela de Acessos mostra.
// ============================================================================

export const texto = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

// Mesma normalizacao do equipe-auth (e do painel-auth, e do RH): o login e a
// chave, entao tem de casar com acento, maiuscula e espaco sobrando. O `ç`
// decompoe em `c` + cedilha, e a cedilha esta na faixa apagada: e por isso
// que "Golçalves" casa com "golcalves" em perfis.
export const normalizar = (s: unknown): string =>
  String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

// O LOGIN DAQUELA PESSOA NAQUELE SISTEMA.
//
// Gravado em acesso_papel.login quando alguem o corrigiu pela tela; senao a
// regra antiga: no RH a chave e o NOME COMPLETO (perfis.usuario e casado com o
// nome da ficha do colaborador -- mandar "karen" criaria uma SEGUNDA conta ao
// lado da Karen Luiza de verdade), e nos outros e o usuario curto.
//
// A deducao continua valendo por omissao, mas ela e um PALPITE: quando erra,
// erra criando conta nova em vez de mexer na que existe. Por isso tudo que
// escreve confere `existeNoSistema` antes.
export const alvoNoSistema = (conta: any, sistema: string, papel?: any) => {
  /* NO RH A IDENTIDADE E A FICHA, e nao um login digitado -- por isso este ramo
     vem ANTES do login gravado. Casar por nome ja estava quebrado em producao,
     nao era risco futuro: `perfis` guarda "leonardo goncalves" sem cedilha e a
     Central guardava "Leonardo Gonçalves" com, e DUAS das seis linhas do RH nao
     casavam. Quem nao casa e tratado como "nao existe la" -- e ai a tela oferece
     criar conta para quem ja tem uma.
     `perfis.colaborador_id` e `acesso_conta.colaborador_id` apontam para a mesma
     ficha; comparados por id, casam seis de seis. O nome fica de rede para conta
     que ainda nao tenha id. */
  if (sistema === "rh") {
    return texto(conta.colaborador_id, 120) || texto(conta.colaborador, 160);
  }
  /* O DRE NAO TEM MAIS CONTA COM SENHA. Decisao do Leonardo em 18/08/2026: quem
     entra la entra pelo cracha do Painel, e a senha compartilhada (`equipe`) foi
     aposentada. O cracha carrega o USUARIO DA CONTA como `sub` -- nunca o login
     por sistema --, entao e o usuario que tem de casar. Obedecer a um login
     gravado aqui faria a tela procurar um nome que o cracha nao carrega. */
  if (sistema === "dre") return texto(conta.usuario, 60);
  const gravado = texto(papel?.login, 160);
  if (gravado) return gravado;
  return texto(conta.usuario, 60);
};

/* A Central nao se administra por aqui. Criar conta ou trocar senha nela cairia
   em equipe_contas pela equipe-auth -- que ainda nao tem "central" na lista
   EXTERNOS -- e fabricaria uma SEGUNDA senha, valida, para o app pessoal do
   dono. Enquanto o outro lado nao fecha, quem fecha e este. */
/* SO LEITURA: sistemas que esta tela MOSTRA mas NAO administra.
   `dre` entrou em 18/08/2026, junto com a aposentadoria da conta compartilhada.
   Sem isto o desenho ficava metade feito: `estadoReal` passou a ler o DRE pela
   linha de acesso, mas `senhaDoSistema` e `definirSenha` ainda achavam a linha e
   mandavam senha para a `equipe-auth`, que RECRIAVA em equipe_contas a conta com
   senha que acabara de ser apagada -- e a tela nao a enxergaria mais, porque o
   ramo novo nao le equipe_contas. Uma conta com senha, viva, invisivel. */
export const SO_LEITURA = new Set(["central", "dre", "bosques", "domo"]);

// Dos so-leitura, os que abrem PELA ENTRADA UNICA, com a mesma senha dela.
// Bosques e Domo moram em outro projeto do Supabase: a service_role do Painel
// nem enxerga aquele banco, e a senha de la se troca la dentro.
export const PELA_ENTRADA = new Set(["central", "dre"]);

// Os sistemas cuja senha mora em equipe_contas. Lista FECHADA: sistema que a
// troca nao conhece volta na resposta como "fora", com o nome, em vez de sumir
// calado (PADRAO-DOS-SISTEMAS, "filtro silencioso").
export const LOJAS_EQUIPE = new Set(["brief", "pcp", "compras", "pops", "vof"]);

/* QUEM OBRIGA A TROCAR NA PROXIMA ENTRADA quando a direcao define a senha.
   Painel (e Central e DRE, que so abrem por ele): com este contrato, a entrada
   devolve `trocarSenha` e a tela so abre "Minha conta". Brief, PCP, POPs e
   V.O.F. ja obrigam no login direto (`equipe_contas.trocar_senha`).
   Compras so mostra um aviso, e o RH nao tem marca nem tela de troca: mudar os
   dois e mexer nos repositorios deles. A tela diz isso a quem define. */
export const OBRIGA_TROCA: Record<string, boolean> = {
  painel: true, central: true, dre: true,
  brief: true, pcp: true, pops: true, vof: true,
  compras: false, rh: false,
};

// A ordem em que os sistemas aparecem na resposta (a mesma da lista fechada
// da painel-acesso). Sistema fora dela vai para o fim, sem sumir.
const ORDEM = ["painel", "rh", "pcp", "brief", "dre", "compras", "pops", "vof", "central", "bosques", "domo"];
const posicao = (s: string) => { const i = ORDEM.indexOf(s); return i < 0 ? ORDEM.length : i; };

export type Resultado = "trocada" | "pela-entrada" | "sem-conta" | "fora" | "falhou";
export type ItemSistema = {
  sistema: string;
  resultado: Resultado;
  login?: string;
  motivo?: string;
  aviso?: string;
  obriga?: boolean;
};

export type Lojas = {
  contaId: string | null;
  usuario: string | null;        // acesso_conta.usuario (a chave da pessoa)
  authUserId: string | null;     // E, a identidade da entrada unica
  equipe: { sistema: string; usuario: string }[];   // SO sistema e login: nada de papel
  painel: { usuario: string } | { usuario: string; criar: { nome: string; permissoes: string[] } } | null;
  rh: { userId: string; usuario: string }[];        // identidades do RH DIFERENTES de E
  rhUsuario: string | null;      // o login do RH (para o log), mesmo quando R = E
  sistemas: ItemSistema[];       // a previsao, na ordem de ORDEM
  // A entrada (E) desta pessoa e tambem de OUTRA pessoa: quem chama recusa com
  // 409 antes de gravar qualquer coisa. Null quando esta tudo certo.
  conflito: string | null;
};

export type EntradaLojas = {
  modo: "propria" | "direcao";
  conta: any | null;
  papeis: any[];
  equipe: { sistema: string; usuario: string }[];  // linhas que EXISTEM em equipe_contas
  painelConta: { usuario: string; nome?: string } | null;  // a linha do alvo no Painel, se existe
  painelAlvo: string;                               // (A) o sub do cracha; (B) o login dela no Painel
  perfis: { user_id: string; usuario: string; colaborador_id?: string | null }[];
  ehDirecao?: boolean;           // (A) so a direcao sem linha propria pode criar a do Painel
  nomeDirecao?: string;
  // As OUTRAS pessoas (acesso_conta e acesso_papel inteiros). Servem so para
  // uma coisa: nunca gravar numa loja que tambem e de outra pessoa.
  outras?: { contas: any[]; papeis: any[] };
  // O usuario da direcao. Login com esse nome, em qualquer sistema, e dela,
  // mesmo quando ela ainda nao tem linha em acesso_conta.
  direcao?: string;
};

/* LOJA QUE TAMBEM E DE OUTRA PESSOA NAO RECEBE SENHA.
   A troca antiga so mexia no nome da propria pessoa. Esta alcanca o RH pela
   ficha, a entrada pelo id e cada sistema pelo login apontado: o alcance
   cresceu, e junto cresceu o estrago de um vinculo errado. Uma ficha do RH
   escolhida errada na lista, ou um login apontado para a conta de outro, e a
   troca da PROPRIA senha de uma pessoa passaria a escolher a senha de outra
   (a da direcao inclusive, que tem duas identidades no RH e o `leo` no PCP).
   E "Definir senha" da direcao trocaria, sem ninguem ver, a senha de quem nao
   foi clicado.
   Por isso, antes de gravar: login que e o usuario de outra conta, ou o login
   apontado de outra conta naquele sistema, fica de fora; ficha do RH ligada a
   duas contas fica de fora; entrada dividida com outra conta trava a troca
   inteira (409). Tudo aparece na resposta, com o nome de quem divide, para a
   direcao corrigir o vinculo. Gravar em menos lugares e reparavel; gravar na
   senha de outra pessoa nao e. */
function donosDeFora(conta: any, outras?: { contas: any[]; papeis: any[] }, direcao?: string) {
  const contas = (outras?.contas ?? []).filter((o: any) => !conta || String(o.id) !== String(conta.id));
  const papeisDe = new Map<string, any[]>();
  for (const p of outras?.papeis ?? []) {
    const k = String(p.conta_id);
    if (conta && k === String(conta.id)) continue;
    papeisDe.set(k, [...(papeisDe.get(k) ?? []), p]);
  }
  const nome = (o: any) => texto(o.nome, 120) || texto(o.usuario, 60) || "outra pessoa";
  // De quem mais e o login `login` no sistema `sistema`?
  const chaveDirecao = normalizar(direcao);
  const souDirecao = !!chaveDirecao && normalizar(conta?.usuario) === chaveDirecao;
  const doLogin = (sistema: string, login: string): string | null => {
    const alvo = normalizar(login);
    if (!alvo) return null;
    if (chaveDirecao && !souDirecao && alvo === chaveDirecao) return "Direção";
    for (const o of contas) {
      if (normalizar(o.usuario) === alvo) return nome(o);
      const p = (papeisDe.get(String(o.id)) ?? []).find((x: any) => x.sistema === sistema);
      if (p && normalizar(alvoNoSistema(o, sistema, p)) === alvo) return nome(o);
    }
    return null;
  };
  // De quem mais e esta identidade do Supabase Auth (a entrada de outra conta)?
  const daIdentidade = (id: string | null): string | null => {
    if (!id) return null;
    const o = contas.find((x: any) => x.auth_user_id && String(x.auth_user_id) === String(id));
    return o ? nome(o) : null;
  };
  // Quem mais esta ligado a MESMA ficha do RH (ou ao mesmo nome, sem ficha)?
  const daFicha = (c: any): string | null => {
    const ficha = texto(c?.colaborador_id, 120);
    const nomeRh = normalizar(c?.colaborador);
    const o = contas.find((x: any) => ficha
      ? texto(x.colaborador_id, 120) === ficha
      : (!!nomeRh && normalizar(x.colaborador) === nomeRh));
    return o ? nome(o) : null;
  };
  const daFichaPorId = (ficha: string): string | null => {
    if (!ficha) return null;
    const o = contas.find((x: any) => texto(x.colaborador_id, 120) === ficha);
    return o ? nome(o) : null;
  };
  return { doLogin, daIdentidade, daFicha, daFichaPorId };
}

/** Os perfis do RH desta pessoa: pela ficha (colaborador_id) quando a conta
 *  tem uma; senao pelo nome, a mesma rede que a painel-acesso ja usa. */
export function perfisDaPessoa(conta: any, perfis: { user_id: string; usuario: string; colaborador_id?: string | null }[]) {
  if (!conta) return { perfis: [], pelaFicha: false };
  const ficha = texto(conta.colaborador_id, 120);
  const nomeRh = normalizar(conta.colaborador);
  const achados = (perfis ?? []).filter((p) =>
    ficha ? texto(p.colaborador_id, 120) === ficha : (!!nomeRh && normalizar(p.usuario) === nomeRh));
  return { perfis: achados, pelaFicha: !!ficha };
}

/** A decisao, sem banco: quais lojas recebem a senha e o que dizer de cada sistema. */
export function lojasDaPessoa(e: EntradaLojas): Lojas {
  const conta = e.conta ?? null;
  const papeis = conta ? (e.papeis ?? []) : [];
  const itens: ItemSistema[] = [];
  const equipe: Lojas["equipe"] = [];
  // Sem acesso_conta (so o Painel, pelo proprio cracha) nao ha com quem dividir.
  const fora = conta ? donosDeFora(conta, e.outras, e.direcao) : null;
  const deOutro = (sistema: string, login: string) => fora?.doLogin(sistema, login) ?? null;
  const dividido = (login: string, dono: string) =>
    `o login "${login}" também é de ${dono}; aponte cada pessoa para a própria conta`;

  // ------------------------------------------------------------ o Painel
  let painel: Lojas["painel"] = null;
  const alvoPainel = normalizar(e.painelAlvo);
  const papelPainel = papeis.find((p: any) => p.sistema === "painel");
  const donoPainel = alvoPainel ? deOutro("painel", alvoPainel) : null;
  if (donoPainel && (e.painelConta || papelPainel || e.modo === "propria")) {
    itens.push({ sistema: "painel", resultado: "sem-conta", login: alvoPainel, motivo: dividido(alvoPainel, donoPainel) });
  } else if (alvoPainel && e.painelConta && normalizar(e.painelConta.usuario) === alvoPainel) {
    painel = { usuario: e.painelConta.usuario };
    itens.push({ sistema: "painel", resultado: "trocada", login: e.painelConta.usuario });
  } else if (alvoPainel && e.modo === "propria" && e.ehDirecao) {
    /* A UNICA CONTA QUE NASCE AQUI e a da direcao, e so na troca dela mesma:
       enquanto ela usa a senha inicial do ambiente, nao ha linha em
       painel_contas. Nenhuma outra pessoa ganha conta por trocar senha. */
    painel = { usuario: alvoPainel, criar: { nome: texto(e.nomeDirecao, 120) || "Direção", permissoes: ["*"] } };
    itens.push({ sistema: "painel", resultado: "trocada", login: alvoPainel });
  } else if (alvoPainel && (e.modo === "propria" || papelPainel)) {
    itens.push({ sistema: "painel", resultado: "sem-conta", login: alvoPainel, motivo: `não existe conta "${alvoPainel}" no Painel` });
  }

  // ---------------------------------------------------------------- o RH
  /* TODAS as identidades ligadas a ficha: o dono tem mais de uma (o RH cria
     uma por grafia digitada). Sem ficha na conta, a rede e o nome, a mesma que
     a painel-acesso ja usa, e a resposta avisa que achou pelo nome. */
  const { perfis, pelaFicha } = perfisDaPessoa(conta, e.perfis);
  const ids = [...new Set(perfis.map((p) => String(p.user_id)).filter(Boolean))];
  const E = conta?.auth_user_id ? String(conta.auth_user_id) : null;
  const papelRh = papeis.some((p: any) => p.sistema === "rh");

  /* A ENTRADA DIVIDIDA TRAVA TUDO. Se a identidade do Auth desta pessoa e a
     entrada de outra conta, ou a identidade do RH de uma ficha ligada a outra
     conta, trocar a senha dela troca a da outra pessoa na porta que abre
     todos. Nao ha "gravar so no resto" que seja honesto aqui. */
  let conflito: string | null = null;
  if (E && fora) {
    const dono = fora.daIdentidade(E);
    if (dono) conflito = `a entrada desta pessoa é a mesma de ${dono}`;
    if (!conflito) {
      const minhaFicha = texto(conta?.colaborador_id, 120);
      for (const p of e.perfis ?? []) {
        const ficha = texto(p.colaborador_id, 120);
        if (String(p.user_id) !== E || !ficha || ficha === minhaFicha) continue;
        const outro = fora.daFichaPorId(ficha);
        if (outro) { conflito = `a entrada desta pessoa é a identidade do RH de ${outro}`; break; }
      }
    }
  }

  // O RH dividido com outra conta fica de fora inteiro: nao ha como saber
  // quais identidades da ficha sao desta pessoa e quais sao da outra.
  const rhDividido = fora && (ids.length || papelRh)
    ? (fora.daFicha(conta) ?? ids.map((id) => fora.daIdentidade(id)).find(Boolean) ?? null)
    : null;
  const rh = rhDividido ? [] : ids.filter((id) => id !== E)
    .map((id) => ({ userId: id, usuario: String(perfis.find((p) => String(p.user_id) === id)?.usuario ?? "") }));
  const rhUsuario = perfis.length ? String(perfis[0].usuario ?? "") : null;
  if (rhDividido) {
    itens.push({ sistema: "rh", resultado: "sem-conta", motivo: `a ficha do RH desta pessoa também está ligada a ${rhDividido}; corrija o vínculo` });
  } else if (ids.length) {
    itens.push({
      sistema: "rh", resultado: "trocada",
      ...(pelaFicha ? {} : { aviso: "achado pelo nome: a conta não está ligada a uma ficha do RH" }),
    });
  } else if (papelRh) {
    itens.push({ sistema: "rh", resultado: "sem-conta", motivo: "não achei o perfil desta pessoa no RH" });
  }

  // ------------------------------------------------- os outros sistemas
  const vistos = new Set<string>();
  for (const p of papeis) {
    const sistema = String(p.sistema ?? "");
    if (sistema === "painel" || sistema === "rh" || vistos.has(sistema)) continue;
    vistos.add(sistema);
    if (PELA_ENTRADA.has(sistema)) {
      itens.push({ sistema, resultado: "pela-entrada" });
      continue;
    }
    /* SISTEMA APOSENTADO NAO GANHA SENHA NOVA. A regra SO_LEITURA valia
       em senhaDoSistema e no definirSenha antigo nao: "gerar senha em TODOS"
       para quem tem papel no DRE mandava salvarConta com senha a equipe-auth,
       que ACEITAVA, ressuscitando uma credencial viva e invisivel no sistema
       que a direcao aposentou em 18/08. Os numeros financeiros da casa atras
       de uma senha que ninguem sabia que existia. (Central e DRE ficam acima,
       como "pela entrada"; aqui sobram Bosques e Domo.) */
    if (SO_LEITURA.has(sistema)) {
      itens.push({ sistema, resultado: "fora", motivo: "senha própria, fora do Painel" });
      continue;
    }
    if (!LOJAS_EQUIPE.has(sistema)) {
      itens.push({ sistema, resultado: "fora", motivo: "sistema que a troca de senha não conhece" });
      continue;
    }
    const login = alvoNoSistema(conta, sistema, p);
    const donoDoLogin = deOutro(sistema, login);
    if (donoDoLogin) {
      itens.push({ sistema, resultado: "sem-conta", login, motivo: dividido(login, donoDoLogin) });
      continue;
    }
    const achada = (e.equipe ?? []).find((l) => l.sistema === sistema && normalizar(l.usuario) === normalizar(login));
    if (!achada) {
      /* NUNCA SE CRIA CONTA AQUI. Este era o pior efeito da divergencia: quando
         o login nao existia no sistema, a equipe-auth recebia senha junto e
         CRIAVA uma conta com aquele nome. O dono clicava "gerar nova senha",
         a tela dizia que deu certo nos sete, e a conta que ele usa de verdade
         (`leo`, no PCP) continuava com a senha velha, agora com uma sosia
         `leonardo` ao lado. Trocar senha e UPDATE de quatro colunas: quem nao
         existe la fica de fora, com o nome do login que faltou, e a direcao
         aponta a pessoa para a conta certa na tela. */
      itens.push({ sistema, resultado: "sem-conta", login, motivo: `não existe conta "${login}" ali` });
      continue;
    }
    equipe.push({ sistema, usuario: achada.usuario });
    itens.push({ sistema, resultado: "trocada", login: achada.usuario });
  }

  itens.sort((a, b) => posicao(a.sistema) - posicao(b.sistema));
  return {
    contaId: conta?.id ?? null,
    usuario: conta?.usuario ?? null,
    authUserId: E,
    equipe,
    painel,
    rh,
    rhUsuario,
    sistemas: itens,
    conflito,
  };
}

/* Leitura que falhou nao e "nao tem". Esta classe separa as duas coisas: quem
   chama devolve 503 ("tente de novo") em vez de trocar a senha num pedaco das
   lojas e dizer que foi em todas. */
export class FalhaLeitura extends Error {}

async function ler(consulta: any) {
  const r = await consulta;
  if (r?.error) throw new FalhaLeitura("não consegui ler as contas agora");
  return r.data;
}

/** Faz as leituras e chama a pura. `papeis` pode vir pronto (a painel-acesso
 *  ja os leu para recusar pessoa sem acesso), para nao ler duas vezes. */
export async function lerLojas(sb: any, o: {
  modo: "propria" | "direcao";
  conta: any | null;
  papeis?: any[];
  painelAlvo?: string;
  ehDirecao?: boolean;
  nomeDirecao?: string;
  direcao?: string;
}): Promise<Lojas> {
  const conta = o.conta ?? null;
  const papeis = !conta ? [] : (o.papeis ?? (await ler(sb.from("acesso_papel").select("*").eq("conta_id", conta.id))) ?? []);
  const sistemasEquipe = [...new Set(papeis.map((p: any) => String(p.sistema)).filter((s: string) => LOJAS_EQUIPE.has(s)))];
  const equipe = sistemasEquipe.length
    ? (await ler(sb.from("equipe_contas").select("sistema, usuario").in("sistema", sistemasEquipe))) ?? []
    : [];
  const papelPainel = papeis.find((p: any) => p.sistema === "painel");
  // (A) o dono do cracha; (B) o login dela no Painel (o gravado, ou o usuario).
  const painelAlvo = normalizar(o.painelAlvo ?? (conta ? alvoNoSistema(conta, "painel", papelPainel) : ""));
  const painelConta = painelAlvo
    ? (await ler(sb.from("painel_contas").select("usuario, nome").eq("usuario", painelAlvo).maybeSingle())) ?? null
    : null;
  // Os perfis do RH sempre que ha pessoa: alem de achar o RH dela, servem para
  // saber se a entrada dela e a identidade do RH de outra ficha.
  const perfis = conta
    ? (await ler(sb.from("perfis").select("user_id, usuario, colaborador_id"))) ?? []
    : [];
  // As outras pessoas e os logins apontados delas: loja que tambem e de outra
  // pessoa nao recebe senha (ver donosDeFora). Tabelas pequenas, uma leitura.
  const outras = conta
    ? {
        contas: (await ler(sb.from("acesso_conta").select("id, usuario, nome, auth_user_id, colaborador_id, colaborador"))) ?? [],
        papeis: (await ler(sb.from("acesso_papel").select("conta_id, sistema, login"))) ?? [],
      }
    : undefined;
  return lojasDaPessoa({
    modo: o.modo, conta, papeis, equipe, painelConta, painelAlvo, perfis,
    ehDirecao: o.ehDirecao, nomeDirecao: o.nomeDirecao, outras, direcao: o.direcao,
  });
}

/** A senha de UM sistema (senhaDoSistema): o login dela ali tambem e de outra
 *  pessoa? Devolve o nome de quem divide, ou null. No RH a pergunta e a ficha.
 *  Leitura que falha lanca FalhaLeitura (nao e "ninguem divide"). */
export async function lojaDeOutro(sb: any, conta: any, sistema: string, login: string, direcao?: string): Promise<string | null> {
  const outras = {
    contas: (await ler(sb.from("acesso_conta").select("id, usuario, nome, auth_user_id, colaborador_id, colaborador"))) ?? [],
    papeis: (await ler(sb.from("acesso_papel").select("conta_id, sistema, login"))) ?? [],
  };
  const fora = donosDeFora(conta, outras, direcao);
  if (sistema !== "rh") return fora.doLogin(sistema, login);
  const ficha = fora.daFicha(conta);
  if (ficha) return ficha;
  // No RH a gravacao acha o perfil pelo NOME (rhSalvar da equipe-auth): se
  // esse perfil, ou um da ficha dela, for a entrada de outra conta, a senha
  // nova seria a da outra pessoa na porta que abre todos.
  const perfis = (await ler(sb.from("perfis").select("user_id, usuario, colaborador_id"))) ?? [];
  const alvo = normalizar(login);
  const candidatos = [...perfis.filter((p: any) => normalizar(p.usuario) === alvo), ...perfisDaPessoa(conta, perfis).perfis];
  for (const p of candidatos) {
    const dono = fora.daIdentidade(String(p.user_id));
    if (dono) return dono;
  }
  return null;
}

// ------------------------------------------------------------ o que dizer
/* Uma linha de log por loja ALCANCADA, com o login DAQUELA pessoa NAQUELE
   sistema: assim o historico de cada sistema mostra a troca, e o `por` diz
   quem trocou. Nunca a senha, o hash ou o sal. */
export function linhasDoLog(lojas: Lojas, sistemas: ItemSistema[], o: { entrada: boolean; por: string; detalhe: string }) {
  const linhas: { p_sistema: string; p_usuario: string; p_acao: string; p_por: string; p_detalhe: string }[] = [];
  if (o.entrada && lojas.usuario) {
    linhas.push({ p_sistema: "*", p_usuario: lojas.usuario, p_acao: "trocou-senha", p_por: o.por, p_detalhe: o.detalhe });
  }
  for (const item of sistemas) {
    if (item.resultado !== "trocada" && item.resultado !== "falhou") continue;
    const usuario = item.sistema === "rh" ? (lojas.rhUsuario ?? lojas.usuario ?? "") : (item.login ?? "");
    if (!usuario) continue;
    linhas.push(item.resultado === "trocada"
      ? { p_sistema: item.sistema, p_usuario: usuario, p_acao: "trocou-senha", p_por: o.por, p_detalhe: o.detalhe }
      : { p_sistema: item.sistema, p_usuario: usuario, p_acao: "troca-falhou", p_por: o.por, p_detalhe: String(item.motivo ?? "").slice(0, 200) });
  }
  return linhas;
}
