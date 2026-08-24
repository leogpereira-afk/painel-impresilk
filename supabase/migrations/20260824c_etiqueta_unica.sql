-- A ETIQUETA DO PATRIMONIO PASSA A SER UNICA NO BANCO.
--
-- O advisory lock por sigla (20260823b) serializa a LEITURA do maior numero,
-- mas ele e `xact` -- solta quando a funcao retorna, e a gravacao acontece
-- num segundo passo, ja fora dele. Dois cadastros ao mesmo tempo ainda podiam
-- sair com o mesmo codigo: o lock evita o empate na leitura, nao na escrita.
--
-- Etiqueta e adesivo colado no bem: duplicar nao tem conserto barato. Um
-- indice unico faz o banco recusar o segundo -- e recusar e o comportamento
-- desejado ("falhar e melhor que duplicar", como ja diz o comentario da Edge
-- Function). A Edge tenta de novo uma vez antes de mostrar erro, entao a
-- corrida se resolve sozinha no caso normal.
create unique index if not exists painel_patrimonio_codigo_unico
    on public.painel_registros ((registro->>'codigo'))
 where colecao = 'patrimonio' and coalesce(registro->>'codigo', '') <> '';
