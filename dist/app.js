import {createGame, launch, stepGame, COLS, ROWS, CELL_H, RADIUS, FLOOR, MIN_ANGLE, MAX_ANGLE} from './core.js?v=5';
import {drawNumber, SCORE_DIGITS, BALL_DIGITS, BRICK_DIGITS} from './digits.js?v=5';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', {willReadFrequently: true});
const el = id => document.getElementById(id);
const BX = 60, BY = 124, SCALE = 100;
const colors = ['#43d3c7','#4bc6e6','#6d9fff','#a98cf1','#ed8bc9','#fcad7a'];

let state = createGame();
let aiMode = false, aiBusy = false, speed = 1, drag = null, aim = 90;
let lastTime = performance.now(), needsRender = true;
let aiClockTime = 0, aiTimeRemaining = 0;
const AI_STEP = 0.03;
const MAX_SPEED = 64;
const worker = new Worker(new URL('./ai-worker.js?v=6', import.meta.url), {type:'module'});
let jobId = 0;
let best = Number(localStorage.getItem('break-brake-best') || 0);

function rounded(x,y,w,h,r,fill,stroke=null) {
  ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
  if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}
}
function text(t,x,y,size=18,color='#f5f8ff',align='left',weight=700){
  ctx.font=`${weight} ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(t,x,y);
}
function drawNextLauncher(x,y){
  const color='#ffda88';
  ctx.beginPath();ctx.arc(x,y,17,0,Math.PI*2);
  ctx.strokeStyle=color;ctx.lineWidth=3;ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x,y+20);ctx.lineTo(x-6,y+28);ctx.lineTo(x+6,y+28);
  ctx.closePath();ctx.fillStyle=color;ctx.fill();
  const labelX=Math.max(BX+70,Math.min(BX+COLS*SCALE-70,x));
  text('다음 발사 위치',labelX,y+49,16,color,'center');
}
function drawBoard(){
  const grad=ctx.createLinearGradient(0,0,0,canvas.height);
  grad.addColorStop(0,'#152a4c');grad.addColorStop(1,'#0d1931');
  ctx.fillStyle=grad;ctx.fillRect(0,0,720,940);
  rounded(34,27,652,75,18,'#1b3558','#355677');
  text('SCORE',62,54,12,'#91b6d0');drawNumber(ctx,state.score,SCORE_DIGITS);
  text('BALLS',484,54,12,'#91b6d0');drawNumber(ctx,state.ballCount,BALL_DIGITS);
  text('TURN '+state.turn,364,72,16,'#90aeca','center');
  rounded(BX-8,BY-8,616,684,16,'#0a1a31','#335171');
  for(let row=0;row<ROWS;row++){
    for(let col=0;col<COLS;col++){
      const x=BX+col*SCALE,y=BY+row*CELL_H*SCALE;
      ctx.strokeStyle=row===8?'#855065':'#263d5c';ctx.lineWidth=1;
      ctx.strokeRect(x,y,SCALE,CELL_H*SCALE);
      const hp=state.grid[row][col];
      if(hp>0){
        const color=colors[Math.min(colors.length-1,Math.floor((hp-1)/5))];
        ctx.shadowColor=color;ctx.shadowBlur=12;
        rounded(x+1.5,y+1.3,97,63.7,9,color);
        ctx.shadowBlur=0;
        rounded(x+4,y+3,91,9,5,'#ffffff34');
        drawNumber(ctx,hp,BRICK_DIGITS,x,y);
      }else if(state.green[row][col]){
        const cx=x+50,cy=y+CELL_H*SCALE/2;
        ctx.shadowColor='#76f194';ctx.shadowBlur=20;ctx.fillStyle='#60e98a';
        ctx.beginPath();ctx.arc(cx,cy,14,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
        ctx.fillStyle='#e0ffe9';ctx.beginPath();ctx.arc(cx-3,cy-4,4,0,Math.PI*2);ctx.fill();
      }
    }
  }
  ctx.strokeStyle='#dc6c9d';ctx.lineWidth=2;ctx.setLineDash([7,6]);
  ctx.beginPath();ctx.moveTo(BX,BY+9*CELL_H*SCALE);ctx.lineTo(BX+600,BY+9*CELL_H*SCALE);ctx.stroke();ctx.setLineDash([]);
  const lx=BX+state.launcherX*SCALE,ly=BY+FLOOR*SCALE;
  if(state.phase==='aiming'){
    const a=aim*Math.PI/180;
    ctx.fillStyle='#a8ffedaa';
    for(let i=1;i<=9;i++){
      const d=i*24,px=lx+Math.cos(a)*d,py=ly-Math.sin(a)*d;
      if(px<BX||px>BX+600||py<BY)break;
      ctx.beginPath();ctx.arc(px,py,Math.max(2,5-i*.3),0,Math.PI*2);ctx.fill();
    }
  }
  ctx.shadowColor='#80fff0';ctx.shadowBlur=22;ctx.fillStyle='#91fff0';
  ctx.beginPath();ctx.arc(lx,ly,13,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  for(const b of state.balls){
    ctx.shadowColor='#fff7c5';ctx.shadowBlur=10;ctx.fillStyle='#fff3c9';
    ctx.beginPath();ctx.arc(BX+b.x*SCALE,BY+b.y*SCALE,RADIUS*SCALE,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
  }
  if(state.phase==='moving'&&state.nextX!==null){
    drawNextLauncher(BX+state.nextX*SCALE,ly);
  }
  text(state.phase==='moving'?'공이 돌아올 때까지 기다려주세요':'발사 지점을 누르고 위로 드래그',360,867,16,'#abc3db','center',600);
  text(aiMode?'✦ AI PLAYING':'◉ HUMAN PLAYING',360,902,13,'#72e3d5','center',800);
}
function render(){
  drawBoard();
  needsRender=false;
}
function updateUI(){
  el('turnStat').textContent=state.turn;
  el('ballStat').textContent=state.ballCount;
  el('bestStat').textContent=best;
  el('modeLabel').textContent=aiMode?'AI 플레이':'직접 플레이';
  el('humanButton').classList.toggle('active',!aiMode);
  el('aiButton').classList.toggle('active',aiMode);
  el('humanButton').setAttribute('aria-pressed',String(!aiMode));
  el('aiButton').setAttribute('aria-pressed',String(aiMode));
  el('overlay').classList.toggle('hidden',state.phase!=='game_over');
  if(state.phase==='game_over') el('finalScore').textContent=`${state.score-1}턴 생존 · 공 ${state.ballCount}개`;
}
function setMode(next){
  if(next===aiMode)return;
  stopAIClock();
  aiMode=next;aiBusy=false;jobId++;drag=null;
  needsRender=true;
  el('aiStatus').textContent=next?'화면을 읽고 발사각을 계산할게요.':'AI 모드를 선택하면 현재 화면을 읽고 발사각을 찾습니다.';
  updateUI();
  if(aiMode&&state.phase==='moving')startAIClock();
  else if(aiMode)requestAI();
}
function reset(){
  stopAIClock();
  jobId++;aiBusy=false;state=createGame();aim=90;drag=null;
  render();updateUI();requestAI();
}

function localPoint(ev){
  const r=canvas.getBoundingClientRect();
  return {x:(ev.clientX-r.left)*720/r.width,y:(ev.clientY-r.top)*940/r.height};
}
function angleFrom(p){
  const x=BX+state.launcherX*SCALE,y=BY+FLOOR*SCALE;
  const dx=p.x-x,dy=y-p.y;
  return Math.max(MIN_ANGLE,Math.min(MAX_ANGLE,Math.atan2(Math.max(1,dy),dx)*180/Math.PI));
}
canvas.addEventListener('pointerdown',ev=>{
  if(aiMode||state.phase!=='aiming')return;
  drag=localPoint(ev);canvas.setPointerCapture(ev.pointerId);
  aim=angleFrom(drag);needsRender=true;
});
canvas.addEventListener('pointermove',ev=>{
  if(!drag)return;
  const nextAim=angleFrom(localPoint(ev));
  if(nextAim===aim)return;
  aim=nextAim;needsRender=true;
});
canvas.addEventListener('pointerup',ev=>{
  if(!drag)return;
  const p=localPoint(ev),distance=Math.hypot(p.x-drag.x,p.y-drag.y);
  drag=null;if(distance>12)launch(state,angleFrom(p));
  needsRender=true;
});
canvas.addEventListener('pointercancel',()=>{drag=null;});
el('humanButton').onclick=()=>setMode(false);
el('aiButton').onclick=()=>setMode(true);
el('restartButton').onclick=reset;el('retryButton').onclick=reset;
el('speedButton').onclick=()=>{
  speed=speed<MAX_SPEED?speed*2:1;
  el('speedButton').textContent=`속도 ×${speed}`;
};

function startAIClock(){
  aiClockTime=performance.now();
  aiTimeRemaining=0;
  worker.postMessage({type:'start-clock',jobId});
}
function stopAIClock(){
  worker.postMessage({type:'stop-clock'});
}
function advanceAITurn(){
  if(state.phase!=='moving')return;
  const now=performance.now();
  aiTimeRemaining+=Math.min(2,(now-aiClockTime)/1000)*speed;
  aiClockTime=now;
  while(aiTimeRemaining>=AI_STEP&&state.phase==='moving'){
    stepGame(state,AI_STEP);
    aiTimeRemaining-=AI_STEP;
    needsRender=true;
  }
  if(state.phase==='moving')return;
  stopAIClock();
  recordBest();
  updateUI();
  requestAI();
}
worker.onmessage=({data})=>{
  if(data.jobId!==jobId||!aiMode)return;
  if(data.type==='tick'){
    advanceAITurn();
    return;
  }
  if(state.phase!=='aiming')return;
  aiBusy=false;
  if(data.error){el('aiStatus').textContent='탐색 오류: '+data.error;return;}
  aim=data.angle;
  needsRender=true;
  el('aiAngle').textContent=`${data.angle.toFixed(2)}°`;
  el('aiCandidates').textContent=String(data.candidates);
  el('aiStatus').textContent=data.survive?'생존 가능한 각도를 선택했습니다.':'위험을 줄이는 각도를 선택했습니다.';
  if(launch(state,data.angle))startAIClock();
};
function requestAI(){
  if(!aiMode||aiBusy||state.phase!=='aiming')return;
  aiBusy=true;jobId++;
  el('aiStatus').textContent='화면을 분석하고 각도를 비교하는 중…';
  render();
  const image=ctx.getImageData(0,0,720,940);
  worker.postMessage({jobId,image},[image.data.buffer]);
}
function recordBest(){
  if(state.phase==='game_over'&&state.score-1>best){best=state.score-1;localStorage.setItem('break-brake-best',String(best));}
}
function frame(t){
  const dt=Math.min(.05,(t-lastTime)/1000)*speed;lastTime=t;
  if(!aiMode&&state.phase==='moving'){
    stepGame(state,dt);
    needsRender=true;
    if(state.phase!=='moving'){
      recordBest();
      updateUI();
    }
  }
  if(needsRender)render();
  requestAnimationFrame(frame);
}
updateUI();render();requestAnimationFrame(frame);
