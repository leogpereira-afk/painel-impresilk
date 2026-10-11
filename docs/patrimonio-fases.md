# Patrimônio: evolução por fases

Estado: implementação local, sem publicação. Não há migração de dados executada.

## Fontes e contrato

- Inventário: `painel-config`, chave/coleção `patrimonio` em `painel_registros`.
- Equipamentos: `painel-ativos`, coleção `ativo`; itens existentes preservam sua identidade e `bemId`.
- Lançamentos: `painel-config`, chave `manutencoes`, ligados por `ativoId`.
- Pessoas: `pessoasPatrimonio`, IDs oficiais do RH.
- Fotos: `painel-fotos`, objetos privados. Nesta etapa o acervo do inventário requer `inventario-valores`; não tratar anexo livre como foto operacional sem classificação.
- Concessões: `src/lib/modulos.js`, `painel-auth` e **equipe-auth no vida-leo**, acionada pelo `painel-acesso`. As três listas precisam ser publicadas em conjunto, servidor antes das telas. Nenhuma concessão automática por cargo.

## Entrega local das fases 1 a 3

- Navegação única de Patrimônio, rota canônica de manutenção e compatibilidade com links antigos.
- Chips ordenados, primeiro permitido selecionado por padrão, Pendências dentro do Inventário.
- Permissões `inventario-valores` e `seguranca`; projeção fechada de inventário para uso operacional, sem aquisição, NF, documentos ou campos futuros.
- Escrita de inventário e anexos exige permissão específica, inclusive pela porta de equipamentos. Edição operacional conserva os dados restritos e o vínculo existente.
- Segurança exige permissão adicional nos equipamentos e no histórico de manutenção, incluindo acessos por ID e lixeira.
- Famílias `informatica` e `seguranca` no cadastro e nos totais de Manutenções.
- Navegação inicial preparada; os cadastros detalhados foram concluídos nas fases 5 e 6, descritas abaixo.
- `previaMigracaoPatrimonio`: ação exclusiva da direção, somente leitura, sem ação de aplicação disponível.

## Aprovação da reclassificação

A prévia deriva somente de categorias exatas de itens `predial`. Nunca procura nome, modelo ou localização parecida.

| Categoria atual | Família futura |
|---|---|
| Câmeras / CFTV | seguranca |
| Alarme | seguranca |
| Portão / automatizador | seguranca |
| Portão | seguranca |
| Rede e internet | informatica |

Combate a incêndio continua `predial`. A prévia inclui ID, versão, categoria e bemId. Dados reais e sua lista de aprovação devem permanecer fora deste repositório público.

Antes da fase 4: repetir a prévia para detectar novos itens. Aplicar apenas a lista aprovada, com comparação de versão, transação única, cópia de recuperação privada e marca idempotente. Alterar somente família/classificação; IDs, vínculos, fotos e histórico ficam intactos. Se a prévia mudar, não ampliar o conjunto aprovado silenciosamente. A edição normal não pode mudar o tipo.

## Limite entre revisão local e publicação

As fases 1 a 6 estão implementadas na revisão local. A fase 7 verifica testes, respostas dos handlers e telas com dados fictícios. A verificação no servidor publicado com uma conta restrita depende de publicação autorizada; não foi feita nem é substituída pela simulação. Nenhuma liberação por pessoa foi alterada.

## Verificação

`tests/patrimonio-permissoes.test.mjs` executa handlers reais com Request/Response e transporte/auth sintéticos: testa remoção dos dados sensíveis, recusa de escrita/anexos, preservação de vínculo, isolamento de Segurança e prévia sem escrita. Não equivale a teste em produção.

Complementos: testes existentes de patrimônio, cálculos e acesso; verificadores de portas e papel; build/lint; navegador local em desktop e celular. O teste PostgreSQL condicionado a PGlite deve ser executado antes de qualquer futura migração.

## Fase 4, revisão local

