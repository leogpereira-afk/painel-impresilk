# Persistência, arquivos e limites

## Implementação local

`src/lib/acm/storage.mjs` guarda dados em IndexedDB (`impresilk-acm-studio`, versão 2). Rascunhos e revisões permanecem no object store `owners`, com o envelope versão 1 preservado. A chave é a identidade exata recebida pela interface, sem fallback, conversão de caixa ou seleção da última pessoa. A prévia deve passar uma identidade com prefixo `review:`. Esta separação evita misturar sessões na interface; armazenamento do navegador não substitui autorização de servidor nem criptografia de dados no dispositivo.

As funções são assíncronas:

- `loadDraft(ownerId)` → `null` ou `{project, version, updatedAt}`.
- `saveDraft(ownerId, project, expectedVersion)` → registro salvo. Primeira gravação exige `0`; versões divergentes geram `CONFLICT`. Leitura, comparação e escrita ocorrem na mesma transação IndexedDB, inclusive entre abas.
- `listRevisions(ownerId)` → metadados, da última salva à primeira.
- `saveRevision(ownerId, project)` → `{id, project, revision, createdAt}`. Mesmo número e conteúdo é idempotente; mesmo número com conteúdo diferente gera `CONFLICT`. A UI cria um novo número ao editar uma revisão já salva.
- `restoreRevision(ownerId, id)` → cópia do projeto, sem substituir o rascunho. A UI faz a confirmação e depois usa `saveDraft` com a versão CAS carregada, atribuindo uma nova revisão ao editar.

As revisões são imutáveis. Limite de 50 revisões por identidade e 1 MiB por projeto compacto. Nunca é removida automaticamente uma revisão para abrir espaço. Erros de quota, identidade, schema, corrupção, conflito e indisponibilidade são explícitos. Um registro corrompido/futuro não é regravado. Como não existe um schema ACM anterior registrado, não há conversão presumida; futuras migrações precisam preservar um backup e validar a conversão antes da escrita.

`serializeProjectJSON` exporta `{format:'impresilk-acm-project', formatVersion:1, project}`. `parseProjectJSON` aceita esse envelope e o projeto versão 1 puro, usa o mesmo validador do motor, rejeita chaves perigosas, ciclos, valores não finitos, complexidade excessiva e arquivos acima de 2 MiB. Importação rejeitada não altera o projeto atual. Os helpers não escrevem logs com o conteúdo dos clientes.

### Arquivo local de documentos por revisão

Os stores separados `documents` e `documentOwners` mantêm conteúdo e índice de documentos. A atualização do banco da versão 1 para 2 apenas adiciona esses stores, sem reescrever `owners`. Conexões anteriores recebem `versionchange`; se uma aba impedir a atualização, há um erro explícito e nova tentativa após fechá-la. Abrir a versão 1 depois da atualização é recusado pelo IndexedDB, sem rebaixar ou apagar o banco.

- `saveDocument(ownerId,{projectId,revision,name,mime,content})` → `{id,projectId,revision,name,mime,bytes,sha256,createdAt}`.
- `listDocuments(ownerId,projectId?)` → metadados, últimos arquivados primeiro, sem carregar os conteúdos.
- `getDocument(ownerId,id)` → metadados e `content` original, após conferir tamanho e SHA-256.

`content` é texto para HTML, CSV, SVG, DXF e JSON; para PNG, é o data URL `data:image/png;base64,...` original. Não é interpretado nem executado pelo armazenamento. O hash é calculado antes da transação, sobre os bytes UTF-8 originais. Índice e conteúdo são gravados atomicamente; a inserção usa `add`, sem atualização de documentos existentes. Mesmo projeto, revisão, nome, MIME e conteúdo é idempotente. Mesmo nome na mesma revisão com conteúdo ou formato diferente gera `CONFLICT`; os nomes de SVG/DXF distinguem frente e verso. A interface deve concluir a gravação antes de iniciar o download e salvar o snapshot da revisão correspondente.

