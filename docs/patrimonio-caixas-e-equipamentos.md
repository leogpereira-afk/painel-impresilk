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
