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

export const CATEGORIAS = ["Material", "Impressao", "Acabamento", "Peca", "Instalacao", "Arte e processo", "Comercial"];

export const GLOSSARIO = [
  // ---------------------------------------------------------------- materiais
  {
    categoria: "Material",
    termo: "Lona frontlight",
    texto:
      "Lona vinilica para pecas que sao vistas com a luz vindo da frente -- do dia ou de refletores. E a lona do banner, do painel de tapume e da maioria das fachadas de lona.",
    dica: "Se o cliente quer a peca acesa por dentro, frontlight nao serve: a luz nao atravessa direito e a arte fica manchada.",
  },
  {
    categoria: "Material",
    termo: "Lona backlight",
    texto:
      "Lona translucida, feita para caixa de luz: a luz fica atras e atravessa a lona, acendendo a arte por dentro.",
    dica: "A arte pede cores mais fortes que o normal -- iluminada por tras, a impressao clareia.",
  },
  {
    categoria: "Material",
    termo: "Lona mesh",
    texto:
      "Lona com microfuros que deixam o vento passar. Usada em fachada de obra, empena de predio e qualquer peca grande exposta a vento forte.",
    dica: "Como e perfurada, a imagem perde um pouco de fechamento de cor. Nao e para peca vista de perto.",
  },
  {
    categoria: "Material",
    termo: "Vinil adesivo",
    texto:
      "Filme de PVC com cola no verso. E a base da adesivagem: vitrine, parede, veiculo, chao, movel.",
    dica: "Vinil de vitrine e vinil de veiculo nao sao a mesma coisa -- o de veiculo estica para acompanhar curva.",
  },
  {
    categoria: "Material",
    termo: "Vinil de recorte",
    texto:
      "Vinil de cor solida, sem impressao, cortado no plotter. O resultado sai sem fundo: so a letra ou o simbolo colado na superficie.",
    dica: "So faz cor chapada -- arte com degrade ou foto tem que ser impressa. E a cor nao desbota como impressao, porque e do proprio filme; mas a vida util e do vinil: o monomerico (barato) dura poucos anos e so em superficie plana, o polimerico/cast aguanta mais e acompanha curva.",
  },
  {
    categoria: "Material",
    termo: "Microperfurado (One Way Vision)",
    texto:
      "Adesivo furadinho para vidro: de fora as pessoas veem a arte, de dentro veem a rua. Classico em vidro de loja e vidro traseiro de carro.",
    dica: "De noite o efeito inverte -- com a luz acesa dentro, quem esta fora enxerga para dentro.",
  },
  {
    categoria: "Material",
    termo: "ACM",
    texto:
      "Aluminio composto: duas chapas finas de aluminio com um miolo plastico. Fica perfeitamente plano, e leve e aguenta tempo -- por isso e o material padrao de fachada.",
    dica: "O corte e a dobra sao feitos na chapa: mudanca de medida depois vira chapa nova. E confira o TIPO -- o ACM comum tem miolo de polietileno, que queima; obra publica, hospital e shopping costumam exigir o antichama (mineral), que custa mais.",
  },
  {
    categoria: "Material",
    termo: "PVC expandido",
    texto:
      "Chapa plastica rigida e leve, facil de cortar. Nao absorve agua, entao vai bem ate em area umida -- o que ela nao suporta e sol e calor." +
      " Boa para placa interna, sinalizacao e display.",
    dica: "Em area externa com sol forte ela empena com o tempo. Externo pede ACM.",
  },
  {
    categoria: "Material",
    termo: "Acrilico",
    texto:
      "Placa plastica transparente ou colorida, com aparencia nobre. Usada em letra caixa, placa de recepcao e luminoso.",
    dica: "Risca com facilidade -- so tirar o papel de protecao na hora de instalar.",
  },
  {
    categoria: "Material",
    termo: "Poliestireno (PS)",
    texto:
      "Chapa plastica fina e barata, para display e comunicacao interna de curta duracao.",
    dica: "E material de campanha, nao de fachada. Se o cliente quer durar anos, nao ofereca PS.",
  },

  // --------------------------------------------------------------- impressao
  {
    categoria: "Impressao",
    termo: "Solvente e eco-solvente",
    texto:
      "Tinta que penetra no vinil e por isso aguenta sol e chuva. A versao eco tem menos cheiro e e a mais usada hoje.",
    dica: "Peca recem-impressa em solvente precisa de um tempo de secagem antes de laminar ou aplicar.",
  },
  {
    categoria: "Impressao",
    termo: "Impressao UV",
    texto:
      "A tinta seca na hora sob luz ultravioleta, o que permite imprimir direto em material rigido (ACM, acrilico, PVC).",
    dica: "Como seca instantaneo, a peca ja sai pronta para acabamento -- costuma encurtar prazo.",
  },
  {
    categoria: "Impressao",
    termo: "Latex",
    texto:
      "Tinta a base de agua, praticamente sem cheiro. Indicada para ambiente fechado e sensivel: hospital, escola, consultorio, restaurante.",
    dica: "Argumento de venda forte quando o cliente vai aplicar com o local funcionando.",
  },
  {
    categoria: "Impressao",
    termo: "CMYK e RGB",
    texto:
      "A tela do computador mostra cor com luz (RGB) e a impressao monta cor com tinta (CMYK). Por isso a cor da tela nunca e exatamente a cor impressa.",
    dica: "Nunca aprove cor pelo celular do cliente. Se a cor e critica, faca prova impressa.",
  },
  {
    categoria: "Impressao",
    termo: "Pantone",
    texto:
      "Sistema de cores exatas, usado por marcas para garantir sempre o mesmo tom.",
    dica: "Nem todo Pantone fecha em CMYK -- alguns tons ficam proximos, nao identicos. Avise ANTES de produzir.",
  },
  {
    categoria: "Impressao",
    termo: "Resolucao e distancia de leitura",
    texto:
      "Quanto maior a peca e mais longe o observador, menos resolucao ela precisa. Um outdoor visto a 30 metros nao pede o mesmo arquivo de um cartaz de balcao.",
    dica: "Arquivo pequeno esticado para peca grande so funciona se a peca for vista de longe.",
  },
  {
    categoria: "Impressao",
    termo: "Sangria",
    texto:
      "Margem de arte a mais, alem da linha de corte, para que um desvio minimo na guilhotina nao deixe filete branco na borda.",
    dica: "Arquivo de cliente quase nunca vem com sangria -- conferir na hora de receber a arte.",
  },
  {
    categoria: "Impressao",
    termo: "Prova de cor",
    texto:
      "Um pedaco impresso do material real para o cliente aprovar a cor antes de rodar a tiragem inteira.",
    dica: "Custa pouco e evita a discussao mais cara que existe: refazer por causa de cor.",
  },

  // -------------------------------------------------------------- acabamento
  {
    categoria: "Acabamento",
    termo: "Laminacao",
    texto:
      "Filme transparente aplicado por cima da impressao. Protege de risco, de sujeira e da desbotada do sol. Existe fosca e brilhante.",
    dica: "Chao e balcao SEMPRE laminados -- sem laminacao a peca risca na primeira semana.",
  },
  {
    categoria: "Acabamento",
    termo: "Ilhos",
    texto:
      "Anel metalico preso na borda da lona, por onde passa a corda ou a abracadeira que prende o banner.",
    dica: "Combine o espacamento: ilhos ralo em peca grande faz a lona ondular e rasgar no vento.",
  },
  {
    categoria: "Acabamento",
    termo: "Bainha",
    texto:
      "Dobra soldada na borda da lona que reforca o material e evita rasgo, normalmente onde entram os ilhoses.",
    dica: "Sempre que a peca ficar exposta ao vento, bainha nao e opcional.",
  },
  {
    categoria: "Acabamento",
    termo: "Solda de alta frequencia",
    texto:
      "Emenda que funde duas lonas sem costura, deixando a junta lisa e estanque. E como se faz peca maior que a largura da bobina.",
    dica: "Se a arte tem uma linha reta atravessando a emenda, avise: a junta aparece de perto.",
  },
  {
    categoria: "Acabamento",
    termo: "Recorte eletronico",
    texto:
      "O plotter corta o contorno do adesivo seguindo o desenho, em vez de deixar o retangulo.",
    dica: "Contorno com detalhe muito fino nao sobrevive a aplicacao -- simplifique antes de vender.",
  },
  {
    categoria: "Acabamento",
    termo: "Corte a laser",
    texto:
      "Corte preciso em acrilico e MDF, inclusive com detalhe fino e furos. Deixa a borda do acrilico polida.",
    dica: "Otimo para letras vazadas e pecas de recepcao.",
  },

  // -------------------------------------------------------------------- peca
  {
    categoria: "Peca",
    termo: "Fachada",
    texto:
      "A identificacao do ponto comercial. Pode ser ACM com letra caixa, lona esticada em estrutura ou luminoso -- a escolha muda preco e prazo drasticamente.",
    dica: "Sempre pergunte se a fachada e iluminada: e a informacao que mais muda o orcamento.",
  },
  {
    categoria: "Peca",
    termo: "Letra caixa",
    texto:
      "Letra com volume, feita em acrilico, ACM, aco ou PVC, aplicada na parede ou na fachada. Pode ser iluminada por dentro ou por tras.",
    dica: "Letra caixa iluminada precisa de ponto de energia atras -- confirme com o cliente ou com o eletricista dele.",
  },
  {
    categoria: "Peca",
    termo: "Luminoso (caixa de luz)",
    texto:
      "Peca fechada, iluminada por dentro, com a face em lona backlight ou acrilico. Aparece de longe e a noite.",
    dica: "Manutencao existe: LED e fonte tem vida util. Vale combinar isso na venda.",
  },
  {
    categoria: "Peca",
    termo: "Totem",
    texto:
      "Estrutura vertical independente, fincada no chao ou com base. Usada em estacionamento, posto, entrada de condominio.",
    dica: "Peca de chao envolve fundacao e, em muitos casos, autorizacao -- prazo maior.",
  },
  {
    categoria: "Peca",
    termo: "Banner",
    texto:
      "Peca em lona com bastao ou ilhoses, de uso temporario. Barata e rapida.",
    dica: "E a porta de entrada de muito cliente novo. Bom banner hoje vira fachada amanha.",
  },
  {
    categoria: "Peca",
    termo: "Wind banner",
    texto:
      "Bandeira em formato de vela ou gota, com haste e base. Chama atencao no movimento e monta em minutos.",
    dica: "Base de agua para area externa, base cruzada para piso liso.",
  },
  {
    categoria: "Peca",
    termo: "Envelopamento",
    texto:
      "Aplicacao de adesivo cobrindo o veiculo ou o movel, total ou parcialmente, mudando a aparencia sem pintura.",
    dica: "Veiculo precisa estar limpo e sem amassado: superficie ruim reprova a aplicacao, nao o material. E se o envelopamento MUDA A COR do carro, a mudanca tem que ser registrada no Detran -- avise o cliente antes de fechar.",
  },
  {
    categoria: "Peca",
    termo: "Vitrine e jateado",
    texto:
      "Comunicacao no vidro. O 'jateado' e um adesivo que imita vidro fosco, usado para privacidade e para dar acabamento.",
    dica: "Jateado tambem serve de aviso de seguranca: vidro totalmente limpo as pessoas nao enxergam.",
  },
  {
    categoria: "Peca",
    termo: "Sinalizacao interna",
    texto:
      "Placas de setor, numeracao de porta, indicacao de rota e identificacao de ambiente. Trabalho de volume e repeticao.",
    dica: "Costuma render contrato recorrente -- empresa que cresce sempre precisa de mais placa.",
  },
  {
    categoria: "Peca",
    termo: "PDV (ponto de venda)",
    texto:
      "Material de apoio dentro da loja: display de balcao, testeira de gondola, faixa de preco, wobbler.",
    dica: "Peca de campanha: prazo curto e tiragem alta. Confirme a data de virada da campanha.",
  },
  {
    categoria: "Peca",
    termo: "Backdrop",
    texto:
      "Painel de fundo para foto, coletiva e evento, com a marca repetida.",
    dica: "Prefira acabamento fosco: o brilho estoura no flash das fotos.",
  },
  {
    categoria: "Peca",
    termo: "Adesivo de chao",
    texto:
      "Adesivo com laminacao antiderrapante para aplicar no piso -- direcional, promocional ou de seguranca.",
    dica: "So cola bem em piso liso e limpo. Piso poroso ou encerado nao segura.",
  },

  // -------------------------------------------------------------- instalacao
  {
    categoria: "Instalacao",
    termo: "Medicao",
    texto:
      "A visita que levanta as medidas reais, o tipo de parede, o ponto de energia e como o instalador vai chegar la.",
    dica: "Orcamento sem medicao e chute. A maior parte do retrabalho nasce de medida passada por telefone.",
  },
  {
    categoria: "Instalacao",
    termo: "Estrutura metalica",
    texto:
      "O esqueleto que sustenta a fachada ou o painel atras do material aparente.",
    dica: "Ela pesa no orcamento e no prazo, e o cliente nao a enxerga -- explique que o preco nao e so a chapa.",
  },
  {
    categoria: "Instalacao",
    termo: "Modulo de LED e fonte",
    texto:
      "Os pontos de luz da peca iluminada e o aparelho que converte a energia para eles.",
    dica: "Fonte precisa de lugar acessivel: um dia ela sera trocada.",
  },
  {
    categoria: "Instalacao",
    termo: "Trabalho em altura",
    texto:
      "Instalacao acima de dois metros exige equipe treinada em NR-35 e equipamento (andaime, plataforma ou cesto).",
    dica: "Isso entra no custo e no prazo. Fachada alta nao e o mesmo servico de fachada de porta.",
  },
  {
    categoria: "Instalacao",
    termo: "Autorizacao da prefeitura",
    texto:
      "Muitos municipios exigem licenca para qualquer anuncio visivel da rua -- inclusive na fachada do imovel do proprio cliente -- com regra de tamanho e de posicao.",
    dica: "Pergunte cedo. Peca pronta parada esperando licenca e prejuizo dos dois lados.",
  },

  // ---- material (pesquisa de 04/08) --------------------------------------
  {
    categoria: "Material",
    termo: "Vinil monomerico, polimerico e cast",
    texto:
      "Sao os tres niveis do vinil adesivo, do mais simples ao mais nobre. O monomerico e o mais barato e de vida curta, bom para interno e campanha rapida; o polimerico aguenta sol e chuva por bem mais tempo e e o padrao de fachada, placa externa e vitrine; o cast e o mais fino e flexivel, e o unico que acompanha curva, rebaixo e frizo de carro sem levantar. A durabilidade de cada um muda conforme o fabricante e o sol que a peca pega, entao confira sempre a ficha do material que voce usa.",
    dica: "Fechar preco de monomerico e entregar peca de fachada ou envelopamento e retrabalho na certa: ele encolhe, abre borda branca nas emendas e solta nas curvas antes do que o cliente espera. Se a peca vai para area externa ou superficie curva, o orcamento ja tem que nascer polimerico ou cast -- trocar depois significa raspar tudo e imprimir de novo.",
  },
  {
    categoria: "Material",
    termo: "Vinil refletivo",
    texto:
      "Vinil que devolve a luz do farol para quem olha, usado em placa de transito, placa de obra, sinalizacao de portao e de frota e faixas de seguranca. Existe em varios tipos, que mudam o quanto a placa reflete e quanto tempo ela dura; a norma ABNT de peliculas para sinalizacao viaria (NBR 14644) e quem define o que cada tipo precisa cumprir.",
    dica: "Pergunte QUAL tipo o cliente precisa antes de dar preco. O refletivo mais simples custa bem menos e e o que costuma ser cotado por engano; se a placa e para orgao publico, obra ou vistoria de frota, ela pode ser recusada na entrega e refazer sai do seu bolso.",
  },
  {
    categoria: "Material",
    termo: "Vinil translucido",
    texto:
      "Vinil adesivo colorido feito para peca iluminada por tras: ele deixa a luz passar. Vai colado na chapa de acrilico ou de PS leitoso e e ele que da a cor da marca acesa a noite no luminoso, na caixa de luz e na letra caixa iluminada.",
    dica: "Vinil comum na face do luminoso faz a peca acender manchada e escura. E avise antes que a cor apagada, de dia, fica mais fraca e opaca que a cor acesa -- quem aprovou a arte so no papel reclama que 'nao ficou igual ao que eu vi'.",
  },
  {
    categoria: "Material",
    termo: "Vinil eletrostatico",
    texto:
      "Vinil sem cola nenhuma: gruda no vidro liso so por atracao estatica. Sai sem deixar resto de cola e pode ser guardado e recolocado depois, entao serve para promocao que troca a cada temporada, vitrine de loja, aviso de horario e lembrete de revisao em oficina.",
    dica: "So funciona em vidro liso e bem limpo -- em parede, vidro texturizado ou superficie rugosa ele simplesmente cai. E qualquer pessoa tira com a mao: nunca venda eletrostatico onde o adesivo precisa ficar fixo, como fachada, veiculo ou aviso obrigatorio.",
  },
  {
    categoria: "Material",
    termo: "Manta magnetica (adesivo imantado)",
    texto:
      "Manta fina de ima em rolo que recebe o adesivo impresso e gruda sozinha em superficie de aco, sem furo e sem cola. E a saida para propaganda em porta de carro, van e caminhao quando o cliente quer poder tirar e recolocar, e para placa de troca rapida em quadro metalico.",
    dica: "Ima nao gruda em aluminio, fibra ou plastico -- confira a lataria do veiculo antes de fechar, e evite aplicar sobre pintura feita ha pouco tempo. Deixe por escrito que a manta precisa ser retirada e o local lavado de tempos em tempos: agua e areia presas embaixo mancham a lataria, e o cliente vai cobrar isso de voce.",
  },
  {
    categoria: "Material",
    termo: "Vinil de parede (papel de parede impresso)",
    texto:
      "Vinil adesivo proprio para revestir parede inteira com foto, grafismo ou a identidade visual da empresa. Muito usado em recepcao, sala de reuniao, academia, clinica e loja. Ha versao para parede lisa e versao mais grossa e maleavel, que se acomoda melhor em parede texturizada.",
    dica: "O risco esta na parede, nao no material: textura forte, umidade, mofo ou pintura velha fazem o adesivo bolhar ou arrancar a tinta na hora de tirar. Veja a parede antes de fechar e deixe por escrito que preparo (lixar, massa, pintura) nao esta incluso no valor.",
  },
  {
    categoria: "Material",
    termo: "Tecido para impressao (tela tensionada)",
    texto:
      "Tecido de poliester impresso, alternativa a lona em ambiente interno: nao reflete a luz das lampadas, amassa menos e pode ser dobrado para transportar. Na versao de tela tensionada ele leva uma tira de silicone costurada na borda, que encaixa no perfil de aluminio e deixa a peca esticada e sem onda -- padrao de stand de feira, painel de loja e fundo de palco.",
    dica: "Tecido nao substitui lona em tempo aberto: chuva, vento e sol acabam com ele. E a tela tensionada so serve na estrutura para a qual foi medida -- errar poucos centimetros na moldura obriga a imprimir tudo de novo, porque nao da para emendar nem esticar mais.",
  },
  {
    categoria: "Material",
    termo: "Lona dupla face (blackout)",
    texto:
      "Lona com uma camada escura no meio que impede a luz de atravessar, o que permite imprimir uma arte de cada lado sem que uma apareca por tras da outra. E a lona certa para peca pendurada no meio do ambiente, onde o publico passa dos dois lados: supermercado, corredor de shopping, feira e faixa de rua.",
    dica: "Em lona comum a arte do verso aparece espelhada quando bate luz atras, fica ilegivel e o cliente recusa a peca. Se o banner vai ficar suspenso ou contra a janela, orce dupla face desde o inicio -- corrigir depois e imprimir tudo de novo, nao tem remendo.",
  },
  {
    categoria: "Material",
    termo: "Foam board (cartao-espuma)",
    texto:
      "Placa bem leve, feita de espuma de poliestireno entre duas folhas de cartao. Corta facil, custa menos que PVC expandido ou acrilico e serve para display de balcao, painel de evento, prova de maquete e cartaz reforcado -- sempre em ambiente interno e por pouco tempo.",
    dica: "Nao pode pegar chuva nem umidade: ondula, o papel descola e nao volta ao normal. Amassa no transporte e a marca fica para sempre, entao nunca venda foam board para peca que precisa durar, ficar exposta ao tempo ou ser reaproveitada em varios eventos.",
  },
  {
    categoria: "Material",
    termo: "MDF",
    texto:
      "Chapa de madeira reconstituida usada em letra caixa sem iluminacao, painel de recepcao, totem interno, display e mobiliario de PDV. Aceita corte em maquina, pintura e adesivo por cima, e sai mais barato que acrilico ou metal em peca decorativa de ambiente interno.",
    dica: "MDF comum incha e estufa em contato com agua -- em fachada, area externa, banheiro ou parede com infiltracao a peca volta deformada. Para uso externo, mude o material (PVC expandido, ACM, acrilico) em vez de prometer ao cliente que da para selar o MDF.",
  },
  {
    categoria: "Material",
    termo: "Policarbonato",
    texto:
      "Placa transparente parecida com o acrilico, porem muito mais resistente a pancada e que aceita ser curvada a frio, sem forno. Entra onde a peca pode levar bolada ou vandalismo: face de luminoso em local de risco, protecao de placa em area publica e sinalizacao em quadra, escola e industria.",
    dica: "Peca sempre a versao com protecao UV, senao ele amarela no sol e a peca envelhece feio. Ele tambem risca mais facil que o acrilico (fora as versoes com camada antirrisco), entao nao e a melhor escolha quando o cliente quer o brilho e a transparencia limpa de vitrine.",
  },

  // ---- impressao (pesquisa de 04/08) -------------------------------------
  {
    categoria: "Impressao",
    termo: "Sublimacao",
    texto:
      "Jeito de imprimir TECIDO: a arte vai para um papel e a prensa quente transforma a tinta em gas, que entra na fibra. E assim que se produz bandeira, wind banner, fundo de palco e a tela tensionada do stand -- a cor fica dentro do pano, entao nao racha nem descasca com a dobra.",
    dica: "So rende em tecido de poliester. E o tecido fica levemente translucido: se a peca vai ser vista dos dois lados ou contra a luz, combine antes o forro ou mude para lona dupla face.",
  },
  {
    categoria: "Impressao",
    termo: "Tinta branca (branco local)",
    texto:
      "As tintas coloridas sao translucidas. Em vidro, acrilico, adesivo transparente ou material escuro a arte some se nao houver uma camada de BRANCO por baixo. Nem toda impressora tem tinta branca: nas UV normalmente tem, nas de solvente e latex depende do modelo. No orcamento costuma aparecer como 'branco' ou 'branco local'.",
    dica: "Branco e custo extra e as vezes exige duas passadas para ficar opaco -- coloque no orcamento, nao entregue de brinde. E decida com o cliente ANTES: com fundo branco solido a peca tapa o que esta atras; sem branco ela fica translucida e mostra a parede ou o movimento da rua. Depois de impresso nao tem volta.",
  },
  {
    categoria: "Impressao",
    termo: "Impressao no verso (segunda superficie)",
    texto:
      "Em acrilico e vidro a arte pode ser aplicada por DENTRO, para ser vista atraves do material. Fica com brilho de vitrine e a tinta nao pega risco, chuva nem produto de limpeza, porque a face de fora e o proprio vidro ou acrilico. Comum em placa de acrilico, porta de vidro e balcao de PDV.",
    dica: "O arquivo tem que ir ESPELHADO e a ordem das camadas inverte: o branco entra por ultimo, atras das cores, e nao por baixo. Mandar a arte normal da texto invertido e peca perdida -- confira o espelhamento na prova antes de liberar a producao.",
  },
  {
    categoria: "Impressao",
    termo: "Perfil de cor (ICC)",
    texto:
      "Configuracao que ensina a maquina como aquela tinta se comporta naquele material. Cada combinacao (lona, vinil, tecido, acrilico) tem a sua. E o que faz o vermelho da marca sair parecido na lona da fachada e no adesivo da vitrine.",
    dica: "Monitor e tela de celular acendem luz e cada aparelho mostra a cor diferente: prometer cor 'igual a da tela' e reclamacao garantida. Cor viva demais -- neon, pink eletrico, verde limao -- sempre sai mais apagada no impresso, avise ANTES de fechar. Quando a cor for critica (franquia, marca conhecida), trabalhe com codigo de cor e prova impressa no MESMO material da peca, e deixe claro que materiais diferentes nunca ficam 100% iguais entre si.",
  },

  // ---- acabamento (pesquisa de 04/08) ------------------------------------
  {
    categoria: "Acabamento",
    termo: "Verniz (geral e localizado)",
    texto:
      "Camada transparente aplicada por cima da impressao, brilhante ou fosca, na peca inteira ou so em partes -- por exemplo so no logo. Protege a tinta e cria contraste de brilho e uma leve textura que da para sentir com a mao. Muito usado em cartao, embalagem e material de PDV.",
    dica: "Verniz localizado exige um arquivo separado (a 'mascara') marcando onde ele entra; pedir 'verniz no logo' sem essa mascara trava o servico no meio do caminho. E lembre que o verniz sela o que esta embaixo: poeira, risco ou mancha ficam presos ali para sempre.",
  },
  {
    categoria: "Acabamento",
    termo: "Fita de transferencia (transfer tape)",
    texto:
      "Fita larga, transparente ou leitosa, que a gente cola por cima do adesivo ja recortado para levar todas as letras juntas e na posicao certa, do papel de tras para a parede ou o vidro. Tambem chamada de mascara de transferencia. Existe com grude mais fraco ou mais forte, escolhido conforme o tamanho e o nivel de detalhe do recorte.",
    dica: "Adesivo ja montado com a fita nao pode ficar muito tempo guardado esperando o cliente liberar a parede: com o tempo a fita gruda demais no vinil e a letra rasga na hora de aplicar. Combine a data da instalacao antes de mandar montar a peca.",
  },
  {
    categoria: "Acabamento",
    termo: "Meio corte (kiss cut)",
    texto:
      "Corte que atravessa so o adesivo e para no papel de tras, entao a peca continua presa na folha e o cliente destaca uma a uma. E o que permite cartela de adesivos, etiqueta em bloco e adesivo de vitrine em serie. Quando a lamina corta tudo, inclusive o papel de tras, chama-se corte total.",
    dica: "Lamina apertada demais marca o papel de tras e a cartela rasga sozinha no transporte; lamina fraca demais e o cliente nao consegue descolar. Em tiragem grande, aprove uma amostra fisica antes de mandar rodar tudo.",
  },
  {
    categoria: "Acabamento",
    termo: "Depilacao e refile",
    texto:
      "Depilar e tirar com a pinca todo o vinil que sobra em volta das letras depois do recorte. Refilar e aparar as bordas da peca no esquadro depois de impressa ou laminada. As duas etapas sao feitas na mao, por uma pessoa, e nao pela maquina.",
    dica: "Letra fininha, fonte com serifa, contorno vazado e detalhe miudo multiplicam o tempo de depilacao e por isso encarecem a peca, mesmo ela sendo pequena. Explique isso ainda no orcamento, senao vem depois o 'mas e so um adesivo'.",
  },
  {
    categoria: "Acabamento",
    termo: "Cantoneira e moldura",
    texto:
      "Perfil de aluminio em L ou em U que fecha a borda da placa, do quadro ou do painel. Faz duas coisas ao mesmo tempo: esconde o corte e o miolo do material e da rigidez para a peca nao empenar com o tempo.",
    dica: "A moldura entra por cima da arte e muda a medida final. Quem manda a arte no tamanho exato do vao ou do vidro, sem descontar o perfil, ve texto e logo sumirem por baixo da moldura. Acerte medida de arte e medida externa antes de mandar aprovar.",
  },
  {
    categoria: "Acabamento",
    termo: "Vinco e dobra",
    texto:
      "Vinco e a marca feita no material para ele dobrar sempre na linha certa e sem quebrar; a dobra e o resultado. Aparece em display de balcao, caixa, cavalete e placa com aba de fixacao. Em papel e cartao o vinco vem da faca de corte e vinco; em PVC expandido e ACM a dobra vem de um rasgo em V usinado nas costas da chapa.",
    dica: "Sem vinco, o cartao e o PVC trincam na dobra e a quina fica esbranquicada - o cliente le isso como defeito. A dobra ainda come alguns milimetros do material, entao encaixe e medida final se conferem na amostra montada, nao so no desenho.",
  },
  {
    categoria: "Acabamento",
    termo: "Fecho de contato (velcro)",
    texto:
      "Fita de contato em duas partes, uma no fundo e outra na peca, que deixa colocar e tirar quantas vezes quiser. Muito usada em PDV, feira, stand, banner de tecido e comunicacao que troca a cada campanha. Velcro e marca que virou o nome popular do produto.",
    dica: "A versao adesiva segura mal em parede pintada, com textura ou papel de parede, e na hora de tirar costuma arrancar pedaco da tinta. No tecido, o lado aspero vai puxando fiapo com o uso. Para troca frequente, velcro costurado na peca dura muito mais do que so colado.",
  },
  {
    categoria: "Acabamento",
    termo: "Laminado antiderrapante para piso",
    texto:
      "Filme de protecao com textura aplicado por cima do adesivo de chao. Protege a impressao do pisoteio, do carrinho e do produto de limpeza e, ao mesmo tempo, da agarre ao pe para o adesivo nao virar escorregador. E um laminado especifico de piso, diferente do laminado comum de impressao. Indicado onde passa muita gente: loja, supermercado, galeria e evento.",
    dica: "Adesivo de chao sem esse laminado risca e desbota rapido em area de movimento, e molhado vira risco de queda, problema que sobra para o cliente. E em piso texturizado, poroso ou encerado ele nao cola direito nem com laminado: confira o piso na medicao antes de vender.",
  },

  // ---- peca (pesquisa de 04/08) ------------------------------------------
  {
    categoria: "Peca",
    termo: "Roll-up (banner retratil)",
    texto:
      "Banner que fica enrolado dentro de uma base de aluminio: puxa a lona para cima, encaixa a haste e esta montado em poucos minutos; depois a lona volta para dentro da base e vai na bolsa de transporte. Usado em feira, recepcao, evento, treinamento e loja, quando a peca precisa aparecer hoje e sumir amanha. A medida mais vendida fica perto de 80 cm de largura por 2 m de altura, e existem versoes mais largas.",
    dica: "A lona precisa ser a propria para roll-up, com camada que bloqueia a luz, senao aparece a sombra da estrutura e a imagem do outro lado. A arte tambem perde alguns centimetros em cima (na haste) e embaixo (na parte presa a base), entao logo e telefone colados na borda somem. E quando o cliente so vai trocar a campanha, venda so a lona nova: a estrutura ele ja tem e ela custa mais que o refil.",
  },
  {
    categoria: "Peca",
    termo: "Porta-banner X e L",
    texto:
      "Suportes simples e baratos para segurar banner. O X e uma cruzeta que estica a lona pelos quatro cantos, com elastico ou ilhos; o L e uma base com haste que prende a peca em cima e embaixo. Servem para acao rapida, stand pequeno, panfletagem e loja, quando o roll-up sai caro demais.",
    dica: "Sao os suportes que mais tombam com vento e esbarrao: em calcada, corredor movimentado ou area aberta, avise o risco e ofereca cavalete ou roll-up de base pesada. E a lona tem que sair com os pontos de fixacao (ilhos ou reforco) na medida exata do suporte; fora da medida ela fica frouxa e enrugada ja na primeira foto.",
  },
  {
    categoria: "Peca",
    termo: "Cavalete de calcada (A-frame)",
    texto:
      "Placa de duas faces em formato de A que fica na porta da loja ou no corredor do shopping chamando quem passa. Feito em metal, plastico ou madeira, com a arte em adesivo, chapa de PVC ou quadro de giz para trocar a oferta quando quiser. Vende muito para restaurante, bar, farmacia e loja de rua.",
    dica: "Calcada e espaco publico: a maior parte das cidades exige autorizacao e passagem livre para o pedestre, e o fiscal recolhe a peca irregular. Confirme a regra da cidade antes de fechar e deixe claro que a licenca e responsabilidade do cliente. Oriente tambem a recolher a noite, porque cavalete leve tomba com vento e some com facilidade.",
  },
  {
    categoria: "Peca",
    termo: "Placa de obra",
    texto:
      "Placa que identifica quem responde tecnicamente pela obra: nome do profissional, titulo, numero de registro no conselho (CREA para engenheiro, CAU para arquiteto), o numero da anotacao de responsabilidade (ART ou RRT) e a atividade sob responsabilidade. A lei obriga a manter a placa visivel e legivel enquanto a obra durar. Nao confunda com a placa de marketing do empreendimento, que e outra peca e outro orcamento.",
    dica: "Quem dita o conteudo e o profissional responsavel, nao o dono da obra nem voce: peca por escrito o registro e o numero da ART ou RRT antes de produzir, porque numero errado significa placa refeita por sua conta e risco de autuacao para o cliente. Tamanho, itens obrigatorios e local seguem regra do conselho e, as vezes, da prefeitura, entao confirme antes de fechar a medida.",
  },
  {
    categoria: "Peca",
    termo: "Tapume de obra adesivado",
    texto:
      "O fechamento da obra (chapa de madeira, OSB ou metal) revestido com lona ou adesivo impresso, virando uma midia enorme na calcada. Muito usado em lancamento imobiliario, reforma de loja e obra dentro de shopping: esconde o canteiro, protege quem passa e ja anuncia o que vem ai.",
    dica: "Tapume de madeira nao e superficie lisa: OSB e compensado sao porosos, tem emenda, prego e folga entre as chapas, e o adesivo bolha e descola na primeira chuva. Nesses casos o certo e lona impressa esticada e grampeada, deixando o adesivo para chapa lisa, limpa e seca. Combine no orcamento quem retira no fim (e a parte sempre esquecida) e confirme se a prefeitura ou a administracao do shopping limita anuncio no tapume.",
  },
  {
    categoria: "Peca",
    termo: "Faixa de rua",
    texto:
      "Faixa de lona comprida, com bainha e corda nas pontas, amarrada entre postes, arvores ou muros para anunciar promocao, evento ou festa por poucos dias. Barata e rapida, e feita para leitura a distancia: cabe pouca palavra e a letra precisa ser bem grande.",
    dica: "Em via publica a faixa quase sempre depende de autorizacao e tem prazo curto de permanencia; sem isso o fiscal recolhe e a multa sobra para o cliente. Deixe por escrito que licenca, pendurar e retirar sao com ele, ou cobre esse servico a parte. Cuidado redobrado com pedido de candidato: a lei eleitoral proibe propaganda em poste, arvore e outros bens de uso comum, entao a peca pode virar problema mesmo pronta e paga.",
  },
  {
    categoria: "Peca",
    termo: "Testeira",
    texto:
      "Faixa horizontal que fecha a parte de cima de uma area. Na gondola do supermercado, e a tira que identifica a categoria ou a promocao no topo da prateleira, normalmente em poliestireno ou PVC fino. Na loja, a testeira de fachada e a faixa acima da vitrine ou do toldo com o nome do negocio. Nos dois casos e a peca que a pessoa le de longe antes de olhar o resto.",
    dica: "Testeira de gondola quase nunca e uma peca so: sao dezenas iguais por loja. Peca a medida real do trilho e a contagem por corredor, porque errar a medida inutiliza o lote inteiro, nao uma peca. Na fachada, a testeira conta como anuncio e costuma entrar na area que a prefeitura fiscaliza, entao confira o limite da cidade antes de aumentar a letra.",
  },
  {
    categoria: "Peca",
    termo: "Stopper, wobbler e mobile",
    texto:
      "O trio de pecas pequenas que chama atencao dentro da loja. O stopper sai perpendicular a prateleira e corta o corredor na altura dos olhos; o wobbler fica preso por uma haste flexivel e balanca na frente do produto; o mobile fica pendurado no teto marcando a area da campanha. E o basico de acao de PDV: barato por unidade e vendido em quantidade.",
    dica: "Quem decide nao e a arte, e a regra do varejo: muita rede proibe furar ou colar na gondola, limita a altura do mobile e so aceita material aprovado por ela. Pergunte a norma da rede antes de produzir mil pecas. E trate como material de consumo: quem instala e a equipe de merchandising, entao venda com sobra para reposicao, porque sempre some peca no caminho.",
  },
  {
    categoria: "Peca",
    termo: "Display de chao e ilha promocional",
    texto:
      "Expositor solto no piso da loja que segura o produto e faz a propaganda ao mesmo tempo. Em papelao ondulado quando a acao dura poucas semanas; em MDF, poliestireno ou metal quando fica meses. Ilha e a versao maior, montada no meio do corredor ou na ponta de gondola.",
    dica: "Papelao aguenta pouco peso e nao sobrevive a piso molhado ou area de entrada: se o produto for pesado ou a acao longa, o barato sai caro e a marca fica torta na loja. Pergunte sempre o peso do produto e o tempo da acao antes de indicar o material, e confirme se a peca montada passa pela porta e pelo elevador e cabe no espaco que a loja liberou.",
  },
  {
    categoria: "Peca",
    termo: "Neon de LED (neon flex)",
    texto:
      "Mangueira flexivel de LED que imita o brilho do neon antigo de vidro. Ela e moldada no formato da letra ou do desenho e fixada sobre uma base recortada em acrilico ou PVC. Nao tem tubo de vidro para quebrar nem a alta tensao do neon de gas, e consome pouca energia. Virou o preferido em bar, cafe, salao de beleza, recepcao e painel de foto.",
    dica: "O desenho manda no orcamento: traco muito fino, letra cheia de detalhe ou fonte com serifa nao viram mangueira, entao simplifique a arte junto com o cliente antes de fechar o preco. Combine tambem de onde vem a energia, porque a maioria das versoes trabalha com fonte, que precisa de tomada perto e de um lugar escondido para ficar. Para area externa, exija do fornecedor a versao propria para chuva e sol com fonte protegida: a de interior desbota e falha rapido no tempo.",
  },
  {
    categoria: "Peca",
    termo: "Painel de LED (midia digital)",
    texto:
      "Tela formada por modulos de LED que exibe imagem e video, com o conteudo trocado por computador ou celular. Entra no lugar do luminoso ou da placa fixa quando o cliente quer mudar a oferta o tempo todo: fachada de loja, totem, palco, recepcao e placar.",
    dica: "O numero com P (P4, P6, P10) e a distancia em milimetros entre os pontos de luz e manda na nitidez: pela regra pratica do mercado, quanto maior o numero, mais longe a pessoa precisa estar para a imagem fechar, entao painel de P alto colocado na porta da loja fica granulado de perto. Antes de orcar confirme tres coisas: de que distancia as pessoas olham, se e uso externo (chuva, sol e brilho que vence a luz do dia) e quem vai atualizar o conteudo depois, porque painel sem responsavel vira quadro parado. Confira ainda se a prefeitura permite anuncio luminoso ou com movimento naquele ponto.",
  },
  {
    categoria: "Peca",
    termo: "Sinalizacao de emergencia (fotoluminescente)",
    texto:
      "Placas e faixas de saida, extintor, hidrante e rota de fuga feitas em material que absorve luz e continua brilhando no escuro, guiando a saida quando falta energia ou ha fumaca. Faz parte do projeto de prevencao de incendio e e conferida na vistoria do Corpo de Bombeiros, por isso o pedido quase sempre chega com prazo apertado.",
    dica: "Aqui nao se cria layout: cor, simbolo, tamanho e posicao seguem a norma de sinalizacao de emergencia (ABNT NBR 16820, que substituiu a antiga NBR 13434) e o projeto aprovado pelos bombeiros. Peca bonita fora do padrao reprova na vistoria e volta para refazer, no prazo do cliente. Use material fotoluminescente certificado e nunca substitua por adesivo comum impresso em verde, que nao brilha no escuro.",
  },
  {
    categoria: "Peca",
    termo: "Placa em braile e alto-relevo",
    texto:
      "Placa de identificacao de sala, banheiro, elevador e escada com o texto tambem em relevo e em braile, para quem nao enxerga ler com o dedo. E exigida em predio publico e em boa parte dos lugares que atendem publico, seguindo a norma de acessibilidade ABNT NBR 9050.",
    dica: "A norma define o basico e e onde todo mundo erra: a placa vai na parede ao lado da porta, do lado da macaneta, nunca na folha da porta (que se move), numa altura de alcance da mao (por volta de 1,20 m a 1,60 m do piso), com contraste forte entre texto e fundo, o braile abaixo do texto em relevo e sem quina cortante. Braile so impresso ou desenhado nao vale: o ponto precisa ser relevo de verdade. Erro aqui nao volta como reclamacao de arte, volta como reclamacao de acessibilidade.",
  },

  // ---- instalacao (pesquisa de 04/08) ------------------------------------
  {
    categoria: "Instalacao",
    termo: "Aplicacao a seco e a umido",
    texto:
      "Sao as duas formas de assentar o adesivo. A seco e o padrao hoje: mais rapida, e o vinil ja agarra assim que encosta, sobrando pouca margem para corrigir a posicao. A umido, o instalador borrifa agua com um pingo de detergente para o adesivo deslizar e dar para ajustar, e so vale em superficie lisa que nao sofre com agua, como vidro e metal.",
    dica: "Na aplicacao a umido a peca ainda precisa secar por baixo, e nesse tempo pode aparecer bolha ou borda solta; ja os vinis com canal de ar foram feitos para trabalhar a seco. Se a peca e grande, combine o metodo com a producao antes do dia da instalacao, em vez de decidir na obra.",
  },
  {
    categoria: "Instalacao",
    termo: "Preparacao da superficie (limpeza e promotor de aderencia)",
    texto:
      "Antes de colar qualquer coisa, a superficie tem que estar limpa, seca e sem gordura, normalmente com alcool isopropilico e um pano que nao solta fiapo. Em material dificil, como alguns plasticos, metal pintado e superficie porosa, usa-se ainda o promotor de aderencia (o primer), passado antes da fita ou do adesivo e deixado secar.",
    dica: "Parede recem-pintada, textura, cal e madeira crua sao as campeas de adesivo caindo depois. Se o cliente ainda vai pintar, a ordem certa e pintar, esperar a tinta curar pelo prazo que o fabricante da tinta indica e so entao instalar; fora dessa ordem, o retrabalho fica por conta da casa.",
  },
  {
    categoria: "Instalacao",
    termo: "Fita dupla face estrutural (fita VHB)",
    texto:
      "Fita de espuma acrilica de dupla face que cola de vez, sem furo e sem parafuso aparente, usada para prender letra, placa, painel e chapa de ACM. Nas versoes indicadas para area externa, substitui rebite e solda em muita aplicacao e ainda acompanha a dilatacao das pecas com o calor. VHB e marca da 3M que virou o nome popular da fita.",
    dica: "Ela nao chega na forca total na hora: tem um tempo de cura antes de poder receber carga, e nao perdoa superficie suja, umida, porosa ou fora de esquadro, nem dia muito frio. Peca pesada ou parede irregular pede tambem fixacao com parafuso, senao a peca desce sozinha depois.",
  },
  {
    categoria: "Instalacao",
    termo: "Kit de fixacao (bucha, parafuso, silicone)",
    texto:
      "E todo o miudo que de fato segura a peca no lugar: bucha, parafuso, chumbador, rebite, silicone e vedante. Muda conforme a parede, porque drywall, gesso, tijolo furado, concreto e vidro pedem buchas diferentes, e cada combinacao aguenta um peso.",
    dica: "E o item que mais some do orcamento e depois volta como custo do instalador ou visita extra. Pergunte na medicao de que e a parede e deixe o kit escrito na proposta; bucha de concreto em drywall e chamado de garantia na certa.",
  },
  {
    categoria: "Instalacao",
    termo: "Espacador (prolongador)",
    texto:
      "Pecinha cilindrica de aluminio ou inox que afasta a letra, a placa ou o painel da parede, criando um vao com sombra atras. E o que da o efeito de peca flutuando, com cara de trabalho mais caro, e tambem e usada para prender chapa de acrilico e vidro.",
    dica: "Como fica um vao, tudo que estiver atras aparece: fio solto, bucha torta, parede manchada. Exige parede regular e furacao por gabarito, e em area externa entra sujeira e agua no vao - avise que vai precisar de limpeza de vez em quando.",
  },
  {
    categoria: "Instalacao",
    termo: "ART e RRT (responsavel tecnico)",
    texto:
      "ART e a anotacao que o engenheiro registra no CREA; RRT e o documento equivalente do arquiteto, no CAU. E o papel que diz quem responde tecnicamente pelo calculo, pelo projeto e pela montagem da peca. Costuma ser exigido em totem, painel, letreiro grande e estrutura em altura, principalmente quando prefeitura, shopping ou condominio pede o documento antes de liberar o servico.",
    dica: "A ART tem custo e prazo proprios e precisa existir ANTES de comecar a montagem; se o cliente so lembrar disso no dia, a equipe volta com a peca no caminhao. Deixe escrito no orcamento quem paga e o que ela cobre (projeto, execucao ou os dois).",
  },
  {
    categoria: "Instalacao",
    termo: "Carga de vento",
    texto:
      "E a forca que o vento faz na peca depois de instalada. Quanto maior e mais alta a placa, mais ela empurra a estrutura e os pontos de fixacao, e por isso o dimensionamento de peca grande segue a norma brasileira de forcas devidas ao vento em edificacoes (ABNT NBR 6123). Aparece em fachada, painel, totem e qualquer letreiro em altura ou sobre laje.",
    dica: "Peca fechada pega muito mais vento que peca vazada ou com tela mesh, entao nao da para orcar uma fachada grande so multiplicando o preco de uma pequena: a estrutura muda. Vento e o que derruba letreiro em temporal, e ai vira acidente, nao so retrabalho.",
  },
  {
    categoria: "Instalacao",
    termo: "NR-10 (servico com eletricidade)",
    texto:
      "Norma de seguranca do trabalho para quem mexe com eletricidade: exige treinamento especifico e procedimento proprio para ligar, alterar ou dar manutencao em peca energizada. Vale para luminoso, letra caixa iluminada, totem com LED e qualquer ligacao no quadro do cliente. Montar peca sem energia nao entra nessa exigencia, mas trabalhar perto de fiacao viva entra.",
    dica: "Escreva no orcamento ate onde vai o servico eletrico da Impresilk e onde comeca o do eletricista do cliente. Sem isso no papel, se depois queimar fonte, cair disjuntor ou dar curto, a garantia vira discussao sobre quem ligou.",
  },
  {
    categoria: "Instalacao",
    termo: "Plataforma elevatoria e andaime",
    texto:
      "Sao as duas formas de chegar em altura. A plataforma elevatoria (tesoura, articulada ou de lanca, que muita gente chama de sky) sobe rapido e deixa o instalador rente a fachada, mas precisa de piso firme e espaco para manobrar. O andaime sai mais barato de alugar, porem leva tempo para montar e desmontar e ocupa a calcada. A escolha depende da altura, dos obstaculos (marquise, toldo, canteiro, fio) e de quantos dias a equipe vai ficar.",
    dica: "Em fachada alta o acesso pode custar mais que a propria peca, e a locacao e cobrada por diaria: dia perdido por chuva, loja fechada ou autorizacao que nao saiu e prejuizo direto. Confirme altura, acesso e tipo de piso na medicao e cobre o acesso no orcamento, nunca de cortesia.",
  },
  {
    categoria: "Instalacao",
    termo: "Chumbador e tipo de parede",
    texto:
      "O que segura a peca nao e a placa, e o ponto de fixacao, e cada base pede um tipo. Alvenaria e concreto aceitam chumbador; drywall so aguenta peca leve, com bucha propria para parede oca ou reforco por dentro; vidro normalmente pede prendedor especifico ou fixacao na estrutura de aluminio; e ACM e revestimento, nao base, entao precisa de estrutura por tras.",
    dica: "Descubra do que a parede e feita ainda na medicao, com o cliente autorizando um ponto de teste. Letreiro grande preso so no gesso ou so no ACM cede com o tempo e arranca o revestimento junto; o conserto sai bem mais caro que o reforco que voce deixou de vender.",
  },
  {
    categoria: "Instalacao",
    termo: "Vistoria da base (marquise e laje antiga)",
    texto:
      "Antes de pendurar peso, alguem precisa olhar em que estrutura a peca vai se apoiar. Marquise e laje em balanco de predio antigo podem estar com a ferragem corroida e nao aguentar carga nova; nesse caso quem avalia e um engenheiro, com laudo. Vale sempre que a peca for pesada, ficar sobre a calcada ou o predio for velho.",
    dica: "Sinais de alerta na medicao: mancha de infiltracao, ferro aparecendo, concreto lascado e outras cargas ja penduradas (ar condicionado, letreiro antigo). Se a marquise ceder, a responsabilidade principal e do dono do imovel, mas quem instalou entra na briga do mesmo jeito: registre por escrito o que voce viu.",
  },
  {
    categoria: "Instalacao",
    termo: "Afastamento da rede eletrica",
    texto:
      "Fachada com fio de energia passando na frente exige manter distancia de seguranca, e a regra e tratar a rede como sempre energizada, mesmo parecendo desligada. Quando nao da para manter esse afastamento, o caminho e pedir desligamento programado a concessionaria (aqui, a Cemig), que tem pedido, agenda e prazo proprios. Comum em rua comercial estreita e em letreiro alto perto do poste.",
    dica: "Desligamento nao sai de um dia para o outro nem no horario que voce escolher, entao nunca prometa data de instalacao antes de confirmar. Fotografe a rede na medicao: marcar montagem sem olhar o fio e risco de acidente grave ou de remarcar tudo.",
  },
  {
    categoria: "Instalacao",
    termo: "Ponto de energia e disjuntor",
    texto:
      "Peca iluminada precisa de um ponto de energia chegando ate ela, com disjuntor adequado e, de preferencia, um circuito so para o letreiro, como manda a norma brasileira de instalacoes eletricas de baixa tensao (ABNT NBR 5410). Quem costuma deixar esse ponto pronto e o eletricista do cliente, e ele tem que estar no lugar antes do dia da instalacao. Quem instala liga a peca no ponto que JA existe: levar a energia ate ali -- passar cabo, disjuntor, tomada, quadro -- e servico eletrico, e precisa estar escrito de quem e.",
    dica: "Ligar o luminoso no mesmo circuito da loja faz o disjuntor cair quando tudo liga junto, e o cliente vai culpar o letreiro. Peca o ponto com antecedencia e combine em que altura e posicao ele deve sair: furar parede e puxar fio depois estraga acabamento ja pronto. Sem esse combinado no papel, a peca chega pronta no dia da inauguracao e simplesmente nao acende -- e a cobranca cai em quem vendeu.",
  },
  {
    categoria: "Instalacao",
    termo: "Aterramento e DR",
    texto:
      "Aterramento e o fio terra ligado a parte metalica da peca; o DR e o dispositivo do quadro que desarma sozinho quando ha fuga de corrente. Como totem, luminoso e estrutura de letra caixa ficam ao alcance das pessoas e tomam chuva, essa protecao e o que evita choque, e a norma de instalacoes eletricas de baixa tensao pede isso em area externa.",
    dica: "Muita peca antiga na rua esta sem terra e ninguem percebe ate alguem tomar choque encostando no totem molhado. Se o quadro do cliente nao tem DR nem terra, registre por escrito antes de energizar: depois do susto ninguem lembra do que foi combinado so na conversa.",
  },
  {
    categoria: "Instalacao",
    termo: "Manutencao preventiva de luminoso",
    texto:
      "Revisao periodica da peca iluminada: testar acendimento e uniformidade, reapertar a fixacao, limpar, conferir vedacao e sinal de infiltracao e revisar fonte, ligacoes e aterramento. O intervalo entra no contrato e fica mais curto onde tem muita poeira, maresia ou poluicao. E o que mantem o letreiro aceso e firme depois que a garantia acaba.",
    dica: "LED nao apaga tudo de uma vez: perde brilho e vai falhando por modulo, deixando o letreiro manchado bem na campanha do cliente. Ofereca o contrato de manutencao na entrega, enquanto ele esta satisfeito; depois ele so liga quando ja esta apagado e com pressa.",
  },
  {
    categoria: "Instalacao",
    termo: "Janela de instalacao",
    texto:
      "E o horario em que se pode instalar. Shopping normalmente so libera servico barulhento ou que gera poeira depois do fechamento, com autorizacao previa e documentos da equipe; rua movimentada e centro comercial tem restricao de carga e descarga e pedem montagem bem cedo ou no domingo. Isso muda o custo e a data da entrega.",
    dica: "Madrugada, fim de semana e feriado custam mais e precisam estar no orcamento, nao ser descobertos no dia. Se o cliente for de shopping, peca o manual do lojista logo na proposta: costuma exigir projeto assinado, responsavel tecnico, documentos de seguranca da equipe e ate seguro antes de deixar alguem entrar.",
  },
  {
    categoria: "Instalacao",
    termo: "Isolamento de area",
    texto:
      "E fechar com cone, fita e placa a area embaixo e ao redor de quem esta trabalhando em altura, para ninguem passar onde pode cair ferramenta ou pedaco da peca. Quem executa o servico e o responsavel por sinalizar e isolar. Vale em qualquer instalacao sobre calcada, porta de loja ou lugar com gente circulando.",
    dica: "O cliente quase sempre pede para nao atrapalhar o movimento, mas uma ferramenta caindo de cinco metros machuca serio. Se nao da para isolar em horario comercial, a instalacao tem que ser fora do horario, e isso precisa entrar no preco desde o orcamento, nao virar discussao no dia.",
  },
  {
    categoria: "Instalacao",
    termo: "Deslocamento e diaria de equipe",
    texto:
      "Servico fora da cidade ou em local dificil tem custo proprio: viagem e alimentacao da equipe, frete da peca, hospedagem e aluguel de andaime ou plataforma elevatoria, que costumam ser cobrados por diaria. Esse custo entra na proposta separado do valor da peca.",
    dica: "Se a equipe chega e o local nao esta pronto (parede em obra, loja fechada, energia desligada, sem liberacao do shopping), a viagem foi perdida e voltar e outra diaria. Confirme na vespera com quem tem a chave e deixe escrito no orcamento que a segunda ida e cobrada.",
  },

  // ---- arte e processo (pesquisa de 04/08) -------------------------------
  {
    categoria: "Arte e processo",
    termo: "Vetor x bitmap",
    texto:
      "Vetor e desenho feito por calculo de linhas e curvas: da para ampliar de cartao para fachada sem perder nitidez. Bitmap e feito de pontinhos (foto, print, imagem baixada da internet): ampliou demais, borra e quadricula. Logo, texto e qualquer coisa que va ser recortada pedem vetor. Na pratica: logo em PNG ou JPG e bitmap; o original vem em .cdr, .ai, .eps ou PDF vetorial.",
    dica: "O logo que chega em PNG pelo WhatsApp quase sempre e bitmap e nao serve para letra caixa, recorte nem fachada. Peca o arquivo vetorial ja no primeiro contato, ou o maior original que o cliente tiver, e orce a vetorizacao quando nao existir -- descobrir isso na vespera da producao atrasa a obra inteira. Aumentar o DPI no programa nao resolve: nao volta detalhe que a imagem nunca teve. Logo tirado do WhatsApp, do Instagram ou do Google fica serrilhado quando amplia, e isso so aparece com a peca ja impressa -- peca o arquivo original antes de orcar.",
  },
  {
    categoria: "Arte e processo",
    termo: "Linha de corte (corte contorno)",
    texto:
      "Linha desenhada no arquivo, em camada e cor separadas, que diz a maquina por onde recortar. Usada em adesivo de formato livre, etiqueta, letra recortada e peca em ACM ou acrilico. Tambem aparece como corte contorno, corte especial ou CutContour.",
    dica: "Essa linha nao pode estar misturada com a arte: se ficar junto, ela sai impressa e vira um risco visivel na peca. E a arte precisa sobrar um pouco para fora do corte -- se terminar exatamente em cima da linha, qualquer desvio de milimetros deixa uma tira branca aparecendo na borda.",
  },
  {
    categoria: "Arte e processo",
    termo: "Arquivo aberto e arquivo fechado",
    texto:
      "Arquivo aberto e o arquivo de trabalho, que ainda da para editar (CorelDRAW .cdr, Illustrator .ai, Photoshop .psd). Arquivo fechado e a versao pronta so para imprimir, normalmente em PDF, com as fontes e as imagens ja embutidas. Para produzir a peca a gente precisa do aberto ou de um PDF fechado direito; print de tela e foto do layout nao servem.",
    dica: "Se o cliente quiser ficar com o arquivo aberto no fim do trabalho, combine isso e o valor ANTES de comecar: com o aberto na mao ele reimprime com qualquer concorrente. E arquivo aberto so abre certo se as fontes e as imagens usadas forem junto.",
  },
  {
    categoria: "Arte e processo",
    termo: "Arte final",
    texto:
      "E o arquivo pronto para producao: no tamanho real da peca, nas cores certas, com sobra de corte, textos revisados e logo em qualidade suficiente para o tamanho final. Layout bonito na tela nao e arte final; arte final e o que a maquina vai imprimir ou cortar e o instalador vai seguir.",
    dica: "Arte que o cliente manda 'pronta' quase nunca esta em arte final. Confira antes de prometer prazo e combine a conferencia e o ajuste como servico, senao a producao para no meio esperando o arquivo certo e o atraso sobra para a gente.",
  },
  {
    categoria: "Arte e processo",
    termo: "Fontes em curvas",
    texto:
      "E transformar as letras em desenho, para o texto nao depender mais da fonte instalada no computador. E o padrao para mandar arquivo para producao: sem curvas, o computador da producao troca por uma fonte parecida e o texto sai com outra letra, espaco errado ou simbolo estranho.",
    dica: "Depois de converter, o texto nao da mais para editar nem corrigir erro de digitacao. Guarde sempre duas versoes, uma editavel e uma em curvas; senao trocar um telefone vira arte nova do zero.",
  },
  {
    categoria: "Arte e processo",
    termo: "Layout e mockup (simulacao)",
    texto:
      "Layout e o desenho da arte em si. Mockup, ou simulacao, e essa arte montada na foto do lugar real (a fachada do cliente, a vitrine, o carro) para ele ver como vai ficar. E o que mais ajuda a fechar venda, porque tira a peca da imaginacao.",
    dica: "Diga que a simulacao e ilustrativa. Angulo e luz da foto enganam tamanho, brilho e cor, e o resultado real ainda depende da parede, do vidro ou da lataria onde a peca vai. Cliente que entende simulacao como foto do produto reclama na entrega.",
  },
  {
    categoria: "Arte e processo",
    termo: "Aprovacao de arte",
    texto:
      "E o aceite do cliente, por escrito, no arquivo exato que vai para producao. So depois dela a empresa compra material, imprime e corta. Por isso o prazo de producao comeca a contar da aprovacao, e nao do dia em que o pedido foi feito.",
    dica: "'Ta bom' no telefone nao vale como aprovacao. Peca resposta escrita no WhatsApp ou e-mail com o arquivo anexo, e avise que texto, telefone, nome, endereco e medidas sao conferidos pelo cliente: erro que passou na arte aprovada e refeito por conta dele.",
  },
  {
    categoria: "Arte e processo",
    termo: "Alteracao depois da aprovacao",
    texto:
      "E qualquer mudanca pedida depois que o cliente ja aprovou a arte. Enquanto esta so no arquivo, mudar custa tempo. Depois que o material foi impresso, recortado, dobrado ou soldado, nao tem volta: refazer e material novo, maquina de novo e prazo novo.",
    dica: "Escreva no orcamento quantas alteracoes entram sem custo na fase de arte e que, apos a aprovacao, a mudanca vira peca nova. Sem essa linha no papel, a terceira e a quarta versao viram discussao de preco na hora da entrega.",
  },
  {
    categoria: "Arte e processo",
    termo: "Vetorizacao (redesenho do logo)",
    texto:
      "E redesenhar o logo em vetor quando o cliente so tem PNG, JPG ou uma foto do letreiro antigo. E servico de arte, com tempo e custo proprios; nao e 'converter o arquivo' num clique.",
    dica: "Vetorizacao automatica deixa borda tremida e canto torto, e defeito pequeno na tela vira defeito grande na fachada. Peca o redesenho na mao e mostre para o cliente aprovar antes de cortar. Combine tambem se o vetor fica com ele ou so com a empresa: entregar sem combinar e dar de graca o que foi pago uma vez.",
  },
  {
    categoria: "Arte e processo",
    termo: "Direito de uso de imagem, fonte e marca",
    texto:
      "Foto, ilustracao e fonte tipografica tem dono e vem com uma licenca escrita que diz onde podem ser usadas. Existe licenca gratuita, licenca paga e a de uso editorial (jornalistico), que NAO vale para propaganda. Imagem achada no Google e fonte 'gratis' baixada de qualquer site costumam nao ter licenca para uso comercial.",
    dica: "Fachada, outdoor e envelopamento sao as pecas mais visiveis, justamente as que atraem cobranca de direito autoral. Guarde o comprovante da licenca junto do pedido e nunca use foto de pessoa, personagem ou marca de terceiro sem autorizacao. Se a conversa virar duvida juridica, nao opine: passe para a direcao.",
  },
  {
    categoria: "Arte e processo",
    termo: "Manual de marca",
    texto:
      "E o documento com as regras da identidade visual do cliente: cores oficiais, versoes permitidas do logo, tamanho minimo, espaco livre em volta e o que nao pode ser feito. Empresa media e grande, franquia e orgao publico quase sempre tem um.",
    dica: "Peca o manual ANTES de desenhar. Franquia costuma exigir aprovacao da rede, e fachada fora do padrao pode ser mandada refazer com a peca ja instalada. Cor 'parecida' com a da marca tambem e motivo de recusa.",
  },
  {
    categoria: "Arte e processo",
    termo: "Prazo de producao, de entrega e de instalacao",
    texto:
      "Sao tres prazos diferentes. Producao e o tempo de fabricar a peca, contado da aprovacao da arte e do pagamento combinado. Entrega e o transporte ate o local. Instalacao e a data em que a equipe monta, que depende da agenda, do equipamento e do local liberado.",
    dica: "Informe os tres separados e por escrito, nunca um numero unico. A instalacao depende do que esta fora da fabrica: chuva, obra atrasada, energia desligada, autorizacao pendente e horario permitido por shopping ou condominio. Peca pronta parada esperando liberacao e prejuizo dos dois lados.",
  },

  // ---- comercial (pesquisa de 04/08) -------------------------------------
  {
    categoria: "Comercial",
    termo: "Metro quadrado (m2)",
    texto:
      "E a unidade em que quase tudo se vende: multiplica-se a largura pela altura da peca pronta (2,00 x 1,00 = 2 m2) e aplica-se o preco do material com o acabamento. Vale para lona, adesivo, chapa e painel. Peca de formato recortado costuma ser cobrada pelo retangulo que ela ocupa no material, e nao pelo desenho, porque a sobra em volta se perde.",
    dica: "Quando o cliente diz 'minha fachada tem 10 metros', ele quase sempre esta falando so da largura. Pergunte a altura antes de dar qualquer preco: 10 x 1,20 e o dobro de 10 x 0,60. E confirme se a medida e do vao ou da peca acabada, porque bainha e dobra tambem consomem material.",
  },
  {
    categoria: "Comercial",
    termo: "Preco minimo",
    texto:
      "Valor minimo cobrado por peca ou por pedido, mesmo quando a conta do metro quadrado daria menos. Existe porque atender, fechar a arte, ligar a maquina, cortar, dar acabamento e embalar custa quase o mesmo numa peca de 20 cm e numa de 2 metros. Cada empresa define o seu.",
    dica: "O cliente vai fazer regra de tres na sua frente ('se 1 m2 custa X, meu adesivo de 20 cm devia ser X dividido por 25'). Diga o valor minimo no comeco da conversa, nunca depois do orcamento pronto: dito no fim, soa como aumento de preco.",
  },
  {
    categoria: "Comercial",
    termo: "Aproveitamento de material (perda)",
    texto:
      "Os materiais vem em bobina (rolo) ou em chapa de tamanho fechado de fabrica, e o que sobra da tira ou da chapa e perda que entra no preco. Vinil costuma vir em bobina em torno de 1,00 a 1,50 m de largura; lona tem opcoes bem mais largas. Chapas rigidas, como ACM e PVC expandido, tambem tem largura e comprimento fixos, que mudam de fornecedor para fornecedor.",
    dica: "Poucos centimetros a mais podem obrigar a usar duas tiras ou duas chapas e quase dobrar o custo. Antes de fechar, pergunte se a medida tem folga: as vezes 3 cm a menos deixa a peca bem mais barata. Se nao houver folga, avise que a peca larga vai ter emenda e que a emenda aparece.",
  },
  {
    categoria: "Comercial",
    termo: "Tiragem e custo de preparacao (setup)",
    texto:
      "Tiragem e a quantidade de pecas iguais do mesmo pedido. Boa parte do custo esta na preparacao -- fechar a arte, acertar a cor, regular a maquina, preparar o recorte -- e essa parte se paga uma vez so. Por isso o preco por peca cai conforme a quantidade sobe.",
    dica: "Ofereca sempre o preco de duas ou tres quantidades: o cliente costuma subir o pedido sozinho. E avise que pedir 50 agora e mais 50 no mes que vem sai mais caro que 100 de uma vez, e que a cor pode sair um pouco diferente de uma rodada para a outra.",
  },
  {
    categoria: "Comercial",
    termo: "Orcamento e proposta comercial",
    texto:
      "Orcamento e a lista de precos das opcoes que o cliente pediu; proposta comercial e o documento fechado, com escopo, medidas, material, prazo, forma de pagamento e validade. Quando o cliente e consumidor final, a lei do consumidor obriga a entregar orcamento previo detalhando mao de obra, materiais e equipamentos, condicoes de pagamento e as datas de inicio e fim do servico.",
    dica: "Escreva sempre a validade: sem prazo escrito, o valor orcado vale dez dias contados do recebimento pelo cliente, e depois de aprovado ele prende os dois lados, so mudando com acordo entre as partes. Liste tambem o que sera preciso contratar (guindaste, plataforma, eletricista): servico de terceiro que nao estava no orcamento nao pode ser jogado na conta do consumidor depois.",
  },
  {
    categoria: "Comercial",
    termo: "Sinal (entrada) e ordem de servico",
    texto:
      "Sinal e a parte do valor paga no fechamento, que banca a compra do material; ordem de servico (OS) e o documento que manda produzir, com medidas, cores, textos, prazo e endereco de instalacao. Um destrava o outro: sem sinal e sem OS conferida, nada entra na fila de producao. O percentual do sinal varia de empresa para empresa.",
    dica: "Peca personalizada com o nome do cliente nao tem para quem revender: se o pedido comeca sem sinal e o cliente some, o material e prejuizo inteiro da empresa. E releia a OS com calma -- medida ou texto errados ali viram peca refeita, e a conta fica com quem vendeu.",
  },
  {
    categoria: "Comercial",
    termo: "Garantia e vida util",
    texto:
      "Garantia cobre defeito de fabricacao ou de instalacao: solda que abre, adesivo que descola, LED que queima cedo. Vida util e outra coisa: e quanto tempo a peca aguenta sol e chuva antes de desbotar, e peca externa envelhece muito mais rapido que peca interna. Pela lei do consumidor, o cliente tem no minimo noventa dias para reclamar de defeito em servico ou produto duravel, contados da entrega ou do fim da instalacao (defeito escondido conta de quando aparece); prazo maior e cortesia da empresa e precisa estar por escrito.",
    dica: "Deixe registrado na proposta o que a garantia NAO cobre: vandalismo, temporal e vento forte, batida, lavagem com jato de alta pressao e mexida de terceiro. E explique na venda que desbotar com o tempo e desgaste normal de peca externa, nao defeito -- senao a cobranca chega no ano seguinte.",
  },
];
