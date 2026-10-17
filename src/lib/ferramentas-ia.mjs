export const ORIGEM_CNC = 'https://ferramentascnc.portodesigner.com.br';
export const FERRAMENTAS = [
  {id:'nesting', nome:'Aproveitamento de chapas', emoji:'🧩', categoria:'Preparação', resumo:'Distribua peças SVG e simule o aproveitamento antes do corte.', formatos:'Entrada SVG · distribuição 2D/3D', passos:['Informe as dimensões reais da chapa e a unidade do SVG.','Defina quantidades, margem, distância entre peças e rotação permitida.','Confira todas as chapas geradas antes de exportar.'], conferir:['Escala física do SVG conferida','Sentido do material e rotação conferidos','Contornos e espaços entre peças revisados'], limite:'A tela observada importa SVG. Contornos internos de peças importadas não equivalem a espaço livre garantido. Confira o resultado no software da máquina.'},
  {id:'box-maker', nome:'Caixas com encaixe', emoji:'📦', categoria:'Criação', resumo:'Crie caixas parametrizadas com prévia de montagem e arquivos de corte.', formatos:'DXF · prévia 2D/3D', passos:['Escolha medidas internas ou externas e mantenha a unidade em todo o projeto.','Informe espessura medida do material e ajuste os encaixes.','Veja a montagem explodida e confira as faces antes do corte.'], conferir:['Medidas internas/externas definidas','Espessura real medida','Encaixe testado em amostra'], limite:'A espessura nominal pode diferir da chapa real. Faça uma amostra de encaixe antes de produzir o lote.'},
  {id:'letter-maker', nome:'Letras em volume', emoji:'🔠', categoria:'Criação', resumo:'Prepare letras, laterais e encaixes para projetos de comunicação visual.', formatos:'SVG · DXF · guia de montagem', passos:['Digite o texto e revise a forma das letras e a fonte.','Configure altura, profundidade, espessura, folga e compensação de corte.','Revise laterais, diagonais e sequência de montagem na prévia.'], conferir:['Texto e proporção aprovados','Laterais e diagonais revisadas','Folga e compensação testadas'], limite:'O gerador observado aceita até 12 caracteres A–Z e 0–9, normalizando acentos. Encaixes retos podem deixar aberturas nas diagonais; avalie o acabamento.'},
  {id:'divider-generator', nome:'Divisórias e organizadores', emoji:'▦', categoria:'Criação', resumo:'Dimensione compartimentos e gere divisórias com encaixes.', formatos:'DXF · PDF · prévia 3D', passos:['Escolha dimensão interna da caixa ou dimensão dos compartimentos.','Defina linhas, colunas, altura, espessura e tipo de ajuste.','Confira a profundidade dos rasgos e o tamanho útil de cada célula.'], conferir:['Medida útil dos compartimentos conferida','Altura e rasgos compatíveis','Espessura e folga validadas'], limite:'Quantidade de compartimentos e quantidade de divisórias são medidas diferentes. Revise a prévia antes de exportar.'},
  {id:'vectorizer', acessoExterno:true, nome:'Vetorização de imagens', emoji:'✒️', categoria:'Preparação', resumo:'Converta imagens em SVG e revise contraste, detalhe e ruído.', formatos:'Imagem raster → SVG', passos:['Carregue uma imagem com boa definição e contraste.','Ajuste limiar, brilho, suavização e remoção de ruído.','Compare o vetor com a imagem e revise o arquivo no editor vetorial.'], conferir:['Imagem autorizada para uso','Contornos duplicados e abertos revisados','Dimensão final definida no editor'], limite:'Vetor não é automaticamente um arquivo pronto para corte. O serviço oferece uma opção Vectorizer.ai externa; disponibilidade e condições são do fornecedor.'},
  {id:'montagem-3d', acessoExterno:true, nome:'Montagem em 3D', emoji:'🧱', categoria:'Conferência', resumo:'Importe peças SVG para conferir posições, espessura e montagem.', formatos:'Entrada SVG · montagem 3D', passos:['Importe as peças e informe a espessura do material.','Posicione, gire e ajuste a altura; use a aproximação por vértices.','Inspecione encontros e orientação de todas as peças.'], conferir:['Escala das peças consistente','Espessura informada','Encontros e orientação revisados'], limite:'Visualização de montagem não comprova resistência estrutural nem substitui a conferência dos encaixes e do processo de fabricação.'},
  {id:'laser-calculator', nome:'Calculadora laser', emoji:'⚡', categoria:'Orçamento', resumo:'Estime chapas e custo de corte usando dimensões, tempo e valores informados.', formatos:'Dimensões · tempo · custo', passos:['Informe dimensões da peça, quantidade e tempo de corte por projeto.','Ajuste chapa, margens, custo do material e valor da hora da máquina.','Confira o critério de cobrança do material e a moeda escolhida.'], conferir:['Tempo de corte conferido no software','Custos próprios informados','Critério de material escolhido'], limite:'Os valores iniciais do site são exemplos, não custos da Impresilk. A seleção de moeda não converte valores. Para preparação, acabamento e margem use o orçamento Impresilk.'},
].map(f=>({...f,url:`${ORIGEM_CNC}/${f.id}`}));

export const CAMPOS_ORCAMENTO = [
 ['quantidade','Quantidade de peças','un.'],['material','Material do lote','R$'],
 ['perda','Reserva para perdas do material','%'],['minutosMaquina','Tempo de máquina do lote','min'],
 ['horaMaquina','Custo da hora de máquina','R$/h'],['minutosPreparacao','Preparação do lote','min'],
 ['minutosAcabamento','Acabamento do lote','min'],['horaTrabalho','Custo da hora de trabalho','R$/h'],
 ['terceiros','Outros custos do lote','R$'],['margem','Margem desejada sobre o preço','%'],
];
export function calcularOrcamento(entrada) {
 const erros = {}; const v = {};
 for (const [id,nome] of CAMPOS_ORCAMENTO) {
  const bruto=entrada[id]; const n=Number(bruto);
  if(bruto===undefined || bruto===null || String(bruto).trim()==='' || !Number.isFinite(n) || n<0) erros[id]=`${nome}: informe um número não negativo.`;
  v[id]=n;
 }
 if(!Number.isSafeInteger(v.quantidade)||v.quantidade<1) erros.quantidade='Informe uma quantidade inteira maior que zero.';
 if(v.margem>=100) erros.margem='A margem deve ser menor que 100%.';
 if(v.perda>100) erros.perda='A reserva para perdas deve estar entre 0 e 100%.';
 if(Object.keys(erros).length) return {erros};
 const material=v.material*(1+v.perda/100);
 const maquina=v.minutosMaquina/60*v.horaMaquina;
 const trabalho=(v.minutosPreparacao+v.minutosAcabamento)/60*v.horaTrabalho;
 const custo=material+maquina+trabalho+v.terceiros;
 const preco=custo/(1-v.margem/100);
 if(!Number.isFinite(preco)||preco>1e12) return {erros:{quantidade:'Valores fora do limite de cálculo. Revise as entradas.'}};
 return {erros:{},material,maquina,trabalho,terceiros:v.terceiros,custo,preco,unitario:preco/v.quantidade,resultado:preco-custo,quantidade:v.quantidade};
}
