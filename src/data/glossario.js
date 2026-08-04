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

export const CATEGORIAS = ["Material", "Impressao", "Acabamento", "Peca", "Instalacao"];

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
    dica: "Barato e durabilissimo, mas so faz cores chapadas. Arte com degrade ou foto tem que ser impressa.",
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
    dica: "O corte e a dobra sao feitos na chapa; mudanca de medida depois da chapa cortada vira chapa nova.",
  },
  {
    categoria: "Material",
    termo: "PVC expandido",
    texto:
      "Chapa plastica rigida e leve, facil de cortar. Boa para placa interna, sinalizacao e display que nao pega chuva.",
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
    dica: "Veiculo precisa estar limpo e sem amassado. Superficie ruim reprova a aplicacao, nao o material.",
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
      "Muitos municipios exigem licenca para instalar fachada, totem ou letreiro na via publica, com regras de tamanho.",
    dica: "Pergunte cedo. Peca pronta parada esperando licenca e prejuizo dos dois lados.",
  },
];
