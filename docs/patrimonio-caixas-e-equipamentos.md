# Caixas de ferramentas e equipamentos compartilhados

## Caixas

O cadastro numerado existente continua em `patrimonio_controles`, com tipo `ferramentas`. Cada caixa recebe acervo, movimentos de entrega/devolução e avaliações. A operação atualiza somente essa caixa, com comparação da versão lida e gravação atômica pelo RPC já existente.

- Quantidade total é o acervo cadastrado. Na caixa = total menos itens entregues ainda não devolvidos.
- A entrega registra item, quantidade, pessoa, data, estado e observação. A devolução não pode ultrapassar o saldo da mesma pessoa.
- A conferência mensal registra a quantidade fisicamente encontrada na caixa, comparada ao saldo esperado. Não reduz o acervo automaticamente: diferenças continuam visíveis para conferência.
- Todos os itens ativos devem ser avaliados. A próxima data é sugerida para o mês seguinte e pode ser ajustada.
- Histórico mantém nome do item e saldo esperado no momento da avaliação. Data, autor e identidade da gravação são controlados pelo servidor.
- Arquivar um item preserva entregas e avaliações; não é permitido enquanto houver quantidade em uso.
- Edição do número ou responsável da caixa preserva todo o histórico. Campos de histórico enviados diretamente pelo cliente são ignorados.

Não há disparo automático de mensagens: a última avaliação, a próxima data e as pendências ficam no controle da caixa. Relatórios permitem imprimir ou salvar PDF.

## Carros e máquinas

As novas abas consultam os mesmos registros da coleção `ativo` usados em Manutenção. Nenhum equipamento é copiado ou criado automaticamente por abrir Patrimônio.

`painel-ativos` oferece `listarPatrimonio`, uma projeção restrita para usuários com acesso a Patrimônio. Não concede as outras operações da função nem retorna arquivos, documentos ou dados financeiros. O acesso normal de Documentos e Manutenção permanece independente.

Vínculos com o inventário são reconhecidos por IDs registrados (`origemAtivoId` ou `bemId` explícito e compatível), nunca por nome semelhante. Links de manutenção abrem o mesmo cadastro e histórico pelo ID. A edição permanece em Manutenção para quem já tem acesso ao módulo.

## Conferência

Testes abrangem saldo, devolução por pessoa, histórico, conferência completa, datas, autoria, conflito de gravação e limites, além da autorização e projeção restrita dos equipamentos. A prévia local usa exemplos fictícios e bloqueia gravações no servidor.

## Área do bem sem ficha técnica

O campo opcional `patrimonio.areaPatrimonio` aceita `maquinas`, `carros`, `estrutura`, `outros` (Ferramentas & Outros) ou vazio (somente inventário). É uma classificação do próprio bem, independente de `setorSigla`. A gravação usa o mesmo ID, não cria `ativo`, não muda etiqueta nem vínculos ou históricos. O servidor recusa áreas inválidas antes de gravar o lote.

Nas abas, quem tem Inventário e valores vê a lista de bens ativos classificados e sem ficha ligada. Bens com ficha, vínculo oculto/conflitante ou sem conferência de vínculos não são duplicados nessa lista. Fichas existentes continuam nas listas técnicas e seus históricos de manutenção mantêm o ID original. Baixados continuam no inventário. Em Máquinas e Carros, os bens sem ficha e os equipamentos com ficha usam a mesma tabela, busca e paginação. A ficha real substitui a linha simples do bem, sem duplicar a etiqueta. Em Estrutura e Ferramentas & Outros, a lista de bens permanece própria.

Salvar área na janela do bem confirma o retorno do servidor antes de atualizar a lista local. A escolha também está no formulário de criação/edição do bem. Nenhuma migração ou reclassificação automática de registros existentes. Servidor deve ser publicado antes da tela.

## Cadastro e vínculo pelo bem

- Buscar ficha procura por palavras de nome, modelo, série e placa, sem exigir acentos. Começa em Todos os tipos permitidos. Fichas ocupadas e baixadas aparecem desabilitadas com o motivo; a operação continua exclusiva, uma ficha por bem.
- Falha ao ler vínculos permanece um erro com Tentar novamente, nunca uma lista vazia tratada como livre. A atualização após conflito elimina a seleção antiga.
- Em Máquinas/Carros, Completar dados técnicos abre o formulário no próprio bem, com nome e setor aproveitados, tipo e etiqueta fixos. Só ao salvar cria o registro técnico e o liga atomicamente pelo fluxo existente. O bem original e seus dados de aquisição não são substituídos. As demais famílias oferecem acesso ao cadastro na aba correspondente.
- A criação técnica pelo diálogo renova também a tabela aberta atrás. As gravações feitas pela própria aba preservam seus avisos e fluxo de edição.
- Pendências destaca a última linha aberta e os campos incompletos de setor, responsável, valor e nota/justificativa. A ficha mostra o conjunto das pendências, incluindo foto e vínculo quando aplicável.

### Verificação local desta revisão — 14/10/2026

2.056 testes executados: 2.054 passaram na execução geral; dois testes de publicação simulada foram bloqueados pelo sandbox ao abrir porta local. O arquivo de sete testes foi repetido fora do sandbox e passou integralmente. Build e lint sem erros (um aviso anterior em Agenda). Conferências de portas, papel, imports, acessos, fotos e classes aprovadas. Conferência de sistemas aprovada usando o equipe-auth da main pública atual; a cópia local antiga estava defasada.

Simulação de navegador com dados fictícios: área salva em Ferramentas & Outros; busca de ficha por placa e nome sem acentos; vínculo existente confirmado; criação técnica de máquina/carro preserva etiqueta e atualiza a lista sem duplicar o bem; campos pendentes amarelos; formulário a 390 px sem rolagem horizontal. Não houve alteração de dados de produção. Publicação autorizada por Léo em 14/10/2026; servidor publicado e conferido antes da tela.
