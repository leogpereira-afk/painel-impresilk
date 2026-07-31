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
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('painel-backup-diario')
where exists (select 1 from cron.job where jobname = 'painel-backup-diario');

select cron.schedule(
  'painel-backup-diario',
  '40 8 * * *',
  $job$
  select net.http_post(
    url     := 'https://heveemylixartyijxewh.supabase.co/functions/v1/painel-backup',
    headers := '{"Content-Type":"application/json","x-token":"impresilk-bhinxmdp5b7dwgaxpv9u2xqh"}'::jsonb,
    body    := '{"action":"auto"}'::jsonb
  );
  $job$
);
