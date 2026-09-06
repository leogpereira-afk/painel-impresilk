create or replace function public.painel_registro_gravar(p_colecao text,p_id text,p_registro jsonb,p_anterior jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare atual jsonb;
begin
 if p_id='' or jsonb_typeof(p_registro)<>'object' then raise exception 'Registro inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('painel:'||p_colecao||':'||p_id,0));
 select registro into atual from public.painel_registros where colecao=p_colecao and id=p_id for update;
 if atual is null and exists(select 1 from public.painel_registros where colecao='registro_lixeira' and id=p_colecao||':'||p_id) then
  raise exception using errcode='40001',message='O registro foi retirado. Recupere-o na lixeira antes de editar.';
 end if;
 if atual is distinct from p_anterior then
  if atual=p_registro then return atual; end if;
  raise exception using errcode='40001',message='Este registro foi alterado por outra pessoa. Recarregue antes de salvar.';
 end if;
 insert into public.painel_registros(colecao,id,registro,atualizado_em) values(p_colecao,p_id,p_registro,now())
 on conflict(colecao,id) do update set registro=excluded.registro,atualizado_em=excluded.atualizado_em;
 return p_registro;
end $$;
