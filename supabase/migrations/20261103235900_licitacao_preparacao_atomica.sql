-- Preparar uma participação é uma criação idempotente, nunca uma atualização.
-- Participar e Agendar validam a origem canônica antes de chamar esta RPC e
-- conferem a identidade retornada. Nenhuma proposta é enviada aqui.
create or replace function public.painel_licitacao_preparar(p_id text,p_registro jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_atual jsonb; v_salvo jsonb;
begin
 if p_id is null or p_id !~ '^lic-pesq-[a-f0-9]{64}$'
  or jsonb_typeof(p_registro) is distinct from 'object'
  or p_registro->>'id' is distinct from p_id
  or p_registro->>'tipo' is distinct from 'licitacao'
  or jsonb_typeof(p_registro->'origemPesquisa') is distinct from 'object'
  or jsonb_typeof(p_registro->'origemPesquisa'->'pendente') is distinct from 'boolean'
  or coalesce(p_registro->'origemPesquisa'->>'relatorioId','')=''
  or coalesce(p_registro->'origemPesquisa'->>'itemId','')=''
 then raise exception using errcode='23514',message='Preparação de licitação inválida.';
 end if;

 -- A ordem acompanha a gravação genérica: lock por ID antes do lock usado
 -- pelos triggers e pela retirada/restauração de ativos. Invertê-la poderia
 -- bloquear simultaneamente um agendamento manual para o mesmo ID.
 perform pg_advisory_xact_lock(hashtextextended('painel:ativo:'||p_id,0));
 perform pg_advisory_xact_lock(hashtextextended('painel:equipamentos',0));

 -- Conferir dentro da mesma transação fecha a janela entre o GET da Edge e
 -- o INSERT. Uma ficha retirada não volta a existir por uma resposta atrasada.
 if exists(select 1 from public.painel_registros where
   (colecao='ativo_lixeira' and id=p_id)
   or (colecao='registro_lixeira' and id='ativo:'||p_id)) then
  raise exception using errcode='40001',message='Este acompanhamento está na lixeira. Restaure a ficha existente antes de continuar.';
 end if;
 select registro into v_atual from public.painel_registros
  where colecao='ativo' and id=p_id for update;
 if found then
  if v_atual->>'tipo' is distinct from 'licitacao'
   or jsonb_typeof(v_atual->'origemPesquisa') is distinct from 'object' then
   raise exception using errcode='23505',message='Este identificador pertence a outro acompanhamento.';
  end if;
  return jsonb_build_object('item',v_atual,'repetido',true);
 end if;

 -- Reutiliza o CAS e suas proteções sem substituir histórico, anexos ou
 -- campos de uma ficha que tenha vencido a disputa por este identificador.
 v_salvo:=public.painel_registro_gravar('ativo',p_id,p_registro,null);
 return jsonb_build_object('item',v_salvo,'repetido',false);
end $$;

revoke all on function public.painel_licitacao_preparar(text,jsonb) from public,anon,authenticated;
grant execute on function public.painel_licitacao_preparar(text,jsonb) to service_role;
