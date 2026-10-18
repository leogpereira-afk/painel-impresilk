# Acrílico/MDF: modelos e comandos compactos
Spec: prompt aprovado pelo dono em Dre/entregas/oficina-cnc-20261018/prompt-evolucao/prompt-acrilico-mdf.md e sete imagens de 18h37–18h39.
Prévia somente. Clone próprio já existente /tmp/painel-acrilico-mdf-20261018, branch codex/acrilico-mdf-composicao-20261018. Nenhuma publicação.

1. Geometria e visualização: modelos de tampa removível com saia, articulada integrada com pivôs, organizador com tampa; dimensões internas/externas, folgas e movimento separado da assinatura de fabricação. Arquivos model.mjs, novos boxes.mjs e testes; PanelsViewport e viewerGeometry.
2. Corte: edição direta por arraste com validação, transferência, reorganização de livres e simulação explícita de cópias na sobra; melhorar classificação por compatibilidade e etiquetas numeradas. workflow.mjs, novos nesting.mjs/NestingEditor.jsx e testes. Não editar módulos oficina/ACM/metalon.
3. UI: reorganizar lateral conforme imagens, sliders editáveis com commit único, campos contextuais, modelos e controles de tampa, paleta, resumo interno, integração dos controles de corte. OficinaPlacas.jsx/.css e controles novos isolados.
4. Integração, revisão independente e testes: verificar contrato dos modelos, marca nos documentos e numeração consistente; regressões de geometria, dados legados e corte; navegador desktop/mobile; build/lint; conferir 101 arquivos protegidos. Entregar mesma prévia4320 sem publicar.

Contratos: config.model='hinged-lid'; lidHeight,lidClearance,pivotClearance,lidAngle (visual somente); organizerLid='none'|'removable'|'hinged'. Viewport recebe resultado com transforms visuais separados. Draft de slider local, uma mutação final. Modelo interno em mm. Exportação nominal explícita; não implementar compensação de ferramenta sem geometria validada.
