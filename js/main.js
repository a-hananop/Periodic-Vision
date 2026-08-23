/* ================================================================
   PERIODIC TABLE — main.js  v4
   8 views: table · sphere · helix · grid · wave · cylinder · scatter · pyramid
   KEY FIX: 3-D renderer uses left/top + margin centering — NEVER
            touches width/height/fontSize so text stays crisp.
            Depth conveyed via opacity only (no scale distortion).
   ================================================================ */
(function () {
'use strict';

/* ──────────────────────────────────────────────────────────────
   CATEGORY META
────────────────────────────────────────────────────────────── */
const CAT = {
  'alkali-metal':    { label: 'Alkali Metal',          color: '#e74c3c' },
  'alkaline-earth':  { label: 'Alkaline Earth Metal',  color: '#e67e22' },
  'transition-metal':{ label: 'Transition Metal',      color: '#27ae60' },
  'post-transition': { label: 'Post-Transition Metal', color: '#1abc9c' },
  'metalloid':       { label: 'Metalloid',             color: '#9b59b6' },
  'nonmetal':        { label: 'Reactive Non-Metal',    color: '#3498db' },
  'halogen':         { label: 'Halogen',               color: '#d4ac0d' },
  'noble-gas':       { label: 'Noble Gas',             color: '#7fb3c8' },
  'lanthanide':      { label: 'Lanthanide',            color: '#2980b9' },
  'actinide':        { label: 'Actinide',              color: '#c0392b' },
  'unknown':         { label: 'Unknown Properties',    color: '#607d8b' },
};

/* ──────────────────────────────────────────────────────────────
   DOM SHORTCUTS
────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const vTable    = $('v-table');
const tableGrid = $('table-grid');
const v3d       = $('v-3d');
const scene     = $('scene');
const starCanvas= $('star-canvas');
const legend    = $('legend');
const filterBar = $('filter-bar');
const spinBtn   = $('spin-btn');
const resetBtn  = $('reset-btn');
const tooltip   = $('tooltip');
const modalMask = $('modal-mask');
const viewLabel = $('view-label');
const loading   = $('loading');

/* ──────────────────────────────────────────────────────────────
   STATE
────────────────────────────────────────────────────────────── */
let currentView = 'table';
let filterCat   = 'all';
let searchQ     = '';

// 3-D rotation (degrees)
let rotX = -18, rotY = 0;
let rotXTarget = -18, rotYTarget = 0;
let waveCols = 14;
let waveMotion = 0;
// zoom multiplier (1 = default)
let zoom = 1;
let zoomTarget = 1;

let dragging = false, lastMX = 0, lastMY = 0;
let pointerActive = false;
let autoSpin = true;
let rafID    = null;        // main render loop
let starRAF  = null;        // star background loop
let lastTime = 0;
let transitioning = false;
let resumeTimer   = null;

// base 3-D positions — set by layout functions
const P = {};   // P[atomicNumber] = {x, y, z}

// default rotation per view
const VIEW_ROT = {
  sphere:   { rx: -18, ry: 0 },
  helix:    { rx:   8, ry: 38 },
  grid:     { rx: -10, ry: 0 },
  wave:     { rx: -12, ry: 12 },
  cylinder: { rx: -34, ry: 36 },
  scatter:  { rx: -15, ry: 0 },
  pyramid:  { rx: -22, ry: 24 },
};

/* ──────────────────────────────────────────────────────────────
   STAR BACKGROUND
────────────────────────────────────────────────────────────── */
const sctx = starCanvas.getContext('2d');
const stars = [];

function initStars() {
  const W = starCanvas.width  = v3d.clientWidth  || window.innerWidth;
  const H = starCanvas.height = v3d.clientHeight || window.innerHeight - 96;
  stars.length = 0;
  const n = Math.floor(W * H / 8000);
  for (let i = 0; i < n; i++) {
    stars.push({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.1 + 0.2,
      vx: (Math.random() - 0.5) * 0.15,
      vy: (Math.random() - 0.5) * 0.1,
      o: Math.random() * 0.4 + 0.05,
    });
  }
}

function drawStars() {
  const W = starCanvas.width, H = starCanvas.height;
  sctx.clearRect(0, 0, W, H);
  for (const s of stars) {
    sctx.beginPath();
    sctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    sctx.fillStyle = `rgba(0,210,100,${s.o})`;
    sctx.fill();
    s.x += s.vx; s.y += s.vy;
    if (s.x < 0) s.x = W; if (s.x > W) s.x = 0;
    if (s.y < 0) s.y = H; if (s.y > H) s.y = 0;
  }
}

function startStars() {
  cancelAnimationFrame(starRAF);
  initStars();
  (function loop() { drawStars(); starRAF = requestAnimationFrame(loop); })();
}
function stopStars() {
  cancelAnimationFrame(starRAF);
  sctx.clearRect(0, 0, starCanvas.width, starCanvas.height);
}

/* ──────────────────────────────────────────────────────────────
   MAKE CARD
────────────────────────────────────────────────────────────── */
function makeCard(el) {
  const d = document.createElement('div');
  d.className = `el-card ${el.category}`;
  d.dataset.num = el.number;
  d.innerHTML =
    `<span class="el-num">${el.number}</span>` +
    `<span class="el-sym">${el.symbol}</span>` +
    `<span class="el-name">${el.name}</span>` +
    `<span class="el-mass">${el.mass}</span>`;
  d.addEventListener('mouseenter', e => showTT(e, el));
  d.addEventListener('mouseleave', hideTT);
  d.addEventListener('mousemove',  moveTT);
  d.addEventListener('click', e => { e.stopPropagation(); openModal(el); });
  return d;
}

/* ──────────────────────────────────────────────────────────────
   BUILD TABLE VIEW
────────────────────────────────────────────────────────────── */
function buildTable() {
  tableGrid.innerHTML = '';

  /* 10×18 grid
     dr 0-6 = periods 1-7
     dr  7  = visual separator row
     dr  8  = lanthanides (TABLE_POSITIONS row 9)
     dr  9  = actinides   (TABLE_POSITIONS row 10)  */
  const grid = Array.from({ length: 10 }, () => Array(18).fill(null));

  ELEMENTS.forEach(el => {
    const pos = TABLE_POSITIONS[el.number];
    if (!pos) return;
    const [r, c] = pos;
    let dr;
    if (r >= 1 && r <= 7) dr = r - 1;
    else if (r === 9)      dr = 8;
    else if (r === 10)     dr = 9;
    else return;
    const dc = c - 1;
    if (dr >= 0 && dr <= 9 && dc >= 0 && dc < 18) grid[dr][dc] = el;
  });

  for (let r = 0; r < 10; r++) {
    if (r === 7) {
      const sep = document.createElement('div');
      sep.className = 'sep-row';
      sep.style.gridColumn = '1/-1';
      tableGrid.appendChild(sep);
      continue;
    }
    for (let c = 0; c < 18; c++) {
      const el = grid[r][c];
      if (!el) {
        const g = document.createElement('div');
        g.className = 'ghost';
        tableGrid.appendChild(g);
      } else {
        const card = makeCard(el);
        // staggered flip-in: row-major order
        const delay = (r * 18 + c) * 7;
        card.style.animationDelay = delay + 'ms';
        tableGrid.appendChild(card);
      }
    }
  }
}

/* ──────────────────────────────────────────────────────────────
   BUILD 3-D SCENE  (populates #scene, then renders)
────────────────────────────────────────────────────────────── */
function build3D() {
  scene.innerHTML = '';
  if (currentView === 'helix') {
    for (let i = 0; i + 1 < ELEMENTS.length; i += 2) {
      const rung = document.createElement('div');
      rung.className = 'helix-rung';
      rung.dataset.a = ELEMENTS[i].number;
      rung.dataset.b = ELEMENTS[i + 1].number;
      scene.appendChild(rung);
    }
  }
  ELEMENTS.forEach((el, i) => {
    const card = makeCard(el);
    // start invisible; stagger pop-in
    card.style.animationName = 'none';  // disable CSS subtlePulse during entry
    card.style.opacity = '0';
    card.style.left    = '0px';
    card.style.top     = '0px';
    scene.appendChild(card);

    setTimeout(() => {
      card.classList.add('pop-in');
      card.style.opacity = '';
      // re-enable pulse after entry
      setTimeout(() => card.classList.remove('pop-in'), 500);
    }, i * 5 + 60);
  });
}

/* ──────────────────────────────────────────────────────────────
   LAYOUT FUNCTIONS  — compute P[num] = {x, y, z}
   All coordinates are world-space pixels.
────────────────────────────────────────────────────────────── */
function dim() {
  const W = v3d.clientWidth  || window.innerWidth;
  const H = v3d.clientHeight || window.innerHeight - 96;
  return { W, H, N: ELEMENTS.length };
}

// Keep flat layouts inside the stage.  The old fixed column counts made the
// outer cards clip on narrow windows and made the apparent shape uneven.
function flatLayoutMetrics(W, H, preferredCols, rowGap = 12) {
  const cardStep = 58 + rowGap;
  const cols = Math.max(7, Math.min(preferredCols, Math.floor((W - 36) / cardStep)));
  const rows = Math.ceil(ELEMENTS.length / cols);
  const gX = cols > 1 ? Math.min(78, (W - 36) / (cols - 1)) : 0;
  // A compact vertical step is intentional on short mobile stages: cards
  // remain in one centered composition instead of being cut off below it.
  const gY = Math.min(70, Math.max(36, (H - 56) / Math.max(rows - 1, 1)));
  return { cols, rows, gX, gY };
}

/* ── Sphere: Fibonacci lattice ── */
function layoutSphere() {
  const { W, H, N } = dim();
  const R = Math.min(W, H) * 0.50;
  const φ = Math.PI * (3 - Math.sqrt(5));
  ELEMENTS.forEach((el, i) => {
    const θ = Math.acos(1 - 2 * (i + 0.5) / N);
    const ψ = φ * i;
    P[el.number] = {
      x:  R * Math.sin(θ) * Math.cos(ψ),
      y:  R * Math.cos(θ),
      z:  R * Math.sin(θ) * Math.sin(ψ),
    };
  });
}

/* ── Helix: double helix ── */
function layoutHelix() {
  const { W, H, N } = dim();
  const R    = Math.min(W, H) * 0.34;
  const Ht   = Math.min(H * 0.92, 700);
  const revs = 5.25;
  const pairs = Math.ceil(N / 2);
  ELEMENTS.forEach((el, i) => {
    const pair = Math.floor(i / 2);
    const t   = pair / Math.max(pairs - 1, 1);
    const ang = t * revs * Math.PI * 2;
    // two strands offset by π
    const strand = i % 2 === 0 ? 0 : Math.PI;
    P[el.number] = {
      x: R * Math.cos(ang + strand),
      y: (t - 0.5) * Ht,
      z: R * Math.sin(ang + strand),
    };
  });
  rotX = rotXTarget = VIEW_ROT.helix.rx; rotY = rotYTarget = VIEW_ROT.helix.ry;
}

/* ── Grid: flat grid with z-ripple ── */
function layoutGrid() {
  const { W, H, N } = dim();
  const { cols, rows, gX, gY } = flatLayoutMetrics(W, H, 14);
  const step = Math.min(gX, gY);
  ELEMENTS.forEach((el, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    P[el.number] = {
      x: (col - (cols - 1) / 2) * step,
      y: (row - (rows - 1) / 2) * step,
      // Keep the lattice coplanar so every row and column remains aligned.
      // The scene itself still rotates in 3-D through the shared renderer.
      z: 0,
    };
  });
}

/* ── Wave: rolling wave surface ── */
function layoutWave() {
  const { W, H, N } = dim();
  const cols = Math.max(12, Math.min(16, Math.floor((W - 96) / 62)));
  waveCols = cols;
  const rows = Math.ceil(N / cols);
  const gX = Math.min(74, (W - 96) / Math.max(cols - 1, 1));
  const gY = Math.min(64, Math.max(46, (H - 82) / Math.max(rows - 1, 1)));
  const amplitude = Math.min(66, H * 0.12);
  const depth = Math.min(150, W * 0.14);

  // Build a coherent sine-wave surface. Every row follows the same phase,
  // with a small progressive offset to give the wave genuine 3-D volume.
  ELEMENTS.forEach((el, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const normalizedRow = row / Math.max(rows - 1, 1) - 0.5;
    const phase = (col / (cols - 1)) * Math.PI * 3.0;
    const baseY = (row - (rows - 1) / 2) * gY;
    P[el.number] = {
      x: (col - (cols - 1) / 2) * gX,
      // Keep the crest aligned across the ribbon while gently tapering the
      // outer rows so the wave has a clean, intentional silhouette.
      y: baseY + Math.sin(phase) * amplitude * (1 - Math.abs(normalizedRow) * 0.18),
      // Depth is used for the layered ribbon, not to distort the visible
      // sine curve into a loop or arc.
      z: normalizedRow * depth + Math.sin(phase) * depth * 0.16,
    };
  });
}

/* ── Cylinder: stacked rings ── */
function layoutCylinder() {
  const { W, H, N } = dim();
  const R      = Math.min(W, H) * 0.36;
  const Ht     = Math.min(H * 0.76, 540);
  // Eight broad rings make the circular cross-section readable instead of
  // producing a dense rectangular wall of nearly coincident cards.
  const rings   = 8;
  const baseCount = Math.floor(N / rings);
  const extra = N % rings;
  let offset = 0;

  // Balance the final partial ring across the cylinder so the silhouette
  // stays even at both ends instead of tapering on the last row.
  for (let ring = 0; ring < rings; ring++) {
    const count = baseCount + (ring < extra ? 1 : 0);
    const y = ((ring / Math.max(rings - 1, 1)) - 0.5) * Ht;
    for (let idx = 0; idx < count; idx++) {
      const el = ELEMENTS[offset + idx];
      const ang = (idx / count) * Math.PI * 2 + (ring % 2 ? Math.PI / count : 0);
      P[el.number] = {
        x: R * Math.cos(ang),
        y,
        z: R * Math.sin(ang),
      };
    }
    offset += count;
  }
  rotX = rotXTarget = VIEW_ROT.cylinder.rx; rotY = rotYTarget = VIEW_ROT.cylinder.ry;
}

/* ── Scatter: deterministic 3-D cloud ── */
function layoutScatter() {
  const { W, H, N } = dim();
  const R = Math.min(W, H) * 0.50;
  const golden = Math.PI * (3 - Math.sqrt(5));

  // Evenly distribute points through a sphere. Random radial points tend to
  // collapse into a central clump; this volume-aware Fibonacci distribution
  // keeps the scatter open, balanced, and repeatable on every render.
  ELEMENTS.forEach((el, i) => {
    const directionT = (i + 0.5) / N;
    const radialT = ((i * 53) % N + 0.5) / N;
    const radius = R * (0.2 + 0.8 * Math.cbrt(radialT));
    const yUnit = 1 - 2 * directionT;
    const ring = Math.sqrt(Math.max(0, 1 - yUnit * yUnit));
    const angle = i * golden;
    P[el.number] = {
      x: radius * ring * Math.cos(angle) * 1.06,
      y: radius * yUnit,
      z: radius * ring * Math.sin(angle),
    };
  });
}

/* ── Pyramid: layered tiers ── */
function layoutPyramid() {
  const { W, H, N } = dim();
  // A real pyramid is built from square horizontal layers.  Each layer
  // expands in both X and Z, rather than only widening a flat 2-D row.
  const sides = [1, 2, 3, 4, 5, 6, 7];
  const layerStep = Math.min(68, Math.max(48, (H - 104) / (sides.length - 1)));
  const cardStep = Math.min(62, Math.max(20, (W - 36) / 6));
  let placed = 0;

  sides.forEach((side, layer) => {
    const capacity = side * side;
    const count = Math.min(capacity, N - placed);
    const y = (layer - (sides.length - 1) / 2) * layerStep;

    // When the last layer is partial, spread its cards evenly over the
    // square footprint so its outline stays centered instead of leaning.
    for (let k = 0; k < count; k++, placed++) {
      const sample = count === capacity
        ? k
        : Math.floor((k + 0.5) * capacity / count);
      const row = Math.floor(sample / side);
      const col = sample % side;
      const el = ELEMENTS[placed];
      P[el.number] = {
        x: (col - (side - 1) / 2) * cardStep,
        y,
        z: (row - (side - 1) / 2) * cardStep,
      };
    }
  });
}

/* ──────────────────────────────────────────────────────────────
   3-D RENDER LOOP
   Strategy: project each world point to screen, then set
   card.style.left / card.style.top (centered by CSS margin).
   Depth → opacity only. Cards stay fixed 58×62 px — text always sharp.
────────────────────────────────────────────────────────────── */
const FOV = 900;

function project(wx, wy, wz, cosX, sinX, cosY, sinY) {
  // Rotate Y (yaw)
  const x1 =  wx * cosY + wz * sinY;
  const z1 = -wx * sinY + wz * cosY;
  // Rotate X (pitch)
  const y2 = wy * cosX - z1 * sinX;
  const z2 = wy * sinX + z1 * cosX;
  return { x: x1, y: y2, z: z2 };
}

function startRender() {
  cancelAnimationFrame(rafID);
  lastTime = performance.now();

  function frame(t) {
    const dt = Math.min(t - lastTime, 50);
    lastTime = t;
    if (autoSpin && !dragging) rotYTarget += dt * 0.022;
    if (currentView === 'wave') waveMotion += dt * 0.0018;
    renderScene();
    rafID = requestAnimationFrame(frame);
  }
  rafID = requestAnimationFrame(frame);
}

function renderScene() {
  rotX += (rotXTarget - rotX) * 0.22;
  rotY += (rotYTarget - rotY) * 0.22;
  zoom += (zoomTarget - zoom) * 0.18;
  const radX = rotX * Math.PI / 180;
  const radY = rotY * Math.PI / 180;
  const cX = Math.cos(radX), sX = Math.sin(radX);
  const cY = Math.cos(radY), sY = Math.sin(radY);

  const cards = scene.querySelectorAll('.el-card');

  // 1. Project all cards, build sortable list
  const projected = [];
  cards.forEach(card => {
    const num = +card.dataset.num;
    const p   = P[num];
    if (!p) return;
    let wx = p.x;
    let wy = p.y;
    let wz = p.z;
    if (currentView === 'wave') {
      const col = (num - 1) % waveCols;
      const row = Math.floor((num - 1) / waveCols);
      const phase = (col / Math.max(waveCols - 1, 1)) * Math.PI * 3 + waveMotion + row * 0.08;
      wy += Math.sin(phase) * 9;
      wz += Math.cos(phase) * 18;
    }
    const q = project(wx * zoom, wy * zoom, wz * zoom, cX, sX, cY, sY);
    projected.push({ card, ...q });
  });

  // 2. Sort back → front (painter's algorithm)
  projected.sort((a, b) => a.z - b.z);
  const maxZ = Math.max(...projected.map(p => Math.abs(p.z))) || 1;

  // Project helix rungs with the same camera math as the cards so the
  // connecting structure stays locked to both strands during movement.
  scene.querySelectorAll('.helix-rung').forEach(rung => {
    const a = P[+rung.dataset.a];
    const b = P[+rung.dataset.b];
    if (!a || !b) return;
    const qa = project(a.x * zoom, a.y * zoom, a.z * zoom, cX, sX, cY, sY);
    const qb = project(b.x * zoom, b.y * zoom, b.z * zoom, cX, sX, cY, sY);
    const sa = FOV / (FOV + qa.z + 300);
    const sb = FOV / (FOV + qb.z + 300);
    const ax = qa.x * sa, ay = qa.y * sa;
    const bx = qb.x * sb, by = qb.y * sb;
    const dx = bx - ax, dy = by - ay;
    rung.style.left = ax.toFixed(2) + 'px';
    rung.style.top = ay.toFixed(2) + 'px';
    rung.style.width = Math.hypot(dx, dy).toFixed(2) + 'px';
    rung.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
    rung.style.opacity = Math.max(0.12, 0.24 + ((qa.z + qb.z) / 2 + maxZ) / (4 * maxZ));
    rung.style.zIndex = Math.min(100, Math.floor((qa.z + qb.z) / 2));
  });

  // 3. Apply position + depth effects
  projected.forEach(({ card, x, y, z }, idx) => {
    // Perspective scale for positioning only (NOT card size)
    const sc    = FOV / (FOV + z + 300);
    const sx    = x * sc;
    const sy    = y * sc;

    // Opacity: far = dim, near = bright
    const normZ = (z + maxZ) / (2 * maxZ); // 0=back, 1=front
    const alpha = card.classList.contains('dimmed')
      ? 0.04
      : Math.max(0.18, 0.4 + normZ * 0.6);

    // Apply screen position through composited transforms. Updating left/top
    // here forces layout for all 118 cards on every animation frame.
    card.style.setProperty('--px', sx.toFixed(2) + 'px');
    card.style.setProperty('--py', sy.toFixed(2) + 'px');
    card.style.zIndex  = idx;
    card.style.opacity = alpha.toFixed(3);
  });
}

/* ──────────────────────────────────────────────────────────────
   VIEW SWITCHING
────────────────────────────────────────────────────────────── */
document.querySelectorAll('.vtab').forEach(btn => {
  btn.addEventListener('click', () => {
    if (transitioning || btn.dataset.view === currentView) return;
    document.querySelectorAll('.vtab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    switchView(btn.dataset.view);
  });
});

function switchView(next) {
  transitioning = true;

  // fade out current
  vTable.classList.remove('active');
  v3d.classList.remove('active');

  cancelAnimationFrame(rafID);
  stopStars();

  setTimeout(() => {
    currentView = next;
    viewLabel.textContent = next;
    v3d.classList.toggle('helix-mode', next === 'helix');
    v3d.classList.toggle('sphere-mode', next === 'sphere');
    v3d.classList.toggle('cylinder-mode', next === 'cylinder');
    v3d.classList.toggle('scatter-mode', next === 'scatter');
    v3d.classList.toggle('pyramid-mode', next === 'pyramid');

    if (next === 'table') {
      legend.classList.remove('hidden');
      filterBar.classList.add('hidden');
      spinBtn.classList.add('hidden');
      resetBtn.classList.add('hidden');
      vTable.classList.add('active');
    } else {
      legend.classList.add('hidden');
      filterBar.classList.remove('hidden');
      spinBtn.classList.remove('hidden');
      resetBtn.classList.remove('hidden');
      v3d.classList.add('active');

      // Set default rotation
      const def = VIEW_ROT[next] || { rx: -18, ry: 0 };
      rotX = rotXTarget = def.rx; rotY = rotYTarget = def.ry; zoom = 1; zoomTarget = 1;
      autoSpin = true;
      spinBtn.textContent = '⏸ spin';

      // Compute layout
      if (next === 'sphere')   layoutSphere();
      else if (next === 'helix')    layoutHelix();
      else if (next === 'grid')     layoutGrid();
      else if (next === 'wave')     layoutWave();
      else if (next === 'cylinder') layoutCylinder();
      else if (next === 'scatter')  layoutScatter();
      else if (next === 'pyramid')  layoutPyramid();

      build3D();
      startStars();
      startRender();
    }

    applyFilter();
    setTimeout(() => { transitioning = false; }, 500);
  }, 250);
}

/* ──────────────────────────────────────────────────────────────
   FILTER + SEARCH
────────────────────────────────────────────────────────────── */
function applyFilter() {
  const q   = searchQ.toLowerCase().trim();
  const src = currentView === 'table'
    ? tableGrid.querySelectorAll('.el-card')
    : scene.querySelectorAll('.el-card');

  src.forEach(card => {
    const num = +card.dataset.num;
    const el  = ELEMENTS[num - 1];
    if (!el) return;
    const catOK = filterCat === 'all' || el.category === filterCat;
    const qOK   = !q
      || el.symbol.toLowerCase().includes(q)
      || el.name.toLowerCase().includes(q)
      || String(el.number).includes(q);

    card.classList.toggle('dimmed', !(catOK && qOK));
    card.classList.toggle('hl',     !!(q && qOK && catOK));
  });
}

$('search').addEventListener('input', e => { searchQ = e.target.value; applyFilter(); });

// Both legend and filter-bar share the same .cat-btn class
document.querySelectorAll('.cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // deactivate siblings in same panel
    btn.closest('.bot-panel').querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterCat = btn.dataset.cat;
    applyFilter();
  });
});

