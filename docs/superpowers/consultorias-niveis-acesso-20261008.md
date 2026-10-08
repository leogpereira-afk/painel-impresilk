# Níveis de acesso da consultoria

Implementação de 08/10/2026. Escopo restrito à consultoria do convite.

## Níveis
- Gestão interna: escolhe quem será administrador externo, mantém vínculos do RH, avalia qualidade e valida conclusão.
- Administrador da consultoria: cadastra/edita os consultores dessa ficha; organiza título, objetivo, especialidade, plano e prazo; registra etapas, ações e arquivos; emite acessos de colaborador ou somente leitura e revoga os que emitiu.
- Colaborador: registra ações, planeja/atualiza etapas e anexa materiais. Não administra pessoas, acessos, ficha do trabalho, RH ou avaliações.
- Somente leitura: consulta somente conteúdo liberado e baixa materiais compartilhados, sem mutações.

## Operação
1. Impresilk abre Consultores e acesso, cadastra o responsável externo e gera convite de Administrador da consultoria.
2. O administrador abre o link, usa Trabalho para descrever as entregas e Etapas para distribuir o plano no tempo.
3. Em Consultores e acesso, cadastra sua equipe e escolhe Colaborador ou Somente leitura para cada convite.
4. A equipe interna continua selecionada pelo RH, separada do cadastro de consultores.
5. A alteração do nível de uma pessoa é feita revogando o convite anterior e emitindo outro. Convites antigos sem nível permanecem como colaboradores, sem promoção automática.

## Limites de delegação
- Administrador externo não cria outro administrador, não consulta o diretório do RH nem altera aprovação/nota.
- Convites delegados guardam o ID do convite do administrador e expiram no máximo junto com ele.
- Expiração/revogação do administrador bloqueia seus convidados. Revogação grava também nos convites filhos.
- Conteúdo privado e anexos internos continuam protegidos. O administrador recebe o cadastro de consultores e seus contatos profissionais apenas desta consultoria.
- Nível vindo do corpo da requisição não substitui o nível do convite autenticado. Níveis desconhecidos negam acesso.
- Todas as escritas mantêm a versão e o controle de concorrência.
- Nenhum convite real é criado automaticamente na publicação.

## Verificação local
- 841 testes: 830 aprovados, 11 ignorados pela configuração existente, zero falhas.
- Novos testes do servidor cobrem administrador, colaborador, leitura, tentativas de elevar privilégio, alterações de campos internos, expiração do emissor e revogação em cascata.
- 15 verificadores aprovados; build de produção e lint sem erros (dois avisos antigos de hooks fora do escopo).
- Chrome com dados fictícios: administrador cadastrou consultora, emitiu convite de leitura, salvou plano e revogou o convite. Leitor sem botões para cadastrar/editar etapa ou enviar arquivo.
- Publicação seletiva somente de painel-processos, seguida do frontend; não usar o workflow genérico de functions, que republica também PCP.

## Publicação pendente
- Commit local 3297462. A revisão automática rejeitou o push para main por exigir aprovação explícita para publicar a nova versão de níveis de acesso.
- painel-processos v4 havia sido publicado seletivamente antes do bloqueio. Foi restaurado imediatamente para v5 com conteúdo idêntico à v3 anterior, confirmado pela leitura dos quatro arquivos.
- Nenhum convite/pessoa/ficha real foi criado; frontend permanece na versão anterior. A implementação local está preservada e verificada, aguardando autorização explícita para publicar.
