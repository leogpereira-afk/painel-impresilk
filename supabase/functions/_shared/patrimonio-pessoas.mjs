// Projeção fechada do RH: nenhum documento, salário ou contato é consultado.
export async function lerPessoasPatrimonio(sb) {
  const pessoas = new Map();
  for (let de = 0; ; de += 1000) {
    const {data,error} = await sb.from('registros')
      .select('id, pid:registro->>id, nome:registro->>nome, statusId:registro->>statusId, saiu:registro->>dataDesligamento')
      .eq('colecao','colaboradores').order('id').range(de,de+999);
    if (error) throw Object.assign(new Error('Não foi possível consultar os colaboradores do RH. Tente novamente.'),{status:503});
    for (const r of data || []) {
      const id=String(r.pid || r.id || '').trim(), nome=String(r.nome || '').trim();
      if (!id || !nome) continue;
      if (pessoas.has(id)) throw Object.assign(new Error('Há IDs repetidos no cadastro do RH. Confira o cadastro antes de vincular.'),{status:422});
      pessoas.set(id,{id,nome,disponivel:r.statusId!=='inativo'&&!r.saiu});
    }
    if ((data || []).length<1000) break;
  }
  return [...pessoas.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')||a.id.localeCompare(b.id));
}

export function validarVinculoPessoa(campos,anterior,pessoas,campo='pessoa') {
  const falhar=()=>{throw Object.assign(new Error('Selecione uma pessoa do cadastro do RH.'),{status:422});};
  const chave=campo+'Id';
  const id=Object.hasOwn(campos,chave)?campos[chave]:anterior?.[chave] || '';
  if (typeof id!=='string' || id.length>180) falhar();
  const nome=campos[campo]===undefined?String(anterior?.[campo]||''):String(campos[campo]??'').trim();
  if (id) {
    const pessoa=pessoas.find(p=>p.id===id);
    // Vínculo existente continua editável, mesmo após desligamento ou retirada do RH.
    if (!pessoa && id===anterior?.[chave]) return {[chave]:id,[campo]:String(anterior[campo]||'')};
    if (!pessoa || (!pessoa.disponivel && id!==anterior?.[chave])) falhar();
    return {[chave]:id,[campo]:pessoa.nome};
  }
  // Um cadastro antigo pode ser conservado; um novo nome livre nunca cria vínculo.
  if (nome && (anterior?.[chave] || nome!==String(anterior?.[campo]||'').trim())) falhar();
  return {[chave]:'',[campo]:nome};
}

export function prepararPessoasControle(campos,anterior,pessoas) {
  const limpos={...campos,...validarVinculoPessoa(campos,anterior,pessoas)};
  const op=campos.operacaoCaixa;
  if (op && ['entrega','devolucao'].includes(op.tipo)) {
    if (op.tipo==='devolucao' && !op.pessoaId) {
      // Só a devolução de uma entrega antiga pode conservar identidade por nome.
      const nome=String(op.pessoa||'').trim();
      if (!nome || !(anterior?.movimentacoes||[]).some(m=>m.itemId===op.itemId&&!m.pessoaId&&m.pessoa===nome)) {
        throw Object.assign(new Error('Selecione quem está com o item.'),{status:422});
      }
      limpos.operacaoCaixa={...op,pessoaId:'',pessoa:nome};
    } else {
      // Devolução aceita ex-colaborador que já está com o item; entrega só ativos.
      const anteriorPessoa=op.tipo==='devolucao'?(anterior?.movimentacoes||[]).find(m=>m.itemId===op.itemId&&m.pessoaId===op.pessoaId):null;
      const vinculo=validarVinculoPessoa(op,anteriorPessoa,pessoas);
      if (!vinculo.pessoaId) throw Object.assign(new Error('Selecione a pessoa no RH.'),{status:422});
      limpos.operacaoCaixa={...op,...vinculo};
    }
  }
  return limpos;
}
