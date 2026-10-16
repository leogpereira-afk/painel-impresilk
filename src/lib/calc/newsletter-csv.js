import { separarRegistros, escolherSeparador, normalizarNome } from './marketing-csv.js';
import { prepararNewsletter } from '../../../supabase/functions/_shared/newsletter.mjs';
export function lerContatosNewsletter(texto, listas = []) {
 const limpo=String(texto).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 const {registros,aspasAbertasEm}=separarRegistros(limpo,escolherSeparador(limpo));
 if(aspasAbertasEm) throw Error(`Aspas abertas na linha ${aspasAbertasEm}.`);
 const [cab,...linhas]=registros.filter(r=>r.celulas.some(c=>c.trim()));
 if(!cab) throw Error('Arquivo vazio.');
 const campos=cab.celulas.map(normalizarNome);
 if(!campos.includes('email') && !campos.includes('e-mail')) throw Error('Inclua a coluna email. Colunas opcionais: nome, empresa.');
 if(new Set(campos).size!==campos.length) throw Error('Há colunas repetidas.');
 if(linhas.length>500) throw Error('Importe até 500 contatos por arquivo.');
 const vistos=new Set(),validos=[],erros=[];
 for(const r of linhas){try{
  if(r.celulas.length!==campos.length) throw Error('Quantidade de colunas diferente do cabeçalho.');
  const obj=Object.fromEntries(campos.map((c,i)=>[c,r.celulas[i]]));
  const dados=prepararNewsletter('contato',{nome:obj.nome,email:obj.email || obj['e-mail'],empresa:obj.empresa,listas,situacao:'pendente',origem:'Importação de planilha'});
  if(vistos.has(dados.email)) throw Error('E-mail repetido no arquivo.');
  vistos.add(dados.email);validos.push({linha:r.linha,dados});
 }catch(e){erros.push({linha:r.linha,motivo:e.message});}}
 return {validos,erros};
}

export function lerEmailsColados(texto, listas = []) {
 const emails=String(texto).split(/[\s;,]+/).filter(Boolean);
 if(!emails.length) throw Error('Cole pelo menos um e-mail.');
 if(emails.length>500) throw Error('Adicione até 500 e-mails por vez.');
 const vistos=new Set(),validos=[],erros=[];
 emails.forEach((email,i)=>{try{
  const dados=prepararNewsletter('contato',{email,listas,situacao:'pendente',origem:'Lista de e-mails colada no painel'});
  if(vistos.has(dados.email))throw Error('E-mail repetido na lista.');
  vistos.add(dados.email);validos.push({linha:i+1,dados});
 }catch(e){erros.push({linha:i+1,motivo:e.message});}});
 return {validos,erros};
}
