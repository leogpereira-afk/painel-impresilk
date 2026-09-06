create table if not exists public.painel_senha_operacao(usuario text primary key, operacao uuid not null, inicio timestamptz not null default now());
alter table public.painel_senha_operacao enable row level security;
revoke all on public.painel_senha_operacao from public,anon,authenticated;
grant all on public.painel_senha_operacao to service_role;
create or replace function public.painel_senha_reservar(p_usuario text,p_operacao uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 insert into public.painel_senha_operacao(usuario,operacao,inicio) values(p_usuario,p_operacao,now())
 on conflict(usuario) do update set operacao=excluded.operacao,inicio=now() where painel_senha_operacao.inicio<now()-interval '5 minutes';
 return found;
end $$;
create or replace function public.painel_senha_sincronizar(p_usuario text,p_conta jsonb,p_hash jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if nullif(p_hash->>'hash','') is null or nullif(p_hash->>'salt','') is null or (p_hash->>'iter')::integer<100000 then raise exception 'hash inválido'; end if;
 insert into public.painel_contas(usuario,nome,permissoes,vendedor_id,hash,salt,iter,atualizado_em)
 values(p_usuario,p_conta->>'nome',p_conta->'permissoes',coalesce(p_conta->>'vendedor_id',''),p_hash->>'hash',p_hash->>'salt',(p_hash->>'iter')::integer,now())
 on conflict(usuario) do update set hash=excluded.hash,salt=excluded.salt,iter=excluded.iter,atualizado_em=now();
 update public.equipe_contas set hash=p_hash->>'hash',salt=p_hash->>'salt',iter=(p_hash->>'iter')::integer,trocar_senha=false,atualizado_em=now() where usuario=p_usuario;
 select id into v_id from public.acesso_conta where usuario=p_usuario;
 if v_id is not null then
   delete from public.acesso_senha_legado where conta_id=v_id;
   insert into public.acesso_senha_legado(conta_id,origem,hash,salt,iter) values(v_id,'propria',p_hash->>'hash',p_hash->>'salt',(p_hash->>'iter')::integer);
 end if;
 return true;
end $$;
revoke all on function public.painel_senha_reservar(text,uuid),public.painel_senha_sincronizar(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.painel_senha_reservar(text,uuid),public.painel_senha_sincronizar(text,jsonb,jsonb) to service_role;
