// OS SISTEMAS DA CASA, NUM LUGAR SO.
//
// POR QUE ESTE ARQUIVO EXISTE
// Tudo que a tela de Sistemas de Acessos precisa saber sobre um sistema estava
// espalhado em seis constantes, quatro delas no mesmo componente: NOME_SISTEMA,
// ENDERECO, PAPEIS, PAPEL_INICIAL, SO_LEITURA e a lista `SISTEMAS` do servidor.
// Sistema novo obrigava a lembrar dos seis -- e esquecer um nao dava erro:
// aparecia sem nome, ou sem papel para escolher, ou administravel quando nao
// devia. Foi assim que a Central do Leo passou semanas oferecendo "Criar a
// conta la" para um sistema que nao tem onde criar conta.
//
// Em 17/08/2026 vieram para ca mais duas cópias que tinham ficado para tras: as
// chaves de cracha e enderecos de entradaUnica.js, e uma lista de nomes em
// pages/Acessos.jsx que parara em CINCO sistemas -- por isso a tabela de backup
// mostrava "compras" e "pops" em minusculo ao lado de "Painel de Gestao".
// Ninguem quebrou nada: a copia so envelheceu calada, que e como esse defeito
// sempre chega.
//
// AGORA E UM BLOCO POR SISTEMA. Para acrescentar o proximo, copie um bloco
// daqui, preencha, e a tela inteira passa a conhece-lo. O que ainda precisa ser
// feito FORA daqui esta na lista no fim do arquivo -- leia antes, e depois rode
// `node painel/scripts/conferir-sistemas.mjs`, que reprova o que faltar.
//
// A ORDEM IMPORTA: e a ordem em que os sistemas aparecem na tela.

