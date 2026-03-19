const fs = require('fs');

function writeGradientPpm(outputPath, width, height, colors) {
  // colors: { offset: 0-1, r, g, b }[]
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`);
  const pixels = Buffer.alloc(width * height * 3);

  let idx = 0;
  // 135 deg = top-left to bottom-right
  const maxDist = width + height; 

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dist = x + y; // For 45 deg (or 135 deg rotated)
      const t = dist / maxDist; // 0 to 1

      // Find color stops
      let c1 = colors[0];
      let c2 = colors[colors.length - 1];
      for (let i = 0; i < colors.length - 1; i++) {
        if (t >= colors[i].offset && t <= colors[i+1].offset) {
          c1 = colors[i];
          c2 = colors[i+1];
          break;
        }
      }

      const range = c2.offset - c1.offset;
      const localT = range === 0 ? 0 : (t - c1.offset) / range;

      const r = Math.round(c1.r + (c2.r - c1.r) * localT);
      const g = Math.round(c1.g + (c2.g - c1.g) * localT);
      const b = Math.round(c1.b + (c2.b - c1.b) * localT);

      pixels[idx++] = Math.max(0, Math.min(255, r));
      pixels[idx++] = Math.max(0, Math.min(255, g));
      pixels[idx++] = Math.max(0, Math.min(255, b));
    }
  }

  fs.writeFileSync(outputPath, Buffer.concat([header, pixels]));
}

writeGradientPpm('grad.ppm', 256, 256, [
    { offset: 0, r: 0xf0, g: 0x93, b: 0xfb },
    { offset: 0.5, r: 0xf5, g: 0x57, b: 0x6c },
    { offset: 1.0, r: 0x4f, g: 0xac, b: 0xfe }
]);
