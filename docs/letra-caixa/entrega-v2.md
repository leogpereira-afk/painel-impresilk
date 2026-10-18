# Letra Caixa — fluxo de fabricação e simulação

Estado: implementação e verificação local em 17/10/2026, sem publicação, integração de IA ativa ou escrita no ERP. Este documento substitui o estado funcional da primeira entrega; entrega.md permanece como histórico.

Prévia: http://127.0.0.1:4315/revisao-local.html#/ferramenta-ia?ferramenta=letra-caixa

Clone: `/tmp/painel-letra-caixa-20261017`. Requisitos consolidados: [prompt de fabricação v2](prompt-fabricacao-v2.md).

## O que mudou

- Estúdio ocupa a área inteira do navegador por padrão. Cena se expande no espaço disponível; ajustes e lista de peças são painéis recolhíveis, sem coluna permanente comprimindo o desenho. Botão de saída e Escape preservam o projeto. Navegação por dez etapas; Layout 3D penúltimo e Documentos no final.
- Importação local de SVG e DXF ASCII com prévia, confirmação de escala, alteração proporcional de largura e preservação dos vazados. Formatos não suportados e recursos ativos/externos são bloqueados. Pinturas transparentes ou invisíveis não viram peças sólidas. Exemplos fictícios disponíveis na própria interface.
- Largura da borda/profundidade destacada: 30, 50, 75 e 150 mm ou medida personalizada. Espessura da chapa, folga da face e aba de união são controles distintos. Folga de face atua na geometria; formas que deixam de ser válidas são bloqueadas.
- Famílias com componentes e processos próprios: galvanizada com face acrílica, galvanizada cega, retroiluminada, recortes/camadas em MDF/acrílico/PVC, frente ACM com corpo separado e borda polimérica. Metal usa fibra; MDF/acrílico podem usar CO₂; PVC usa router; perfil polimérico usa corte manual. A opção ACM desta versão não desenvolve letras frisadas em V.
- Roteiro de oficina com pranchas, peças, instruções e pendências por etapa. Cortes independentes dependem da arte; conformação depende das laterais; fechamento reúne componentes, acabamento e iluminação aplicáveis. Ordem visual não impõe uma cadeia artificial entre as máquinas.
- Faixas internas/externas com origem e sentido, divisão automática ou posições de emenda informadas, sobreposição, compensação por contorno, aba e comprimento máximo. Valores desconhecidos continuam pendentes. Não são receitas automáticas de dobradeira.
- Distribuição geométrica de LEDs com dimensões reais do módulo informado, malha ajustável, recuo, exclusão/ajuste manual e respeito aos vazados. Módulos e caminhos visíveis em 2D/3D; vista interna e noite ilustrativa. Contagem por forma, potência, corrente, fontes, ramais, metros de cabo e condutores derivam das mesmas posições.
- Fonte e módulo demonstrativos estão identificados como fictícios. Dados de ficha, capacidade por saída, limite por ramal, posição da fonte, reserva de cabo e resistência por metro podem ser informados. Saídas de fontes independentes; rotas no plano traseiro precisam ser conferidas no local. A simulação não demonstra homogeneidade óptica ou segurança elétrica.
- Chapas separadas por material, espessura e processo; retalhos e quantidades disponíveis não se duplicam entre processos. Faixas desenvolvidas alimentam o plano; perfis lineares permanecem separados. Encaixe ainda usa envelopes retangulares conservadores.
- Pintura com tipo de tinta, cor física, preparo, primer, verniz, demãos, ficha, rendimento e tempos; fixações com método, produto, substrato e condições. Sem valores técnicos inventados.
- Caderno por setor, faixas, mapa LED e circuitos, CSV, molde, SVG/DXF de componentes e ficha de instalação. HTML imprimível como PDF; não é gerador nativo de PDF. Documentos arquivados na revisão antes do download. Mudança dimensional invalida confirmações antigas da instalação e pede reconferência sem apagar o levantamento.

## Verificações executadas

- 1.010 testes passaram na rodada final, sem falhas: ACM, letras, fabricação compartilhada, cálculos, acesso e consulta às O.S. de instalação.
- ESLint: zero erros; um aviso anterior em Agenda.jsx.
- Builds de produção e revisão concluídos. Fontes/Three.js/módulo de letras permanecem acima de 500 kB e carregados sob demanda; essa otimização adicional não foi feita.
- Auditoria independente reproduziu e verificou correções de mistura de processos nas chapas, confirmações antigas de instalação, régua cortada no molde estreito e SVG invisível por transparência.
- Navegador: SVG de 400 × 200 mm, duas formas e três vazados aplicado; borda alterada para 150 mm; fundo incluído; roteiro por setor conferido.
- Alteração da malha de 35 para 25 mm: 36 → 52 módulos, potência 25,92 → 37,44 W. Tela, CSV e caderno coincidiram.
- DXF aplicado em 600 × 300 mm gerou 112 módulos / 80,64 W. Reabertura do JSON preservou SVG 400 × 200 mm, borda 150 mm e 52 módulos.
- Downloads reais de CSV e caderno HTML concluídos e arquivados localmente. CSV conferido com posições, circuito e fonte. Prévia do caderno mostrou pranchas e quantitativos.
- Tela cheia, recolhimento dos ajustes, saída/retorno, Escape, vista interna 3D e alternativa 2D conferidos. Celular em 390 px conferido; viewport de teste restaurado. Nenhum erro JavaScript observado ao final.

## Limites ainda existentes

- SVG/DXF são importações parciais e validadas por recursos suportados; CDR, AI, PDF e imagens precisam ser convertidos em vetores fechados. Não há upload de fonte nesta entrega. Curvas são aproximadas; tolerância para a máquina exige conferência.
- Não há encaixe preciso entre curvas/vazados, G-code, pós-processador CNC, desenvolvimento de ACM frisado, cálculo estrutural/vento nem aprovação de fixação/equipamento de acesso.
- Distribuição LED é geométrica e a noite é ilustrativa. Faltam os modelos e fichas reais da empresa, ensaio com a face/profundidade, percurso físico, bitola/proteções e validação do responsável. Nenhuma receita de espaçamento ou carga demonstrativa vira padrão de oficina.
- Custos continuam parciais quando faltam preços, compensações ou custos de perfis/serviços. Não representam orçamento completo de fabricação automaticamente.
- Associação à O.S. é referência; não envia documentos, não altera registros nem faz anexação remota. A prévia usa dados fictícios.
- Salvamento/revisões/documentos continuam locais no navegador. JSON exporta o projeto atual, não todo o histórico. Pasta temporária e download não são backup em nuvem.

## Referências técnicas consultadas

As referências orientam os campos e limites; não substituem fichas dos produtos utilizados nem procedimentos aprovados da Impresilk.

- [Principal Sloan — biblioteca técnica](https://principalsloan.com/resources/document-library/)
- [Principal Sloan — guia de instalação](https://principalsloan.com/uploads/principal-sloan-led-sign-lighting-install-guide.pdf)
- [SloanLED — instalação em letras](https://sloanled.com/downloads/InstallGuide-ChannelLetter-Retrofit.pdf)
- [3M — guia de projeto VHB](https://multimedia.3m.com/mws/media/1732017O/3m-vhb-tape-design-guide-en.pdf)
- [Trotec — materiais e compatibilidade](https://www.troteclaser.com/en-ca/resources/faqs/what-materials-laser)

Os vídeos de YouTube enviados não tiveram conteúdo integral acessível nesta execução; não são declarados como assistidos ou usados para validar parâmetros.
