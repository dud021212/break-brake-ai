import {createGame, launch, stepGame, COLS, ROWS, CELL_H, RADIUS, FLOOR, MIN_ANGLE, MAX_ANGLE} from './core.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', {willReadFrequently: true});
const el = id => document.getElementById(id);
const BX = 60, BY = 124, SCALE = 100;
const colors = ['#43d3c7','#4bc6e6','#6d9fff','#a98cf1','#ed8bc9','#fcad7a'];
const segments = [
  [3,0,12,3],[14,3,3,10],[14,16,3,10],[3,26,12,3],
  [0,16,3,10],[0,3,3,10],[3,13,12,3]
];
const glyphs = {0:[0,1,2,3,4,5],1:[1,2],2:[0,1,6,4,3],3:[0,1,6,2,3],
  4:[5,6,1,2],5:[0,5,6,2,3],6:[0,5,6,4,2,3],7:[0,1,2],
  8:[0,1,2,3,4,5,6],9:[0,1,2,3,5,6]};

let state = createGame();
let aiMode = false, aiBusy = false, speed = 1, drag = null, aim = 90;
let lastTime = performance.now(), uiClock = 0;
let worker = new Worker('./ai-worker.js', {type:'module'});
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
function digit(n,x,y,scale=1,color='#efffff'){
  ctx.fillStyle=color;
  for(const id of glyphs[n]||[]) {const [a,b,w,h]=segments[id];ctx.fillRect(x+a*scale,y+b*scale,w*scale,h*scale);}
}
function digits(value,x,y,slots=3,scale=1,color='#efffff'){
  const s=String(Math.max(0,Math.floor(value))).slice(-slots).padStart(slots,' ');
  for(let i=0;i<slots;i++) if(s[i]!==' ') digit(Number(s[i]),x+i*21*scale,y,scale,color);
}
function drawBoard(){
  const grad=ctx.createLinearGradient(0,0,0,canvas.height);
  grad.addColorStop(0,'#152a4c');grad.addColorStop(1,'#0d1931');
  ctx.fillStyle=grad;ctx.fillRect(0,0,720,940);
  rounded(34,27,652,75,18,'#1b3558','#355677');
  text('SCORE',62,54,12,'#91b6d0');digits(state.score,62,62,4,1,'#efffff');
  text('BALLS',484,54,12,'#91b6d0');digits(state.ballCount,491,62,3,1,'#77e8db');
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
        digits(hp,x+18,y+18,3,1,'#ffffff');
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
  text(state.phase==='moving'?'공이 돌아올 때까지 기다려주세요':'발사 지점을 누르고 위로 드래그',360,867,16,'#abc3db','center',600);
  text(aiMode?'✦ AI PLAYING':'◉ HUMAN PLAYING',360,902,13,'#72e3d5','center',800);
}
function render(){drawBoard();}
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
  aiMode=next;aiBusy=false;jobId++;drag=null;
  el('aiStatus').textContent=next?'화면을 읽고 발사각을 계산할게요.':'AI 모드를 선택하면 현재 화면을 읽고 발사각을 찾습니다.';
  updateUI();
}
function reset(){jobId++;aiBusy=false;state=createGame();aim=90;drag=null;render();updateUI();}

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
  aim=angleFrom(drag);render();
});
canvas.addEventListener('pointermove',ev=>{if(!drag)return;aim=angleFrom(localPoint(ev));render();});
canvas.addEventListener('pointerup',ev=>{
  if(!drag)return;
  const p=localPoint(ev),distance=Math.hypot(p.x-drag.x,p.y-drag.y);
  drag=null;if(distance>12)launch(state,angleFrom(p));
  render();
});
canvas.addEventListener('pointercancel',()=>{drag=null;});
el('humanButton').onclick=()=>setMode(false);
el('aiButton').onclick=()=>setMode(true);
el('restartButton').onclick=reset;el('retryButton').onclick=reset;
el('speedButton').onclick=()=>{speed=speed===1?2:speed===2?4:1;el('speedButton').textContent=`속도 ×${speed}`;};

worker.onmessage=({data})=>{
  if(data.jobId!==jobId||!aiMode||state.phase!=='aiming')return;
  aiBusy=false;
  if(data.error){el('aiStatus').textContent='탐색 오류: '+data.error;return;}
  aim=data.angle;
  el('aiAngle').textContent=`${data.angle.toFixed(1)}°`;
  el('aiCandidates').textContent=String(data.candidates);
  el('aiStatus').textContent=data.survive?'생존 가능한 각도를 선택했습니다.':'위험을 줄이는 각도를 선택했습니다.';
  launch(state,data.angle);
};
function requestAI(){
  if(!aiMode||aiBusy||state.phase!=='aiming')return;
  aiBusy=true;jobId++;
  el('aiStatus').textContent='화면을 분석하고 각도를 비교하는 중…';
  const image=ctx.getImageData(0,0,720,940);
  worker.postMessage({jobId,image},[image.data.buffer]);
}
function frame(t){
  const dt=Math.min(.05,(t-lastTime)/1000)*speed;lastTime=t;
  if(state.phase==='moving')stepGame(state,dt);
  if(state.phase==='game_over'&&state.score-1>best){best=state.score-1;localStorage.setItem('break-brake-best',String(best));}
  render();
  if(t-uiClock>120){updateUI();uiClock=t;}
  requestAI();
  requestAnimationFrame(frame);
}
updateUI();render();requestAnimationFrame(frame);
