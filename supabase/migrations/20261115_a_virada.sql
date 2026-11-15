-- Ciclo privado de 90 dias. A Edge Function usa o crachá próprio do Painel.
-- Não contém participantes reais, PDIs, fotos ou avaliações.
create table if not exists public.virada_ciclos (
  id uuid primary key,
  ativo boolean not null default true,
  versao bigint not null check (versao > 0),
  registro jsonb not null,
  atualizado_em timestamptz not null default now(),
  constraint virada_ciclo_formato check ((
    jsonb_typeof(registro) = 'object'
    and registro->>'id' = id::text
    and (registro->>'versao')::bigint = versao
    and (registro->>'dias')::int = 90
    and jsonb_typeof(registro->'participantes') = 'array'
    and jsonb_typeof(registro->'missoes') = 'array'
    and jsonb_typeof(registro->'mural') = 'array'
    and jsonb_typeof(registro->'historico') = 'array'
    and octet_length(registro::text) <= 3145728
  ) is true)
);
create unique index if not exists virada_um_ciclo_ativo on public.virada_ciclos (ativo) where ativo;
alter table public.virada_ciclos enable row level security;
revoke all on public.virada_ciclos from public, anon, authenticated;
grant select, insert, update on public.virada_ciclos to service_role;

create or replace function public.virada_ciclo_gravar(p_id uuid, p_versao bigint, p_registro jsonb)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare atual public.virada_ciclos%rowtype;
begin
  if p_versao is null or p_versao < 0 or p_registro is null
     or p_registro->>'id' is distinct from p_id::text
     or (p_registro->>'versao')::bigint is distinct from p_versao + 1
     or (p_registro->>'dias')::integer is distinct from 90 then
    raise exception using errcode = '22023', message = 'Ciclo inválido.';
  end if;
  select * into atual from public.virada_ciclos where id = p_id for update;
  if not found then
    if p_versao <> 0 then
      raise exception using errcode = '40001', message = 'O ciclo mudou. Atualize os dados.';
    end if;
    insert into public.virada_ciclos (id, versao, registro) values (p_id, 1, p_registro);
    return;
  end if;
  if not atual.ativo or atual.versao <> p_versao then
    raise exception using errcode = '40001', message = 'O ciclo mudou. Atualize os dados.';
  end if;
  update public.virada_ciclos set versao = p_versao + 1, registro = p_registro, atualizado_em = now() where id = p_id;
end;
$$;
revoke all on function public.virada_ciclo_gravar(uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.virada_ciclo_gravar(uuid, bigint, jsonb) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('virada-evidencias', 'virada-evidencias', false, 6291456, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
-- A restrição também vence eventual policy ampla já existente em outros módulos.
-- Não concede acesso a outros buckets: ainda exige suas próprias policies permissivas.
drop policy if exists virada_evidencias_somente_servidor on storage.objects;
create policy virada_evidencias_somente_servidor on storage.objects
  as restrictive for all to anon, authenticated
  using (bucket_id <> 'virada-evidencias')
  with check (bucket_id <> 'virada-evidencias');
-- Service role grava/consulta; somente a função emite URL curta após autorizar.
