import test from 'node:test';
import assert from 'node:assert/strict';
import { structurePlanSelection, restoreFrameMemberProfile, frameFaceInset } from './structure-editor-state.mjs';
test('viewport selecting lateral member changes plan face and destructive target together',()=>{
 const front={id:'front-EXT-B',surface:'front'},left={id:'left-EXT-B',surface:'left'}, surfaces=[{id:'front'},{id:'left'}];
 const state=structurePlanSelection({segments:[front,left]},surfaces,'front',left.id);assert.equal(state.surface.id,'left');assert.equal(state.selected,left);assert.deepEqual(state.items,[left]);
 const removed=structurePlanSelection({segments:[front]},surfaces,'front','left-removed');assert.equal(removed.selected,undefined);
});
test('face-specific inset takes precedence and respects zero override',()=>{const f={inset:100,faces:{left:{inset:50},right:{inset:0}}};assert.equal(frameFaceInset(f,'left'),50);assert.equal(frameFaceInset(f,'right'),0);assert.equal(frameFaceInset(f,'front'),100)});
test('restoring group profile preserves position, exclusion and topology reference',()=>{
 const f={a:{profile:{width:50},position:400,removed:true,geometrySignature:'keep'},b:{profile:{width:20}}};const restored=restoreFrameMemberProfile(f,'a');assert.deepEqual(restored.a,{position:400,removed:true,geometrySignature:'keep'});assert.equal(f.a.profile.width,50);assert.equal(restoreFrameMemberProfile(f,'b').b,undefined);
});
