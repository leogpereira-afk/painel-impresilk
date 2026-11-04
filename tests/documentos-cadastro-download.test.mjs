import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';

test('download vinculado ao cadastro invalida autorização ao trocar sessão e desmontar',async()=>{
 let token='sessao-a',ouvinte,limpar,opcoes,terminar;
 const pendente=new Promise(resolve=>{terminar=resolve;});
 const codigo=readFileSync(new URL('../src/components/DocumentosCadastroLicitacoes.jsx',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
 const jsx=(type,props)=>({type,props});
 const contexto={module:{exports:{}},require:()=>({jsx,jsxs:jsx}),AbortController,
  useState:v=>[v,()=>{}],useRef:v=>({current:v}),useEffect:fn=>{limpar=fn();},
  aoMudarSessao:fn=>{ouvinte=fn;return()=>{ouvinte=null;};},getToken:()=>token,
  Download:()=>null,situacaoArquivoLicitacoes:()=>({rotulo:'Em dia'}),
  baixarDocumento:async(_d,_v,_a,o)=>{opcoes=o;await pendente;},
 };
 vm.runInNewContext(transformSync(codigo,{loader:'jsx',format:'cjs',jsx:'automatic'}).code,contexto);
 const arvore=contexto.module.exports.default({documentos:[{id:'doc-ficticio',nome:'Documento fictício',temArquivo:true,validade:'2027-01-01'}],hoje:'2026-11-04'});
 function localizar(no){if(!no||typeof no!=='object')return; if(no.type==='button')return no;for(const v of Object.values(no)){const r=localizar(v);if(r)return r;}}
 const envio=localizar(arvore).props.onClick();
 assert.equal(opcoes.podeAbrirArquivo(),true);
 token='sessao-b';assert.equal(opcoes.podeAbrirArquivo(),false);
 ouvinte();assert.equal(opcoes.signal.aborted,true);
 terminar();await envio;limpar();assert.equal(ouvinte,null);
});
