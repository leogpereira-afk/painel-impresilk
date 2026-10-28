# Impressão 3D - piloto publicado

28/10/2026 · Impresilk · Publicado e conferido após autorização do dono.

## Entrega

Nova entrada `Impressão 3D` em Ferramenta I.A, disponível no painel oficial. Gera corpos de letras com fundo integrado, cavidade e apoio para frente nominal de acrílico. Tem texto com duas fontes, importação restrita de SVG/DXF, parâmetros em milímetros, prévia 3D real, conferência individual contra o volume da impressora e arquivos por peça.

Perfis informados pelo usuário e conferidos nas páginas oficiais:

| Impressora | Volume nominal | Área XY com margem inicial de 5 mm por lado |
|---|---|---|
| Creality Ender-3 V3 (CoreXZ) | 220 × 220 × 250 mm | 210 × 210 mm |
| Creality K1 Max | 300 × 300 × 300 mm | 290 × 290 mm |

Fontes: https://www.creality.com/products/creality-ender-3-v3 e https://www.creality.com/products/creality-k1-max-3d-printer. A margem de 5 mm é uma escolha ajustável do piloto, não uma especificação do fabricante. Não foi escolhido um material; o projeto começa como `Ainda não informado`.

## Escopo e limites de entrada

Texto de até 32 caracteres, com fontes locais Helvetiker e Gentilis. Altura escala apenas o texto. SVG/DXF conservam as medidas físicas declaradas no arquivo.

SVG: um único path, possivelmente composto, width/height em mm, comandos absolutos M/L/Q/C/Z explícitos, furos com evenodd e transformação matrix opcional no path. Não aceita stroke, imagens, texto, grupos, estilos, referências externas ou transformações de raiz. O SVG de corte exportado precisa ser convertido em arte preenchida antes de ser usado como origem.

DXF: ASCII com HEADER e ENTITIES, LWPOLYLINE fechada de segmentos retos, INSUNITS em mm/cm/polegadas. Sem TABLES/BLOCKS, bulges, OCS, espessuras ou larguras. Importação de arquivos arbitrários desses formatos não está implementada.

Limites: 256 KiB por arquivo, 128 contornos, 8.000 vértices e 20 segundos por geração. Desenhos incompatíveis são rejeitados explicitamente. Curvas usam tolerância digital fixa de 0,025 mm.

## Arquivos e uso

- **Corpo STL:** peça individual transladada para XYZ mínimo zero, na orientação original. Coordenadas em mm; STL não carrega unidade padronizada, então o fatiador deve interpretá-lo em mm.
- **Frente STL:** geometria nominal para inspeção do encaixe, não perfil pronto de impressão.
- **Frente SVG:** contorno nominal para corte de acrílico, sem compensação da largura de corte.
- **Projeto JSON:** entrada e parâmetros editáveis. Não contém malha, STL ou imagem.
- **Relatório JSON:** dimensões, peças, volume, testes do gerador, perfil e limites.

A troca de texto, medida, perfil, material ou nome invalida imediatamente o resultado. Exports exigem a assinatura completa da configuração atual. Peças maiores que o volume útil são bloqueadas; não há rotação, distribuição na mesa, emendas ou divisão automática.

O rascunho é salvo manualmente no navegador, por usuário e produto. Conflitos entre abas bloqueiam sobrescrita. Edições não salvas sobrevivem à navegação interna da sessão; fechamento/recarga avisa enquanto houver pendências. Uma gravação iniciada antes da troca de tela mantém sua versão correta quando termina.

## Verificação

- Núcleo novo: 29 testes de geração, unidades, importação, limites, assinatura, cancelamento e timeout.
- Prévia: 4 testes de bounds, câmera e ausência de mutação da malha.
- Sessão: 8 testes novos, incluindo gravação atrasada, preservação de edição posterior, dados por usuário e remoção de malhas do cache.
- Auditoria externa Python/NumPy: 15 casos, **40/40 STL** aprovados, **30/30** verificações topológicas e **2/2** volumes analíticos. Leitura dos STL novos sem importar Manifold.
- 66.396 triângulos auditados; 175.654 pares não adjacentes examinados; nenhuma interseção encontrada nesses pares.
- Maior erro dimensional digital nos STL auditados: **0,0000076294 mm**, abaixo do limite de 0,01 mm. Esse número mede a conversão geométrica; não é precisão da impressora.
- Verificações gerais: 1.880/1.880 na suíte raiz, 1.496/1.496 na suíte de cálculos, 7/7 de acessos, lint sem erros, 15/15 checkers e builds de produção/revisão. Rodada focada final: 41/41.
- Browser real: 29 verificações de fluxo e 4 de salvamento/navegação com atraso controlado passaram no build de revisão. Downloads lidos de volta, escala SVG/DXF, bloqueio Ender/liberação K1, JSON inválido sem perda, retorno da sessão, conflito de abas, escala por fonte, tema escuro, mobile de 390 px, WebGL e recursos de build. Evidências finais em `evidencias/` do kit.

A revisão independente encontrou e corrigiu: ajuda SVG divergente, cores do tema escuro, avisos de licença ausentes no build e corridas de salvamento/navegação. O runtime oficial Manifold é preservado byte a byte com hashes; seu arquivo gerado é o único novo caminho ignorado pelo ESLint. O warning de Hooks de Agenda já existia e o arquivo não foi alterado. Os builds mantêm o aviso de bundles grandes, inclusive Three e motores existentes.

Os casos Gentilis Ç/120 mm e AÇÃO/120 ou 180 mm continuam bloqueados quando o apoio ou a frente se fragmentam. Ç/180 mm e AÇÃO/210 mm passam; não houve reparo silencioso.

