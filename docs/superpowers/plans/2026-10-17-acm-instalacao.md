# ACM — Planejamento da Instalação

Especificação do usuário aprovada diretamente: acrescentar planejamento do local, medidas, posição, acesso, materiais, ficha e associação às O.S. existentes. Implementar localmente; manter Layout 3D como penúltima aba. Não publicar nem alterar registros do ERP.

1. Motor independente de fabricação: `project.installation` opcional, dimensões internas em mm e pesos em kg. Campos desconhecidos permanecem nulos. O desenho e o cálculo compartilham a mesma geometria; exemplo com espaço de 10 × 4 m, base do espaço explicitamente a 0 m e placa de 4 × 0,8 m gera laterais de 3 m, margens de 1,6 m e topo a 2,4 m do chão. A referência do chão ausente não é substituída por zero.
2. Informações: espaço, altura da base, placa, fotos locais limitadas, terreno, obstáculos, acesso, exposição e duração. Posicionamento centralizado/manual por distâncias, com campos numéricos e ajustes pelas setas do teclado. Exibição em m/cm; cálculos internos em mm. Copiar medidas do ACM é uma ação explícita.
3. Decisões: posição, acesso/execução e fixação confirmados nominalmente por responsável/data com assinatura das entradas relevantes. Mudança invalida a confirmação correspondente; troca de O.S., local ou fotos/observações de contexto também exige nova conferência. Unidade de exibição e horário de edição não reconfirmam decisões. Nenhuma escada, fita ou adesivo recebe capacidade ou aprovação automática; o estado do planejamento nunca libera a obra.
4. Relações: seletor de O.S. existente por cliente ou número, com conferência do detalhe e identidade por source/ID/empresa. Vínculo somente local ao projeto/revisão, sem duplicar ordem, gravar na O.S. ou alterar ERP. A nova ação consultarOrdensInstalacao está preparada em painel-comercial; sua publicação deve anteceder a interface quando houver autorização. A ação ainda não foi publicada. Erro, falta de acesso e ausência de resultado são estados distintos.
5. Interface: sete abas Projeto/Estrutura/Corte ACM/Fixações/Instalação/Layout 3D/Documentos. Editor com esquema proporcional, resumo de margens, pontos de referência, checklist, equipamentos e pendências.
6. Ficha autocontida: imagem, desenho, dados informados/cálculos/decisões, materiais, equipamentos, O.S., responsável e atualização. Arquivar na revisão e disponibilizar impressão/PDF pelo fluxo existente.
7. Verificar cálculos, unidades, limites, confirmação vencida, importação/exportação, ativos seguros, vínculo tipado, acessos e navegador. Dados fictícios apenas no repositório.

Responsáveis: agente de motor/documentos, agente de interface, agente de vínculo O.S.; integração e conferência final pelo principal. As regras oficiais foram atualizadas e conferidas antes do início deste complemento.

## Estado integrado

- Sete abas integradas: Projeto, Estrutura, Corte ACM, Fixações, Instalação, Layout 3D e Documentos. Layout 3D continua penúltimo.
- Modelo opcional de instalação, validação de entradas, cálculos parciais sem valores presumidos, desenho proporcional, marcos, listas de equipamentos/materiais e fotos limitadas disponíveis localmente.
- Ficha autocontida e confirmações separadas por escopo integradas ao projeto/revisão. Pendências e registros desatualizados permanecem explícitos; não existe liberação automática de execução.
- Conferência manual observada na prévia: alternância m/cm; exemplo 10 × 4 m / 4 × 0,8 m com base 0 m resultando em 3 m nas laterais, 1,6 m acima/abaixo e topo a 2,4 m; ajuste manual por setas até 301 cm; alerta de extrapolação; busca de O.S. por cliente e número e conferência do detalhe.
- Associação comercial guarda somente a referência local identificada. Nenhuma gravação na O.S./ERP, publicação ou aplicação de SQL foi realizada. Para disponibilizar a busca em produção, publicar a ação consultarOrdensInstalacao de painel-comercial antes da interface.
- Rodada final integrada: 915 testes passaram, build concluído, ESLint sem erros e com um aviso preexistente em Agenda.jsx. Download real da ficha HTML, vínculo persistido, confirmação e invalidação de posição conferidos na interface.
- Complementos visuais pedidos pelo dono: simulador ocupando a tela útil, controles recolhíveis, cards alinhados, Escape e modo estreito conferidos. Revisão independente corrigiu a rolagem da gaveta no celular.
- Entrega e limitações: [entrega local v2](../../acm-studio/entrega-v2.md).
