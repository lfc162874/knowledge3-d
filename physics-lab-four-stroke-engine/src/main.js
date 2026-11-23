import { createStudio } from './studio.js';

const $ = Object.fromEntries([...document.querySelectorAll('[id]')].map(el=>[el.id,el]));
const stages=[
  {name:'吸气',en:'INTAKE',summary:'活塞下行，气缸容积增大。蓝色的新鲜混合气经进气门流入气缸。',flow:'飞轮带动活塞',energy:'飞轮依靠惯性继续转动，通过曲轴和连杆带动活塞吸气。',cue:'看左侧进气门。活塞下降，蓝色混合气进入气缸。'},
  {name:'压缩',en:'COMPRESSION',summary:'两个气门关闭，活塞上行。同一团混合气被挤入更小的空间，温度和压强升高。',flow:'机械能 → 混合气内能',energy:'飞轮带动活塞对混合气做功，混合气的内能增加。',cue:'两侧气门关闭。观察蓝色气体如何随活塞上升而被压缩。'},
  {name:'做功',en:'POWER',summary:'火花塞点燃混合气。高温高压的燃气膨胀，推着活塞下行，带动曲轴转动。',flow:'化学能 → 内能 → 机械能',energy:'燃烧释放能量，燃气对活塞做功。飞轮加速并储存一部分动能。',cue:'注意中央闪光。混合气燃烧后膨胀，推动活塞和曲轴。'},
  {name:'排气',en:'EXHAUST',summary:'排气门打开，活塞再次上行，把灰色废气推出气缸。到达上止点后开始下一轮吸气。',flow:'飞轮带动排气',energy:'飞轮带动活塞推出废气，废气也带走了一部分内能。',cue:'看右侧排气门。活塞上升，灰色废气流出气缸。'}
];
const tabs=[...document.querySelectorAll('button[data-stage]')];
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const state={degree:reduced?90:0,playing:!reduced,rate:1,cut:reduced?1:0,targetCut:1,
  tour:!reduced,intro:0,tourEnd:false,stopAt:null,stage:-1};
