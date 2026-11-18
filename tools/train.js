import {createHash} from 'node:crypto';
import {readFileSync, renameSync, writeFileSync} from 'node:fs';
import {availableParallelism} from 'node:os';
import {Worker, isMainThread, parentPort} from 'node:worker_threads';
import {CELL_H, FLOOR, MIN_ANGLE, MAX_ANGLE, createGame, random, simulateTurn} from '../dist/core.js';

const DIMENSIONS = 12; // Intercept plus the eleven browser model features.
const SEED = 10001;
const SHARD_SIZE = 10000;
const MAX_EPISODE_TURN = 100;
const ROOT = new URL('../', import.meta.url);
const MODEL = new URL('dist/model.json', ROOT);

function statistics() {
  return {count:0, xx:new Float64Array(DIMENSIONS ** 2), xy:new Float64Array(DIMENSIONS), yy:0};
}

function accumulate(stats, x, y) {
  stats.count++;
  stats.yy += y*y;
  for(let i=0;i<DIMENSIONS;i++){
    stats.xy[i]+=x[i]*y;
    for(let j=0;j<=i;j++)stats.xx[i*DIMENSIONS+j]+=x[i]*x[j];
  }
}

function merge(target, source) {
  target.count+=source.count;
  target.yy+=source.yy;
  for(let i=0;i<target.xx.length;i++)target.xx[i]+=source.xx[i];
  for(let i=0;i<target.xy.length;i++)target.xy[i]+=source.xy[i];
}

function sum(row) {
  return row.reduce((total,n)=>total+n,0);
}

function quantize(angle) {
  return Math.round(100*Math.max(MIN_ANGLE,Math.min(MAX_ANGLE,angle)))/100;
}

function aimAt(state, target, entropy) {
  const angle=Math.atan2(FLOOR-(target.row+.5)*CELL_H,target.col+.5-state.launcherX)*180/Math.PI;
  return quantize(angle+(random(entropy)-.5)*12);
}

function anglesFor(state, entropy, count) {
  const pickup=[], threat=[];
  for(let row=8;row>=1;row--){
    for(let col=0;col<6;col++){
      if(state.green[row][col])pickup.push({row,col});
      if(row>=7&&state.grid[row][col])threat.push({row,col});
    }
  }
  const angles=new Set();
  for(const targets of [threat,pickup]){
    if(targets.length)angles.add(aimAt(state,targets[Math.floor(random(entropy)*targets.length)],entropy));
    if(angles.size===count-1)break;
  }
  while(angles.size<count){
    angles.add(quantize(MIN_ANGLE+random(entropy)*(MAX_ANGLE-MIN_ANGLE)));
  }
  return angles;
}

function rank(a,b) {
  if(a.survive!==b.survive)return Number(b.survive)-Number(a.survive);
  if(!a.survive&&a.remaining9!==b.remaining9)return a.remaining9-b.remaining9;
  return (b.collected-a.collected)*120+(b.dangerDamage-a.dangerDamage)*3+b.damage-a.damage;
}

function collectShard(index, states) {
  const entropy={seed:SEED+index*104729};
  const train=statistics(), validation=statistics();
  let state, stats, accepted=0, episodes=0, maxTurn=0, maxBalls=0;
  const turnRanges={early:0, middle:0, late:0};
  while(accepted<states){
    if(!state||state.gameOver||state.turn>MAX_EPISODE_TURN){
      state=createGame(1+Math.floor(random(entropy)*2147483646));
      stats=random(entropy)<.2?validation:train;
      episodes++;
    }
    const results=Array.from(anglesFor(state,entropy,4),
      angle=>simulateTurn(state,angle,1400,true)).filter(result=>!result.truncated);
    if(!results.length){state=null;continue;}
    accepted++;
    maxTurn=Math.max(maxTurn,state.turn);
    maxBalls=Math.max(maxBalls,state.ballCount);
    turnRanges[state.turn<=10?'early':state.turn<=32?'middle':'late']++;
    const total=state.grid.reduce((n,row)=>n+sum(row),0);
    const danger=sum(state.grid[8]);
    const greens=state.green.reduce((n,row)=>n+sum(row),0);
    for(const result of results){
      let future=0;
      if(result.survive){
        let completed=false;
        for(const angle of anglesFor(result.state,entropy,2)){
          const next=simulateTurn(result.state,angle,1400);
          if(next.truncated)continue;
          completed=true;
          future=Math.max(future,Number(next.survive)+.005*next.damage+.08*next.collected);
        }
        if(!completed)continue;
      }
      const x=[1,result.angle/180,state.ballCount/30,state.launcherX/6,total/150,danger/70,
        greens/10,result.damage/150,result.dangerDamage/70,result.collected/5,result.nextX/6,
        Number(result.survive)];
      accumulate(stats,x,Math.min(2,future));
    }
    results.sort(rank);
    // Occasionally explore a different surviving shot to vary reachable boards.
    const surviving=results.filter(result=>result.survive);
    state=(surviving.length>1&&random(entropy)<.12
      ? surviving[Math.floor(random(entropy)*surviving.length)]
      : results[0]).state;
  }
  return {train,validation,states,episodes,maxTurn,maxBalls,turnRanges};
}

