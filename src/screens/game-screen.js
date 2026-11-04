import {runOriginal,checkPlan,checkHold} from '../game/engine.js';
function node(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;}
const copy=value=>JSON.parse(JSON.stringify(value));
const clock=value=>String(Math.ceil(Math.max(0,value)/1000)).padStart(2,'0');
export class GameScreen {
  constructor(ctx,root,route){Object.assign(this,{ctx,root,route});this.abort=new AbortController();this.closed=false;this.dirty=false;this.paused=false;this.loading=true;this.feedback=null;this.lastTick=performance.now();this.finishing=false;this.savedSnapshot=null;}
  readState(){return {dirty:this.dirty,saving:this.ctx.storage.saving};}
  async mount(){
    this.root.innerHTML='<div class="loading-screen">두 루프의 작업을 불러오고 있습니다…</div>';
    try {
      this.catalog=await this.ctx.levels.load({signal:this.abort.signal});if(this.closed)return;
      const mode=this.route.params.get('mode')==='practice'?'practice':'challenge';
      let saved=null;
      try{saved=await this.ctx.storage.loadRun();}catch{this.ctx.toast('저장한 진행을 읽지 못했습니다. 새 게임으로 시작해요.');}
      if(this.closed)return;
      this.state=saved&&saved.mode===mode?saved:this.fresh(mode);
      if(!this.validPlan())this.state=this.fresh(mode);
      if(this.state.phase==='cleared'&&!checkPlan(this.level,this.state.plan).ok&&!checkHold(this.level).ok)this.state=this.fresh(mode);
      const resumed=this.state===saved;
      this.savedSnapshot=resumed?copy(saved):null;
      this.loading=false;this.dirty=!resumed;this.buildShell();this.render();
      this.root.addEventListener('click',e=>this.click(e),{signal:this.abort.signal});
      this.root.addEventListener('dragstart',e=>this.dragStart(e),{signal:this.abort.signal});
      this.root.addEventListener('dragover',e=>this.dragOver(e),{signal:this.abort.signal});
      this.root.addEventListener('dragleave',e=>{if(!e.currentTarget.contains(e.relatedTarget))this.clearDrop();},{signal:this.abort.signal});
      this.root.addEventListener('dragend',()=>this.clearDrop(),{signal:this.abort.signal});
      this.root.addEventListener('drop',e=>this.drop(e),{signal:this.abort.signal});
      document.addEventListener('keydown',e=>this.key(e),{signal:this.abort.signal});
      document.addEventListener('visibilitychange',()=>{if(document.hidden)this.pause();},{signal:this.abort.signal});
      addEventListener('blur',()=>this.pause(),{signal:this.abort.signal});
      this.interval=setInterval(()=>this.tick(),100);
      if(resumed||document.hidden||!document.hasFocus()){this.paused=true;this.renderPause();if(resumed)this.ctx.toast('저장된 게임을 불러왔습니다. 계속하기를 눌러 주세요.');}
      this.lastTick=performance.now();
    }catch(error){
      if(this.closed||error.name==='AbortError')return;
      this.loading=true;this.root.innerHTML='<section class="error-screen"><p class="eyebrow">CONNECTION PAUSED</p><h1>작업 데이터를 불러오지 못했어요.</h1><p>연결 상태를 확인하고 다시 시도해 주세요.</p><button class="btn btn-primary" data-retry>다시 불러오기</button><a class="btn btn-secondary" href="#/" data-route="/">시작 화면으로</a></section>';
      this.root.querySelector('[data-retry]').onclick=()=>this.mount();
    }
  }
  get level(){return this.catalog.levels[this.state.index];}
  fresh(mode,index=0){return {schema:1,runId:crypto.randomUUID(),mode,index,remainingMs:90000,score:0,combo:0,maxCombo:0,solved:0,plan:{loop1:[],loop2:[]},selected:null,phase:'editing'};}
  validPlan(){
    if(!this.level)return false;
    const ids=[...this.state.plan.loop1,...this.state.plan.loop2];const all=new Set(this.level.ops.map(o=>o.id));
    return ids.every(id=>all.has(id))&&new Set(ids).size===ids.length&&(!this.state.selected||all.has(this.state.selected));
  }
  buildShell(){
    this.root.innerHTML='<section class="game-screen"><div class="game-top"><div class="round-meta"><p class="eyebrow" id="round-label"></p><h1 class="level-title"></h1><p class="level-subtitle"></p></div><div class="hud"><div class="hud-item"><span>SCORE</span><strong id="score">0</strong></div><div class="hud-item"><span>COMBO</span><strong id="combo">×0</strong></div><div class="hud-item timer-ring"><span id="timer-label">TIME LEFT</span><strong id="timer">90</strong></div><button class="mini-btn" data-action="pause" aria-label="일시정지">Ⅱ</button></div></div><div class="progress-track" aria-label="라운드 진행"></div><div class="mission-bar"><span class="label">MISSION</span><span class="purpose-chip" data-purpose="a"></span><span class="purpose-chip" data-purpose="b"></span><button class="text-link" data-action="hint">힌트 보기 ↗</button></div><p id="hint" class="learn-note" hidden></p><div class="game-layout"><section class="lane" data-lane="source"><div class="lane-heading"><h2 class="lane-title">원본 작업</h2><span class="label">MIXED</span></div><p class="lane-note">카드를 선택해서 목적별로 나누세요.</p><div class="card-list"></div></section><section class="lane lane-dropzone" data-lane="loop1"><div class="lane-heading"><h2 class="lane-title">LOOP 1</h2><span class="label">FIRST PASS</span></div><p class="lane-note">전체 데이터를 먼저 한 바퀴</p><div class="card-list"></div></section><section class="lane lane-dropzone" data-lane="loop2"><div class="lane-heading"><h2 class="lane-title">LOOP 2</h2><span class="label">SECOND PASS</span></div><p class="lane-note">같은 전체 데이터를 다시 한 바퀴</p><div class="card-list"></div></section></div><div class="board-controls"><button class="btn btn-primary" data-action="check">실행 검사 <span aria-hidden="true">↗</span></button><button class="btn btn-secondary" data-action="hold">분리 보류</button><button class="btn btn-ghost" data-action="swap">두 루프 순서 바꾸기 ⇄</button><button class="text-link" data-action="reset">배치 초기화</button><button class="text-link" data-action="save">진행 저장</button></div><p class="loop-order-note">LOOP 1이 모든 데이터를 처리한 다음 LOOP 2가 시작합니다. 동시에 실행하지 않아요.</p><div class="feedback-panel" id="feedback" role="status" aria-live="polite" hidden></div><div class="keyboard-strip"><span><kbd>↑</kbd><kbd>↓</kbd> 선택</span><span><kbd>1</kbd><kbd>2</kbd> 배치</span><span><kbd>⌫</kbd> 회수</span><span><kbd>Space</kbd> 검사</span><span><kbd>Esc</kbd> 일시정지</span></div><details class="data-preview"><summary>원본 작업과 데이터 살펴보기</summary><div id="reference-data"></div></details><p class="learn-note">이 게임은 문제별 18개 표본을 비교합니다. 임의의 실제 코드에 대한 동치 증명이나 성능 측정은 아닙니다.</p><div class="practice-chooser" hidden></div><div class="pause-overlay" hidden><div class="modal-card"><p class="eyebrow">TAKE A BREATH</p><h2>루프를 잠시 멈췄어요.</h2><p>다시 준비되면 이어가세요. 남은 시간과 배치는 그대로입니다.</p><button class="btn btn-primary" data-action="resume">계속하기 ↗</button><button class="btn btn-secondary" data-action="save">진행 저장</button></div></div></section>';
  }
  render(){
    const s=this.state,l=this.level;
    this.root.querySelector('#round-label').textContent=(s.mode==='practice'?'PRACTICE':'90 SEC CHALLENGE')+' / ROUND '+String(s.index+1).padStart(2,'0')+' OF 08';
    this.root.querySelector('.level-title').textContent=l.title;this.root.querySelector('.level-subtitle').textContent=l.subtitle;
    const chips=this.root.querySelectorAll('.purpose-chip');chips[0].textContent='A / '+l.purposes.a;chips[1].textContent='B / '+l.purposes.b;
    this.root.querySelector('#hint').hidden=true;
    this.root.querySelector('.progress-track').replaceChildren(...this.catalog.levels.map((level,i)=>{const n=node('span','progress-dot',String(i+1).padStart(2,'0'));n.dataset.state=i<s.index?'done':i===s.index?'current':'next';return n;}));
    const used=new Set([...s.plan.loop1,...s.plan.loop2]);
    for(const lane of ['source','loop1','loop2']){
      const ids=lane==='source'?l.ops.filter(o=>!used.has(o.id)).map(o=>o.id):s.plan[lane];
      const list=this.root.querySelector('[data-lane="'+lane+'"] .card-list');
      list.replaceChildren(...ids.map(id=>this.card(id,lane)));
      if(!ids.length){const empty=node('button','empty-lane',lane==='source'?'모든 작업을 배치했어요':'선택한 카드를 이 루프로 →');empty.type='button';empty.dataset.action=lane==='source'?'noop':'assign';empty.dataset.dest=lane;empty.disabled=lane==='source'||s.phase!=='editing';list.append(empty);}
    }
    for(const action of ['check','hold','swap','reset'])this.root.querySelector('[data-action="'+action+'"]').disabled=s.phase!=='editing';
    const original=runOriginal(l);
    const reference=this.root.querySelector('#reference-data');
    reference.replaceChildren(node('p','','각 데이터마다 원래 수행하던 작업'),...l.ops.map(o=>node('pre','',o.code)),node('p','','입력 데이터'),node('pre','',JSON.stringify(l.records,null,2)),node('p','','원본의 최종 출력'),node('pre','',JSON.stringify(original.outputs,null,2)));
    const chooser=this.root.querySelector('.practice-chooser');chooser.hidden=s.mode!=='practice';chooser.replaceChildren(node('span','label','ROUND SELECT'));
    if(s.mode==='practice')this.catalog.levels.forEach((lv,i)=>{const b=node('button','mini-btn',String(i+1).padStart(2,'0'));b.dataset.action='choose';b.dataset.index=i;b.setAttribute('aria-label',String(i+1)+'번 문제 연습');if(i===s.index)b.setAttribute('aria-current','step');chooser.append(b);});
    if(s.phase==='cleared'&&!this.feedback)this.feedback={ok:true,reason:'저장한 정답입니다. 다음 라운드로 진행하세요.',checkedCases:18};
    this.renderFeedback();this.updateHud();this.renderPause();
  }
  card(id,lane){
    const op=this.level.ops.find(o=>o.id===id),card=node('article','statement-card');
    card.dataset.id=id;card.dataset.purpose=op.purpose;card.dataset.selected=String(this.state.selected===id);card.draggable=this.state.phase==='editing';card.tabIndex=0;
    card.setAttribute('aria-label',op.label+' · '+this.level.purposes[op.purpose]+' · '+(lane==='source'?'미배치':lane));
    card.append(node('span','card-index',String(this.level.ops.indexOf(op)+1).padStart(2,'0')),node('span','card-purpose',op.purpose.toUpperCase()+' / '+this.level.purposes[op.purpose]),node('h3','card-label',op.label),node('code','card-code',op.code));
    const tools=node('div','card-tools');
    const button=(label,action,dest)=>{const b=node('button','mini-btn',label);b.type='button';b.dataset.action=action;b.dataset.id=id;if(dest)b.dataset.dest=dest;b.disabled=this.state.phase!=='editing';b.setAttribute('aria-label',op.label+' '+label);return b;};
    if(lane!=='loop1')tools.append(button('→ 1','assign','loop1'));
    if(lane!=='loop2')tools.append(button('→ 2','assign','loop2'));
    if(lane!=='source')tools.append(button('↑','up',lane),button('↓','down',lane),button('회수','return'));
    card.append(tools);return card;
  }
  click(event){
    const b=event.target.closest('[data-action]');
    if(b){const action=b.dataset.action;
      if(action==='resume'){this.paused=false;this.lastTick=performance.now();this.renderPause();return;}
      if(action==='save'){this.pause();this.save().then(()=>this.ctx.toast('현재 배치와 남은 시간을 저장했습니다.')).catch(()=>this.ctx.toast('저장하지 못했습니다. 진행은 유지됩니다.'));return;}
      if(action==='pause'){this.pause();return;}
      if(this.paused||this.finishing)return;
      if(action==='hint'){const h=this.root.querySelector('#hint');h.hidden=!h.hidden;h.textContent=this.level.hint;return;}
      if(action==='next'){this.next();return;}
      if(action==='choose'){this.state=this.fresh('practice',Number(b.dataset.index));this.feedback=null;this.dirty=true;this.render();return;}
      if(this.state.phase!=='editing')return;
      if(action==='assign')this.assign(b.dataset.id||this.state.selected,b.dataset.dest);
      if(action==='return')this.assign(b.dataset.id,'source');
      if(action==='up'||action==='down')this.reorder(b.dataset.id,b.dataset.dest,action==='up'?-1:1);
      if(action==='swap'){[this.state.plan.loop1,this.state.plan.loop2]=[this.state.plan.loop2,this.state.plan.loop1];this.changed();}
      if(action==='reset'){this.state.plan={loop1:[],loop2:[]};this.state.selected=null;this.changed();}
      if(action==='check'||action==='hold')this.verify(action==='hold');
      return;
    }
    const card=event.target.closest('.statement-card');
    if(card&&!this.paused&&this.state.phase==='editing'){this.state.selected=card.dataset.id;this.root.querySelectorAll('.statement-card').forEach(c=>c.dataset.selected=String(c.dataset.id===this.state.selected));this.ctx.sound.play('select');}
  }
  assign(id,dest){
    if(!id||!['source','loop1','loop2'].includes(dest)||!this.level.ops.some(o=>o.id===id))return;
    this.state.plan.loop1=this.state.plan.loop1.filter(v=>v!==id);this.state.plan.loop2=this.state.plan.loop2.filter(v=>v!==id);
    if(dest!=='source')this.state.plan[dest].push(id);
    this.state.selected=id;this.ctx.sound.play('move');this.changed();
  }
  reorder(id,lane,delta){const list=this.state.plan[lane];if(!list)return;const i=list.indexOf(id),j=i+delta;if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];this.state.selected=id;this.changed();}
  changed(){this.dirty=true;this.feedback=null;const focused=document.activeElement?.closest('.statement-card')?.dataset.id;this.render();if(focused)this.root.querySelector('.statement-card[data-id="'+focused+'"]')?.focus({preventScroll:true});}
  verify(hold=false){
    this.tick();if(this.finishing)return;
    const result=hold?checkHold(this.level):checkPlan(this.level,this.state.plan);
    this.feedback={...result,hold};
    if(result.ok){this.state.phase='cleared';this.state.combo++;this.state.maxCombo=Math.max(this.state.maxCombo,this.state.combo);this.state.solved++;this.state.score+=1000+Math.min(5,this.state.combo)*150;this.ctx.sound.play('pass');}
    else{this.state.combo=0;if(this.state.mode==='challenge')this.state.remainingMs=Math.max(0,this.state.remainingMs-5000);this.ctx.sound.play('fail');}
    this.dirty=true;this.render();
    this.root.querySelector('#feedback').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
    if(!result.ok&&this.state.mode==='challenge'&&this.state.remainingMs<=0)this.finish();
  }
  renderFeedback(){
    const area=this.root.querySelector('#feedback');area.hidden=!this.feedback;if(!this.feedback)return;
    const f=this.feedback;area.dataset.status=f.ok?'pass':'fail';area.replaceChildren(node('h2','feedback-heading',f.ok?(f.hold?'좋은 판단! 지금은 분리 보류.':'RESULT PRESERVED.'): '결과를 다시 확인하세요.'));
    area.append(node('p','',f.reason||''));
    if(f.ok){area.append(node('p','',this.level.explanation));const next=node('button','btn btn-primary',this.state.index===7?'결과 보기 ↗':'다음 라운드 →');next.dataset.action='next';area.append(next);}
    if(f.expected||f.actual){const grid=node('div','output-grid');for(const [label,v]of [['원본 결과',f.expected],['내 배치 결과',f.actual]]){const cell=node('div','output-cell');cell.append(node('span','label',label),node('pre','',v==null?'아직 실행할 수 없어요':JSON.stringify(v,null,2)));grid.append(cell);}area.append(grid);}
    if(f.mismatch){const detail=node('details','counterexample');detail.append(node('summary','','결과가 달라진 데이터 보기'));detail.append(node('pre','',JSON.stringify(f.mismatch,null,2)));area.append(detail);}
    if(f.checkedCases)area.append(node('p','learn-note',String(f.checkedCases)+'개 표본 검사 · 현재 게임 명령 체계 안의 결과입니다.'));
    if(!f.ok)area.append(node('p','learn-note',this.state.mode==='challenge'?'잘못된 판단: −5초 / 배치는 유지됩니다.':'연습에서는 시간 감점이 없습니다.'));
  }
  next(){if(this.state.phase!=='cleared')return;if(this.state.index===7){this.finish();return;}this.state.index++;this.state.phase='editing';this.state.plan={loop1:[],loop2:[]};this.state.selected=null;this.feedback=null;this.dirty=true;this.lastTick=performance.now();this.render();}
  updateHud(){if(this.loading||this.closed)return;this.root.querySelector('#score').textContent=this.state.score.toLocaleString();this.root.querySelector('#combo').textContent='×'+this.state.combo;this.root.querySelector('#timer').textContent=this.state.mode==='practice'?'∞':clock(this.state.remainingMs);this.root.querySelector('#timer-label').textContent=this.state.mode==='practice'?'NO TIMER':'TIME LEFT';this.root.querySelector('.timer-ring').dataset.warning=String(this.state.mode==='challenge'&&this.state.remainingMs<=15000);}
  tick(){
    if(this.loading||this.closed||this.finishing)return;const now=performance.now(),delta=Math.max(0,now-this.lastTick);this.lastTick=now;
    if(!this.paused&&this.state.mode==='challenge'&&this.state.phase==='editing'){this.state.remainingMs=Math.max(0,this.state.remainingMs-delta);this.dirty=true;this.updateHud();if(this.state.remainingMs<=0)this.finish();}
  }
  pause(){if(this.loading||this.closed||this.finishing||this.paused)return;this.tick();if(this.finishing)return;this.paused=true;this.renderPause();}
  renderPause(){
    if(this.loading)return;
    const overlay=this.root.querySelector('.pause-overlay'),was=overlay.hidden;
    overlay.hidden=!this.paused;overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','게임 일시정지');overlay.setAttribute('aria-modal','true');
    for(const child of this.root.querySelector('.game-screen').children)if(child!==overlay)child.inert=this.paused;
    if(this.paused&&was)this.focusPause();
  }
  focusPause(){this.root.querySelector('.pause-overlay [data-action="resume"]')?.focus({preventScroll:true});}
  async save(){this.pause();const snapshot=copy(this.state);await this.ctx.storage.saveRun(snapshot);this.savedSnapshot=snapshot;this.dirty=false;}
  discard(){this.dirty=false;}
  async finish(){
    if(this.finishing)return;this.finishing=true;this.paused=true;clearInterval(this.interval);
    const s=this.state;const result={id:crypto.randomUUID(),date:new Date().toISOString(),mode:s.mode,score:s.score+(s.mode==='challenge'?Math.floor(s.remainingMs/1000)*10:0),solved:s.solved,total:8,durationMs:s.mode==='challenge'?Math.floor(90000-s.remainingMs):0,maxCombo:s.maxCombo};
    this.ctx.lastResult=result;this.ctx.resultSaveError=false;try{sessionStorage.setItem('loop-split:last-result',JSON.stringify({result,saved:false,savedRun:this.savedSnapshot}));}catch{}
    try{await this.ctx.storage.saveResult(result);await this.ctx.storage.clearRunIfMatches(this.savedSnapshot);}catch{this.ctx.resultSaveError=true;}
    try{sessionStorage.setItem('loop-split:last-result',JSON.stringify({result,saved:!this.ctx.resultSaveError,savedRun:this.savedSnapshot}));}catch{}
    if(this.closed)return;this.dirty=false;await this.ctx.router.navigate('/result');
  }
  key(event){
    if(this.closed||this.loading||document.querySelector('#guard-dialog[open]'))return;
    const target=event.target?.closest?event.target:document.body;if(target.closest('input,textarea,select,[contenteditable=true]'))return;
    if(event.key==='Escape'){event.preventDefault();if(!this.paused)this.pause();return;}
    if(this.paused){
      if(event.key==='Tab'){const buttons=[...this.root.querySelectorAll('.pause-overlay button:not(:disabled)')];const i=buttons.indexOf(document.activeElement);event.preventDefault();buttons[(i+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();}
      return;
    }
    if(this.finishing||event.altKey||event.ctrlKey||event.metaKey||event.repeat)return;
    if((event.key===' '||event.key==='Enter')&&target.closest('button,a,summary'))return;
    if(this.state.phase==='cleared'){if(event.key===' '||event.key==='Enter'){event.preventDefault();this.next();}return;}
    if(event.key==='ArrowUp'||event.key==='ArrowDown'){
      event.preventDefault();const ids=this.level.ops.map(o=>o.id),i=ids.indexOf(this.state.selected);this.state.selected=ids[(i+(event.key==='ArrowDown'?1:-1)+ids.length)%ids.length];this.render();this.root.querySelector('.statement-card[data-id="'+this.state.selected+'"]')?.focus({preventScroll:true});
    }
    if(event.key==='1'||event.key==='2'){event.preventDefault();this.assign(this.state.selected,'loop'+event.key);}
    if(event.key==='Backspace'){event.preventDefault();this.assign(this.state.selected,'source');}
    if(event.key===' '){event.preventDefault();this.verify();}
    if(event.key==='Enter'&&target.closest('.statement-card')){event.preventDefault();this.state.selected=target.closest('.statement-card').dataset.id;this.render();}
  }
  dragStart(e){const card=e.target.closest('.statement-card');if(!card||this.paused||this.state.phase!=='editing'){e.preventDefault();return;}this.state.selected=card.dataset.id;e.dataTransfer.setData('text/plain',card.dataset.id);e.dataTransfer.effectAllowed='move';}
  dragOver(e){const lane=e.target.closest('[data-lane]');if(lane&&!this.paused&&this.state.phase==='editing'){e.preventDefault();lane.dataset.over='true';e.dataTransfer.dropEffect='move';}}
  clearDrop(){this.root.querySelectorAll('[data-over]').forEach(n=>delete n.dataset.over);}
  drop(e){const lane=e.target.closest('[data-lane]');if(!lane||this.paused||this.state.phase!=='editing')return;e.preventDefault();const id=e.dataTransfer.getData('text/plain');this.clearDrop();this.assign(id,lane.dataset.lane);}
  dispose(){this.closed=true;this.abort.abort();clearInterval(this.interval);}
}
