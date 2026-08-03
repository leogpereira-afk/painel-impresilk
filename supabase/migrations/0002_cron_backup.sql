-- ============================================================================
-- Backup diario do Hub, agendado no banco.
--
-- No Netlify o gatilho era piggyback no login, porque o cron de la ja congelou
-- 11 horas sem ninguem perceber. O pg_cron deste projeto tem execucao
-- comprovada (Brief 07:00, PCP :20), entao o agendamento volta a ser o caminho
-- normal. A acao "auto" mantem a trava de 20h: rodar de novo no dia nao repete.
--
-- 08:40 UTC = 05:40 de Brasilia: depois da recarga completa do cache (06:00
-- UTC) e fora dos minutos usados pelos outros jobs.
--
-- SEGREDO NAO ENTRA AQUI (03/08/2026)
-- Este arquivo ja teve o PAINEL_TOKEN escrito por extenso, e este repositorio e
-- PUBLICO -- o arquivo abria em raw.githubusercontent.com sem login nenhum.
-- O token continua no historico do git, entao tirar daqui NAO basta: ele
-- precisa ser GIRADO. O valor vive so dentro do banco, no Vault do Supabase, e
-- o job le de la na hora de rodar.
--
-- Para criar/atualizar o segredo (SQL Editor do Supabase, uma vez):
--   select vault.create_secret('<token-novo>', 'painel_token');
--   -- se ja existir:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'painel_token'), '<token-novo>');
-- E lembrar de por o MESMO valor na variavel PAINEL_TOKEN das Edge Functions.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists supabase_vault;

select cron.unschedule('painel-backup-diario')
where exists (select 1 from cron.job where jobname = 'painel-backup-diario');

select cron.schedule(
  'painel-backup-diario',
  '40 8 * * *',
  $job$
  select net.http_post(
    url     := 'https://heveemylixartyijxewh.supabase.co/functions/v1/painel-backup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- lido do Vault na hora de rodar: nunca fica escrito no repositorio
      'x-token', (select decrypted_secret from vault.decrypted_secrets where name = 'painel_token')
    ),
    body    := '{"action":"auto"}'::jsonb
  );
  $job$
);