- Prévia de reclassificação repetida após autorização, sem candidatos. Nenhuma transformação de registros foi executada. Reavaliar a lista por ID caso surjam registros antes da publicação.
- Estrutura: grupos hidráulica/elétrica, histórico por ativoId, gastos mensais/anuais com permissão Manutenções e lançamento contextual. Sugestões retiram segurança/rede sem esconder cadastros legados.
- Ramais: setor por ID, local, pessoa do RH, telefone e aparelho escolhido por ID. Troca acrescenta histórico com autor/hora do servidor. Central telefônica é um ativo próprio. Catálogo de aparelhos reutiliza Informática e telefonia, com vínculo opcional ao inventário.
- Cadastro, edição, retirada do ramal e PDF mantidos. Retirar ramal não retira aparelho nem manutenções. Campos vazios são pendências.
- SQL local novo: exclusividade de aparelho por ramal, integridade de setor/aparelho, vínculo direto de inventário protegido dentro da transação. Atualização do RPC de equipamentos aceita famílias novas e conserva o ID explícito do bem. Nenhum destes scripts foi aplicado em produção.
- Ordem de futura publicação: migrações SQL, equipe-auth e demais Edge Functions, depois frontend. Revalidar prévia, integridade e permissões antes da liberação. Uma implantação exige autorização específica.
- Verificação: 662 testes aprovados com PGlite, build, lint sem erros (dois avisos anteriores), verificadores de portas/papel e fluxo local em desktop/celular. Testes de duplicidade no PostgreSQL são sequenciais; não simulam duas sessões concorrentes. Revisão independente aprovou as correções dos dois riscos no vínculo opcional.


## Fases 5 e 6, revisão local

- Telefonia reúne Ramais e Celulares; URLs anteriores continuam válidas. Linha celular separada do aparelho, com operadora, pessoa do RH, vínculo por ID e histórico de trocas produzido pelo servidor.
- Computadores, notebooks e rede reutilizam fichas físicas e o ledger de manutenção. Totais desde a compra quando a data é conhecida, últimos 12 meses, última manutenção e resumo por tipo/setor; dados incompletos aparecem como pendência. Custo de aquisição e custo total exigem Inventário e valores; manutenção exige Manutenções. O limiar de alerta é configurável, sem percentual presumido.
- Segurança inclui câmeras, DVR/NVR, alarmes, chaves, controles/tags de portões, acessos faciais e relógio de ponto. O ponto continua no RH; aqui é apenas o aparelho. Checklist de todas as câmeras ativas com autoria e data do servidor, registros imutáveis e manutenção contextual. Canais ocupados são calculados por IDs. Fotos de enquadramento têm escopo operacional separado do inventário; não cadastrar rostos, biometria ou senhas.
- Busca por pessoa inclui pessoas desligadas para recolher itens e bloquear acessos. Entrega/liberação preserva a identidade original; devolução/bloqueio fecha o registro.
- Prevenção contra incêndio reúne Extintores, AVCB, Luminárias de emergência e Placas de segurança. Numeração manual, setor/local, validade ou próximo teste/conferência, manutenção no mesmo ledger e documento privado para Extintor/AVCB. Não preenche quantidade nem prazo regulamentar por suposição.
- O calendário consulta diretamente as datas por ativoId; não duplica eventos persistidos. Mudar a data na ficha altera o próximo evento. A resposta é fechada, sem valores, documentos ou dados pessoais do RH.
- Fotos e documentos privados precisam de verificação no servidor publicado. Os índices e triggers novos ainda não foram aplicados no banco remoto. Antes de aplicar, conferir duplicidades existentes sem apagar ou resolver registros automaticamente.

## Verificação integrada antes da revisão final

- Suite local: 686/686 testes passaram, 0 falhas e 0 ignorados, com PGlite. São handlers reais com transporte/auth sintéticos e PostgreSQL local; não é verificação de produção.
- Build passou. Lint sem erros, com dois avisos anteriores de cleanup de ref em Agenda e CalendarioEmpresa. Verificadores: 118 ações com login, 89 escritas com papel, fotos e 21 módulos nas três listas passaram usando o clone vida-leo autorizado.
- Navegador local: troca celular/RH, edição de computador, checklist explícito de câmera, DVR por IDs, busca de desligado, datas de prevenção no calendário e fluxo em celular de 390 px. Sem erro de página ou rolagem lateral global.
- A revisão independente posterior identificou cinco riscos e uma regressão residual; todos foram corrigidos e a verificação final abaixo substitui o estado intermediário.


