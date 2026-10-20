# Simulador Acrílico, MDF e PVC — prévia de 20/10/2026

Pedido: nova aba ao lado do plano de chapas ACM, catálogo compartilhado entre vendedores e cálculo de aproveitamento de chapas/retalhos.

## Implementação

- `FerramentaIA`: nova rota `?ferramenta=simulador-placas`, sem alterar módulos anteriores.
- `SimuladorPlacas`: catálogo por material, formato em cm, espessura em mm, cor, marca, referência, quantidade e localização de retalhos; ativação/desativação recuperável.
- Projeto: medidas numeradas, cálculo automático, botão OK, desenho da chapa inteira em cinza com peças na cor cadastrada e resumo por material. Cadastro de formatos para compra, não estoque de chapas inteiras.
- Motor: reutiliza `nestPieces` e `validateNesting` do ACM sem modificar os arquivos existentes. Só retângulos, sem dobras ou geometria das caixas. Retalhos compatíveis entram primeiro; diferenças de material, cor, espessura, marca/referência e sentido impedem mistura. Cada retalho só pode ser consumido até a quantidade cadastrada dentro de uma simulação, inclusive entre formatos comerciais diferentes.
- Simular não reserva nem baixa estoque. Simulações de vendedores diferentes podem considerar o mesmo retalho: confirmar disponibilidade antes da produção. Os projetos são temporários nesta versão; o catálogo é compartilhado.
- PDF vetorial com logo, compras, retalhos identificados, materiais, desenhos e lista de corte. Paginação sem reduzir continuamente fontes/desenhos. Não é programa CNC ou sequência de serra.

## Cadastro compartilhado

Novo endpoint `painel-placas`, coleção `simulador_placas_catalogo` na tabela existente `painel_registros`. Reutiliza RPC `painel_registro_gravar` com comparação da versão anterior e trava transacional. Não requer migração nova nem ampliação de acesso ao banco no navegador.

JWT válido, revogação estrita, estado atual da conta e permissão `ferramenta-ia` conferidos no servidor; sessão master segue o protocolo ACM. Apenas `list` e `save`, schema fechado, limites numéricos e de corpo. Conflito retorna 409 e preserva formulário. Não há exclusão definitiva.

Modo `review` usa catálogo fictício no navegador, isolado do oficial e explicitamente sinalizado; nenhum fallback local em produção. Botão Atualizar cadastro lê alterações de outros vendedores. Todos os usuários autorizados ao módulo podem consultar e atualizar o catálogo da equipe.

## Verificação

- 359 testes: motor ACM, plano de chapas, simulador e handlers de autenticação/catálogo.
- Casos: quantidade de compra, área, giro/sentido, margem/separação, incompatibilidade material, retalho sem dupla contagem, entradas inválidas, duas sessões compartilhando repositório, versão obsoleta recusada, arquivamento reversível e PDF.
- Lint dos arquivos JS/JSX alterados e build de produção aprovados. Aviso preexistente de chunks grandes do Vite.
- Prévia em 1440px e 390px; sem transbordamento horizontal no simulador. Cadastro, edição de cor, cálculo e exportação exercitados pela interface.
- PDF baixado da prévia: 15 peças, 3 materiais, 3 chapas novas e 1 retalho, em uma página; texto e imagem inspecionados. Exemplos fictícios criados só no navegador, não versionados.

## Publicação concluída

Dono autorizou publicar em 20/10/2026. Commit de implementação 5c0fafa; release 013daf8. Servidor publicado antes do frontend, com autenticação própria do Painel.

- Functions 39458125903: sucesso; painel-placas v2 ACTIVE, 11 arquivos relidos iguais (caminho do entrypoint normalizado pelo publicador).
- Pages 39458126020: sucesso; 197/197 arquivos públicos iguais ao build validado.
- Suíte completa local: 3.062 testes aprovados. Lint sem erros, um aviso preexistente em Agenda.jsx. Os testes que abrem servidor local precisaram executar fora do isolamento, que inicialmente recusou listen com EPERM.
- Endpoint sem sessão retorna 401. Banco com tabela e RPC existentes. Escrita/leitura da RPC testadas em transação revertida; consulta seguinte confirmou que o registro fictício não permaneceu.
- Site oficial na sessão autenticada: nova aba, catálogo vazio carregado e formulários habilitados. Não foram cadastrados materiais inventados no catálogo produtivo. Compartilhamento entre duas identidades e conflito concorrente foram verificados nos testes de handler; não foi utilizado login de outro vendedor em produção.
- PDF e cálculo completo conferidos na prévia; seus arquivos publicados são idênticos aos validados. O catálogo produtivo começa vazio para a equipe cadastrar formatos reais.

Reversão: restaurar frontend anterior e desabilitar função se necessário, preservando registros do catálogo.
