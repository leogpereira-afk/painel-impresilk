-- A JANELA DA VARREDURA PASSA A OLHAR TAMBEM AS CAMPANHAS.
--
-- `permutas_historico_desde()` decide ate onde a carga varre o ERP, e olhava
-- so a colecao `permutas`. A campanha tem o MESMO campo `desde`, roda na mesma
-- funcao de gravacao e depende do mesmo historico -- mas era ignorada: criar
-- "Politica 2020" com desde 2020-03-02 nao puxava nada, enquanto a tela
-- promete que "a carga do historico roda domingo de madrugada e preenche".
--
-- O nome fica (quatro chamadores: painel-cache:158, painel-dados, 20260823d e
-- 20260824a); o que muda e o de onde ele tira o minimo.
create or replace function public.permutas_historico_desde()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select min((registro->>'desde')::date)
    from public.painel_registros
   where colecao in ('permutas', 'campanhas')
     and registro->>'desde' ~ '^\d{4}-\d{2}-\d{2}$';
$$;
