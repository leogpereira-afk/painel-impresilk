import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstallation, validateInstallation, calculateInstallation, installationDecisionSignature, confirmInstallationDecision, installationSVG, installationReportHTML, isSafeInstallationPhoto } from './installation.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=';
function fixture() {
  const v=createInstallation();v.responsible='Equipe de exemplo';
  Object.assign(v.space,{label:'Local fictício',width:10000,height:4000,baseGround:0,substrate:'Substrato de exemplo a conferir'});
  Object.assign(v.plate,{width:4000,height:800,thickness:3,weight:14});
  Object.assign(v.environment,{terrain:'Condição registrada',access:'Acesso descrito',exposure:'Exposição registrada',duration:'Duração informada',twoHands:true});
  v.equipment=[{id:'equipment-example',type:'platform',characteristics:'Equipamento especificado pelo responsável',availability:'available',quantity:1,unit:'un',purpose:'Apoio da equipe'}];
  v.materials=[{id:'material-example',category:'fasteners',product:'Produto de exemplo',quantity:8,unit:'un',position:'Pontos previstos em detalhe',purpose:'Fixar suportes'}];
  v.preparation={surface:'Condição registrada',cleaning:'Preparo registrado',primer:'Consultar ficha',curing:'Conferir método',notes:''};
  return v;
}
const actor={responsible:'Responsável de exemplo',date:'2026-10-17'};
const confirmed=()=>['position','access','fixing'].reduce((v,key)=>confirmInstallationDecision(v,key,actor),fixture());

test('installation remains optional and its factory never assumes dimensions or zero ground',()=>{
 assert.deepEqual(validateInstallation(undefined),[]);assert.deepEqual(validateInstallation(null),[]);
 const v=createInstallation({front:{width:500,height:200},material:{thickness:3}});
 for(const key of ['width','height','baseGround'])assert.equal(v.space[key],null);
 for(const key of ['width','height','thickness','weight'])assert.equal(v.plate[key],null);
 const r=calculateInstallation(v);assert.equal(r.valid,true);assert.equal(r.geometryComplete,false);assert.equal(r.points.length,0);assert.ok(r.pending.some(x=>x.code==='SPACE_BASEGROUND'));assert.equal(r.geometry.topGround,null);assert.equal(r.releaseGranted,false);
 assert.match(installationSVG(v),/aguardando medidas/);assert.doesNotMatch(installationSVG(v),/data-plate="true"/);
});

test('ten by four metre space centered with four by point eight metre plate yields exact required margins and marks',()=>{
 const v=fixture(),r=calculateInstallation(v),g=r.geometry;
 assert.equal(g.left,3000);assert.equal(g.right,3000);assert.equal(g.above,1600);assert.equal(g.below,1600);assert.equal(g.bottomGround,1600);assert.equal(g.centerGround,2000);assert.equal(g.topGround,2400);
 assert.deepEqual(r.points.find(x=>x.id==='bottom-left'),{id:'bottom-left',label:'Canto inferior esquerdo',x:3000,yGround:1600});
 assert.equal(r.points.find(x=>x.id==='top-right').x,7000);assert.equal(r.points.find(x=>x.id==='top-right').yGround,2400);
 const svg=installationSVG(v);assert.match(svg,/data-space="true"[^>]*width="10000" height="4000"/);assert.match(svg,/data-plate="true"[^>]*width="4000" height="800"/);assert.match(svg,/data-proportional="true"/);
});

test('known relative margins remain computable while missing ground reference keeps all absolute heights unknown',()=>{
 const v=fixture();v.space.baseGround=null;
 const r=calculateInstallation(v);assert.equal(r.geometry.left,3000);assert.equal(r.geometry.above,1600);assert.equal(r.geometry.below,1600);
 for(const key of ['bottomGround','centerGround','topGround'])assert.equal(r.geometry[key],null);
 assert.equal(r.points.length,0);assert.equal(r.decisions.position.canConfirm,false);
 v.space.baseGround=300;const g=calculateInstallation(v).geometry;assert.equal(g.bottomGround,1900);assert.equal(g.topGround,2700);
});

