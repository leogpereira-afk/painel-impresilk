-- Coordena cópias simultâneas e preserva o resultado já confirmado.
create or replace function public.painel_backup_reservar(p_operacao uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare estado jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('painel:backup',0));
 select valor into estado from public.painel_meta where chave='backup_operacao' for update;
 if estado is not null and (estado->>'inicio')::timestamptz > now()-interval '10 minutes' then return false; end if;
 insert into public.painel_meta(chave,valor,atualizado_em) values('backup_operacao',jsonb_build_object('operacao',p_operacao,'inicio',now()),now())
 on conflict(chave) do update set valor=excluded.valor,atualizado_em=excluded.atualizado_em;
 return true;
end $$;
create or replace function public.painel_backup_estado(p_patch jsonb)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare atual jsonb; novo jsonb;
begin
 if jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Estado inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('painel:backup:estado',0));
 select valor into atual from public.painel_meta where chave='backup_status' for update;
 atual:=coalesce(atual,'{}'); novo:=atual||p_patch;
 if p_patch ? 'sistemas' then novo:=jsonb_set(novo,'{sistemas}',coalesce(atual->'sistemas','{}')||(p_patch->'sistemas')); end if;
 insert into public.painel_meta(chave,valor,atualizado_em) values('backup_status',novo,now())
 on conflict(chave) do update set valor=excluded.valor,atualizado_em=excluded.atualizado_em;
end $$;
revoke all on function public.painel_backup_reservar(uuid),public.painel_backup_estado(jsonb) from public,anon,authenticated;
grant execute on function public.painel_backup_reservar(uuid),public.painel_backup_estado(jsonb) to service_role;
