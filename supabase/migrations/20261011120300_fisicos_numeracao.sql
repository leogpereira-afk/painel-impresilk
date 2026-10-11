-- Números físicos preenchidos são únicos enquanto os itens estão ativos.
-- Itens legados sem número continuam pendentes sem inventar numeração.
create unique index if not exists painel_fisico_numero_ativo_unico
on public.painel_registros ((registro->>'tipo'),
 (case when registro->>'categoria' in ('Câmera','Câmeras / CFTV') then 'Câmera' else registro->>'categoria' end),
 (registro #>> '{especificacao,numero}'))
where colecao='ativo'
 and ((registro->>'tipo'='seguranca' and registro->>'categoria' in ('Câmera','Câmeras / CFTV'))
  or (registro->>'tipo'='predial' and registro->>'categoria' in ('Extintor','Iluminação de emergência','Sinalização de segurança')))
 and coalesce(registro #>> '{especificacao,numero}','')<>''
 and coalesce(registro #>> '{especificacao,situacao}','')<>'baixado';

-- Um canal físico ativo pertence a uma câmera por gravador.
create unique index if not exists painel_camera_canal_ativo_unico
on public.painel_registros ((registro #>> '{especificacao,gravadorId}'),(registro #>> '{especificacao,canal}'))
where colecao='ativo' and registro->>'tipo'='seguranca'
 and registro->>'categoria' in ('Câmera','Câmeras / CFTV')
 and coalesce(registro #>> '{especificacao,gravadorId}','')<>''
 and coalesce(registro #>> '{especificacao,canal}','')<>''
 and coalesce(registro #>> '{especificacao,situacao}','')<>'baixado';
