/* O ID DA PESSOA QUE A CONTA DE ACESSO COPIA DA FICHA DO RH
 * (D-004 do RH e D-015 do PCP, 12/10/2026).
 *
 * O RH passou a gravar o ID (6 digitos) no campo `idPessoa` da ficha
 * (colecao `colaboradores`) e do contrato de freelancer (`freelancers`). Ele
 * nasce com o cadastro e NAO muda quando o CPF e corrigido. A conta da Central
 * de Acessos (`acesso_conta.id_pessoa`) copia esse campo; so calcula pelos 6
 * primeiros digitos do CPF quando ele falta (ficha antiga).
 *
 * O gravado NAO e copiado, e fica o calculo pelo CPF de sempre, com aviso:
 *   - fora do formato (texto com exatamente 6 digitos, a regua do RH);
 *   - ja e de OUTRA pessoa: outro cadastro vivo (ficha ou contrato) tem esse
 *     ID (gravado, ou o do CPF quando nao tem o campo) e CPF diferente, ou nao
 *     tem CPF que prove ser a mesma pessoa. Copiar ligaria a conta de uma
 *     pessoa as O.S., ao cracha e a aprovacao da outra no PCP.
 *
 * A regua e a mesma do _shared/idPessoa.ts do RH (idGravado, idQueVale,
 * outraPessoaComId). Sem import de banco: e so leitura de campo.
 */

const digitos = (v) => String(v ?? "").replace(/\D/g, "");
const cpf11 = (v) => { const d = digitos(v); return d.length === 11 ? d : ""; };
const idValido = (v) => typeof v === "string" && /^\d{6}$/.test(v);

/* CPF com os dois verificadores certos: o contrato de freelancer so da ID com
   ele (regua da F07 do RH, a mesma do PCP). A ficha basta ter 11 digitos. */
