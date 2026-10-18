import { calibrationStatus } from './model.mjs';
import { edgeFolds } from '../../../supabase/functions/_shared/acm-folds.mjs';
import { resolveFixing } from '../../../supabase/functions/_shared/acm-fixing.mjs';

// Original synthesis of the supplied manuals. Source documents and illustrations are not bundled.
export const TECHNICAL_SOURCES = Object.freeze({
  alucomaxx: Object.freeze({
    id: 'alucomaxx', title: 'Manual de instalação Alucomaxx', pages: 36,
    revision: 'Capa: revisão 1, maio de 2023. O nome do arquivo fornecido indica 05.24; revisão do conteúdo não confirmada.',
    scope: 'Recomendações do fabricante para os produtos e sistemas descritos. Não se aplicam automaticamente a outro fabricante ou SKU.',
  }),
  apostila: Object.freeze({
    id: 'apostila', title: 'Apostila Fachadas em ACM', pages: 69,
    revision: 'Material didático fornecido para estudo; revisão não identificada.',
    scope: 'Exemplos de aprendizagem e sequência de trabalho. Números de exemplos não substituem ficha técnica, projeto ou ensaio.',
  }),
});
export const VIDEO_REFERENCES = Object.freeze([
  {id:'8v-h4S_6AsY', title:'Fachadas em ACM: Tipos de Juntas', status:'Transcrição integral consultada',
    summary:'Forma da peça, acabamento da junta e fixação são decisões independentes. Junta seca pode existir com bandeja; o detalhe deve considerar ambiente, dilatação, fundo aparente e superfície de adesão.'},
  {id:'9dY438SGdV8', title:'OS 4 MELHORES PARAFUSOS PARA FIXAR O ACM! E um rebite!', status:'Referência visual; transcrição indisponível',
    summary:'Não foram extraídos passo, diâmetro de furação ou capacidade. Na configuração solicitada, os pontos automáticos ficam somente nas abas da bandeja.'},
  {id:'TJyrooSdIZk', title:'Qual a espessura correta da fita pra ACM?', status:'Referência visual; transcrição indisponível',
    summary:'Não foi adotada espessura universal a partir do vídeo. Produto, espessura e largura continuam dependendo da especificação cadastrada.'},
]);
const ref = (source, pages) => ({ source, pages });
export const TECHNICAL_GUIDANCE = Object.freeze([
  { id: 'survey', topic: 'project', title: 'Levantamento antes da fabricação', kind: 'workflow', step: 'measures',
    summary: 'Registre dimensões, interferências, fotografias, acesso de montagem e contexto do acabamento. Uma foto sem escala confirmada não fornece medidas de fabricação.',
    confirm: 'Conferir no local os dados que sustentam o estudo e a revisão aprovada pelo responsável.',
    scope: 'Fluxo de projeto e orçamento; não é levantamento automático por imagem.', refs: [ref('apostila', [14, 15, 16, 17, 18, 19])] },
  { id: 'blank', topic: 'folds', title: 'Face acabada e desenvolvimento são medidas diferentes', kind: 'workflow', step: 'bends',
    summary: 'O corte precisa considerar abas, retornos, recortes de canto e compensações da configuração. O contorno aberto e a face montada precisam manter o mesmo ID de peça.',
    confirm: 'Conferir a peça aberta no verso e a seção de cada cadeia de dobras antes de exportar.',
    scope: 'A soma nominal das abas não determina, sozinha, a compensação real de dobra.', refs: [ref('apostila', [37, 38]), ref('alucomaxx', [13, 16])] },
  { id: 'machining', topic: 'folds', title: 'Usinar no verso preservando a lâmina frontal', kind: 'manufacturer', step: 'bends',
    summary: 'A profundidade do canal deve preservar a lâmina de acabamento e ser uniforme. Núcleo residual e espessura total restante têm significados diferentes: a sobra total inclui a lâmina frontal.',
    confirm: 'Registrar material, lâmina, ferramenta e amostra medida. Se a configuração mudar, repetir a conferência da amostra.',
    scope: 'Os desenhos ilustram processos diferentes. Seus valores não são presets universais de fresa ou resíduo.', refs: [ref('alucomaxx', [10, 11, 12]), ref('apostila', [51, 52])] },
  { id: 'fold-chain', topic: 'folds', title: 'Cada retorno precisa de sentido, comprimento e conferência', kind: 'example', step: 'bends',
    summary: 'Canais múltiplos permitem abas e retornos distintos. Ângulo da ferramenta, ângulo da dobra e compensação da amostra são grandezas separadas.',
    confirm: 'Conferir sequência, sentido e encontro dos retornos; o desenho plano sozinho não informa uma dobra 3D.',
    scope: 'A expressão de encapamento 2 × (espessura do ACM + fita), no exemplo da apostila, envolve um perfil e uma condição específicos. Não é uma tolerância geral por dobra.', refs: [ref('alucomaxx', [10, 11, 12, 13]), ref('apostila', [60])] },
  { id: 'direction', topic: 'cut', title: 'Manter as setas de fabricação coerentes', kind: 'workflow', step: 'nesting',
    summary: 'A direção indicada no liner ajuda a evitar diferenças visuais entre painéis. Cor uniforme e peças do mesmo lote não dispensam a conferência de direção.',
    confirm: 'Conferir as setas da chapa, das peças encaixadas e da fachada; cadastrar material direcional quando aplicável.',
    scope: 'A rotação no encaixe deve respeitar o acabamento efetivamente utilizado.', refs: [ref('alucomaxx', [21, 32]), ref('apostila', [39])] },
  { id: 'tape', topic: 'fixing', title: 'Fita depende do produto, da superfície e do sistema', kind: 'manufacturer', step: 'fixing',
    summary: 'Largura, espessura, preparação, primer, temperatura, pressão e tempo até receber carga dependem da ficha da fita e do projeto. A quantidade geométrica de fita não determina resistência.',
    confirm: 'Registrar o SKU da fita, sua ficha e as condições de aplicação. A recomendação Alucomaxx para fita exclusiva vertical exige projeto e testes; forro com fita pede avaliação específica.',
    scope: 'O manual menciona pelo menos 25 mm × 1,1 mm; a apostila indica 19 mm × 1,5 mm em outro contexto. Não combinar esses números como uma regra única.', refs: [ref('alucomaxx', [14, 17, 19, 26, 28, 29]), ref('apostila', [33, 62])] },
  { id: 'screws', topic: 'fixing', title: 'Posição de parafuso não é diâmetro de furação', kind: 'workflow', step: 'fixing',
    summary: 'A posição gerada precisa identificar apoio e função. Diâmetro, folgas para movimento, arruela, proteção e aperto precisam de detalhe do sistema e do fixador.',
    confirm: 'Definir explicitamente o Ø de furação e sua fonte; conferir a montagem nas abas e as interfaces entre metais.',
    scope: 'Os textos não fornecem uma distância universal entre parafusos nem diâmetro padrão a partir do tamanho nominal do parafuso.', refs: [ref('alucomaxx', [14, 15, 16, 17, 29, 30, 31])] },
  { id: 'structure', topic: 'structure', title: 'Plano de metalon quantifica geometria', kind: 'manufacturer', step: 'structure',
    summary: 'A subestrutura deve oferecer apoio e alinhamento à paginação. Aço, alumínio e fixadores diferentes exigem atenção a isolamento, corrosão e dilatação diferencial.',
    confirm: 'Conferir seção de apoio, encontros, isolamento e fixação com responsável técnico. Vento, ancoragem e resistência precisam de dimensionamento próprio.',
    scope: 'O manual prefere subestrutura de alumínio. Ele não dimensiona o metalon cadastrado neste estudo.', refs: [ref('alucomaxx', [14, 15, 20, 21, 29, 30, 31, 32])] },
  { id: 'joints', topic: 'installation', title: 'A junta precisa permitir movimento e montagem', kind: 'manufacturer', step: 'modulation',
    summary: 'Bandeja aparafusada, junta seca colada e fachada ventilada usam detalhes diferentes. A largura da junta envolve dilatação e acesso de montagem, além da aparência.',
    confirm: 'Escolher o detalhe de junta e verificar uso interno/externo, variação térmica, painel e fixação.',
    scope: 'O manual limita os sistemas colados descritos nas páginas 17–19 a interiores; a discussão de fita vertical na página 28 exige projeto próprio. A junta de 10 mm da bandeja aparafusada não é um mínimo universal para todas as soluções.', refs: [ref('alucomaxx', [13, 16, 17, 18, 19, 20, 23, 24, 28])] },
  { id: 'sealant', topic: 'installation', title: 'Selante com contato em duas faces', kind: 'manufacturer', step: 'installation',
    summary: 'Corpo de apoio ou barreira de adesão evita aderência ao fundo da junta. O selante deve aderir às superfícies previstas, respeitar a seção e receber preparação e cura conforme o produto.',
    confirm: 'Conferir seção da junta, corpo de apoio, compatibilidade e ensaio de aderência. O sistema Alucomaxx descreve selante neutro e não acético.',
    scope: 'O núcleo PE/FR não substitui a superfície de adesão. A indicação de corpo de apoio 30% maior no manual difere do exemplo de 25% da apostila; conferir o produto.', refs: [ref('alucomaxx', [22, 23, 24, 25, 26]), ref('apostila', [40, 41])] },
  { id: 'sealant-yield', topic: 'cost', title: 'Rendimento de selante exige convenção de perda explícita', kind: 'conflict', step: 'costs',
    summary: 'Volume do cartucho, seção da junta e perda adotada precisam estar identificados. As tabelas dos dois materiais não representam necessariamente a mesma hipótese de consumo.',
    confirm: 'Tratar o exemplo da apostila como exemplo, sem extrair um fator escondido para o orçamento. Usar ficha e seção reais quando o consumo for calculado.',
    scope: 'No manual, o fator 0,8 representa sua perda adotada de 20%. Ele não é equivalente a dividir por 1,2 e não reproduz automaticamente a tabela da apostila.', refs: [ref('alucomaxx', [24]), ref('apostila', [61])] },
  { id: 'drainage', topic: 'installation', title: 'Drenagem, arremates e exposição pertencem ao projeto', kind: 'manufacturer', step: 'installation',
    summary: 'Evitar água acumulada atrás dos painéis, prever rufos e pingadeiras e conferir a exposição de superfícies horizontais.',
    confirm: 'Detalhar drenagem e arremates da instalação escolhida; não deduzir um detalhe de fachada ventilada do simples afastamento do painel.',
    scope: 'A página 34 traz diferença entre inclinação no texto e nos desenhos. Não criar ângulo automático de projeto ou promessa de garantia a partir dela.', refs: [ref('alucomaxx', [20, 21, 31, 34])] },
  { id: 'traceability', topic: 'cut', title: 'Identificar fabricante, SKU, lote e acabamento', kind: 'workflow', step: 'materials',
    summary: 'Conserve a ligação entre chapa física, material cadastrado e IDs das peças. Lote, acabamento e setas de fabricação ajudam a conferir diferenças visuais e compatibilidade de retalhos.',
    confirm: 'Conferir identificação na entrega das chapas e nos retalhos; manter a rastreabilidade até o painel instalado.',
    scope: 'O nome da cor não comprova equivalência entre lotes ou fornecedores. O cadastro não comprova a inspeção física do recebimento.', refs: [ref('alucomaxx', [6, 21, 32]), ref('apostila', [13, 39])] },
  { id: 'coating', topic: 'structure', title: 'Proteção do aço e isolamento são verificações diferentes', kind: 'workflow', step: 'structure',
    summary: 'O acabamento de proteção da estrutura deve ser compatível com a exposição. Pintura ou galvanização cadastrada não comprova isolamento elétrico entre metais diferentes.',
    confirm: 'Registrar o acabamento real, conferir sua continuidade e detalhar as interfaces de isolamento conforme o projeto.',
    scope: 'A apostila descreve a necessidade de proteção do aço carbono externo; o manual do fabricante acrescenta exigências de interface com alumínio. Não foi escolhida tinta, espessura de película ou processo anticorrosivo automaticamente.', refs: [ref('apostila', [42]), ref('alucomaxx', [20, 29, 30, 31])] },
  { id: 'handling', topic: 'installation', title: 'Transporte e manuseio preservam peças identificadas', kind: 'workflow', step: 'installation',
    summary: 'Organize o percurso das peças, a proteção do acabamento e a área de trabalho para evitar contato com detritos, ferramentas e apoios que possam riscar ou deformar os painéis.',
    confirm: 'Planejar transporte horizontal e vertical, sequência de entrega e recebimento; conferir as peças antes de instalar.',
    scope: 'O manual descreve painéis preparados e protegidos para chegar à obra. Não fornece capacidade de equipamento, número universal de pessoas ou um plano de içamento.', refs: [ref('alucomaxx', [14]), ref('apostila', [16, 46])] },
  { id: 'weight', topic: 'installation', title: 'Peso e cargas precisam de origem identificada', kind: 'workflow', step: 'installation',
    summary: 'Peso próprio, vento, equipamento de acesso e ancoragem pertencem a verificações diferentes. Uma área calculada ou a espessura do painel não fornece o peso do conjunto completo.',
    confirm: 'Registrar o peso quando conhecido, sua fonte e o escopo da informação; conferir estrutura, fixação e movimentação pelo projeto aplicável.',
    scope: 'O peso cadastrado no planejamento de instalação é um dado informado. Ele não é capacidade admissível, carga de vento ou peso automaticamente calculado de toda a fachada.', refs: [ref('alucomaxx', [14, 15, 28, 31]), ref('apostila', [45])] },
  { id: 'maintenance', topic: 'installation', title: 'Prever acesso para inspeção e manutenção', kind: 'workflow', step: 'installation',
    summary: 'Uma solução colada pode dificultar a retirada de painéis para manutenção. Selantes e interfaces precisam de possibilidade de inspeção ao longo do uso.',
    confirm: 'Identificar os componentes que precisarão de acesso e registrar como serão alcançados e removidos quando necessário.',
    scope: 'A apostila alerta para a dificuldade em painéis colados de elementos com manutenção interna; o manual pede checagem periódica dos selantes. Não foi inventado um intervalo universal de manutenção.', refs: [ref('apostila', [32]), ref('alucomaxx', [22])] },
  { id: 'final-inspection', topic: 'installation', title: 'Conferir o conjunto antes da entrega', kind: 'workflow', step: 'review',
    summary: 'Revisar alinhamento, juntas, fixações, interfaces, acabamento, drenagem e integridade dos painéis. O resultado geométrico precisa corresponder à revisão efetivamente fabricada e instalada.',
    confirm: 'Registrar a inspeção final e as correções do caso; conferir a identificação das peças e as condições de retirada do liner.',
    scope: 'Esta é uma síntese de conferência a partir dos cuidados das fontes. A ausência de erro no modelo não comprova inspeção física nem aceite de obra.', refs: [ref('alucomaxx', [14, 21, 22, 33, 34]), ref('apostila', [46])] },
  { id: 'liner-cleaning', topic: 'installation', title: 'Limpeza e retirada do liner exigem instrução do produto', kind: 'conflict', step: 'installation',
    summary: 'Separe a preparação para aderência da limpeza do acabamento e da remoção de resíduos. O produto indicado para uma dessas tarefas não é automaticamente adequado às outras.',
    confirm: 'Conferir instruções do fabricante para acabamento, resíduo e prazo de película. Aplicação de solvente e ensaio de compatibilidade dependem da orientação do caso.',
    scope: 'Apostila p. 59 e Alucomaxx p. 33 divergem em prazo, ângulo e agente para resíduos. A biblioteca não recomenda solvente nem determina um prazo ou ângulo automático de retirada.', refs: [ref('alucomaxx', [21, 22, 25, 32, 33]), ref('apostila', [33, 34, 59])] },

]);

