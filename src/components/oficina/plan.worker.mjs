import {calculateWorkshopPlan} from './planning.mjs';
self.onmessage=({data})=>{try{self.postMessage({id:data.id,plan:calculateWorkshopPlan(data.project,data.material,data.previous)});}catch(error){self.postMessage({id:data.id,error:error.message});}};
