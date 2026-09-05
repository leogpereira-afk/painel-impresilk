-- Consulta pontual: não transporta todos os cadastros para abrir uma ficha.
create or replace function public.painel_crm_cliente(p_id text)
returns jsonb
language sql stable security invoker
set search_path = public
as $$
 select jsonb_build_object('completo', valor->'completo', 'cliente', valor->'clientes'->p_id, 'atualizadoEm', atualizado_em)
 from public.painel_cache
 where chave='crm_clientes' and p_id ~ '^[1-9][0-9]{0,15}$'
$$;
revoke all on function public.painel_crm_cliente(text) from public, anon, authenticated;
grant execute on function public.painel_crm_cliente(text) to service_role;
