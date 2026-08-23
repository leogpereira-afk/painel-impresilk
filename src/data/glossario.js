// SEMENTE do glossario de comunicacao visual.
//
// Escrito para quem VENDE: cada termo diz o que e, quando usar e -- quando
// existe -- a armadilha que costuma virar retrabalho ou reclamacao. Nao e
// dicionario tecnico: e o que a vendedora precisa saber para conversar com o
// cliente sem prometer o que a producao nao entrega.
//
// Isto aqui e so o ponto de partida: na primeira abertura da aba a lista e
// plantada no servidor (painel-config, chave "glossario") e de la em diante
// vale o que estiver la -- da para editar, acrescentar e apagar pela tela.

// CATEGORIAS mudou de casa: data/glossarioCategorias.js (módulo pequeno).
// Reexportada aqui para quem importar deste arquivo não quebrar -- mas quem
// só precisa delas deve importar de lá, senão paga os 96 kB da semente.
export { CATEGORIAS } from "./glossarioCategorias.js";

export const GLOSSARIO = [
  // ---------------------------------------------------------------- materiais
  {
    categoria: "Material",
    termo: "Lona frontlight",
    texto:
      "Lona vinílica para peças que são vistas com a luz vindo da frente -- do dia ou de refletores. É a lona do banner, do painel de tapume e da maioria das fachadas de lona.",
    dica: "Se o cliente quer a peça acesa por dentro, frontlight não serve: a luz não atravessa direito e a arte fica manchada.",
  },
  {
    categoria: "Material",
    termo: "Lona backlight",
    texto:
      "Lona translucida, feita para caixa de luz: a luz fica atrás e atravessa a lona, acendendo a arte por dentro.",
    dica: "A arte pede cores mais fortes que o normal -- iluminada por trás, a impressão clareia.",
  },
  {
    categoria: "Material",
    termo: "Lona mesh",
    texto:
      "Lona com microfuros que deixam o vento passar. Usada em fachada de obra, empena de prédio e qualquer peça grande exposta a vento forte.",
    dica: "Como e perfurada, a imagem perde um pouco de fechamento de cor. Não e para peça vista de perto.",
  },
  {
    categoria: "Material",
    termo: "Vinil adesivo",
    texto:
      "Filme de PVC com cola no verso. É a base da adesivagem: vitrine, parede, veículo, chão, móvel.",
    dica: "Vinil de vitrine e vinil de veículo não são a mesma coisa -- o de veículo estica para acompanhar curva.",
  },
  {
    categoria: "Material",
    termo: "Vinil de recorte",
    texto:
      "Vinil de cor sólida, sem impressão, cortado no plotter. O resultado sai sem fundo: só a letra ou o símbolo colado na superfície.",
    dica: "Só faz cor chapada -- arte com degrade ou foto tem que ser impressa. É a cor não desbota como impressão, porque e do próprio filme; mas a vida útil e do vinil: o monomérico (barato) dura poucos anos e só em superfície plana, o polimérico/cast aguanta mais e acompanha curva.",
  },
  {
    categoria: "Material",
    termo: "Microperfurado (One Way Vision)",
    texto:
      "Adesivo furadinho para vidro: de fora as pessoas veem a arte, de dentro veem a rua. Clássico em vidro de loja e vidro traseiro de carro.",
    dica: "De noite o efeito inverte -- com a luz acesa dentro, quem esta fora enxerga para dentro.",
  },
  {
    categoria: "Material",
    termo: "ACM",
    texto:
      "Alumínio composto: duas chapas finas de alumínio com um miolo plástico. Fica perfeitamente plano, e leve e aguenta tempo -- por isso e o material padrão de fachada.",
    dica: "O corte e a dobra são feitos na chapa: mudança de medida depois vira chapa nova. E confira o TIPO -- o ACM comum tem miolo de polietileno, que queima; obra pública, hospital e shopping costumam exigir o antichama (mineral), que custa mais.",
  },
  {
    categoria: "Material",
    termo: "PVC expandido",
    texto:
      "Chapa plástica rígida e leve, facil de cortar. Não absorve água, então vai bem até em área úmida -- o que ela não suporta e sol e calor." +
      " Boa para placa interna, sinalização e display.",
    dica: "Em área externa com sol forte ela empena com o tempo. Externo pede ACM.",
  },
  {
    categoria: "Material",
    termo: "Acrílico",
    texto:
      "Placa plástica transparente ou colorida, com aparência nobre. Usada em letra caixa, placa de recepção e luminoso.",
    dica: "Risca com facilidade -- só tirar o papel de proteção na hora de instalar.",
  },
  {
    categoria: "Material",
    termo: "Poliestireno (PS)",
    texto:
      "Chapa plástica fina e barata, para display e comunicação interna de curta duração.",
    dica: "É material de campanha, não de fachada. Se o cliente quer durar anos, não ofereca PS.",
  },

  // --------------------------------------------------------------- impressao
  {
    categoria: "Impressão",
    termo: "Solvente e eco-solvente",
    texto:
      "Tinta que penetra no vinil e por isso aguenta sol e chuva. A versão eco tem menos cheiro e e a mais usada hoje.",
    dica: "Peça recém-impressa em solvente precisa de um tempo de secagem antes de laminar ou aplicar.",
  },
  {
    categoria: "Impressão",
    termo: "Impressão UV",
    texto:
      "A tinta seca na hora sob luz ultravioleta, o que permite imprimir direto em material rígido (ACM, acrílico, PVC).",
    dica: "Como seca instantaneo, a peça já sai pronta para acabamento -- costuma encurtar prazo.",
  },
  {
    categoria: "Impressão",
    termo: "Latex",
    texto:
      "Tinta a base de água, praticamente sem cheiro. Indicada para ambiente fechado e sensível: hospital, escola, consultório, restaurante.",
    dica: "Argumento de venda forte quando o cliente vai aplicar com o local funcionando.",
  },
  {
    categoria: "Impressão",
    termo: "CMYK e RGB",
    texto:
      "A tela do computador mostra cor com luz (RGB) e a impressão monta cor com tinta (CMYK). Por isso a cor da tela nunca e exatamente a cor impressa.",
    dica: "Nunca aprove cor pelo celular do cliente. Se a cor e crítica, faça prova impressa.",
  },
  {
    categoria: "Impressão",
    termo: "Pantone",
    texto:
      "Sistema de cores exatas, usado por marcas para garantir sempre o mesmo tom.",
    dica: "Nem todo Pantone fecha em CMYK -- alguns tons ficam próximos, não identicos. Avise ANTES de produzir.",
  },
  {
    categoria: "Impressão",
    termo: "Resolução e distância de leitura",
    texto:
      "Quanto maior a peça e mais longe o observador, menos resolução ela precisa. Um outdoor visto a 30 metros não pede o mesmo arquivo de um cartaz de balcão.",
    dica: "Arquivo pequeno esticado para peça grande só funciona se a peça for vista de longe.",
  },
  {
    categoria: "Impressão",
    termo: "Sangria",
    texto:
      "Margem de arte a mais, além da linha de corte, para que um desvio mínimo na guilhotina não deixe filete branco na borda.",
    dica: "Arquivo de cliente quase nunca vem com sangria -- conferir na hora de receber a arte.",
  },
  {
    categoria: "Impressão",
    termo: "Prova de cor",
    texto:
      "Um pedaço impresso do material real para o cliente aprovar a cor antes de rodar a tiragem inteira.",
    dica: "Custa pouco e evita a discussão mais cara que existe: refazer por causa de cor.",
  },

  // -------------------------------------------------------------- acabamento
  {
    categoria: "Acabamento",
    termo: "Laminação",
    texto:
      "Filme transparente aplicado por cima da impressão. Protege de risco, de sujeira e da desbotada do sol. Existe fosca e brilhante.",
    dica: "Chão e balcão SEMPRE laminados -- sem laminação a peça risca na primeira semana.",
  },
  {
    categoria: "Acabamento",
    termo: "Ilhós",
    texto:
      "Anel metálico preso na borda da lona, por onde passa a corda ou a abracadeira que prende o banner.",
    dica: "Combine o espaçamento: ilhós ralo em peça grande faz a lona ondular e rasgar no vento.",
  },
  {
    categoria: "Acabamento",
    termo: "Bainha",
    texto:
      "Dobra soldada na borda da lona que reforça o material e evita rasgo, normalmente onde entram os ilhoses.",
    dica: "Sempre que a peça ficar exposta ao vento, bainha não e opcional.",
  },
  {
    categoria: "Acabamento",
    termo: "Solda de alta frequência",
    texto:
      "Emenda que funde duas lonas sem costura, deixando a junta lisa e estanque. É como se faz peça maior que a largura da bobina.",
    dica: "Se a arte tem uma linha reta atravessando a emenda, avise: a junta aparece de perto.",
  },
  {
    categoria: "Acabamento",
    termo: "Recorte eletrônico",
    texto:
      "O plotter corta o contorno do adesivo seguindo o desenho, em vez de deixar o retângulo.",
    dica: "Contorno com detalhe muito fino não sobrevive a aplicação -- simplifique antes de vender.",
  },
  {
    categoria: "Acabamento",
    termo: "Corte a laser",
    texto:
      "Corte preciso em acrílico e MDF, inclusive com detalhe fino e furos. Deixa a borda do acrílico polida.",
    dica: "Ótimo para letras vazadas e peças de recepção.",
  },

  // -------------------------------------------------------------------- peca
  {
    categoria: "Peça",
    termo: "Fachada",
    texto:
      "A identificação do ponto comercial. Pode ser ACM com letra caixa, lona esticada em estrutura ou luminoso -- a escolha muda preço e prazo drasticamente.",
    dica: "Sempre pergunte se a fachada e iluminada: e a informação que mais muda o orçamento.",
  },
  {
    categoria: "Peça",
    termo: "Letra caixa",
    texto:
      "Letra com volume, feita em acrílico, ACM, aço ou PVC, aplicada na parede ou na fachada. Pode ser iluminada por dentro ou por trás.",
    dica: "Letra caixa iluminada precisa de ponto de energia atrás -- confirme com o cliente ou com o eletricista dele.",
  },
  {
    categoria: "Peça",
    termo: "Luminoso (caixa de luz)",
    texto:
      "Peça fechada, iluminada por dentro, com a face em lona backlight ou acrílico. Aparece de longe e a noite.",
    dica: "Manutenção existe: LED e fonte tem vida útil. Vale combinar isso na venda.",
  },
  {
    categoria: "Peça",
    termo: "Totem",
    texto:
      "Estrutura vertical independente, fincada no chão ou com base. Usada em estacionamento, posto, entrada de condominio.",
    dica: "Peça de chão envolve fundação e, em muitos casos, autorização -- prazo maior.",
  },
  {
    categoria: "Peça",
    termo: "Banner",
    texto:
      "Peça em lona com bastão ou ilhoses, de uso temporario. Barata e rápida.",
    dica: "É a porta de entrada de muito cliente novo. Bom banner hoje vira fachada amanha.",
  },
  {
    categoria: "Peça",
    termo: "Wind banner",
    texto:
      "Bandeira em formato de vela ou gota, com haste e base. Chama atenção no movimento e monta em minutos.",
    dica: "Base de água para área externa, base cruzada para piso liso.",
  },
  {
    categoria: "Peça",
    termo: "Envelopamento",
    texto:
      "Aplicação de adesivo cobrindo o veículo ou o móvel, total ou parcialmente, mudando a aparência sem pintura.",
    dica: "Veículo precisa estar limpo e sem amassado: superfície ruim reprova a aplicação, não o material. E se o envelopamento MUDA A COR do carro, a mudança tem que ser registrada no Detran -- avise o cliente antes de fechar.",
  },
  {
    categoria: "Peça",
    termo: "Vitrine e jateado",
    texto:
      "Comunicação no vidro. O 'jateado' e um adesivo que imita vidro fosco, usado para privacidade e para dar acabamento.",
    dica: "Jateado também serve de aviso de segurança: vidro totalmente limpo as pessoas não enxergam.",
  },
  {
    categoria: "Peça",
    termo: "Sinalização interna",
    texto:
      "Placas de setor, numeração de porta, indicação de rota e identificação de ambiente. Trabalho de volume e repetição.",
    dica: "Costuma render contrato recorrente -- empresa que cresce sempre precisa de mais placa.",
  },
  {
    categoria: "Peça",
    termo: "PDV (ponto de venda)",
    texto:
      "Material de apoio dentro da loja: display de balcão, testeira de gondola, faixa de preço, wobbler.",
    dica: "Peça de campanha: prazo curto e tiragem alta. Confirme a data de virada da campanha.",
  },
  {
    categoria: "Peça",
    termo: "Backdrop",
    texto:
      "Painel de fundo para foto, coletiva e evento, com a marca repetida.",
    dica: "Prefira acabamento fosco: o brilho estoura no flash das fotos.",
  },
  {
    categoria: "Peça",
    termo: "Adesivo de chão",
    texto:
      "Adesivo com laminação antiderrapante para aplicar no piso -- direcional, promocional ou de segurança.",
    dica: "Só cola bem em piso liso e limpo. Piso poroso ou encerado não segura.",
  },

  // -------------------------------------------------------------- instalacao
  {
    categoria: "Instalação",
    termo: "Medição",
    texto:
      "A visita que levanta as medidas reais, o tipo de parede, o ponto de energia e como o instalador vai chegar la.",
    dica: "Orçamento sem medição e chute. A maior parte do retrabalho nasce de medida passada por telefone.",
  },
  {
    categoria: "Instalação",
    termo: "Estrutura metálica",
    texto:
      "O esqueleto que sustenta a fachada ou o painel atrás do material aparente.",
    dica: "Ela pesa no orçamento e no prazo, e o cliente não a enxerga -- explique que o preço não e só a chapa.",
  },
  {
    categoria: "Instalação",
    termo: "Módulo de LED e fonte",
    texto:
      "Os pontos de luz da peça iluminada e o aparelho que converte a energia para eles.",
    dica: "Fonte precisa de lugar acessível: um dia ela será trocada.",
  },
  {
    categoria: "Instalação",
    termo: "Trabalho em altura",
    texto:
      "Instalação acima de dois metros exige equipe treinada em NR-35 e equipamento (andaime, plataforma ou cesto).",
    dica: "Isso entra no custo e no prazo. Fachada alta não e o mesmo serviço de fachada de porta.",
  },
  {
    categoria: "Instalação",
    termo: "Autorização da prefeitura",
    texto:
      "Muitos municípios exigem licença para qualquer anúncio visível da rua -- inclusive na fachada do imóvel do próprio cliente -- com regra de tamanho e de posição.",
    dica: "Pergunte cedo. Peça pronta parada esperando licença e prejuízo dos dois lados.",
  },

  // ---- material (pesquisa de 04/08) --------------------------------------
  {
    categoria: "Material",
    termo: "Vinil monomérico, polimérico e cast",
    texto:
      "São os três níveis do vinil adesivo, do mais simples ao mais nobre. O monomérico e o mais barato e de vida curta, bom para interno e campanha rápida; o polimérico aguenta sol e chuva por bem mais tempo e e o padrão de fachada, placa externa e vitrine; o cast e o mais fino e flexível, e o único que acompanha curva, rebaixo e frizo de carro sem levantar. A durabilidade de cada um muda conforme o fabricante e o sol que a peça pega, então confira sempre a ficha do material que você usa.",
    dica: "Fechar preço de monomérico e entregar peça de fachada ou envelopamento e retrabalho na certa: ele encolhe, abre borda branca nas emendas e solta nas curvas antes do que o cliente espera. Se a peça vai para área externa ou superfície curva, o orçamento já tem que nascer polimérico ou cast -- trocar depois significa raspar tudo e imprimir de novo.",
  },
  {
    categoria: "Material",
    termo: "Vinil refletivo",
    texto:
      "Vinil que devolve a luz do farol para quem olha, usado em placa de transito, placa de obra, sinalização de portão e de frota e faixas de segurança. Existe em varios tipos, que mudam o quanto a placa reflete e quanto tempo ela dura; a norma ABNT de películas para sinalização viária (NBR 14644) e quem define o que cada tipo precisa cumprir.",
    dica: "Pergunte QUAL tipo o cliente precisa antes de dar preço. O refletivo mais simples custa bem menos e e o que costuma ser cotado por engano; se a placa e para órgão público, obra ou vistoria de frota, ela pode ser recusada na entrega e refazer sai do seu bolso.",
  },
  {
    categoria: "Material",
    termo: "Vinil translucido",
    texto:
      "Vinil adesivo colorido feito para peça iluminada por trás: ele deixa a luz passar. Vai colado na chapa de acrílico ou de PS leitoso e e ele que da a cor da marca acesa a noite no luminoso, na caixa de luz e na letra caixa iluminada.",
    dica: "Vinil comum na face do luminoso faz a peça acender manchada e escura. E avise antes que a cor apagada, de dia, fica mais fraca e opaca que a cor acesa -- quem aprovou a arte só no papel reclama que 'não ficou igual ao que eu vi'.",
  },
  {
    categoria: "Material",
    termo: "Vinil eletrostático",
    texto:
      "Vinil sem cola nenhuma: gruda no vidro liso só por atração estática. Sai sem deixar resto de cola e pode ser guardado e recolocado depois, então serve para promoção que troca a cada temporada, vitrine de loja, aviso de horário e lembrete de revisão em oficina.",
    dica: "Só funciona em vidro liso e bem limpo -- em parede, vidro texturizado ou superfície rugosa ele simplesmente cai. E qualquer pessoa tira com a mão: nunca venda eletrostático onde o adesivo precisa ficar fixo, como fachada, veículo ou aviso obrigatório.",
  },
  {
    categoria: "Material",
    termo: "Manta magnética (adesivo imantado)",
    texto:
      "Manta fina de ima em rolo que recebe o adesivo impresso e gruda sozinha em superfície de aço, sem furo e sem cola. É a saída para propaganda em porta de carro, van e caminhão quando o cliente quer poder tirar e recolocar, e para placa de troca rápida em quadro metálico.",
    dica: "Ima não gruda em alumínio, fibra ou plástico -- confira a lataria do veículo antes de fechar, e evite aplicar sobre pintura feita ha pouco tempo. Deixe por escrito que a manta precisa ser retirada e o local lavado de tempos em tempos: água e areia presas embaixo mancham a lataria, e o cliente vai cobrar isso de você.",
  },
  {
    categoria: "Material",
    termo: "Vinil de parede (papel de parede impresso)",
    texto:
      "Vinil adesivo próprio para revestir parede inteira com foto, grafismo ou a identidade visual da empresa. Muito usado em recepção, sala de reunião, academia, clínica e loja. Ha versão para parede lisa e versão mais grossa e maleável, que se acomoda melhor em parede texturizada.",
    dica: "O risco esta na parede, não no material: textura forte, umidade, mofo ou pintura velha fazem o adesivo bolhar ou arrancar a tinta na hora de tirar. Veja a parede antes de fechar e deixe por escrito que preparo (lixar, massa, pintura) não esta incluso no valor.",
  },
  {
    categoria: "Material",
    termo: "Tecido para impressão (tela tensionada)",
    texto:
      "Tecido de poliéster impresso, alternativa a lona em ambiente interno: não reflete a luz das lâmpadas, amassa menos e pode ser dobrado para transportar. Na versão de tela tensionada ele leva uma tira de silicone costurada na borda, que encaixa no perfil de alumínio e deixa a peça esticada e sem onda -- padrão de stand de feira, painel de loja e fundo de palco.",
    dica: "Tecido não substitui lona em tempo aberto: chuva, vento e sol acabam com ele. É a tela tensionada só serve na estrutura para a qual foi medida -- errar poucos centímetros na moldura obriga a imprimir tudo de novo, porque não da para emendar nem esticar mais.",
  },
  {
    categoria: "Material",
    termo: "Lona dupla face (blackout)",
    texto:
      "Lona com uma camada escura no meio que impede a luz de atravessar, o que permite imprimir uma arte de cada lado sem que uma apareça por trás da outra. É a lona certa para peça pendurada no meio do ambiente, onde o público passa dos dois lados: supermercado, corredor de shopping, feira e faixa de rua.",
    dica: "Em lona comum a arte do verso aparece espelhada quando bate luz atrás, fica ilegível e o cliente recusa a peça. Se o banner vai ficar suspenso ou contra a janela, orce dupla face desde o início -- corrigir depois e imprimir tudo de novo, não tem remendo.",
  },
  {
    categoria: "Material",
    termo: "Foam board (cartão-espuma)",
    texto:
      "Placa bem leve, feita de espuma de poliestireno entre duas folhas de cartão. Corta facil, custa menos que PVC expandido ou acrílico e serve para display de balcão, painel de evento, prova de maquete e cartaz reforçado -- sempre em ambiente interno e por pouco tempo.",
    dica: "Não pode pegar chuva nem umidade: ondula, o papel descola e não volta ao normal. Amassa no transporte e a marca fica para sempre, então nunca venda foam board para peça que precisa durar, ficar exposta ao tempo ou ser reaproveitada em varios eventos.",
  },
  {
    categoria: "Material",
    termo: "MDF",
    texto:
      "Chapa de madeira reconstituida usada em letra caixa sem iluminação, painel de recepção, totem interno, display e mobiliário de PDV. Aceita corte em máquina, pintura e adesivo por cima, e sai mais barato que acrílico ou metal em peça decorativa de ambiente interno.",
    dica: "MDF comum incha e estufa em contato com água -- em fachada, área externa, banheiro ou parede com infiltração a peça volta deformada. Para uso externo, mude o material (PVC expandido, ACM, acrílico) em vez de prometer ao cliente que da para selar o MDF.",
  },
  {
    categoria: "Material",
    termo: "Policarbonato",
    texto:
      "Placa transparente parecida com o acrílico, porém muito mais resistente a pancada e que aceita ser curvada a frio, sem forno. Entra onde a peça pode levar bolada ou vandalismo: face de luminoso em local de risco, proteção de placa em área pública e sinalização em quadra, escola e indústria.",
    dica: "Peça sempre a versão com proteção UV, senao ele amarela no sol e a peça envelhece feio. Ele também risca mais facil que o acrílico (fora as versões com camada antirrisco), então não e a melhor escolha quando o cliente quer o brilho e a transparência limpa de vitrine.",
  },

  // ---- impressao (pesquisa de 04/08) -------------------------------------
  {
    categoria: "Impressão",
    termo: "Sublimação",
    texto:
      "Jeito de imprimir TECIDO: a arte vai para um papel e a prensa quente transforma a tinta em gás, que entra na fibra. É assim que se produz bandeira, wind banner, fundo de palco e a tela tensionada do stand -- a cor fica dentro do pano, então não racha nem descasca com a dobra.",
    dica: "Só rende em tecido de poliéster. E o tecido fica levemente translucido: se a peça vai ser vista dos dois lados ou contra a luz, combine antes o forro ou mude para lona dupla face.",
  },
  {
    categoria: "Impressão",
    termo: "Tinta branca (branco local)",
    texto:
      "As tintas coloridas são translucidas. Em vidro, acrílico, adesivo transparente ou material escuro a arte some se não houver uma camada de BRANCO por baixo. Nem toda impressora tem tinta branca: nas UV normalmente tem, nas de solvente e latex depende do modelo. No orçamento costuma aparecer como 'branco' ou 'branco local'.",
    dica: "Branco e custo extra e as vezes exige duas passadas para ficar opaco -- coloque no orçamento, não entregue de brinde. E decida com o cliente ANTES: com fundo branco sólido a peça tapa o que esta atrás; sem branco ela fica translucida e mostra a parede ou o movimento da rua. Depois de impresso não tem volta.",
  },
  {
    categoria: "Impressão",
    termo: "Impressão no verso (segunda superfície)",
    texto:
      "Em acrílico e vidro a arte pode ser aplicada por DENTRO, para ser vista através do material. Fica com brilho de vitrine e a tinta não pega risco, chuva nem produto de limpeza, porque a face de fora e o próprio vidro ou acrílico. Comum em placa de acrílico, porta de vidro e balcão de PDV.",
    dica: "O arquivo tem que ir ESPELHADO e a ordem das camadas inverte: o branco entra por último, atrás das cores, e não por baixo. Mandar a arte normal da texto invertido e peça perdida -- confira o espelhamento na prova antes de liberar a produção.",
  },
  {
    categoria: "Impressão",
    termo: "Perfil de cor (ICC)",
    texto:
      "Configuração que ensina a máquina como aquela tinta se comporta naquele material. Cada combinação (lona, vinil, tecido, acrílico) tem a sua. É o que faz o vermelho da marca sair parecido na lona da fachada e no adesivo da vitrine.",
    dica: "Monitor e tela de celular acendem luz e cada aparelho mostra a cor diferente: prometer cor 'igual a da tela' e reclamação garantida. Cor viva demais -- neon, pink elétrico, verde limao -- sempre sai mais apagada no impresso, avise ANTES de fechar. Quando a cor for crítica (franquia, marca conhecida), trabalhe com código de cor e prova impressa no MESMO material da peça, e deixe claro que materiais diferentes nunca ficam 100% iguais entre si.",
  },

  // ---- acabamento (pesquisa de 04/08) ------------------------------------
  {
    categoria: "Acabamento",
    termo: "Verniz (geral e localizado)",
    texto:
      "Camada transparente aplicada por cima da impressão, brilhante ou fosca, na peça inteira ou só em partes -- por exemplo só no logo. Protege a tinta e cria contraste de brilho e uma leve textura que da para sentir com a mão. Muito usado em cartão, embalagem e material de PDV.",
    dica: "Verniz localizado exige um arquivo separado (a 'máscara') marcando onde ele entra; pedir 'verniz no logo' sem essa máscara trava o serviço no meio do caminho. E lembre que o verniz sela o que esta embaixo: poeira, risco ou mancha ficam presos ali para sempre.",
  },
  {
    categoria: "Acabamento",
    termo: "Fita de transferência (transfer tape)",
    texto:
      "Fita larga, transparente ou leitosa, que a gente cola por cima do adesivo já recortado para levar todas as letras juntas e na posição certa, do papel de trás para a parede ou o vidro. Também chamada de máscara de transferência. Existe com grude mais fraco ou mais forte, escolhido conforme o tamanho e o nível de detalhe do recorte.",
    dica: "Adesivo já montado com a fita não pode ficar muito tempo guardado esperando o cliente liberar a parede: com o tempo a fita gruda demais no vinil e a letra rasga na hora de aplicar. Combine a data da instalação antes de mandar montar a peça.",
  },
  {
    categoria: "Acabamento",
    termo: "Meio corte (kiss cut)",
    texto:
      "Corte que atravessa só o adesivo e para no papel de trás, então a peça continua presa na folha e o cliente destaca uma a uma. É o que permite cartela de adesivos, etiqueta em bloco e adesivo de vitrine em série. Quando a lamina corta tudo, inclusive o papel de trás, chama-se corte total.",
    dica: "Lamina apertada demais marca o papel de trás e a cartela rasga sozinha no transporte; lamina fraca demais e o cliente não consegue descolar. Em tiragem grande, aprove uma amostra física antes de mandar rodar tudo.",
  },
  {
    categoria: "Acabamento",
    termo: "Depilação e refile",
    texto:
      "Depilar e tirar com a pinca todo o vinil que sobra em volta das letras depois do recorte. Refilar e aparar as bordas da peça no esquadro depois de impressa ou laminada. As duas etapas são feitas na mão, por uma pessoa, e não pela máquina.",
    dica: "Letra fininha, fonte com serifa, contorno vazado e detalhe miúdo multiplicam o tempo de depilação e por isso encarecem a peça, mesmo ela sendo pequena. Explique isso ainda no orçamento, senao vem depois o 'mas e só um adesivo'.",
  },
  {
    categoria: "Acabamento",
    termo: "Cantoneira e moldura",
    texto:
      "Perfil de alumínio em L ou em U que fecha a borda da placa, do quadro ou do painel. Faz duas coisas ao mesmo tempo: esconde o corte e o miolo do material e da rigidez para a peça não empenar com o tempo.",
    dica: "A moldura entra por cima da arte e muda a medida final. Quem manda a arte no tamanho exato do vão ou do vidro, sem descontar o perfil, ve texto e logo sumirem por baixo da moldura. Acerte medida de arte e medida externa antes de mandar aprovar.",
  },
  {
    categoria: "Acabamento",
    termo: "Vinco e dobra",
    texto:
      "Vinco e a marca feita no material para ele dobrar sempre na linha certa e sem quebrar; a dobra e o resultado. Aparece em display de balcão, caixa, cavalete e placa com aba de fixação. Em papel e cartão o vinco vem da faça de corte e vinco; em PVC expandido e ACM a dobra vem de um rasgo em V usinado nas costas da chapa.",
    dica: "Sem vinco, o cartão e o PVC trincam na dobra e a quina fica esbranquiçada - o cliente le isso como defeito. A dobra ainda come alguns milímetros do material, então encaixe e medida final se conferem na amostra montada, não só no desenho.",
  },
  {
    categoria: "Acabamento",
    termo: "Fecho de contato (velcro)",
    texto:
      "Fita de contato em duas partes, uma no fundo e outra na peça, que deixa colocar e tirar quantas vezes quiser. Muito usada em PDV, feira, stand, banner de tecido e comunicação que troca a cada campanha. Velcro e marca que virou o nome popular do produto.",
    dica: "A versão adesiva segura mal em parede pintada, com textura ou papel de parede, e na hora de tirar costuma arrancar pedaço da tinta. No tecido, o lado aspero vai puxando fiapo com o uso. Para troca frequente, velcro costurado na peça dura muito mais do que só colado.",
  },
  {
    categoria: "Acabamento",
    termo: "Laminado antiderrapante para piso",
    texto:
      "Filme de proteção com textura aplicado por cima do adesivo de chão. Protege a impressão do pisoteio, do carrinho e do produto de limpeza e, ao mesmo tempo, da agarre ao pe para o adesivo não virar escorregador. É um laminado específico de piso, diferente do laminado comum de impressão. Indicado onde passa muita gente: loja, supermercado, galeria e evento.",
    dica: "Adesivo de chão sem esse laminado risca e desbota rápido em área de movimento, e molhado vira risco de queda, problema que sobra para o cliente. E em piso texturizado, poroso ou encerado ele não cola direito nem com laminado: confira o piso na medição antes de vender.",
  },

  // ---- peca (pesquisa de 04/08) ------------------------------------------
  {
    categoria: "Peça",
    termo: "Roll-up (banner retratil)",
    texto:
      "Banner que fica enrolado dentro de uma base de alumínio: puxa a lona para cima, encaixa a haste e esta montado em poucos minutos; depois a lona volta para dentro da base e vai na bolsa de transporte. Usado em feira, recepção, evento, treinamento e loja, quando a peça precisa aparecer hoje e sumir amanha. A medida mais vendida fica perto de 80 cm de largura por 2 m de altura, e existem versões mais largas.",
    dica: "A lona precisa ser a própria para roll-up, com camada que bloqueia a luz, senao aparece a sombra da estrutura e a imagem do outro lado. A arte também perde alguns centímetros em cima (na haste) e embaixo (na parte presa a base), então logo e telefone colados na borda somem. E quando o cliente só vai trocar a campanha, venda só a lona nova: a estrutura ele já tem e ela custa mais que o refil.",
  },
  {
    categoria: "Peça",
    termo: "Porta-banner X e L",
    texto:
      "Suportes simples e baratos para segurar banner. O X e uma cruzeta que estica a lona pelos quatro cantos, com elástico ou ilhós; o L e uma base com haste que prende a peça em cima e embaixo. Servem para ação rápida, stand pequeno, panfletagem e loja, quando o roll-up sai caro demais.",
    dica: "São os suportes que mais tombam com vento e esbarrão: em calçada, corredor movimentado ou área aberta, avise o risco e ofereca cavalete ou roll-up de base pesada. E a lona tem que sair com os pontos de fixação (ilhós ou reforço) na medida exata do suporte; fora da medida ela fica frouxa e enrugada já na primeira foto.",
  },
  {
    categoria: "Peça",
    termo: "Cavalete de calçada (A-frame)",
    texto:
      "Placa de duas faces em formato de A que fica na porta da loja ou no corredor do shopping chamando quem passa. Feito em metal, plástico ou madeira, com a arte em adesivo, chapa de PVC ou quadro de giz para trocar a oferta quando quiser. Vende muito para restaurante, bar, farmacia e loja de rua.",
    dica: "Calçada e espaço público: a maior parte das cidades exige autorização e passagem livre para o pedestre, e o fiscal recolhe a peça irregular. Confirme a regra da cidade antes de fechar e deixe claro que a licença e responsabilidade do cliente. Oriente também a recolher a noite, porque cavalete leve tomba com vento e some com facilidade.",
  },
  {
    categoria: "Peça",
    termo: "Placa de obra",
    texto:
      "Placa que identifica quem responde tecnicamente pela obra: nome do profissional, título, número de registro no conselho (CREA para engenheiro, CAU para arquiteto), o número da anotação de responsabilidade (ART ou RRT) e a atividade sob responsabilidade. A lei obriga a manter a placa visível e legível enquanto a obra durar. Não confunda com a placa de marketing do empreendimento, que e outra peça e outro orçamento.",
    dica: "Quem dita o conteudo e o profissional responsável, não o dono da obra nem você: peça por escrito o registro e o número da ART ou RRT antes de produzir, porque número errado significa placa refeita por sua conta e risco de autuação para o cliente. Tamanho, itens obrigatórios e local seguem regra do conselho e, as vezes, da prefeitura, então confirme antes de fechar a medida.",
  },
  {
    categoria: "Peça",
    termo: "Tapume de obra adesivado",
    texto:
      "O fechamento da obra (chapa de madeira, OSB ou metal) revestido com lona ou adesivo impresso, virando uma midia enorme na calçada. Muito usado em lançamento imobiliário, reforma de loja e obra dentro de shopping: esconde o canteiro, protege quem passa e já anuncia o que vem ai.",
    dica: "Tapume de madeira não e superfície lisa: OSB e compensado são porosos, tem emenda, prego e folga entre as chapas, e o adesivo bolha e descola na primeira chuva. Nesses casos o certo e lona impressa esticada e grampeada, deixando o adesivo para chapa lisa, limpa e seca. Combine no orçamento quem retira no fim (e a parte sempre esquecida) e confirme se a prefeitura ou a administração do shopping limita anúncio no tapume.",
  },
  {
    categoria: "Peça",
    termo: "Faixa de rua",
    texto:
      "Faixa de lona comprida, com bainha e corda nas pontas, amarrada entre postes, arvores ou muros para anunciar promoção, evento ou festa por poucos dias. Barata e rápida, e feita para leitura a distância: cabe pouca palavra e a letra precisa ser bem grande.",
    dica: "Em via pública a faixa quase sempre depende de autorização e tem prazo curto de permanência; sem isso o fiscal recolhe e a multa sobra para o cliente. Deixe por escrito que licença, pendurar e retirar são com ele, ou cobre esse serviço a parte. Cuidado redobrado com pedido de candidato: a lei eleitoral proibe propaganda em poste, arvore e outros bens de uso comum, então a peça pode virar problema mesmo pronta e paga.",
  },
  {
    categoria: "Peça",
    termo: "Testeira",
    texto:
      "Faixa horizontal que fecha a parte de cima de uma área. Na gondola do supermercado, e a tira que identifica a categoria ou a promoção no topo da prateleira, normalmente em poliestireno ou PVC fino. Na loja, a testeira de fachada e a faixa acima da vitrine ou do toldo com o nome do negocio. Nos dois casos e a peça que a pessoa le de longe antes de olhar o resto.",
    dica: "Testeira de gondola quase nunca e uma peça só: são dezenas iguais por loja. Peça a medida real do trilho e a contagem por corredor, porque errar a medida inutiliza o lote inteiro, não uma peça. Na fachada, a testeira conta como anúncio e costuma entrar na área que a prefeitura fiscaliza, então confira o limite da cidade antes de aumentar a letra.",
  },
  {
    categoria: "Peça",
    termo: "Stopper, wobbler e mobile",
    texto:
      "O trio de peças pequenas que chama atenção dentro da loja. O stopper sai perpendicular a prateleira e corta o corredor na altura dos olhos; o wobbler fica preso por uma haste flexível e balanca na frente do produto; o mobile fica pendurado no teto marcando a área da campanha. É o básico de ação de PDV: barato por unidade e vendido em quantidade.",
    dica: "Quem decide não e a arte, e a regra do varejo: muita rede proibe furar ou colar na gondola, limita a altura do mobile e só aceita material aprovado por ela. Pergunte a norma da rede antes de produzir mil peças. E trate como material de consumo: quem instala e a equipe de merchandising, então venda com sobra para reposição, porque sempre some peça no caminho.",
  },
  {
    categoria: "Peça",
    termo: "Display de chão e ilha promocional",
    texto:
      "Expositor solto no piso da loja que segura o produto e faz a propaganda ao mesmo tempo. Em papelão ondulado quando a ação dura poucas semanas; em MDF, poliestireno ou metal quando fica meses. Ilha e a versão maior, montada no meio do corredor ou na ponta de gondola.",
    dica: "Papelão aguenta pouco peso e não sobrevive a piso molhado ou área de entrada: se o produto for pesado ou a ação longa, o barato sai caro e a marca fica torta na loja. Pergunte sempre o peso do produto e o tempo da ação antes de indicar o material, e confirme se a peça montada passa pela porta e pelo elevador e cabe no espaço que a loja liberou.",
  },
  {
    categoria: "Peça",
    termo: "Neon de LED (neon flex)",
    texto:
      "Mangueira flexível de LED que imita o brilho do neon antigo de vidro. Ela e moldada no formato da letra ou do desenho e fixada sobre uma base recortada em acrílico ou PVC. Não tem tubo de vidro para quebrar nem a alta tensão do neon de gás, e consome pouca energia. Virou o preferido em bar, café, salão de beleza, recepção e painel de foto.",
    dica: "O desenho manda no orçamento: traco muito fino, letra cheia de detalhe ou fonte com serifa não viram mangueira, então simplifique a arte junto com o cliente antes de fechar o preço. Combine também de onde vem a energia, porque a maioria das versões trabalha com fonte, que precisa de tomada perto e de um lugar escondido para ficar. Para área externa, exija do fornecedor a versão própria para chuva e sol com fonte protegida: a de interior desbota e falha rápido no tempo.",
  },
  {
    categoria: "Peça",
    termo: "Painel de LED (midia digital)",
    texto:
      "Tela formada por modulos de LED que exibe imagem e vídeo, com o conteudo trocado por computador ou celular. Entra no lugar do luminoso ou da placa fixa quando o cliente quer mudar a oferta o tempo todo: fachada de loja, totem, palco, recepção e placar.",
    dica: "O número com P (P4, P6, P10) e a distância em milímetros entre os pontos de luz e manda na nitidez: pela regra prática do mercado, quanto maior o número, mais longe a pessoa precisa estar para a imagem fechar, então painel de P alto colocado na porta da loja fica granulado de perto. Antes de orçar confirme três coisas: de que distância as pessoas olham, se e uso externo (chuva, sol e brilho que vence a luz do dia) e quem vai atualizar o conteudo depois, porque painel sem responsável vira quadro parado. Confira ainda se a prefeitura permite anúncio luminoso ou com movimento naquele ponto.",
  },
  {
    categoria: "Peça",
    termo: "Sinalização de emergência (fotoluminescente)",
    texto:
      "Placas e faixas de saída, extintor, hidrante e rota de fuga feitas em material que absorve luz e continua brilhando no escuro, guiando a saída quando falta energia ou ha fumaça. Faz parte do projeto de prevenção de incêndio e e conferida na vistoria do Corpo de Bombeiros, por isso o pedido quase sempre chega com prazo apertado.",
    dica: "Aqui não se cria layout: cor, símbolo, tamanho e posição seguem a norma de sinalização de emergência (ABNT NBR 16820, que substituiu a antiga NBR 13434) e o projeto aprovado pelos bombeiros. Peça bonita fora do padrão reprova na vistoria e volta para refazer, no prazo do cliente. Use material fotoluminescente certificado e nunca substitua por adesivo comum impresso em verde, que não brilha no escuro.",
  },
  {
    categoria: "Peça",
    termo: "Placa em braile e alto-relevo",
    texto:
      "Placa de identificação de sala, banheiro, elevador e escada com o texto também em relevo e em braile, para quem não enxerga ler com o dedo. É exigida em prédio público e em boa parte dos lugares que atendem público, seguindo a norma de acessibilidade ABNT NBR 9050.",
    dica: "A norma define o básico e e onde todo mundo erra: a placa vai na parede ao lado da porta, do lado da maçaneta, nunca na folha da porta (que se move), numa altura de alcance da mão (por volta de 1,20 m a 1,60 m do piso), com contraste forte entre texto e fundo, o braile abaixo do texto em relevo e sem quina cortante. Braile só impresso ou desenhado não vale: o ponto precisa ser relevo de verdade. Erro aqui não volta como reclamação de arte, volta como reclamação de acessibilidade.",
  },

  // ---- instalacao (pesquisa de 04/08) ------------------------------------
  {
    categoria: "Instalação",
    termo: "Aplicação a seco e a úmido",
    texto:
      "São as duas formas de assentar o adesivo. A seco e o padrão hoje: mais rápida, e o vinil já agarra assim que encosta, sobrando pouca margem para corrigir a posição. A úmido, o instalador borrifa água com um pingo de detergente para o adesivo deslizar e dar para ajustar, e só vale em superfície lisa que não sofre com água, como vidro e metal.",
    dica: "Na aplicação a úmido a peça ainda precisa secar por baixo, e nesse tempo pode aparecer bolha ou borda solta; já os vinis com canal de ar foram feitos para trabalhar a seco. Se a peça e grande, combine o método com a produção antes do dia da instalação, em vez de decidir na obra.",
  },
  {
    categoria: "Instalação",
    termo: "Preparação da superfície (limpeza e promotor de aderência)",
    texto:
      "Antes de colar qualquer coisa, a superfície tem que estar limpa, seca e sem gordura, normalmente com álcool isopropílico e um pano que não solta fiapo. Em material difícil, como alguns plasticos, metal pintado e superfície porosa, usa-se ainda o promotor de aderência (o primer), passado antes da fita ou do adesivo e deixado secar.",
    dica: "Parede recém-pintada, textura, cal e madeira crua são as campeas de adesivo caindo depois. Se o cliente ainda vai pintar, a ordem certa e pintar, esperar a tinta curar pelo prazo que o fabricante da tinta indica e só então instalar; fora dessa ordem, o retrabalho fica por conta da casa.",
  },
  {
    categoria: "Instalação",
    termo: "Fita dupla face estrutural (fita VHB)",
    texto:
      "Fita de espuma acrílica de dupla face que cola de vez, sem furo e sem parafuso aparente, usada para prender letra, placa, painel e chapa de ACM. Nas versões indicadas para área externa, substitui rebite e solda em muita aplicação e ainda acompanha a dilatação das peças com o calor. VHB e marca da 3M que virou o nome popular da fita.",
    dica: "Ela não chega na força total na hora: tem um tempo de cura antes de poder receber carga, e não perdoa superfície suja, úmida, porosa ou fora de esquadro, nem dia muito frio. Peça pesada ou parede irregular pede também fixação com parafuso, senao a peça desce sozinha depois.",
  },
  {
    categoria: "Instalação",
    termo: "Kit de fixação (bucha, parafuso, silicone)",
    texto:
      "É todo o miúdo que de fato segura a peça no lugar: bucha, parafuso, chumbador, rebite, silicone e vedante. Muda conforme a parede, porque drywall, gesso, tijolo furado, concreto e vidro pedem buchas diferentes, e cada combinação aguenta um peso.",
    dica: "É o item que mais some do orçamento e depois volta como custo do instalador ou visita extra. Pergunte na medição de que e a parede e deixe o kit escrito na proposta; bucha de concreto em drywall e chamado de garantia na certa.",
  },
  {
    categoria: "Instalação",
    termo: "Espaçador (prolongador)",
    texto:
      "Pecinha cilíndrica de alumínio ou inox que afasta a letra, a placa ou o painel da parede, criando um vão com sombra atrás. É o que da o efeito de peça flutuando, com cara de trabalho mais caro, e também e usada para prender chapa de acrílico e vidro.",
    dica: "Como fica um vão, tudo que estiver atrás aparece: fio solto, bucha torta, parede manchada. Exige parede regular e furação por gabarito, e em área externa entra sujeira e água no vão - avise que vai precisar de limpeza de vez em quando.",
  },
  {
    categoria: "Instalação",
    termo: "ART e RRT (responsável técnico)",
    texto:
      "ART e a anotação que o engenheiro registra no CREA; RRT e o documento equivalente do arquiteto, no CAU. É o papel que diz quem responde tecnicamente pelo cálculo, pelo projeto e pela montagem da peça. Costuma ser exigido em totem, painel, letreiro grande e estrutura em altura, principalmente quando prefeitura, shopping ou condominio pede o documento antes de liberar o serviço.",
    dica: "A ART tem custo e prazo próprios e precisa existir ANTES de começar a montagem; se o cliente só lembrar disso no dia, a equipe volta com a peça no caminhão. Deixe escrito no orçamento quem paga e o que ela cobre (projeto, execução ou os dois).",
  },
  {
    categoria: "Instalação",
    termo: "Carga de vento",
    texto:
      "É a força que o vento faz na peça depois de instalada. Quanto maior e mais alta a placa, mais ela empurra a estrutura e os pontos de fixação, e por isso o dimensionamento de peça grande segue a norma brasileira de forças devidas ao vento em edificações (ABNT NBR 6123). Aparece em fachada, painel, totem e qualquer letreiro em altura ou sobre laje.",
    dica: "Peça fechada pega muito mais vento que peça vazada ou com tela mesh, então não da para orçar uma fachada grande só multiplicando o preço de uma pequena: a estrutura muda. Vento e o que derruba letreiro em temporal, e ai vira acidente, não só retrabalho.",
  },
  {
    categoria: "Instalação",
    termo: "NR-10 (serviço com eletricidade)",
    texto:
      "Norma de segurança do trabalho para quem mexe com eletricidade: exige treinamento específico e procedimento próprio para ligar, alterar ou dar manutenção em peça energizada. Vale para luminoso, letra caixa iluminada, totem com LED e qualquer ligação no quadro do cliente. Montar peça sem energia não entra nessa exigência, mas trabalhar perto de fiação viva entra.",
    dica: "Escreva no orçamento até onde vai o serviço elétrico da Impresilk e onde começa o do eletricista do cliente. Sem isso no papel, se depois queimar fonte, cair disjuntor ou dar curto, a garantia vira discussão sobre quem ligou.",
  },
  {
    categoria: "Instalação",
    termo: "Plataforma elevatoria e andaime",
    texto:
      "São as duas formas de chegar em altura. A plataforma elevatoria (tesoura, articulada ou de lança, que muita gente chama de sky) sobe rápido e deixa o instalador rente a fachada, mas precisa de piso firme e espaço para manobrar. O andaime sai mais barato de alugar, porém leva tempo para montar e desmontar e ocupa a calçada. A escolha depende da altura, dos obstaculos (marquise, toldo, canteiro, fio) e de quantos dias a equipe vai ficar.",
    dica: "Em fachada alta o acesso pode custar mais que a própria peça, e a locação e cobrada por diária: dia perdido por chuva, loja fechada ou autorização que não saiu e prejuízo direto. Confirme altura, acesso e tipo de piso na medição e cobre o acesso no orçamento, nunca de cortesia.",
  },
  {
    categoria: "Instalação",
    termo: "Chumbador e tipo de parede",
    texto:
      "O que segura a peça não e a placa, e o ponto de fixação, e cada base pede um tipo. Alvenaria e concreto aceitam chumbador; drywall só aguenta peça leve, com bucha própria para parede oca ou reforço por dentro; vidro normalmente pede prendedor específico ou fixação na estrutura de alumínio; e ACM e revestimento, não base, então precisa de estrutura por trás.",
    dica: "Descubra do que a parede e feita ainda na medição, com o cliente autorizando um ponto de teste. Letreiro grande preso só no gesso ou só no ACM cede com o tempo e arranca o revestimento junto; o conserto sai bem mais caro que o reforço que você deixou de vender.",
  },
  {
    categoria: "Instalação",
    termo: "Vistoria da base (marquise e laje antiga)",
    texto:
      "Antes de pendurar peso, alguém precisa olhar em que estrutura a peça vai se apoiar. Marquise e laje em balanço de prédio antigo podem estar com a ferragem corroida e não aguentar carga nova; nesse caso quem avalia e um engenheiro, com laudo. Vale sempre que a peça for pesada, ficar sobre a calçada ou o prédio for velho.",
    dica: "Sinais de alerta na medição: mancha de infiltração, ferro aparecendo, concreto lascado e outras cargas já penduradas (ar condicionado, letreiro antigo). Se a marquise ceder, a responsabilidade principal e do dono do imóvel, mas quem instalou entra na briga do mesmo jeito: registre por escrito o que você viu.",
  },
  {
    categoria: "Instalação",
    termo: "Afastamento da rede elétrica",
    texto:
      "Fachada com fio de energia passando na frente exige manter distância de segurança, e a regra e tratar a rede como sempre energizada, mesmo parecendo desligada. Quando não da para manter esse afastamento, o caminho e pedir desligamento programado a concessionária (aqui, a Cemig), que tem pedido, agenda e prazo próprios. Comum em rua comercial estreita e em letreiro alto perto do poste.",
    dica: "Desligamento não sai de um dia para o outro nem no horário que você escolher, então nunca prometa data de instalação antes de confirmar. Fotografe a rede na medição: marcar montagem sem olhar o fio e risco de acidente grave ou de remarcar tudo.",
  },
  {
    categoria: "Instalação",
    termo: "Ponto de energia e disjuntor",
    texto:
      "Peça iluminada precisa de um ponto de energia chegando até ela, com disjuntor adequado e, de preferência, um circuito só para o letreiro, como manda a norma brasileira de instalações eletricas de baixa tensão (ABNT NBR 5410). Quem costuma deixar esse ponto pronto e o eletricista do cliente, e ele tem que estar no lugar antes do dia da instalação. Quem instala liga a peça no ponto que JÁ existe: levar a energia até ali -- passar cabo, disjuntor, tomada, quadro -- e serviço elétrico, e precisa estar escrito de quem e.",
    dica: "Ligar o luminoso no mesmo circuito da loja faz o disjuntor cair quando tudo liga junto, e o cliente vai culpar o letreiro. Peça o ponto com antecedência e combine em que altura e posição ele deve sair: furar parede e puxar fio depois estraga acabamento já pronto. Sem esse combinado no papel, a peça chega pronta no dia da inauguração e simplesmente não acende -- e a cobrança cai em quem vendeu.",
  },
  {
    categoria: "Instalação",
    termo: "Aterramento e DR",
    texto:
      "Aterramento e o fio terra ligado a parte metálica da peça; o DR e o dispositivo do quadro que desarma sozinho quando ha fuga de corrente. Como totem, luminoso e estrutura de letra caixa ficam ao alcance das pessoas e tomam chuva, essa proteção e o que evita choque, e a norma de instalações eletricas de baixa tensão pede isso em área externa.",
    dica: "Muita peça antiga na rua esta sem terra e ninguém percebe até alguém tomar choque encostando no totem molhado. Se o quadro do cliente não tem DR nem terra, registre por escrito antes de energizar: depois do susto ninguém lembra do que foi combinado só na conversa.",
  },
  {
    categoria: "Instalação",
    termo: "Manutenção preventiva de luminoso",
    texto:
      "Revisão periodica da peça iluminada: testar acendimento e uniformidade, reapertar a fixação, limpar, conferir vedação e sinal de infiltração e revisar fonte, ligações e aterramento. O intervalo entra no contrato e fica mais curto onde tem muita poeira, maresia ou poluição. É o que mantém o letreiro aceso e firme depois que a garantia acaba.",
    dica: "LED não apaga tudo de uma vez: perde brilho e vai falhando por módulo, deixando o letreiro manchado bem na campanha do cliente. Ofereca o contrato de manutenção na entrega, enquanto ele esta satisfeito; depois ele só liga quando já esta apagado e com pressa.",
  },
  {
    categoria: "Instalação",
    termo: "Janela de instalação",
    texto:
      "É o horário em que se pode instalar. Shopping normalmente só libera serviço barulhento ou que gera poeira depois do fechamento, com autorização previa e documentos da equipe; rua movimentada e centro comercial tem restrição de carga e descarga e pedem montagem bem cedo ou no domingo. Isso muda o custo e a data da entrega.",
    dica: "Madrugada, fim de semana e feriado custam mais e precisam estar no orçamento, não ser descobertos no dia. Se o cliente for de shopping, peça o manual do lojista logo na proposta: costuma exigir projeto assinado, responsável técnico, documentos de segurança da equipe e até seguro antes de deixar alguém entrar.",
  },
  {
    categoria: "Instalação",
    termo: "Isolamento de área",
    texto:
      "É fechar com cone, fita e placa a área embaixo e ao redor de quem esta trabalhando em altura, para ninguém passar onde pode cair ferramenta ou pedaço da peça. Quem executa o serviço e o responsável por sinalizar e isolar. Vale em qualquer instalação sobre calçada, porta de loja ou lugar com gente circulando.",
    dica: "O cliente quase sempre pede para não atrapalhar o movimento, mas uma ferramenta caindo de cinco metros machuca sério. Se não da para isolar em horário comercial, a instalação tem que ser fora do horário, e isso precisa entrar no preço desde o orçamento, não virar discussão no dia.",
  },
  {
    categoria: "Instalação",
    termo: "Deslocamento e diária de equipe",
    texto:
      "Serviço fora da cidade ou em local difícil tem custo próprio: viagem e alimentação da equipe, frete da peça, hospedagem e aluguel de andaime ou plataforma elevatoria, que costumam ser cobrados por diária. Esse custo entra na proposta separado do valor da peça.",
    dica: "Se a equipe chega e o local não esta pronto (parede em obra, loja fechada, energia desligada, sem liberação do shopping), a viagem foi perdida e voltar e outra diária. Confirme na véspera com quem tem a chave e deixe escrito no orçamento que a segunda ida e cobrada.",
  },

  // ---- arte e processo (pesquisa de 04/08) -------------------------------
  {
    categoria: "Arte e processo",
    termo: "Vetor x bitmap",
    texto:
      "Vetor e desenho feito por cálculo de linhas e curvas: da para ampliar de cartão para fachada sem perder nitidez. Bitmap e feito de pontinhos (foto, print, imagem baixada da internet): ampliou demais, borra e quadricula. Logo, texto e qualquer coisa que va ser recortada pedem vetor. Na prática: logo em PNG ou JPG e bitmap; o original vem em .cdr, .ai, .eps ou PDF vetorial.",
    dica: "O logo que chega em PNG pelo WhatsApp quase sempre e bitmap e não serve para letra caixa, recorte nem fachada. Peça o arquivo vetorial já no primeiro contato, ou o maior original que o cliente tiver, e orce a vetorização quando não existir -- descobrir isso na véspera da produção atrasa a obra inteira. Aumentar o DPI no programa não resolve: não volta detalhe que a imagem nunca teve. Logo tirado do WhatsApp, do Instagram ou do Google fica serrilhado quando amplia, e isso só aparece com a peça já impressa -- peça o arquivo original antes de orçar.",
  },
  {
    categoria: "Arte e processo",
    termo: "Linha de corte (corte contorno)",
    texto:
      "Linha desenhada no arquivo, em camada e cor separadas, que diz a máquina por onde recortar. Usada em adesivo de formato livre, etiqueta, letra recortada e peça em ACM ou acrílico. Também aparece como corte contorno, corte especial ou CutContour.",
    dica: "Essa linha não pode estar misturada com a arte: se ficar junto, ela sai impressa e vira um risco visível na peça. E a arte precisa sobrar um pouco para fora do corte -- se terminar exatamente em cima da linha, qualquer desvio de milímetros deixa uma tira branca aparecendo na borda.",
  },
  {
    categoria: "Arte e processo",
    termo: "Arquivo aberto e arquivo fechado",
    texto:
      "Arquivo aberto e o arquivo de trabalho, que ainda da para editar (CorelDRAW .cdr, Illustrator .ai, Photoshop .psd). Arquivo fechado e a versão pronta só para imprimir, normalmente em PDF, com as fontes e as imagens já embutidas. Para produzir a peça a gente precisa do aberto ou de um PDF fechado direito; print de tela e foto do layout não servem.",
    dica: "Se o cliente quiser ficar com o arquivo aberto no fim do trabalho, combine isso e o valor ANTES de começar: com o aberto na mão ele reimprime com qualquer concorrente. E arquivo aberto só abre certo se as fontes e as imagens usadas forem junto.",
  },
  {
    categoria: "Arte e processo",
    termo: "Arte final",
    texto:
      "É o arquivo pronto para produção: no tamanho real da peça, nas cores certas, com sobra de corte, textos revisados e logo em qualidade suficiente para o tamanho final. Layout bonito na tela não e arte final; arte final e o que a máquina vai imprimir ou cortar e o instalador vai seguir.",
    dica: "Arte que o cliente manda 'pronta' quase nunca esta em arte final. Confira antes de prometer prazo e combine a conferência e o ajuste como serviço, senao a produção para no meio esperando o arquivo certo e o atraso sobra para a gente.",
  },
  {
    categoria: "Arte e processo",
    termo: "Fontes em curvas",
    texto:
      "É transformar as letras em desenho, para o texto não depender mais da fonte instalada no computador. É o padrão para mandar arquivo para produção: sem curvas, o computador da produção troca por uma fonte parecida e o texto sai com outra letra, espaço errado ou símbolo estranho.",
    dica: "Depois de converter, o texto não da mais para editar nem corrigir erro de digitação. Guarde sempre duas versões, uma editável e uma em curvas; senao trocar um telefone vira arte nova do zero.",
  },
  {
    categoria: "Arte e processo",
    termo: "Layout e mockup (simulação)",
    texto:
      "Layout e o desenho da arte em si. Mockup, ou simulação, e essa arte montada na foto do lugar real (a fachada do cliente, a vitrine, o carro) para ele ver como vai ficar. É o que mais ajuda a fechar venda, porque tira a peça da imaginação.",
    dica: "Diga que a simulação e ilustrativa. Ângulo e luz da foto enganam tamanho, brilho e cor, e o resultado real ainda depende da parede, do vidro ou da lataria onde a peça vai. Cliente que entende simulação como foto do produto reclama na entrega.",
  },
  {
    categoria: "Arte e processo",
    termo: "Aprovação de arte",
    texto:
      "É o aceite do cliente, por escrito, no arquivo exato que vai para produção. Só depois dela a empresa compra material, imprime e corta. Por isso o prazo de produção começa a contar da aprovação, e não do dia em que o pedido foi feito.",
    dica: "'Ta bom' no telefone não vale como aprovação. Peça resposta escrita no WhatsApp ou e-mail com o arquivo anexo, e avise que texto, telefone, nome, endereço e medidas são conferidos pelo cliente: erro que passou na arte aprovada e refeito por conta dele.",
  },
  {
    categoria: "Arte e processo",
    termo: "Alteração depois da aprovação",
    texto:
      "É qualquer mudança pedida depois que o cliente já aprovou a arte. Enquanto esta só no arquivo, mudar custa tempo. Depois que o material foi impresso, recortado, dobrado ou soldado, não tem volta: refazer e material novo, máquina de novo e prazo novo.",
    dica: "Escreva no orçamento quantas alterações entram sem custo na fase de arte e que, após a aprovação, a mudança vira peça nova. Sem essa linha no papel, a terceira e a quarta versão viram discussão de preço na hora da entrega.",
  },
  {
    categoria: "Arte e processo",
    termo: "Vetorização (redesenho do logo)",
    texto:
      "É redesenhar o logo em vetor quando o cliente só tem PNG, JPG ou uma foto do letreiro antigo. É serviço de arte, com tempo e custo próprios; não e 'converter o arquivo' num clique.",
    dica: "Vetorização automática deixa borda tremida e canto torto, e defeito pequeno na tela vira defeito grande na fachada. Peça o redesenho na mão e mostre para o cliente aprovar antes de cortar. Combine também se o vetor fica com ele ou só com a empresa: entregar sem combinar e dar de graça o que foi pago uma vez.",
  },
  {
    categoria: "Arte e processo",
    termo: "Direito de uso de imagem, fonte e marca",
    texto:
      "Foto, ilustração e fonte tipográfica tem dono e vem com uma licença escrita que diz onde podem ser usadas. Existe licença gratuita, licença paga e a de uso editorial (jornalístico), que NÃO vale para propaganda. Imagem achada no Google e fonte 'grátis' baixada de qualquer site costumam não ter licença para uso comercial.",
    dica: "Fachada, outdoor e envelopamento são as peças mais visíveis, justamente as que atraem cobrança de direito autoral. Guarde o comprovante da licença junto do pedido e nunca use foto de pessoa, personagem ou marca de terceiro sem autorização. Se a conversa virar dúvida jurídica, não opine: passe para a direção.",
  },
  {
    categoria: "Arte e processo",
    termo: "Manual de marca",
    texto:
      "É o documento com as regras da identidade visual do cliente: cores oficiais, versões permitidas do logo, tamanho mínimo, espaço livre em volta e o que não pode ser feito. Empresa média e grande, franquia e órgão público quase sempre tem um.",
    dica: "Peça o manual ANTES de desenhar. Franquia costuma exigir aprovação da rede, e fachada fora do padrão pode ser mandada refazer com a peça já instalada. Cor 'parecida' com a da marca também e motivo de recusa.",
  },
  {
    categoria: "Arte e processo",
    termo: "Prazo de produção, de entrega e de instalação",
    texto:
      "São três prazos diferentes. Produção e o tempo de fabricar a peça, contado da aprovação da arte e do pagamento combinado. Entrega e o transporte até o local. Instalação e a data em que a equipe monta, que depende da agenda, do equipamento e do local liberado.",
    dica: "Informe os três separados e por escrito, nunca um número único. A instalação depende do que esta fora da fábrica: chuva, obra atrasada, energia desligada, autorização pendente e horário permitido por shopping ou condominio. Peça pronta parada esperando liberação e prejuízo dos dois lados.",
  },

  // ---- comercial (pesquisa de 04/08) -------------------------------------
  {
    categoria: "Comercial",
    termo: "Metro quadrado (m2)",
    texto:
      "É a unidade em que quase tudo se vende: multiplica-se a largura pela altura da peça pronta (2,00 x 1,00 = 2 m2) e aplica-se o preço do material com o acabamento. Vale para lona, adesivo, chapa e painel. Peça de formato recortado costuma ser cobrada pelo retângulo que ela ocupa no material, e não pelo desenho, porque a sobra em volta se perde.",
    dica: "Quando o cliente diz 'minha fachada tem 10 metros', ele quase sempre esta falando só da largura. Pergunte a altura antes de dar qualquer preço: 10 x 1,20 e o dobro de 10 x 0,60. E confirme se a medida e do vão ou da peça acabada, porque bainha e dobra também consomem material.",
  },
  {
    categoria: "Comercial",
    termo: "Preço mínimo",
    texto:
      "Valor mínimo cobrado por peça ou por pedido, mesmo quando a conta do metro quadrado daria menos. Existe porque atender, fechar a arte, ligar a máquina, cortar, dar acabamento e embalar custa quase o mesmo numa peça de 20 cm e numa de 2 metros. Cada empresa define o seu.",
    dica: "O cliente vai fazer regra de três na sua frente ('se 1 m2 custa X, meu adesivo de 20 cm devia ser X dividido por 25'). Diga o valor mínimo no começo da conversa, nunca depois do orçamento pronto: dito no fim, soa como aumento de preço.",
  },
  {
    categoria: "Comercial",
    termo: "Aproveitamento de material (perda)",
    texto:
      "Os materiais vem em bobina (rolo) ou em chapa de tamanho fechado de fábrica, e o que sobra da tira ou da chapa e perda que entra no preço. Vinil costuma vir em bobina em torno de 1,00 a 1,50 m de largura; lona tem opções bem mais largas. Chapas rígidas, como ACM e PVC expandido, também tem largura e comprimento fixos, que mudam de fornecedor para fornecedor.",
    dica: "Poucos centímetros a mais podem obrigar a usar duas tiras ou duas chapas e quase dobrar o custo. Antes de fechar, pergunte se a medida tem folga: as vezes 3 cm a menos deixa a peça bem mais barata. Se não houver folga, avise que a peça larga vai ter emenda e que a emenda aparece.",
  },
  {
    categoria: "Comercial",
    termo: "Tiragem e custo de preparação (setup)",
    texto:
      "Tiragem e a quantidade de peças iguais do mesmo pedido. Boa parte do custo esta na preparação -- fechar a arte, acertar a cor, regular a máquina, preparar o recorte -- e essa parte se paga uma vez só. Por isso o preço por peça cai conforme a quantidade sobe.",
    dica: "Ofereca sempre o preço de duas ou três quantidades: o cliente costuma subir o pedido sozinho. E avise que pedir 50 agora e mais 50 no mês que vem sai mais caro que 100 de uma vez, e que a cor pode sair um pouco diferente de uma rodada para a outra.",
  },
  {
    categoria: "Comercial",
    termo: "Orçamento e proposta comercial",
    texto:
      "Orçamento e a lista de preços das opções que o cliente pediu; proposta comercial e o documento fechado, com escopo, medidas, material, prazo, forma de pagamento e validade. Quando o cliente e consumidor final, a lei do consumidor obriga a entregar orçamento previo detalhando mão de obra, materiais e equipamentos, condições de pagamento e as datas de início e fim do serviço.",
    dica: "Escreva sempre a validade: sem prazo escrito, o valor orçado vale dez dias contados do recebimento pelo cliente, e depois de aprovado ele prende os dois lados, só mudando com acordo entre as partes. Liste também o que será preciso contratar (guindaste, plataforma, eletricista): serviço de terceiro que não estava no orçamento não pode ser jogado na conta do consumidor depois.",
  },
  {
    categoria: "Comercial",
    termo: "Sinal (entrada) e ordem de serviço",
    texto:
      "Sinal e a parte do valor paga no fechamento, que banca a compra do material; ordem de serviço (OS) e o documento que manda produzir, com medidas, cores, textos, prazo e endereço de instalação. Um destrava o outro: sem sinal e sem OS conferida, nada entra na fila de produção. O percentual do sinal varia de empresa para empresa.",
    dica: "Peça personalizada com o nome do cliente não tem para quem revender: se o pedido começa sem sinal e o cliente some, o material e prejuízo inteiro da empresa. E releia a OS com calma -- medida ou texto errados ali viram peça refeita, e a conta fica com quem vendeu.",
  },
  {
    categoria: "Comercial",
    termo: "Garantia e vida útil",
    texto:
      "Garantia cobre defeito de fabricação ou de instalação: solda que abre, adesivo que descola, LED que queima cedo. Vida útil e outra coisa: e quanto tempo a peça aguenta sol e chuva antes de desbotar, e peça externa envelhece muito mais rápido que peça interna. Pela lei do consumidor, o cliente tem no mínimo noventa dias para reclamar de defeito em serviço ou produto durável, contados da entrega ou do fim da instalação (defeito escondido conta de quando aparece); prazo maior e cortesia da empresa e precisa estar por escrito.",
    dica: "Deixe registrado na proposta o que a garantia NÃO cobre: vandalismo, temporal e vento forte, batida, lavagem com jato de alta pressão e mexida de terceiro. E explique na venda que desbotar com o tempo e desgaste normal de peça externa, não defeito -- senao a cobrança chega no ano seguinte.",
  },

  // ---- material: a estrutura real da casa (04/08) ----------------------
  {
    categoria: "Material",
    termo: "Poliondas (polipropileno alveolar)",
    texto:
      "Chapa plástica leve e barata com o miolo canelado, tipo papelão -- dai o nome onda. É o material de placa de campanha, sinalização temporaria, placa de imóvel e cavalete de curta duração, com adesivo impresso colado por cima ou, quando a chapa entra na nossa UV, impressão direta.",
    dica: "Repare no sentido da onda: a chapa só tem rigidez no sentido do canal, então placa grande com o canal deitado ondula e ilhós furados na direção errada rasgam com o vento. Não ofereca para fachada nem para nada que va ficar anos no sol -- a chapa vai ficando quebradiça e o desenho do canal aparece na arte. Cliente que quer durar pede ACM. E antes de prometer impressão direta, confirme com a produção se a chapa entra na UV; se não entrar, vai de adesivo colado e o preço muda.",
  },
  {
    categoria: "Material",
    termo: "Metalon (tubo de aço)",
    texto:
      "Tubo de aço de seção quadrada ou retangular, vendido em barra (a mais comum e a de 6 m). É o osso das nossas estruturas: quadro de fachada, pe de totem, suporte de letra caixa e armação de painel, cortado e soldado no MIG aqui dentro.",
    dica: "O que muda preço e resistência e a espessura da parede, não só a medida do tubo -- as comuns vão de 1,20 a 2,00 mm, e a mais fina não serve para estrutura alta e exposta ao vento. Baixar a espessura para fechar preço vira problema de segurança, não economia. Metalon comum enferruja: peça externa exige fundo e pintura (ou metalon galvanizado), senao a ferrugem escorre e mancha a fachada do cliente.",
  },
  {
    categoria: "Material",
    termo: "Chapa de aço e chapa galvanizada",
    texto:
      "A chapa de aço carbono e a chapa lisa que vira base, tampa, reforço e corpo de caixa de luminoso, cortada no laser fibra. A galvanizada e a mesma chapa com banho de zinco, que segura a ferrugem por muito mais tempo.",
    dica: "A proteção acaba onde a peça e cortada e soldada: o calor queima o zinco na borda, e e ali que a ferrugem começa a aparecer. Tinta comum também não gruda bem no zinco, então galvanizada externa pede fundo próprio. Se o cliente quer peça metálica durando anos ao tempo, o combinado e galvanizada + fundo certo + pintura -- e isso tem preço, não e a mesma coisa que 'só cortar a chapa'.",
  },
  {
    categoria: "Material",
    termo: "Alumínio liso (chapa de alumínio)",
    texto:
      "Chapa de alumínio inteiriça, uma lamina só de metal -- diferente do ACM, que e um sanduíche com miolo plástico. Usada em lateral e fundo de letra caixa, tampa, caixa de luminoso e qualquer peça que não pode enferrujar.",
    dica: "Ele não fica plano igual ACM: chapa fina de alumínio em área grande ondula como espelho torto e amassa facil no transporte e na instalação. Regra prática para não errar no orçamento -- superfície grande e lisa e ACM; corpo de letra, peça dobrada e peça pequena e alumínio. Cliente que pede 'alumínio de verdade' numa fachada grande esta pedindo ondulação.",
  },
  {
    categoria: "Material",
    termo: "Perfil de tension frame (quadro de tecido)",
    texto:
      "Perfil de alumínio com um canal que prende a borda do tecido impresso e deixa a arte esticada, sem ilhós e sem moldura por cima. É o que permite vender painel de tecido, backdrop e caixa de luz de tecido em que o próprio cliente troca a arte depois, sem obra.",
    dica: "Medida do quadro e medida do tecido são números diferentes: o tecido sai com sobra de borda e com o cordão de silicone na borda, senao não entra no canal e não estica. Confirme quem costura esse cordão e quanto tempo leva -- se for serviço de fora, esse prazo costuma sumir do orçamento e estourar a entrega. Tecido cortado errado não tem conserto, só reimpressão.",
  },
  {
    categoria: "Material",
    termo: "Perfil de fachada e perfil de sanca de LED",
    texto:
      "Perfis de alumínio de fechamento. O de fachada arremata a borda e resolve a emenda entre chapas de ACM; o de sanca aloja a fita de LED e cria a luz indireta em fachada, testeira e letreiro, quase sempre com um difusor leitoso na frente.",
    dica: "Perfil vem em barra de comprimento fixo, então fachada cheia de emenda e recorte gasta mais perfil e mais hora de montagem -- isso precisa estar no preço desde o orçamento. Na sanca, LED colado direto no alumínio sem difusor mostra os pontinhos acesos um a um; quando o cliente pede luz uniforme, quem entrega isso e o difusor mais a distância certa entre o LED e a face.",
  },
  {
    categoria: "Material",
    termo: "Ferragem de porta (dobradiça, fechadura, puxador)",
    texto:
      "É o conjunto que faz a porta de ACM abrir, fechar e trancar: dobradiça ou pivô, fechadura, puxador e batente. A nossa célula de portas monta tudo aqui, mas a ferragem e comprada -- e e ela, mais que o ACM, que decide quanto tempo a porta aguenta uso pesado.",
    dica: "Peso e movimento definem a escolha: porta grande de ACM em loja de muito fluxo acaba com dobradiça barata e volta como garantia. Acerte no orçamento o acabamento (escovado, cromado, preto) e quem fornece a fechadura -- cliente que compra a dele por fora costuma trazer uma que não encaixa na usinagem já feita, e ai a folha tem que ser refeita por nossa conta.",
  },
  {
    categoria: "Material",
    termo: "Mola de porta (aérea e de piso)",
    texto:
      "Mecanismo que fecha a porta sozinha e devagar. A aérea fica no alto da folha e fica a vista; a de piso fica embutida no chão e some. Entra em porta de ACM e em entrada de loja com movimento.",
    dica: "Mola de piso e obra: exige quebrar o piso e deixar a caixa embutida ANTES da instalação. Se isso não estiver combinado e orçado com quem toca a obra, a equipe chega no dia e volta sem instalar -- deslocamento perdido. A regulagem faz parte da entrega: mola mal regulada bate a porta e desalinha a folha, e a visita para acertar sai da nossa conta.",
  },
  {
    categoria: "Material",
    termo: "Fita de LED e módulo de LED (a diferença)",
    texto:
      "São dois jeitos diferentes de acender a peça. A fita e uma tira continua de LEDs, boa para sanca, contorno e luz corrida rasa. O módulo e um bloquinho de dois ou três LEDs com lente que espalha a luz, e e ele que vai dentro de letra caixa e caixa de luz, porque alcanca a face de longe sem manchar.",
    dica: "Trocar módulo por fita para baixar preço sai caro: dentro da letra a fita deixa listra e sombra na face, o cliente reclama e a peça volta. Confira o IP (proteção contra água) -- LED de uso interno em peça externa morre na primeira chuva. E se o cliente pedir para aproveitar o LED ou a fonte que já estão la, deixe escrito no orçamento: material velho leva o novo junto e a cobrança vem para a gente.",
  },
  {
    categoria: "Material",
    termo: "Fundo (primer) e massa de preparo",
    texto:
      "Antes de pintar, a peça metálica e limpa e desengraxada, leva massa nas emendas de solda e recebe uma demão de fundo. O fundo e o que faz a tinta grudar e segura a ferrugem; a massa e o que some com a marca da solda.",
    dica: "Esse preparo consome tempo de produção e não aparece em foto nenhuma, mas e ele que decide se a pintura dura anos ou descasca cedo. Peça com muita solda a vista pede mais massa e mais lixa: se o cliente aperta o prazo, ou ele aceita a solda mais aparente ou aceita o prazo cheio -- e essa escolha e feita na hora de fechar, não depois. Galvanizado e alumínio pedem fundo específico; fundo errado descasca em placa.",
  },
  {
    categoria: "Material",
    termo: "Tinta PU (automotiva)",
    texto:
      "Tinta de poliuretano, da mesma família da pintura de carro, aplicada e curada na nossa pintura antes da peça ir para a montagem. Segura cor e brilho no sol muito melhor que tinta comum -- e o que permite entregar letra, totem e fachada em cor exata com cara de fábrica.",
    dica: "Cor tem que ser fechada por código (RAL ou código de montadora), nunca por 'aquele azul do logo': cor de impressão e cor de tinta não batem sozinhas e a diferença só aparece com a peça pronta. Combine também o brilho (fosco, acetinado ou brilhante) -- fosco marca dedo e e chato de limpar. Peça pintada ainda precisa de tempo de cura antes de embalar e viajar, e retoque feito na rua nunca fica igual ao da cabine: peça amassada na instalação volta para a pintura.",
  },

  // ---- impressao: a estrutura real da casa (04/08) ---------------------
  {
    categoria: "Impressão",
    termo: "DTF UV",
    texto:
      "Transfer adesivo impresso na máquina de DTF UV e aplicado em superfície RÍGIDA: copo, caneca, garrafa, acrílico, metal, vidro, madeira, capa de caderno. Sai colorido, com relevo e brilho, e a aplicação e a frio, sem forno e sem prensa. Não confunda com o DTF de camiseta, que e transfer têxtil feito com po e prensa quente: e outro processo e outra máquina, confirme com a produção antes de prometer.",
    dica: "Antes de fechar, pergunte de que material e a peça e como ela vai ser lavada: em silicone, plástico oleoso e superfície muito curva a adesão cai, e máquina de lavar louça e microondas comem o transfer. Peça uma ou duas peças a mais do cliente, para teste de aplicação e para reposição.",
  },

  // ---- acabamento: a estrutura real da casa (04/08) --------------------
  {
    categoria: "Acabamento",
    termo: "Gravação a laser em brinde",
    texto:
      "Marcação feita queimando a superfície do brinde no laser, sem tinta nenhuma: caneta, copo térmico, chaveiro, tabua, garrafa de metal. É permanente, não descasca e não sai na lavagem, mas sai sempre no tom do próprio material.",
    dica: "Gravação não tem cor: em metal a marca sai em tom fosco, em brinde pintado aparece a cor da base por baixo e em plástico pode derreter e cheirar. Nunca prometa logo colorido gravado a laser -- colorido em peça rígida e DTF UV. E grave uma peça do próprio lote como teste antes de rodar tudo, porque cada material reage de um jeito.",
  },

  // ---- peca: a estrutura real da casa (04/08) --------------------------
  {
    categoria: "Peça",
    termo: "Porta de ACM",
    texto:
      "Porta feita aqui com chapa de ACM sobre estrutura de alumínio, usada em fachada de loja, sanitário e área comum quando o cliente quer a porta na mesma cor e no mesmo acabamento do revestimento. É célula própria da casa: a mesma chapa passa por corte, router, dobra e pintura, então a porta sai igual a fachada, sem depender de porta pronta de fornecedor.",
    dica: "Porta não e placa: pergunte o vão já acabado (com piso e batente colocados), o lado de abertura e o peso previsto antes de fechar. O vão real quase nunca sai do tamanho do desenho, então medida tirada da planta vira porta com folga errada ou raspando no chão. Deixe escrito no orçamento se ferragem e vidro estão inclusos.",
  },
  {
    categoria: "Peça",
    termo: "Revestimento arquitetônico em ACM",
    texto:
      "Fachada, coluna ou parede revestida com chapas de ACM presas em estrutura de alumínio ou metalon, para deixar um prédio antigo com cara de novo sem obra pesada. A Impresilk faz da chapa crua até a instalação: corte, rasgo e dobra, pintura da estrutura quando precisa e montagem no local.",
    dica: "O preço fecha por m2 de fachada, mas quem manda no custo e o recorte: cada janela, pilar e quina vira sobra de chapa e mais hora de montagem. Peça foto e medida de cada face e confirme do que a parede e feita -- gesso, drywall ou alvenaria trincada não seguram a estrutura e exigem reforço que ninguém colocou no orçamento.",
  },

  // ---- producao: a estrutura real da casa (04/08) ----------------------
  {
    categoria: "Produção",
    termo: "Router CNC",
    texto:
      "Máquina de corte que usa uma fresa girando em alta rotação para recortar chapas de ACM, acrílico, PVC, MDF e poliondas. Faz contorno de letra, logotipo vazado, furo e também o canal em V que permite dobrar o ACM. É o que permite a Impresilk cortar forma livre aqui dentro, sem molde e sem faça: o que o cliente desenhar em curva, a gente corta.",
    dica: "A fresa tem diâmetro, então canto interno vivo sai arredondado e traco muito fino não se sustenta - em logo com serifa fina ou letra pequena, mostre isso ao cliente antes da aprovação, não depois da chapa cortada. E a máquina segue a linha de corte em vetor: arte que chega só como imagem volta para a arte-final e o prazo recomeca.",
  },
  {
    categoria: "Produção",
    termo: "Seccionadora",
    texto:
      "Serra que corta a chapa inteira em pedaços retos, no esquadro e na medida. É o primeiro passo do corte: a chapa chega no tamanho de fábrica e sai em tiras para o router, para a dobra ou para a célula de portas de ACM. Corte reto aqui e rápido e barato; forma curva, canto arredondado e vazado vão para o router ou para o laser.",
    dica: "Ela só faz corte reto de ponta a ponta. Se o cliente pediu recorte interno ou canto arredondado, a peça passa por mais uma máquina e o prazo muda - confirme isso antes de prometer data. E toda peça sai de uma chapa de medida padrão: pedir a peça no tamanho exato da chapa não da, porque a borda e a espessura do próprio corte comem material.",
  },
  {
    categoria: "Produção",
    termo: "Laser de fibra (corte de metal)",
    texto:
      "Laser que corta metal: aço, inox, galvanizado e alumínio. É o que permite a Impresilk fazer letra caixa de metal, estrutura, suporte e peça metálica vazada aqui dentro, sem depender de serralheiro de fora. O corte sai fino e no esquadro, com pouca rebarba, já pronto para dobrar, soldar e pintar.",
    dica: "Laser de fibra não corta acrílico nem MDF - isso e do laser CO2. Feche material e espessura ainda no orçamento: inox escovado, aço pintado e galvanizado tem preço e prazo diferentes, e chapa mais grossa fica muito mais tempo na máquina. Prometer 'letra de metal' sem espessura definida e prometer um preço que você ainda não sabe.",
  },
  {
    categoria: "Produção",
    termo: "Laser CO2 (corte de acrílico)",
    texto:
      "Laser para material não metálico: corta e grava acrílico, MDF, papel, couro e tecido. No acrílico ele deixa a borda lisa e transparente, com aspecto polido que nenhuma outra máquina entrega - por isso letra de acrílico, display, placa de mesa e sinalização interna saem daqui. Também grava, marcando a superfície sem atravessar.",
    dica: "Não prometa peça de metal por essa via, e PVC não vai para o laser: queimando ele solta gás que ataca a máquina e a saúde, PVC se corta no router. O corte também deixa tensão no acrílico - furo justo, parafuso apertado contra a peça ou cola errada fazem trincar dias depois, já instalado. Sempre folga no furo.",
  },
  {
    categoria: "Produção",
    termo: "Solda de letra a laser",
    texto:
      "Solda que une as partes da letra de metal com um feixe fino, quase sem cordão aparente e sem empenar a chapa. É o acabamento premium: depois do polimento ou da pintura a junta some e a letra de inox fica com cara de peça única. Vale em letra caixa metálica e em qualquer peça que o cliente vai ver de perto.",
    dica: "O feixe não preenche folga: as partes precisam chegar bem encostadas, e peça que veio com abertura no corte volta para ajuste e derruba o prazo. Como custa mais que a MIG, só venda esse acabamento onde a junta fica a vista - em estrutura escondida atrás da fachada e dinheiro jogado fora.",
  },
  {
    categoria: "Produção",
    termo: "Solda MIG",
    texto:
      "Solda de arame, que deposita material na junta, usada na estrutura: quadro, mão francesa, suporte de totem e base de fachada. Aguenta perfil e chapa mais grossos e sai bem mais barata que a solda a laser. É o que segura a peça na parede e no vento.",
    dica: "MIG deixa cordão aparente, respingo e pode empenar chapa fina - depois de pintada, a marca da solda aparece e a superfície fica ondulada. Se aquela face vai ficar a vista do cliente, ou vai para a solda a laser, ou entra tempo de lixa e massa na pintura. Isso se resolve no orçamento, não na hora da montagem.",
  },
  {
    categoria: "Produção",
    termo: "Dobra de ACM (canal em V)",
    texto:
      "Para dobrar ACM a gente frisa um canal em V nas costas da chapa, deixando só a lamina de alumínio da frente, e então dobra. É o que fecha a caixa e da o canto sem emenda aparente: bandeja de fachada, borda de porta de ACM, testeira e acabamento de pilar. Toda porta e todo revestimento da Impresilk passam por essa etapa.",
    dica: "A dobra consome material: a medida do desenho nunca e a medida da chapa cortada, e quem faz essa conta e o projeto, não o vendedor. E não da para desdobrar e dobrar de novo - o alumínio trinca na quina e a peça vira sucata. Mudança de medida depois do corte e chapa nova, não ajuste.",
  },
  {
    categoria: "Produção",
    termo: "Carrinho de soldar lona (solda por ar quente)",
    texto:
      "Máquina que anda por cima da lona soprando ar quente e prensando com roldana, emendando duas lonas ou fechando a bainha. Diferente da solda de alta frequência, que e uma prensa parada, o carrinho percorre a peça inteira - por isso da para entregar lona maior que a largura da impressora e bainha de qualquer comprimento. Fica no acabamento, junto com refile e ilhós.",
    dica: "A emenda pede lona de PVC e uma faixa de sobreposição, e ela aparece na peça: se logo ou texto cair em cima da linha, a imagem quebra ali - peça para a arte-final posicionar a emenda antes de imprimir. E emenda e o ponto que mais sofre no vento: em lona grande e exposta, combine reforço já no fechamento do pedido.",
  },
  {
    categoria: "Produção",
    termo: "Prancha de produção",
    texto:
      "É o arquivo montado para a máquina, não para o cliente: as peças do pedido já posicionadas na chapa ou na bobina, com linha de corte, sangria, marcas de registro e a O.S. identificada. É o que a produção recebe depois da arte aprovada, e ela pode juntar pedidos diferentes na mesma chapa para aproveitar material.",
    dica: "O cliente aprova o layout; a produção roda a prancha. Depois que a prancha esta montada, mudar 'só o tamanho' obriga a remontar tudo, a peça perde a vez na fila e, se a chapa já foi aberta, o material vira perda. Confirme medida final e quantidade antes de liberar para produção.",
  },
  {
    categoria: "Produção",
    termo: "Cabine de pintura",
    texto:
      "Ambiente fechado e com exaustão onde as peças do corte e da metalurgia são pintadas antes de virar letra, porta ou estrutura. O processo tem etapas fixas: limpar e desengraxar, lixar, aplicar primer, pintar na cor e deixar secar. É o que permite entregar peça em praticamente qualquer cor, fosca ou brilhante, inclusive na cor da marca do cliente.",
    dica: "Secagem e cura tem tempo próprio e não aceleram: peça pintada hoje nem sempre e montada hoje, e dia de umidade alta ou de muita poeira estraga a demão e obriga a refazer. Além disso, a cor da marca em tinta nunca bate exatamente com a mesma cor impressa em adesivo ou lona - se as duas vão ficar lado a lado na mesma fachada, mostre amostra antes de fechar.",
  },
  {
    categoria: "Produção",
    termo: "As quatro linhas de produção",
    texto:
      "A casa não produz tudo do mesmo jeito: são quatro caminhos diferentes -- letra e projeto (corte e metalurgia, pintura, montagem, embarque e instalação), arquitetônica (corte, dobra, pintura, portas de ACM e instalação), impressos (impressão, recorte, acabamento e entrega) e brindes (DTF UV e gravação, quase balcão). Antes de falar qualquer prazo, saiba por qual dessas linhas a peça vai passar.",
    dica: "Prazo se mede pelo número de setores que a peça atravessa, não pelo tamanho nem pelo valor: um adesivo grande costuma sair antes de uma letra pequena. Pedido misto (letra + adesivo + brinde na mesma O.S.) anda no ritmo da parte mais lenta -- se o cliente precisa do adesivo antes, peça O.S. separada.",
  },
  {
    categoria: "Produção",
    termo: "Linha de letra e projeto",
    texto:
      "É a linha mais longa da casa: a peça passa por corte e metalurgia (seccionadora, router CNC, laser CO2 para acrílico e laser fibra para metal), depois pintura, depois montagem de letras (frente, corpo, LED e teste elétrico), embarque e instalação. Só passa para a etapa seguinte quando a anterior termina, e por isso letra caixa e luminoso nunca tem prazo de impresso.",
    dica: "Pintura tem tempo de secagem e cura que ninguém acelera, e a peça só segue para a montagem depois disso. Cor especial pode ainda depender de tinta comprada fora: confirme a cor ANTES de prometer data, porque tinta encomendada no meio do caminho para a linha inteira.",
  },
  {
    categoria: "Produção",
    termo: "Linha arquitetônica (portas de ACM e revestimento)",
    texto:
      "Revestimento em ACM e porta de ACM seguem corte, dobra, pintura, célula de portas (montagem e ferragens) e instalação. É uma linha que divide equipamento com as letras: usa a mesma seccionadora, o mesmo router e o mesmo setor de pintura.",
    dica: "Porta e peça de medida única: sobra ainda da para acertar, falta não -- se a medida sair curta, refaz do zero, com chapa e mão de obra perdidas. Confirme vão, prumo, sentido de abertura e ferragem antes de liberar o corte, e avise o cliente que a medida que vale e a tirada no local, não a da planta.",
  },
  {
    categoria: "Produção",
    termo: "Linha de impressos",
    texto:
      "Adesivo, lona e chapa impressa passam por impressão (Ampla, MyPrint ou UV), recorte (plotter de recorte ou router) e acabamento (solda de lona, refile, ilhós), e depois vão para entrega. É a linha mais curta mesmo quando a peça e enorme.",
    dica: "O que costuma atrasar aqui não e a impressora, e o acabamento -- e, com tinta solvente, a espera da tinta liberar antes de laminar ou soldar. Arte que chega errada (sem sangria, sem linha de corte, em baixa resolução) volta para o arte-final e o pedido perde o lugar que já tinha na fila da impressora.",
  },
  {
    categoria: "Produção",
    termo: "PCP e programação",
    texto:
      "O PCP e quem programa as O.S.: define o que entra em cada setor e em que dia, dentro da capacidade real de cada máquina e equipe. O prazo que você informa e o que o PCP consegue programar, e não o tempo que a peça levaria se estivesse sozinha na fábrica.",
    dica: "Não prometa data sem passar pelo PCP: uma peça de poucas horas de trabalho pode só entrar na máquina dias depois, porque a fila esta cheia. Se o cliente tem data inegociável (inauguração, feira, evento), escreva isso na abertura da O.S. -- com aviso o PCP encaixa; em cima da hora, só tirando outro cliente do lugar.",
  },
  {
    categoria: "Produção",
    termo: "Gargalo e furo de fila",
    texto:
      "Alguns setores atendem mais de uma linha ao mesmo tempo: a pintura recebe peça da metalurgia e da arquitetônica, e a seccionadora e o router cortam tanto letra quanto porta de ACM. Quando um pedido urgente fura a fila em um desses setores, tudo que estava atrás anda para trás.",
    dica: "'Urgente' não cria capacidade, só troca a ordem -- cada urgência aceita atrasa um cliente que já tinha data marcada, e amanha esse cliente e seu. Antes de pedir prioridade, pergunte a data real de uso: boa parte da urgência e folga que o próprio cliente colocou.",
  },
  {
    categoria: "Produção",
    termo: "Embarque e desembarque",
    texto:
      "Embarque e o momento em que a expedição confere a peça pronta, separa ferragem, fixação e ferramenta e carrega o veículo da equipe. Desembarque e a volta: o que sobrou retorna para o estoque e o que foi usado de verdade fecha o custo do trabalho.",
    dica: "Equipe que sai sem a conferência de embarque descobre a falta já no alto da fachada -- faltou um perfil, a fonte, a ferragem -- e a viagem inteira se perde, com equipe parada e remarcação com o cliente. Se o trabalho tem várias partes, deixe escrito na O.S. que ele só embarca completo, ou combine antes uma entrega em etapas.",
  },
  {
    categoria: "Produção",
    termo: "Checklist fotográfico de conclusão",
    texto:
      "Toda instalação encerra com um conjunto de fotos: a peça instalada, a fixação, a ligação elétrica quando existe e o local limpo. É o registro de que o serviço foi entregue como combinado e no dia em que foi entregue.",
    dica: "Sem foto, reclamação futura vira palavra contra palavra -- risco na parede, luminoso torto, marquise trincada. Avise o cliente que a equipe fotografa o local também ANTES de começar: dano que já existia só se prova assim, e e essa foto que separa um reparo de cortesia de uma conta que não era nossa.",
  },

  // ---- instalacao: a estrutura real da casa (04/08) --------------------
  {
    categoria: "Instalação",
    termo: "Junta e paginação de chapas",
    texto:
      "Junta e o espaço proposital deixado entre uma chapa de ACM e outra, preenchido com silicone ou deixado aberto em sombra; paginação e o desenho de como as chapas se distribuem na fachada. Serve para a chapa trabalhar com o calor e para disfarçar que nenhum prédio e reto de verdade.",
    dica: "Junta apertada demais deixa a chapa estufada quando bate sol, e junta torta e a primeira coisa que o cliente enxerga da calçada. Combine ainda na medição a largura da junta e onde cai cada emenda; mudar a paginação depois obriga a refazer o corte de todas as chapas.",
  },
  {
    categoria: "Instalação",
    termo: "Projeto técnico de estrutura",
    texto:
      "Desenho de como a peça se sustenta e se prende no lugar: tubos, mão francesa, chumbador, distribuição de peso e o que a peça aguenta de vento. O setor de Projetos faz isso dentro de casa para fachada, porta, totem e painel grande, e esse desenho vira a lista de material que a metalurgia corta.",
    dica: "Foto de rua não mostra do que a parede e feita, e alvenaria, drywall, telha ou marquise mudam a fixação e o preço. Sem alguém ver a base no local, o orçamento sai por chute: se o cliente recusar a visita técnica, deixe escrito na proposta que estrutura e fixação podem mudar depois da medição.",
  },

  // ---- arte e processo: a estrutura real da casa (04/08) ---------------
  {
    categoria: "Arte e processo",
    termo: "Memorial descritivo",
    texto:
      "Documento técnico que descreve item por item do que a peça e feita e como será instalada: materiais, espessuras, tipo de estrutura, fixação, parte elétrica e acabamento. Shopping, prefeitura, condominio e construtora costumam exigir esse memorial junto do projeto para liberar a instalação, e quem emite e o setor de Projetos.",
    dica: "Pergunte na primeira visita se o local exige memorial: quem exige só autoriza a instalação depois de analisar, e esse tempo de análise não depende da gente -- precisa entrar no prazo combinado com o cliente. E o memorial descreve o que foi projetado: se o cliente mudar a peça depois, o documento tem que ser refeito e passar de novo pela aprovação.",
  },

  // ---- comercial: a estrutura real da casa (04/08) ---------------------
  {
    categoria: "Comercial",
    termo: "O.S. sem pendência",
    texto:
      "É a ordem de serviço que sai do comercial pronta para produzir: medida final conferida, material e cor definidos, texto e arte aprovados, quantidade, endereço e condições de instalação e o combinado comercial fechado. É o que separa um pedido que anda de um pedido que fica indo e voltando.",
    dica: "O.S. com campo em branco não entra na fila -- volta para o vendedor, mas o cliente conta o prazo desde o dia em que fechou. As faltas mais caras são medida 'aproximada', cor descrita por nome ('o azul do logo', sem código) e endereço de instalação sem altura nem forma de acesso.",
  },
  {
    categoria: "Comercial",
    termo: "Centro de custo",
    texto:
      "É a etiqueta que diz de qual setor saiu cada gasto e cada hora de trabalho: corte, metalurgia, pintura, impressão, acabamento, instalação. Amarrada a O.S., e o que mostra ao financeiro quanto o trabalho custou de verdade, e não apenas por quanto ele foi vendido.",
    dica: "Retrabalho, viagem repetida e material perdido caem no custo do mesmo trabalho, então um pedido vendido com preço bom pode fechar no vermelho depois de duas voltas na obra. Registre toda alteração de escopo na O.S. em vez de resolver 'por fora': o que não entra no papel some do custo e reaparece no fechamento do mês.",
  },
  {
    categoria: "Comercial",
    termo: "Chamado de pos-venda",
    texto:
      "Depois da entrega, tudo que volta -- defeito, LED apagado, limpeza de fachada, ajuste, recompra -- entra como chamado no pos-venda e vira serviço novo, com O.S. e lugar na programação do PCP. Isso vale inclusive para o chamado de garantia.",
    dica: "Não prometa 'a gente passa la amanha': o chamado ocupa equipe, plataforma e agenda igual a uma instalação nova. Já na abertura, separe defeito de desgaste, uso indevido ou vandalismo -- tratar tudo como garantia queima equipe de graça e ensina o cliente a nunca contratar manutenção paga.",
  },
];
