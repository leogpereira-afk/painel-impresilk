import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';

function montar(arquivo,extras={}){
 const fonte=readFileSync(new URL('../src/'+arquivo,import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
 const estados=[],efeitos=[];let cursor=0;
 const ctx={module:{exports:{}},React:{createElement:(type,props,...children)=>({type,props:{...props,children}})},useState:inicial=>{const i=cursor++;if(!(i in estados))estados[i]=typeof inicial==='function'?inicial():inicial;return[estados[i],v=>{estados[i]=typeof v==='function'?v(estados[i]):v}]},useEffect:fn=>efeitos.push(fn),localStorage:{getItem:()=>null,setItem(){},removeItem(){}},logoColor:'logo',logoWhite:'logo',Silk:'Silk',LogIn:'LogIn',User:'User',Eye:'Eye',EyeOff:'EyeOff',AlertTriangle:'AlertTriangle',motivoSaida:()=>'',...extras};
 const js=transformSync(fonte,{loader:'jsx',format:'cjs',define:{'import.meta.env.MODE':'"production"'}}).code;
 vm.runInNewContext(js,ctx);return{render(props={}){cursor=0;return ctx.module.exports.default(props)},effects(){for(const f of efeitos.splice(0))f()}};
}
function nos(n){return Array.isArray(n)?n.flatMap(nos):n&&typeof n==='object'?[n,...nos(n.props?.children)]:[];}
function texto(n){return Array.isArray(n)?n.map(texto).join(''):n&&typeof n==='object'?texto(n.props?.children):typeof n==='string'?n:'';}

test('Login mostra erro de armazenamento e reabilita Entrar sem chamar a abertura do painel',async()=>{
 let abriu=0;const a=montar('pages/Login.jsx',{login:async()=>{throw Error('Não consegui guardar sua sessão neste navegador.')}});
 const props={aoEntrar:()=>abriu++};const formulario=nos(a.render(props)).find(n=>n.type==='form');
 const envio=formulario.props.onSubmit({preventDefault(){}});
 let arvore=a.render(props);assert.equal(nos(arvore).find(n=>n.type==='button'&&n.props.type==='submit').props.disabled,true);
 await envio;arvore=a.render(props);
 assert.equal(abriu,0);assert.match(texto(nos(arvore).find(n=>n.props.role==='alert')),/guardar sua sessão/);
 assert.equal(nos(arvore).find(n=>n.type==='button'&&n.props.type==='submit').props.disabled,false);
});

test('Login confirmado abre o painel mesmo se lembrar usuário não puder ser salvo',async()=>{
 const s={usuario:'pessoa-teste'};let recebido;
 const a=montar('pages/Login.jsx',{login:async()=>s,localStorage:{getItem:()=> 'pessoa-teste',setItem(){throw Error('quota')},removeItem(){throw Error('quota')}}});
 const props={aoEntrar:v=>{recebido=v}};await nos(a.render(props)).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(recebido,s);assert.equal(nos(a.render(props)).some(n=>n.props.role==='alert'),false);
});

test('Layout avisa sessão nesta aba e não cai ao ler ou guardar tema com armazenamento bloqueado',()=>{
 const a=montar('components/Layout.jsx',{CentralShell:'CentralShell',AvisoReunioes:'AvisoReunioes',Moon:'Moon',Sun:'Sun',Clock:'Clock',RefreshCw:'RefreshCw',useLocation:()=>({pathname:'/'}),useApp:()=>({modoDemo:false,fontesQueFalharam:[]}),frescor:()=>null,podeAbrir:()=>false,sair(){},window:{matchMedia:()=>({matches:false}),scrollTo(){}},document:{documentElement:{classList:{toggle(){}}}},setInterval:()=>1,clearInterval(){},localStorage:{getItem(){throw Error('bloqueado')},setItem(){throw Error('quota')}}});
 const tree=a.render({sessao:{usuario:'pessoa-teste',somenteNestaAba:true}});
 assert.match(texto(nos(tree).find(n=>n.props.role==='status')),/Sessão mantida nesta aba/);
 assert.doesNotThrow(()=>a.effects());
});
