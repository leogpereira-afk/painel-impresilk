-- O VIGIA DE FRESCOR, fora do GitHub.
--
-- Todo o pipeline de carga pende de um unico fio: o cron do GitHub Actions.
-- Ele ja falhou em registrar, o GitHub desativa schedules apos ~60 dias sem
-- atividade no repo, e a casa ja viveu 2 SEMANAS de painel com dado velho
-- (PAINEL_TOKEN girado em 03/08, carga morta) sem ninguem perceber -- quando o
-- cron para, nao ha job, nao ha log, nao ha erro. So o status.em envelhecendo.
--
-- Este vigia roda NO SUPABASE (independente do GitHub) e escreve um diario que
-- qualquer investigacao abre primeiro: painel_cache.carga_alarme. SQL puro, de
-- proposito -- sem pg_net, sem http, sem timeout de 5s mascarando falha (a
-- armadilha ja paga em "pg_cron succeeded nao e entrega").
--
-- O que ele NAO faz: avisar por e-mail/Telegram. Nao ha canal configurado na
-- casa; quando houver, o lugar de disparar e AQUI, lendo este mesmo alarme.
create or replace function public.painel_vigiar_frescor()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_em    timestamptz;
  v_min   integer;
  v_atual jsonb;
begin
  select (valor->>'em')::timestamptz into v_em
    from public.painel_cache where chave = 'status';
  if v_em is null then
    v_min := null;      -- sem status nenhum: tambem e alarme
  else
    v_min := floor(extract(epoch from now() - v_em) / 60)::integer;
  end if;

  select valor into v_atual from public.painel_cache where chave = 'carga_alarme';

  if v_min is null or v_min > 90 then
    -- `desde` preserva o INICIO do alarme entre rodadas: "parado ha 6h" e
    -- informacao; um alarme que renasce a cada hora esconderia a duracao.
    insert into public.painel_cache (chave, valor)
    values ('carga_alarme', jsonb_build_object(
      'parado', true,
      'atrasoMin', v_min,
      'ultimaCarga', v_em,
      'desde', coalesce(
        case when (v_atual->>'parado')::boolean then v_atual->>'desde' end,
        to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
      'vistoEm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
    on conflict (chave) do update set valor = excluded.valor;
  elsif coalesce((v_atual->>'parado')::boolean, false) then
    -- A carga voltou: o alarme vira registro do episodio, nao some calado.
    insert into public.painel_cache (chave, valor)
    values ('carga_alarme', jsonb_build_object(
      'parado', false,
      'episodioAnterior', jsonb_build_object(
        'desde', v_atual->>'desde', 'ateMin', v_atual->>'atrasoMin',
        'normalizouEm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))))
    on conflict (chave) do update set valor = excluded.valor;
  end if;
end;
$$;

revoke all on function public.painel_vigiar_frescor() from public, anon, authenticated;

select cron.schedule('painel-vigia-frescor', '12 * * * *', 'select public.painel_vigiar_frescor()');