Limites por identidade: 20 MiB por documento, 100 MiB no conjunto e 200 documentos. O tamanho de PNG inclui o data URL armazenado. O navegador pode aplicar uma quota menor; o erro preserva arquivos anteriores. Nenhum arquivo é descartado automaticamente. Arquivo ou índice corrompido/futuro bloqueia a operação sem substituição silenciosa.

Este é um arquivo **local neste navegador**, não um arquivo na nuvem. Não acompanha a conta em outro dispositivo, não entra no backup JSON do projeto e pode ser perdido ao limpar os dados do site. O serviço remoto desta entrega não recebe nem armazena esses documentos.

## Documentos

`pieceSVG(piece,{project,back:true})` e `pieceDXF(...)` geram milímetros e geometria 1:1; a impressão HTML é ajustada à página. Os documentos contêm revisão, lado e situação de calibração. Contornos, canais, furos e fixações usam a mesma transformação frente/verso; fixações locais à face recebem o deslocamento de `blank.face` antes do espelhamento. Furos sem diâmetro são pontos/cotas pendentes, nunca círculos com diâmetro presumido.

DXF ASCII AC1015: `$INSUNITS=4`, `$MEASUREMENT=1`; camadas `CUT`, `GROOVE`, `DRILL`, `FOLD`, `DIMENSIONS`, `TEXT`, `FIXING`. GROOVE são eixos; dobra, identificação, cotas e fita são informação. SVG mantém as camadas separadas em grupos. Nenhum arquivo é G-code ou aprovação de máquina. O relatório impresso inclui apresentação, fichas, plano, montagem, materiais, barras e etiquetas, e rejeita peças/plano de revisão incompatível. CSV e relatório usam `estimateCosts`, a mesma fonte de custos da interface: barras inteiras, custos atribuídos a retalhos, preços pendentes e notas permanecem coerentes. CSV neutraliza prefixos de fórmula; HTML/SVG escapam texto e não carregam scripts/fontes remotos.

`projectReportHTML(project,result,nesting,{previewImage:{dataUrl,projectId,revision}})` aceita opcionalmente a captura PNG feita pela interface antes de guardar a mesma revisão. Projeto/revisão divergentes, URL externa, outros formatos, base64 inválido e PNG incompleto são recusados. O limite é 10 MiB do data URL, 12.000 pixels por dimensão e 36 milhões de pixels. A legenda identifica **Vista 3D do estudo**: pode ser a vista montada, explodida ou aberta que estava selecionada. Sem captura, permanecem as vistas planas. Os metadados vinculam a captura à revisão; o gerador não deduz medidas ou conteúdo geométrico dos pixels.

O mapa de montagem inclui projeções por face quando há referencial geométrico no motor. Os segmentos 3D são projetados nos eixos locais da face; fita e parafusos recebem a posição da peça nessa face. Os mapas identificam peças e apoios, com a correspondência entre eles, e mostram os elementos do verso por transparência. Pontos de parafusos são símbolos de posição, sem diâmetro presumido. Não se cria sequência executiva, nem se converte esse mapa em dimensionamento de fixação ou estrutura.

## Servidor preparado e testado localmente

A implementação preparada está em `docs/acm-studio/backend-preparado/painel-acm/index.ts` e `supabase/functions/_shared/acm-handler.mjs`. O entrypoint fica fora de `supabase/functions`, pois a CI publica automaticamente toda pasta dessa árvore que contenha `index.ts`. O modelo compartilhado `_shared/acm-model.mjs` é a mesma fonte usada pelo motor e pelo importador. O schema preparado está em `docs/acm-studio/schema.sql`, ainda não aplicado no Supabase. A separação do store/overlay global preserva dono e revisões imutáveis. Consulte [backend-preparado/README.md](backend-preparado/README.md) antes de promover o entrypoint.

