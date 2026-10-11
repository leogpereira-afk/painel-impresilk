-- Sem upsert: um ID/arquivo ocupado nunca substitui o cadastro ativo.
-- Qualquer falha (inclusive trigger diferido) desfaz toda a restauração.
create or replace function public.painel_ativo_restaurar(p_id text,p_anterior jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare v jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('painel:equipamentos',0));
 select registro into v from public.painel_registros where colecao='ativo_lixeira' and id=p_id for update;
 if v is null or (p_anterior is not null and v is distinct from p_anterior) then
  raise exception using errcode='40001',message='A lixeira mudou. Atualize antes de restaurar.';
 end if;
 insert into public.painel_registros(colecao,id,registro,atualizado_em) values('ativo',p_id,v-'_apagadoEm',now());
 -- A guarda compara com a cópia bloqueada original antes de removê-la.
 -- Assim a exceção de legado não depende de marca enviada pelo cliente.
 set constraints public.painel_ativo_bem_direto_integro immediate;
 set constraints public.painel_ativo_bem_direto_integro deferred;
 insert into public.painel_registros(colecao,id,registro,atualizado_em)
  select 'arquivo',id,registro,now() from public.painel_registros where colecao='arquivo_lixeira' and id=p_id for update;
 delete from public.painel_registros where colecao in ('ativo_lixeira','arquivo_lixeira') and id=p_id;
 return true;
end $$;
revoke all on function public.painel_ativo_restaurar(text,jsonb) from public,anon,authenticated;
grant execute on function public.painel_ativo_restaurar(text,jsonb) to service_role;
