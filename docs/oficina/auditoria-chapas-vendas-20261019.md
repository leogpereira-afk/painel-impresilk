# Auditoria e simplificação do Plano de chapas · 19/10/2026

Escopo: geometria nominal para compras, margens, separação, rotação, agrupamento por material e PDF. Publicação autorizada após a prévia.

## Resultado

- Dobras: desenvolvimento nominal = largura + esquerda + direita; altura + superior + inferior. Conferidos 36 cenários assimétricos e limite exato da área útil. Não há dupla contagem de dobras.
- Compra: seis frentes de 100 × 100 cm com quatro abas de 3 cm geram envelopes de 106 × 106 cm, distribuídos em duas chapas 122 × 500 cm, com quatro e duas peças. Margem de 10 mm e separação de 4 mm.
- Aproveitamento: área dos contornos após recortes / área bruta das chapas calculadas. Reserva extra não aumenta aproveitamento. Corrigida a descrição de sobra: inclui recortes, margens e separação, não somente retalho reutilizável.
- Distribuição: quatro heurísticas do ACM Studio, validação de limites, colisões, distância, sentido e conservação de peças. Não é prova de mínimo absoluto. Nenhuma alteração no motor compartilhado.
- Testes variados: 35 projetos determinísticos, cinco linhas cada, com quantidades e cores diferentes; invariantes independentes de posição e conservação aprovados.
- PDF real baixado e lido com PyMuPDF: uma página no exemplo revisado, logo, projeto, formato, margem, separação, sentido, materiais, marca, referência, nomes personalizados, quantidade calculada/reserva/compra, medidas finais e desenvolvidas em cm, quatro abas e distribuição identificada. Leitura e renderização sem perda dos sete painéis do exemplo.

## Entrada simplificada

Primeiro Frente, Lateral ou Coluna com laterais; medidas em cm com vírgula e duas casas, quantidade e botão + Adicionar medida. Campos novos vazios evitam compra com medidas presumidas. Conversão explícita para mm no motor, sem arredondar o estado ao digitar. Entradas ambíguas bloqueiam cálculo/PDF.

Cor e marca aparecem fixas junto da peça. Alterar cor e marca abre os detalhes somente quando necessário. Chapa padrão de 1,22 × 5 m permanece junto das medidas. Materiais diferentes separam lotes de compra.

Coluna em U: uma peça com frente + duas laterais, topo e base abertos. Coluna separada: três painéis identificados F/E/D, quantidade multiplicada pelo número de colunas; acabamento com abas opcionais em cada painel. Laterais aceitas até 100 cm. Peça que não cabe exige revisão explícita, sem emenda automática.

## Verificação

306 testes de ACM/chapas aprovados, incluindo 22 do módulo. Lint dos arquivos alterados, build oficial e git diff --check aprovados. Aviso preexistente de chunks grandes. Navegador: conversão decimal, dobras, ambas montagens de coluna, adicionar linha, material independente e PDF conferidos; sem erro de console. Tela de 390px: documento381px, sem transbordamento horizontal.

Prévia: http://127.0.0.1:4323/revisao-local.html#/ferramenta-ia?ferramenta=chapas-vendas

PDF compacto: chapas horizontais ampliadas com informações ao lado. Exemplo de sete painéis e dois materiais em uma página; teste com 100 itens e descrições longas em 21 páginas, sem texto fora da área útil.
