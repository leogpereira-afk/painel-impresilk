-- FECHAR A VIEW DE PENDENCIAS.
--
-- Achado da auditoria de 18/08/2026, defeito meu do mesmo dia. Criei
-- `acesso_pendencias` sem pensar em quem a alcanca: VIEW nao herda a RLS das
-- tabelas de baixo -- ela roda com os direitos do DONO --, e neste projeto
-- `anon` recebe grant por padrao. A chave `anon` esta no bundle publico dos oito
-- sites, entao a view estava respondendo para qualquer um.
--
-- E o que ela entrega e exatamente o que a porta desta tela existe para proteger:
-- quem tem acesso, com que login, quem foi DESLIGADO e ainda entra, e quando o
-- prazo de um terceirizado vence. A lista de quem entra em que sistema e, por si
-- so, um mapa de onde bater -- esta escrito no cabecalho da painel-acesso, e eu
-- furei a propria regra horas depois de reforca-la.
--
-- `security_invoker` faz a view rodar com os direitos de QUEM CONSULTA, entao a
-- RLS das tabelas de baixo volta a valer. E o revoke tira ela do PostgREST.
-- Duas travas porque uma so ja falhou hoje.
alter view public.acesso_pendencias set (security_invoker = on);
revoke all on table public.acesso_pendencias from anon, authenticated;

comment on view public.acesso_pendencias is
  'Pendencias de acesso. security_invoker + sem grant para anon: e um mapa de onde bater, e so a Edge Function (service role) deve ler.';
