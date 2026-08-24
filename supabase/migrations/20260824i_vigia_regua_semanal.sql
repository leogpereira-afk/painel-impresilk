-- O VIGIA APRENDE QUE historico_status E SEMANAL -- e passa a dizer a regua.
--
-- FALSO ALARME EM PRODUCAO (24/08, na Home do dono): "a fonte
-- historico_status nao e atualizada ha 31h -- o normal e a cada 20 minutos".
-- Dois erros meus na mesma frase: a fonte e SEMANAL (cron "0 8 * * 0", a
-- carga de domingo do historico de O.S. -- o passado nao muda), entao 31h e
-- o estado NORMAL de uma segunda-feira; e o texto da Home dizia "20 minutos"
-- para qualquer fonte, porque o alarme nao carregava a regua de cada uma.
--
-- Regua nova: 9 dias (semanal + folga para feriado/atraso do Actions). E as
-- fontes atrasadas descem como { chave: { min, limite } } -- a tela fala a
-- cadencia DA FONTE, nao uma generica.
create or replace function public.painel_vigiar_frescor()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual   jsonb;
  v_paradas jsonb;
  v_pior    integer;
  v_status  jsonb;
  v_degr    jsonb := null;
begin
  with regua(chave, limite_min) as (
    values ('status', 90), ('recebiveis', 90), ('pagar', 90), ('bancos', 90),
           ('orcamentos', 90), ('ordens', 90), ('dso_hist', 90),
           ('fluxo_mensal', 1800),
           -- Semanal (domingo 08:00 UTC): 9 dias de regua.
           ('historico_status', 12960)
  ),
  atraso as (
    select r.chave, r.limite_min,
           floor(extract(epoch from now() - c.atualizado_em) / 60)::integer as min
      from regua r left join public.painel_cache c on c.chave = r.chave
  )
  select jsonb_object_agg(chave, jsonb_build_object('min', min, 'limite', limite_min)),
         max(min)
    into v_paradas, v_pior
    from atraso where min is null or min > limite_min;

  select valor into v_status from public.painel_cache where chave = 'status';
  if coalesce((v_status->>'parcial')::boolean, false) then
    v_degr := jsonb_build_object('em', v_status->>'em',
                                 'fontes', coalesce(v_status->'fontesQueFalharam', '[]'::jsonb));
  end if;

  select valor into v_atual from public.painel_cache where chave = 'carga_alarme';

  if (v_paradas is not null and v_paradas <> '{}'::jsonb) or v_degr is not null then
    insert into public.painel_cache (chave, valor)
    values ('carga_alarme', jsonb_build_object(
      'parado', v_paradas is not null and v_paradas <> '{}'::jsonb,
      'atrasoMin', v_pior,
      'fontes', coalesce(v_paradas, '{}'::jsonb),
      'degradada', v_degr,
      'desde', coalesce(
        case when (v_atual->>'parado')::boolean or v_atual->'degradada' <> 'null'::jsonb
             then v_atual->>'desde' end,
        to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
      'vistoEm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
    on conflict (chave) do update set valor = excluded.valor;
  elsif (v_atual->>'parado')::boolean or coalesce(v_atual->'degradada', 'null'::jsonb) <> 'null'::jsonb then
    insert into public.painel_cache (chave, valor)
    values ('carga_alarme', jsonb_build_object(
      'parado', false,
      'voltouEm', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'ficouParadoDesde', v_atual->>'desde'))
    on conflict (chave) do update set valor = excluded.valor;
  end if;
end;
$$;