export function knowledgeSourceLabel(reference) {
  const source = TECHNICAL_SOURCES[reference.source];
  return `${source?.title ?? reference.source} · p. ${reference.pages.join(', ')}`;
}

/** Terminology aid only; no machining limit is selected here. */
export function machiningLayerEvidence(material = {}, fabrication = {}) {
  const thickness = material.thickness, skin = material.skin, depth = fabrication.depth;
  const remainingThickness = Number.isFinite(thickness) && Number.isFinite(depth) && thickness > 0 && depth >= 0 && depth < thickness ? thickness - depth : null;
  const residualCore = Number.isFinite(fabrication.remainingCore) && fabrication.remainingCore >= 0 ? fabrication.remainingCore : null;
  const frontSkin = Number.isFinite(skin) && skin > 0 ? skin : null;
  return { remainingThickness, residualCore, frontSkin };
}

const number = n => Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : 'não informado';
const guide = id => TECHNICAL_GUIDANCE.find(item => item.id === id);
const unique = values => [...new Set(values)];

/** Read-only evidence checklist. "Recorded" means data exists, never engineering approval. */
export function projectKnowledgeChecks(project, result = {}) {
  const checks = [];
  const add = (id, status, detail, evidence) => {
    const item = guide(id);
    checks.push({ id, title: item.title, topic: item.topic, step: item.step, refs: item.refs, status, detail, evidence });
  };
  const pieces = result.pieces ?? [];
  const contexts = pieces.length ? pieces.map(piece => ({ piece, fixing: resolveFixing(project, piece), material: piece.material ?? project.material })) : [{ piece: null, fixing: resolveFixing(project, null), material: project.material }];
  const materials = contexts.map(context => context.material ?? {});
  const f = project.fabrication ?? {};
  const variants = [...new Map(materials.map(material => [JSON.stringify([material.thickness, material.skin]), material])).values()];
  const complete = variants.every(material => Object.values(machiningLayerEvidence(material, f)).every(value => value !== null));
  const totalEvidence = variants.map(material => { const evidence = machiningLayerEvidence(material, f); return `ACM ${number(material.thickness)} mm; lâmina frontal ${number(evidence.frontSkin)} mm; núcleo residual ${number(evidence.residualCore)} mm; sobra total ${number(evidence.remainingThickness)} mm`; }).join(' | ');
  add('machining', complete ? 'review' : 'missing', complete ? 'Confira a relação entre as camadas em uma amostra do material. O valor remanescente inclui alumínio e núcleo.' : 'Faltam dados para conferir a seção usinada. Nenhum resíduo é adotado automaticamente a partir dos exemplos.', totalEvidence);
  const calibration = calibrationStatus(project);
  const chains = pieces.length ? pieces.flatMap(piece => Object.values(piece.technical ? {} : piece.edgeDefinitions ?? { ...project.edges, ...project.overrides?.[piece.id]?.edges })) : Object.values(project.edges ?? {});
  const multiple = chains.filter(edge => edgeFolds(edge).length > 1).length;
  add('fold-chain', project.technicalDrawing ? 'review' : calibration.valid ? 'recorded' : 'missing', project.technicalDrawing ? 'O desenho importado permanece plano. Um canal não especifica sozinho o ângulo e o sentido de uma dobra.' : calibration.valid ? 'Há registro de amostra para esta configuração. Fixação, estrutura e instalação exigem conferência própria.' : calibration.reason, `${multiple} borda(s) com mais de uma dobra na geometria atual. Compensação: ${typeof f.compensation === 'number' ? `${number(f.compensation)} mm` : 'por borda'}.`);
  const directional = materials.some(material => material.directional === true);
  add('direction', 'review', directional ? 'Conferir o sentido das peças direcionais e o liner da chapa física antes do corte e da instalação.' : 'A direção não foi marcada no cadastro. Confirme no produto real se há restrição de rotação.', `Material direcional: ${directional ? 'sim' : 'não marcado'}; rotação geral no encaixe: ${project.stock?.rotation ? 'permitida quando o material permitir' : 'desativada'}.`);
  const tape = contexts.filter(context => ['tape', 'hybrid'].includes(context.fixing.type));
  if (tape.length) {
    const namedBrand = tape.filter(context => /alucomaxx/i.test(context.material?.manufacturer ?? ''));
    const undersized = namedBrand.some(({ fixing }) => !Number.isFinite(fixing.tapeWidth) || fixing.tapeWidth < 25 || !Number.isFinite(fixing.thickness) || fixing.thickness < 1.1);
    const values = unique(tape.map(({ fixing }) => `${number(fixing.tapeWidth)} × ${number(fixing.thickness)} mm`));
    const soffit = tape.some(context => context.piece?.surface === 'soffit') || !pieces.length && project.soffit?.enabled;
    const detail = soffit ? 'Há fita no forro deste estudo. O manual Alucomaxx desaconselha esse uso sem avaliação específica; confirme produto, sistema e projeto.' : undersized ? 'O material foi identificado como Alucomaxx e há fita abaixo dos valores indicativos de 25 × 1,1 mm ou sem medida. Confira ficha e projeto antes de escolher o produto.' : 'Confira a ficha do SKU e o projeto do sistema. Os valores dos dois materiais de referência divergem e não dimensionam cargas.';
    add('tape', soffit || undersized ? 'attention' : 'review', detail, `Fita cadastrada: ${values.join('; ')}. Fabricante Alucomaxx identificado: ${namedBrand.length ? 'sim' : 'não; recomendação da marca apenas como referência'}.`);
  }
  const screws = contexts.filter(context => ['screws', 'hybrid'].includes(context.fixing.type));
  if (screws.length) {
    const withoutDiameter = screws.filter(({ fixing }) => !(Number.isFinite(fixing.drillDiameter) && fixing.drillDiameter > 0));
    const withoutSource = screws.filter(({ fixing }) => !fixing.pattern?.source?.trim() || !fixing.pattern?.responsible?.trim() || !fixing.pattern?.validatedAt);
    add('screws', withoutDiameter.length || withoutSource.length ? 'missing' : 'recorded', withoutDiameter.length ? 'Há posições de parafuso sem Ø de furação explícito. Elas são pontos informativos; nenhum diâmetro é inferido do parafuso.' : withoutSource.length ? 'O Ø foi informado, mas falta fonte, responsável ou data da conferência do padrão em parte do escopo.' : 'Diâmetro e referência do padrão foram registrados. Conferir folga, aperto, arruela e condições reais de apoio.', `${screws.length} seleção(ões) com parafusos; ${withoutDiameter.length} sem Ø; ${withoutSource.length} sem referência completa.`);
  }
  const profiles = result.structure?.segments?.length ? result.structure.segments.map(segment => segment.profileSpec ?? {material:segment.material,finish:segment.finish}) : Object.values(project.structure?.frame?.groups ?? {}).map(group => group.profile ?? {});
  const frameMaterials = unique(profiles.map(profile => profile.material).filter(Boolean));
  const steel = frameMaterials.some(value => /aço|aco|steel|ferro/i.test(value));
  add('structure', steel ? 'attention' : 'review', steel ? 'Há aço cadastrado. Detalhe o isolamento nas interfaces com ACM/alumínio e considere a dilatação diferencial com responsável técnico.' : 'Confira os materiais da subestrutura e dos fixadores, a área real de apoio e a solução de isolamento quando houver metais diferentes.', `Materiais do quadro: ${frameMaterials.join(', ') || 'não identificados neste cadastro'}. ${result.structure?.segments?.length ?? 0} elemento(s) geométricos; isto não comprova capacidade estrutural.`);
  if (!project.technicalDrawing) add('joints', project.layout?.joint === 0 ? 'attention' : 'review', project.layout?.joint === 0 ? 'O estudo tem junta nula. Identifique o sistema e a exposição; a junta seca colada descrita no manual é para uso interno.' : 'Escolha o detalhe da junta de acordo com sistema, acesso de montagem e movimentação térmica. A medida cadastrada não é um cálculo de dilatação.', `Junta aparente cadastrada: ${number(project.layout?.joint)} mm; modo ${project.assemblyMode === 'wrap' ? 'encapamento nominal' : 'bandeja'}.`);
  add('survey', 'review', 'Conferir medidas, interferências e condições de acesso no local. O sistema não comprova a visita nem a aprovação do cliente.', `Revisão ${project.revision ?? 'não informada'}; ${pieces.length} peça(s) no estudo; ${result.errors?.length ?? 0} erro(s) geométricos reportados pelo motor.`);
  add('sealant', 'review', 'Confirmar produto, seção, superfície de adesão, corpo de apoio e tempo de cura. Não há validação automática desses itens neste estudo.', 'Checklist de execução; medidas e evidências de aplicação não registradas por este módulo.');
  add('drainage', 'review', 'Conferir drenagem, arremates e exposição horizontal no projeto da instalação.', `Forro no cadastro: ${project.soffit?.enabled ? 'habilitado' : 'desabilitado'}. Este campo não comprova impermeabilização ou escoamento.`);
  const materialRecords = [...new Map(materials.map(material => [JSON.stringify([material.manufacturer,material.sku,material.lot,material.finish]),material])).values()];
  const missingIdentity = materialRecords.filter(material => !material.manufacturer?.trim() || !material.sku?.trim() || !material.lot?.trim());
  add('traceability', missingIdentity.length ? 'missing' : 'recorded', missingIdentity.length ? 'Há material sem fabricante, SKU ou lote. Conferir o produto físico e a relação com retalhos e peças do estudo.' : 'Identificação comercial e lote foram registrados. Conferir as etiquetas e o acabamento das chapas recebidas.', materialRecords.map(material => `${material.manufacturer || 'fabricante não informado'} / ${material.sku || 'SKU não informado'} / lote ${material.lot || 'não informado'} / acabamento ${material.finish || 'não informado'}`).join(' | '));
  if (profiles.length) {
    const missingFinish = profiles.some(profile => !profile.finish?.trim());
    add('coating', steel && missingFinish ? 'missing' : 'review', steel && missingFinish ? 'Há aço sem acabamento de proteção registrado. Definir o tratamento para a exposição do caso e conferir o isolamento entre metais.' : 'Conferir a proteção real dos perfis e sua compatibilidade com a exposição. Um acabamento cadastrado não comprova continuidade ou isolamento nas interfaces.', `Acabamentos de perfis: ${unique(profiles.map(profile => profile.finish || 'não informado')).join('; ')}.`);
  }
  const install = project.installation ?? {}, weight = install.plate?.weight;
  const statedWeight = Number.isFinite(weight) && weight > 0;
  add('weight', statedWeight ? 'recorded' : 'missing', statedWeight ? 'O planejamento contém um peso informado. Confirmar a origem e o que ele inclui; não representa capacidade estrutural ou carga admissível.' : 'Peso do conjunto não informado no planejamento da instalação. Não foi deduzido da área, espessura ou aparência do modelo.', statedWeight ? `${number(weight)} kg informados para a placa do planejamento; fonte e escopo precisam de conferência.` : 'Peso: desconhecido. Nenhuma capacidade de acesso ou fixação foi calculada por esta biblioteca.');
  add('handling', 'review', 'Conferir recebimento, identificação, proteção do acabamento e percurso horizontal/vertical das peças. Equipamento e movimentação exigem planejamento do caso.', `${pieces.length} peça(s) no estudo. Equipamentos cadastrados no planejamento: ${install.equipment?.length ?? 0}. A contagem não comprova disponibilidade ou capacidade.`);
  const access = install.environment?.access?.trim();
  add('maintenance', 'review', 'Definir acesso futuro aos componentes e uma forma de inspeção compatível com o sistema, especialmente quando há painéis colados.', `Acesso de instalação: ${access || 'não descrito'}. Este registro não comprova desmontagem ou acesso para manutenção.`);
  const cleaning = install.preparation?.cleaning?.trim();
  add('liner-cleaning', 'review', 'Conferir a instrução atual do fabricante antes de limpar o acabamento ou retirar o liner. As fontes divergem; nenhum solvente ou procedimento é adotado automaticamente.', `Preparação/limpeza informada: ${cleaning || 'não registrada'}. O texto cadastrado não foi validado quimicamente pela biblioteca.`);
  add('final-inspection', 'review', 'Conferir o conjunto fabricado/instalado, os acabamentos, as interfaces e as pendências da revisão antes da entrega.', `Revisão ${project.revision ?? 'não informada'}; inspeção física e aceite final não são registrados por este módulo.`);
  return checks;
}
