-- FECHAR A TABELA DO FREIO.
--
-- Achado da auditoria de 18/08/2026, e o defeito e meu, do mesmo dia: criei
-- `porta_freio` sem RLS, e neste projeto os papeis `anon` e `authenticated`
-- recebem grant amplo por padrao. A chave `anon` esta no bundle PUBLICO dos oito
-- sites -- qualquer pessoa que abra o codigo-fonte da pagina alcanca a tabela
-- pelo PostgREST.
--
-- O efeito e pior que "nao protege": o freio vira ARMA nas duas direcoes.
--   DELETE entre as tentativas -> o freio nunca engata, e a forca bruta volta a
--     ser ilimitada, com a agravante de que agora existe a ilusao de protecao.
--   INSERT com tentativas alto -> tranca a pessoa escolhida por 15 minutos, de
--     fora, sem senha nenhuma.
--
-- As funcoes que mexem nela sao SECURITY DEFINER (porta_travada e o gatilho
-- porta_freio_zerar), entao passam por cima da RLS: fechar a porta do PostgREST
-- nao atrapalha o freio, so tira a tabela do alcance de quem vem de fora.
alter table public.porta_freio enable row level security;

revoke all on table public.porta_freio from anon, authenticated;

-- Sem POLICY nenhuma: ninguem le nem escreve por RLS. So as funcoes definer.
comment on table public.porta_freio is
  'Fichas de tentativa por (sistema, usuario). RLS LIGADA e SEM POLICY de proposito: so as funcoes SECURITY DEFINER (porta_travada, porta_freio_zerar) tocam nela. A chave anon e publica.';
