-- Usa a credencial já configurada sem copiá-la para código ou logs.
do $$
declare origem text; comando text;
begin
 select command into origem from cron.job where jobname='painel-backup-diario';
 if origem is null or position('painel-backup' in origem)=0 or position('"auto"' in origem)=0 then raise exception 'Chamada interna de referência indisponível'; end if;
 comando:=replace(replace(origem,'painel-backup','painel-vigia'),'"auto"','"vigiar"');
 perform cron.schedule('painel-vigia-atualizacao','13,33,53 * * * *',comando);
end $$;
