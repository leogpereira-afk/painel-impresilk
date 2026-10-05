-- Números únicos dentro de cada aba, inclusive com gravações simultâneas.
-- 01 e 1 identificam o mesmo armário; ramal 1 e cama 1 são independentes.
create unique index if not exists painel_patrimonio_controle_numero_unico
on public.painel_registros ((registro->>'tipo'), (registro->>'numeroChave'))
where colecao = 'patrimonio_controles';

-- Confere o estado final da transação: uma transferência e a remoção do setor
-- usam o mesmo lock, inclusive quando vierem de caminhos diferentes (RPC,
-- recuperação da lixeira ou importação). O adiamento também permite restaurar
-- um backup cuja ordem dos registros coloque os bens antes dos setores.
create or replace function public.painel_patrimonio_conferir_setor()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_sigla text;
begin
 if TG_OP <> 'DELETE' and NEW.colecao = 'patrimonio' then
  -- Legados podem continuar sem setor válido enquanto outros campos mudam.
  if TG_OP = 'UPDATE' and OLD.colecao = 'patrimonio'
     and (OLD.registro->>'setorSigla') is not distinct from (NEW.registro->>'setorSigla') then
   return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('painel:patrimonio:vinculos-setor',0));
  select registro->>'setorSigla' into v_sigla from public.painel_registros
   where colecao='patrimonio' and id=NEW.id;
  -- Sem atribuição continua permitido para os cadastros e importações antigos.
  if coalesce(v_sigla,'') <> '' and not exists (
   select 1 from public.painel_registros where colecao='setores' and registro->>'sigla'=v_sigla
  ) then
   raise exception using errcode='23503',message='O setor selecionado não existe mais. Atualize a lista e escolha outro setor.';
  end if;
 end if;
 if TG_OP <> 'INSERT' and OLD.colecao = 'setores' then
  if TG_OP = 'UPDATE' and NEW.colecao = 'setores'
     and (OLD.registro->>'sigla') is not distinct from (NEW.registro->>'sigla') then
   return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('painel:patrimonio:vinculos-setor',0));
  v_sigla:=OLD.registro->>'sigla';
  if coalesce(v_sigla,'') <> '' and not exists (
   select 1 from public.painel_registros where colecao='setores' and registro->>'sigla'=v_sigla
  ) and exists (
   select 1 from public.painel_registros where colecao='patrimonio' and registro->>'setorSigla'=v_sigla
  ) then
   raise exception using errcode='23503',message='Transfira os bens vinculados antes de remover ou alterar a sigla deste setor.';
  end if;
 end if;
 return null;
end $$;
revoke all on function public.painel_patrimonio_conferir_setor() from public,anon,authenticated;
drop trigger if exists painel_patrimonio_setor_integro on public.painel_registros;
create constraint trigger painel_patrimonio_setor_integro
 after insert or update or delete on public.painel_registros
 deferrable initially deferred for each row
 execute function public.painel_patrimonio_conferir_setor();
