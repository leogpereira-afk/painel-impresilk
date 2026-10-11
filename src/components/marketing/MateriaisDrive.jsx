/* MATERIAIS E DRIVE: logomarcas e materiais de marca num lugar só, mais os
 * atalhos do Drive para o que é grande demais para morar aqui (o servidor
 * aceita ~3 MB por arquivo: logo cabe; vídeo de campanha, não).
 *
 * Até a etapa a2 este bloco ERA a página Marketing.jsx (aba "Materiais e
 * Drive"). Com o Centro de Comando ele virou o botão fixo do topo
 * (?v=materiais) e veio para cá INTEIRO, sem mudar o que faz: upload,
 * miniaturas, organização (categoria, situação, revisão) e atalhos do Drive.
 *
 * Reusa a infra dos Documentos (painel-ativos) com tipo "marketing": item +
 * arquivo. Os atalhos do Drive vivem no painel-config (chave "marketing") e
 * se editam em Configurações. Nada aqui depende do painel-marketing: se ele
 * cair, os materiais continuam abrindo.
 */
import { Link } from 'react-router-dom';
import { podeAbrir } from '../../lib/sessao.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Download, Trash2, Link as LinkIcon, ArrowUpRight, Image as ImageIcon, FileText } from 'lucide-react';
import { listarAtivos, salvarAtivo, removerAtivo, guardarArquivo, lerArquivo, arquivoParaBase64, abrirBase64 } from '../../services/ativos.js';
import { lerAtalhos } from '../../services/marketing.js';
import { Card, SectionTitle, Empty, Skeleton, ErroModulo } from '../ui.jsx';

const MAX_BYTES = 3 * 1024 * 1024; // o servidor barra ~4 MB de base64 (~3 MB reais)

const ehImagem = (nome) => /\.(png|jpe?g|gif|webp|svg)$/i.test(String(nome || ''));

// Encolhe uma imagem para uma data URL de ~200 px. É o que fica GRAVADO no
// registro do material: assim a lista de logomarcas não precisa baixar
// megabytes de PNG só para desenhar o quadradinho de 96 px do cartão.
// SVG não passa por canvas (é vetor, já é pequeno): vai inteiro.
async function miniaturaDe(file) {
  try {
    if (!file || !file.type?.startsWith('image/')) return '';
    if (/svg/i.test(file.type)) return '';
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, falha) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = falha;
        i.src = url;
      });
      const lado = 200;
      const escala = Math.min(1, lado / Math.max(img.width || lado, img.height || lado));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round((img.width || lado) * escala));
      c.height = Math.max(1, Math.round((img.height || lado) * escala));
      const ctx = c.getContext('2d');
      // Fundo branco: PNG com transparência vira preto no JPEG.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.72);
      return dataUrl.length > 40000 ? '' : dataUrl;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return ''; // miniatura é conforto: falhou, a tela cai no jeito antigo
  }
}

