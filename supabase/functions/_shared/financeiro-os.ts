import { numerosDeOSComercial } from "./vinculo-financeiro-os.mjs";

export async function financeiroDasOS(pedidos: Set<string>, ids: string[], { sb, lerCacheComData }: { sb: any, lerCacheComData: (chave: string) => Promise<any> }) {
  const [rec, pag] = await Promise.all([
    lerCacheComData("recebiveis"), lerCacheComData("recebidos_os"),
  ]);
  if (!Array.isArray(rec.valor) || !pag.valor?.titulos) {
    throw new Error("Fontes de recebimentos indisponíveis para conciliar vendas");
  }

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
  const numerosDo = numerosDeOSComercial;
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
    const { data, error } = await sb.from("painel_ordens")
      .select("numero, valor").in("numero", lista.slice(i, i + 500));
    if (error) throw new Error("Não foi possível conferir os valores das O.S.");
    for (const o of data ?? []) valorDaOS.set(String(o.numero), (valorDaOS.get(String(o.numero)) || 0) + (Number(o.valor) || 0));
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

  /* A O.S. QUE FOI PAGA EM PERMUTA NÃO TEM TÍTULO — e nunca vai ter.
     Ela foi quitada em troca: o parceiro deu crédito, a O.S. gastou esse
     crédito, e o ERP não emite cobrança nenhuma. Sem esta ligação a tela
     dizia "sem título no ERP (nota não emitida)" sobre venda JÁ ACERTADA,
     e mandava o financeiro cobrar quem não deve: medido em 04/09/2026,
     16 O.S. de 4 campanhas, R$ 162.364 -- sendo R$ 136.556 numa campanha
     só ("Política 2026 - Deputados", quitada na permuta "Politica Marcelo
     Freitas"). A permuta guarda a O.S. por ID, por isso a tela manda os
     ids junto dos números. */
  const permutaDaOS: Record<string, string> = {};
  if (ids.length) {
    const alvo = new Set(ids);
    const PASSO = 500;
    for (let de = 0; ; de += PASSO) {
      const { data, error } = await sb.from("painel_registros")
        .select("registro").eq("colecao", "permutas").order("id").range(de, de + PASSO - 1);
      if (error) throw new Error("Não foi possível conferir as permutas");
      for (const linha of data ?? []) {
        const reg = (linha as any)?.registro ?? {};
        const nome = String(reg?.nome ?? "").slice(0, 80);
        const osDaPermuta = reg?.os && typeof reg.os === "object" ? reg.os : {};
        for (const osId of Object.keys(osDaPermuta)) {
          if (alvo.has(osId)) permutaDaOS[osId] = nome || "permuta sem nome";
        }
      }
      if (!data || data.length < PASSO) break;
    }
  }


  return {
    abertos, pagos, permutaDaOS, incertos,
    temPagos: !!titulos,
    desdeDados: pag.valor?.desde ?? null,
    atualizadoEm: rec.em ?? null,
    pagosEm: pag.em ?? null,
  };
}
