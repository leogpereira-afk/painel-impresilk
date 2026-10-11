-- Mantém identidade explícita e aceita as famílias adicionadas. Sem reclassificar registros.
create or replace function public.painel_equipamento_gravar(p_id text,p_ativo jsonb,p_anterior jsonb,p_bem_id text,p_bem_patch jsonb,p_por text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_bem jsonb; v_novo jsonb; v_ativo jsonb; v_codigo text;
begin
 if p_ativo->>'tipo' not in ('veiculo','maquina','predial','informatica','seguranca') then raise exception 'tipo inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('painel:equipamentos',0));
 if coalesce(p_bem_id,'')='' then raise exception 'ID do inventário obrigatório'; end if;
 if exists(select 1 from public.painel_registros where colecao='patrimonio' and registro->>'origemAtivoId'=p_id and id<>p_bem_id)
 or exists(select 1 from public.painel_registros where colecao='ativo' and id<>p_id and registro->>'bemId'=p_bem_id) then
  raise exception using errcode='23503',message='Vínculo de inventário já utilizado.';
 end if;
 select registro into v_bem from public.painel_registros where colecao='patrimonio' and id=p_bem_id for update;
 if coalesce(v_bem->>'origemAtivoId','')<>'' and v_bem->>'origemAtivoId'<>p_id then
  raise exception using errcode='23503',message='Bem já vinculado a outro equipamento.';
 end if;
 v_ativo:=public.painel_registro_gravar('ativo',p_id,p_ativo || jsonb_build_object('bemId',p_bem_id),p_anterior);
 v_novo:=coalesce(v_bem,'{}'::jsonb) || p_bem_patch || jsonb_build_object('origemAtivoId',p_id,'atualizadoEm',now(),'atualizadoPor',p_por);
 v_codigo:=coalesce(nullif(v_bem->>'codigo',''),public.patrimonio_proxima_etiqueta(coalesce(nullif(v_novo->>'setorSigla',''),'GER')));
 v_novo:=v_novo || jsonb_build_object('codigo',v_codigo,'historico',coalesce(v_bem->'historico','[]'::jsonb) || jsonb_build_array(jsonb_build_object('acao','sincronizado','por',p_por,'em',now())));
 insert into public.painel_registros(colecao,id,registro,atualizado_em) values('patrimonio',p_bem_id,v_novo,now()) on conflict(colecao,id) do update set registro=excluded.registro,atualizado_em=now();
 return jsonb_build_object('item',v_ativo,'bem',v_novo);
end $$;

revoke all on function public.painel_equipamento_gravar(text,jsonb,jsonb,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.painel_equipamento_gravar(text,jsonb,jsonb,text,jsonb,text) to service_role;
