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

## Publicação pendente

Implementação local no ramo próprio. Ainda sem publicação desta funcionalidade. A autorização anterior de publicação tratava do PDF ACM, não desta nova ferramenta.

1. Obter autorização específica para publicar.
2. Publicar somente `painel-placas` com dependências compartilhadas e JWT próprio do Painel, seguindo Functions existente. Confirmar endpoint ativo, autenticação e catálogo com sessões autorizadas; não criar registros reais de teste sem necessidade/autorização.
3. Publicar frontend após confirmar backend. Conferir site oficial e cadastro acessível em sessões distintas, inclusive erro de versão concorrente sem sobrescrita.
4. Plano de reversão: restaurar frontend anterior e desabilitar nova função se necessário; preservar registros do catálogo.