/* ──────────────────────────────────────────────────────────────
   SPIN / RESET
────────────────────────────────────────────────────────────── */
spinBtn.addEventListener('click', () => {
  autoSpin = !autoSpin;
  spinBtn.textContent = autoSpin ? '⏸ spin' : '▶ spin';
});

resetBtn.addEventListener('click', () => {
  const def = VIEW_ROT[currentView] || { rx: -18, ry: 0 };
  rotX = rotXTarget = def.rx; rotY = rotYTarget = def.ry; zoom = 1; zoomTarget = 1;
  autoSpin = true;
  spinBtn.textContent = '⏸ spin';
});

/* ──────────────────────────────────────────────────────────────
   DRAG + ZOOM
────────────────────────────────────────────────────────────── */
v3d.addEventListener('pointerdown', e => {
  if (e.target.closest('.el-card')) return;
  pointerActive = true;
  dragging = true; autoSpin = false;
  rotXTarget = rotX;
  rotYTarget = rotY;
  lastMX = e.clientX; lastMY = e.clientY;
  v3d.setPointerCapture(e.pointerId);
  clearTimeout(resumeTimer);
});
v3d.addEventListener('pointermove', e => {
  if (!dragging) return;
  rotYTarget += (e.clientX - lastMX) * 0.36;
  rotXTarget += (e.clientY - lastMY) * 0.36;
  rotXTarget = Math.max(-82, Math.min(82, rotXTarget));
  lastMX = e.clientX; lastMY = e.clientY;
});
v3d.addEventListener('pointerup', e => {
  if (!dragging) return;
  dragging = false;
  pointerActive = false;
  if (v3d.hasPointerCapture(e.pointerId)) v3d.releasePointerCapture(e.pointerId);
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => { autoSpin = true; spinBtn.textContent = '⏸ spin'; }, 3000);
});

