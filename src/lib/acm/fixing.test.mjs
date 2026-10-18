import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from './model.mjs';
import {fixingQuantities,isSafeFixingPhoto,resolveFixing,validateFixingDetails} from '../../../supabase/functions/_shared/acm-fixing.mjs';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=';
test('partial piece fixing keeps inherited product metadata and changes only explicit drill diameter',()=>{
 const p=createProject();p.fixing.pattern={maxPitch:240,cornerOffset:20};p.fixing.screwProduct={manufacturer:'Example',nominalDiameter:4.2,drillDiameter:6};p.fixing.tapeProduct={width:12,thickness:1.1};p.overrides['front-1-1']={fixing:{pattern:{maxPitch:180},screwProduct:{code:'SC-1',drillDiameter:7}}};
 const f=resolveFixing(p,{id:'front-1-1'});assert.equal(f.screwPitch,180);assert.equal(f.edgeOffset,20);assert.equal(f.tapeWidth,12);assert.equal(f.thickness,1.1);assert.equal(f.screwProduct.manufacturer,'Example');assert.equal(f.drillDiameter,7);assert.equal(p.fixing.screwProduct.drillDiameter,6);
});
test('fixing validation rejects unsafe photos, invalid prices/date/constraint but accepts optional legacy metadata',()=>{
 assert.deepEqual(validateFixingDetails(createProject().fixing),[]);
 assert.equal(isSafeFixingPhoto(png),true);for(const s of ['https://host/p.jpg','data:image/svg+xml;base64,PHN2Zz4=',png+'"','data:image/png;base64,aGVsbG8='])assert.equal(isSafeFixingPhoto(s),false);
 const errors=validateFixingDetails({validated:true,pattern:{maxPitch:0,cornerOffset:5,minEdgeDistance:10,validatedAt:'2026-02-31'},screwProduct:{photoDataUrl:'https://host/p.jpg',unitPrice:-1},tapeProduct:{wastePercent:200,rollPrice:-1}});
 for(const code of ['FIXING_DIMENSION','FIXING_DATE','FIXING_EDGE_CONSTRAINT','FIXING_VALIDATION','FIXING_PHOTO','FIXING_PRICE','FIXING_WASTE'])assert.ok(errors.some(e=>e.code===code),code);
});
test('actual point and tape totals reconcile by piece, support and function',()=>{
 const result={pieces:[{id:'A',surface:'front',fixing:{screwProduct:{function:'ACM à estrutura'},tapeProduct:{function:'ACM à estrutura'}},fixings:{screws:[{x:1,y:1,supportId:'M1'},{x:1,y:9,supportId:'M1'}],tape:[{x1:0,y1:0,x2:0,y2:80,width:12,supportId:'M1'}]}},{id:'B',surface:'front',fixings:{screws:[{x:5,y:8,supportId:'M2',role:'arremate'}],tape:[]}}]};
 const q=fixingQuantities(result);assert.equal(q.length,2);assert.deepEqual(q[0],{pieceId:'A',surface:'front',supportId:'M1',role:'ACM à estrutura',screws:2,tapeBands:1,tapeLength:80});assert.equal(q.reduce((n,g)=>n+g.screws,0),3);
});
