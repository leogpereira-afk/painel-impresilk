/* TROCA DA PROPRIA SENHA: TUDO OU NADA, com uma costura que nao se desfaz.
   A entrada unica (Supabase Auth) fica fora da transacao do banco. Por isso a
   ordem: primeiro o Auth, depois o banco numa transacao so; se o banco recusar,
   a senha ATUAL volta para o Auth (ela e conhecida: acabou de ser conferida).
   Se ate isso falhar, a mensagem diz exatamente qual senha ficou valendo onde.
   O Auth nao recusou e o banco nao gravou: "nada mudou" e verdade.

   As mensagens sao as da tabela de erros do contrato (tela "Minha conta"). A
   de baixo nunca carrega o motivo cru: quem le a tela precisa saber o que
   fazer, e o motivo vai para o log (`causa`), ja sem senha nem hash. */
export const TROCA_NADA_MUDOU = "A troca não foi concluída. A sua senha anterior continua valendo em todos os sistemas.";
export const TROCA_SO_NA_ENTRADA = "A senha nova já vale na entrada pelo Painel, mas os outros sistemas ficaram com a anterior. Entre com a senha nova e repita a troca para terminar.";
export const TROCA_INCERTA = "Não consegui confirmar se a entrada pelo Painel recebeu a senha nova. Os outros sistemas continuam com a anterior. Entre com a anterior; se ela não abrir o Painel, entre com a nova e repita a troca.";

/* "O AUTH RECUSOU" TEM DOIS SENTIDOS, e so um deles e "nada mudou".
   Resposta 4xx: o GoTrue leu o pedido e disse nao (senha fraca, limite de
   pedidos). Nada foi gravado, e isso e certo. Rede caida, tempo esgotado ou
   5xx: o pedido pode ter sido gravado e so a resposta se perdeu no caminho.
   Dizer "a anterior continua valendo" ai era apostar, e perder a aposta deixa
   a pessoa com uma senha na entrada e outra no resto, ouvindo que nada mudou.
   Na duvida, a senha ATUAL e regravada na entrada (ela e conhecida); so
   quando isso da certo o "nada mudou" volta a ser verdade. */
export const recusaCerta = (e: unknown) => {
  const s = Number((e as any)?.status ?? 0);
  return s >= 400 && s < 500;
};

export class FalhaTroca extends Error {
  etapa: "auth" | "banco" | "compensacao";
  causa: string;
  constructor(mensagem: string, etapa: "auth" | "banco" | "compensacao", causa: unknown) {
    super(mensagem);
    this.etapa = etapa;
    this.causa = String((causa as any)?.message ?? causa ?? "");
  }
}

export async function trocarSenhaConsistente({aplicarAuth,salvarLegado,reporAuth}: {aplicarAuth?:()=>Promise<void>,salvarLegado:()=>Promise<void>,reporAuth?:()=>Promise<void>}) {
  if (aplicarAuth) {
    try { await aplicarAuth(); }
    catch (e) {
      if (!recusaCerta(e) && reporAuth) {
        try { await reporAuth(); }
        catch { throw new FalhaTroca(TROCA_INCERTA, "auth", e); }
      }
      throw new FalhaTroca(TROCA_NADA_MUDOU, "auth", e);
    }
  }
  try { await salvarLegado(); }
  catch (e) {
    if (reporAuth) {
      try { await reporAuth(); }
      catch (e2) { throw new FalhaTroca(TROCA_SO_NA_ENTRADA, "compensacao", e2); }
    }
    throw new FalhaTroca(TROCA_NADA_MUDOU, "banco", e);
  }
}
