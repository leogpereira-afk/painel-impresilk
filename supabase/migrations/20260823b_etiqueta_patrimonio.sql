-- A ETIQUETA DO PATRIMONIO NASCE NO BANCO, COM TRAVA.
--
-- Ela vira adesivo colado no bem: duplicada, o inventario aponta dois bens com
-- o mesmo codigo PARA SEMPRE -- reetiquetar e reconferir o galpao custa muito
-- mais que esta funcao. A geracao na Edge Function lia o maior numero e somava
-- 1 em dois passos: duas gravacoes simultaneas (dois computadores cadastrando)
-- liam o mesmo maior e saiam com a mesma etiqueta. O advisory lock por sigla
-- serializa exatamente o que precisa: quem gera GER espera o outro GER, e
-- SETORES diferentes nao se bloqueiam.
create or replace function public.patrimonio_proxima_etiqueta(p_sigla text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sigla text := upper(regexp_replace(coalesce(p_sigla, 'GER'), '[^A-Z0-9]', '', 'g'));
  v_maior integer := 0;
  v_num   integer;
  r       record;
begin
  if v_sigla = '' then v_sigla := 'GER'; end if;
  v_sigla := left(v_sigla, 4);

  -- Uma trava POR SIGLA, dentro da transacao (xact: solta sozinha no commit).
  perform pg_advisory_xact_lock(hashtext('etiqueta-' || v_sigla));

  for r in
    select registro->>'codigo' as codigo
      from public.painel_registros
     where colecao = 'patrimonio' and registro->>'codigo' like v_sigla || '-%'
  loop
    v_num := (regexp_match(r.codigo, '^' || v_sigla || '-(\d+)$'))[1]::integer;
    if v_num is not null and v_num > v_maior then v_maior := v_num; end if;
  end loop;

  return v_sigla || '-' || lpad((v_maior + 1)::text, 3, '0');
exception when others then
  -- Nunca devolver etiqueta ambigua: melhor o erro subir e a tela avisar do
  -- que um codigo "GER-001" repetido nascer de um fallback silencioso.
  raise;
end;
$$;

revoke all on function public.patrimonio_proxima_etiqueta(text) from public, anon, authenticated;
grant execute on function public.patrimonio_proxima_etiqueta(text) to service_role;
