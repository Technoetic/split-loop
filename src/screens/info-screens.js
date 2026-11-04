function node(tag, cls, text) {const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text);return n;}
class InfoScreen {
  constructor(ctx,root,route){Object.assign(this,{ctx,root,route});this.abort=new AbortController();this.closed=false;}
  readState(){return {dirty:false,saving:this.ctx.storage.saving};}
  dispose(){this.closed=true;this.abort.abort();}
}
export class HomeScreen extends InfoScreen {
  async mount(){
    this.root.innerHTML='<section class="home-screen"><p class="eyebrow"><span class="status-dot"></span> REFACTORING ARCADE / VOL. 02</p><div class="hero-grid"><div class="hero-copy"><p class="hero-kicker">한 루프, 두 가지 임무.</p><h1 class="hero-title"><span class="accent-lime">LOOP</span><span class="brand-slash">/</span><span class="accent-violet">SPLIT</span></h1><p class="hero-description">섞인 작업을 나눠라.<br>결과는 끝까지 지켜라.</p><div class="hero-actions"><a class="btn btn-primary" href="#/play?mode=challenge" data-route="/play?mode=challenge">90초 챌린지 <span aria-hidden="true">↗</span></a><a class="btn btn-secondary" href="#/play?mode=practice" data-route="/play?mode=practice">연습 모드</a></div><p class="hero-meta">설치 없이 플레이 · 키보드 / 터치 · 기록은 이 브라우저에</p><a class="text-link" id="resume-link" href="#/play?mode=challenge" hidden>저장한 게임 이어하기 →</a></div><div class="hero-visual"><img class="hero-reactor" alt="하나의 섞인 루프가 목적별 두 루프로 나뉘는 모습"><div class="reactor-caption"><span>01 MIXED LOOP</span><span class="accent-lime">02 FOCUSED LOOPS</span></div></div></div><div class="stats-strip"><div class="stat"><strong>90<span>SEC</span></strong><span>한 번의 몰입</span></div><div class="stat"><strong>8<span>ROUNDS</span></strong><span>여덟 개의 판단</span></div><div class="stat"><strong>2<span>LOOPS</span></strong><span>각자 하나의 목적</span></div><div class="stat"><strong>1<span>RESULT</span></strong><span>지켜야 할 실행 결과</span></div></div><div class="section-label"><span>HOW TO SPLIT</span><a href="#/guide" data-route="/guide">플레이 가이드 ↗</a></div><div class="feature-grid"><article class="feature-card"><span class="label">01 / SORT</span><h2>같은 목적끼리 모으기</h2><p>작업 카드를 선택하고 1·2 키로 배치하세요. 버튼과 드래그로도 옮길 수 있어요.</p></article><article class="feature-card"><span class="label">02 / VERIFY</span><h2>나눠도 결과는 같게</h2><p>두 루프가 같은 데이터를 차례로 돕니다. 순서 하나가 결과를 바꿀 수 있어요.</p></article><article class="feature-card"><span class="label">03 / KNOW WHEN</span><h2>멈출 줄도 알아야죠</h2><p>무조건 나누면 위험한 문제도 있습니다. 이때는 ‘분리 보류’로 판단을 지키세요.</p></article></div><p class="learn-note">Martin Fowler의 Split Loop를 플레이로 해석한 독립 교육 게임. 속도 향상이나 병렬 처리를 뜻하지 않습니다.</p></section>';
    this.root.querySelector('.hero-reactor').src=this.ctx.assetUrl('hero-reactor.svg');
    try {const saved=await this.ctx.storage.loadRun();if(this.closed)return;if(saved){const a=this.root.querySelector('#resume-link');a.hidden=false;a.href='#/play?mode='+saved.mode;a.dataset.route='/play?mode='+saved.mode;a.textContent='저장한 '+(saved.mode==='practice'?'연습':'챌린지')+' 이어하기 · ROUND '+String(saved.index+1).padStart(2,'0')+' →';}}
    catch{if(!this.closed)this.ctx.toast('저장한 게임을 읽지 못했습니다. 새 게임은 플레이할 수 있어요.');}
  }
}
export class GuideScreen extends InfoScreen {
  async mount(){
    this.root.innerHTML='<section class="info-screen"><p class="eyebrow">THE PLAYBOOK</p><h1>나누는 건 작업.<br><span class="accent-lime">지키는 건 결과.</span></h1><p class="hero-description">코드를 몰라도 괜찮아요. 같은 손님 명단을 두 번 살펴본다고 생각해 보세요.</p><div class="guide-grid"><article class="guide-card"><span class="label">BEFORE / 한 번에 여러 일</span><h2>손님 한 명마다, 금액도 더하고 컵도 세기</h2><p>각 손님을 보면서 ‘결제 합계’와 ‘컵 수’를 함께 계산하면 하나의 루프에 서로 다른 목적이 섞입니다.</p><pre><code>각 주문마다:\n  결제 금액 더하기\n  주문한 컵 수 더하기</code></pre></article><article class="guide-card"><span class="label">AFTER / 한 번에 한 목적</span><h2>명단 전체로 금액부터, 그다음 컵 수</h2><p>첫 루프는 모든 주문의 금액을 더합니다. 첫 루프가 끝나면, 둘째 루프가 같은 모든 주문의 컵 수를 셉니다.</p><pre><code>첫째 루프: 모든 주문의 결제 금액 더하기\n둘째 루프: 같은 모든 주문의 컵 수 더하기</code></pre></article><article class="guide-card"><span class="label">WATCH THE ORDER</span><h2>앞선 결과를 쓰는 작업은 조심하세요</h2><p>금액을 계산하기 전에 합계를 내면 틀립니다. 또 ‘각 손님을 볼 때까지의 누적 금액’을 기록하는 일은, 모든 금액을 먼저 더한 뒤 기록하면 의미가 달라집니다.</p><p>어떤 순서로도 결과를 지킬 수 없다면 <strong>분리 보류</strong>가 정답입니다.</p></article><article class="guide-card"><span class="label">CONTROLS</span><h2>선택 → 배치 → 검사</h2><p><kbd>↑</kbd> <kbd>↓</kbd> 카드 선택 · <kbd>1</kbd> <kbd>2</kbd> 루프 배치<br><kbd>Backspace</kbd> 원본으로 · <kbd>Space</kbd> 실행 검사<br><kbd>Esc</kbd> 일시정지</p><p>카드의 버튼이나 드래그도 사용할 수 있습니다. 루프 안의 위·아래 버튼으로 실행 순서를 바꾸고, ‘두 루프 순서 바꾸기’로 전체 순서를 바꿔 보세요.</p></article></div><div class="learn-note"><h2>이 게임의 검사는 어디까지일까요?</h2><p>문제마다 준비된 18개 데이터로 출력과 데이터 변화를 비교합니다. 지원하는 작은 명령 체계의 게임이며, 임의의 실제 프로그램이 항상 같은 결과를 낸다는 증명은 아닙니다. 더 빨라지는 게임 점수와 실제 코드의 실행 성능도 별개입니다.</p><p>원전: <a href="https://refactoring.com/catalog/splitLoop.html" target="_blank" rel="noopener">Martin Fowler — Split Loop ↗</a>. 문제·그림·코드 예제는 이 게임을 위해 새로 만들었습니다.</p></div><a class="btn btn-primary" href="#/play?mode=practice" data-route="/play?mode=practice">연습으로 감 잡기 ↗</a></section>';
  }
}
export class RecordsScreen extends InfoScreen {
  async mount(){
    this.root.innerHTML='<section class="info-screen"><p class="eyebrow">PERSONAL BESTS</p><h1>나의 루프 기록</h1><p class="hero-description">다른 사람과 비교하지 않고, 어제의 나를 넘어서기.</p><div id="records-content" class="loading-screen">기록을 읽고 있습니다…</div><a class="btn btn-primary" href="#/play?mode=challenge" data-route="/play?mode=challenge">다시 도전하기 ↗</a></section>';
    try {
      const records=await this.ctx.storage.loadRecords();if(this.closed)return;
      const area=this.root.querySelector('#records-content');area.className='';
      if(!records.length){area.replaceChildren(node('p','record-empty','아직 기록이 없어요. 첫 번째 루프를 완성해 볼까요?'));return;}
      const wrap=node('div','records-table');const table=node('table');const head=node('thead');const tr=node('tr');
      for(const label of ['순위','모드','점수','완료','최고 콤보','날짜'])tr.append(node('th','',label));head.append(tr);table.append(head);
      const body=node('tbody');
      records.forEach((r,i)=>{const row=node('tr');for(const v of [i+1,r.mode==='practice'?'연습':'챌린지',r.score.toLocaleString(),r.solved+'/'+r.total,'×'+r.maxCombo,new Date(r.date).toLocaleDateString('ko-KR')])row.append(node('td','',v));body.append(row);});
      table.append(body);wrap.append(table);area.replaceChildren(wrap,node('p','learn-note','이 브라우저의 로컬 기록입니다. 브라우저 데이터를 지우면 사라질 수 있으며, 온라인 순위나 부정행위 방지 기능은 아닙니다.'));
    }catch(error){if(this.closed)return;const area=this.root.querySelector('#records-content');area.className='error-screen';area.replaceChildren(node('p','','기록을 읽지 못했습니다. 저장 공간 설정을 확인하고 다시 시도해 주세요.'));const retry=node('button','btn btn-secondary','다시 읽기');retry.onclick=()=>this.mount();area.append(retry);}
  }
}
export class ResultScreen extends InfoScreen {
  async mount(){
    let result=this.ctx.lastResult;
    let savedEnvelope=null;
    try{savedEnvelope=JSON.parse(sessionStorage.getItem('loop-split:last-result')||'null');}catch{}
    if(!result)result=savedEnvelope?.result||savedEnvelope;
    if(!result||!Number.isFinite(result.score)||!Number.isInteger(result.solved)){this.root.innerHTML='<section class="result-screen"><p class="eyebrow">READY WHEN YOU ARE</p><h1>아직 완료한 게임이 없어요.</h1><a class="btn btn-primary" href="#/play?mode=challenge" data-route="/play?mode=challenge">챌린지 시작</a></section>';return;}
    const matchingEnvelope=savedEnvelope?.result?.id===result.id&&typeof savedEnvelope.saved==='boolean';
    try{const records=await this.ctx.storage.loadRecords();this.ctx.resultSaveError=this.ctx.resultSaveError||(matchingEnvelope?!savedEnvelope.saved:!records.some(row=>row.id===result.id));}catch{this.ctx.resultSaveError=true;}
    if(this.closed)return;
    this.root.innerHTML='<section class="result-screen"><p class="eyebrow">MISSION REPORT</p><h1 id="result-title"></h1><p class="hero-description">작업은 나누고, 의미는 지켰습니다.</p><div class="score-hero"><span>FINAL SCORE</span><strong id="result-score"></strong></div><div class="result-stats"><div class="stat"><strong id="result-solved"></strong><span>라운드 완료</span></div><div class="stat"><strong id="result-combo"></strong><span>최고 콤보</span></div><div class="stat"><strong id="result-mode"></strong><span>플레이 모드</span></div></div><p class="learn-note" id="result-save-state"></p><div class="hero-actions"><a class="btn btn-primary" href="#/play?mode=challenge" data-route="/play?mode=challenge">한 번 더 도전 ↗</a><a class="btn btn-secondary" href="#/records" data-route="/records">기록 보기</a><a class="text-link" href="#/guide" data-route="/guide">Split Loop 더 알아보기</a></div></section>';
    this.root.querySelector('#result-title').textContent=result.solved===result.total?'SPLIT COMPLETE.':'다음엔, 한 루프 더.';
    this.root.querySelector('#result-score').textContent=result.score.toLocaleString();
    this.root.querySelector('#result-solved').textContent=result.solved+' / '+result.total;
    this.root.querySelector('#result-combo').textContent='×'+result.maxCombo;
    this.root.querySelector('#result-mode').textContent=result.mode==='practice'?'연습':'90초';
    this.root.querySelector('#result-save-state').textContent=this.ctx.resultSaveError?'기록을 읽거나 저장하지 못했습니다. 현재 점수는 이 화면에 보존되어 있습니다.':'플레이 완료! 이 브라우저에 점수순 상위 20개 기록을 보관합니다.';
    if(this.ctx.resultSaveError){const retry=node('button','btn btn-secondary','기록 저장 다시 시도');retry.onclick=async()=>{retry.disabled=true;try{await this.ctx.storage.saveResult(result);await this.ctx.storage.clearRunIfMatches(matchingEnvelope?savedEnvelope.savedRun:null);this.ctx.resultSaveError=false;try{sessionStorage.setItem('loop-split:last-result',JSON.stringify({result,saved:true}));}catch{}if(!this.closed)await this.mount();}catch{if(!this.closed){retry.disabled=false;this.ctx.toast('아직 저장할 수 없습니다.');}}};this.root.append(retry);}
  }
}
export class NotFoundScreen extends InfoScreen {
  async mount(){this.root.innerHTML='<section class="notfound-screen"><p class="eyebrow">404 / LOST IN THE LOOP</p><h1>이 루프는 없네요.</h1><a class="btn btn-primary" href="#/" data-route="/">시작 화면으로</a></section>';}
}
