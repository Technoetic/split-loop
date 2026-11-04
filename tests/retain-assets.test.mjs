import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {APP} from '../scripts/build.mjs';
import {retainAssets} from '../scripts/retain-assets.mjs';
const sha=body=>createHash('sha256').update(body).digest('hex');
const old=Buffer.from('export const oldBuild=true;\n');
const baseUrl='https://example.test/split-loop/';
const manifest={schema:1,buildId:'ls-old-build',sourceCommit:'1'.repeat(40),files:{'assets/main.ls-old-build.js':sha(old),'index.html':sha('old html')}};
const response=(value,status=200)=>new Response(value,{status});
async function temp(){return mkdtemp(path.join(APP,'.test-build-retain-'));}
function fetcher({body=manifest,version='ls-old-build',bytes=old}={}){
 return async url=>{
  const u=new URL(url);assert.equal(u.origin,'https://example.test');assert.ok(u.searchParams.has('_retain'));
  if(u.pathname.endsWith('pages-manifest.json'))return response(JSON.stringify(body));
  if(u.pathname.endsWith('version.json'))return response(JSON.stringify({buildId:version}));
  return response(bytes);
 };
}
test('first publication may explicitly omit previous output; later404 fails closed',async()=>{
 const outDir=await temp();
 const missing=async()=>response('missing',404);
 assert.equal((await retainAssets({baseUrl,outDir,allowEmpty:true,fetcher:missing})).retained,0);
 await assert.rejects(retainAssets({baseUrl,outDir,fetcher:missing}),/previous|manifest/i);
});
test('copies the live previous asset by its verified hash without an expiring CI artifact',async()=>{
 const outDir=await temp();
 const result=await retainAssets({baseUrl,outDir,fetcher:fetcher()});
 assert.equal(result.retained,1);assert.equal(result.previousBuild,'ls-old-build');
 assert.deepEqual(await readFile(path.join(outDir,'assets/main.ls-old-build.js')),old);
 await assert.rejects(readFile(path.join(outDir,'index.html')));
});
test('rejects mismatched bytes or inconsistent manifest/version before deployment',async()=>{
 for(const options of [{bytes:Buffer.from('wrong')},{version:'ls-other-build'}]){
  await assert.rejects(retainAssets({baseUrl,outDir:await temp(),fetcher:fetcher(options)}),/hash|version/i);
 }
});
test('rejects traversal and malformed previous source identities',async()=>{
 for(const body of [{...manifest,sourceCommit:'invalid'},{...manifest,files:{'../outside.js':sha(old)}}]){
  await assert.rejects(retainAssets({baseUrl,outDir:await temp(),fetcher:fetcher({body})}),/manifest|path|identity/i);
 }
});
