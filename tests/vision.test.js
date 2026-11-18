import test from 'node:test';
import assert from 'node:assert/strict';
import {drawNumber, readNumber, SCORE_DIGITS, BALL_DIGITS, BRICK_DIGITS} from '../dist/digits.js';

globalThis.self={onmessage:null,postMessage(){}};
globalThis.fetch=async()=>({ok:false});
const {readState}=await import('../dist/ai-worker.js');

function image(){return {width:720,height:940,data:new Uint8ClampedArray(720*940*4)};}
function set(img,x,y,r,g,b){
  const k=(Math.round(y)*img.width+Math.round(x))*4;
  img.data[k]=r;img.data[k+1]=g;img.data[k+2]=b;img.data[k+3]=255;
}
function raster(img, bounds){
  return {
    fillStyle:'',
    fillRect(x,y,width,height){
      if(bounds){
        assert.ok(x>=bounds.left&&x+width<=bounds.right);
        assert.ok(y>=bounds.top&&y+height<=bounds.bottom);
      }
      const channels=this.fillStyle.slice(1).match(/../g).map(hex=>parseInt(hex,16));
      for(let py=Math.ceil(y-.5);py<y+height-.5;py++){
        for(let px=Math.ceil(x-.5);px<x+width-.5;px++)set(img,px,py,...channels);
      }
    }
  };
}

test('AI reads a row-nine brick, green circle, ball count, and launcher from pixels',()=>{
  const img=image();
  const brickX=60+3*100,brickY=124+8*.664*100;
  set(img,brickX+10,brickY+35,109,159,255);
  drawNumber(raster(img),1009,BRICK_DIGITS,brickX,brickY);
  const greenX=60+1*100,greenY=124+4*.664*100;
  set(img,greenX+58,greenY+.664*50,96,233,138);
  drawNumber(raster(img),1000,BALL_DIGITS);
  drawNumber(raster(img),10000,SCORE_DIGITS);
  const ly=124+(10*.664-.08)*100;
  for(let x=390;x<=410;x++)set(img,x,ly,145,255,240);
  const s=readState(img);
  assert.equal(s.grid[8][3],1009);
  assert.equal(s.green[4][1],1);
  assert.equal(s.ballCount,1000);
  assert.equal(s.score,10000);
  assert.ok(Math.abs(s.launcherX-3.4)<.01);
});

test('score and ball count stay inside their panels across digit boundaries',()=>{
  for(const [layout,left,right] of [[SCORE_DIGITS,62,270],[BALL_DIGITS,491,675]]){
    for(const n of [0,1,987,999,1000,9999,10000,87654321]){
      const img=image();
      drawNumber(raster(img,{left,right,top:62,bottom:92}),n,layout);
      assert.equal(readNumber(img,layout),n);
    }
  }
});
