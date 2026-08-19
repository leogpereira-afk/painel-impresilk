-- ATE ONDE O PAINEL TEM O.S. GUARDADA, e DE QUANDO cada permuta procura.
--
-- 1) COBERTURA. A tela de Permutas deixou de ter uma data global e passou a ter
--    uma data POR PERMUTA -- cada troca tem o seu periodo, e a data que servia
--    a uma nao servia a outra. So que agora uma permuta pode pedir 2018 e o
--    painel ter guardado so 2025: as duas situacoes ("o cliente nao comprou
--    nesse periodo" e "o painel nao foi buscar esse periodo") aparecem iguais
--    na tela, como lista vazia. Esta funcao devolve o que o painel REALMENTE
--    tem, para a tela poder dizer qual das duas e.
create or replace function public.painel_ordens_cobertura()
returns table (desde date, ate date, quantas bigint)
language sql
stable
security definer
set search_path = public
as $$
  select min(data), max(data), count(*) from painel_ordens;
$$;

revoke all on function public.painel_ordens_cobertura() from public, anon, authenticated;
grant execute on function public.painel_ordens_cobertura() to service_role;

-- 2) DE QUANDO A CARGA DO HISTORICO VAI BUSCAR.
--    Agora sai das PROPRIAS permutas: a mais antiga que alguem pediu manda.
--    Sem isso seriam dois lugares para a mesma decisao -- a direcao poe 2018
--    numa permuta e a carga continua trazendo de 2025, e ninguem entende por
--    que a O.S. de 2018 "nao existe". Um dono so: o campo da permuta.
create or replace function public.permutas_historico_desde()
returns date
language sql
stable
security definer
set search_path = public
as $$
  select min((registro->>'desde')::date)
    from painel_registros
   where colecao = 'permutas'
     and registro->>'desde' ~ '^\d{4}-\d{2}-\d{2}$';
$$;

revoke all on function public.permutas_historico_desde() from public, anon, authenticated;
grant execute on function public.permutas_historico_desde() to service_role;
