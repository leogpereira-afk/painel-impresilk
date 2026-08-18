-- A CONTAGEM DE VENDEDORES SEM PUXAR O CACHE INTEIRO.
--
-- A tela de Acessos oferece a lista de vendedores do ERP para amarrar a fila de
-- orcamentos de cada pessoa -- o nome tem de bater EXATO, entao ela nao pode
-- deixar digitar. Para montar essa lista, `listar` lia `painel_cache` inteiro:
-- 1,39 MB de orcamentos, a cada abertura da tela, para produzir 8 nomes e 8
-- numeros. Medido em 18/08/2026: 217 bytes fazem o mesmo trabalho.
--
-- A agregacao mora aqui porque o PostgREST nao agrega dentro de jsonb: pedir a
-- lista de fora obriga a trazer o array todo e contar no JavaScript.
create or replace function public.painel_vendedores()
returns table (vendedor text, orcamentos bigint)
language sql
stable
security definer
set search_path = public
as $fn$
  select x->>'vendedorId', count(*)
    from painel_cache, jsonb_array_elements(valor) x
   where chave = 'orcamentos'
     and coalesce(x->>'vendedorId', '') <> ''
   group by 1
   order by 2 desc;
$fn$;

revoke all on function public.painel_vendedores() from anon, authenticated;
