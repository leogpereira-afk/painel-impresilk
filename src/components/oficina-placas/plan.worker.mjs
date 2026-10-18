import {calculatePanelsPlan,simulatePanelsFill,applyPanelsFill} from '../../lib/oficina-placas/workflow.mjs';
self.onmessage=({data})=>{
 try{
  if(data.operation==='fill')self.postMessage({id:data.id,simulation:simulatePanelsFill(data.project,data.material,data.previous,data.options)});
  else if(data.operation==='apply-fill')self.postMessage({id:data.id,result:applyPanelsFill(data.project,data.material,data.previous,data.simulation)});
  else self.postMessage({id:data.id,plan:calculatePanelsPlan(data.project,data.material,data.previous)});
 }catch(error){self.postMessage({id:data.id,error:error.message});}
};
