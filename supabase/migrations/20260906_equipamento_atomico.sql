create or replace function public.painel_equipamento_gravar(p_id text,p_ativo jsonb,p_anterior jsonb,p_bem_id text,p_bem_patch jsonb,p_por text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_bem jsonb; v_novo jsonb; v_ativo jsonb; v_codigo text;
begin
 if p_ativo->>'tipo' not in ('veiculo','maquina','predial') then raise exception 'tipo inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('painel:equipamentos',0));
 v_ativo:=public.painel_registro_gravar('ativo',p_id,p_ativo,p_anterior);
 select registro into v_bem from public.painel_registros where colecao='patrimonio' and id=p_bem_id for update;
 v_novo:=coalesce(v_bem,'{}'::jsonb) || p_bem_patch || jsonb_build_object('origemAtivoId',p_id,'atualizadoEm',now(),'atualizadoPor',p_por);
 v_codigo:=coalesce(nullif(v_bem->>'codigo',''),public.patrimonio_proxima_etiqueta(coalesce(nullif(v_novo->>'setorSigla',''),'GER')));
 v_novo:=v_novo || jsonb_build_object('codigo',v_codigo,'historico',coalesce(v_bem->'historico','[]'::jsonb) || jsonb_build_array(jsonb_build_object('acao','sincronizado','por',p_por,'em',now())));
 insert into public.painel_registros(colecao,id,registro,atualizado_em) values('patrimonio',p_bem_id,v_novo,now()) on conflict(colecao,id) do update set registro=excluded.registro,atualizado_em=now();
 return jsonb_build_object('item',v_ativo,'bem',v_novo);
end $$;
create or replace function public.painel_ativo_retirar(p_id text,p_bem_id text default null,p_por text default '')
returns boolean language plpgsql security definer set search_path='' as $$
declare v_ativo jsonb; v_bem jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('painel:equipamentos',0));
 select registro into v_ativo from public.painel_registros where colecao='ativo' and id=p_id for update;
 if v_ativo is null then raise exception 'item não encontrado'; end if;
 if p_bem_id is not null then
   select registro into v_bem from public.painel_registros where colecao='patrimonio' and id=p_bem_id for update;
   if v_bem is null then raise exception 'Vínculo do Patrimônio não encontrado. Salve a ficha do equipamento antes de retirar.'; end if;
   update public.painel_registros set registro=registro || jsonb_build_object('situacao','baixado','baixadoEm',current_date,'baixaMotivo','Retirado em Manutenções','atualizadoPor',p_por),atualizado_em=now() where colecao='patrimonio' and id=p_bem_id;
 end if;
 insert into public.painel_registros(colecao,id,registro,atualizado_em) values('ativo_lixeira',p_id,v_ativo || jsonb_build_object('_apagadoEm',now()),now()) on conflict(colecao,id) do update set registro=excluded.registro,atualizado_em=now();
 insert into public.painel_registros(colecao,id,registro,atualizado_em) select 'arquivo_lixeira',id,registro,now() from public.painel_registros where colecao='arquivo' and id=p_id on conflict(colecao,id) do update set registro=excluded.registro,atualizado_em=now();
 delete from public.painel_registros where colecao in ('ativo','arquivo') and id=p_id;
 return true;
end $$;
revoke all on function public.painel_equipamento_gravar(text,jsonb,jsonb,text,jsonb,text),public.painel_ativo_retirar(text,text,text) from public,anon,authenticated;
grant execute on function public.painel_equipamento_gravar(text,jsonb,jsonb,text,jsonb,text),public.painel_ativo_retirar(text,text,text) to service_role;
