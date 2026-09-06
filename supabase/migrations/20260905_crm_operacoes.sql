-- Registro de envio antes da chamada externa. Uma resposta incerta nunca é reenviada.
create or replace function public.painel_crm_reservar(p_id text,p_dono text,p_registro jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare r jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('crm-operacao:'||p_id,0));
 select registro into r from painel_registros where colecao='crm_operacoes' and id=p_id for update;
 if found then
  if r->>'dono'<>p_dono then raise exception 'Operação de outra pessoa'; end if;
  if r->'pedido' is distinct from p_registro->'pedido' then raise exception 'Identificador usado para outra operação'; end if;
  return jsonb_build_object('nova',false,'registro',r);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('crm-card:'||coalesce(p_registro->>'cardId',p_id),0));
 if exists(select 1 from painel_registros where colecao='crm_operacoes' and registro->>'cardId'=p_registro->>'cardId' and registro->>'estado' in ('enviando','incerto')) then
  raise exception 'Existe envio pendente para esta oportunidade. Confira antes de continuar';
 end if;
 r=p_registro||jsonb_build_object('dono',p_dono,'estado','enviando','criadoEm',now());
 insert into painel_registros(colecao,id,registro,atualizado_em) values('crm_operacoes',p_id,r,now());
 return jsonb_build_object('nova',true,'registro',r);
end $$;
revoke all on function public.painel_crm_reservar(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.painel_crm_reservar(text,text,jsonb) to service_role;

-- Resultado e compromisso são confirmados na mesma transação local.
create or replace function public.painel_crm_finalizar(p_id text,p_estado text,p_resultado jsonb,p_compromisso jsonb default null)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare r jsonb;
begin
 if p_estado not in ('concluido','recusado','incerto') then raise exception 'Estado inválido'; end if;
 select registro into r from painel_registros where colecao='crm_operacoes' and id=p_id for update;
 if not found then raise exception 'Operação inexistente'; end if;
 if r->>'estado' not in ('enviando','incerto') then return r; end if;
 r=r||jsonb_build_object('estado',p_estado,'resultado',p_resultado,'atualizadoEm',now());
 update painel_registros set registro=r,atualizado_em=now() where colecao='crm_operacoes' and id=p_id;
 if p_estado='concluido' and p_compromisso is not null then
  insert into painel_registros(colecao,id,registro,atualizado_em)
  values('compromissos','crm-'||p_id,p_compromisso||jsonb_build_object('dono',r->>'dono','donoNome',r->>'donoNome','crmOperacao',p_id,'criadoEm',now()),now())
  on conflict(colecao,id) do nothing;
 end if;
 return r;
end $$;
revoke all on function public.painel_crm_finalizar(text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.painel_crm_finalizar(text,text,jsonb,jsonb) to service_role;
create index if not exists painel_crm_operacoes_dono on public.painel_registros((registro->>'dono'),atualizado_em desc) where colecao='crm_operacoes';

-- Conferência humana explícita; não reenvia nenhuma chamada ao ERP.
create or replace function public.painel_crm_resolver(p_id text,p_quem text,p_aplicado boolean,p_justificativa text)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare r jsonb;
begin
 select registro into r from painel_registros where colecao='crm_operacoes' and id=p_id for update;
 if not found or r->>'estado' not in ('enviando','incerto') or (r->>'criadoEm')::timestamptz > now()-interval '3 minutes' then raise exception 'Envio não conferível'; end if;
 if length(trim(p_justificativa))<20 or length(p_justificativa)>1000 then raise exception 'Descreva a conferência'; end if;
 return painel_crm_finalizar(p_id,case when p_aplicado then 'concluido' else 'recusado' end,jsonb_build_object('mensagem','Conferido manualmente pela direção','quem',p_quem,'justificativa',p_justificativa,'conferidoEm',now()),case when p_aplicado then nullif(r->'compromisso','null'::jsonb) else null end);
end $$;
revoke all on function public.painel_crm_resolver(text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.painel_crm_resolver(text,text,boolean,text) to service_role;

-- Documento vem do título autorizado, nunca de busca por nome de empresa.
create or replace function public.painel_crm_contato_cobranca(p_titulo text)
returns jsonb language plpgsql stable security invoker set search_path=public as $$
declare titulo jsonb; doc text; clientes jsonb; em timestamptz; encontrados jsonb;
begin
 select x into titulo from painel_cache c cross join lateral jsonb_array_elements(c.valor) x where c.chave='recebiveis' and x->>'id'=p_titulo limit 1;
 if titulo is null then return jsonb_build_object('estado','tituloNaoLocalizado'); end if;
 doc=regexp_replace(coalesce(titulo->>'cnpj',''),'[^0-9]','','g');
 if length(doc) not in (11,14) then return jsonb_build_object('estado','semDocumento'); end if;
 select valor->'clientes',atualizado_em into clientes,em from painel_cache where chave='crm_clientes' and valor->>'completo'='true';
 if clientes is null then return jsonb_build_object('estado','indisponivel'); end if;
 select jsonb_agg(value) into encontrados from jsonb_each(clientes) where value->>'documento'=doc;
 if coalesce(jsonb_array_length(encontrados),0)<>1 then return jsonb_build_object('estado',case when encontrados is null then 'naoLocalizado' else 'ambiguo' end); end if;
 return jsonb_build_object('estado','encontrado','cliente',jsonb_build_object('id',encontrados->0->>'id','nome',encontrados->0->>'nome','telefone',encontrados->0->>'telefone','email',encontrados->0->>'email','contatos',encontrados->0->'contatos'),'atualizadoEm',em);
end $$;
revoke all on function public.painel_crm_contato_cobranca(text) from public,anon,authenticated;
grant execute on function public.painel_crm_contato_cobranca(text) to service_role;
