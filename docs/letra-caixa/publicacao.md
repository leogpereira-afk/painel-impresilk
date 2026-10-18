# Letra Caixa · publicação

Autorizada pelo dono em 18/10/2026 após a revisão local v5. Estado deste registro: verificações concluídas, publicação em preparação.

Destino: https://leogpereira-afk.github.io/painel-impresilk/ferramenta-ia?ferramenta=letra-caixa

## Escopo integrado

Nova ferramenta ao lado do ACM Studio, com texto/importação SVG-DXF, materiais, fabricação, bordas, emendas, pintura, LEDs/fontes/cabos, aproveitamento, custos informados, instalação e documentos por revisão. Dados iniciais são de estudo. Armazenamento permanece no navegador, separado por usuário e produto; JSON é a cópia externa do projeto.

Base de integração: `3cd2ad4`. Foram preservados os motores, viewport e armazenamento ACM da main publicada. O formulário de instalação ganhou somente textos adequados ao produto que o utiliza. Dependências npm não mudaram. O serviço já publicado de consulta de O.S. é reutilizado, sem nova função, migração, permissão ou alteração de ordens.

## Verificações antes da publicação

- 1.600 regressões passaram no ambiente restrito. Dois testes de servidor simulado foram recusados por falta de permissão de abrir porta local; o arquivo completo passou na repetição autorizada: 7/7. Nenhum teste restante ignorado.
- 1.041 testes de cálculos, ACM, letras, fabricação e acesso passaram.
- Build de produção com `BASE_PATH=/painel-impresilk/` concluído; 15 verificadores aprovados.
- Lint sem erros; aviso anterior em Agenda sobre ref no cleanup.
- Revisão independente de integração, imports e dependências. Referências da prévia v5: [entrega-v5.md](entrega-v5.md).

O estudo conserva encaixe por envelopes retangulares, aproximação de curvas, ausência de pós-processador CNC validado e conferência técnica dos parâmetros. Não ativa provedor remoto de IA, persistência em nuvem ou liberação automática para fabricação.

## Conferência em produção

Será registrada após a conclusão do workflow e comparação do conteúdo servido.