v3d.addEventListener('wheel', e => {
  e.preventDefault();
  zoomTarget = Math.max(0.28, Math.min(2.2, zoomTarget - e.deltaY * 0.0008));
}, { passive: false });

// Touch drag
v3d.addEventListener('touchstart', e => {
  if (pointerActive) return;
  if (e.target.closest('.el-card')) return;
  dragging = true; autoSpin = false;
  rotXTarget = rotX;
  rotYTarget = rotY;
  lastMX = e.touches[0].clientX; lastMY = e.touches[0].clientY;
}, { passive: true });
window.addEventListener('touchmove', e => {
  if (pointerActive) return;
  if (!dragging) return;
  rotYTarget += (e.touches[0].clientX - lastMX) * 0.36;
  rotXTarget += (e.touches[0].clientY - lastMY) * 0.36;
  rotXTarget = Math.max(-82, Math.min(82, rotXTarget));
  lastMX = e.touches[0].clientX; lastMY = e.touches[0].clientY;
}, { passive: true });
window.addEventListener('touchend', () => {
  if (pointerActive) return;
  dragging = false;
  clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => { autoSpin = true; }, 3000);
});

/* ──────────────────────────────────────────────────────────────
   KEYBOARD
────────────────────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === ' ') {
    e.preventDefault();
    autoSpin = !autoSpin;
    spinBtn.textContent = autoSpin ? '⏸ spin' : '▶ spin';
  }
  if (e.key === 'Escape') modalMask.classList.remove('open');
});

/* ──────────────────────────────────────────────────────────────
   TOOLTIP
────────────────────────────────────────────────────────────── */
const ttSym  = tooltip.querySelector('.tt-sym');
const ttName = tooltip.querySelector('.tt-name');
const ttMeta = tooltip.querySelector('.tt-meta');
const ttCat  = tooltip.querySelector('.tt-cat');