Todas as ações exigem JWT válido com expiração, `crachaRevogado(..., true)` (falha fechada), identidade ativa, ausência de senha provisória e permissão atual `ferramenta-ia` ou master. Logins alternativos de `acesso_papel` são resolvidos para a conta canônica antes de conferir atividade e senha provisória; identidades ambíguas, papel inativo ou erro de consulta são recusados. Para não-master, as permissões são recarregadas de `painel_contas` em cada pedido, recusando erro ou conta ausente: retirar o módulo fecha a porta mesmo se o JWT antigo ainda estiver válido. A senha inicial do master também é recusada. O dono vem exclusivamente de `session.sub`; o corpo não pode fornecer `ownerId` ou `dono`. Nenhum `x-token` alternativo abre a porta. Corpo acima de 1,1 MB é interrompido antes de completar o parse. Respostas têm `Cache-Control: no-store` e não registram dados de clientes em logs.

Contrato POST, sempre com `action`:

| Ação | Entrada adicional | Saída principal |
|---|---|---|
| capabilities | — | persistence, assistant, limits; verifica que a tabela existe |
| list | — | projects com id, name, revision, version, updatedAt |
| get | id | project, version, updatedAt |
| save | project, expectedVersion | project, version, updatedAt |
| revisions | id | revisões com id, revision, name, createdAt |
| getRevision | id, revisionId | project e snapshot |
| saveRevision | project, expectedVersion | project, version, updatedAt, snapshot |
| assistant | prompt, project | proposal e usage; nunca grava o projeto |

Sucesso tem `ok:true`; falha tem `{ok:false,code,error}` e status 400/401/403/404/409/413/429/502/503. O `getRevision` recupera somente a revisão cujo dono e projeto coincidem. A UI deve atribuir uma nova revisão antes de editar um snapshot antigo.

`painel_acm_salvar` serializa por dono com advisory lock de transação, confere CAS, grava rascunho, snapshot opcional e evento na mesma transação. `saveRevision` incrementa `version`; `revision` é a revisão do projeto, distinta da versão de concorrência. Repetir um snapshot idêntico não duplica a revisão; conteúdo diferente com o mesmo número retorna 409. O histórico tem limite explícito de 100 revisões por projeto e 100 projetos por dono. Nenhuma exclusão é implementada. As tabelas têm RLS, nenhuma política anônima/autenticada, privilégios diretos revogados e acesso apenas pela service role interna. As funções são SECURITY INVOKER com search_path fixo e execução revogada para PUBLIC/anon/authenticated. Revisões e eventos não têm UPDATE/DELETE para service_role.

## Assistente real, ativação explícita

O código usa a Responses API da OpenAI com Structured Outputs, `store:false` e `max_output_tokens`. Não existe modelo padrão nem chamada automática. Para habilitar, todos estes secrets devem ser definidos explicitamente:

- OPENAI_API_KEY e ACM_AI_MODEL;
- ACM_AI_ENABLED=true;
- ACM_AI_MAX_OUTPUT_TOKENS (256 a 2.000);
- ACM_AI_INPUT_USD_PER_MILLION e ACM_AI_OUTPUT_USD_PER_MILLION, conforme tabela vigente do modelo;
- ACM_AI_MAX_COST_USD (maior que zero, no máximo US$ 0,25 por pedido);
- ACM_AI_DAILY_USD (maior que zero, no máximo US$ 5 por pessoa em 24 horas).

Sem configuração completa, capabilities anuncia indisponível. O prompt tem limite de 8 KB; o contexto enviado contém somente campos editáveis, excluindo nome do projeto, clientes e histórico. O usuário pode incluir dados na descrição: a interface informa o envio ao provedor antes do botão de análise. O provedor tem 20 segundos. Antes da chamada, PostgreSQL reserva o custo estimado de forma atômica e aplica 3 chamadas/minuto e 20/24 horas por pessoa. A reserva conservadora usa bytes UTF-8, folga de enquadramento e teto de saída. As tarifas são valores informados pelo operador, não uma confirmação de faturamento. Reservas de chamadas com falha permanecem no orçamento para evitar repetição excessiva; tokens e custo estimado de respostas concluídas ficam registrados sem prompt/conteúdo.