export const SISTEMAS = [
  {
    id: "painel",
    nome: "Painel",
    nomeCompleto: "Painel de Gestão",
    // Onde o sistema mora, para abrir dali mesmo.
    url: "https://impresilk.com.br/painel",
    // A pagina DE DENTRO do sistema onde se administra quem entra nele. Nem
    // todos tem uma alcancavel por link: os apps vanilla da casa sao telas
    // unicas com abas, e a de acesso mora dentro de Configuracoes, sem endereco
    // proprio. Quando nao ha link, `caminho` diz onde clicar -- e dizer isso e
    // melhor do que oferecer um link que cai na porta da frente e deixa a
    // pessoa procurando.
    acessos: { url: "https://impresilk.com.br/painel/acessos", caminho: "" },
    // O painel nao usa papel: quem manda la e a lista de modulos (permissoes).
    papeis: [],
    papelInicial: "",
    /* A equipe-auth guarda um papel DE FACHADA ("tudo") so para o Painel caber
       na tabela dela -- ninguem faz login por aquela funcao aqui. Declarar a
       fachada torna a excecao um DADO, e nao um "if (id === painel)" escondido
       no conferidor. E impede o conserto errado: alguem que visse a acusacao de
       divergencia poderia copiar "tudo" para ca, e a tela passaria a oferecer um
       papel que o Painel nao entende. */
    papelDeFachada: "tudo",
    // Sistemas que esta tela MOSTRA mas nao administra.
    soLeitura: false,
    /* SEM `entradaUnica` DE PROPOSITO. O Painel e quem PLANTA os crachas dos
       outros; nao planta em si mesmo. E `meusSistemas()` monta os atalhos
       filtrando por quem tem `endereco` -- dar um ao Painel poria um atalho
       para o Painel dentro do proprio Painel. */
  },
  {
    id: "rh",
    nome: "RH",
    url: "https://impresilk.com.br/rh",
    acessos: { url: "https://impresilk.com.br/rh/painel-controle", caminho: "aba Usuários e Permissões" },
    papeis: ["ADMIN_RH", "GESTOR", "COLABORADOR"],
    papelInicial: "COLABORADOR",
    soLeitura: false,
    /* ENDERECO SIM, CHAVE NAO -- e isto e desenho, nao esquecimento. No RH o
       cracha e a sessao do proprio Supabase Auth, que o Painel nao sabe
       fabricar. O atalho leva a pessoa ate a porta e ela digita a senha uma vez
       la. Sem `endereco` ela nem veria o atalho. */
    entradaUnica: { endereco: "https://leogpereira-afk.github.io/impresilkrh/" },
  },
  {
    id: "pcp",
    nome: "PCP",
    url: "https://impresilk.com.br/pcp",
    acessos: { url: "", caminho: "Configurações → Acessos" },
    papeis: ["admin", "pcp", "montagem", "operacao", "comercial"],
    papelInicial: "montagem",
    soLeitura: false,
    /* ENTRADA UNICA: `chave` e o nome da gaveta do localStorage que ESTE app ja
       le -- errar aqui deixa a pessoa na tela de login sem explicacao nenhuma.
       `endereco` e o github.io DIRETO, nunca o atalho impresilk.com.br: o
       atalho ainda sai por http e o 302 desceria a pessoa de HTTPS para HTTP no
       caminho. Sistema sem `endereco` nao aparece nos atalhos de "Meus
       sistemas"; sem `chave` nao recebe cracha plantado. */
    entradaUnica: { endereco: "https://leogpereira-afk.github.io/impresilk/", chave: "impresilk_inst_cracha" },
  },
  {
    id: "brief",
    // `nome` e o curto, que cabe na coluna da tabela de acessos; `nomeCompleto`
    // e como a casa chama o sistema, e e ele que vai na lateral e nos avisos.
    nome: "Brief",
    nomeCompleto: "Brief de Medição",
    url: "https://impresilk.com.br/brief",
    acessos: { url: "", caminho: "Configurações → Equipe" },
    papeis: ["vendedor", "designer", "medidor", "admin"],
    papelInicial: "medidor",
    soLeitura: false,
    entradaUnica: { endereco: "https://leogpereira-afk.github.io/brief-medicao/", chave: "app_sync_cracha" },
  },
  {
    id: "dre",
    nome: "DRE",
    url: "https://impresilk.com.br/dre",
    // O DRE e uma PORTA, nao um quadro de gente: uma senha da equipe. Nao ha
    // pagina de acessos la dentro, e isso e desenho.
    acessos: { url: "", caminho: "não tem — o DRE é uma porta só, e a senha se troca por aqui" },
    papeis: ["equipe"],
    papelInicial: "equipe",
    soLeitura: false,
    entradaUnica: { endereco: "https://leogpereira-afk.github.io/impresilk-dre/", chave: "impresilk_dre_cracha" },
  },
  {
    id: "compras",
    nome: "Compras",
    url: "https://impresilk.com.br/compras",
    acessos: { url: "", caminho: "Configurações → Acessos" },
    papeis: ["admin", "comprador", "solicitante"],
    papelInicial: "solicitante",
    soLeitura: false,
    entradaUnica: { endereco: "https://leogpereira-afk.github.io/impresilk-compras/", chave: "compras_cracha" },
  },
  {
    id: "pops",
    nome: "POPs",
    nomeCompleto: "Pops & Fabricação",
    url: "https://impresilk.com.br/pops",
    acessos: { url: "", caminho: "Configurações → Pessoas" },
    papeis: ["admin", "gestor", "equipe"],
    papelInicial: "equipe",
    soLeitura: false,
    entradaUnica: { endereco: "https://leogpereira-afk.github.io/pops-fabricacao/", chave: "pops_cracha" },
  },
  {
    id: "central",
    nome: "Central do Léo",
    // App pessoal do dono: nao tem atalho no dominio da empresa.
    url: "https://leogpereira-afk.github.io/vida-leo/",
    acessos: { url: "", caminho: "não se administra por aqui — porta própria (leo-sync)" },
    papeis: ["dono"],
    papelInicial: "dono",
    /* SO LEITURA. A Central nao mora em equipe_contas: criar conta ou trocar
       senha nela por esta tela fabricaria uma SEGUNDA senha, valida, para o app
       pessoal do dono. O servidor recusa igual (SO_LEITURA em painel-acesso) --
       fechar so aqui seria o mesmo desencontro que esta tela existe para
       acabar. */
    soLeitura: true,
    // App pessoal do dono, nao sistema da empresa: o atalho na lateral so
    // aparece para a direcao.
    pessoal: true,
    /* SO LEITURA e mesmo assim ENTRA na entrada unica: o dono entra no Painel e
       a Central abre junto. So-leitura vale para ADMINISTRAR (criar conta,
       trocar senha por aqui), nao para entrar. */
    entradaUnica: { endereco: "https://leogpereira-afk.github.io/vida-leo/", chave: "cl_token" },
  },
];

