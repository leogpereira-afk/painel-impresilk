// ============================================================================
// A REGRA DA SENHA, uma so para a casa inteira (contrato das senhas, 26/09/2026).
//
// Vale igual para "trocar a minha senha em todos os sistemas" (painel-auth),
// para "definir uma senha para esta pessoa" (painel-acesso) e para a senha que
// o servidor gera. Mora aqui, e nao em cada function, porque duas copias da
// mesma regra envelhecem separadas: uma aceita o que a outra recusa, e a pessoa
// fica com uma senha que abre uma porta e nao abre a outra.
//
// POR QUE ESTES NUMEROS
//   * minimo 6 CARACTERES: o minimo da painel-auth, da equipe-auth e do
//     GoTrue. Conta caractere (ponto de codigo), nao byte: "ééé" tem 6 bytes
//     e so 3 letras, e passaria no GoTrue sendo curta de verdade.
//   * maximo 72 BYTES: o bcrypt do Supabase Auth so olha os 72 primeiros.
//     Acima disso a MESMA senha valeria diferente no Auth (cortada) e no
//     PBKDF2 das nossas tabelas (inteira). A pessoa entraria por uma porta e
//     ouviria "senha incorreta" na outra.
//   * sem espaco nas pontas: quem copia de um aplicativo de mensagem leva o
//     espaco junto sem ver.
//
// NADA E APARADO NEM CORTADO CALADO. Ate aqui `texto(senha, 80)` tirava os
// espacos e cortava em 80: a senha gravada nao era a digitada, e ninguem
// sabia. O que fura a regra agora e RECUSADO, com o motivo.
// ============================================================================

export const SENHA_MINIMO = 6;
export const SENHA_MAXIMO_BYTES = 72;

export const MENSAGEM_SENHA = {
  curta: "A senha nova precisa ter ao menos 6 caracteres.",
  longa: "A senha nova pode ter no máximo 72 caracteres.",
  longaAcento: "A senha nova pode ter no máximo 72 caracteres (letra com acento conta dobrado).",
  pontas: "A senha não pode começar nem terminar com espaço.",
  igual: "A senha nova precisa ser diferente da atual.",
} as const;

const bytes = (s: string) => new TextEncoder().encode(s).length;

/** O que esta errado com a senha, ou null se ela serve. `atual`, quando vem,
 *  acrescenta a regra "diferente da atual" (so faz sentido na troca propria). */
export function problemaDaSenha(senha: unknown, atual?: string): string | null {
  if (typeof senha !== "string") return MENSAGEM_SENHA.curta;
  const caracteres = [...senha].length;
  if (caracteres < SENHA_MINIMO) return MENSAGEM_SENHA.curta;
  if (bytes(senha) > SENHA_MAXIMO_BYTES) {
    return caracteres > SENHA_MAXIMO_BYTES ? MENSAGEM_SENHA.longa : MENSAGEM_SENHA.longaAcento;
  }
  if (/^\s|\s$/.test(senha)) return MENSAGEM_SENHA.pontas;
  if (atual !== undefined && senha === atual) return MENSAGEM_SENHA.igual;
  return null;
}

/** A senha que veio no pedido, ou uma gerada quando nao veio nenhuma.
 *  Veio e fura a regra: recusa com o motivo (nunca apara nem corta). */
export function senhaPedida(v: unknown): { senha: string } | { erro: string } {
  if (v === undefined || v === null || v === "") return { senha: gerarSenha() };
  const furo = problemaDaSenha(v);
  return furo ? { erro: furo } : { senha: v as string };
}

/* UMA PESSOA POR CLIQUE, decisao do dono: nao existe troca de senha em massa.
   Lista, estrela, `usuarios` ou `todos` no corpo e recusado antes de qualquer
   leitura. Um laco feito por script, um corpo por pessoa, para no freio de
   lote da painel-acesso. */
