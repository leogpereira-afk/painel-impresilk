-- Só relações explícitas. Não migra nem deduz vínculos de cadastros existentes.
create unique index if not exists painel_ramal_aparelho_unico
on public.painel_registros ((registro->>'aparelhoId'))
where colecao='patrimonio_controles' and registro->>'tipo'='ramais'
 and coalesce(registro->>'aparelhoId','')<>'';

-- Trava todos os caminhos de gravação/retirada, inclusive RPC e restauração.
create or replace function public.painel_ramal_conferir_vinculos()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v jsonb; campo text; destino text; ref text; anterior jsonb;
begin
 if not ((TG_OP<>'DELETE' and NEW.colecao='patrimonio_controles' and NEW.registro->>'tipo'='ramais')
   or (TG_OP<>'INSERT' and OLD.colecao in ('ativo','setores'))) then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('painel:equipamentos',0));
 if TG_OP<>'DELETE' and NEW.colecao='patrimonio_controles' and NEW.registro->>'tipo'='ramais' then
  select registro into v from public.painel_registros where colecao=NEW.colecao and id=NEW.id;
  if TG_OP='UPDATE' then anterior:=OLD.registro; end if;
  foreach campo in array array['setorId','aparelhoId'] loop
   ref:=v->>campo;
   destino:=case when campo='setorId' then 'setores' else 'ativo' end;
   if coalesce(ref,'')<>'' and (TG_OP='INSERT' or (anterior->>campo) is distinct from ref) then
    if not exists(select 1 from public.painel_registros where colecao=destino and id=ref
      and (campo='setorId' or (registro->>'tipo'='informatica' and registro->>'categoria'='Telefone'))) then
      raise exception using errcode='23503',message='Vínculo do ramal inválido: selecione setor e telefone cadastrados.';
    end if;
   end if;
  end loop;
 end if;
 if TG_OP<>'INSERT' and OLD.colecao in ('ativo','setores') then
  campo:=case when OLD.colecao='setores' then 'setorId' else 'aparelhoId' end;
  if exists(select 1 from public.painel_registros where colecao='patrimonio_controles'
     and registro->>'tipo'='ramais' and registro->>campo=OLD.id)
   and not exists(select 1 from public.painel_registros where colecao=OLD.colecao and id=OLD.id
     and (OLD.colecao='setores' or (registro->>'tipo'='informatica' and registro->>'categoria'='Telefone'))) then
    raise exception using errcode='23503',message='Desvincule o ramal antes de retirar o setor ou aparelho.';
  end if;
 end if;
 return null;
end $$;
revoke all on function public.painel_ramal_conferir_vinculos() from public,anon,authenticated;
drop trigger if exists painel_ramal_vinculos_integros on public.painel_registros;
create constraint trigger painel_ramal_vinculos_integros after insert or update or delete
 on public.painel_registros deferrable initially deferred for each row
 execute function public.painel_ramal_conferir_vinculos();

-- Um bem não pode receber dois vínculos diretos simultâneos. Usa o mesmo
-- lock da gravação atômica de equipamentos; não altera vínculos legados.
create or replace function public.painel_ativo_conferir_bem_direto()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_bem text; v jsonb;
begin
 if NEW.colecao<>'ativo' then return null; end if;
 if TG_OP='UPDATE' and NEW.registro->>'bemId' is not distinct from OLD.registro->>'bemId' then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended('painel:equipamentos',0));
 select registro into v from public.painel_registros where colecao='ativo' and id=NEW.id;
 v_bem:=v->>'bemId';
 -- A RPC confere esta constraint enquanto a cópia original ainda existe.
 -- Exceção somente para reinserção idêntica ao legado retirado (ausente,
 -- vazio ou null); não acrescenta bemId nem autoriza limpeza por UPDATE.
 if TG_OP='INSERT' and coalesce(v_bem,'')=''
  and exists(select 1 from public.painel_registros where colecao='ativo_lixeira' and id=NEW.id and registro-'_apagadoEm'=v)
  and (select count(*) from public.painel_registros where colecao='patrimonio' and registro->>'origemAtivoId'=NEW.id)=1
  and not exists(select 1 from public.painel_registros a join public.painel_registros b
    on b.colecao='patrimonio' and b.registro->>'origemAtivoId'=NEW.id and a.registro->>'bemId'=b.id
    where a.colecao='ativo' and a.id<>NEW.id) then
  return null;
 end if;
 if exists(select 1 from public.painel_registros where colecao='patrimonio' and registro->>'origemAtivoId'=NEW.id and id is distinct from nullif(v_bem,'')) then
  raise exception using errcode='23503',message='Confira o vínculo inverso no inventário antes de trocar ou limpar o bem.';
 end if;
 if coalesce(v_bem,'')='' then return null; end if;
 if not exists(select 1 from public.painel_registros where colecao='patrimonio' and id=v_bem)
 or exists(select 1 from public.painel_registros where colecao='ativo' and id<>NEW.id and registro->>'bemId'=v_bem)
 or exists(select 1 from public.painel_registros where colecao='patrimonio' and id=v_bem and coalesce(registro->>'origemAtivoId','') not in ('',NEW.id)) then
  raise exception using errcode='23503',message='Bem inexistente ou já vinculado a outro equipamento.';
 end if;
 return null;
end $$;
revoke all on function public.painel_ativo_conferir_bem_direto() from public,anon,authenticated;
drop trigger if exists painel_ativo_bem_direto_integro on public.painel_registros;
create constraint trigger painel_ativo_bem_direto_integro after insert or update
 on public.painel_registros deferrable initially deferred for each row
 execute function public.painel_ativo_conferir_bem_direto();
