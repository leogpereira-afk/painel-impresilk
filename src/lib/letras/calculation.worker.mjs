import {calculateLetters} from './engine.mjs';
import {nestLetters} from './nesting.mjs';
import {calculateLightLayout} from './light-layout.mjs';
import {calculateFabrication} from './fabrication.mjs';
self.onmessage=({data})=>{
 try {
  const result=calculateLetters(data.project);
  const fabrication=calculateFabrication(data.project,result);
  const lighting=calculateLightLayout(data.project,result);
  self.postMessage({id:data.id,result,fabrication,lighting,nesting:nestLetters(data.project,result,fabrication)});
 }catch(e){self.postMessage({id:data.id,error:e.message})}
};
