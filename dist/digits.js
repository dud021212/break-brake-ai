const segments = [
  [3,0,12,3], [14,3,3,10], [14,16,3,10], [3,26,12,3],
  [0,16,3,10], [0,3,3,10], [3,13,12,3]
];
const glyphs = [
  [0,1,2,3,4,5], [1,2], [0,1,6,4,3], [0,1,6,2,3], [5,6,1,2],
  [0,5,6,2,3], [0,5,6,4,2,3], [0,1,2], [0,1,2,3,4,5,6], [0,1,2,3,5,6]
];
const masks = glyphs.map(glyph => glyph.reduce((mask, id) => mask | (1 << id), 0));

export const SCORE_DIGITS = {x:62, y:62, slots:8, scale:1, color:'#efffff'};
export const BALL_DIGITS = {x:491, y:62, slots:8, scale:1, color:'#e0fffa'};
export const BRICK_DIGITS = {x:9, y:21, slots:5, scale:0.8, color:'#ffffff'};

export function drawNumber(ctx, value, layout, offsetX = 0, offsetY = 0) {
  const {x, y, slots, scale, color} = layout;
  const digits = String(Math.max(0, Math.floor(value)));
  const digitScale = scale * Math.min(1, slots / digits.length);
  ctx.fillStyle = color;
  for (const [index, digit] of Array.from(digits).entries()) {
    const originX = offsetX + x + index * 21 * digitScale;
    for (const id of glyphs[Number(digit)]) {
      const [left, top, width, height] = segments[id];
      ctx.fillRect(originX + left * digitScale, offsetY + y + top * digitScale,
        width * digitScale, height * digitScale);
    }
  }
}

export function readNumber(image, layout, offsetX = 0, offsetY = 0) {
  const {x, y, slots, scale} = layout;
  let value = null;
  for (let index = 0; index < slots; index++) {
    const originX = offsetX + x + index * 21 * scale;
    let mask = 0;
    for (const [id, [left, top, width, height]] of segments.entries()) {
      const px = Math.floor(originX + (left + width / 2) * scale);
      const py = Math.floor(offsetY + y + (top + height / 2) * scale);
      const i = (py * image.width + px) * 4;
      const pixels = image.data;
      if (pixels[i] > 215 && pixels[i + 1] > 215 && pixels[i + 2] > 215) mask |= 1 << id;
    }
    const digit = masks.indexOf(mask);
    if (digit < 0) break;
    value = (value ?? 0) * 10 + digit;
  }
  return value;
}
