import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GameScreen} from '../src/screens/game-screen.js';
import {ResultScreen} from '../src/screens/info-screens.js';
import {StorageService,RUN_KEY,RECORDS_KEY} from '../src/services/storage-service.js';

function resultRoot(){
  const elements=new Map();
  return {innerHTML:'',appended:[],querySelector(selector){if(!elements.has(selector))elements.set(selector,{});return elements.get(selector);},append(element){this.appended.push(element);}};
}

async function failedFinish(t){
  const session=new Map(),data=new Map();let rejectRecordWrite=true;
  const globals={sessionStorage:{setItem:(key,value)=>session.set(key,value),getItem:key=>session.get(key)??null},document:{createElement:tag=>({tag,className:'',textContent:'',disabled:false})}};
  const originals=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  t.after(()=>{for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  const storage=new StorageService({storage:{getItem:key=>data.get(key)??null,setItem(key,value){if(key===RECORDS_KEY&&rejectRecordWrite)throw Error('simulated record write denial');data.set(key,value);},removeItem:key=>data.delete(key)}});
  const ctx={storage,router:{navigate:async()=>{}},toast:()=>{}};
  const game=new GameScreen(ctx,resultRoot(),{params:new URLSearchParams()});game.state=game.fresh('challenge');
  await game.save();game.state.solved=1;game.state.score=1150;game.state.remainingMs=0;
  await game.finish();assert.equal(ctx.resultSaveError,true);assert.ok(data.has(RUN_KEY));assert.ok(!data.has(RECORDS_KEY));
  return {ctx,storage,data,allowRecordWrite:()=>{rejectRecordWrite=false;}};
}

test('a failed result save remains accurately marked and retryable after document refresh',async t=>{
  const {storage,data}=await failedFinish(t);
  const root=resultRoot();
  const screen=new ResultScreen({lastResult:null,resultSaveError:false,storage,toast:()=>{}},root,{});
  await screen.mount();
  assert.match(root.querySelector('#result-save-state').textContent,/실패|저장하지|저장되지/);
  assert.ok(root.appended.some(button=>button.textContent.includes('다시 시도')));
  assert.ok(!data.has(RECORDS_KEY));
});

test('a successful result save retry also removes the previous resumable run',async t=>{
  const {ctx,data,allowRecordWrite}=await failedFinish(t);
  const root=resultRoot(),screen=new ResultScreen(ctx,root,{});await screen.mount();
  const retry=root.appended.find(button=>button.textContent.includes('다시 시도'));assert.ok(retry);
  allowRecordWrite();await retry.onclick();
  assert.ok(data.has(RECORDS_KEY));
  assert.equal(data.has(RUN_KEY),false);
  assert.equal(ctx.resultSaveError,false);
});

test('a successfully saved result below the retained top twenty is not marked as failed',async t=>{
  const {ctx,storage,allowRecordWrite}=await failedFinish(t);allowRecordWrite();
  for(let index=0;index<20;index++)await storage.saveResult({id:'prior-'+index,date:new Date().toISOString(),mode:'challenge',score:100000+index,solved:8,total:8,durationMs:1000,maxCombo:8});
  const game=new GameScreen(ctx,resultRoot(),{});game.state=game.fresh('challenge');game.state.remainingMs=0;await game.finish();assert.equal(ctx.resultSaveError,false);
  const root=resultRoot();await new ResultScreen(ctx,root,{}).mount();
  assert.equal((await storage.loadRecords()).length,20);
  assert.equal(ctx.resultSaveError,false);
  assert.doesNotMatch(root.querySelector('#result-save-state').textContent,/실패/);
  assert.equal(root.appended.length,0);
});

test('retrying an older result preserves a newer saved game',async t=>{
  const {ctx,storage,allowRecordWrite}=await failedFinish(t);
  const catalog=JSON.parse(await readFile(new URL('../data/levels.json',import.meta.url),'utf8'));
  const newer=new GameScreen(ctx,resultRoot(),{}).fresh('practice',3);
  newer.plan.loop1=[catalog.levels[3].ops[0].id];newer.selected=catalog.levels[3].ops[0].id;
  await storage.saveRun(newer);
  const root=resultRoot();await new ResultScreen(ctx,root,{}).mount();
  const retry=root.appended.find(button=>button.textContent.includes('다시 시도'));assert.ok(retry);
  allowRecordWrite();await retry.onclick();
  assert.deepEqual(await storage.loadRun(),newer);
  assert.equal((await storage.loadRecords()).length,1);
});

test('finishing an unsaved practice game preserves an existing challenge save',async t=>{
  const {ctx,storage,allowRecordWrite}=await failedFinish(t);allowRecordWrite();
  const challenge=await storage.loadRun();
  const practice=new GameScreen(ctx,resultRoot(),{});practice.state=practice.fresh('practice');await practice.finish();
  assert.deepEqual(await storage.loadRun(),challenge);
  assert.equal(ctx.resultSaveError,false);
});

test('a challenge that finishes loading in a hidden tab waits for explicit resume',async t=>{
  const catalog=JSON.parse(await readFile(new URL('../data/levels.json',import.meta.url),'utf8'));
  const doc=new EventTarget();doc.hidden=false;doc.hasFocus=()=>!doc.hidden;
  const globals={document:doc,addEventListener:()=>{}};
  const originals=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  t.after(()=>{for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  let completeLoad;const loading=new Promise(resolve=>{completeLoad=resolve;});
  const screen=new GameScreen({levels:{load:()=>loading},storage:{loadRun:async()=>null},toast:()=>{}},new EventTarget(),{params:new URLSearchParams('mode=challenge')});
  screen.buildShell=()=>{};screen.render=()=>{};screen.updateHud=()=>{};screen.renderPause=()=>{};
  t.after(()=>screen.dispose());
  const mounted=screen.mount();doc.hidden=true;completeLoad(catalog);await mounted;
  assert.equal(screen.paused,true);
  screen.lastTick=performance.now()-5000;screen.tick();assert.equal(screen.state.remainingMs,90000);
});