test('manual position uses bottom height above ground, not an offset from the space base',()=>{
 const v=fixture();v.space.baseGround=300;v.position={mode:'manual',left:1000,bottomGround:2000};
 const g=calculateInstallation(v).geometry;assert.equal(g.left,1000);assert.equal(g.right,5000);assert.equal(g.below,1700);assert.equal(g.above,1500);assert.equal(g.topGround,2800);
 v.position.bottomGround=null;const r=calculateInstallation(v);assert.equal(r.geometry.below,null);assert.equal(r.geometry.bottomGround,null);assert.ok(r.pending.some(x=>x.code==='POSITION_BOTTOM'));
});

test('out-of-space and below-ground values remain unmodified and disable nominal position confirmation',()=>{
 const v=fixture();v.position={mode:'manual',left:-500,bottomGround:-200};
 const before=JSON.stringify(v),r=calculateInstallation(v);assert.equal(JSON.stringify(v),before);assert.equal(r.geometry.left,-500);assert.equal(r.geometry.bottomGround,-200);assert.equal(r.geometry.below,-200);
 assert.ok(r.warnings.some(w=>w.code==='OUTSIDE_SPACE'));assert.ok(r.warnings.some(w=>w.code==='BELOW_GROUND'));assert.equal(r.decisions.position.canConfirm,false);assert.throws(()=>confirmInstallationDecision(v,'position',actor),/pendências/);
 assert.match(installationSVG(v),/data-plate="true" x="-500"/);
 v.position.mode='centered';v.plate.width=12000;const outside=calculateInstallation(v);assert.equal(outside.geometry.left,-1000);assert.equal(outside.geometry.right,-1000);
});

test('incomplete planning is pending whereas invalid numbers, dates, metadata and list limits are errors',()=>{
 const incomplete={version:1};assert.deepEqual(validateInstallation(incomplete),[]);assert.ok(calculateInstallation(incomplete).pending.length);
 for(const mutate of [v=>v.space.width=0,v=>v.space.height='4000',v=>v.plate.weight=-1,v=>v.plate.thickness=Infinity,v=>v.environment.twoHands='sim',v=>v.displayUnit='inch',v=>v.updatedAt='2026-02-31T00:00:00Z',v=>v.decisions.position.date='2026-02-31',v=>v.equipment=Array.from({length:81},()=>({})),v=>v.materials=[{width:-2}],v=>v.order={source:'unverified-api',id:'1'}]){
  const v=fixture();mutate(v);assert.ok(validateInstallation(v).length);assert.equal(calculateInstallation(v).valid,false);
 }
 const loop=fixture();loop.self=loop;assert.ok(validateInstallation(loop).some(e=>e.code==='INSTALLATION_JSON'));assert.equal(calculateInstallation(loop).valid,false);
 const v=fixture();v.space.label='x'.repeat(1001);assert.ok(validateInstallation(v).some(e=>e.code==='INSTALLATION_TEXT'));v.space.label='';v.environment.notes='x'.repeat(4000);assert.deepEqual(validateInstallation(v),[]);
});

test('photos accept bounded embedded PNG/JPEG and reject SVG, external URLs, malformed and excess images',()=>{
 assert.equal(isSafeInstallationPhoto(png),true);
 for(const dataUrl of ['https://example.com/local.jpg','data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,aGVsbG8=',png+'"',`data:image/png;base64,${'A'.repeat(500000)}`])assert.equal(isSafeInstallationPhoto(dataUrl),false);
 const v=fixture();v.photos=[{id:'photo',name:'Exemplo',dataUrl:png,note:'Imagem sintética de teste'}];assert.deepEqual(validateInstallation(v),[]);
 v.photos=Array.from({length:4},(_,i)=>({id:String(i),dataUrl:png}));assert.ok(validateInstallation(v).some(x=>x.code==='INSTALLATION_PHOTOS'));
 v.photos=[{dataUrl:'https://example.com/a.png'}];assert.ok(validateInstallation(v).some(x=>x.code==='INSTALLATION_PHOTO'));
 const huge=Buffer.from(png.split(',')[1],'base64');huge.writeUInt32BE(5000,16);assert.equal(isSafeInstallationPhoto(`data:image/png;base64,${huge.toString('base64')}`),false);
});

