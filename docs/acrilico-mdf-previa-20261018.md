# Acrílico e MDF — prévia local de composição

18/10/2026 · implementação local, sem publicação.

Prévia: http://127.0.0.1:4320/revisao-local.html#/ferramenta-ia?ferramenta=acrylic

## Entregue nesta prévia

- Editor próprio para Acrílico/MDF, com caixa, placa, divisórias, texto e vetor no mesmo projeto. Inserir texto preserva os objetos existentes.
- Texto editável com acentos, cedilha, linhas, fonte, dimensões, espaçamento, posição e rotação. Corte, gravação em peça alvo, anotação e vazado são operações distintas. Volume por camadas gera peças físicas e quantidades reais.
- Medidas em mm, espessura nominal/medida, cor, opacidade, tipo de material, acabamento e SKU. Entrada decimal com vírgula e erro junto ao campo.
- Meios-encaixes automáticos de divisórias e pares manuais entre placas que se cruzam, com entrada complementar, folga e profundidades editáveis. Rasgos reais aparecem em 2D, 3D e arquivo.
- Contornos iguais para prévia, corte e exportações. Vistas ortogonais, perspectiva, seleção, zoom, explosão e montagem. Interface compacta com alternância de configuração/prévia no celular.
- Plano por envelopes com estoque, margem, separação e rotação. Mover, bloquear, retirar e realocar integram desfazer/refazer. Planos são revalidados ao restaurar e exportar.
- SVG/DXF nominal em mm, gravação separada de corte, CSV, backup, revisões e salvamento local protegido contra sobrescrita silenciosa por outra aba.

## Conferência realizada

| Cenário | Resultado |
|---|---|
| Caixa externa 300 × 200 × 150, chapa 3,2 mm | Laterais 193,6 × 150; base 293,6 × 193,6 |
| Placa 300 × 150 × 3,2 | Dimensões físicas nas peças e exportação |
| Duas divisórias H100, espessura 3,2, folga de ensaio 0,15 | Rasgos complementares 50 e largura 3,35; caso de teste, não calibração universal |
| Texto “AÇÃO — JOÃO 08” na frente da caixa | Conferido visualmente; caixa e divisórias preservadas |
| MDF em três camadas de 3 mm | Nove peças para “MDF”, profundidade total 9 mm |
| Retirar/recolocar, desfazer/refazer, salvar/reabrir | Browser confirmou plano com oito peças e nenhuma pendência após retomada |
| Plano com selo antigo, mas fora de margem ou estoque | Exportação bloqueada pelos testes do validador físico |
| Backup/revisão e conflito entre abas | Testes de persistência, versão e isolamento aprovados |
| Desktop 1440×1000 e celular 390×844 | Controles verificados; corrigido corte do rodapé do viewer em ambos |
| Exportações de demonstração | Quatro SVG lidos como XML; oito peças, mm e gravação separada. Quatro DXF com unidade 4/mm, ENGRAVE e EOF. BotõesSVG/DXF também acionados na interface sem erro de console |
| Preservação do trabalho paralelo | 101 arquivos de ACM/Oficina/Metalon comparados por SHA-256, nenhum modificado |

Suíte do repositório: 1.265 testes aprovados, nenhuma falha/ignorado. Build de produção e de prévia aprovados. ESLint sem erros; aviso preexistente em Agenda.jsx. Vite mantém avisos de tamanho de módulos do motor/nesting. Console da prévia sem erros.

## Limites ainda presentes

Esta é a prévia funcional da composição e dos meios-encaixes, não a conclusão de todas as capacidades avançadas da revisão 5:

- Letras volumétricas usam laminação de chapas. Laterais curvas, cavidade interna e letra caixa oca não foram implementadas neste editor.
- Encaixes de dedos atuais unem paredes verticais; base e tampa continuam pelo modelo de colagem/topo. Cupom paramétrico de folgas e escolha independente de encaixe para cada face ficam pendentes.
- Meios-encaixes aceitam placas verticais perpendiculares com bases alinhadas e mesma altura. Montagens incompatíveis são bloqueadas; alturas diferentes não recebem cálculo automático genérico.
- Texto vazado com ilhas soltas é bloqueado. Criação interativa de pontes, operações booleanas livres, edição de nós, agrupamento e alinhamento/distribuição de múltiplos objetos ficam pendentes.
- Posicionamento é numérico por objeto; não há manipulador 3D de arraste. Modelos específicos de display/suporte podem ser compostos por placas/divisórias, sem assistentes próprios.
- Nesting é conservador por envelopes, sem otimizador de contornos ou reaproveitamento automático de retalhos.
- Não foram criados perfis de máquina/calibração. Compensação de ferramenta, alívios de router, G-code, adesivo e liberação de fabricação precisam de conferência no CAM/oficina. Nenhum limite universal de máquina foi presumido.
- Armazenamento é local no aparelho. Não houve ativação de sincronização em nuvem nem alteração de registros reais.
- Metalon permaneceu no editor e armazenamento anteriores, preservado para a outra aba.