// podeGravar: falso para o papel "visualização" (a painel-ativos também
// recusa; aqui só some o botão que não ia funcionar).
export default function MateriaisDrive({ podeGravar = true }) {
  const [itens, setItens] = useState(null);
  const [atalhos, setAtalhos] = useState(null);
  const [materialForm, setMaterialForm] = useState(null);
  const [gravandoMaterial, setGravandoMaterial] = useState(false);
  const [buscaMaterial, setBuscaMaterial] = useState('');
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [tentativa, setTentativa] = useState(0);

  // miniaturas: id -> data URL (só para imagens, carregadas depois da lista)
  const [thumbs, setThumbs] = useState({});

  useEffect(() => {
    let vivo = true;
    setErro(null);
    Promise.all([listarAtivos(), lerAtalhos()])
      .then(([lista, mapa]) => {
        if (!vivo) return;
        setItens(lista.filter((x) => x.tipo === 'marketing'));
        setAtalhos(mapa);
      })
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  // Material cadastrado ANTES da miniatura gravada: baixa o arquivo uma única
  // vez, encolhe e GUARDA a miniatura no registro. Da próxima vez que alguém
  // abrir a aba, ela já vem na listagem e não há download nenhum. O material
  // novo nem passa por aqui (a miniatura nasce no envio).
  useEffect(() => {
    if (!itens) return;
    let vivo = true;
    (async () => {
      for (const it of itens) {
        if (!it.temArquivo || !ehImagem(it.arquivoNome)) continue;
        if (it.miniatura || thumbs[it.id]) continue;
        try {
          const r = await lerArquivo(it.id);
          if (!vivo) return;
          if (!r?.base64) continue;
          const dataUrl = `data:${r.mime || 'image/png'};base64,${r.base64}`;
          setThumbs((t) => ({ ...t, [it.id]: dataUrl }));
          // Reduz e persiste, para não repetir o download amanhã.
          const blob = await (await fetch(dataUrl)).blob();
          const mini = await miniaturaDe(new File([blob], it.arquivoNome, { type: blob.type }));
          if (!vivo || !mini || !podeGravar) continue;
          const salvo = await salvarAtivo({ id: it.id, tipo: it.tipo, nome: it.nome, miniatura: mini });
          if (!vivo) return;
          setItens((l) => (l || []).map((x) => (x.id === it.id ? { ...x, miniatura: salvo?.miniatura || mini } : x)));
        } catch {
          /* miniatura é conforto; o download continua disponível */
        }
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itens]);

  // ---- materiais (upload / baixar / remover)
  const inputArquivo = useRef(null);
  const [nomeNovo, setNomeNovo] = useState('');
  const [subindo, setSubindo] = useState(false);

  const enviar = useCallback(
    async (e) => {
      e.preventDefault();
      setAviso(null);
      const file = inputArquivo.current?.files?.[0];
      if (!file) return setAviso({ tom: 'erro', texto: 'Escolha o arquivo.' });
      if (file.size > MAX_BYTES) {
        return setAviso({
          tom: 'erro',
          texto: 'Arquivo acima de 3 MB. Coisas grandes vão para o Drive: use os atalhos ao lado.',
        });
      }
      setSubindo(true);
      try {
        const nome = nomeNovo.trim() || file.name.replace(/\.[^.]+$/, '');
        const item = await salvarAtivo({
          tipo: 'marketing',
          nome,
          arquivoNome: file.name,
          temArquivo: true,
          // Encolhida AQUI, uma vez, no envio. Antes a tela baixava o arquivo
          // inteiro de cada material toda vez que alguém abria a aba.
          miniatura: await miniaturaDe(file),
        });
        try {
          const base64 = await arquivoParaBase64(file);
          await guardarArquivo(item.id, base64, file.type, file.name);
        } catch (e) {
          // O item nasceu mas o arquivo não subiu: desfaz, senão fica um
          // cartão fantasma no próximo carregamento (e a retentativa criaria
          // outro).
          await removerAtivo(item.id).catch(() => {});
          throw new Error(`O arquivo não subiu (${e.message}). Nada foi guardado: tente de novo.`);
        }
        setItens((l) => [...(l || []), item]);
        setNomeNovo('');
        if (inputArquivo.current) inputArquivo.current.value = '';
        setAviso({ tom: 'ok', texto: `"${nome}" guardado.` });
      } catch (err) {
        setAviso({ tom: 'erro', texto: err.message });
      } finally {
        setSubindo(false);
      }
    },
    [nomeNovo]
  );

  const baixar = async (it) => {
    setAviso(null);
    try {
      const r = await lerArquivo(it.id);
      if (!r?.base64) throw new Error('Arquivo não encontrado no servidor.');
      abrirBase64(r.base64, r.mime, r.nome || it.arquivoNome);
    } catch (err) {
      setAviso({ tom: 'erro', texto: err.message });
    }
  };

  const remover = async (it) => {
    // A logo apagada num toque pode ser a única cópia em alta resolução.
    if (!window.confirm(`Apagar "${it.nome}"? O arquivo vai junto, sem volta.`)) return;
    setAviso(null);
    try {
      await removerAtivo(it.id);
      setItens((l) => (l || []).filter((x) => x.id !== it.id));
    } catch (err) {
      setAviso({ tom: 'erro', texto: err.message });
    }
  };

  async function salvarOrganizacao(e) {
    e.preventDefault();
    setGravandoMaterial(true);
    setAviso(null);
    try {
      const salvo = await salvarAtivo(materialForm);
      setItens((l) => l.map((i) => (i.id === salvo.id ? salvo : i)));
      setMaterialForm(null);
    } catch (err) {
      setAviso({ tom: 'erro', texto: err.message });
    } finally {
      setGravandoMaterial(false);
    }
  }

  if (erro) return <ErroModulo mensagem={erro} aoTentar={() => setTentativa((n) => n + 1)} />;
  if (itens === null || atalhos === null) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]" role="status" aria-label="Carregando materiais">
        <Skeleton className="h-64" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const listaAtalhos = Object.entries(atalhos)
    .filter(([, a]) => a.tipo !== 'acao')
    .map(([id, a]) => ({ id, ...a }))
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  const termo = buscaMaterial.toLocaleLowerCase('pt-BR');
  const filtrados = itens.filter((it) => `${it.nome} ${it.arquivoNome} ${it.categoria || ''}`.toLocaleLowerCase('pt-BR').includes(termo));

  return (
    <div className="space-y-5">
      {materialForm && podeGravar && (
        <Card>
          <SectionTitle titulo={`Organizar material · ${materialForm.nome}`} />
          <form className="space-y-4" onSubmit={salvarOrganizacao}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="label">
                Categoria
                <input
                  className="input"
                  placeholder="Ex.: Fachadas, Apresentações, Identidade visual"
                  value={materialForm.categoria || ''}
                  onChange={(e) => setMaterialForm((f) => ({ ...f, categoria: e.target.value }))}
                />
              </label>
              <label className="label">
                Situação
                <select className="input" value={materialForm.status || 'rascunho'} onChange={(e) => setMaterialForm((f) => ({ ...f, status: e.target.value }))}>
                  <option value="rascunho">A revisar</option>
                  <option value="aprovado">Aprovado para uso</option>
                  <option value="arquivado">Arquivado / versão antiga</option>
                </select>
              </label>
              <label className="label">
                Responsável pela revisão
                <input className="input" value={materialForm.responsavel || ''} onChange={(e) => setMaterialForm((f) => ({ ...f, responsavel: e.target.value }))} />
              </label>
              <label className="label">
                Próxima revisão
                <input className="input" type="date" value={materialForm.validade || ''} onChange={(e) => setMaterialForm((f) => ({ ...f, validade: e.target.value }))} />
              </label>
            </div>
            <button className="btn-primary" disabled={gravandoMaterial}>
              Salvar organização
            </button>{' '}
            <button type="button" className="btn-ghost" disabled={gravandoMaterial} onClick={() => setMaterialForm(null)}>
              Cancelar
            </button>
          </form>
        </Card>
      )}
      {aviso && (
        <p role={aviso.tom === 'ok' ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 text-sm ${aviso.tom === 'ok' ? 'bg-ok-50 text-ok-700' : 'bg-bad-50 text-bad-700'}`}>
          {aviso.texto}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Materiais */}
        <Card className="min-w-0">
          <SectionTitle titulo="Logomarcas e materiais" sub="Até 3 MB por arquivo: logos, papel timbrado, assinaturas de e-mail." />

          <label className="label mb-4">
            Buscar material
            <input type="search" className="input" value={buscaMaterial} onChange={(e) => setBuscaMaterial(e.target.value)} placeholder="Nome, arquivo ou categoria" />
          </label>
          {itens.length === 0 ? (
            <Empty>Nada guardado ainda. Suba a primeira logomarca abaixo.</Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtrados.map((it) => (
                <div key={it.id} className="overflow-hidden rounded-xl border" style={{ borderColor: 'var(--hairline)' }}>
                  <div className="grid h-28 place-items-center bg-slate-50 dark:bg-slate-800/40">
                    {it.miniatura || thumbs[it.id] ? (
                      <img src={it.miniatura || thumbs[it.id]} alt={it.nome} className="max-h-24 max-w-[85%] object-contain" />
                    ) : ehImagem(it.arquivoNome) ? (
                      <ImageIcon size={26} className="text-slate-300" />
                    ) : (
                      <FileText size={26} className="text-slate-300" />
                    )}
                  </div>
                  <div className="px-3 pt-3 text-xs text-slate-600">
                    {it.categoria || 'Sem categoria'} · {it.status === 'aprovado' ? 'Aprovado para uso' : it.status === 'arquivado' ? 'Versão antiga' : 'Revisão pendente'}
                  </div>
                  {podeGravar && (
                    <button className="btn-ghost mx-2 min-h-11" onClick={() => setMaterialForm({ ...it })}>
                      Organizar material
                    </button>
                  )}
                  <div className="flex items-center gap-1.5 p-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-sm font-medium text-slate-800">{it.nome}</span>
                      <span className="block truncate text-xs text-slate-400">{it.arquivoNome}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => baixar(it)}
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-brand"
                      title={`Baixar ${it.nome}`}
                      aria-label={`Baixar ${it.nome}`}
                    >
                      <Download size={15} />
                    </button>
                    {podeGravar && (
                      <button
                        type="button"
                        onClick={() => remover(it)}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-bad-50 hover:text-bad-700"
                        title={`Remover ${it.nome}`}
                        aria-label={`Remover ${it.nome}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {itens.length > 0 && filtrados.length === 0 && <p className="py-4 text-sm text-slate-500">Nenhum material com esse nome.</p>}

          {podeGravar && (
          <form onSubmit={enviar} className="mt-5 grid gap-3 border-t pt-4 sm:grid-cols-[1fr_auto_auto]" style={{ borderColor: 'var(--hairline)' }}>
            <input
              className="input"
              aria-label="Nome do material de marketing"
              placeholder="Nome (ex.: Logo horizontal fundo claro)"
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
            />
            <input
              ref={inputArquivo}
              aria-label="Arquivo do material de marketing"
              type="file"
              className="input file:mr-2 file:rounded file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs"
            />
            <button className="btn-primary" disabled={subindo}>
              <Upload size={15} strokeWidth={2.4} />
              {subindo ? 'Subindo...' : 'Guardar'}
            </button>
          </form>
          )}
        </Card>

        {/* Atalhos do Drive */}
        <Card className="h-fit min-w-0">
          <SectionTitle titulo="Atalhos do Drive" sub="Vídeos, campanhas e pastas grandes." />

          {listaAtalhos.length === 0 ? (
            <Empty>Nenhum atalho ainda.</Empty>
          ) : (
            <div className="space-y-1.5">
              {listaAtalhos.map((a) => (
                <div key={a.id} className="group flex items-center gap-1">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 font-display text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                  >
                    <LinkIcon size={14} className="shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate">{a.nome}</span>
                    <ArrowUpRight size={13} className="shrink-0 text-slate-300" />
                  </a>
                </div>
              ))}
            </div>
          )}

          {podeAbrir('marketing') && (
            <Link className="btn-outline mt-4" to="/configuracoes?secao=marketing">
              Configurar atalhos
            </Link>
          )}
        </Card>
      </div>
    </div>
  );
}
