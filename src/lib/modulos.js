// As partes do painel que dá para liberar por pessoa.
//
// ESPELHA a constante MODULOS de supabase/functions/painel-auth. O servidor
// filtra a lista recebida por ELA, em silêncio: um id que exista só aqui é
// descartado sem erro nenhum, e a tela mostra "salvo" sem ter concedido nada.
// Foi o que aconteceu com "gestao" por semanas. Módulo novo entra nos DOIS
// lugares ou não entra em nenhum.
//
// A ordem aqui é a ordem em que aparecem na tela: primeiro o que a direção usa
// todo dia, por último o que é de configuração.

export const MODULOS = [
  { id: "gestao", nome: "Gestão", sub: "identidade, plano do ano, táticas e atas — a tela de direção" },
  { id: "compromissos", nome: "Compromissos", sub: "a agenda de cada um — cada pessoa vê só a dela" },
  { id: "contas-atrasadas", nome: "Contas Atrasadas", sub: "quem deve e a cobrança" },
  { id: "orcamentos", nome: "Orçamentos", sub: "funil e conversão do time" },
  { id: "bancos", nome: "Bancos e Pix", sub: "contas, CNPJs e chaves de todas as empresas" },
  { id: "marketing", nome: "Marketing", sub: "logomarcas, materiais e atalhos do Drive" },
  { id: "licitacoes", nome: "Licitações", sub: "editais, prazos e sessões" },
  { id: "glossario", nome: "Glossário", sub: "os termos de comunicação visual explicados" },
  { id: "manutencoes", nome: "Manutenções", sub: "carros, máquinas e prédio: gasto e histórico" },
  { id: "patrimonio", nome: "Patrimônio", sub: "o que a empresa tem, por setor, com etiqueta e valor" },
  { id: "permutas", nome: "Permutas", sub: "o que o parceiro nos deu, as O.S. que ele já gastou e o saldo" },
  { id: "campanhas", nome: "Campanhas", sub: "quanto vendemos para cada evento e quem comprou" },
  { id: "configuracoes", nome: "Configurações", sub: "motivos, régua de cobrança e parâmetros — vale para todo mundo" },
];

// Módulos que mostram DINHEIRO. Não muda nada no servidor; serve para a tela
// avisar a direção do peso do que está marcando.
export const COM_DINHEIRO = new Set([
  "contas-atrasadas", "orcamentos", "bancos", "gestao",
  // Permuta mostra o crédito do parceiro, o valor de cada O.S. que ele gastou
  // e o saldo. Sem o aviso de R$, quem concede o módulo não vê que está
  // abrindo dinheiro — e o aviso existe justamente para isso.
  "permutas",
  // Campanha mostra o faturamento do evento e quanto CADA comprador gastou --
  // o que um concorrente pagaria para ver. Quem concede o módulo precisa saber
  // que está abrindo isso.
  "campanhas",
]);

// Ids que já foram módulos e não são mais (as telas saíram do menu e das rotas
// em "Painel: tirar Capa dos sistemas, Fluxo de Caixa e Produtos do menu").
// Contas antigas ainda carregam esses ids guardados; a tela precisa DESCARTAR na
// leitura, senão reenvia um id que o servidor não conhece e recebe um aviso de
// erro por algo que ela mesma mandou.
const APOSENTADOS = new Set(["fluxo-caixa", "produtos"]);

const CONHECIDOS = new Set(MODULOS.map((m) => m.id));

/** Só o que ainda existe. Curinga passa. */
export const somenteValidos = (perms) =>
  (Array.isArray(perms) ? perms : []).filter((p) => p === "*" || (CONHECIDOS.has(p) && !APOSENTADOS.has(p)));

export const nomeDoModulo = (id) =>
  MODULOS.find((m) => m.id === id)?.nome || id;
