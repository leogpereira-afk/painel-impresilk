import {useEffect,useState} from 'react';
import {listarPessoasReunioes} from '../../services/reunioes.js';

export const identificarPessoa=p=>/^\d{6}$/.test(String(p?.idPessoa??''))?`ID ${p.idPessoa}`:p?.rhId||p?.id?`Ficha RH ${p.rhId||p.id}`:'Sem vínculo RH';
const normalizar=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export const filtrarPessoas=(pessoas,busca='',area='')=>pessoas.filter(p=>(!area||p.area===area)&&normalizar([p.nome,p.idPessoa,p.rhId||p.id,p.cargo,p.area].join(' ')).includes(normalizar(busca)));
export function usePessoasReunioes(catalogo){
 const [pessoas,setPessoas]=useState([]),[carregando,setCarregando]=useState(!catalogo),[erro,setErro]=useState(''),[tentativa,setTentativa]=useState(0);
 useEffect(()=>{if(catalogo)return;let vivo=true;setCarregando(true);setErro('');listarPessoasReunioes().then(p=>{if(vivo)setPessoas(p);}).catch(e=>{if(vivo)setErro(e.message);}).finally(()=>{if(vivo)setCarregando(false);});return()=>{vivo=false;};},[catalogo,tentativa]);
 return catalogo||{pessoas,carregando,erro,carregar:()=>setTentativa(n=>n+1)};
}
