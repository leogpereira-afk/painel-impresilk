-- Acrescenta PDFs ao bucket já privado do programa; nenhum registro pessoal.
update storage.buckets
set public = false, allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf']
where id = 'virada-evidencias';