test('decisions require separate named/date confirmations and never grant execution release',()=>{
 let v=fixture();const original=JSON.stringify(v);
 assert.throws(()=>confirmInstallationDecision(v,'position',{responsible:'',date:actor.date}),/responsável/);assert.throws(()=>confirmInstallationDecision(v,'position',{...actor,date:'2026-02-31'}),/data válida/);
 const position=confirmInstallationDecision(v,'position',actor);assert.equal(JSON.stringify(v),original);assert.equal(calculateInstallation(position).decisions.position.current,true);assert.equal(calculateInstallation(position).decisions.access.current,false);
 v=confirmed();const r=calculateInstallation(v);assert.equal(r.planningComplete,true);assert.equal(r.ready,false);assert.equal(r.releaseGranted,false);
 for(const kind of ['position','access','fixing'])assert.equal(r.decisions[kind].current,true);
 const altered=structuredClone(v);altered.plate.weight=null;assert.equal(calculateInstallation(altered).decisions.access.current,false);assert.equal(calculateInstallation(altered).decisions.fixing.current,false);assert.equal(calculateInstallation(altered).decisions.position.current,true);
});

test('relevant inputs invalidate only their scopes, while display unit/time do not restore or revoke decisions',()=>{
 const v=confirmed(),signature=installationDecisionSignature(v,'position');
 const display=structuredClone(v);display.displayUnit='cm';display.updatedAt='2026-10-18T14:00:00.000Z';display.position.left=999; // unused while centered
 assert.equal(installationDecisionSignature(display,'position'),signature);assert.equal(calculateInstallation(display).decisions.position.current,true);
 const access=structuredClone(v);access.equipment[0].availability='rent';let r=calculateInstallation(access);assert.equal(r.decisions.position.current,true);assert.equal(r.decisions.access.current,false);assert.equal(r.decisions.fixing.current,true);
 const fixing=structuredClone(v);fixing.materials[0].product='Outro produto';r=calculateInstallation(fixing);assert.equal(r.decisions.position.current,true);assert.equal(r.decisions.access.current,true);assert.equal(r.decisions.fixing.current,false);assert.equal(r.decisions.fixing.status,'stale');
 const moved=structuredClone(v);moved.plate.width=3900;r=calculateInstallation(moved);for(const kind of ['position','access','fixing'])assert.equal(r.decisions[kind].current,false);
});

test('changing order, location, photos or contextual observations invalidates all three confirmations',()=>{
 for(const mutate of [v=>v.order={source:'painel-os',id:'example-os',company:'Empresa fictícia'},v=>v.space.address='Outro endereço fictício',v=>v.space.reference='Outro ponto de referência',v=>v.photos=[{id:'photo',dataUrl:png,note:'Foto cadastrada'}],v=>v.environment.notes='Nova condição registrada']){
  const v=confirmed();mutate(v);const r=calculateInstallation(v);for(const kind of ['position','access','fixing'])assert.equal(r.decisions[kind].current,false,kind);
 }
 const v=confirmed();v.order={source:'painel-os',id:'example-a',company:'Empresa fictícia'};let current=['position','access','fixing'].reduce((p,k)=>confirmInstallationDecision(p,k,actor),v);current.order.id='example-b';for(const d of Object.values(calculateInstallation(current).decisions))assert.equal(d.current,false);
});

test('tape dimensions, preparation and cure remain distinct required planning inputs',()=>{
 const v=fixture();v.materials=[{id:'tape',category:'tape',quantity:3,unit:'rolo',product:'Produto de exemplo',position:'No suporte descrito',purpose:'Fixação'}];
 let r=calculateInstallation(v);for(const code of ['TAPE_WIDTH','TAPE_LENGTH','MATERIAL_PREPARATION','MATERIAL_CURE'])assert.ok(r.pending.some(p=>p.code===code),code);
 assert.equal(r.decisions.fixing.canConfirm,false);Object.assign(v.materials[0],{width:19,length:33000,preparation:'Conforme ficha cadastrada',cure:'Conforme ficha cadastrada'});r=calculateInstallation(v);assert.equal(r.decisions.fixing.canConfirm,true);
 v.equipment[0].availability='unknown';assert.equal(calculateInstallation(v).decisions.access.canConfirm,false);
});

