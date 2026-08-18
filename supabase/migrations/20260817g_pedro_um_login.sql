begin;
-- UM LOGIN SO PARA O PEDRO HENRIQUE. Ele tinha `pedro` na conta e
-- `pedrohenrique` como apelido; decisao do Leonardo em 17/08/2026: fica um.
-- O apelido com sobrenome ganha porque ele mesmo escolheu assim quando desempatou
-- com o Pedro Ramos -- e porque `pedro` sozinho e justamente o nome que nao
-- distingue os dois.
update acesso_conta   set usuario = 'pedrohenrique', atualizado_em = now() where usuario = 'pedro';
update equipe_contas  set usuario = 'pedrohenrique', atualizado_em = now() where usuario = 'pedro';
update acesso_papel   set login   = 'pedrohenrique' where lower(login) = 'pedro';
-- Os espelhos do elenco. O `id` de cada linha NAO muda: e por ele que o Brief
-- liga a pessoa ao briefing, e trocar orfanaria os briefings dela.
update brief_config_global set config = jsonb_set(config, '{usuarios}', (
  select jsonb_agg(case when u->>'usuario' = 'pedro'
                        then u || '{"usuario":"pedrohenrique"}'::jsonb else u end order by ord)
    from jsonb_array_elements(config->'usuarios') with ordinality t(u, ord)
)), atualizado_em = now() where id = true;
update pcp_config_global set config = jsonb_set(config, '{usuarios}', (
  select jsonb_agg(case when u->>'usuario' = 'pedro'
                        then u || '{"usuario":"pedrohenrique","nome":"Pedro Henrique"}'::jsonb else u end order by ord)
    from jsonb_array_elements(config->'usuarios') with ordinality t(u, ord)
)), atualizado_em = now() where id = true;
commit;
