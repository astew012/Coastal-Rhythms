// Lavernock Point coords and camera orientation
const LAT         = 51.395;
const LON         = -3.185;
const CAM_BEARING = 90;   // degrees compass — camera facing east
const H_FOV       = 70;   // horizontal field of view in degrees
const SKY_MAX_ALT = 35;   // degrees of sky visible at top of frame

let img;
let moonData, moonTexture, moonGfx, todayMoonData;
let tideHeight = 0;
let prevTideHeight = 0;
let windSpeed = 0;
let windDirDeg = 0;
let dataDate  = '';
let lastFetch = 0;
let dataLoaded = false;
let noiseOffset = 0;

// each wave layer has its own speed, amplitude, and spatial frequency
const waveLayers = [
  { speed: 0.0008, freqX: 0.0015, amp: 0.08, color: [100, 140, 160], alpha: 80  },
  { speed: 0.0014, freqX: 0.0025, amp: 0.06, color: [60,  110, 150], alpha: 110 },
  { speed: 0.0020, freqX: 0.0040, amp: 0.05, color: [40,  90,  140], alpha: 140 },
  { speed: 0.0030, freqX: 0.0060, amp: 0.04, color: [25,  75,  130], alpha: 160 },
  { speed: 0.0045, freqX: 0.0090, amp: 0.03, color: [15,  60,  120], alpha: 200 },
];
let layerOffsets;
let pebbleLayer;
let pebbles = [];
let particles = [];

function preload() {
  img         = loadImage('Lavernock_Point.jpg');
  moonTexture = loadImage('NASA_Moon_pic.jpg');
  moonData    = loadJSON('london_moon_p5_ready.json');
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  // stagger starting offsets so layers don't move in sync
  layerOffsets = waveLayers.map((_, i) => i * 10.0);

  // generate pebble positions once — bottom 30% of canvas
  pebbleLayer = createGraphics(windowWidth, windowHeight);
  pebbleLayer.colorMode(RGB);

  const palettes = [
    // mid grey slate
    { r:  90, g:  93, b: 100, rj: 10, gj: 10, bj: 10 },
    // light grey
    { r: 118, g: 118, b: 120, rj: 12, gj: 12, bj: 12 },
    { r: 145, g: 144, b: 142, rj: 12, gj: 12, bj: 10 },
    // sandy grey
    { r: 162, g: 156, b: 142, rj: 12, gj: 10, bj: 10 },
    { r: 175, g: 168, b: 148, rj: 12, gj: 10, bj: 10 },
    // warm sand
    { r: 190, g: 180, b: 155, rj: 10, gj: 10, bj: 8  },
    { r: 205, g: 193, b: 165, rj: 10, gj: 10, bj: 8  },
    // pale sand
    { r: 218, g: 206, b: 178, rj: 8,  gj: 8,  bj: 6  },
    // golden sand
    { r: 210, g: 182, b: 120, rj: 12, gj: 10, bj: 8  },
    { r: 222, g: 195, b: 130, rj: 10, gj: 10, bj: 8  },
    // rich ochre sand
    { r: 200, g: 168, b: 105, rj: 12, gj: 10, bj: 8  },
    { r: 230, g: 208, b: 148, rj: 10, gj: 8,  bj: 8  },
  ];

  let count = 2000;
  for (let i = 0; i < count; i++) {
    let base = random(palettes);
    let col = {
      r: constrain(base.r + random(-base.rj, base.rj), 0, 255),
      g: constrain(base.g + random(-base.gj, base.gj), 0, 255),
      b: constrain(base.b + random(-base.bj, base.bj), 0, 255),
    };
    // most pebbles round, ~40% oblong
    let oblong = random() < 0.4;
    let px = random(width);
    // pebbles sit on the beach slate — left starts higher, right sits lower
    let minY = map(px, 0, width, height * 0.67, height * 0.78);
    pebbles.push({
      x:       px,
      y:       random(minY, height * 0.98),
      r:       random(4, 9),
      col,
      scaleX:  oblong ? random(1.3, 1.9) : random(1.0, 1.2),
      scaleY:  oblong ? random(0.55, 0.8) : random(0.85, 1.0),
      noiseID: random(1000),
      tilt:    random(-PI / 8, PI / 8),
    });
  }

  // sort back-to-front so larger pebbles overlap smaller ones naturally
  pebbles.sort((a, b) => a.y - b.y);

  for (let p of pebbles) {
    drawPebble(pebbleLayer, p.x, p.y, p.r, p.col, p.scaleX, p.scaleY, p.noiseID, p.tilt);
  }

  fetchAll();

  // Work out which day's entry to use from the JSON
  let startDate = new Date('2026-03-05');
  let dayIndex  = constrain(
    Math.floor((new Date() - startDate) / 86400000),
    0,
    moonData.days.length - 1
  );
  todayMoonData = moonData.days[dayIndex];

  // Offscreen WEBGL buffer — moon sphere rendered here each frame
  moonGfx = createGraphics(200, 200, WEBGL);
}

