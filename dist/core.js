export const COLS = 6;
export const ROWS = 10;
export const CELL_H = 0.664;
export const RADIUS = 0.117;
export const FLOOR = ROWS * CELL_H - 0.08;
export const SPEED = 8.4;
export const MIN_ANGLE = 11;
export const MAX_ANGLE = 169;

export function random(state) {
  let x = state.seed | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.seed = x | 0;
  return (x >>> 0) / 4294967296;
}

export function emptyGrid() { return Array.from({length: ROWS}, () => Array(COLS).fill(0)); }
export function createGame(seed = Date.now()) {
  const state = { seed: (seed | 0) || 1, grid: emptyGrid(), green: emptyGrid(), score: 1,
    ballCount: 1, launcherX: 3, phase: 'aiming', balls: [], launched: 0, launchClock: 0,
    nextX: null, collected: 0, turn: 1, hits: 0, gameOver: false };
  spawnRow(state);
  return state;
}

export function cloneGame(s) {
  return { ...s, grid: s.grid.map(row => row.slice()), green: s.green.map(row => row.slice()),
    balls: s.balls.map(ball => ({...ball})) };
}

export function spawnRow(s, row = 1, count = 3) {
  if (row < 1 || row > 8) throw new RangeError('Bricks may spawn only in rows 2–9.');
  const cols = Array.from({length: COLS}, (_, i) => i);
  for (let i = cols.length - 1; i > 0; i--) {
    const j = Math.floor(random(s) * (i + 1));
    [cols[i], cols[j]] = [cols[j], cols[i]];
  }
  const brickCount = Math.min(count, COLS - 1);
  for (let i = 0; i < brickCount; i++) {
    s.grid[row][cols[i]] = s.turn;
  }
  s.green[row][cols[brickCount]] = 1;
}

export function launch(s, degrees) {
  if (s.phase !== 'aiming') return false;
  const angle = Math.min(MAX_ANGLE, Math.max(MIN_ANGLE, degrees));
  s.angle = angle;
  s.phase = 'moving'; s.balls = []; s.launched = 0; s.launchClock = 0;
  s.nextX = null; s.collected = 0; s.hits = 0;
  return true;
}

function emitBall(s) {
  const a = s.angle * Math.PI / 180;
  s.balls.push({x: s.launcherX, y: FLOOR - RADIUS - 0.01,
    vx: Math.cos(a) * SPEED, vy: -Math.sin(a) * SPEED});
  s.launched++;
}

function hitBrick(s, b, row, col) {
  const x0 = col + 0.015, x1 = col + 0.985;
  const y0 = row * CELL_H + 0.013, y1 = y0 + 0.637;
  const nearX = Math.max(x0, Math.min(x1, b.x));
  const nearY = Math.max(y0, Math.min(y1, b.y));
  let dx = b.x - nearX, dy = b.y - nearY;
  if (dx * dx + dy * dy >= RADIUS * RADIUS) return false;
  const left = Math.abs(b.x - x0), right = Math.abs(x1 - b.x);
  const top = Math.abs(b.y - y0), bottom = Math.abs(y1 - b.y);
  if (Math.min(left, right) < Math.min(top, bottom)) {
    b.vx *= -1; b.x = b.vx > 0 ? x1 + RADIUS : x0 - RADIUS;
  } else {
    b.vy *= -1; b.y = b.vy > 0 ? y1 + RADIUS : y0 - RADIUS;
  }
  s.grid[row][col]--; s.hits++;
  if (s.grid[row][col] < 0) s.grid[row][col] = 0;
  return true;
}

function moveBall(s, b, dt) {
  b.x += b.vx * dt; b.y += b.vy * dt;
  if (b.x < RADIUS) { b.x = RADIUS + (RADIUS - b.x); b.vx = Math.abs(b.vx); }
  if (b.x > COLS - RADIUS) { b.x = 2 * (COLS - RADIUS) - b.x; b.vx = -Math.abs(b.vx); }
  if (b.y < RADIUS) { b.y = RADIUS + (RADIUS - b.y); b.vy = Math.abs(b.vy); }
  const r0 = Math.max(1, Math.floor((b.y - RADIUS) / CELL_H));
  const r1 = Math.min(9, Math.floor((b.y + RADIUS) / CELL_H));
  const c0 = Math.max(0, Math.floor(b.x - RADIUS));
  const c1 = Math.min(5, Math.floor(b.x + RADIUS));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (s.green[r][c]) {
      const gx = c + 0.5, gy = (r + 0.5) * CELL_H;
      if ((b.x - gx) ** 2 + (b.y - gy) ** 2 < (RADIUS + 0.13) ** 2) {
        s.green[r][c] = 0; s.collected++;
      }
    }
    if (s.grid[r][c] > 0 && hitBrick(s, b, r, c)) return false;
  }
  if (b.y >= FLOOR - RADIUS && b.vy > 0) {
    if (s.nextX === null) s.nextX = Math.min(COLS - RADIUS, Math.max(RADIUS, b.x));
    return true;
  }
  return false;
}

export function endTurn(s) {
  s.ballCount += s.collected;
  if (s.nextX !== null) s.launcherX = s.nextX;
  if (s.grid[8].some(hp => hp > 0)) s.gameOver = true;
  for (let row = 8; row >= 1; row--) {
    for (let col = 0; col < COLS; col++) {
      s.grid[row + 1][col] = s.grid[row][col];
      s.green[row + 1][col] = s.green[row][col];
    }
  }
  s.grid[1] = Array(COLS).fill(0); s.green[1] = Array(COLS).fill(0);
  s.grid[0] = Array(COLS).fill(0); s.green[0] = Array(COLS).fill(0);
  s.score++; s.turn++;
  if (s.gameOver) { s.phase = 'game_over'; return; }
  spawnRow(s, 1, 2 + Math.floor(random(s) * 3));
  s.phase = 'aiming';
}

export function stepGame(s, dt) {
  if (s.phase !== 'moving') return;
  const sub = Math.max(1, Math.ceil(dt / 0.009));
  const slice = dt / sub;
  for (let k = 0; k < sub; k++) {
    s.launchClock += slice;
    if (s.launched < s.ballCount && (s.launched === 0 || s.launchClock >= 0.085)) {
      emitBall(s); s.launchClock = 0;
    }
    const balls = s.balls;
    let remaining = 0;
    for (let index = 0; index < balls.length; index++) {
      const ball = balls[index];
      if (!moveBall(s, ball, slice)) {
        if (index !== remaining) balls[remaining] = ball;
        remaining++;
      }
    }
    if (balls.length !== remaining) balls.length = remaining;
    if (s.launched === s.ballCount && s.balls.length === 0) { endTurn(s); return; }
  }
}

export function simulateTurn(state, angle, maxSteps = 3800, includeState = false) {
  const s = cloneGame(state);
  if (!launch(s, angle)) return null;
  const dangerBefore = s.grid[8].reduce((a, x) => a + x, 0);
  let steps = 0;
  while (s.phase === 'moving' && steps < maxSteps) { stepGame(s, 0.03); steps++; }
  const remaining9 = s.grid[9].reduce((a, x) => a + x, 0);
  return {angle, survive: !s.gameOver && s.phase !== 'moving', remaining9,
    damage: s.hits, dangerDamage: dangerBefore - remaining9,
    collected: s.collected, nextX: s.launcherX, truncated: s.phase === 'moving', steps,
    ...(includeState ? {state:s} : {})};
}
