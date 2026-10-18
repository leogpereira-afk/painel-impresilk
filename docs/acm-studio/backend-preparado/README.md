# Endpoint ACM preparado, sem publicação automática

`painel-acm/index.ts` contém a implementação preparada para persistência de projetos e assistente remoto. Ele fica nesta pasta para não entrar na varredura de `scripts/publicar-functions.sh`, executada pela CI. Não existe entrypoint ACM na pasta publicada `supabase/functions`.

Os módulos compartilhados continuam em `supabase/functions/_shared`. Seus imports relativos resolvem a partir desta pasta e são conferidos pelo teste de bundle. O compartilhamento desses módulos com outros pacotes não cria nem publica uma função `painel-acm`.

A interface local e a consulta de O.S. existentes não dependem deste endpoint. A consulta usa `painel-comercial` e as tabelas comerciais já existentes. Não aplicar `../schema.sql` para habilitar a busca de O.S.

Para a futura ativação autorizada de persistência/IA:

1. Validar o schema, RLS, privilégios, identidade, concorrência, recuperação e configuração do ambiente. Validar o provedor antes de habilitar a IA; sem essa validação e seus limites explícitos, o assistente permanece indisponível.
2. Somente depois dessa preparação, copiar o entrypoint para `supabase/functions/painel-acm/index.ts` e trocar os dois imports locais pelos caminhos `../_shared/cripto.ts` e `../_shared/acm-handler.mjs`.
3. Atualizar o teste de separação da release junto da ativação deliberada, repetindo o bundle e os testes de autorização e persistência. A descoberta automática não deve ser liberada como efeito lateral de outra publicação.
4. Publicar e conferir o servidor antes de habilitar os recursos dependentes na interface, incluindo versão/arquivos e consultas autenticadas. Usar `verify_jwt:false` apenas porque o próprio endpoint valida obrigatoriamente o JWT do Painel.

Mover o código para esta pasta não aplicou SQL, configurou secrets, acionou provedor nem publicou funções. O procedimento completo está em [persistencia.md](../persistencia.md).
