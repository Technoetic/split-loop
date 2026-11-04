import {VersionService} from './services/version-service.js';
import {StorageService} from './services/storage-service.js';
import {LevelService} from './services/level-service.js';
import {SoundService} from './services/sound-service.js';
import {Router} from './services/router.js';
import {GameScreen} from './screens/game-screen.js';
import {HomeScreen,GuideScreen,RecordsScreen,ResultScreen,NotFoundScreen} from './screens/info-screens.js';

class LoopSplitApp {
  constructor(){
    this.root=document.querySelector('#app');this.sequence=0;this.current=null;
    this.baseUrl=new URL('./',location.href);this.loadedBuild=document.querySelector('meta[name="app-build"]').content;
    this.storage=new StorageService();this.sound=new SoundService();this.levels=new LevelService({baseUrl:this.baseUrl});
    this.version=new VersionService({baseUrl:this.baseUrl,loadedBuild:this.loadedBuild});
    this.ctx={baseUrl:this.baseUrl,loadedBuild:this.loadedBuild,storage:this.storage,sound:this.sound,levels:this.levels,version:this.version,lastResult:null,resultSaveError:false,
      assetUrl:name=>new URL('assets/'+name.replace('.svg','.'+this.loadedBuild+'.svg'),this.baseUrl).href,toast:message=>this.toast(message)};
    this.router=new Router({baseUrl:this.baseUrl,version:this.version,readState:()=>this.readState(),onNavigate:route=>this.show(route),onProtect:details=>this.protect(details),onUpdate:()=>this.update(),onError:error=>this.toast(error.message||'화면을 이동하지 못했습니다.')});
    this.ctx.router=this.router;
    document.querySelector('.sound-toggle').addEventListener('click',()=>{const enabled=this.sound.toggle();const b=document.querySelector('.sound-toggle');b.setAttribute('aria-pressed',String(enabled));b.textContent=enabled?'소리 켜짐':'소리 꺼짐';if(enabled)this.sound.play('select');});
    addEventListener('beforeunload',event=>{const state=this.readState();if(state.dirty||state.saving){event.preventDefault();event.returnValue='';}});
  }
  readState(){return this.current?.readState()||{dirty:false,saving:this.storage.saving};}
  async show(route){
    const seq=++this.sequence;this.current?.dispose();
    const Screen={'/':HomeScreen,'/play':GameScreen,'/guide':GuideScreen,'/records':RecordsScreen,'/result':ResultScreen}[route.path]||NotFoundScreen;
    const screen=new Screen(this.ctx,this.root,route);this.current=screen;
    await screen.mount();if(seq!==this.sequence)return;
    document.querySelectorAll('a[data-route]').forEach(a=>{const path=a.dataset.route.split('?')[0];if(path===route.path)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    if(screen.paused)screen.focusPause();else this.root.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});
  }
  update(){const banner=document.querySelector('#update-banner');banner.hidden=!this.version.pendingBuild;if(!banner.hidden)banner.textContent='새 버전이 준비되어 있습니다. 진행 중인 게임을 보존하고, 다음 안전한 화면 이동에서 자동으로 적용합니다.';}
  toast(message){const el=document.querySelector('#toast');el.textContent=message;el.hidden=false;clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>el.hidden=true,4400);}
  async protect({changed}){
    this.current?.pause?.();
    const dialog=document.querySelector('#guard-dialog'),error=document.querySelector('#guard-error');
    error.hidden=true;document.querySelector('#guard-description').textContent=changed?'새 버전이 준비되어 있어요. 배치와 남은 시간을 저장한 뒤 이동하면 새 버전에서 이어갈 수 있습니다.':'현재 배치와 남은 시간을 저장하고 이동할 수 있습니다.';
    const buttons=[...dialog.querySelectorAll('button')];buttons.forEach(b=>b.disabled=false);
    return new Promise(resolve=>{
      let busy=false;
      const finish=value=>{dialog.removeEventListener('click',click);dialog.removeEventListener('cancel',cancel);dialog.close();resolve(value);};
      const cancel=e=>{e.preventDefault();if(!busy)finish(false);};
      const click=async event=>{
        const action=event.target.closest('[data-guard]')?.dataset.guard;if(!action||busy)return;
        if(action==='stay'){finish(false);return;}
        if(action==='discard'){this.current?.discard?.();finish(true);return;}
        busy=true;buttons.forEach(b=>b.disabled=true);
        try{await this.current.save();finish(true);}
        catch{error.hidden=false;error.textContent='저장하지 못했습니다. 게임은 그대로 보존되어 있어요. 다시 시도하거나 계속하기를 눌러 주세요.';busy=false;buttons.forEach(b=>b.disabled=false);}
      };
      dialog.addEventListener('click',click);dialog.addEventListener('cancel',cancel);dialog.showModal();
    });
  }
  async start(){await this.router.start();}
}
const app=new LoopSplitApp();
app.start().catch(error=>{console.error(error);document.querySelector('#app').textContent='게임을 시작하지 못했습니다. 일반 새로고침 후 다시 시도해 주세요.';});
