# Impressão 3D: piloto local

Continuidade da proposta e da prova técnica apresentada, autorizada em 28/10/2026. A prova auditou 40 STL de 15 entradas válidas e identificou três combinações de fonte/altura incompatíveis. Não tratar esse corpus como homologação de novas artes.

## Resultado esperado

Nova aba `impressao-3d` em Ferramenta I.A, sob a permissão existente. O usuário escreve uma palavra ou importa SVG/DXF do subconjunto suportado, informa medidas e gera a geometria em Worker. Confere a montagem ou vista explodida, componentes e cabimento individual; baixa corpo STL, frente STL para inspeção, frente SVG para corte e relatório JSON. Corpo oco com fundo incorporado e apoio interno; frente acrílica separada.

A página oferece rascunho local por usuário/produto usando o storage existente, exportação/importação de projeto JSON e indicação real de salvamento. Mudanças invalidam resultado e downloads imediatamente. Nenhuma malha ou STL é persistido no envelope JSON. Conflitos entre abas e falhas de integridade/quota preservam as cópias.

## Fluxo e limites

- Entradas: texto em Helvetiker/Gentilis; SVG com um path composto M/L/Q/C/Z absoluto, dimensões mm/viewBox e matriz por path; DXF LWPOLYLINE fechada sem bulge e unidade explícita mm/cm/polegada.
- Não ignorar elementos, atributos ou entidades que alterem a geometria. SVG com múltiplos subpaths requer evenodd explícito. Rejeitar scripts, entidades e recursos externos.
- Texto até 32 caracteres; arquivo até 256 KiB; até 128 contornos e 8.000 vértices. Worker termina após 20 segundos e pode ser cancelado; respostas antigas não substituem a revisão atual.
- Cálculo em mm. Curvas com tolerância 0,025 mm; preparação de exportação 0,0001 mm. Constantes técnicas não editáveis.
- Parâmetros finitos, positivos conforme modelo, folga menor que apoio útil e profundidade suficiente para fundo/apoio/frente. Rejeitar colapso, divisão do vão/frente/apoio e alteração indesejada dos vazados. Nenhuma correção silenciosa da fonte, arte ou espessura.
- O status é verificação digital do gerador; não afirmar auditoria independente em cada desenho novo. Frente SVG sem compensação de corte e sem homologação de encaixe.
- Volume nominal Ender-3 V3: 220×220×250 mm; K1 Max: 300×300×300 mm. Fontes oficiais: https://www.creality.com/products/creality-ender-3-v3 e https://www.creality.com/products/creality-k1-max-3d-printer . Margem inicial de 5 mm é decisão editável do piloto, não especificação do fabricante.
- Ender-3 V3 significa o modelo CoreXZ, não KE/SE/Plus. Material inicialmente não informado; campos de material são identificação, sem receita térmica. Não gerar G-code nem comandar máquina.
- Cabimento por peça na orientação atual, sem rotação/divisão/arranjo automático. STL é transladado para mínimo XYZ zero sem mudar dimensão. Bloquear STL que excede volume útil, manter preview/relatório.
- Não implementar 3MF, corte físico, elétrico/LED, orçamento, sincronização remota ou alteração de outras ferramentas.

## Arquitetura e contrato

`src/lib/impressao3d/model.mjs`: createPrintProject(), validatePrintProject(project), geometrySignature(project), perfis. Projeto inclui product:'impressao-3d', schemaVersion:1, id, name, revision, unit/units:'mm', source, parameters, bed e material. source é `{kind:'text',text,font}` ou `{kind:'svg'|'dxf',content,name}`. Assinatura canônica inclui identidade e revisão.

`engine.mjs`: generatePrintProject(project) retorna signature, project, kernel, parts, metrics, dimensionsMm, warnings, elapsedMs, bedFit. Peça contém id/role/label/mesh{positions,indices}/dimensionsMm/volumeMm3/frontContours/checks. bedFit contém allFit, assemblyFits e parts[{id,fits}].

`client.mjs`: createPrintClient() com generate(project), cancel(), dispose(); geração em Worker. `exports.mjs`: partSTL(project,result,partId), frontSVG(project,result,partId?), projectReportJSON(project,result); todos conferem assinatura atual.

`src/components/impressao3d/PrintViewport.jsx`: props result/printer; Three em mm, montada/explodida, frontal/perspectiva, zoom/enquadrar, corpo/frente. Resize e cleanup; falha de WebGL explícita.

`src/pages/Impressao3D.jsx` e CSS: formulário compacto, geração explícita, parâmetros avançados recolhíveis, peças e downloads; padrão claro/escuro/mobile e teclado. A aba é lazy e remonta ao mudar usuário. Persistência usa createFabricationStorage com produto exclusivo e CAS; importação de projeto não carrega binários.

## Aceitação

Core: corpus da prova mantém dimensões/vazados e limites; entradas não suportadas, recursos excessivos e parâmetros incompatíveis falham claramente. STL relido conserva dimensão/orientação, exportação antiga e peça grande são bloqueadas. Cliente cancela e rejeita falhas/timeout.

Integração: gerar texto e SVG/DXF, trocar perfil, alterar dimensão e invalidar downloads, recarregar rascunho, exportar/importar projeto, testar duas abas e identidade separada. Conferir frontend em 1440/390 px, modo escuro, falha WebGL e caminhos oficiais de Worker/WASM/fontes em builds de produção e revisão. Rodar verificações pertinentes e CI oficial; não publicar.