function showTT(e, el) {
  const meta = CAT[el.category] || CAT['unknown'];
  ttSym.textContent  = el.symbol;
  ttSym.style.color  = meta.color;
  ttName.textContent = el.name;
  ttMeta.textContent = `#${el.number} · ${el.mass} u`;
  ttCat.textContent  = meta.label;
  ttCat.style.color  = meta.color;
  $('t-phase').textContent = el.phase || '—';
  $('t-en').textContent    = el.electronegativity != null ? el.electronegativity : '—';
  $('t-mp').textContent    = el.meltingPoint  != null ? `${el.meltingPoint} K`  : '—';
  $('t-bp').textContent    = el.boilingPoint  != null ? `${el.boilingPoint} K`  : '—';
  $('t-d').textContent     = el.density       != null ? `${el.density} g/cm³`   : '—';
  $('t-disc').textContent  = el.discovered || 'Ancient';
  tooltip.classList.add('show');
  posTT(e);
}
function hideTT()   { tooltip.classList.remove('show'); }
function moveTT(e)  { posTT(e); }
function posTT(e) {
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + 230 > window.innerWidth)  x = e.clientX - 234;
  if (y + 210 > window.innerHeight) y = e.clientY - 214;
  tooltip.style.left = x + 'px';
  tooltip.style.top  = y + 'px';
}