const introDuration=4.6;
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
function stageNumber(){return Math.min(3,Math.floor(state.degree/180));}
function write(el,text){if(el.textContent!==text)el.textContent=text;}
function setCaption(text=''){
  $.tourCaption.hidden=!text;
  write($.tourCaption,text);
}
function leaveTour(){
  state.tour=false;state.tourEnd=false;
  $.tour.setAttribute('aria-pressed','false');
  write($.tour.querySelector('span'),'教学演示');
  setCaption();
}
function manual(){
  if(state.tour && state.intro<introDuration)studio?.reset();
  leaveTour();state.stopAt=null;
}
let studio;
function updateControls(){
  $.play.dataset.playing=String(state.playing);
  $.play.setAttribute('aria-label',state.playing?'暂停播放':'继续播放');
  $.tour.setAttribute('aria-pressed',String(state.tour));
  write($.tour.querySelector('span'),state.tour?'退出演示':'教学演示');
  write($.modeTitle,state.tour?(state.tourEnd?'完整循环':'教学演示'):'自由观察');
  const open=(state.tour?state.cut:state.targetCut)>.5;
  $.cutaway.setAttribute('aria-pressed',String(open));
  write($.viewText,open?'剖面视图':'完整外观');
}
function updateReadout(){
  const st=stageNumber(),s=stages[st],deg=state.degree;
  if(st!==state.stage){
    state.stage=st;document.body.dataset.stage=String(st);
    write($.stageName,s.name+'冲程');write($.stageEnglish,s.en);
    write($.stageIndex,'0'+(st+1)+' / 04');write($.stageAngle,(st*180)+'° – '+((st+1)*180)+'°');
    write($.stageDescription,s.summary);write($.energyFlow,s.flow);write($.energy,s.energy);
    tabs.forEach((tab,i)=>tab.setAttribute('aria-current',String(i===st)));
  }
  const exact=Math.abs(deg/180-Math.round(deg/180))<1e-7;
  const pistonDown=st===0||st===2;
  const angle=Math.floor(deg+1e-7);
  document.body.style.setProperty('--crank-angle',angle+'deg');write($.angle,String(angle));$.scrub.value=deg.toFixed(2);
  $.scrub.style.setProperty('--timeline-progress',(deg/7.2)+'%');
  $.scrub.setAttribute('aria-valuetext',s.name+'冲程，曲轴 '+angle+' 度');
  write($.pistonState,exact?(Math.round(deg/180)%2?'下止点':'上止点'):(pistonDown?'↓ 向下运动':'↑ 向上运动'));
  for(const [el,active] of [[$.intakeState,st===0&&!exact],[$.exhaustState,st===3&&!exact]]){
    el.dataset.open=String(active);write(el,active?'开启':'关闭');
  }
  updateControls();
}
function playPause(){state.playing=!state.playing;updateControls();}
$.play.addEventListener('click',playPause);
$.cutaway.addEventListener('click',()=>{
  const open=(state.tour?state.cut:state.targetCut)>.5;
  manual();state.targetCut=open?0:1;updateControls();
});
$.resetView.addEventListener('click',()=>{manual();studio?.reset();updateControls();});
$.tour.addEventListener('click',()=>{
  if(state.tour){leaveTour();state.targetCut=1;}
  else {Object.assign(state,{tour:true,intro:0,degree:0,playing:true,cut:0,targetCut:1,tourEnd:false,stopAt:null});}
  updateReadout();
});
$.speed.addEventListener('change',()=>{state.rate=Number($.speed.value);});
$.step.addEventListener('click',()=>{
  manual();state.targetCut=1;
  if(state.degree>=720-1e-6)state.degree=0;
  state.stopAt=Math.min(720,(Math.floor(state.degree/180)+1)*180);
  state.playing=true;updateReadout();
});
tabs.forEach((btn,st)=>btn.addEventListener('click',()=>{
  manual();state.targetCut=1;state.degree=st*180;state.playing=true;updateReadout();
}));
$.scrub.addEventListener('input',()=>{
  manual();state.playing=false;state.targetCut=1;state.degree=Number($.scrub.value);updateReadout();
});
window.addEventListener('keydown',e=>{
  if(e.code==='Space'&&!e.repeat&&!e.ctrlKey&&!e.metaKey&&!e.altKey && !e.target.closest('button,input,select,textarea')){
    e.preventDefault();playPause();
  }
});
function tick(dt){
  const tourIntro=state.tour&&state.intro<introDuration;
  if(tourIntro){
    if(state.playing)state.intro=Math.min(introDuration,state.intro+dt*state.rate);
    state.cut=smooth((state.intro-1.15)/2.15);
    if(state.intro<1.75)setCaption('先看整机。下方的曲轴和飞轮绕同一根轴转动。');
    else setCaption('外壳逐渐透开，观察气缸内的活塞和下方的连杆。');
  }else{
    state.cut+=(state.targetCut-state.cut)*(reduced?1:1-Math.exp(-dt*9));
    if(state.playing){
      const next=state.degree+dt*state.rate*(state.tour&&!state.tourEnd?38:55);
      if(state.stopAt!==null && next>=state.stopAt){
        state.degree=state.stopAt;state.playing=false;state.stopAt=null;
      }else{
        if(next>=720&&state.tour){
          if(!state.tourEnd){state.tourEnd=true;}
          else {leaveTour();}
        }
        state.degree=next%720;
      }
    }
    if(state.tour)setCaption(state.tourEnd?'完整循环：每两圈曲轴只有一次做功，飞轮带着其余三个冲程继续运行。':stages[stageNumber()].cue);
  }
  updateReadout();
  let pose=null;
  if(state.tour){
    const progress=smooth((state.intro-.7)/3.45);
    const close=state.tourEnd?.63*(1-smooth(state.degree/65)):smooth((state.intro-2.2)/2.4)*.63;
    const wheel=state.tourEnd?smooth(state.degree/110)*(1-smooth((state.degree-180)/152)):0;
    pose={progress,close,wheel};
  }
  studio.render(state.degree,state.cut,stageNumber(),pose);
}

function start(){
  try{studio=createStudio($.viewport,()=>{if(state.tour){leaveTour();state.targetCut=1;}updateControls();});}
  catch(err){
    const message=document.createElement('p');
    message.className='render-error';message.setAttribute('role','alert');
    message.textContent='三维视窗未能启动。请使用支持 WebGL 2 的浏览器，并打开硬件加速后刷新。';
    $.viewport.append(message);console.error(err);return;
  }
  let prev;
  function frame(time){
    const delta=prev===undefined?0:(time-prev)/1000;
    const dt=Math.min(.65,delta);
    if(state.playing)studio.adapt(delta);
    prev=time;tick(dt);requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange',()=>{prev=undefined;});
  requestAnimationFrame(frame);
}
start();
