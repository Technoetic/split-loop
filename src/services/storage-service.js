export const RUN_KEY='loop-split:run:v1';
export const RECORDS_KEY='loop-split:records:v1';

const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const finite=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
const identifier=value=>typeof value==='string'&&/^[a-z\d_-]{1,64}$/i.test(value);
const mode=value=>value==='challenge'||value==='practice';
const clone=value=>JSON.parse(JSON.stringify(value));

function validateRun(value){
  const bad=()=>{throw Error('저장된 진행을 읽을 수 없어요. 기존 저장은 그대로 보관되어 있어요.');};
  if(!plain(value)||value.schema!==1||!mode(value.mode)||!integer(value.index,0,7)||!finite(value.remainingMs,0,90000)||!integer(value.score,0,1e9)||!integer(value.solved,0,8)||!integer(value.combo,0,8)||!integer(value.maxCombo,0,8)||value.combo>value.maxCombo||!['editing','cleared'].includes(value.phase)||(value.selected!==null&&!identifier(value.selected)))bad();
  if(!plain(value.plan)||!Array.isArray(value.plan.loop1)||!Array.isArray(value.plan.loop2))bad();
  const operations=[...value.plan.loop1,...value.plan.loop2];
  if(operations.length>32||operations.some(id=>!identifier(id))||new Set(operations).size!==operations.length)bad();
  return value;
}

function validateResult(value){
  if(!plain(value)||!identifier(value.id)||!mode(value.mode)||!integer(value.score,0,1e9)||!integer(value.total,1,8)||!integer(value.solved,0,value.total)||!finite(value.durationMs,0,86400000)||!integer(value.maxCombo,0,8)||typeof value.date!=='string'||!/^\d{4}-\d\d-\d\dT/.test(value.date)||!Number.isFinite(Date.parse(value.date)))throw Error('저장된 기록을 읽을 수 없어요. 기존 기록은 그대로 보관되어 있어요.');
  return value;
}

function validateRecords(value){
  if(!plain(value)||value.schema!==1||!Array.isArray(value.records)||value.records.length>20)throw Error('저장된 기록 형식이 올바르지 않아요.');
  value.records.forEach(validateResult);
  if(new Set(value.records.map(row=>row.id)).size!==value.records.length)throw Error('중복된 기록이 있어요.');
  return value.records;
}

export class StorageService {
  constructor(options={}){
    this.pending=0;this.lastError=null;this.queue=Promise.resolve();this.storage=null;this.unavailable=null;
    try{this.storage=Object.hasOwn(options,'storage')?options.storage:globalThis.localStorage;}
    catch(error){this.unavailable=error;}
  }
  get saving(){return this.pending>0;}
  _storage(){if(this.unavailable)throw this.unavailable;if(!this.storage)throw Error('이 브라우저에서 저장소에 접근할 수 없어요.');return this.storage;}
  async _read(key,validate,fallback){
    try{
      const source=await this._storage().getItem(key);
      const value=source===null||source===undefined?fallback:validate(JSON.parse(source));
      this.lastError=null;return clone(value);
    }catch(error){this.lastError=error;throw error;}
  }
  async _write(action){
    this.pending++;
    const operation=this.queue.then(action);
    this.queue=operation.catch(()=>{});
    try{const value=await operation;this.lastError=null;return value;}
    catch(error){this.lastError=error;throw error;}
    finally{this.pending--;}
  }
  async loadRun(){return this._read(RUN_KEY,validateRun,null);}
  async saveRun(run){
    try{const serialized=JSON.stringify(validateRun(run));return await this._write(()=>this._storage().setItem(RUN_KEY,serialized));}
    catch(error){this.lastError=error;throw error;}
  }
  async clearRun(){return this._write(()=>this._storage().removeItem(RUN_KEY));}
  async clearRunIfMatches(snapshot){
    if(snapshot==null)return false;
    const expected=JSON.stringify(validateRun(snapshot));
    return this._write(async()=>{
      const storage=this._storage(),read=storage.getItem(RUN_KEY);
      const raw=read&&typeof read.then==='function'?await read:read;
      if(raw==null||JSON.stringify(validateRun(JSON.parse(raw)))!==expected)return false;
      const removed=storage.removeItem(RUN_KEY);
      if(removed&&typeof removed.then==='function')await removed;
      return true;
    });
  }
  async loadRecords(){
    const records=await this._read(RECORDS_KEY,validateRecords,[]);
    return records.sort((a,b)=>b.score-a.score||b.date.localeCompare(a.date));
  }
  async saveResult(result){
    let snapshot;
    try{snapshot=clone(validateResult(result));}
    catch(error){this.lastError=error;throw error;}
    return this._write(async()=>{
      const source=await this._storage().getItem(RECORDS_KEY);
      const records=source===null||source===undefined?[]:validateRecords(JSON.parse(source));
      const next=records.filter(row=>row.id!==snapshot.id);next.push(snapshot);
      next.sort((a,b)=>b.score-a.score||b.date.localeCompare(a.date));
      await this._storage().setItem(RECORDS_KEY,JSON.stringify({schema:1,records:next.slice(0,20)}));
    });
  }
}
