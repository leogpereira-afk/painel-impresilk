# Planejamento anual: operação e publicação

Estado desta entrega: implementação e prévia local. Este documento não comprova publicação nem autoriza alterações no banco da empresa. A prévia usa dados fictícios e IndexedDB separado; não importa automaticamente a planilha real.

## Armazenamento e acesso

- Ações: coleção `planejamento_anual` de `painel_registros`. Cada ação tem versão e histórico; a gravação compara o registro anterior para não sobrescrever outra edição.
- Importações: coleção `planejamento_importacoes`, com identificador do lote, hash do pedido e resultado confirmado. Repetir o mesmo pedido e lote não cria novas ações; reutilizar um lote com outro conteúdo é recusado.
- Arquivos: bucket privado existente `painel-arquivos`, prefixo `planejamento/<id da ação>/`. O servidor entrega URLs assinadas por cinco minutos. Substituir ou remover um anexo mantém o arquivo e seus metadados anteriores para consulta do histórico.
- Os registros usam o backup genérico já existente de `painel_registros`. O backup de registros preserva referências e metadados; a cópia dos bytes do Storage deve seguir o procedimento de backup dos anexos do Painel. Não apagar objetos antigos como parte desta implantação.
- Gestão: somente master cria/importa ações e define responsáveis, datas e valores. Responsável pela ação atualiza seu andamento; responsável por uma etapa atualiza somente o andamento dessa etapa. Arquivos e comentários respeitam o escopo da responsabilidade. Demais usuários com `calendario-empresa` consultam.
- O diretório do RH retorna apenas ficha, ID oficial, nome, setor e disponibilidade. IDs indisponíveis não podem receber vínculos novos; vínculos históricos permanecem. Falha de consulta não autoriza usar nome digitado como identidade.

## Ordem obrigatória quando a publicação for autorizada

1. Revalidar a versão de destino, o protocolo do repositório e o backup disponível. Conferir se já existem registros na coleção antes de aplicar índice único; havendo chaves de origem repetidas, parar e analisar sem excluir dados.
2. Aplicar `supabase/migrations/20261118_planejamento_anual.sql`. Ela depende de `painel_registros`, `painel_registro_gravar` e do bucket privado existentes. Cria o índice de origem única, a RPC de importação atômica e a proteção do prefixo dos arquivos.
3. Publicar a função `painel-planejamento` com os módulos compartilhados, usando o procedimento existente do Painel. Os secrets usados são os mesmos do servidor (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `PAINEL_JWT_SECRET`); não inseri-los no código ou no navegador.
4. Conferir a função antes de disponibilizar a tela: usuário sem sessão recusado; usuário sem calendário recusado; leitura autorizada; IDs reais do diretório retornados sem dados sensíveis; erro de versão devolvendo 409; URL de anexo assinada. A publicação registra `verify_jwt=false`, pois a própria função valida o crachá do Painel e sua revogação.
5. Só então publicar a interface e conferir o botão em Calendário → Empresa, a abertura da mesma ação pelo calendário, salvar/recarregar, anexar/baixar, histórico e perfis gestão/responsável/leitor. Usar dados fictícios para ensaios de escrita somente quando esse teste for autorizado.
6. Importar a planilha real apenas pela conferência da interface, após aprovação. Conferir responsáveis e orçamento ausentes: ausência não equivale a zero. Não transferir dados da prévia como se fossem registros da empresa.

O workflow `.github/workflows/functions.yml` chama `scripts/publicar-functions.sh`, que descobre automaticamente cada pasta com `index.ts` em `supabase/functions` e inclui `_shared` recursivamente. A nova função já será incluída; não há lista nominal nem `supabase/config.toml` a atualizar. O workflow de funções não aplica migrations. O push da tela e o push do servidor podem disparar trabalhos independentes: o resultado verde de um não substitui a conferência do outro, nem dispensa a ordem acima.

## Falhas e recuperação

- Conflito 409: atualizar a ação e reaplicar a intenção sobre a versão atual. O formulário deve continuar disponível; não forçar sobrescrita.
- Resposta de importação perdida: repetir o mesmo lote com exatamente o mesmo conteúdo. O servidor retorna o resultado registrado. Um novo lote não deve ser usado apenas para contornar um resultado desconhecido.
- Resposta de upload perdida: consultar a ação antes de tentar novamente. Se a confirmação da gravação for desconhecida, o servidor conserva os bytes para não apagar um anexo possivelmente salvo. Órfãos só podem ser limpos após conferir que nenhuma referência os utiliza.
- Reimportação: preserva responsáveis, valores, execução, etapas, anexos, comentários e histórico. Campos originados da planilha só são atualizados quando ainda coincidem com o snapshot anterior; registro legado sem esse snapshot conserva o preenchimento local.
- Reversão de interface: pode ocultar o botão sem apagar as coleções, RPC ou arquivos. Não remover a migration como atalho de rollback depois que houver dados.

## Verificação local

```sh
node --test tests/planejamento-dominio.test.mjs tests/planejamento-banco.test.mjs tests/planejamento-edge.test.mjs
```

Os testes SQL usam PGlite e os testes da função usam serviços simulados. Eles verificam permissões, concorrência, importação atômica, anexos privados e preservação do histórico, mas não demonstram conexão, migração ou publicação em produção. A validação da interface e o build seguem o plano da funcionalidade.
