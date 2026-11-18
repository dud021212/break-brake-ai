import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,emptyGrid,endTurn,launch,stepGame,simulateTurn,spawnRow,COLS,ROWS} from '../dist/core.js';

test('board has six columns, ten rows, and an empty first row',()=>{
  const s=createGame(42);
  assert.equal(s.grid.length,ROWS);
  assert.equal(s.grid[0].length,COLS);
  assert.ok(s.grid[0].every(x=>x===0));
});
test('new bricks cannot spawn in the reserved first or defeat row',()=>{
  const s=createGame(42);
  assert.throws(()=>spawnRow(s,0),RangeError);
  assert.throws(()=>spawnRow(s,9),RangeError);
});
test('new bricks start at one and gain exactly one HP per turn',()=>{
  const s=createGame(42);
  const initialBricks=s.grid.flat().filter(Boolean);
  assert.ok(initialBricks.length>0);
  assert.ok(initialBricks.every(hp=>hp===1));
  s.score=100;
  for(let turn=2;turn<=16;turn++){
    s.grid[8].fill(0);
    endTurn(s);
    const newBricks=s.grid[1].filter(Boolean);
    assert.ok(newBricks.length>0);
    assert.ok(newBricks.every(hp=>hp===turn));
    if(turn>2)assert.ok(s.grid[2].filter(Boolean).every(hp=>hp===turn-1));
  }
});
test('a brick in row nine is safe until it descends to row ten',()=>{
  const s=createGame(42);s.grid=emptyGrid();s.green=emptyGrid();
  s.grid[8][2]=3;
  assert.equal(s.phase,'aiming');
  endTurn(s);
  assert.equal(s.phase,'game_over');
  assert.equal(s.grid[9][2],3);
});
test('destroyed row-nine brick does not cause defeat',()=>{
  const s=createGame(42);s.grid=emptyGrid();s.green=emptyGrid();
  s.grid[8][3]=1;s.launcherX=3.5;
  launch(s,90);
  for(let i=0;i<2000&&s.phase==='moving';i++)stepGame(s,.02);
  assert.equal(s.phase,'aiming');
  assert.equal(s.gameOver,false);
});
test('one turn accepts exactly one launch',()=>{
  const s=createGame(42);
  assert.equal(launch(s,90),true);
  assert.equal(launch(s,90),false);
});
test('a returning ball is collected without defeat',()=>{
  const s=createGame(42);s.grid=emptyGrid();s.green=emptyGrid();
  assert.equal(launch(s,90),true);
  for(let i=0;i<2000&&s.phase==='moving';i++)stepGame(s,.02);
  assert.equal(s.phase,'aiming');
  assert.equal(s.gameOver,false);
});
test('simulated turns return a survival decision',()=>{
  const s=createGame(42);s.grid=emptyGrid();s.green=emptyGrid();
  const r=simulateTurn(s,90,2000);
  assert.equal(r.survive,true);
  assert.equal(r.truncated,false);
});
test('collecting a green circle increases the next turn ball count',()=>{
  const s=createGame(42);s.grid=emptyGrid();s.green=emptyGrid();
  s.launcherX=3.5;s.green[3][3]=1;
  launch(s,90);
  for(let i=0;i<2000&&s.phase==='moving';i++)stepGame(s,.02);
  assert.equal(s.phase,'aiming');
  assert.equal(s.ballCount,2);
  assert.equal(s.green[4][3],0);
});