const POR_ID = new Map(SISTEMAS.map((s) => [s.id, s]));

/* Sistema que o servidor devolve e este arquivo nao conhece NAO some da tela:
   ele aparece com o proprio id como nome e sem papel para escolher. Sumir seria
   o pior dos mundos -- gente com acesso, invisivel. Aparecer torto e visivel, e
   quem olha percebe que falta cadastrar aqui. */
export const doSistema = (id) =>
  POR_ID.get(id) || {
    id, nome: id, url: "", acessos: { url: "", caminho: "" },
    papeis: [], papelInicial: "", soLeitura: false,
  };

export const nomeSis = (id) => doSistema(id).nome;
// Como a casa chama o sistema por extenso. Cai no curto quando os dois sao
// iguais -- so tres tem nome de dois tamanhos.
export const nomeCompletoSis = (id) => {
  const s = doSistema(id);
  return s.nomeCompleto || s.nome;
};

/* OS MAPAS DA ENTRADA UNICA, DERIVADOS DAQUI -- nao escritos a mao em outro
   arquivo. Ate 17/08/2026 `entradaUnica.js` tinha as tres listas (chave,
   endereco, nome) copiadas, e `pages/Acessos.jsx` tinha uma QUARTA copia dos
   nomes -- essa parada em cinco sistemas, entao a tabela de backup mostrava
   "compras" e "pops" em minusculo enquanto as outras linhas tinham nome de
   gente. Ninguem quebrou nada; a copia so envelheceu calada, que e como esse
   defeito sempre chega. */
export const CHAVE_CRACHA = Object.fromEntries(
  SISTEMAS.filter((s) => s.entradaUnica?.chave).map((s) => [s.id, s.entradaUnica.chave]),
);
export const ENDERECO_DIRETO = Object.fromEntries(
  SISTEMAS.filter((s) => s.entradaUnica?.endereco).map((s) => [s.id, s.entradaUnica.endereco]),
);

/* PARA ACRESCENTAR UM SISTEMA NOVO, o bloco aqui em cima e o primeiro passo --
   e nao e o unico. Os outros, na ordem:

   1. `SISTEMAS` em painel/supabase/functions/painel-acesso/index.ts
      (lista fechada; id fora dela e recusado com "Sistema desconhecido").
   2. `SISTEMAS` e `PAPEIS` em vida-leo/supabase/functions/equipe-auth/index.ts
      -- e a CHECK constraint da coluna `sistema` em equipe_contas, no banco,
      senao a primeira conta criada devolve erro 500 sem explicacao.
   3. Se o sistema tiver elenco proprio (gente que ele conhece alem das contas),
      o ramo que le esse elenco em painel-acesso/listar.
   4. Se ele espelhar o elenco na propria config, `TAB_CFG` na equipe-auth.
   5. O secret SISTEMAS_BACKUP do Painel -- sem ele o backup diario nao cobre o
      sistema novo, e nada na tela denuncia a falta.

   (A chave de localStorage do cracha e o endereco SAIRAM desta lista em
   17/08/2026: agora sao o campo `entradaUnica` do bloco aqui em cima, e
   entradaUnica.js os LE daqui em vez de ter copia propria.)

   Os papeis aqui sao COPIA FIEL da lista fechada do equipe-auth. O servidor
   valida com includes(), sem normalizar: papel que nao esta la e recusado, e
   papel gravado so na tabela consolidada (que nao tem CHECK) nao e recusado por
   ninguem e simplesmente nao funciona em lugar nenhum. Ao mexer, confira na
   origem -- esta lista JA ESTEVE ERRADA (compras tinha os papeis do app antigo,
   e pops nao tinha gestor).

   E DEPOIS DE MEXER, RODE O CONFERIDOR:

       node painel/scripts/conferir-sistemas.mjs

   Ele compara este arquivo com as duas listas fechadas (painel-acesso e
   equipe-auth) e com os papeis, e REPROVA apontando o que falta. Os passos 3 e
   5 acima moram fora do codigo -- ele nao os alcanca, e diz isso na saida em
   vez de fingir que conferiu. */
