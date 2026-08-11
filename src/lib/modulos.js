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
  { id: "fluxo-caixa", nome: "Fluxo de Caixa", sub: "caixa, projeção e realizado" },
  { id: "produtos", nome: "Produtos", sub: "faturamento por produto e família" },
  { id: "orcamentos", nome: "Orçamentos", sub: "funil e conversão do time" },
  { id: "bancos", nome: "Bancos e Pix", sub: "contas, CNPJs e chaves de todas as empresas" },
  { id: "marketing", nome: "Marketing", sub: "logomarcas, materiais e atalhos do Drive" },
  { id: "licitacoes", nome: "Licitações", sub: "editais, prazos e sessões" },
  { id: "glossario", nome: "Glossário", sub: "os termos de comunicação visual explicados" },
  { id: "manutencoes", nome: "Manutenções", sub: "carros, máquinas e prédio: gasto e histórico" },
  { id: "patrimonio", nome: "Patrimônio", sub: "o que a empresa tem, por setor, com etiqueta e valor" },
  { id: "configuracoes", nome: "Configurações", sub: "motivos, régua de cobrança e parâmetros — vale para todo mundo" },
];

// Módulos que mostram DINHEIRO. Não muda nada no servidor; serve para a tela
// avisar a direção do peso do que está marcando.
export const COM_DINHEIRO = new Set([
  "contas-atrasadas", "fluxo-caixa", "produtos", "orcamentos", "bancos", "gestao",
]);

export const nomeDoModulo = (id) =>
  MODULOS.find((m) => m.id === id)?.nome || id;
