export const ROTA_MANUTENCOES = '/patrimonio/manutencoes';

const CATEGORIAS_INCENDIO=['Extintor','AVCB','Iluminação de emergência','Sinalização de segurança'];
// `ver` abre a ficha só para consulta (item=), que toda aba lê; sem ele, o
// pedido de edição (ficha=) continua o de sempre, usado por Manutenções.
export function caminhoCadastroPatrimonio({familia='',categoria='',item='',novo=false,ver=false}={}) {
  const telefonia=['Telefone','Central telefônica','Celular'].includes(categoria);
  const incendio=familia==='predial'&&CATEGORIAS_INCENDIO.includes(categoria);
  const aba=telefonia?'telefonia':incendio?'incendio':({veiculo:'carros',maquina:'maquinas',informatica:'estrutura',seguranca:'seguranca'}[familia]||'estrutura');
  const params=new URLSearchParams({aba});
  if(telefonia)params.set('telefonia',categoria==='Celular'?'celulares':'ramais');
  else if(familia==='informatica')params.set('estrutura','computadores');
  if(familia==='predial'&&!incendio){
    if(['Hidráulica','Caixa-d’água',"Caixa-d'água"].includes(categoria))params.set('estrutura','hidraulica');
    else if(['Elétrica','Iluminação','Padrão de energia','Transformador','Usina fotovoltaica'].includes(categoria))params.set('estrutura','eletrica');
    else params.set('estrutura','outros');
  }
  if(familia==='seguranca')params.set('seguranca',{'Alarme':'alarmes','Chave':'chaves','Acesso facial':'facial','Portão':'portoes','Portão / automatizador':'portoes','Relógio de ponto':'ponto'}[categoria]||'cameras');
  if(item)params.set(ver?'item':'ficha',item);
  if(novo&&['veiculo','maquina'].includes(familia))params.set('cadastro','novo');
  return `/patrimonio?${params}`;
}
// "Abrir ficha" na ficha do bem: a aba e a subaba da ficha ligada, só consulta.
export function caminhoFichaVinculada(ficha) {
  return caminhoCadastroPatrimonio({familia:ficha?.tipo||'',categoria:ficha?.categoria||'',item:ficha?.id||'',ver:true});
}

export function caminhoManutencao({ item = '', familia = '', novo = false, aba = 'itens', categoria = '', lancar = false } = {}) {
  const params = new URLSearchParams({ aba: aba === 'historico' ? 'historico' : 'itens' });
  if (item) params.set('item', item);
  if (item && lancar) params.set('lancar','1');
  if (categoria) params.set('categoria',categoria);
  if (['veiculo', 'maquina', 'predial','informatica','seguranca'].includes(familia)) {
    params.set('familia', familia);
    if (novo) params.set('novo', familia);
  }
  return `${ROTA_MANUTENCOES}?${params}`;
}

// Muda o endereço, não o identificador nem a permissão do módulo.
export function redirecionarManutencoes(search = '') {
  return `${ROTA_MANUTENCOES}${search}`;
}

export function destinoPatrimonio(podeInventario, podeManutencoes) {
  return podeInventario ? '/patrimonio' : podeManutencoes ? ROTA_MANUTENCOES : null;
}

// Custos, cartões e histórico da ficha precisam ter o mesmo recorte por ID.
// Lançamentos de equipamento removido continuam consultáveis e contabilizados.
export function recortarManutencoes(itens = [], mapa = {}, item = '') {
  if (!item) return { itens, mapa };
  return {
    itens: itens.filter(i => i.id === item),
    mapa: Object.fromEntries(Object.entries(mapa).filter(([, l]) => l?.ativoId === item)),
  };
}

export function abasPatrimonio(pode) {
  return ['estrutura','telefonia','seguranca','incendio','armarios','ferramentas','camas','carros','maquinas','outros','setores','inventario'].filter(id =>
    id === 'outros' ? pode('patrimonio')&&pode('inventario-valores') : id === 'inventario' ? pode('inventario-valores') : id === 'seguranca' ? pode('seguranca') : pode('patrimonio'));
}

// Endereços antigos continuam abrindo o mesmo conteúdo dentro da entrada atual.
export function abaPatrimonioAtual(aba) {
  return ['ramais','celulares'].includes(aba)?'telefonia':aba==='computadores'?'estrutura':aba;
}
export function secaoEstruturaInicial(aba) {
  return aba==='computadores'?'computadores':'outros';
}