function draw() {
  background(20, 60, 100);

  // refetch every 60 seconds
  if (millis() - lastFetch > 1800000) {
    fetchAll();
    lastFetch = millis();
  }

  if (!dataLoaded) {
    // show a loading message while we wait for the first fetch
    fill(255);
    textSize(20);
    textAlign(CENTER, CENTER);
    text('Loading tide data...', width / 2, height / 2);
    return; // skip the rest of draw until data arrives
  }

  // horizonY = where the sea meets the sky in the photo — adjust this to match the image
  let horizonY = height * 0.56;

  // waterY is fixed at the horizon — digital water always starts at the photo waterline
  let waterY = horizonY;
  // shoreline runs diagonally: 67% down on left, 78% down on right
  // tide controls how far down the water extends over the pebbles
  let waterDepth = map(tideHeight, 0, 11, height * 0.02, height * 0.95 - waterY);
  let waveBottom = waterY + waterDepth;

  // background photo
  tint(255, 150);
  image(img, 0, 0, width, height);
  noTint();

  // sky gradient — darkens clouds at top, fades to transparent at horizon
  let skyGrad = drawingContext.createLinearGradient(0, 0, 0, horizonY);
  skyGrad.addColorStop(0,   'rgba(10, 15, 25, 0.72)');
  skyGrad.addColorStop(0.6, 'rgba(10, 15, 25, 0.35)');
  skyGrad.addColorStop(1,   'rgba(10, 15, 25, 0.0)');
  drawingContext.fillStyle = skyGrad;
  drawingContext.fillRect(0, 0, width, horizonY);

  // day/night overlay
  let dl = getDaylight();
  fill(dl.r, dl.g, dl.b, dl.alpha);
  noStroke();
  rect(0, 0, width, height);

  // Moon — SunCalc gives real position, JSON gives phase/illumination for lighting
  if (todayMoonData) {
    let moonPos     = SunCalc.getMoonPosition(new Date(), LAT, LON);
    let moonBearing = (moonPos.azimuth * 180 / Math.PI + 180 + 360) % 360;
    let moonAltDeg  = moonPos.altitude * 180 / Math.PI;
    let leftEdge    = CAM_BEARING - H_FOV / 2;
    let rightEdge   = CAM_BEARING + H_FOV / 2;

    let phaseAngle  = map(todayMoonData.phase_fraction, 0, 1, 0, TWO_PI) + HALF_PI;
    let sunStrength = map(todayMoonData.illumination_percent, 0, 100, 0, 255);

    moonGfx.clear();
    moonGfx.ambientLight(12, 15, 28);
    moonGfx.directionalLight(sunStrength, sunStrength, sunStrength, cos(phaseAngle), 0, sin(phaseAngle));
    moonGfx.noStroke();
    moonGfx.texture(moonTexture);
    moonGfx.sphere(70);

    if (moonAltDeg > 0 && moonBearing >= leftEdge && moonBearing <= rightEdge) {
      let mx = map(moonBearing, leftEdge, rightEdge, 0, width);
      let my = constrain(map(moonAltDeg, 0, SKY_MAX_ALT, horizonY, 0), 15, horizonY - 15);
      tint(255, 210);
      image(moonGfx, mx - 60, my - 60, 120, 120);
      noTint();
    }
  }

  // pebbles sit over the photo, under the waves
  tint(255, 160);
  image(pebbleLayer, 0, 0);
  noTint();

  // advance layer offsets — slow ebb and flow
  noiseOffset += 0.006;
  for (let i = 0; i < waveLayers.length; i++) layerOffsets[i] += waveLayers[i].speed;

  // filled wave layers with vertical gradients — back to front
  const waveColours = [
    { top: [28,  52,  68], bot: [38,  72,  90], topA: 0.12, botA: 0.24 },
    { top: [30,  65,  82], bot: [40,  85, 105], topA: 0.11, botA: 0.20 },
    { top: [34,  75,  92], bot: [44,  95, 115], topA: 0.10, botA: 0.18 },
    { top: [38,  85, 102], bot: [48, 105, 122], topA: 0.09, botA: 0.15 },
    { top: [42,  95, 110], bot: [52, 115, 130], topA: 0.08, botA: 0.12 },
    { top: [46, 102, 115], bot: [56, 122, 135], topA: 0.07, botA: 0.10 },
    { top: [52, 118, 128], bot: [70, 142, 148], topA: 0.08, botA: 0.12 },
    { top: [65, 132, 138], bot: [88, 155, 160], topA: 0.06, botA: 0.08 },
  ];

  let ctx = drawingContext;
  for (let i = 0; i < waveColours.length; i++) {
    let c = waveColours[i];
    let depthFactor = i / (waveColours.length - 1);
    let baseY   = map(depthFactor, 0, 1, waterY, waterY + waterDepth * 0.75);
    let waveAmp = map(depthFactor, 0, 1, waterDepth * 0.01, waterDepth * 0.04);
    let movementScale = map(depthFactor, 0, 1, 1.5, 6.5);

    let grad = ctx.createLinearGradient(0, baseY - waveAmp, 0, waveBottom);
    grad.addColorStop(0, `rgba(${c.top[0]},${c.top[1]},${c.top[2]},${c.topA})`);
    grad.addColorStop(1, `rgba(${c.bot[0]},${c.bot[1]},${c.bot[2]},${c.botA})`);

    ctx.save();
    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let x = 0; x <= width; x += 5) {
      let n1 = noise(x * 0.003, noiseOffset + i * 0.8);
      let n2 = noise(x * 0.009, noiseOffset * 1.5 + i * 0.4) * 0.3;
      let sinComponent = (sin(x * 0.012 + noiseOffset * 2.5 + i * 0.7) * waveAmp * 0.45
                       + cos(x * 0.007 + noiseOffset * 1.8 + i * 1.1) * waveAmp * 0.25) * movementScale;
      let y  = max(baseY + map((n1 + n2) / 1.3, 0, 1, -waveAmp, waveAmp) + sinComponent, horizonY);
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    for (let x = width; x >= 0; x -= 5) {
      let shorelineAtX = map(x, 0, width, height * 0.67, height * 0.78);
      let bottomAtX    = map(tideHeight, 0, 11, shorelineAtX, height * 0.95);
      let nb1 = noise(x * 0.005 + 99,  noiseOffset * 0.6  + i * 1.3);
      let nb2 = noise(x * 0.015 + 200, noiseOffset * 1.1  + i * 2.1) * 0.5;
      let nb3 = noise(x * 0.040 + 400, noiseOffset * 1.8  + i * 0.9) * 0.25;
      let y   = bottomAtX + map((nb1 + nb2 + nb3) / 1.75, 0, 1, -waveAmp * 1.8, waveAmp * 1.8);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // particle clusters along wave crests
  for (let i = 0; i < waveColours.length; i++) {
    let depthFactor = i / (waveColours.length - 1);
    let spawnChance = map(depthFactor, 0, 1, 0.02, 0.10);
    if (random() < spawnChance && particles.length < 180) {
      let baseY  = map(depthFactor, 0, 1, waterY, waterY + waterDepth * 0.7);
      let waveAmp = map(depthFactor, 0, 1, waterDepth * 0.06, waterDepth * 0.12);
      let cx = random(width);
      let n1 = noise(cx * 0.003, noiseOffset + i * 0.8);
      let n2 = noise(cx * 0.009, noiseOffset * 1.5 + i * 0.4) * 0.3;
      let cy = baseY + map((n1 + n2) / 1.3, 0, 1, -waveAmp, waveAmp);
      let clusterSize = floor(random(4, 10));
      for (let k = 0; k < clusterSize; k++) {
        particles.push({
          x: cx + random(-18, 18),
          y: cy + random(-6, 6),
          alpha: random(40, 100),
          size: random(0.8, 2.2),
          vx: random(-0.2, 0.2),
          vy: random(-0.4, 0.05)
        });
      }
    }
  }

  // update and draw foam particles
  noStroke();
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= 0.5;
    if (p.alpha <= 0) { particles.splice(i, 1); continue; }
    fill(220, 238, 255, p.alpha);
    circle(p.x, p.y, p.size);
  }

  // ripples on the photographic sea background
  noFill();
  for (let s = 0; s < 35; s++) {
    let ny     = noise(s * 2.3 + 500, layerOffsets[0] * 0.35);
    let nx     = noise(s * 1.7 + 600, layerOffsets[1] * 0.30 + 50);
    let nw     = noise(s * 3.1 + 700, layerOffsets[2] * 0.25 + 100);
    let nalpha = noise(s * 4.5 + 800, layerOffsets[0] * 0.40 + 150);
    let ry     = map(ny, 0, 1, horizonY * 1.0, horizonY * 1.28);
    let rx     = map(nx, 0, 1, 0, width);
    let rw     = map(nw, 0, 1, width * 0.05, width * 0.18);
    let rh     = map(nw, 0, 1, 2, 7);
    let alpha  = map(nalpha, 0, 1, 8, 35);
    stroke(220, 235, 245, alpha);
    strokeWeight(0.9);
    ellipse(rx, ry, rw, rh);
  }

  // slow oval ripples on water surface
  noFill();
  for (let i = 0; i < waveLayers.length; i++) {
    let depthFactor = i / (waveLayers.length - 1);
    let zoneTop    = map(depthFactor, 0, 1, waterY, waterY + waterDepth * 0.6);
    let zoneBottom = map(depthFactor, 0, 1, waterY + waterDepth * 0.2, waterY + waterDepth * 0.9);
    let rippleCount = floor(map(i, 0, waveLayers.length - 1, 5, 18));

    for (let s = 0; s < rippleCount; s++) {
      let ny     = noise(s * 3.7 + i * 10, layerOffsets[i] * 0.15);
      let nx     = noise(s * 1.3 + i * 5,  layerOffsets[i] * 0.35 + 100);
      let nw     = noise(s * 2.1 + i * 7,  layerOffsets[i] * 0.25 + 200);
      let nalpha = noise(s * 4.2 + i * 3,  layerOffsets[i] * 0.45 + 300);
      let ry     = map(ny,     0, 1, zoneTop, zoneBottom);
      let rx     = map(nx,     0, 1, 0, width);
      let rw     = map(nw,     0, 1, width * 0.04, width * 0.12);
      let rh     = map(nw,     0, 1, 3, 10);
      let alpha  = map(nalpha, 0, 1, 3, 18);

      stroke(200, 235, 245, alpha);
      strokeWeight(map(depthFactor, 0, 1, 0.3, 1.0));
      ellipse(rx, ry, rw, rh);
    }
  }

  noStroke();

  // data readout
  noStroke();
  fill(255, 255, 255, 50);
  textFont('Lato');
  textStyle(NORMAL);
  textSize(12);
  textAlign(LEFT, TOP);
  text('Tide (Penarth): ' + (tideHeight > 0 ? tideHeight.toFixed(2) + 'm' : 'N/A'), 20, 20);
  text('Wind: ' + windSpeed + ' kn', 20, 44);
  text('Last sensor reading: ' + dataDate, 20, 66);
  if (todayMoonData) {
    let moonLine = todayMoonData.moon_phase;
    if (todayMoonData.moon_name) moonLine += ' · ' + todayMoonData.moon_name;
    text(moonLine, 20, 88);
  }
}

function keyPressed() {
  if (key === 'g' || key === 'G') {
    // records 3 seconds, then saves as lavernock.gif
    saveGif('lavernock', 3);
  }
}

function getDaylight() {
  let now    = new Date();
  let hour   = now.getHours() + now.getMinutes() / 60;

  // approximate Penarth sunrise/sunset
  let sunrise = 6.0;
  let sunset  = 20.5;

  let r, g, b, alpha;

  if (hour < sunrise - 1.5 || hour > sunset + 1.5) {
    // deep night — dark blue
    r = 5; g = 10; b = 35; alpha = 160;
  } else if (hour >= sunrise - 1.5 && hour < sunrise + 1.0) {
    // dawn — dark to warm orange
    let t  = map(hour, sunrise - 1.5, sunrise + 1.0, 0, 1);
    r      = floor(lerp(5,   255, t));
    g      = floor(lerp(10,  140, t));
    b      = floor(lerp(35,   60, t));
    alpha  = floor(lerp(160,   0, t));
  } else if (hour >= sunset - 1.0 && hour <= sunset + 1.5) {
    // dusk — warm orange fading to night
    let t  = map(hour, sunset - 1.0, sunset + 1.5, 0, 1);
    r      = floor(lerp(255,   5, t));
    g      = floor(lerp(140,  10, t));
    b      = floor(lerp(60,   35, t));
    alpha  = floor(lerp(0,   160, t));
  } else {
    // daytime — no overlay
    r = 255; g = 255; b = 255; alpha = 0;
  }

  return { r, g, b, alpha };
}

// --- fetch both tide and met data ---
function fetchAll() {
  fetchTide();
  fetchMet();
  lastFetch = millis();
}

function fetchTide() {
  let url = 'http://localhost:3000/tides';

  fetch(url)
    .then(response => response.json())
    .then(data => {
      dataLoaded = true;
      let feature = data.features.find(f => f.properties.value !== null);
      if (feature) {
        tideHeight = parseFloat(feature.properties.value);
        prevTideHeight = tideHeight;
        console.log('Tide:', tideHeight, 'm');
      } else if (prevTideHeight > 0) {
        tideHeight = prevTideHeight;
        console.log('Tide sensor null — using last known value:', tideHeight, 'm');
      } else {
        console.log('Tide value currently null from API, no previous reading available');
      }
    })
    .catch(err => console.error('Tide fetch failed:', err));
}

function drawPebble(pg, x, y, r, col, scaleX, scaleY, noiseID, tilt) {
  let rings = 12;
  let baseShade = (col.r + col.g + col.b) / 3;
  let ctx = pg.drawingContext;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);

  pg.noStroke();

  for (let ring = rings - 1; ring > 0; ring--) {
    let t = ring / rings;
    let shade = baseShade + random(-10, 15);

    pg.fill(shade + 15, shade, shade - 8);
    drawRing(pg, 0, 0, r * t, ring, scaleX, scaleY, noiseID);

    pg.fill(shade - 20, shade - 20, shade - 20);
    drawRing(pg, 0, 0, r * t * 0.99, ring, scaleX, scaleY, noiseID);
  }

  let rx = r * scaleX, ry = r * scaleY;
  let shadowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, max(rx, ry));
  shadowGrad.addColorStop(0,    'rgba(0,0,0,0.00)');
  shadowGrad.addColorStop(0.55, 'rgba(0,0,0,0.05)');
  shadowGrad.addColorStop(0.82, 'rgba(0,0,0,0.18)');
  shadowGrad.addColorStop(1,    'rgba(0,0,0,0.32)');
  ctx.fillStyle = shadowGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 1.05, ry * 1.05, 0, 0, Math.PI * 2);
  ctx.fill();

  let specGrad = ctx.createRadialGradient(-rx * 0.22, -ry * 0.28, 0, -rx * 0.22, -ry * 0.28, max(rx, ry) * 0.55);
  specGrad.addColorStop(0,    'rgba(255,255,255,0.45)');
  specGrad.addColorStop(0.35, 'rgba(255,255,255,0.15)');
  specGrad.addColorStop(1,    'rgba(255,255,255,0.00)');
  ctx.fillStyle = specGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx * 1.05, ry * 1.05, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawRing(pg, x, y, r, ringIndex, scaleX, scaleY, noiseID) {
  pg.beginShape();
  for (let i = 0; i <= 24; i++) {
    let angle = map(i, 0, 24, 0, TWO_PI);
    let n1 = noise(cos(angle) * 0.6 + noiseID,      sin(angle) * 0.6 + noiseID + ringIndex * 0.1);
    let n2 = noise(cos(angle) * 2.5 + noiseID + 50, sin(angle) * 2.5 + noiseID + 50) * 0.15;
    let nudge = map(n1, 0, 1, r * 0.75, r * 1.25) + n2 * r;
    pg.curveVertex(
      x + cos(angle) * nudge * scaleX,
      y + sin(angle) * nudge * scaleY
    );
  }
  pg.endShape(CLOSE);
}

