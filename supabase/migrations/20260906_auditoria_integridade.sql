-- Operações internas: chamadas somente pelas Edge Functions após autorização.
create or replace function public.painel_config_mesclar(p_patch jsonb, p_antes jsonb default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare atual jsonb; novo jsonb; k text; v jsonb; subk text;
begin
 if jsonb_typeof(p_patch) <> 'object' then raise exception 'Configuração inválida'; end if;
 perform pg_advisory_xact_lock(hashtextextended('painel:config',0));
 select coalesce(config,'{}') into atual from public.painel_config_global where id=true for update;
 atual:=coalesce(atual,'{}');
 if p_antes is not null then
  for k,v in select * from jsonb_each(p_patch) loop
   if k='parametros' then
    for subk in select jsonb_object_keys(v) loop
     if (atual->k->subk) is distinct from (p_antes->k->subk) then raise exception using errcode='40001',message='Configuração alterada por outra pessoa. Recarregue antes de salvar.'; end if;
    end loop;
   elsif (atual->k) is distinct from (p_antes->k) then raise exception using errcode='40001',message='Configuração alterada por outra pessoa. Recarregue antes de salvar.';
   end if;
  end loop;
 end if;
 novo:=atual||p_patch;
 if p_patch ? 'parametros' then
  if jsonb_typeof(p_patch->'parametros') <> 'object' then raise exception 'Parâmetros inválidos'; end if;
  novo:=jsonb_set(novo,'{parametros}',coalesce(atual->'parametros','{}')||(p_patch->'parametros'));
 end if;
 insert into public.painel_config_global(id,config,atualizado_em) values(true,novo,now())
 on conflict(id) do update set config=excluded.config,atualizado_em=excluded.atualizado_em;
 return novo;
end $$;

-- Compara a versão lida pela função antes de substituir um registro. Uma
-- gravação concorrente nunca desaparece silenciosamente, incluindo histórico.
create or replace function public.painel_registro_gravar(p_colecao text,p_id text,p_registro jsonb,p_anterior jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare atual jsonb;
begin
 if p_id='' or jsonb_typeof(p_registro)<>'object' then raise exception 'Registro inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('painel:'||p_colecao||':'||p_id,0));
 select registro into atual from public.painel_registros where colecao=p_colecao and id=p_id for update;
 if atual is distinct from p_anterior then
  if atual=p_registro then return atual; end if;
  raise exception using errcode='40001',message='Este registro foi alterado por outra pessoa. Recarregue antes de salvar.';
 end if;
 insert into public.painel_registros(colecao,id,registro,atualizado_em) values(p_colecao,p_id,p_registro,now())
 on conflict(colecao,id) do update set registro=excluded.registro,atualizado_em=excluded.atualizado_em;
 return p_registro;
end $$;

create or replace function public.painel_restaurar_atomico(p_backup jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r jsonb; t text; linhas jsonb; cols text; chaves text; atualizacoes text;
 gravou int:=0; contas int:=0; afetadas int; retornaram jsonb:='[]';
 tabelas constant text[]:=array['gestao_empresa','gestao_identidade','gestao_valor','gestao_plano_ano','gestao_objetivo','gestao_indicador','gestao_tatica','gestao_reuniao','gestao_decisao','gestao_ciclo_fechamento','gestao_preferencia_ui'];
begin
 if jsonb_typeof(p_backup)<>'object' or jsonb_typeof(p_backup->'registros')<>'array' or jsonb_typeof(p_backup->'contas')<>'array' then raise exception 'Backup inválido'; end if;
 perform pg_advisory_xact_lock(hashtextextended('painel:config',0));
 if p_backup->'config' is not null and p_backup->'config'<>'null'::jsonb then
  if jsonb_typeof(p_backup->'config')<>'object' then raise exception 'Configuração inválida'; end if;
  insert into public.painel_config_global(id,config,atualizado_em) values(true,p_backup->'config',now())
   on conflict(id) do update set config=excluded.config,atualizado_em=excluded.atualizado_em;
  gravou:=gravou+1;
 end if;
 foreach t in array tabelas loop
  linhas:=p_backup->'gestao'->t;
  if linhas is null or linhas='null'::jsonb then continue; end if;
  if jsonb_typeof(linhas)<>'array' then raise exception 'Tabela % inválida',t; end if;
  select string_agg(quote_ident(a.attname),',' order by a.attnum),string_agg(format('%I=excluded.%I',a.attname,a.attname),',' order by a.attnum)
   into cols,atualizacoes from pg_attribute a where a.attrelid=to_regclass('public.'||t) and a.attnum>0 and not a.attisdropped and a.attgenerated='';
  select string_agg(quote_ident(a.attname),',' order by a.attnum) into chaves from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid=to_regclass('public.'||t) and i.indisprimary;
  if cols is null or chaves is null then raise exception 'Tabela de recuperação indisponível: %',t; end if;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I,$1) on conflict (%s) do update set %s',t,cols,cols,t,chaves,atualizacoes) using linhas;
  get diagnostics afetadas=row_count; gravou:=gravou+afetadas;
 end loop;
 for r in select * from jsonb_array_elements(p_backup->'registros') loop
  if nullif(r->>'colecao','') is null or nullif(r->>'id','') is null or jsonb_typeof(r->'registro')<>'object' then raise exception 'Registro inválido no backup'; end if;
  insert into public.painel_registros(colecao,id,registro,atualizado_em) values(r->>'colecao',r->>'id',r->'registro',now())
   on conflict(colecao,id) do update set registro=excluded.registro,atualizado_em=excluded.atualizado_em;
  if not exists(select 1 from public.painel_registros where colecao=r->>'colecao' and id=r->>'id' and registro=r->'registro') then raise exception 'Verificação de registro falhou'; end if;
  gravou:=gravou+1;
 end loop;
 for r in select * from jsonb_array_elements(p_backup->'contas') loop
  if nullif(r->>'usuario','') is null or nullif(r->>'hash','') is null or nullif(r->>'salt','') is null then raise exception 'Conta inválida no backup'; end if;
  if not exists(select 1 from public.painel_contas where usuario=r->>'usuario') then retornaram:=retornaram||jsonb_build_array(coalesce(r->>'nome',r->>'usuario')); end if;
  insert into public.painel_contas(usuario,nome,permissoes,vendedor_id,hash,salt,iter,atualizado_em)
   values(r->>'usuario',r->>'nome',coalesce(r->'permissoes','[]'),coalesce(r->>'vendedorId',''),r->>'hash',r->>'salt',coalesce((r->>'iter')::int,120000),now())
   on conflict(usuario) do update set nome=excluded.nome,permissoes=excluded.permissoes,vendedor_id=excluded.vendedor_id,hash=excluded.hash,salt=excluded.salt,iter=excluded.iter,atualizado_em=excluded.atualizado_em;
  contas:=contas+1;
 end loop;
 return jsonb_build_object('gravou',gravou,'contas',contas,'ressuscitadas',retornaram,'verificado',true);
end $$;

revoke all on function public.painel_config_mesclar(jsonb,jsonb),public.painel_registro_gravar(text,text,jsonb,jsonb),public.painel_restaurar_atomico(jsonb) from public,anon,authenticated;
grant execute on function public.painel_config_mesclar(jsonb,jsonb),public.painel_registro_gravar(text,text,jsonb,jsonb),public.painel_restaurar_atomico(jsonb) to service_role;
-- Usadas pelas portas de entrada com chave de servidor, nunca pelo navegador.
revoke execute on function public.porta_registrar(text,text,text,text,text),public.porta_travada(text,text),public.painel_vendedores(),public.painel_ordens_cobertura() from public,anon,authenticated;
grant execute on function public.porta_registrar(text,text,text,text,text),public.porta_travada(text,text),public.painel_vendedores(),public.painel_ordens_cobertura() to service_role;
