export const LETTER_FAMILIES = ['flat-mdf','flat-acrylic','flat-pvc','galvanized-acrylic','galvanized-blind','backlit','acm','polymeric'];
export function createLetterProject(value={}) {
 const p={id:'letter-project',product:'letra-caixa',name:'Estudo de letra caixa',units:'mm',schemaVersion:1,revision:1,unit:'mm',text:{value:'ABC',font:'gentilis_regular',heightMm:200,widthMm:null,letterSpacingMm:10,lineSpacing:1.3,align:'left'},artwork:{mode:'text'},construction:{family:'flat-mdf',depthMm:60,faceClearanceMm:null,standoffMm:null,layers:[{material:'mdf',thickness:10,operation:'laser-co2'}]},materials:{front:{material:'acrylic',thickness:3,operation:'laser-co2'},side:{material:'galvanized',thickness:0.7,operation:'laser-fiber'},back:null},appearance:{front:'#eeeeee',side:'#888888',back:'#999999',wall:'#dddddd'}};
 return {...p,...value,artwork:{...p.artwork,...value.artwork},text:{...p.text,...value.text},construction:{...p.construction,...value.construction},materials:{...p.materials,...value.materials},appearance:{...p.appearance,...value.appearance}};
}

export function setLetterFamily(project,family){
 if(!LETTER_FAMILIES.includes(family))throw new TypeError('Família desconhecida.');
 const construction={...project.construction,family};let materials={...project.materials};
 if(family.startsWith('flat-')){const material=family.slice(5);construction.layers=[{material,thickness:material==='pvc'?10:material==='acrylic'?3:10,operation:material==='pvc'?'router':'laser-co2'}];}
 if(!family.startsWith('flat-')){
 const metal={material:'galvanized',thickness:0.7,operation:'laser-fiber'},acrylic={material:'acrylic',thickness:3,operation:'laser-co2'},pvc={material:'pvc',thickness:3,operation:'router'};
 if(family==='galvanized-acrylic')materials={...materials,front:acrylic,side:metal,back:pvc};
 if(family==='galvanized-blind')materials={...materials,front:{...metal},side:{...metal},back:pvc};
 if(family==='backlit')materials={...materials,front:{...metal},side:{...metal},back:{...acrylic,translucent:true}};
 if(family==='acm')materials={...materials,front:{material:'acm',thickness:3,operation:'router'},side:metal,back:pvc};
 if(family==='polymeric')materials={...materials,front:acrylic,side:{material:'polymeric',thickness:1,operation:'manual-cut'},back:pvc};
 }
 return {...project,construction,materials};
}
