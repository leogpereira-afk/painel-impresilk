// Dados inteiramente fictícios, exclusivos da simulação local. O handler é o
// mesmo do servidor; somente banco e armazenamento ficam nesta memória.
import { atenderDocumentos } from '../../supabase/functions/_shared/documentos-handler.mjs';
import { vencimentosDocumentos } from '../../supabase/functions/_shared/documentos-agenda.mjs';
const empresa = '73405710-78db-461b-9d33-37a228fd62c0';
const pessoa = '63405710-78db-461b-9d33-37a228fd62c0';
const pessoaRH = '43405710-78db-461b-9d33-37a228fd62c0';
const registro = (colecao, id, dados) => ({ colecao, id, registro: { id, atualizadoEm: '2026-10-01T12:00:00Z', ...dados } });
const pessoas = [{ id: pessoaRH, nome: 'Ana · pessoa fictícia', disponivel: true }];
const linhas = [
  registro('documentos_titulares', empresa, { tipo: 'empresa', nome: 'Empresa de demonstração' }),
  registro('documentos_titulares', pessoa, { tipo: 'pessoa', nome: pessoas[0].nome, pessoaId: pessoaRH }),
  registro('ativo', 'certidao-demo', { tipo: 'documento', nome: 'Certidão fiscal · exemplo', categoria: 'Certidão fiscal', titularId: empresa, emissao: '2026-01-01', validade: '2026-10-05', alertaDias: 30, estado: 'ativo', responsavelId: pessoaRH, responsavel: pessoas[0].nome, temArquivo: true, arquivoNome: 'certidao-exemplo.pdf' }),
  registro('ativo', 'crlv-demo', { tipo: 'documento', nome: 'CRLV · exemplo', categoria: 'CRLV / licenciamento', titularId: empresa, ativoIds: ['car-demo'], validade: '2026-12-31', alertaDias: 30, estado: 'ativo' }),
  registro('ativo', 'ipva-demo', { tipo: 'documento', nome: 'IPVA · exemplo', categoria: 'IPVA', titularId: empresa, ativoIds: ['car-demo'], validade: '2026-11-01', alertaDias: 30, estado: 'ativo', obrigacaoPagamento: 'Parcela de demonstração', pagamentoSituacao: 'pendente' }),
  registro('ativo', 'garantia-demo', { tipo: 'garantia', nome: 'Garantia da impressora · exemplo', categoria: 'Equipamento', titularId: empresa, ativoIds: ['maq-demo'], compra: '2026-01-10', emissao: '2026-01-10', validade: '', alertaDias: 30, estado: 'ativo', fornecedor: 'Fornecedor fictício', acionamentos: [] }),
  registro('ativo', 'seguro-demo', { tipo: 'seguro', nome: 'Seguro da frota · exemplo', categoria: 'Veículos / frota', titularId: empresa, ativoIds: ['car-demo', 'maq-demo'], seguradora: 'Seguradora fictícia', identificacao: 'EXEMPLO-01', emissao: '2026-11-01', validade: '2027-11-01', estado: 'ativo', alertaDias: 30, contato: { nome: 'Corretor fictício', email: 'corretor@example.com' }, valor: 1200, valorSegurado: 10000 }),
  registro('ativo', 'pessoal-demo', { tipo: 'documento', nome: 'Documento pessoal · exemplo', categoria: 'Documento pessoal', titularId: pessoa, validade: '2026-10-20', estado: 'ativo' }),
  registro('documentos_requisitos', 'requisito-demo', { titularId: empresa, categoria: 'Alvará de funcionamento', estabelecimento: 'Estabelecimento fictício', estado: 'aplicavel', documentoId: '' }),
  registro('arquivo', 'certidao-demo', { nome: 'certidao-exemplo.pdf', mime: 'application/pdf' }),
];
function pdfExemplo() {
  const texto = 'BT /F1 16 Tf 40 140 Td (Documento ficticio de demonstracao) Tj ET';
  const objetos = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>', `<< /Length ${texto.length} >>\nstream\n${texto}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n', offsets = [0];
  objetos.forEach((obj, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const inicio = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n => String(n).padStart(10,'0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${inicio}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
const arquivos = new Map([['certidao-demo', { bytes: pdfExemplo(), mime: 'application/pdf' }]]);
let fisicos;
function prepararFisicos(bens) {
  if (fisicos) return;
  fisicos = bens;
  for (const bem of bens) linhas.push({ colecao: 'ativo', id: bem.id, registro: bem });
}
function bancoMemoria() {
  return {
    from() {
      const filtros = []; let de = 0, ate = Infinity, insercao;
      const matches = r => filtros.every(([k,v]) => (k.startsWith('registro->>') ? r.registro[k.slice(11)] : r[k]) === v);
      const resultado = () => {
        if (insercao) {
          if (linhas.some(r => r.id === insercao.id && r.colecao === insercao.colecao)) return { data: null, error: { code: '23505', message: 'ID já cadastrado.' } };
          linhas.push(structuredClone(insercao)); insercao = undefined;
        }
        return { data: structuredClone(linhas.filter(matches).slice(de,ate+1)), error: null };
      };
      const q = {
        select() { return q; }, eq(k,v) { filtros.push([k,v]); return q; }, order() { return q; }, range(a,b) { de = a; ate = b; return q; },
        insert(r) { insercao = r; filtros.push(['colecao',r.colecao],['id',r.id]); return q; },
        async maybeSingle() { const r = resultado(); return { ...r, data: r.data?.[0] || null }; }, async single() { return q.maybeSingle(); },
        then(a,b) { return Promise.resolve(resultado()).then(a,b); },
      }; return q;
    },
    async rpc(nome,p) {
      const colecao = nome === 'painel_registro_gravar' ? p.p_colecao : nome === 'painel_ativo_restaurar' ? 'ativo_lixeira' : 'ativo';
      const anterior = linhas.find(r => r.colecao === colecao && r.id === p.p_id);
      if (JSON.stringify(anterior?.registro || null) !== JSON.stringify(p.p_anterior || null)) return { data: null, error: { code: '40001', message: 'O cadastro mudou. Atualize.' } };
      if (nome === 'painel_registro_gravar') { anterior.registro = structuredClone(p.p_registro); return { data: p.p_registro, error: null }; }
      if (nome === 'painel_documento_retirar') {
        linhas.push({ ...anterior, colecao: 'ativo_lixeira', registro: { ...anterior.registro, _apagadoEm: new Date().toISOString() } });
      } else if (nome === 'painel_ativo_restaurar') {
        if (linhas.some(r => r.colecao === 'ativo' && r.id === p.p_id)) return { data: null, error: { code: '23505', message: 'Cadastro já restaurado.' } };
        const restaurado = { ...anterior.registro }; delete restaurado._apagadoEm;
        linhas.push({ ...anterior, colecao: 'ativo', registro: restaurado });
      } else return { data: null, error: { message: 'Ação não implementada na simulação.' } };
      linhas.splice(linhas.indexOf(anterior),1); return { data: true, error: null };
    },
    storage: { from() { return {
      async upload(chave,bytes,opts) { if (arquivos.has(chave)) return { error: { message: 'Arquivo já cadastrado.' } }; arquivos.set(chave,{ bytes: new Uint8Array(bytes), mime: opts.contentType }); return { error: null }; },
      async download(chave) { const a = arquivos.get(chave); return { data: a ? new Blob([a.bytes],{type:a.mime}) : null, error: a ? null : {message:'Arquivo ausente na simulação.'} }; },
      async remove(chaves) { chaves.forEach(k => arquivos.delete(k)); return { error: null }; },
    }; } },
  };
}
const responder = (dados,status=200) => new Response(JSON.stringify(dados),{status,headers:{'Content-Type':'application/json'}});
const actions = new Set(['listarDocumentos','salvarControle','renovarControle','lerVersaoDocumento','removerControle','lixeiraDocumentos','restaurarControle','salvarTitular','salvarRequisito','previaDocumentos']);
export async function respostaDocumentos(corpo,sessao,bens) {
  if (!actions.has(corpo.action)) return null;
  prepararFisicos(bens);
  try {
    return await atenderDocumentos({ sb: bancoMemoria(), sessao, corpo, resposta: responder, quem: 'Conta de demonstração', pessoasRH: async () => structuredClone(pessoas), bytesParaB64: bytes => btoa(Array.from(new Uint8Array(bytes),b => String.fromCharCode(b)).join('')) });
  } catch (e) { return responder({ok:false,erro:e.message},e.status || 409); }
}
export function agendaDocumentosDemo(mes,sessao,bens) {
  prepararFisicos(bens);
  return vencimentosDocumentos(linhas.filter(r => r.colecao === 'ativo').map(r => r.registro),linhas.filter(r => r.colecao === 'documentos_titulares').map(r => r.registro),sessao,mes,bens);
}
