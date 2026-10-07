-- Ações e configuração usam painel_registros: entram no backup já existente.
-- A fonte enriquecida guarda tipo/cliente no histórico, sem presumir dados ausentes.
alter table public.painel_ordens add column if not exists comercial jsonb;
create index if not exists painel_acoes_comercial_vendedor
 on public.painel_registros ((registro->>'vendedorId')) where colecao='comercial_acoes';
create or replace function public.painel_comercial_salvar_acao(p_id text,p_vendedor text,p_registro jsonb,p_versao integer,p_autor text,p_autorizados text[] default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare antigo jsonb; novo jsonb; v integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('comercial:'||p_id,0));
 select registro into antigo from public.painel_registros where colecao='comercial_acoes' and id=p_id for update;
 if found then
  if p_autorizados is not null and not ((antigo->>'vendedorId')=any(p_autorizados)) then raise exception 'Responsável fora do acesso'; end if;
  if p_versao is distinct from (antigo->>'versao')::integer then raise exception 'Conflito de versão'; end if;
  v:=(antigo->>'versao')::integer+1;
 else
  if p_versao is not null then raise exception 'Registro não encontrado'; end if;
  v:=1;
 end if;
 novo:=p_registro||jsonb_build_object('vendedorId',p_vendedor,'versao',v,'historico',coalesce(antigo->'historico','[]'::jsonb)||jsonb_build_array(jsonb_build_object('em',now(),'autor',p_autor,'anterior',antigo-'historico','descricao',p_registro->>'descricao','data',p_registro->>'data','status',p_registro->>'status')));
 insert into public.painel_registros(colecao,id,registro) values('comercial_acoes',p_id,novo)
 on conflict(colecao,id) do update set registro=excluded.registro,atualizado_em=now();
 return novo;
end $$;
revoke all on function public.painel_comercial_salvar_acao(text,text,jsonb,integer,text,text[]) from public,anon,authenticated;
grant execute on function public.painel_comercial_salvar_acao(text,text,jsonb,integer,text,text[]) to service_role;
