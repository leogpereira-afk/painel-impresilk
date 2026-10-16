# Marketing: auditoria de navegação e apresentação

Revisão local em 15/10/2026. Base 2fa6187. Sem publicação ou alterações de registros.

## Achados e correções
- Canais escondidos pelo carrossel: substituído por grade estática com duas fileiras no desktop, quatro colunas no tablet e duas no celular. Newsletter usa o canal existente, sem duplicação. Ordem e permissões continuam derivadas do cadastro.
- Indicadores dentro de cada chip competiam com nomes: números continuam no texto acessível/title e no conteúdo do canal; navegação prioriza nome, ícone e sinal de situação.
- Calendário, histórico, resultados e implantação vazios consumiam espaço: estados vazios compactados, mantendo botões de ação e mensagens.
- Lógica de setas e medidas gerava complexidade e risco de recursão: removida junto aos testes exclusivos do carrossel substituído.

## Fluxos preservados
Fazer, Resultados, Dados quando disponível, Calendário e Histórico; links diretos e parâmetros; papel de visualização; formulários e histórico; gestão de canais em Configurações. Materiais e Drive permanece acessível no topo.

## Limites identificados
Newsletter usa o fluxo genérico de publicações e ações. Esta revisão não implementa disparo, gestão de consentimento nem métricas de abertura. O status em dia deriva das pendências existentes e não comprova envio ou frequência adequada; não alterar essa regra silenciosamente nesta revisão visual.

## Verificação
Build de produção e de revisão aprovados; 50 testes pertinentes aprovados; lint dos componentes alterados sem erros. Prévia com dados fictícios: acesso direto à Newsletter, calendário vazio, grade de canais em desktop e 390 px. Nenhum dado real utilizado nos exemplos. Publicação requer autorização específica conforme AGENTS.md.
