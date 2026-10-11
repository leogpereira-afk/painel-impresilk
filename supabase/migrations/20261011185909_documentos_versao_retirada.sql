-- Estrutura preparada localmente; não transforma controles ou vínculos antigos.
-- A retirada compara a mesma linha que será copiada para a recuperação.
create or replace function public.painel_documento_retirar(p_id text,p_anterior jsonb,p_por text default '')
returns boolean language plpgsql security definer set search_path='' as $$
declare atual jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('painel:equipamentos',0));
 select registro into atual from public.painel_registros where colecao='ativo' and id=p_id for update;
 if atual is null or atual is distinct from p_anterior then
  raise exception using errcode='40001',message='Este controle mudou. Recarregue antes de retirar.';
 end if;
 if atual->>'tipo' not in ('documento','seguro','garantia') then
  raise exception using errcode='23514',message='Documentos não retira bens físicos.';
 end if;
 return public.painel_ativo_retirar(p_id,null,p_por);
end $$;
revoke all on function public.painel_documento_retirar(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.painel_documento_retirar(text,jsonb,text) to service_role;