## Roteiro rápido

1. Abra Acrílico e selecione Caixa ou Texto na lista lateral. Altere medidas e use 2D para conferir cada face.
2. Escolha Caixa organizadora e abra Meios-encaixes; ajuste um par e confira os rasgos.
3. Em Texto, escolha gravar na frente, altere conteúdo/altura e posição X/Z. O projeto de demonstração já contém um exemplo.
4. Troque para MDF; o exemplo contém texto em camadas. Materiais mantêm suas composições separadas.
5. Abra Corte e custos. Selecione uma peça na chapa, retire, realoque, desfaça e refaça.
6. Em Documentos, escolha explicitamente peças separadas ou plano alocado antes de exportar. Guarde uma revisão ou faça backup.

Código isolado: `/private/tmp/painel-acrilico-mdf-20261018`. Nenhum commit, push, migração ou deploy nesta etapa.


## Complemento: plano de corte
Botão independente no cabeçalho abre as medidas da chapa e o plano. Documento para impressão/PDF incorpora logo da Impresilk, desenho por chapa, revisão, medidas, espessuras e posições. Geometria revalidada antes da impressão; marca não entra no DXF/SVG de fabricação. Verificação: 36 testes do módulo, lint dos arquivos alterados e build de revisão aprovados. Apenas prévia local.


## Atualização: referências compactas e modelos de tampa — 18/10/2026

Esta seção registra a evolução posterior; as contagens acima são verificações históricas. Prévia somente, sem commit/push/deploy.

- Lateral compacta, seções contextuais, medidas L × P × A, unidades convertidas, campos numéricos com vírgula, sliders com um único histórico por arraste. Focar/desfocar sem editar não modifica o projeto.
- Tampa de sobrepor com quatro saias reais; articulada com pinos, alojamentos, apoios e batente externos. Organizador pode receber ambas. Posições e altura das divisórias são editáveis; meios-encaixes recalculados. Corpo de prova opcional.
- Cor, subtipo, acabamento, SKU e espessura separam chapas incompatíveis. Opacidade e ângulo não mudam os arquivos de corte. Tampas legadas preservadas; escolher explicitamente sobrepor inicializa o novo modelo.
- Arraste com rejeição de colisões, travas, transferência entre chapas compatíveis e reorganização das livres. Cópias adicionais são simuladas e confirmadas de forma atômica, sem abrir chapas novas. Peça, objeto e conjunto são opções distintas.
- Desenho numerado e tabela correspondente no PDF com logo; nomes longos não ficam sobrepostos. Logo permanece fora dos caminhos de fabricação.

Verificação final: **1.292 testes aprovados**, zero falhas/ignorados. Inclui 61 testes próprios de Acrílico/MDF. Builds de produção e revisão aprovados; ESLint sem erros (aviso preexistente em Agenda.jsx); avisos de chunks grandes nos motores existentes. Revisão independente conferiu interferências, rasgos e exportações. 101 arquivos protegidos de ACM/Oficina/Metalon comparados por hash, intactos.

Navegador: slider55/100 e um Desfazer, mm/cm, organizador com divisórias X70,5/Y120, preservação ao sair de Colunas sem mudar, tampa de sobrepor com10peças, paleta sem alterar espessura, arraste inválido/válido, travas na reorganização, simular/confirmar1cópia e desfazer/refazer, PDF com logo/numeração, desktop e390×844 sem transbordamento horizontal. Rascunho original permanece com4objetos/20peças; a QA usou outra origem local.

Limites desta evolução: nesting por envelopes conservadores, não por contorno; exportação nominal, compensação no CAM. Articulação só laser,0–100°, precisa de corpo de prova físico para folga, retenção, desgaste e colagem. Conjunto completo com materiais mistos não é preenchido parcialmente: usar peça/objeto no material selecionado. Não foi criada sincronização remota.

Prévia demonstrativa desta atualização: http://127.0.0.1:4321/dist-review/revisao-local.html#/ferramenta-ia?ferramenta=mdf . O rascunho original permanece na porta4320. Exportação SVG acionada no navegador e lida como XML válido, dimensões1620×600mm para duas chapas800×600 com separação de apresentação. Console sem erros.
