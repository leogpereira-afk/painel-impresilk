// Contas bancarias, CNPJs e chaves Pix -- para consulta e copia no dia a dia.
//
// GEMEO: esta lista existe tambem no DRE (~/Projetos/impresilk-dre/app.js,
// const BANCOS). Mudou uma conta? Atualizar NOS DOIS. Os dados sao fixos de
// proposito: mudam poucas vezes por ano e a pagina precisa abrir na hora,
// inclusive sem rede.

export const BANCOS = [
  // Impresilk e Universo
  { grupo: "Impresilk e Universo", banco: "BTG 208",           titular: "Impresilk", doc: "20.789.673/0001-80", agencia: "1",    conta: "907063-6", pix: "5307f7f3-f4d1-4e82-8ba8-95ce448c194b", pixTipo: "Aleatoria" },
  { grupo: "Impresilk e Universo", banco: "Sicoob Credinor",   titular: "Impresilk", doc: "20.789.673/0001-80", agencia: "3144", conta: "16.814-9", pix: "20.789.673/0001-80", pixTipo: "CNPJ" },
  { grupo: "Impresilk e Universo", banco: "BNB",               titular: "Impresilk", doc: "20.789.673/0001-80", agencia: "34",   conta: "42501-4",  pix: "", pixTipo: "Conta e agencia" },
  { grupo: "Impresilk e Universo", banco: "BB",                titular: "Impresilk", doc: "20.789.673/0001-80", agencia: "1479-6", conta: "10541-4", pix: "", pixTipo: "Conta e agencia" },
  { grupo: "Impresilk e Universo", banco: "Sicoob Credinor",   titular: "Universo",  doc: "26.521.684/0001-60", agencia: "3144", conta: "90.028-1", pix: "26.521.684/0001-60", pixTipo: "CNPJ" },
  { grupo: "Impresilk e Universo", banco: "Sicoob Credinosso", titular: "Universo",  doc: "26.521.684/0001-60", agencia: "3327", conta: "5.136-5",  pix: "", pixTipo: "Conta e agencia" },
  // Leonardo Goncalves (PF)
  { grupo: "Leonardo Goncalves (PF)", banco: "BTG 208",                titular: "Leonardo Goncalves", doc: "078.565.336-84", agencia: "20",   conta: "908210-8",    pix: "11 972746113", pixTipo: "Telefone" },
  { grupo: "Leonardo Goncalves (PF)", banco: "BTG 208 - Investimento", titular: "Leonardo Goncalves", doc: "078.565.336-84", agencia: "1",    conta: "908210-8",    pix: "", pixTipo: "Conta e agencia" },
  { grupo: "Leonardo Goncalves (PF)", banco: "Itau",                   titular: "Leonardo Goncalves", doc: "078.565.336-84", agencia: "341",  conta: "",            pix: "9278fa29-e71e-48ed-b733-25ac3338d2c3", pixTipo: "Aleatoria" },
  { grupo: "Leonardo Goncalves (PF)", banco: "Caixa - Leo PF",         titular: "Leonardo Goncalves", doc: "078.565.336-84", agencia: "3115", conta: "580779854-2", pix: "07856533684", pixTipo: "CPF" },
  { grupo: "Leonardo Goncalves (PF)", banco: "Santander",              titular: "Leonardo Goncalves", doc: "078.565.336-84", agencia: "3504", conta: "01001895-6",  pix: "e5c64f17-642b-43bb-b5ef-1fdce9b52978", pixTipo: "Aleatoria" },
  // LGP
  { grupo: "LGP",  banco: "Sicoob Credinor",   titular: "LGP",      doc: "12.228.048/0001-30", agencia: "3144", conta: "47.892-0",    pix: "leonardo@fortemais.com", pixTipo: "E-mail" },
  { grupo: "LGP",  banco: "Sicoob Credinor",   titular: "LGP II",   doc: "12.228.048/0001-30", agencia: "3144", conta: "70.104-1",    pix: "12.228.048/0001-30", pixTipo: "CNPJ" },
  { grupo: "LGP",  banco: "Caixa - LGP",       titular: "LGP",      doc: "12.228.048/0001-30", agencia: "3115", conta: "578893015-0", pix: "1222804800130", pixTipo: "CNPJ" },
  // LG
  { grupo: "LG",   banco: "Sicoob Credinor",   titular: "LG",       doc: "50.788.526/0001-56", agencia: "3144", conta: "63.300-3",    pix: "50.788.526/0001-56", pixTipo: "CNPJ" },
  // Domo
  { grupo: "Domo", banco: "Sicoob Credinor",   titular: "SPE Domo", doc: "55.981.504/0001-21", agencia: "3144", conta: "74.188-4",    pix: "55.981.504/0001-21", pixTipo: "CNPJ" },
  { grupo: "Domo", banco: "Sicoob Credinor",   titular: "Domo",     doc: "55.941.523/0001-24", agencia: "3144", conta: "74.448-4",    pix: "55.941.523/0001-24", pixTipo: "CNPJ" },
  // Zeus
  { grupo: "Zeus", banco: "Sicoob Credinor",   titular: "Zeus",     doc: "37.571.480/0001-50", agencia: "3144", conta: "64.881-7",    pix: "37.571.480/0001-50", pixTipo: "CNPJ" },
  // Neon
  { grupo: "Neon", banco: "Sicoob Credinosso", titular: "Neon",     doc: "42.836.150/0001-80", agencia: "3327", conta: "8.342-9",     pix: "42.836.150/0001-80", pixTipo: "CNPJ" },
];
