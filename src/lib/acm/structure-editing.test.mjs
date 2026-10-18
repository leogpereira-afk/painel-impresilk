import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from './model.mjs';
import { buildProject } from './engine.mjs';
import { createStructureFrame, validateStructureFrame, frameMemberSignature } from './structure.mjs';
import { serializeProjectJSON, parseProjectJSON, createProjectStorage } from './storage.mjs';
const fixture=()=>{const p=createProject();p.front={width:1800,height:1200};p.structure.frame=createStructureFrame(p);p.structure.frame.spacingX=600;p.structure.frame.spacingY=100000;return p};
test('remove, save/reopen, recalculate and restore a real member with cutting balance',()=>{
 const p=fixture(), before=buildProject(p), id='front-IV-1';assert.ok(before.structure.segments.some(s=>s.id===id));
 p.structure.frame.overrides[id]={removed:true};const reopened=parseProjectJSON(serializeProjectJSON(p));
 const after=buildProject(reopened);assert.equal(after.structure.segments.some(s=>s.id===id),false);assert.ok(after.structure.totalLength<before.structure.totalLength);assert.equal(after.structure.bars.flatMap(b=>b.cuts).some(c=>c.id===id),false);
 for(const b of after.structure.bars) assert.ok(Math.abs(b.used+b.trimEnd+b.trimKerfEnd+b.waste-b.length)<1e-5);
 reopened.structure.frame.overrides[id].removed=false;assert.deepEqual(buildProject(reopened).structure.segments,before.structure.segments);
});
test('move is geometric, survives storage and keeps IDs',()=>{
 const p=fixture(), initial=buildProject(p);p.structure.frame.overrides['front-IV-1']={position:700,profile:{width:50,depth:30,id:'50x30',orientation:'depth'}};
 const r=buildProject(parseProjectJSON(serializeProjectJSON(p))), member=r.structure.segments.find(s=>s.id==='front-IV-1');assert.equal(member.local.x1,700);assert.equal(member.faceWidth,30);assert.notEqual(member.local.x1,initial.structure.segments.find(s=>s.id===member.id).local.x1);assert.deepEqual(validateStructureFrame(p.structure),[]);
});
test('geometry changes preserve and report orphaned removals; invalid editing fields reject',()=>{
 const p=fixture();p.structure.frame.overrides['front-IV-2']={removed:true};p.structure.frame.spacingX=100000;const r=buildProject(p);assert.ok(r.structure.orphanedOverrides.includes('front-IV-2'));assert.ok(r.warnings.some(w=>w.code==='FRAME_ORPHAN_EDIT'));assert.equal(p.structure.frame.overrides['front-IV-2'].removed,true);
 for(const value of [{removed:'yes'},{position:-2},{position:Infinity}]){p.structure.frame.overrides={'front-IV-1':value};assert.ok(validateStructureFrame(p.structure).length)}
});
test('subdivided member can be removed individually without excluding its sibling',()=>{
 const p=fixture();p.structure.frame.spacingY=600;const initial=buildProject(p);const member=initial.structure.segments.find(s=>s.id.includes('-S'));assert.ok(member);const sibling=initial.structure.segments.find(s=>s.baseId===member.baseId&&s.id!==member.id);assert.ok(sibling);p.structure.frame.overrides[member.id]={removed:true};const next=buildProject(p);assert.ok(!next.structure.segments.some(s=>s.id===member.id));assert.ok(next.structure.segments.some(s=>s.id===sibling.id));
});

test('storage service saves and reopens removed and moved members with optimistic versioning',async()=>{
 const records=new Map();const backend={async transact(owner,mode,update){const result=update(structuredClone(records.get(owner)));if(mode==='readwrite')records.set(owner,structuredClone(result.envelope));return result.result}};
 const storage=createProjectStorage({backend}),p=fixture();p.structure.frame.overrides={'front-IV-1':{removed:true},'front-IV-2':{position:1250}};
 await storage.saveDraft('synthetic-workshop-owner',p,0);const reopened=(await storage.loadDraft('synthetic-workshop-owner')).project;
 assert.deepEqual(reopened.structure.frame.overrides,p.structure.frame.overrides);const r=buildProject(reopened);assert.ok(!r.structure.segments.some(s=>s.id==='front-IV-1'));assert.equal(r.structure.segments.find(s=>s.id==='front-IV-2').local.x1,1250);
});

test('a split ID reused by changed topology cannot silently remove a different length',()=>{
 const p=fixture();p.structure.frame.spacingY=600;const initial=buildProject(p);const member=initial.structure.segments.find(s=>s.id.includes('-S'));assert.ok(member);p.structure.frame.overrides[member.id]={removed:true,geometrySignature:frameMemberSignature(member)};
 assert.ok(!buildProject(p).structure.segments.some(s=>s.id===member.id));p.structure.frame.spacingY=300;const changed=buildProject(p);assert.ok(changed.warnings.some(w=>w.code==='FRAME_CHANGED_EDIT'));assert.ok(changed.structure.segments.some(s=>s.id===member.id));assert.equal(p.structure.frame.overrides[member.id].removed,true);
});
