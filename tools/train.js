import {createGame,random,simulateTurn} from '../dist/core.js';
import {writeFileSync} from 'node:fs';

const samples=[];
const angles=[15,35,55,75,95,115,135,155];
const stateCount=Number(process.env.STATES||48);
function features(s,r){
  const total=s.grid.flat().reduce((a,b)=>a+b,0);
  const danger=s.grid[8].reduce((a,b)=>a+b,0);
  const greens=s.green.flat().reduce((a,b)=>a+b,0);
  return [r.angle/180,s.ballCount/30,s.launcherX/6,total/150,danger/70,
    greens/10,r.damage/150,r.dangerDamage/70,r.collected/5,r.nextX/6,r.survive?1:0];
}
for(let n=0;n<stateCount;n++){
  const s=createGame(10001+n*719);
  s.grid=Array.from({length:10},()=>Array(6).fill(0));
  s.green=Array.from({length:10},()=>Array(6).fill(0));
  s.score=3+Math.floor(random(s)*30);
  s.turn=s.score;
  s.ballCount=2+Math.floor(random(s)*14);
  s.launcherX=.2+random(s)*5.6;
  for(let r=1;r<=8;r++)for(let c=0;c<6;c++){
    if(random(s)<(.09+r*.025))s.grid[r][c]=1+Math.floor(random(s)*Math.min(25,s.score+2));
    else if(random(s)<.035)s.green[r][c]=1;
  }
  for(const angle of angles){
    const result=simulateTurn(s,angle,1000,true);
    if(!result||result.truncated)continue;
    let future=0;
    if(result.survive){
      for(const nextAngle of [25,55,85,115,145]){
        const next=simulateTurn(result.state,nextAngle,1000);
        if(!next||next.truncated)continue;
        const value=(next.survive?1:0)+.005*next.damage+.08*next.collected;
        future=Math.max(future,value);
      }
    }
    const target=Math.min(2,Math.max(0,future));
    samples.push({x:features(s,result),y:target,group:n});
  }
  if((n+1)%12===0)process.stdout.write(`generated ${n+1}/${stateCount} states\n`);
}
if(samples.length<20)throw Error('Not enough complete turns. Increase STATES or simulation budget.');
const train=samples.filter(x=>x.group%5!==0),valid=samples.filter(x=>x.group%5===0);
const weights=Array(11).fill(0),bias={value:0};
const rate=.065,lambda=.0008;
for(let epoch=0;epoch<900;epoch++){
  for(const row of train){
    const pred=bias.value+row.x.reduce((v,x,i)=>v+x*weights[i],0);
    const err=pred-row.y;
    for(let i=0;i<11;i++)weights[i]-=rate*(err*row.x[i]+lambda*weights[i]);
    bias.value-=rate*err;
  }
}
function mae(rows){return rows.reduce((a,r)=>a+Math.abs(bias.value+r.x.reduce((v,x,i)=>v+x*weights[i],0)-r.y),0)/rows.length;}
const output={format:'linear-v1',featureCount:11,weights:weights.map(x=>Number(x.toFixed(7))),
  bias:Number(bias.value.toFixed(7)),training:{states:stateCount,samples:samples.length,
    trainMAE:Number(mae(train).toFixed(4)),validationMAE:Number(mae(valid).toFixed(4)),seed:10001}};
writeFileSync(new URL('../dist/model.json',import.meta.url),JSON.stringify(output));
process.stdout.write(`model saved: ${JSON.stringify(output.training)}\n`);