## Decisões adotadas nesta execução

| Decisão | Motivo e limite | Se precisar mudar |
|---|---|---|
| Concluir as fases locais 5–7, preservando publicação separada | Pedido de fazer todos; protocolo exige autorização específica para publicação | Publicar após autorização e validação remota |
| Reunir Ramais e Celulares em Telefonia | Pedido do dono; manter URLs anteriores | Pode separar os chips sem mudar os dados |
| Não reclassificar registros quando a prévia está vazia | Aprovação anterior não autoriza inventar candidatos por nome | Nova lista por ID deve ser revisada antes de aplicar |
| Recusar troca que conflita com origem inversa do inventário | Preserva uma única associação, inclusive dados legados | Reconciliação futura deve ser explícita e guardar histórico |
| Acrescentar Prevenção contra incêndio com os quatro grupos | Pedidos de Extintores, AVCB, luminárias e placas | A localização do chip pode ser reorganizada sem duplicar manutenção |
| Datas de luzes e placas representam conferências informadas | Não presumir prazo técnico ou regulatório | A empresa informa as próximas datas do seu plano de inspeção |
| Usar calendário calculado a partir da ficha por ID | Evita eventos antigos depois de uma mudança de prazo | Uma futura agenda externa precisará de sincronização e remoção por ID |
| Manter um documento privado por ficha de Extintor/AVCB nesta versão | Impede substituir o único documento sem preservar o anterior | Renovação documental com múltiplas versões fica para fluxo explícito |

Nenhuma decisão concede acesso, muda dados reais ou pressupõe publicação.


## Verificação final da revisão local

- **698/698 testes aprovados**, sem falhas ou ignorados, em 11/10/2026. Comando com PGlite inclui todos os testes patrimônio, vínculos de Ramais, ativos/Marketing, cálculos e estado de acesso. Handlers usam autenticação/transporte sintéticos; o banco testado é PostgreSQL local.
- Build Vite aprovado. Lint sem erros; dois avisos anteriores de cleanup de ref permanecem em Agenda e CalendarioEmpresa. Conferências de portas, papel, fotos e três listas de permissões passaram.
- Fluxos de navegador geral e perfis restritos passaram. Telefonia, Computadores, Segurança e Prevenção conferidos em 390 px; busca de prevenção ocupa linha inteira, cards compactos e recolhíveis, sem rolagem lateral global ou erros JavaScript.
- Revisão independente de escopo e qualidade aprovada após correções: restauração atômica com rollback, pacote SQL ordenado com versões únicas, vínculo inverso protegido, textos preservados e integridade de setores/gravadores. Legados com bemId ausente, vazio ou null voltam da lixeira sem modificar o JSON original.
- Seis migrações deste pacote usam timestamps de 14 dígitos: 20261011120000 a 20261011120500. Não foram executadas remotamente.
- Trabalho mantido no ramo local codex/patrimonio-manutencoes-unificado. Nenhum commit, merge, publicação, alteração de dados reais ou concessão de acesso foi executado nesta entrega.
- Resta publicar após autorização específica, conferir as funções antes de liberar o frontend e validar uma resposta autenticada com usuário restrito no servidor publicado. Testes locais não substituem essas etapas. Concorrência real entre sessões não foi ensaiada.

Decisão adicional: a restauração de um legado válido precisa conservar tanto campos ausentes quanto vazios ou null. A exceção do banco exige a ficha original idêntica ainda na lixeira, uma origem por ID e bem desocupado; novas inserções divergentes e alterações conflitantes permanecem recusadas. O fechamento deste caso exigiu cobertura adicional específica para preservar registros, sem ampliar escopo ou publicar.

## Expansão de organização · 11/10/2026

Pedido atual do dono: manter o padrão existente e agrupar a infraestrutura em Estrutura, com a telefonia centralizada por pessoa e plano.

