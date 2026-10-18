import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from './model.mjs';
import {nextCloudRevision,preserveBeforeReplacing,projectStamp,requireUnchangedProject} from './cloud-concurrency.mjs';

test('edits during preservation abort cloud replacement even within the same revision', async()=>{
 let project=createProject();let release;
 const gate=new Promise(resolve=>{release=resolve});
 const work=preserveBeforeReplacing(()=>project,async snapshot=>{assert.equal(snapshot.front.width,6000);await gate});
 project={...project,front:{...project.front,width:6100}};release();
 await assert.rejects(work,/alterado durante esta operação/);
 assert.equal(project.front.width,6100);
});
test('unchanged project is preserved before cloud replacement', async()=>{
 const project=createProject();let saved;
 const previous=await preserveBeforeReplacing(()=>project,async snapshot=>{saved=snapshot});
 assert.deepEqual(previous,project);assert.deepEqual(saved,project);assert.notEqual(saved,project);
});
test('proposal is rejected after draft change rather than relying on revision alone',()=>{
 const project=createProject(),stamp=projectStamp(project);requireUnchangedProject(structuredClone(project),stamp);
 project.material.color='#112233';assert.throws(()=>requireUnchangedProject(project,stamp),/alterado/);
});
test('cloud opening increments only revisions of the same project',()=>{
 const incoming={id:'cloud-one',revision:4},current={id:'unrelated',revision:80};
 assert.equal(nextCloudRevision(incoming,current,[{projectId:'cloud-one',revision:7},{projectId:'unrelated',revision:100}]),8);
 assert.equal(nextCloudRevision(incoming,{id:'cloud-one',revision:9}),10);assert.equal(nextCloudRevision(incoming,current),5);
});
