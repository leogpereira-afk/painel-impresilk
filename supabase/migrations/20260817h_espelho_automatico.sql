-- O ELENCO DE CADA APP SE ATUALIZA SOZINHO.
--
-- Ate 17/08/2026 a copia do elenco dentro de brief/pcp/compras so era refeita
-- quando alguem salvava uma conta PELA equipe-auth (`espelharElenco`). Qualquer
-- outro caminho deixava a copia para tras -- e hoje isso aconteceu duas vezes no
-- mesmo dia: ao renomear `pedro` para `pedrohenrique` eu tive de remendar as
-- duas configs a mao, e teria esquecido se nao estivesse conferindo.
--
-- Decisao do Leonardo: a tela de dentro mostra A MESMA COISA da Central, e mudou
-- em um mudou no outro automatico. No gatilho isso vale para QUEM ESCREVER --
-- a equipe-auth, um UPDATE direto, uma migracao futura.
--
-- O `id` de cada linha e PRESERVADO: e por ele que o Brief liga o designer ao
-- briefing, e troca-lo orfanaria os briefings da pessoa.
create or replace function public.espelhar_elenco()
returns trigger
language plpgsql
security definer
set search_path = public
as $tg$
declare
  v_sis  text := coalesce(new.sistema, old.sistema);
  v_tab  text := case v_sis when 'brief' then 'brief_config_global'
                            when 'pcp' then 'pcp_config_global'
                            when 'compras' then 'compras_config_global' end;
  v_novo jsonb;
begin
  if v_tab is null then return null; end if;   -- sistema sem elenco espelhado

  execute format($q$
    select coalesce(jsonb_agg(jsonb_build_object(
             'id',      coalesce(velho.u->>'id', 'u-' || substr(md5(random()::text||e.usuario), 1, 8)),
             'nome',    coalesce(nullif(e.nome,''), e.usuario),
             'usuario', e.usuario,
             'papel',   e.papel,
             'ativo',   e.ativo is not false
           ) order by e.usuario), '[]'::jsonb)
      from equipe_contas e
      left join lateral (
        select u from %I c, jsonb_array_elements(coalesce(c.config->'usuarios','[]'::jsonb)) u
         where c.id = true
           and lower(regexp_replace(coalesce(u->>'usuario', u->>'nome'),'\s+',' ','g'))
             = lower(regexp_replace(e.usuario,'\s+',' ','g'))
         limit 1
      ) velho on true
     where e.sistema = %L
  $q$, v_tab, v_sis) into v_novo;

  execute format(
    'update %I set config = jsonb_set(coalesce(config,''{}''::jsonb), ''{usuarios}'', $1), atualizado_em = now() where id = true',
    v_tab) using v_novo;

  return null;
exception when others then
  /* O ESPELHO NAO PODE DERRUBAR A ESCRITA. Cadastrar alguem tem de funcionar
     mesmo que a config esteja fora do ar -- e a proxima escrita conserta o
     espelho. Recusar aqui trocaria uma copia velha por um cadastro impossivel. */
  raise warning 'espelhar_elenco falhou para %: %', v_sis, sqlerrm;
  return null;
end;
$tg$;

drop trigger if exists espelhar_elenco_apos_conta on public.equipe_contas;
create trigger espelhar_elenco_apos_conta
after insert or update or delete on public.equipe_contas
for each row execute function public.espelhar_elenco();