/* ──────────────────────────────────────────────────────────────
   MODAL
────────────────────────────────────────────────────────────── */
function openModal(el) {
  const meta = CAT[el.category] || CAT['unknown'];
  $('msym').textContent  = el.symbol;
  $('msym').style.color  = meta.color;
  $('mname').textContent = el.name;
  $('msub').textContent  = `Atomic Number ${el.number} · Mass ${el.mass} u`;
  const mc = $('mcat');
  mc.textContent = meta.label;
  mc.style.color = mc.style.borderColor = meta.color;
  $('m-phase').textContent = el.phase || '—';
  $('m-pg').textContent    = `Period ${el.period}${el.group != null ? ' · Group ' + el.group : ''}`;
  $('m-mass').textContent  = el.mass + ' u';
  $('m-en').textContent    = el.electronegativity != null ? el.electronegativity : '—';
  $('m-mp').textContent    = el.meltingPoint  != null ? `${el.meltingPoint} K`  : '—';
  $('m-bp').textContent    = el.boilingPoint  != null ? `${el.boilingPoint} K`  : '—';
  $('m-d').textContent     = el.density       != null ? `${el.density} g/cm³`   : '—';
  $('m-disc').textContent  = el.discovered || 'Ancient';
  modalMask.classList.add('open');
}
modalMask.addEventListener('click', e => { if (e.target === modalMask) modalMask.classList.remove('open'); });
$('modal-close').addEventListener('click', () => modalMask.classList.remove('open'));

