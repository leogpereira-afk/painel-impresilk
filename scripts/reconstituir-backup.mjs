// Uso: node scripts/reconstituir-backup.mjs /copia-do-repositorio/bosques/AAAA-MM-DD.json /pasta-privada/bosques.json
// Baixe o repositório privado completo antes de executar. Não registra conteúdo.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {reconstituirCopia} from '../supabase/functions/_shared/backup-partes.mjs';
const [origem,destino]=process.argv.slice(2);
if(!origem||!destino)throw new Error('Informe o manifesto e um arquivo novo para a cópia reconstruída.');
const manifesto=JSON.parse(await readFile(origem,'utf8'));
if(manifesto.versao!==4)throw new Error('Este comando é para cópias em partes, versão 4.');
const raiz=resolve(dirname(origem),'..');
const registros=await reconstituirCopia(manifesto,caminho=>readFile(resolve(raiz,caminho)));
const {partes,after,paginas,operacao,terminou,...cabecalho}=manifesto;
await writeFile(destino,JSON.stringify({...cabecalho,versao:3,registros}),{flag:'wx',mode:0o600});
console.log(`Cópia reconstruída: ${registros.length} registros e ${partes.length} partes conferidas. Nenhum banco foi alterado.`);
