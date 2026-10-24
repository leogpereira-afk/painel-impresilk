-- A LOGO DA CAMPANHA SAI DE DENTRO DO REGISTRO (24/10/2026, sugestão 4 aceita
-- pelo dono). Até aqui ela viajava em base64 dentro de `campanhas` em
-- painel_registros: cada gravação e cada leitura devolviam TODAS as campanhas
-- com todas as logos (até 200 mil caracteres cada). Agora o arquivo mora no
-- Storage e o registro guarda só a URL pública.
--
-- Bucket PÚBLICO de propósito: a logo de um evento não é dado sensível e a
-- tela a mostra em cada cartão como <img src> sem crachá. O painel-arquivos
-- continua privado (fotos de bens, documentos). Só a Edge Function escreve
-- aqui (service role); nenhuma policy de escrita para anon ou authenticated.
-- A cópia noturna (painel-backup) leva este bucket junto com o privado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('painel-publico', 'painel-publico', true, 300000, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
