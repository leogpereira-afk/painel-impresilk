# Letra Caixa — especificação de conclusão do fluxo

Implementar uma ferramenta de preparação de fabricação da Impresilk. O usuário rejeitou uma prévia restrita a desenho e cadastros: precisa importar a arte pronta, ver o roteiro da oficina, escolher a largura/profundidade das bordas, distribuir os LEDs e obter quantidades, ligações e documentos derivados do mesmo projeto.

## Fluxo visível e funcional

1. **Projeto / O.S.**: identificação, referência à O.S., arquivos de origem e revisões.
2. **Arte e medidas**: texto ou importação SVG/DXF vetorial, prévia antes de aplicar, dimensões explícitas, vazados preservados, escala editável, unidades em mm. Arquivos não suportados não podem ser apresentados como importados.
3. **Corpo e bordas**: família, face/fundo/laterais separados, corte próprio por material. Campo principal “Largura da borda / profundidade” com 30, 50, 75 e 150 mm e valor personalizado. Não confundir profundidade da letra, espessura da chapa e aba de união. Fundo, folga da face, sobreposição de emenda e processo de união devem ser explícitos.
4. **Fabricação**: roteiro por produto com componentes, máquinas, operações, desenhos e pendências. Na caixa galvanizada com face acrílica: conferência da arte → corte metálico em laser de fibra → corte de face/fundo em processo compatível → conformação das laterais externas/internas → união e acabamento → preparo/pintura/cura → montagem dos LEDs → teste com a face → fechamento e fixação → molde/embalagem → instalação. MDF/acrílico plano não recebe operações de solda/dobra metálica. PVC não recebe laser. Os setores são etapas relacionadas, não listas desconectadas. Cortes em máquinas diferentes podem ocorrer em paralelo após a aprovação da arte; a montagem reúne as dependências aplicáveis.
5. **Pintura**: cor visual e cor física distintas, preparo, primer, tinta, verniz, demãos, sistema compatível e tempos conforme ficha; não assumir cura pela passagem do tempo.
6. **LEDs e elétrica**: modelo e dimensões do módulo, potência/tensão, distância entre módulos e fileiras, recuo de borda, limites por ramal/fonte. Distribuir módulos dentro da área útil e fora dos vazados, contar por letra e total, exibir posições e ligações em 2D/3D e calcular potência/fontes/cabos a partir desses mesmos pontos. Modelo demonstrativo identificado como fictício; permitir ficha real. Distribuição geométrica não equivale a fotometria certificada. Mostrar regiões estreitas sem módulos e dados faltantes. Ligações devem respeitar tensão e saídas; não unir saídas de fontes automaticamente.
7. **Chapas / custos**: componentes efetivos, separação por material/espessura/processo, faixas desenvolvidas conforme compensações informadas; distinguir corte nominal de compensado. Aproveitamento inicial por envelopes, sem prometer encaixe entre curvas. Quantidade aplicada, comprada e sobras separadas.
8. **Layout 3D / instalação**: penúltima etapa, vista externa, aberta/explodida e interna com LEDs; planejamento do local e posicionamento, pontos/fixação e equipamento sem aprovação estrutural automática.
9. **Documentos**: última etapa; pranchas de corte, laterais, pintura, LEDs/ligação, montagem, molde e instalação. Projeto/revisão/unidade e IDs comuns; arquivos técnicos sem texto/cota na camada de corte. Exportações devem refletir a mesma geometria e quantidade exibidas.

## Simulação ocupando a tela

- Abrir o estúdio ocupando a área inteira do navegador, com saída visível e atalho Escape.
- O desenho ocupa o espaço disponível; ajustes, cores, peças e indicadores ficam em painéis recolhíveis sobre a cena.
- Acesso a 2D/3D, vistas, LEDs, contagens e enquadramento sem abandonar o projeto. Preservar interação por mouse, toque e teclado.
- Em telas estreitas, configurações abrem em painel com rolagem própria; a cena não fica comprimida em uma coluna.

## Regras de execução

- Continuar no clone local, preservar o ACM existente; nenhuma publicação ou escrita no Mubisys.
- Reaproveitar o núcleo; regras de letras permanecem em motor próprio.
- Cálculos determinísticos, inputs validados, limites de complexidade e resultados antigos descartados.
- Pronto para simular não significa liberado para fabricar. Não inventar espessura de chapa 24, folga, tinta, rendimento, configuração de máquina, corrente admissível ou capacidade de fixação.
- Preferir um percurso utilizável de ponta a ponta a uma tela com dezenas de controles sem efeito. Cada opção deve atualizar a peça/desenho/lista correspondente.
- Dados e arquivos de demonstração são fictícios. Exemplos fornecidos pelo usuário orientam as etapas; nomes, contatos e O.S. reais não entram no repositório público.

## Critérios de aceite

- Importar SVG com vazado e DXF fechado; conferir escala; gerar componentes e distribuir LEDs na arte importada.
- Trocar borda 30/75/150 mm e observar profundidade, faixas e documentos coerentes.
- Distribuir LEDs em letras O/B e arte pronta, sem módulos dentro dos vazados ou ultrapassando contornos; contagem da tela, potência e CSV iguais.
- Alterar espaçamento e modelo recalcula distribuição, circuitos e consumo. Módulos sem cabimento geram alerta, não sumiço silencioso.
- Roteiro muda conforme galvanizada luminosa/cega, MDF, acrílico ou PVC.
- Documentos reabrem, salvamento conserva importação e configuração, e alterações de arte invalidam saídas anteriores.
- Testes de geometria, importação inválida, distribuição, elétrica, roteiro, documentos e regressões ACM; navegador desktop e celular; revisão independente.