function parseDataDate(raw) {
  let d = raw.replace('#', '');
  let year  = d.slice(0, 4);
  let month = parseInt(d.slice(4, 6)) - 1;
  let day   = d.slice(6, 8);
  let hour  = d.slice(8, 10);
  let min   = d.slice(10, 12);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return day + ' ' + months[month] + ' ' + year + '  ' + hour + ':' + min;
}

function drawWindArrow(x, y, deg, size) {
  push();
  translate(x, y);
  rotate(radians(deg));
  stroke(255);
  strokeWeight(1.5);
  fill(255);
  // shaft
  line(0, size, 0, -size);
  // arrowhead pointing in wind direction
  triangle(0, -size, -size * 0.45, -size * 0.3, size * 0.45, -size * 0.3);
  pop();
}

function fetchMet() {
  fetch('http://localhost:3000/wind')
    .then(response => response.json())
    .then(data => {
      let feature = data.features.find(f => f.properties.speed !== null);
      if (feature) {
        let p = feature.properties;
        windSpeed  = parseFloat(p.speed);
        windDirDeg = parseFloat(p.dir);
        dataDate   = parseDataDate(p.date);
        console.log('Wind:', windSpeed, 'kn', windDirDeg + '°');
      }
    })
    .catch(err => console.error('Wind fetch failed:', err));
}