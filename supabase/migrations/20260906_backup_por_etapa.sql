-- O backup continua diário para cada sistema. O agendador retoma uma unidade
-- pendente a cada cinco minutos; quando todas as cópias do dia estão prontas,
-- a função apenas confere o estado. Não altera tokens ou registros de negócio.
do $$
declare tarefa bigint;
begin
 select jobid into tarefa from cron.job where jobname='painel-backup-diario';
 if tarefa is null then raise exception 'Agendamento de backup não encontrado'; end if;
 perform cron.alter_job(tarefa,schedule:='*/5 * * * *');
end $$;