A saída é limitada à whitelist `AI_PATHS`; o servidor revalida o projeto resultante antes de retornar. É proibido propor `fixing.validated`, calibração, permissões, credenciais ou caminhos arbitrários. A proposta não modifica dados até o usuário aplicar. Testes usam provedor falso e nenhuma chave real; disponibilidade e formato do modelo escolhido ainda exigem uma chamada controlada após configuração autorizada.

## Publicação futura

Esta etapa é separada da publicação da interface local e da busca de O.S. via `painel-comercial`, que não dependem das tabelas ACM. Copiar o entrypoint preparado para `supabase/functions/painel-acm/index.ts` somente após schema, permissões, configuração e provedor previstos para a ativação terem sido validados. Enquanto isso, ele permanece fora da varredura automática. Na cópia, atualizar os dois imports locais para `../_shared/cripto.ts` e `../_shared/acm-handler.mjs`, preservando os módulos compartilhados e repetindo as verificações de autorização e bundle. A IA deve permanecer indisponível se não houver provedor validado e configuração explícita completa.

O repositório não tem `supabase/config.toml`: o publicador existente `scripts/publicar-functions.sh` já envia `verify_jwt:false` na metadata, porque a função verifica o JWT próprio do Painel. Caso a implantação futura use CLI, definir explicitamente:

```toml
[functions.painel-acm]
verify_jwt = false
```

Isso não elimina autenticação: a validação obrigatória está no endpoint. Não publicar a interface apontando para a nova porta antes de preparar schema e função. O CLI não está instalado no ambiente desta entrega; por isso o SQL permanece preparado, sem nome de migration inventado. Gerar a migration com o comando oficial quando houver CLI, conferir advisors/políticas e executar as verificações de produção apenas após autorização. Não houve deploy, aplicação remota de SQL ou configuração de chave.

## Evidências e limites

Testes Node cobrem importação, corrupção, quota, snapshots, concorrência e isolamento; documentos incluem conteúdo UTF-8 exato, PNG, SHA-256, conflitos, limites de 20/100 MiB e 200 arquivos. Testes PGlite exercitam o SQL real em memória, CAS simultâneo, rollback, permissões dos papéis e reserva de orçamento. IndexedDB real foi conferido em navegador isolado com nove verificações de rascunhos e outras 14 de documentos/migração. O teste reproduzível `tests/acm-storage-browser.html`, servido pelo Vite, cria bancos exclusivos com dados fictícios e verifica migração da versão 1, preservação do envelope, bloqueio/retentativa, downgrade, concorrência e integridade. O wrapper Deno teve sintaxe/bundle e regras conferidos localmente; autenticação integrada e o endpoint remoto permanecem não publicados.

A documentação de fabricação representa um estudo paramétrico: sem calibração compatível, saídas têm RASCUNHO. Encapamento é identificado como ESTUDO NOMINAL DE ENCAPAMENTO. Estrutura, adesivos, ancoragens, raio/transição física de dobra e ajustes de máquina precisam de confirmação técnica e corpo de prova. DXF contém geometria e operações separadas, sem pós-processador CNC.

Referências consultadas: [RLS e privilégios](https://supabase.com/docs/guides/database/postgres/row-level-security), [funções PostgreSQL](https://supabase.com/docs/guides/database/functions), [changelog de Edge Functions](https://supabase.com/changelog?tags=edge+functions) e [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses). O changelog recente de TLS 1.2 não altera esta implementação com fetch atual; a retirada futura de exposição automática é atendida pelos grants explícitos somente à service role.