test('printable installation sheet is self-contained, escaped, revision-bound and honest about missing facts',()=>{
 const v=fixture();v.plate.weight=null;v.photos=[{id:'photo',name:'<script>photo</script>',note:'" onload="alert(1)',dataUrl:png}];v.order={source:'painel-os',id:'synthetic-os',number:'EX-1',client:'<img src=x onerror=alert(1)>',company:'Empresa fictícia',linkedAt:'2026-10-17T12:00:00.000Z'};
 v.briefReference={id:'example-brief',label:'Briefing informado',source:'manual'};v.environment.notes='<svg onload="alert(1)">';
 const p={name:'<script>project</script>',revision:4,installation:v},before=JSON.stringify(p),html=installationReportHTML(p);
 assert.equal(JSON.stringify(p),before);assert.match(html,/default-src 'none'/);assert.match(html,/R4/);assert.match(html,/Não informado/);assert.match(html,/não concede liberação automática/);assert.match(html,/integração automática com o briefing não confirmada/);
 assert.match(html,/&lt;script&gt;project&lt;\/script&gt;/);assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);assert.doesNotMatch(html,/<script|<svg onload|src="https?:|<img src=x/);assert.ok(html.includes(`src="${png}"`));
 const complete=installationReportHTML({name:'Exemplo',revision:5,installation:confirmed()});assert.match(complete,/Confirmação nominal atual/);assert.match(complete,/não concede liberação automática/);
 assert.throws(()=>installationReportHTML({revision:1}),/Crie o planejamento/);assert.throws(()=>installationReportHTML({...p,revision:0}),/revisão válida/);
 const invalid=structuredClone(p);invalid.installation.photos[0].dataUrl='https://example.com/a.jpg';assert.throws(()=>installationReportHTML(invalid),/PNG\/JPEG/);
});

test('warnings, diagram and report follow selected m/cm units without changing stored geometry or signatures',()=>{
 const v=fixture();v.position={mode:'manual',left:-500,bottomGround:1600};
 assert.match(calculateInstallation(v).warnings[0].message,/0,5 m/);assert.match(installationSVG(v),/Esq\. -0,5 m/);assert.match(installationSVG(v),/Topo ao chão 2,4 m/);
 v.displayUnit='cm';assert.match(calculateInstallation(v).warnings[0].message,/50 cm/);assert.match(installationSVG(v),/Esq\. -50 cm/);assert.match(installationSVG(v),/Topo ao chão 240 cm/);assert.equal(calculateInstallation(v).geometry.left,-500);
 const html=installationReportHTML({name:'Exemplo',revision:1,installation:v});assert.match(html,/cotas em cm/);assert.match(html,/>240 cm<\/td>/);assert.match(html,/>0,3 cm<\/td>/);
 const empty=createInstallation();assert.ok(calculateInstallation(empty).pending.some(item=>item.message==='Informe o peso da placa.'));
});

test('list entry ids are nonempty unique strings so imports cannot make one UI edit mutate several rows',()=>{
 for(const field of ['equipment','materials','photos']){
  for(const items of [[{},{}],[{id:''}],[{id:' '}],[{id:'duplicate'},{id:'duplicate'}],[{id:7}]]){
   const v=fixture();v[field]=items;assert.ok(validateInstallation(v).some(error=>error.code===`INSTALLATION_${field==='photos'?'PHOTO_ID':'ITEM_ID'}`),`${field} ${JSON.stringify(items)}`);
  }
  const v=fixture();v[field]=[{id:'stable-one'},{id:'stable-two'}];assert.deepEqual(validateInstallation(v),[]); // Blank user content stays pending; structural identities exist.
 }
});
