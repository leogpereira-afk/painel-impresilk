# Oficina de materiais — implementação e prévia

Objetivo autorizado: Acrílico, MDF e Metalon, preservando ACM/Letra Caixa e mostrando prévia antes de publicar. Especificação vinculante: Dre/entregas/oficina-cnc-20261018/prompt-oficina-materiais.md, revisão 4; referências centrais e laterais da seção 13. Base atualizada aeb8cf8; vez anterior encerrada. Nenhuma publicação nem registro real.

## Matriz de reaproveitamento

- Reutilizar `acm/structure.mjs`: perfis independentes, encontros, travessas, cortes e plano de barras; adaptar entrada para quadro sem ACM.
- Reutilizar `acm/nesting.mjs`: envelopes conservadores por material; criar adaptação das peças planas, validação independente, conjuntos completos e métricas.
- Reutilizar dependência Three e convenções de fabricação em mm; criar viewport de montagem por transformações das peças planas, controles da referência e captura.
- Reutilizar consultas de O.S./permissões existentes; vínculo permanece local. Briefing e estoque ERP continuam integração pendente, sem dados inventados.
- Criar geradores, peça galvanizada plana opcional, furos próprios, documentos nominais e armazenamento identificado por usuário.
- Nesting irregular por contornos, G-code e calibração de máquinas não serão simulados como disponíveis. A prévia deve indicar explicitamente qualquer etapa ainda pendente.

## Tarefas

1. Contrato e motores em `src/lib/oficina/`: projeto com componentes por material, peças com contornos e transformação 3D, geradores dimensionais, adaptação ACM e testes dos casos da seção 14.
2. Plano e documentos em `src/lib/oficina/`: adaptar nesting existente, validação das alocações, exportação nominal SVG/DXF com camadas, custos sem inventar preços, persistência versionada. Testar ida e volta e invalidação por assinatura.
3. Interface em `src/pages/OficinaMateriais.jsx`, CSS e `src/components/oficina/`: barra esquerda compacta, material/etapas, viewport 2D/3D, montagem/explosão, corte/custos e documentos. Integrar lazy em FerramentaIA, mantendo rotas anteriores.
4. Testes, revisão mecânica/software/design independente, build/lint e regressão ACM/Letra Caixa. Conferir navegador desktop/celular, downloads e reabertura. Documentar limitações reais e abrir prévia local.

## Contrato entre interface e motor

`createWorkshop()` → schemaVersion, id, name, revision, activeMaterial, components (acrilico/mdf/metalon), stock por material, costs. `buildWorkshop(project, material)` → valid/errors/warnings, pieces (id, label, width, height, thickness, contour, holes, transform {origin,u,v,normal}, material, quantity), dimensions {width,depth,height}, inner, frame. `planWorkshop(project, result)` → assinatura/revisão, sheets, unplaced, totals, bars. Exportações utilizam a mesma geometria.

Geometrias e quantidades invalidam planos. Custo e visualização são independentes. Persistência somente neste aparelho, com falhas expostas. Todos os cenários da prévia são sintéticos.
