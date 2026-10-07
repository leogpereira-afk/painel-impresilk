import {SETORES_REUNIAO} from '../../supabase/functions/_shared/reunioes.mjs';
const CP={'–':150,'—':151,'‘':145,'’':146,'“':147,'”':148,'…':133,'•':149};
const win=s=>String(s??'').replace(/[^\x20-\x7e\xa0-\xff]/g,c=>CP[c]?String.fromCharCode(CP[c]):' ');
const esc=s=>win(s).replace(/([\\()])/g,'\\$1');
const largura=s=>[...s].reduce((n,c)=>n+(/[MW@%]/.test(c)?1.9:/[A-ZÀ-Ý]/.test(c)?1.5:/[iljtI .,;:'!|]/.test(c)?0.6:1.2),0);
function linhas(s,max){
 const out=[];
 for(const par of String(s||'').split('\n')){
  let linha='';
  for(const palavra of par.split(/\s+/).filter(Boolean)){
   if(largura(palavra)>max){if(linha){out.push(linha);linha='';}let pedaco='';for(const c of palavra){if(largura(pedaco+c)>max){out.push(pedaco);pedaco='';}pedaco+=c;}linha=pedaco;continue;}
   if(largura((linha+' '+palavra).trim())>max){out.push(linha);linha=palavra;}else linha=(linha+' '+palavra).trim();
  }
  if(linha)out.push(linha);
 }
 return out;
}
export function participantesPdf(r,modo='presentes'){
 if(!['presentes','assinaturas'].includes(modo))throw new Error('Escolha o tipo de lista.');
 return (r.participantes||[]).filter(p=>modo==='assinaturas'||p.presenca==='presente').slice().sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
}
// PDF A4 real, paginado. Nenhuma presença ou assinatura é inferida pela emissão.
export function gerarPdfPresenca(r,modo='presentes'){
 const pessoas=participantesPdf(r,modo);
 if(!pessoas.length)throw new Error(modo==='presentes'?'Marque os presentes antes de gerar este PDF.':'Inclua participantes antes de gerar a lista.');
 const paginas=[];let commands=[],y=0;
 const text=(s,x,yy,size=10,bold=false)=>{commands.push(`BT /${bold?'FB':'FN'} ${size} Tf 0.09 0.14 0.23 rg 1 0 0 1 ${x} ${yy} Tm (${esc(s)}) Tj ET`);};
 const line=(x1,y1,x2,y2)=>commands.push(`0.78 0.81 0.86 RG 0.5 w ${x1} ${y1} m ${x2} ${y2} l S`);
 const nova=()=>{
  if(commands.length)paginas.push(commands.join('\n'));
  commands=[];y=786;text('IMPRESILK',40,y,16,true);text(modo==='presentes'?'LISTA DE PRESENÇA':'LISTA PARA ASSINATURAS',315,y,12,true);
  commands.push('0.29 0.27 0.9 rg 40 768 515 3 re f');y=746;
  for(const s of linhas(r.titulo,64)){text(s,40,y,14,true);y-=18;}
  const dia=String(r.data||'').split('-').reverse().join('/');
  text(`${dia}  |  ${r.inicio} às ${r.fim}  |  ${SETORES_REUNIAO[r.setor]||'Outros setores'}`,40,y-7);y-=26;
  for(const s of linhas('Local: '+(r.local||'A combinar'),90)){text(s,40,y);y-=13;}
  for(const s of linhas('Responsável: '+r.responsavel,90)){text(s,40,y);y-=13;}
  y-=8;text(modo==='presentes'?`${pessoas.length} participante(s) com presença registrada.`:'Convidados relacionados abaixo. A emissão não confirma presença.',40,y,9);y-=24;
  text('NOME / SETOR / CARGO',49,y,9,true);text('ASSINATURA',378,y,9,true);y-=10;line(40,y,555,y);
 };
 nova();
 for(const [i,p] of pessoas.entries()){
  const nome=linhas(`${i+1}. ${p.nome}`,43),info=linhas([p.area,p.cargo].filter(Boolean).join(' · ')||'Participante externo / sem vínculo RH',52);
  const h=Math.max(62,20+nome.length*13+info.length*11+(p.rhId?10:0));
  if(y-h<92)nova();
  let yy=y-18;for(const s of nome){text(s,49,yy,10,true);yy-=13;}for(const s of info){text(s,49,yy,8);yy-=11;}
  if(p.rhId)text('ID RH: '+p.rhId,49,yy,7);
  line(365,y-h+21,543,y-h+21);line(40,y-h,555,y-h);y-=h;
 }
 paginas.push(commands.join('\n'));
 const objetos=[],push=s=>{objetos.push(s);return objetos.length;};
 const catalogo=push(''),pages=push(''),normal=push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),bold=push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
 const ids=[];
 paginas.forEach((fluxo,i)=>{
  const rodape=`BT /FN 8 Tf 0.35 0.39 0.46 rg 1 0 0 1 40 53 Tm (${esc('Encontro: '+r.id.slice(0,60))}) Tj 1 0 0 1 470 53 Tm (${i+1} / ${paginas.length}) Tj ET`;
  const conteudo=fluxo+'\n'+rodape,idConteudo=push(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
  ids.push(push(`<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /FN ${normal} 0 R /FB ${bold} 0 R >> >> /Contents ${idConteudo} 0 R >>`));
 });
 objetos[catalogo-1]=`<< /Type /Catalog /Pages ${pages} 0 R >>`;objetos[pages-1]=`<< /Type /Pages /Kids [${ids.map(id=>id+' 0 R').join(' ')}] /Count ${ids.length} >>`;
 let pdf='%PDF-1.4\n',offsets=[];objetos.forEach((s,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${s}\nendobj\n`;});
 const xref=pdf.length;pdf+=`xref\n0 ${objetos.length+1}\n0000000000 65535 f \n`+offsets.map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
 pdf+=`trailer\n<< /Size ${objetos.length+1} /Root ${catalogo} 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new Blob([Uint8Array.from(pdf,c=>c.charCodeAt(0)&255)],{type:'application/pdf'});
}
export function baixarPdfPresenca(r,modo){
 const blob=gerarPdfPresenca(r,modo),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=`Impresilk-${modo}-${r.data}-${String(r.titulo).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').slice(0,65)}.pdf`;
 document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