## O que ainda não foi validado

Nenhuma impressão física foi feita nesta rodada. Não houve novo fatiamento destes arquivos; a importação/fatiamento da prova anterior não equivale a ensaio desta integração. Ainda dependem de amostra: material, temperatura, bico, adesão, resistência, acabamento, iluminação e folga real do acrílico.

A análise externa exclui pares de triângulos que compartilham vértice e não prova universalmente a ausência de dobras adjacentes. Os resultados do corpus não homologam toda arte futura.

Não estão incluídos: G-code, 3MF, JPG/PNG/PDF como geometria, auto-reparo, divisão de peças, fatiador, envio à impressora, preços/tempo de produção ou LED/fiação.

## Próxima etapa prática

1. Confirmar o material a usar na Ender-3 V3 ou K1 Max.
2. Abrir um corpo simples no fatiador da máquina, conferir mm, dimensões, orientação e perfil real do material.
3. Imprimir uma amostra e testar o encaixe com acrílico da espessura medida.
4. Registrar medidas reais, folga, acabamento e ajustes antes de ampliar a ferramenta ou liberar para produção.

## Reprodução de desenvolvimento

Base `61671cc28d8116862829fa0c5eebfb8bd85acc24`, ramo local `codex/impressao3d-piloto-20261028`. Node 24.19.0. Nenhum pacote npm adicional; dependências do painel já existentes e runtime WASM/fontes locais com licenças distribuídas.

- Dev: `vite --mode review --host 127.0.0.1 --port 4390 --strictPort`, página `revisao-local.html#/ferramenta-ia?ferramenta=impressao-3d`.
- Build revisão: `vite build --mode review --config vite.review.config.js`; servir em `/dist-review/`.
- Build oficial: `BASE_PATH=/painel-impresilk/ vite build`; verificado localmente e publicado conforme registro abaixo.
- Browser: `tests/impressao3d-browser.mjs` e `tests/impressao3d-session-browser.mjs`; variáveis `PLAYWRIGHT_MODULE`, `CHROME_PATH`, `PRINT_BASE_URL` e `PRINT_TEST_OUTPUT` permitem adaptar o ambiente. Testes recusam URL fora de localhost e usam dados sintéticos.
- Persistência: não publicar as evidências de navegador com dados reais. O material deste piloto usa somente exemplos sintéticos.

## Publicação autorizada - 28/10/2026

Após revisão, o dono autorizou “subir projeto e publicar”. Liberar a versão aprovada como Piloto, conservando as limitações documentadas. A integração utiliza a permissão existente de Ferramenta I.A, sem servidor ou migração. Os rascunhos ficam no navegador por conta, sem envio de arquivo ao servidor. Revalidar testes, builds, workflow Pages e arquivos servidos antes de registrar a conclusão.

Verificação fresca de release: 1.880 testes gerais, 1.496 de cálculos e 7 de acessos aprovados, sem falhas ou exclusões. Lint sem erros, somente aviso preexistente em Agenda. Os 14 verificadores anteriores ao build e as 72 classes de cor passaram; builds de produção e revisão concluídos. Referência externa de sistemas: vida-leo `6adc6dcfbf8bba55ff7694e2a8f12cf6b58bcb84`. Revisão independente repetiu os 41 testes focados, conferiu a proveniência do runtime e os caminhos dos recursos de produção, sem bloqueadores. Workflow e conferência oficial concluídos conforme registro abaixo.

## Publicado e conferido - 28/10/2026

- Interface `6515d00fac13dc771a4372be036c4eb7a04f7418`; [Pages 40730694886](https://github.com/leogpereira-afk/painel-impresilk/actions/runs/40730694886) concluído com sucesso em build e deploy.
- [Endereço oficial](https://leogpereira-afk.github.io/painel-impresilk/ferramenta-ia?ferramenta=impressao-3d), sessão autenticada recarregada e nova entrada de menu conferida.
- Vinte recursos públicos responderam HTTP 200 e conferem byte a byte por SHA-256 com o build local aprovado: HTML, entrada, FerramentaIA, módulo/viewport, CSS, Worker, Manifold JS/WASM, fontes, licenças e dependências diretas. WASM servido como `application/wasm`.
- Letra A gerada em produção para Ender-3 V3 e K1 Max: corpo 107,3247756958 × 120 × 40 mm; frente nominal 99,70070877 × 114,7 × 3 mm. Mudança de perfil invalida a exportação até gerar novamente; navegação recupera a edição pendente da sessão.
- STL do corpo baixado e relido: 188 triângulos, 9.484 bytes, mínimo XYZ zero e dimensões correspondentes. SHA-256 `066f578b20a618c9afb63c6a6acc9d90c873c1717f277714d24f898942a12534`.
- SVG nominal baixado e relido: XML válido, width/height em mm e viewBox correspondente. SHA-256 `e801bb045a5b101084accf6ea4784ccdde3b6cfc389b58db195024e446b57559`.
- Vista montada/separada e geração conferidas no navegador oficial; nenhum erro ou aviso de console capturado. O evento de download da automação expirou, mas a conclusão foi confirmada pela existência, horário e leitura integral dos arquivos baixados.
- Apenas a amostra sintética A foi usada. Nenhum rascunho foi gravado e nenhum registro real, acesso ou servidor foi alterado. Definição de material, fatiamento e impressão física continuam pendentes; publicação permanece identificada como Piloto.

Conferência de whitespace: código próprio sem ocorrências após remover uma linha final vazia; espaços das licenças originais foram preservados. Evidências detalhadas e captura do site oficial guardadas fora do repositório público.
