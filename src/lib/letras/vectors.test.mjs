import test from 'node:test';import assert from 'node:assert/strict';import {validateContours,importLetterSVG} from './vectors.mjs';
test('reject self intersection and holes outside parent',()=>{assert.ok(validateContours([{outer:[{x:0,y:0},{x:4,y:4},{x:0,y:4},{x:4,y:0}],holes:[]}]).length);assert.ok(validateContours([{outer:[{x:0,y:0},{x:4,y:0},{x:4,y:4},{x:0,y:4}],holes:[[{x:8,y:8},{x:9,y:8},{x:9,y:9}]]}]).length);});
test('SVG active script is rejected explicitly',()=>assert.ok(importLetterSVG('<svg><script/></svg>').errors.length));
