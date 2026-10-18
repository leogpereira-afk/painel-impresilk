# Oficina de materiais — prévia local

Implementação isolada a partir de aeb8cf8, no ramo codex/oficina-materiais-20261018. Não publicada.

## Disponível para revisão

- Abas Acrílico, MDF e Metalon; ACM e Letra Caixa continuam acessíveis e preservados.
- Interface escura compacta, configurações na lateral, ações fixas, prévia 2D/3D, frente/topo/perspectiva, seleção, vista explodida, animação e captura de imagem.
- Caixas abertas/fechadas, tampa removível, divisórias, organizador, display, peça plana e importação SVG/DXF com confirmação de escala.
- Espessura medida, dimensões internas/externas, quantidade por lote e encaixes complementares nos cantos verticais; base/tampa com união de topo.
- Quadro de metalon com perfis independentes, travessas, chapa galvanizada frontal plana opcional e furos de instalação. Chapa e quadro podem ser visualizados separadamente.
- Motor de barras do ACM e nesting por envelopes conservadores. Estoque manual finito, conjuntos completos, propostas alternativas, posicionamento por X/Y, giro, bloqueio e retirada de peças.
- Recálculo preserva chapas com posições bloqueadas. Origem inferior esquerda consistente entre tela e arquivos.
- Custo por chapa/barra, máquina, montagem, markup ou margem. Valores ausentes permanecem pendentes.
- SVG/DXF nominais em milímetros, camadas separadas; metalon tem lista CSV de cortes, perdas e sobras. Sem chapa, o DXF fica desabilitado com explicação.
- Rascunhos, planos e revisões locais por usuário; backup validado. Reabertura valida os planos independentemente, elimina caches incoerentes e preserva o projeto.

## Limites desta prévia

- Nesting irregular por contornos, uso de vazados e retalhos ainda não estão habilitados. Arranjo atual considera envelopes e separações; não representa solução ótima garantida.
- Integrações de briefing e estoque ERP continuam pendentes. A consulta de O.S. reaproveita o seletor existente; a simulação não acessa registros reais.
- Corte a 45° permanece no ACM; esta aba Metalon usa encontros de topo a 90°. A prévia 3D dos tubos usa volumes externos, enquanto a parede informada participa da validação.
- Base e tampa não têm encaixes de dedos. Router com encaixes que precisariam de alívios não é liberado como pronto.
- Importação aproxima curvas em segmentos. Não há G-code, pós-processador, análise estrutural de cargas, liberação automática de fixadores ou usinagem validada em máquina.
- Armazenamento é local neste navegador. Sem sincronização de projetos/anexos com servidor.

## Verificação

- Suíte do projeto: 1.231 testes aprovados, incluindo 94 testes específicos da Oficina/cena.
- Lint do escopo sem erros/avisos; builds de revisão e produção concluídos. Avisos existentes de chunks grandes de 3D/nesting/Letra Caixa permanecem.
- Navegador: troca entre materiais, organizador de acrílico, montagem após explosão, metalon com chapa/furo, nesting, bloqueio/recalculo/reabertura, orçamento pendente download DXF em milímetros e importação SVG de três formas com um vazado.
- Tamanhos desktop e celular conferidos; cabeçalho acompanha a altura do aviso da simulação e câmera se ajusta ao formato.
- Arquivos exportados também passam por testes de retorno, preservação de coordenadas, quantidades e camadas.

Prévia: http://127.0.0.1:4318/revisao-local.html#/ferramenta-ia?ferramenta=mdf
