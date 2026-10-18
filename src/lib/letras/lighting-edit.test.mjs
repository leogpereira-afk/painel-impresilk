import test from 'node:test';
import assert from 'node:assert/strict';
import {createLightLayout} from './light-layout.mjs';
import {updateLightingField,updateLightingSupply} from './lighting-edit.mjs';
test('changing a source invalidates the previous confirmation without mutating its saved revision',()=>{
 const c=createLightLayout({supply:{conditionsConfirmed:true}});
 for(const [key,value] of [['powerW',102],['voltageV',24],['ratedCurrentA',8.5],['loadPercent',90],['xMm',-300],['datasheet','new sheet']])assert.equal(updateLightingField(c,'supply',key,value).supply.conditionsConfirmed,false);
 assert.equal(c.supply.conditionsConfirmed,true);assert.equal(c.supply.powerW,60);
});
test('explicit confirmation is possible for unchanged specification; distribution edits reset it',()=>{
 const c=createLightLayout();const approved=updateLightingField(c,'supply','conditionsConfirmed',true);
 assert.equal(approved.supply.conditionsConfirmed,true);
 assert.equal(updateLightingSupply(approved,{powerW:60}).supply.conditionsConfirmed,true);
 assert.equal(updateLightingSupply(approved,{distributionMode:'external',branches:8,outputs:1}).supply.conditionsConfirmed,false);
});
test('clearing optional current removes it and grid edits preserve source metadata',()=>{
 const c=createLightLayout({supply:{ratedCurrentA:5,conditionsConfirmed:true}});
 const cleared=updateLightingField(c,'supply','ratedCurrentA',null);
 assert.equal('ratedCurrentA' in cleared.supply,false);assert.equal(cleared.supply.conditionsConfirmed,false);
 const grid=updateLightingField(c,'grid','pitchXmm',100);assert.equal(grid.grid.pitchXmm,100);assert.equal(grid.supply.conditionsConfirmed,true);
});
