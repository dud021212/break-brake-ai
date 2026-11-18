import {COLS,ROWS,CELL_H,MIN_ANGLE,MAX_ANGLE,createGame,emptyGrid,simulateTurn} from './core.js?v=4';

const BX=60,BY=124;
const segs=[[9,1],[15,8],[15,21],[9,27],[1,21],[1,8],[9,14]];
const masks={
  '1111110':0,'0110000':1,'1101101':2,'1111001':3,'0110011':4,
  '1011011':5,'1011111':6,'1110000':7,'1111111':8,'1111011':9
};
let model=null;
fetch('./model.json').then(r=>r.ok?r.json():null).then(m=>{model=m;}).catch(()=>{});
function pixel(img,x,y){
  x=Math.max(0,Math.min(img.width-1,Math.round(x)));
  y=Math.max(0,Math.min(img.height-1,Math.round(y)));
  const k=(y*img.width+x)*4,d=img.data;
  return [d[k],d[k+1],d[k+2]];
}
function white(p){return p[0]>215&&p[1]>215&&p[2]>215;}
function readDigit(img,x,y){
  const bits=segs.map(([dx,dy])=>white(pixel(img,x+dx,y+dy))?'1':'0').join('');
  return masks[bits]??null;
}
function readNumber(img,x,y,slots){
  let value=0,any=false;
  for(let i=0;i<slots;i++){
    const d=readDigit(img,x+i*21,y);
    if(d!==null){value=value*10+d;any=true;}
  }
  return any?value:null;
}
export function readState(img){
  const s=createGame(12345);
  s.grid=emptyGrid();s.green=emptyGrid();s.phase='aiming';s.balls=[];
  for(let r=1;r<ROWS-1;r++)for(let c=0;c<COLS;c++){
    const x=BX+c*100,y=BY+r*CELL_H*100;
    const p=pixel(img,x+10,y+35);
    const brick=p[0]>45&&p[1]>95&&p[2]>95;
    if(brick){s.grid[r][c]=readNumber(img,x+18,y+18,3)||1;continue;}
    const q=pixel(img,x+58,y+CELL_H*50);
    if(q[1]>170&&q[0]<170&&q[2]<190)s.green[r][c]=1;
  }
  const balls=readNumber(img,491,62,3);
  const score=readNumber(img,62,62,4);
  s.ballCount=Math.max(1,balls||1);s.score=Math.max(1,score||1);
  s.turn=s.score;
  const ly=BY+(ROWS*CELL_H-.08)*100;
  let lo=-1,hi=-1;
  for(let x=BX+10;x<BX+590;x++){
    const p=pixel(img,x,ly);
    if(p[0]>125&&p[1]>230&&p[2]>190){if(lo<0)lo=x;hi=x;}
  }
  s.launcherX=lo<0?3:Math.max(.12,Math.min(5.88,((lo+hi)/2-BX)/100));
  return s;
}
function features(s,r){
  const total=s.grid.flat().reduce((a,b)=>a+b,0);
  const danger=s.grid[8].reduce((a,b)=>a+b,0);
  const greens=s.green.flat().reduce((a,b)=>a+b,0);
  return [r.angle/180,s.ballCount/30,s.launcherX/6,total/150,danger/70,
    greens/10,r.damage/150,r.dangerDamage/70,r.collected/5,r.nextX/6,r.survive?1:0];
}
function modelScore(s,r){
  if(!model?.weights||model.weights.length!==11)return 0;
  const f=features(s,r);
  return model.bias+f.reduce((a,v,i)=>a+v*model.weights[i],0);
}
function compare(a,b,s){
  if(a.survive!==b.survive)return a.survive?1:-1;
  if(!a.survive&&a.remaining9!==b.remaining9)return b.remaining9-a.remaining9;
  const av=a.collected*120+a.dangerDamage*3+a.damage+modelScore(s,a)*4;
  const bv=b.collected*120+b.dangerDamage*3+b.damage+modelScore(s,b)*4;
  return av-bv;
}
export function plan(s){
  const results=[];
  const seen=new Set();
  const min=MIN_ANGLE*100, max=MAX_ANGLE*100;
  const rank=()=>results.sort((a,b)=>compare(b,a,s));
  function evaluate(hundredths){
    if(hundredths<min||hundredths>max||seen.has(hundredths))return;
    seen.add(hundredths);
    const result=simulateTurn(s,hundredths/100,1400);
    if(result)results.push(result);
  }
  for(let angle=min;angle<=max;angle+=400)evaluate(angle);
  evaluate(max);
  for(const [step,radius] of [[100,200],[10,50],[1,5]]){
    rank();
    const centers=[];
    for(const result of results){
      const center=Math.round(result.angle*100);
      if(centers.some(other=>Math.abs(center-other)<=radius))continue;
      centers.push(center);
      if(centers.length===5)break;
    }
    for(const center of centers){
      for(let offset=-radius;offset<=radius;offset+=step)evaluate(center+offset);
    }
  }
  rank();
  return {best:results[0],count:results.length};
}
let clock=null;
self.onmessage=({data})=>{
  if(data.type==='start-clock'||data.type==='stop-clock'){
    clearInterval(clock);
    clock=data.type==='start-clock'
      ? setInterval(()=>self.postMessage({type:'tick',jobId:data.jobId}),30)
      : null;
    return;
  }
  try{
    const s=readState(data.image);
    const {best,count}=plan(s);
    self.postMessage({jobId:data.jobId,angle:best?.angle??90,survive:!!best?.survive,candidates:count,
      perceived:{ballCount:s.ballCount,launcherX:s.launcherX,bricks:s.grid.flat().filter(Boolean).length}});
  }catch(e){self.postMessage({jobId:data.jobId,error:String(e)});}
};
