-- Coleção tipada; nenhuma migração de registros existentes.
alter table public.painel_registros add constraint painel_infra_tipo_valido
 check (colecao<>'patrimonio_infra' or (id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 and registro->>'tipo' in ('contato','internet','plano-corporativo')));

-- A unicidade também vale quando duas pessoas criam o plano ao mesmo tempo.
create unique index painel_infra_plano_corporativo_unico
 on public.painel_registros ((registro->>'tipo'))
 where colecao='patrimonio_infra' and registro->>'tipo'='plano-corporativo';

create or replace function public.painel_infra_conferir_referencias()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb; anterior jsonb; ref text;
begin
 if not ((TG_OP<>'DELETE' and NEW.colecao in ('patrimonio_infra','patrimonio_controles','ativo'))
    or (TG_OP<>'INSERT' and OLD.colecao in ('patrimonio_infra','ativo','setores'))) then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('painel:equipamentos',0));
 -- Só relações novas ou alteradas são conferidas. Referências antigas já
 -- órfãs podem continuar na ficha enquanto outro dado é editado.
 if TG_OP<>'DELETE' then
  select registro into v from public.painel_registros where colecao=NEW.colecao and id=NEW.id;
  if TG_OP='UPDATE' then anterior:=OLD.registro; end if;
  if v is not null and NEW.colecao='patrimonio_infra' then
   if v->>'tipo' in ('internet','plano-corporativo') then
    ref:=case when v->>'tipo'='internet' then v->>'tecnicoId' else v->>'contatoId' end;
    if coalesce(ref,'')<>'' and (TG_OP='INSERT' or v->>'tipo' is distinct from anterior->>'tipo'
       or ref is distinct from (case when v->>'tipo'='internet' then anterior->>'tecnicoId' else anterior->>'contatoId' end))
       and not exists(select 1 from public.painel_registros where colecao='patrimonio_infra' and id=ref and registro->>'tipo'='contato') then
      raise exception using errcode='23503',message='Contato técnico ou comercial não cadastrado.';
    end if;
   end if;
  elsif v is not null and NEW.colecao='patrimonio_controles' and v->>'tipo' in ('ramais','celulares') then
   ref:=v->>'setorId';
   if coalesce(ref,'')<>'' and (TG_OP='INSERT' or v->>'tipo' is distinct from anterior->>'tipo' or ref is distinct from anterior->>'setorId')
      and not exists(select 1 from public.painel_registros where colecao='setores' and id=ref) then
    raise exception using errcode='23503',message='Setor da linha não cadastrado.';
   end if;
   if v->>'tipo'='celulares' then
    ref:=v->>'planoId';
    if coalesce(ref,'')<>'' and (TG_OP='INSERT' or v->>'tipo' is distinct from anterior->>'tipo' or ref is distinct from anterior->>'planoId')
       and not exists(select 1 from public.painel_registros where colecao='patrimonio_infra' and id=ref and registro->>'tipo'='plano-corporativo') then
      raise exception using errcode='23503',message='Plano corporativo da linha não cadastrado.';
    end if;
   end if;
  elsif v is not null and NEW.colecao='ativo' and v->>'tipo' in ('informatica','predial') then
   ref:=v #>> '{especificacao,tecnicoId}';
   if coalesce(ref,'')<>'' and (TG_OP='INSERT' or v->>'tipo' is distinct from anterior->>'tipo' or ref is distinct from anterior #>> '{especificacao,tecnicoId}')
      and not exists(select 1 from public.painel_registros where colecao='patrimonio_infra' and id=ref and registro->>'tipo'='contato') then
    raise exception using errcode='23503',message='Contato técnico da ficha não cadastrado.';
   end if;
   if v->>'categoria'='Usina fotovoltaica' and (TG_OP='INSERT' or v->>'categoria' is distinct from anterior->>'categoria'
      or v #> '{especificacao,unidadesConsumidoras}' is distinct from anterior #> '{especificacao,unidadesConsumidoras}') then
    if v #> '{especificacao,unidadesConsumidoras}' is not null
       and jsonb_typeof(v #> '{especificacao,unidadesConsumidoras}') <> 'array' then
      raise exception using errcode='23503',message='Unidades consumidoras inválidas.';
    end if;
    for ref in select jsonb_array_elements_text(coalesce(v #> '{especificacao,unidadesConsumidoras}','[]'::jsonb)) loop
      if not exists(select 1 from public.painel_registros where colecao='ativo' and id=ref
         and registro->>'tipo'='predial' and registro->>'categoria'='Padrão de energia'
         and coalesce(registro #>> '{especificacao,situacao}','')<>'baixado') then
        raise exception using errcode='23503',message='Padrão de energia da usina não cadastrado ou baixado.';
      end if;
    end loop;
   end if;
  end if;
 end if;
 -- Retirar ou descaracterizar um alvo em uso é sempre vedado. A condição
 -- verifica que o alvo era válido antes da operação, sem bloquear órfãos legados.
 if TG_OP<>'INSERT' and OLD.colecao='patrimonio_infra' and OLD.registro->>'tipo'='contato'
    and not exists(select 1 from public.painel_registros where colecao='patrimonio_infra' and id=OLD.id and registro->>'tipo'='contato') then
  if exists(select 1 from public.painel_registros where colecao='patrimonio_infra' and
    ((registro->>'tipo'='internet' and registro->>'tecnicoId'=OLD.id) or
     (registro->>'tipo'='plano-corporativo' and registro->>'contatoId'=OLD.id)))
    or exists(select 1 from public.painel_registros where colecao='ativo' and registro #>> '{especificacao,tecnicoId}'=OLD.id) then
   raise exception using errcode='23503',message='Contato técnico ou comercial ainda em uso.';
  end if;
 end if;
 if TG_OP<>'INSERT' and OLD.colecao='patrimonio_infra' and OLD.registro->>'tipo'='plano-corporativo'
    and not exists(select 1 from public.painel_registros where colecao='patrimonio_infra' and id=OLD.id and registro->>'tipo'='plano-corporativo')
    and exists(select 1 from public.painel_registros where colecao='patrimonio_controles' and registro->>'tipo'='celulares' and registro->>'planoId'=OLD.id) then
   raise exception using errcode='23503',message='Plano corporativo ainda em uso.';
 end if;
 if TG_OP<>'INSERT' and OLD.colecao='setores'
    and not exists(select 1 from public.painel_registros where colecao='setores' and id=OLD.id)
    and exists(select 1 from public.painel_registros where colecao='patrimonio_controles' and registro->>'tipo' in ('ramais','celulares') and registro->>'setorId'=OLD.id) then
   raise exception using errcode='23503',message='Setor da linha ainda em uso.';
 end if;
 if TG_OP<>'INSERT' and OLD.colecao='ativo' and OLD.registro->>'tipo'='predial'
    and OLD.registro->>'categoria'='Padrão de energia' and coalesce(OLD.registro #>> '{especificacao,situacao}','')<>'baixado'
    and not exists(select 1 from public.painel_registros where colecao='ativo' and id=OLD.id and registro->>'tipo'='predial'
      and registro->>'categoria'='Padrão de energia' and coalesce(registro #>> '{especificacao,situacao}','')<>'baixado')
    and exists(select 1 from public.painel_registros where colecao='ativo' and registro->>'tipo'='predial'
      and registro->>'categoria'='Usina fotovoltaica' and registro #> '{especificacao,unidadesConsumidoras}' @> to_jsonb(array[OLD.id])) then
   raise exception using errcode='23503',message='Padrão de energia ainda vinculado à usina.';
 end if;
 return null;
end $$;
revoke all on function public.painel_infra_conferir_referencias() from public,anon,authenticated;
drop trigger if exists painel_infra_referencias_integras on public.painel_registros;
create constraint trigger painel_infra_referencias_integras after insert or update or delete
 on public.painel_registros deferrable initially deferred for each row
 execute function public.painel_infra_conferir_referencias();
