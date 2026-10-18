# ACM Studio — publicação conferida

Autorizada pelo dono em 17/10/2026: publicar a versão revisada e deixar a consulta de O.S. funcionando.

- Código publicado: `bc728d1`.
- [Pages 39086028148](https://github.com/leogpereira-afk/painel-impresilk/actions/runs/39086028148): build e deploy aprovados.
- [Functions 39086028216](https://github.com/leogpereira-afk/painel-impresilk/actions/runs/39086028216): concluído com sucesso.
- [Abrir ACM Studio](https://leogpereira-afk.github.io/painel-impresilk/ferramenta-ia?ferramenta=acm).

## Servidor e interface

A ação `consultarOrdensInstalacao` foi publicada no `painel-comercial` antes da interface. Versão inicial v78; versão final após a CI: v79 ACTIVE, com os 19 arquivos idênticos aos validados. Uma chamada sem sessão recebeu 401; o preflight CORS foi conferido. Não houve migração ou criação de dados operacionais.

Os 156 arquivos públicos de HTML e assets foram comparados ao build de produção: todos idênticos. O navegador autenticado confirmou busca por número completo e por cliente, seleção do vínculo no projeto local e abertura dos dados da O.S. pelo ID. O vínculo criado exclusivamente para conferência foi limpo ao concluir. A primeira tentativa teve falha transitória de rede; a repetição, após conferir servidor/CORS, completou normalmente. Nenhuma alteração de código foi feita para ocultar a ocorrência.

O fluxo conserva as permissões comerciais e a carteira existentes. Registros sem empresa identificada não recebem empresa presumida. O vínculo existe no projeto/revisão local; não altera a ordem no ERP nem anexa automaticamente a ficha a um registro comercial.

## Verificação

CI oficial: 1.602 regressões, 850 testes de cálculo/ACM e 7 testes de acesso aprovados, sem falhas ou ignorados. Quinze verificadores e build de produção aprovados. Lint sem erros, com aviso anterior em Agenda sobre cleanup de ref. O viewport 3D continua carregado sob demanda, com chunk de 578,16 kB (150,38 kB gzip) e aviso de tamanho.

Consulta em produção conferida em desktop e celular, sem transbordamento horizontal; nenhum erro JavaScript capturado na verificação final. A validação funcional local completa está em [entrega-v2.md](entrega-v2.md).

## Limites preservados

Rascunhos, revisões e arquivos são locais ao navegador; a exportação JSON é a cópia independente do projeto. O endpoint futuro de persistência/IA está em `backend-preparado/`, fora da varredura automática de publicação. Seu SQL e provedor de IA não foram ativados por esta release.

Impressão física, CAD/CAM da oficina, calibração e liberação técnica de fabricação não são comprovadas por esta publicação.