- **Estrutura / Internet:** operadora, plano, velocidades contratadas, vigência, endereço, contato técnico por UUID e valor mensal protegido. Contrato privado anexado ao próprio cadastro, sem arquivo público.
- **Estrutura / Computadores e servidores:** as fichas e os gastos de manutenção anteriores permanecem; acrescentados Servidor, informações de rede/IP, rotina de backup sem credenciais e contato técnico. A URL antiga da aba Computadores continua sendo aceita.
- **Estrutura / Parte elétrica:** padrões de energia (UC, endereço, tensão e potência), transformadores (identificação e kVA) e usinas fotovoltaicas (potência instalada, placas e inversores). A usina escolhe as unidades consumidoras por ID do padrão cadastrado. Elétrica e Iluminação antigas continuam acessíveis dentro da área.
- **Outros itens e hidráulica:** preserva as fichas anteriores que não pertencem às três novas divisões; nenhuma reclassificação automática de registros.
- **Celulares e Ramais:** relação única por ID do colaborador do RH, permitindo diversos números, ramais e linhas disponíveis. Nomes iguais não unem pessoas. Plano corporativo único com quantidade contratada, franquia, vigência, contato comercial e contrato. Vínculo de linha aponta para o UUID do plano; preço e arquivo não são copiados para cada linha.
- **Contatos:** diretório canônico de técnicos e responsáveis externos por UUID, com nome, telefone, WhatsApp, e-mail e endereço. Empregados continuam ligados exclusivamente pelo ID oficial do RH.
- **Permissões:** informações operacionais exigem Patrimônio; valor mensal e contrato exigem Inventário e valores. A resposta sem essa permissão elimina esses campos no servidor.
- **Preservação:** aparelhos, inventário, documentos e históricos de troca/manutenção anteriores não foram substituídos. Linhas antigas sem plano aparecem como pendência; uma ação explícita pode vincular as restantes com versão de edição e informação de erro parcial.
- **Banco:** preparada a migração 20261011120600_infra_referencias.sql, sem aplicação remota, para unicidade e referências. Nenhuma linha, contato ou equipamento real foi criado por esta execução.

### Verificação final da expansão

- **711/711 testes aprovados**, sem falhas ou ignorados, com PGlite em 11/10/2026. A suíte cobre os handlers reais com autenticação/transporte sintéticos, os cálculos e as sete migrações no PostgreSQL local.
- **Build Vite OK**. Lint sem erros; permanecem apenas os dois avisos anteriores de cleanup de ref em Agenda e CalendarioEmpresa. Conferências: 122 ações com login, 91 escritas com papel, fotos e 21 módulos nas três listas aprovados.
- Navegador local: edição de Internet com preço decimal, usina vinculada ao padrão por ID, servidor/backup, pessoa com celular e ramal, linha disponível atribuída sem aparelho, plano único, contrato privado e edição posterior ao anexo. Os fluxos anteriores de Segurança, Prevenção, manutenção, histórico e calendário continuam aprovados.
- Perfis restritos simulados conferidos. Respostas dos handlers sem Inventário e valores não enviam preço ou contrato. Telas e formulários de Internet, usina, servidor e plano corporativo em 390 px sem excesso lateral ou erro JavaScript.
- Revisão independente aprovada após corrigir dois P2: linha ativa sem aparelho e preservação de referências antigas intactas. Referências novas inválidas continuam recusadas. Mesmos IDs de unidades consumidoras em outra ordem conservam a sequência anterior; alterações com duplicatas são recusadas. Falhas na consulta de contatos aparecem como indisponibilidade, preservando o vínculo.
- As sete migrações 20261011120000 a 20261011120600 estão preparadas e **não foram aplicadas remotamente**. Os arquivos e históricos reais não foram alterados. Sem commit, merge, publicação ou liberação de acesso nesta expansão.
- Próximo passo externo: publicação com autorização específica, servidor antes da tela e validação autenticada com pessoa restrita no servidor publicado. Concorrência real entre sessões não foi ensaiada; os testes locais não comprovam implantação.