export function pedidoEmLote(corpo: any): boolean {
  if (!corpo || typeof corpo !== "object") return false;
  const u = corpo.usuario;
  return Array.isArray(u) || (u !== null && typeof u === "object") ||
    (typeof u === "string" && /[*,;]/.test(u)) ||
    "usuarios" in corpo || "todos" in corpo;
}

// ---------------------------------------------------------- a senha gerada
// Legivel para ditar ao telefone: quem recebe consegue digitar sem errar.
// Trinta e duas palavras sem acento (o acento contaria dobrado no limite de
// bytes e confunde quem digita no celular).
export const PALAVRAS = ["pedra", "verde", "chuva", "campo", "vento", "folha", "porta",
  "praia", "monte", "peixe", "trilho", "barro", "vidro", "fogo", "areia", "nuvem",
  "raiz", "galho", "prego", "tinta", "lona", "placa", "risco", "molde", "corte",
  "serra", "regua", "farol", "ilha", "ponte", "muro", "telha"];

/* QUATRO palavras de 32 + tres digitos: 4 x 5 bits + log2(900) = cerca de 30
   bits. A versao anterior tinha tres palavras e o comentario dizia "~35 bits";
   a conta dava ~25 (3 x 5 + 9,8). A senha e provisoria, mas quem a recebe pode
   levar dias para trocar, e adivinhavel nesse meio-tempo e adivinhavel de
   verdade.
   Sorteio por rejeicao nos digitos: 2^32 nao divide por 900, e o resto
   favoreceria os numeros baixos. As palavras nao precisam (32 divide 2^32). */
function sorteio(limite: number): number {
  const teto = Math.floor(0x1_0000_0000 / limite) * limite;
  const caixa = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(caixa);
    if (caixa[0] < teto) return caixa[0] % limite;
  }
}

export function gerarSenha(): string {
  const palavras = Array.from({ length: 4 }, () => PALAVRAS[sorteio(PALAVRAS.length)]);
  return `${palavras.join("-")}-${100 + sorteio(900)}`;
}

// ------------------------------------------------ erro do Auth: qual dos dois
/* "Senha atual incorreta" e "o Auth nao respondeu" sao problemas OPOSTOS, e a
   versao anterior dizia a primeira frase para os dois: com o GoTrue fora do ar,
   a pessoa ouvia que errou uma senha que acertou, tentava de novo, e queimava
   o freio de tentativas contra si mesma.
   So e credencial errada quando o GoTrue RESPONDEU 400 dizendo isso. Rede
   caida (status 0), 5xx, 429 do proprio GoTrue, e-mail nao confirmado: tudo
   isso e "nao consegui conferir", e vira 503. */
export function falhaDeCredencial(erro: any): boolean {
  if (!erro) return false;
  const status = Number(erro.status ?? 0);
  const codigo = String(erro.code ?? erro.error_code ?? "");
  const texto = String(erro.message ?? "");
  return status === 400 && (codigo === "invalid_credentials" || codigo === "invalid_grant" ||
    /invalid login credentials/i.test(texto));
}

// ------------------------------------------------- motivo que pode ir a tela
/* O motivo de uma falha vai para a tela e para o log. Ele NUNCA pode levar a
   senha, o hash nem o sal. A senha nao chega ao banco (so o hash), mas uma
   mensagem de constraint do Postgres pode ecoar a linha inteira, e o hash
   dela junto. Sequencia longa de hexadecimal sai, a senha sai, e o texto e
   cortado em 200 (o tamanho que o log guarda). */
export function motivoSeguro(motivo: unknown, segredos: string[] = []): string {
  let s = String((motivo as any)?.message ?? motivo ?? "");
  for (const x of segredos) if (x) s = s.split(x).join("***");
  s = s.replace(/[0-9a-f]{16,}/gi, "***");
  return s.replace(/\s+/g, " ").trim().slice(0, 200) || "sem detalhe";
}
