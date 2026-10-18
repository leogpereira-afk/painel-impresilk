# Letra Caixa · publicação

Autorizada pelo dono em 18/10/2026 após a revisão local v5. Publicado e conferido no endereço oficial em 18/10/2026.

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

- Implementação `acad2c9` e correção de compatibilidade do teste `5831f3b` na main.
- [GitHub Pages 39093440508](https://github.com/leogpereira-afk/painel-impresilk/actions/runs/39093440508): build e deploy concluídos com sucesso.
- CI em Node 20: 1.602 regressões, 1.034 testes de cálculos/ACM/letras/fabricação e 7 de acesso passaram; zero falhas e zero ignorados. Build, lint e verificadores aprovados.
- 169/169 arquivos servidos pelo endereço oficial idênticos ao build local validado, incluindo módulos, Worker e exemplos.
- Chrome autenticado: ferramenta em tela cheia, roteiro de fabricação, detalhes de conformação, largura da borda, referências/emendas e plano de corte por material/processo conferidos. Sem erros JavaScript.
- Download real do SVG de uma chapa fictícia: XML válido, 1220 × 2440 mm, camadas de corte nominal, envelope, referências e anotações separadas. A interface confirmou arquivamento local por revisão e deixou explícito que não anexou à O.S. remota.
- Nenhum dado real ou registro do ERP foi alterado.

O primeiro workflow (39093086555) bloqueou a publicação porque um teste usava `Object.groupBy`, ausente no Node 20. A falha foi reproduzida, o agrupamento foi substituído por `Map` mantendo as mesmas asserções, e 175 testes de letras passaram localmente antes da nova CI completa. Não houve alteração nos cálculos nem redução de testes.

Publicado e conferido. A evolução do ACM em outra frente deve integrar esta main antes da próxima publicação, preservando ambas as ferramentas.
