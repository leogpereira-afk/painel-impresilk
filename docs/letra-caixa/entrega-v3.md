# Letra Caixa — preenchimento simples v3

Prévia local de 17/10/2026. Escopo desta rodada: somente Letra Caixa. Não houve publicação, escrita no Mubisys ou alteração do ACM nesta rodada.

## Uso

Abra `http://127.0.0.1:4315/revisao-local.html#/ferramenta-ia?ferramenta=letra-caixa`.

1. Em **Arte e medidas**, confira o modelo e escolha **Digitar texto** ou **Importar arquivo**.
2. Informe medidas em **cm** ou **mm**. O modelo interno continua em mm. A largura opcional ajusta o conjunto proporcionalmente; a medida final aparece separada da referência de altura.
3. Use **Continuar: borda e cores**. Os atalhos de 3 / 5 / 7,5 / 15 cm e a borda personalizada permanecem explícitos. Materiais mostram um resumo e podem ser expandidos.
4. Em **Fabricação**, etapas e prancha aparecem antes das configurações de desenvolvimento. Em **Pintura**, a escolha aplicar/dispensar determina os campos visíveis; consumo, tempos e mistura ficam agrupados.
5. Em **LEDs e ligações**, confira quantidades, potência, fontes e o mapa. Distribuição e especificações permanecem disponíveis em grupos técnicos.
6. Use **Completo** para abrir mais detalhes. A troca de modo ou de unidade não modifica o projeto nem cria revisão. O painel de ajustes pode ser recolhido para liberar a cena; no computador ele ocupa uma coluna própria, sem cobrir a letra.

A troca de família é uma alteração real: substitui os materiais-base conforme o modelo existente e pode ser desfeita. Alterar apenas o modo de apresentação não faz essa substituição.

## Pesquisa

Fontes oficiais do Principal Sloan e LED Wizard orientaram a separação entre configuração rápida, preparação do vetor e ajustes de produção. É uma decisão de interface, não uma receita técnica de fabricação.

Guias e vídeos ficam em **Documentos → Referências para estudar letra caixa**. Fontes, seis vídeos e limites de acesso estão em [referencias-v3.md](referencias-v3.md). Títulos e autores dos vídeos foram conferidos, mas o conteúdo integral não foi assistido ou transcrito nesta rodada.

## Verificação

- Suíte de cálculos, geometria, armazenamento, documentos, importação e regressão: **1.012 testes aprovados**, sem falhas.
- Lint geral: zero erros; permanece um aviso anterior em Agenda.jsx. Lint dos componentes alterados: zero erros/avisos.
- Builds de produção e revisão concluídos após as correções. Permanecem avisos de tamanho dos pacotes de fontes/3D.
- Navegador: texto/importação, medida de arte aplicada, 7,5 cm → 75 mm, largura opcional digitada continuamente, bordas, campos condicionais de tinta, etapas de fabricação, LEDs, referências, modos Simples/Completo e cena com controles recolhidos.
- Troca cm/mm e troca de modo preservaram a revisão e os valores. A largura da arte foi alterada de 40 × 20 cm para 30 × 15 cm e recuperada com Desfazer.
- Corrigida perda de foco ao começar a digitar a largura opcional. Reproduzida antes (40 interrompia em 4), repetida depois com 40 completo e 400 mm confirmado.
- Conferência em 390 × 844 e no tamanho normal do painel: sem rolagem horizontal da página; botões e campos acessíveis. Nenhum erro JavaScript registrado no navegador.
- Revisão independente identificou e ajudou a corrigir a perda de foco e uma mensagem de importação que indicava mm quando a unidade visível era cm.

Evidências visuais: [início simples](previa-v3-simples.png) e [resumo LED](previa-v3-leds.png).

## Limites preservados

Os componentes LED e a fonte da demonstração são fictícios. Quantidade e potência são resultados geométricos do modelo configurado; a prévia dia/noite não é fotometria. Fichas, homogeneidade, montagem, elétrica, fixação e liberação de fabricação continuam exigindo validação técnica.

Importação: SVG/DXF ASCII com escala conferida. PDF/CDR/AI e imagens exigem conversão. O aproveitamento continua por envelopes retangulares, sem encaixe entre curvas. Salvamento e documentos são locais; não há anexação remota à O.S. nem aprovação automática de fabricação.
