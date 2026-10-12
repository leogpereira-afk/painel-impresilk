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