/* ──────────────────────────────────────────────────────────────
   RESIZE
────────────────────────────────────────────────────────────── */
let resizeT;
window.addEventListener('resize', () => {
  clearTimeout(resizeT);
  resizeT = setTimeout(() => {
    if (currentView !== 'table') {
      starCanvas.width  = v3d.clientWidth;
      starCanvas.height = v3d.clientHeight;
      initStars();
      // recompute layout without rebuilding DOM
      if (currentView === 'sphere')   layoutSphere();
      else if (currentView === 'helix')    layoutHelix();
      else if (currentView === 'grid')     layoutGrid();
      else if (currentView === 'wave')     layoutWave();
      else if (currentView === 'cylinder') layoutCylinder();
      else if (currentView === 'scatter')  layoutScatter();
      else if (currentView === 'pyramid')  layoutPyramid();
    }
  }, 200);
});

/* ──────────────────────────────────────────────────────────────
   INIT
────────────────────────────────────────────────────────────── */
function init() {
  buildTable();
  vTable.classList.add('active');
  legend.classList.remove('hidden');
  filterBar.classList.add('hidden');
  spinBtn.classList.add('hidden');
  resetBtn.classList.add('hidden');
  applyFilter();

  setTimeout(() => {
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 700);
  }, 700);
}

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(init);
} else {
  setTimeout(init, 150);
}

})();