function fit(stats) {
  const {count,xx,xy}=stats;
  const ridge=.0008;
  const rows=Array.from({length:DIMENSIONS},(_,i)=>[
    ...Array.from({length:DIMENSIONS},(_,j)=>xx[Math.max(i,j)*DIMENSIONS+Math.min(i,j)]/count
      +(i===j&&i!==0?ridge:0)),
    xy[i]/count
  ]);
  for(let i=0;i<DIMENSIONS;i++){
    let pivot=i;
    for(let j=i+1;j<DIMENSIONS;j++)if(Math.abs(rows[j][i])>Math.abs(rows[pivot][i]))pivot=j;
    [rows[i],rows[pivot]]=[rows[pivot],rows[i]];
    const divisor=rows[i][i];
    if(Math.abs(divisor)<1e-12)throw Error('Training system is singular.');
    for(let k=i;k<=DIMENSIONS;k++)rows[i][k]/=divisor;
    for(let j=0;j<DIMENSIONS;j++){
      if(j===i)continue;
      const factor=rows[j][i];
      for(let k=i;k<=DIMENSIONS;k++)rows[j][k]-=factor*rows[i][k];
    }
  }
  return rows.map(row=>Number(row[DIMENSIONS].toFixed(7)));
}

function rmse(stats, coefficients) {
  let error=stats.yy;
  for(let i=0;i<DIMENSIONS;i++){
    error-=2*coefficients[i]*stats.xy[i];
    for(let j=0;j<=i;j++){
      error+=(i===j?1:2)*coefficients[i]*coefficients[j]*stats.xx[i*DIMENSIONS+j];
    }
  }
  return Number(Math.sqrt(Math.max(0,error)/stats.count).toFixed(5));
}

function workerResult(worker, task) {
  return new Promise((resolve,reject)=>{
    function cleanup(){
      worker.off('message',onMessage);
      worker.off('error',onError);
      worker.off('exit',onExit);
    }
    function onMessage(result){cleanup();resolve(result);}
    function onError(error){cleanup();reject(error);}
    function onExit(code){onError(Error(`Training worker exited with code ${code}`));}
    worker.once('message',onMessage);
    worker.once('error',onError);
    worker.once('exit',onExit);
    worker.postMessage(task);
  });
}

async function trainModel() {
  const requested=Number(process.env.STATES??'48');
  const parallel=Number(process.env.WORKERS??Math.min(4,availableParallelism()));
  if(!Number.isSafeInteger(requested)||requested<20||!Number.isSafeInteger(parallel)||parallel<1){
    throw Error('STATES must be an integer of at least 20 and WORKERS a positive integer.');
  }
  const outputURL=process.env.MODEL_PATH?new URL(process.env.MODEL_PATH,`file://${process.cwd()}/`):MODEL;
  const temporaryURL=new URL(outputURL.href+`.${process.pid}.tmp`);
  const engineSHA256=createHash('sha256').update(readFileSync(new URL('dist/core.js',ROOT))).digest('hex');
  const train=statistics(), validation=statistics();
  let episodes=0, maxTurn=0, maxBalls=0, states=0;
  const turnRanges={early:0,middle:0,late:0};
  const shards=Math.ceil(requested/SHARD_SIZE);
  const workers=[];
  const completed=new Map();
  const workerCount=Math.min(parallel,shards);
  let nextShard=0, nextMerge=0;
  function mergeCompleted(){
    // Keep floating-point sums independent of how the workers finish.
    while(completed.has(nextMerge)){
      const result=completed.get(nextMerge);
      completed.delete(nextMerge++);
      states+=result.states;
      episodes+=result.episodes;
      maxTurn=Math.max(maxTurn,result.maxTurn);
      maxBalls=Math.max(maxBalls,result.maxBalls);
      for(const key of Object.keys(turnRanges))turnRanges[key]+=result.turnRanges[key];
      merge(train,result.train);
      merge(validation,result.validation);
      if(nextMerge%workerCount===0||nextMerge===shards){
        console.log(`Generated ${states}/${requested} reachable states (${train.count+validation.count} samples)`);
      }
    }
  }
  async function runWorker(){
    const worker=new Worker(new URL(import.meta.url));
    workers.push(worker);
    while(nextShard<shards){
      const index=nextShard++;
      const result=await workerResult(worker,{
        index,states:Math.min(SHARD_SIZE,requested-index*SHARD_SIZE)
      });
      completed.set(index,result);
      mergeCompleted();
    }
  }
  try{
    await Promise.all(Array.from({length:workerCount},runWorker));
  }finally{
    await Promise.all(workers.map(worker=>worker.terminate()));
  }
  if(train.count<20)throw Error('Not enough completed training samples.');
  const [bias,...weights]=fit(train);
  const coefficients=[bias,...weights];
  const engineAtEnd=createHash('sha256').update(readFileSync(new URL('dist/core.js',ROOT))).digest('hex');
  if(engineAtEnd!==engineSHA256)throw Error('Game engine changed during training. Retry on the final rules.');
  const model={format:'linear-v1',featureCount:weights.length,weights,bias,training:{
    states,samples:train.count+validation.count,trainSamples:train.count,validationSamples:validation.count,
    trainRMSE:rmse(train,coefficients),validationRMSE:validation.count?rmse(validation,coefficients):null,
    seed:SEED,episodes,maxTurn,maxBalls,turnRanges,engineSHA256,dataset:'engine-rollouts-v1'
  }};
  writeFileSync(temporaryURL,JSON.stringify(model)+'\n');
  renameSync(temporaryURL,outputURL);
  console.log(JSON.stringify(model.training));
}

if(isMainThread)await trainModel();
else parentPort.on('message',({index,states})=>parentPort.postMessage(collectShard(index,states)));
