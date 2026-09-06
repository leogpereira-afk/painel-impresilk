-- Retirada reversível: o registro e seus anexos são preservados.
create or replace function public.painel_registro_retirar(p_colecao text,p_id text,p_por text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb;
begin
 if p_colecao='registro_lixeira' then raise exception 'Coleção reservada'; end if;
 perform pg_advisory_xact_lock(hashtextextended('painel:'||p_colecao||':'||p_id,0));
 select registro into r from public.painel_registros where colecao=p_colecao and id=p_id for update;
 if not found then return; end if;
 insert into public.painel_registros(colecao,id,registro,atualizado_em)
 values('registro_lixeira',p_colecao||':'||p_id,jsonb_build_object('colecao',p_colecao,'id',p_id,'registro',r,'retiradoEm',now(),'retiradoPor',p_por),now());
 delete from public.painel_registros where colecao=p_colecao and id=p_id;
end $$;
create or replace function public.painel_registro_recuperar(p_lixeira_id text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb;
begin
 select registro into r from public.painel_registros where colecao='registro_lixeira' and id=p_lixeira_id for update;
 if not found then raise exception 'Registro não encontrado na lixeira'; end if;
 if r->>'colecao'='registro_lixeira' then raise exception 'Referência inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended('painel:'||(r->>'colecao')||':'||(r->>'id'),0));
 if exists(select 1 from public.painel_registros where colecao=r->>'colecao' and id=r->>'id') then raise exception 'Já existe um registro com este identificador'; end if;
 insert into public.painel_registros(colecao,id,registro,atualizado_em) values(r->>'colecao',r->>'id',r->'registro',now());
 delete from public.painel_registros where colecao='registro_lixeira' and id=p_lixeira_id;
end $$;
revoke all on function public.painel_registro_retirar(text,text,text),public.painel_registro_recuperar(text) from public,anon,authenticated;
grant execute on function public.painel_registro_retirar(text,text,text),public.painel_registro_recuperar(text) to service_role;
