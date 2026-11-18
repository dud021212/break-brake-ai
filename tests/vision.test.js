import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.self={onmessage:null,postMessage(){}};
globalThis.fetch=async()=>({ok:false});
const {readState}=await import('../dist/ai-worker.js');

function image(){return {width:720,height:940,data:new Uint8ClampedArray(720*940*4)};}
function set(img,x,y,r,g,b){
  const k=(Math.round(y)*img.width+Math.round(x))*4;
  img.data[k]=r;img.data[k+1]=g;img.data[k+2]=b;img.data[k+3]=255;
}
const segmentSamples=[[9,1],[15,8],[15,21],[9,27],[1,21],[1,8],[9,14]];
const seven={5:[0,2,3,5,6],7:[0,1,2],9:[0,1,2,3,5,6]};
function drawDigitSamples(img,n,x,y){for(const i of seven[n]){const [dx,dy]=segmentSamples[i];set(img,x+dx,y+dy,255,255,255);}}

test('AI reads a row-nine brick, green circle, ball count, and launcher from pixels',()=>{
  const img=image();
  const brickX=60+3*100,brickY=124+8*.664*100;
  set(img,brickX+10,brickY+35,109,159,255);
  drawDigitSamples(img,7,brickX+18+42,brickY+18);
  const greenX=60+1*100,greenY=124+4*.664*100;
  set(img,greenX+58,greenY+.664*50,96,233,138);
  drawDigitSamples(img,5,491+42,62);
  drawDigitSamples(img,9,62+63,62);
  const ly=124+(10*.664-.08)*100;
  for(let x=390;x<=410;x++)set(img,x,ly,145,255,240);
  const s=readState(img);
  assert.equal(s.grid[8][3],7);
  assert.equal(s.green[4][1],1);
  assert.equal(s.ballCount,5);
  assert.equal(s.score,9);
  assert.ok(Math.abs(s.launcherX-3.4)<.01);
});