function cpfConfere(n) {
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  const dv = (base, peso) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (peso - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(n.slice(0, 9), 10) === Number(n[9]) && dv(n.slice(0, 10), 11) === Number(n[10]);
}

/** O ID que vale para um cadastro: o gravado; sem ele, o do CPF de hoje. */
function idQueVale(colecao, registro) {
  const g = registro?.idPessoa;
  if (idValido(g)) return g;
  const c = cpf11(registro?.cpf);
  if (!c || (colecao === "freelancers" && !cpfConfere(c))) return "";
  return c.slice(0, 6);
}

export const MOTIVO_ID_NAO_COPIADO = {
  "fora-do-formato": "o ID gravado na ficha esta fora do formato (6 digitos)",
  "id-de-outra-pessoa": "o ID gravado na ficha ja e de outra pessoa no RH",
};

/**
 * O ID que a conta copia da ficha.
 * @param {{colecao?: string, id: string, registro: object}} ficha a ficha achada pelo nome
 * @param {{colecao: string, id: string, registro: object}[]} cadastros fichas e contratos vivos
 * @returns {{idPessoa: string, motivo?: string, outro?: {colecao: string, id: string}}}
 *   `idPessoa` vazio quando nao ha ID nenhum; `motivo` quando o gravado foi recusado.
 */
export function idPessoaDaFicha(ficha, cadastros) {
  const reg = ficha?.registro ?? {};
  const cpf = cpf11(reg.cpf);
  const calculado = cpf ? cpf.slice(0, 6) : "";
  const gravado = reg.idPessoa;
  // Campo ausente (ficha antiga, antes do botao do admin do RH): o calculo.
  if (gravado === undefined || gravado === null || gravado === "") return { idPessoa: calculado };
  if (!idValido(gravado)) return { idPessoa: calculado, motivo: "fora-do-formato" };
  const colecao = ficha?.colecao || "colaboradores";
  for (const o of Array.isArray(cadastros) ? cadastros : []) {
    if (!o || (o.colecao === colecao && String(o.id) === String(ficha?.id))) continue;
    if (idQueVale(o.colecao, o.registro ?? {}) !== gravado) continue;
    if (cpf && cpf11(o.registro?.cpf) === cpf) continue; // mesma pessoa (ex.: contrato de quem saiu)
    return { idPessoa: calculado, motivo: "id-de-outra-pessoa", outro: { colecao: String(o.colecao), id: String(o.id) } };
  }
  return { idPessoa: gravado };
}

/* A LEITURA ESTREITA DOS CADASTROS, para a conferencia da conta (listar e
 * "Atualizar pela ficha"). So o ID gravado e o CPF viajam do banco ate a
 * function; nada disso desce para a tela. `idPessoa` vem como JSON
 * (registro->idPessoa) e nao como texto: numero gravado no lugar do texto tem
 * de continuar "fora do formato", como na regua acima. */
export const SELECT_CADASTROS_DO_ID = "id, colecao, idPessoa:registro->idPessoa, cpf:registro->>cpf";
export const cadastroDaLeitura = (r) => ({
  colecao: String(r?.colecao ?? ""),
  id: String(r?.id ?? ""),
  registro: { idPessoa: r?.idPessoa ?? null, cpf: r?.cpf ?? "" },
});

/* O PORQUE, NA LINGUA DA TELA (com acento: e o texto que a direcao le no
   cartao da conta e no erro do botao). Uma fonte so para a tela e a function. */
export const MOTIVO_CONTA_NAO_ATUALIZA = {
  "fora-do-formato": "o ID gravado na ficha está fora do formato (6 dígitos)",
  "id-de-outra-pessoa": "o ID gravado na ficha já é de outra pessoa no RH",
  "id-em-outra-conta": "outra conta desta tela já usa o ID da ficha",
};

/**
 * A CONTA CONFERE COM A FICHA LIGADA? (auditoria de 12/10/2026, P1)
 *
 * O admin do RH trocou o ID gravado numa ficha e a conta da Central ficou com o
 * antigo ate alguem salvar a conta de novo -- e nada na tela mostrava. Aqui a
 * conta e comparada com o que a amarracao daria HOJE (a mesma regua de
 * `idPessoaDaFicha`), pela ficha ligada (`colaborador_id`), e nao pelo nome.
 *
 * @param {{id?: string, colaborador_id?: string, id_pessoa?: string|null}} conta
 * @param {{colecao: string, id: string, registro: object}[]} cadastros fichas e contratos vivos
 * @param {{id?: string, id_pessoa?: string|null}[]} outrasContas as contas da Central
 * @returns {null | {diferente: boolean, podeAtualizar: boolean, idPessoa?: string, motivo?: string}}
 *   null quando nao ha ficha ligada viva para comparar. `idPessoa` (o que a
 *   conta passa a ter) so vem quando `podeAtualizar`; e da function, nao da tela.
 */
export function idDaContaPelaFicha(conta, cadastros, outrasContas = []) {
  const fichaId = String(conta?.colaborador_id ?? "").trim();
  if (!fichaId) return null;
  const lista = Array.isArray(cadastros) ? cadastros : [];
  const ficha = lista.find((o) => o && o.colecao === "colaboradores" && String(o.id) === fichaId);
  if (!ficha) return null;
  const { idPessoa, motivo } = idPessoaDaFicha(ficha, lista);
  const atual = String(conta?.id_pessoa ?? "");
  if (idPessoa && atual !== idPessoa) {
    // O indice unico de acesso_conta.id_pessoa recusaria; e duas contas com o
    // mesmo ID sao duas pessoas no mesmo cracha do PCP. Nao atualiza.
    const emOutra = (Array.isArray(outrasContas) ? outrasContas : []).some((o) =>
      o && String(o.id) !== String(conta?.id ?? "") && String(o.id_pessoa ?? "") === idPessoa);
    if (emOutra) return { diferente: true, podeAtualizar: false, motivo: "id-em-outra-conta" };
    return { diferente: true, podeAtualizar: true, idPessoa, ...(motivo ? { motivo } : {}) };
  }
  // A conta ja tem o que a regua daria, mas o gravado na ficha foi recusado
  // (fora do formato ou de outra pessoa): a diferenca e real e se corrige no RH.
  if (motivo) return { diferente: true, podeAtualizar: false, motivo };
  return { diferente: false, podeAtualizar: false };
}
