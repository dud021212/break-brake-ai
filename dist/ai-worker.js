import {COLS,ROWS,CELL_H,MIN_ANGLE,MAX_ANGLE,createGame,emptyGrid,simulateTurn} from './core.js?v=5';
import {readNumber, SCORE_DIGITS, BALL_DIGITS, BRICK_DIGITS} from './digits.js?v=5';

const BX=60,BY=124;
let model=null;
fetch('./model.json').then(r=>r.ok?r.json():null).then(m=>{model=m;}).catch(()=>{});
function pixel(img,x,y){
  x=Math.max(0,Math.min(img.width-1,Math.round(x)));
  y=Math.max(0,Math.min(img.height-1,Math.round(y)));
  const k=(y*img.width+x)*4,d=img.data;
  return [d[k],d[k+1],d[k+2]];
}
export function readState(img){
  const s=createGame(12345);
  s.grid=emptyGrid();s.green=emptyGrid();s.phase='aiming';s.balls=[];
  for(let r=1;r<ROWS-1;r++)for(let c=0;c<COLS;c++){
    const x=BX+c*100,y=BY+r*CELL_H*100;
    const p=pixel(img,x+10,y+35);
    const brick=p[0]>45&&p[1]>95&&p[2]>95;
    if(brick){s.grid[r][c]=readNumber(img,BRICK_DIGITS,x,y)||1;continue;}
    const q=pixel(img,x+58,y+CELL_H*50);
    if(q[1]>170&&q[0]<170&&q[2]<190)s.green[r][c]=1;
  }
  const balls=readNumber(img,BALL_DIGITS);
  const score=readNumber(img,SCORE_DIGITS);
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
function makeScorer(s,currentModel){
  const weights=currentModel?.weights;
  if(weights?.length!==11)return ()=>0;
  const boardFeatures=[
    s.ballCount/30,s.launcherX/6,
    s.grid.flat().reduce((a,b)=>a+b,0)/150,
    s.grid[8].reduce((a,b)=>a+b,0)/70,
    s.green.flat().reduce((a,b)=>a+b,0)/10
  ];
  return r=>{
    const features=[r.angle/180,...boardFeatures,r.damage/150,r.dangerDamage/70,
      r.collected/5,r.nextX/6,r.survive?1:0];
    return currentModel.bias+features.reduce((sum,value,index)=>sum+value*weights[index],0);
  };
}
function compare(a,b){
  if(a.result.survive!==b.result.survive)return a.result.survive?1:-1;
  if(!a.result.survive&&a.result.remaining9!==b.result.remaining9){
    return b.result.remaining9-a.result.remaining9;
  }
  return a.score-b.score;
}
export function plan(s){
  const results=[];
  const seen=new Set();
  const min=MIN_ANGLE*100, max=MAX_ANGLE*100;
  const modelScore=makeScorer(s,model);
  const rank=()=>results.sort((a,b)=>compare(b,a));
  function evaluate(hundredths){
    if(hundredths<min||hundredths>max||seen.has(hundredths))return;
    seen.add(hundredths);
    const result=simulateTurn(s,hundredths/100,1400);
    if(result){
      const score=result.collected*120+result.dangerDamage*3+result.damage+modelScore(result)*4;
      results.push({result,score});
    }
  }
  for(let angle=min;angle<=max;angle+=400)evaluate(angle);
  evaluate(max);
  for(const [step,radius] of [[100,200],[10,50],[1,5]]){
    rank();
    const centers=[];
    for(const {result} of results){
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
  return {best:results[0]?.result,count:results.length};
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
