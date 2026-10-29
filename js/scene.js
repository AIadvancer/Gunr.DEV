/* =============================================================================
 * GUNR.DEV — scene.js  (ES module, Three r170 via importmap "three")
 * The "forward pass" particle field behind the page. One Points cloud carries
 * six precomputed shapes as attributes; the vertex shader blends between two of
 * them with a per-particle stagger, so shapes flow into each other instead of
 * snapping. A faint set of attention arcs (LineSegments) fades in on section 2.
 *
 *   0 core       dense breathing sphere (hero), repels the pointer
 *   1 embedding  ordered fibonacci shells
 *   2 attention  clusters + flowing arcs
 *   3 hidden     four stacked lattice planes that slide with section progress
 *   4 weights    live wave grid
 *   5 output     "GUNR" sampled from canvas text, fitted to the viewport aspect
 *
 * window.GUNR_SCENE = {
 *   ready: true,
 *   setProgress(p)    0..1 whole page (camera dolly)
 *   setSection(i, t)  i 0..5, t 0..1 within the section; the last ~35% of a
 *                     section starts flowing toward the next shape
 *   burst()           shockwave outward (loader exit, CTA moments)
 *   pulse()           brief brightening of the attention arcs
 *   setAccent(css)    any CSS color; also auto-read from --signal on
 *                     html[data-theme|style|class] changes
 *   pause(), resume(), staticFrame()
 * }
 * Fires document event "gunr:scene-ready". On missing WebGL2 / load failure
 * adds html.no-webgl and defines nothing. Honors window.GUNR_MOTION.full.
 * ========================================================================== */

const root = document.documentElement;
const canvas = document.getElementById('scene');

function fail(err) {
  root.classList.add('no-webgl');
  if (canvas) canvas.style.display = 'none';
  if (err && window.console) console.warn('[scene] disabled:', err.message || err);
}

// Same rule index.html uses; recomputed here only if that inline script is missing.
function motionFull() {
  if (window.GUNR_MOTION && typeof window.GUNR_MOTION.full === 'boolean') return window.GUNR_MOTION.full;
  try {
    const q = new URLSearchParams(location.search).get('motion');
    if (q === 'full') return true;
    if (q === 'reduced') return false;
  } catch (e) { /* ignore */ }
  return !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

let gl = null;
if (canvas) {
  try {
    gl = canvas.getContext('webgl2', {
      alpha: true, antialias: false, premultipliedAlpha: true,
      powerPreference: 'high-performance', depth: false, stencil: false
    });
  } catch (e) { gl = null; }
}

if (!canvas) {
  // Nothing to draw into; stay silent so journey.js simply runs without a scene.
} else if (!gl) {
  fail();
} else {
  try {
    const THREE = await import('three');
    init(THREE);
  } catch (err) {
    fail(err);
  }
}

/* ========================================================================== */

function init(THREE) {
  const FULL = motionFull();

  /* ---- device tier -------------------------------------------------------- */
  const mm = (q) => !!(window.matchMedia && matchMedia(q).matches);
  const coarse = mm('(pointer: coarse)');
  const small = coarse || Math.min(window.innerWidth, window.innerHeight) < 600;
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
  const COUNT = lowEnd ? 2500 : small ? 5000 : 14000;
  const DPR_CAP = small ? 1.5 : 2;
  // Fewer particles -> each one carries a bit more light.
  // Capped lower on phones, where the field sits behind body copy.
  const BASE_ALPHA = Math.min(small ? 0.5 : 0.85, 0.42 * Math.sqrt(14000 / COUNT));
  const WORLD_SIZE = small ? 0.012 : 0.0135; // particle diameter in world units at focus

  /* ---- deterministic randomness ------------------------------------------ */
  let seed = 0x6a7e21;
  const rnd = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const gauss = () => {
    const u = Math.max(1e-6, rnd()), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * v);
  };
  const shuffleInPlace = (arr3, n) => {
    for (let i = n - 1; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      for (let k = 0; k < 3; k++) {
        const a = arr3[i * 3 + k]; arr3[i * 3 + k] = arr3[j * 3 + k]; arr3[j * 3 + k] = a;
      }
    }
  };
  const fib = (out, start, n, r, jitter) => {
    const ga = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * 2;
      const rr = Math.sqrt(1 - y * y);
      const th = ga * i;
      const R = r + gauss() * jitter;
      const o = (start + i) * 3;
      out[o] = Math.cos(th) * rr * R; out[o + 1] = y * R; out[o + 2] = Math.sin(th) * rr * R;
    }
  };

  /* ---- shapes ------------------------------------------------------------- */
  const N = COUNT;

  function buildCore() {
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = rnd();
      let r;
      if (u < 0.34) r = 0.5 * Math.pow(rnd(), 1.6);          // bright nucleus
      else if (u < 0.82) r = 1.12 + gauss() * 0.05;          // crisp shell
      else r = 0.55 + rnd() * 0.55;                          // soft mantle
      const z = rnd() * 2 - 1, th = rnd() * 6.2831853, s = Math.sqrt(1 - z * z);
      a[i * 3] = Math.cos(th) * s * r; a[i * 3 + 1] = z * r; a[i * 3 + 2] = Math.sin(th) * s * r;
    }
    return a;
  }

  function buildEmbedding() {
    const a = new Float32Array(N * 3);
    const outer = Math.floor(N * 0.8);
    fib(a, 0, outer, 1.7, 0.012);
    fib(a, outer, N - outer, 0.82, 0.01);
    shuffleInPlace(a, N);
    return a;
  }

  // Cluster centers are shared with the attention arcs.
  const CLUSTERS = [];
  for (let k = 0; k < 7; k++) {
    const ang = k / 7 * 6.2831853 + (rnd() - 0.5) * 0.5;
    const rad = 1.25 + rnd() * 0.35;
    CLUSTERS.push({
      x: Math.cos(ang) * rad, y: Math.sin(k * 2.3) * 0.62, z: Math.sin(ang) * rad * 0.9,
      sd: 0.13 + rnd() * 0.12
    });
  }

  function buildAttention() {
    const a = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      if (rnd() < 0.1) { // sparse context field
        const z = rnd() * 2 - 1, th = rnd() * 6.2831853, s = Math.sqrt(1 - z * z), r = 0.6 + rnd() * 1.7;
        a[o] = Math.cos(th) * s * r; a[o + 1] = z * r * 0.7; a[o + 2] = Math.sin(th) * s * r;
        continue;
      }
      const c = CLUSTERS[(rnd() * CLUSTERS.length) | 0];
      a[o] = c.x + gauss() * c.sd; a[o + 1] = c.y + gauss() * c.sd; a[o + 2] = c.z + gauss() * c.sd;
    }
    return a;
  }

  // Raw plane-local lattice; the shader slides and orients the planes.
  function buildHidden() {
    const a = new Float32Array(N * 3);
    const per = Math.ceil(N / 4);
    const side = Math.ceil(Math.sqrt(per));
    const size = 2.1;
    for (let i = 0; i < N; i++) {
      const plane = Math.min(3, (i / per) | 0);
      const j = i - plane * per;
      const gx = j % side, gy = (j / side) | 0;
      const o = i * 3;
      a[o] = -1.5 + plane + gauss() * 0.012;
      a[o + 1] = (gy / (side - 1) - 0.5) * size;
      a[o + 2] = (gx / (side - 1) - 0.5) * size;
    }
    return a;
  }

  // Flat (x, 0, z) grid; height comes from live waves in the shader.
  function buildWeights() {
    const a = new Float32Array(N * 3);
    const cols = Math.round(Math.sqrt(N * 1.6));
    const rows = Math.ceil(N / cols);
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      a[o] = ((i % cols) / (cols - 1) - 0.5) * 5.4;
      a[o + 1] = 0;
      a[o + 2] = (((i / cols) | 0) / Math.max(1, rows - 1) - 0.5) * 3.2;
    }
    return a;
  }

  /* ---- "GUNR" sampled from canvas text ------------------------------------ */
  const FONT_STACK = '"Geist", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

  function buildOutput(out, view) {
    const lines = view.aspect < 0.78 ? ['GU', 'NR'] : ['GUNR'];
    const fs = 220;
    const c = document.createElement('canvas');
    const cw = lines.length === 1 ? 1100 : 640;
    const ch = Math.round(fs * 0.95 * lines.length + fs * 0.4);
    c.width = cw; c.height = ch;
    const x = c.getContext('2d', { willReadFrequently: true });
    let ok = !!x;
    const pts = [];
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    if (ok) {
      x.fillStyle = '#fff';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.font = `600 ${fs}px ${FONT_STACK}`;
      try { x.letterSpacing = '-0.02em'; } catch (e) { /* older engines */ }
      const lh = fs * 0.95;
      const y0 = ch / 2 - (lines.length - 1) * lh / 2;
      lines.forEach((t, i) => x.fillText(t, cw / 2, y0 + i * lh));
      const data = x.getImageData(0, 0, cw, ch).data;
      const step = 2;
      for (let py = 0; py < ch; py += step) {
        for (let px = 0; px < cw; px += step) {
          if (data[(py * cw + px) * 4 + 3] > 150) {
            pts.push(px, py);
            if (px < minX) minX = px; if (px > maxX) maxX = px;
            if (py < minY) minY = py; if (py > maxY) maxY = py;
          }
        }
      }
      ok = pts.length > 50;
    }
    // Fit the word into the viewport at z = 0.
    const visW = view.halfW * 2, visH = view.halfH * 2;
    const tw = ok ? maxX - minX : 1, th = ok ? maxY - minY : 1;
    const s = Math.min((visW * (view.aspect < 0.78 ? 0.8 : 0.74)) / tw, (visH * 0.5) / th);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const count = pts.length / 2;
    for (let i = 0; i < N; i++) {
      const o = i * 3;
      if (!ok || rnd() < 0.05) { // atmospheric dust around the word
        out[o] = (rnd() - 0.5) * visW * 1.1;
        out[o + 1] = (rnd() - 0.5) * visH * 1.0;
        out[o + 2] = (rnd() - 0.5) * 3.0;
        continue;
      }
      const k = ((rnd() * count) | 0) * 2;
      out[o] = (pts[k] + rnd() * 2 - cx) * s;
      out[o + 1] = -(pts[k + 1] + rnd() * 2 - cy) * s;
      out[o + 2] = gauss() * 0.035;
    }
  }

  /* ---- renderer / camera -------------------------------------------------- */
  THREE.ColorManagement.enabled = false; // CSS colors in, CSS colors out
  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false, alpha: true });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const FOV = 35, CAM_Z = 7;
  const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  camera.position.set(0, 0, CAM_Z);
  const group = new THREE.Group();
  scene.add(group);

  const view = { w: 1, h: 1, aspect: 1, halfW: 1, halfH: TAN * CAM_Z };

  /* ---- particle geometry -------------------------------------------------- */
  const geo = new THREE.BufferGeometry();
  const core = buildCore();
  const emb = buildEmbedding();
  const att = buildAttention();
  const hid = buildHidden();
  const wts = buildWeights();
  const outArr = new Float32Array(N * 3);

  const rand4 = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    // Delay mixes noise with height so morphs sweep top-to-bottom like a wave.
    const yn = Math.min(1, Math.max(0, 0.5 - core[i * 3 + 1] / 2.4));
    rand4[i * 4] = 0.62 * rnd() + 0.38 * yn;
    rand4[i * 4 + 1] = rnd();                                  // phase
    rand4[i * 4 + 2] = rnd() < 0.025 ? 1.4 + rnd() * 1.2 : 0.2 + rnd() * 0.75; // size (rare bokeh)
    rand4[i * 4 + 3] = rnd();                                  // accent pick
  }

  geo.setAttribute('position', new THREE.BufferAttribute(core, 3));
  geo.setAttribute('p1', new THREE.BufferAttribute(emb, 3));
  geo.setAttribute('p2', new THREE.BufferAttribute(att, 3));
  geo.setAttribute('p3', new THREE.BufferAttribute(hid, 3));
  geo.setAttribute('p4', new THREE.BufferAttribute(wts, 3));
  const p5Attr = new THREE.BufferAttribute(outArr, 3);
  p5Attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('p5', p5Attr);
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand4, 4));

  const GLSL_COMMON = /* glsl */`
    mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
    mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
  `;

  const uniforms = {
    uTime: { value: 0 },
    uFrom: { value: 0 }, uTo: { value: 0 }, uMix: { value: 0 },
    uSpin: { value: 0 }, uFit: { value: 1 }, uBreath: { value: 0 }, uSlide: { value: 0 },
    uSize: { value: 30 }, uFocus: { value: CAM_Z }, uAlpha: { value: BASE_ALPHA }, uFade: { value: FULL ? 0 : 1 },
    uBurst: { value: 100 }, uRepel: { value: 0 }, uMouse: { value: new THREE.Vector3(0, 0, 99) },
    uBase: { value: new THREE.Color('#EDEAE4') }, uAccent: { value: new THREE.Color('#FF5A1F') },
    uAccentRatio: { value: 0.08 }, uDim: { value: 1 }
  };

  const pointsMat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    vertexShader: /* glsl */`
      uniform float uTime, uFrom, uTo, uMix, uSpin, uFit, uBreath, uSlide;
      uniform float uSize, uFocus, uAlpha, uFade, uBurst, uRepel, uAccentRatio, uDim;
      uniform vec3 uMouse;
      attribute vec3 p1; attribute vec3 p2; attribute vec3 p3; attribute vec3 p4; attribute vec3 p5;
      attribute vec4 aRand;
      varying float vAlpha; varying float vBlur; varying float vAccent;
      ${GLSL_COMMON}

      // Cheap divergence-light flow field: never still, never noisy.
      vec3 flow(vec3 p, float t){
        return vec3(
          sin(p.y * 1.7 + t * 0.31) + sin(p.z * 2.3 - t * 0.23),
          sin(p.z * 1.9 + t * 0.27) + sin(p.x * 2.1 + t * 0.19),
          sin(p.x * 1.6 - t * 0.29) + sin(p.y * 2.4 + t * 0.21)) * 0.5;
      }

      vec3 shape(float i){
        if (i < 0.5) return rotY(uSpin) * position * (1.0 + uBreath) * uFit;
        if (i < 1.5) return rotY(uSpin * 0.8) * rotX(0.35) * p1 * uFit;
        if (i < 2.5) return rotY(uSpin * 0.6) * p2 * uFit;
        if (i < 3.5) {
          vec3 q = p3;
          float plane = floor(q.x + 2.0);
          q.y += (mod(plane, 2.0) < 0.5 ? 1.0 : -1.0) * uSlide * (0.6 + plane * 0.15);
          return rotY(-0.68) * rotX(0.16) * q * uFit;
        }
        if (i < 4.5) {
          vec3 q = p4;
          q.y = 0.22 * sin(q.x * 1.5 + uTime * 0.9)
              + 0.14 * sin(q.z * 2.2 - uTime * 0.7)
              + 0.07 * sin((q.x + q.z) * 3.1 + uTime * 1.3);
          return rotX(0.52) * q * uFit;
        }
        return p5;
      }

      void main(){
        // Staggered blend: each particle leaves on its own delay.
        float S = 0.5;
        float m = clamp((uMix - aRand.x * S) / (1.0 - S), 0.0, 1.0);
        m = m * m * (3.0 - 2.0 * m);
        vec3 p = mix(shape(uFrom), shape(uTo), m);

        // Mid-flight swirl, then a slow ambient drift.
        float k = sin(m * 3.14159265);
        p += flow(p * 0.9 + aRand.y * 6.0, uTime * 1.6) * 0.34 * k;
        p += flow(p * 0.55 + aRand.y, uTime * 0.35) * (0.035 + 0.025 * aRand.z);

        // Pointer repulsion (hero only, uRepel fades it in/out). Wide soft falloff
        // plus a small tangential swirl so points slide around the cursor.
        vec3 dm = p - uMouse;
        vec3 dn = normalize(dm + vec3(1e-4));
        float f = exp(-dot(dm, dm) * 1.6) * uRepel;
        vec3 swirl = normalize(cross(dn, vec3(0.0, 0.0, 1.0)) + vec3(1e-4));
        vec3 disp = (dn * 0.3 + swirl * 0.14) * f;
        p += disp;

        // Shockwave ring plus an initial outward kick.
        float L = length(p);
        vec3 dir = p / (L + 1e-4);
        float wave = exp(-pow(L - uBurst * 3.4, 2.0) * 3.0) * exp(-uBurst * 1.3);
        p += dir * (wave * 0.6 + exp(-uBurst * 3.2) * 0.9 * (0.3 + aRand.y * 0.7));

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float depth = max(0.2, -mv.z);
        // Depth-of-field: out-of-focus particles grow and dim.
        float blur = clamp(abs(depth - uFocus) * 0.45, 0.0, 1.6);
        float size = uSize * (0.55 + aRand.z) * (1.0 + blur * 1.9);
        gl_PointSize = max(size / depth, 1.0);
        gl_Position = projectionMatrix * mv;

        float tw = 0.7 + 0.3 * sin(uTime * (0.7 + 2.2 * aRand.y) + aRand.y * 40.0);
        float bokeh = aRand.z > 1.3 ? 0.35 : 1.0;
        vAlpha = uAlpha * uFade * tw * bokeh / (1.0 + blur * blur * 4.0);
        vAlpha *= smoothstep(0.6, 2.0, depth);
        // Displaced points thin out instead of stacking into a bright crescent.
        vAlpha *= (1.0 - 0.6 * smoothstep(0.0, 0.25, length(disp))) * uDim;
        vBlur = blur;
        vAccent = step(aRand.w, uAccentRatio);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uBase, uAccent;
      varying float vAlpha; varying float vBlur; varying float vAccent;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float sharp = mix(7.0, 2.2, clamp(vBlur, 0.0, 1.0));
        float a = exp(-d * d * sharp) * (1.0 - smoothstep(0.7, 1.0, d)) * vAlpha;
        vec3 col = mix(uBase, uAccent, vAccent);
        gl_FragColor = vec4(col * a, a);
      }
    `
  });

  const points = new THREE.Points(geo, pointsMat);
  points.frustumCulled = false;
  group.add(points);

  /* ---- attention arcs ----------------------------------------------------- */
  const ARCS = 120, SEG = 24;
  const lp = new Float32Array(ARCS * SEG * 2 * 3);
  const lt = new Float32Array(ARCS * SEG * 2);
  const ls = new Float32Array(ARCS * SEG * 2);
  {
    let v = 0;
    const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), M = new THREE.Vector3();
    const P = new THREE.Vector3();
    const bez = (t, out) => {
      const u = 1 - t;
      return out.set(
        u * u * A.x + 2 * u * t * C.x + t * t * B.x,
        u * u * A.y + 2 * u * t * C.y + t * t * B.y,
        u * u * A.z + 2 * u * t * C.z + t * t * B.z);
    };
    for (let i = 0; i < ARCS; i++) {
      const a = (rnd() * CLUSTERS.length) | 0;
      let b = (rnd() * (CLUSTERS.length - 1)) | 0; if (b >= a) b++;
      const ca = CLUSTERS[a], cb = CLUSTERS[b];
      A.set(ca.x + gauss() * ca.sd * 0.6, ca.y + gauss() * ca.sd * 0.6, ca.z + gauss() * ca.sd * 0.6);
      B.set(cb.x + gauss() * cb.sd * 0.6, cb.y + gauss() * cb.sd * 0.6, cb.z + gauss() * cb.sd * 0.6);
      M.addVectors(A, B).multiplyScalar(0.5);
      const lift = 0.25 + rnd() * 0.65;
      const out = M.lengthSq() > 0.04 ? M.clone().normalize() : new THREE.Vector3(0, 1, 0);
      out.y += 0.6;
      C.copy(M).addScaledVector(out.normalize(), lift);
      const sd = rnd();
      for (let s = 0; s < SEG; s++) {
        for (let e = 0; e < 2; e++) {
          const t = (s + e) / SEG;
          bez(t, P);
          lp[v * 3] = P.x; lp[v * 3 + 1] = P.y; lp[v * 3 + 2] = P.z;
          lt[v] = t; ls[v] = sd;
          v++;
        }
      }
    }
  }
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  lineGeo.setAttribute('aT', new THREE.BufferAttribute(lt, 1));
  lineGeo.setAttribute('aSeed', new THREE.BufferAttribute(ls, 1));
  const lineUniforms = {
    uTime: uniforms.uTime, uSpin: uniforms.uSpin, uFit: uniforms.uFit,
    uBase: uniforms.uBase, uAccent: uniforms.uAccent, uOpacity: { value: 0 }, uDim: uniforms.uDim
  };
  const lineMat = new THREE.ShaderMaterial({
    uniforms: lineUniforms,
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    vertexShader: /* glsl */`
      uniform float uTime, uSpin, uFit, uOpacity, uDim;
      attribute float aT; attribute float aSeed;
      varying float vA; varying float vAcc;
      ${GLSL_COMMON}
      void main(){
        vec3 p = rotY(uSpin * 0.6) * position * uFit;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        // A pulse travels each arc: query -> key.
        float head = fract(uTime * (0.12 + aSeed * 0.1) + aSeed);
        float pulse = 1.0 - smoothstep(0.0, 0.16, abs(aT - head));
        vA = uOpacity * uDim * sin(aT * 3.14159265) * (0.07 + 0.5 * pulse);
        vAcc = step(fract(aSeed * 7.13), 0.14);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uBase, uAccent;
      varying float vA; varying float vAcc;
      void main(){
        gl_FragColor = vec4(mix(uBase, uAccent, vAcc) * vA, vA);
      }
    `
  });
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.frustumCulled = false;
  lines.visible = false;
  lines.renderOrder = -1;
  group.add(lines);

  /* ---- colors ------------------------------------------------------------- */
  // Slight colour-temperature shift per layer (warm -> cool -> warm).
  const TINTS = ['#EDEAE4', '#EAE8E5', '#E5E6E9', '#E3E6EA', '#EBE7E0', '#EFEBE4'].map((c) => new THREE.Color(c));
  const tmpColor = new THREE.Color();

  function setAccent(css) {
    if (!css) return;
    const s = String(css).trim();
    if (!s) return;
    try {
      const probe = new THREE.Color(0xff00ff);
      probe.setStyle(s);
      uniforms.uAccent.value.copy(probe);
    } catch (e) { return; }
    if (booted && !running) renderOnce();
  }
  const readAccent = () => setAccent(getComputedStyle(root).getPropertyValue('--signal') || '#FF5A1F');
  let booted = false;

  /* ---- state -------------------------------------------------------------- */
  let pos = 0, targetPos = 0;          // continuous section coordinate 0..5
  let secT = 0, targetSecT = 0;        // progress within the current section
  let pageP = 0, targetPageP = 0;
  let sectionDriven = false;
  let time = FULL ? 0 : 14.0;
  let spin = 0.6, burstT = 100, fade = FULL ? 0 : 1;
  let offsetX = 0, offsetY = 0, repel = 0, pulse = 0, lastStaticSec = -1;
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  const ndc = new THREE.Vector2(0, 0);
  let pointerOn = false;

  // Desktop: scene sits right of the editorial column early on, centered later.
  const OFFSETS = [0.38, 0.4, 0.16, 0.06, 0, 0];
  const wide = () => view.aspect > 1.15 && !small;
  // Per-section brightness: dimmer where dense copy sits on top of the field.
  const DIM = [1, 0.7, 0.45, 0.5, 0.85, 1];
  const DIM_SMALL = [0.8, 0.5, 0.4, 0.45, 0.7, 1];

  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerpArr = (arr, x) => {
    const i = Math.min(arr.length - 1, Math.max(0, Math.floor(x)));
    const j = Math.min(arr.length - 1, i + 1);
    return arr[i] + (arr[j] - arr[i]) * (x - i);
  };
  const weight = (i, x) => Math.max(0, 1 - Math.abs(x - i));

  /* ---- input -------------------------------------------------------------- */
  window.addEventListener('pointermove', (e) => {
    ndc.set((e.clientX / view.w) * 2 - 1, -(e.clientY / view.h) * 2 + 1);
    par.tx = ndc.x; par.ty = ndc.y;
    pointerOn = e.pointerType === 'mouse' || e.pointerType === 'pen';
  }, { passive: true });
  root.addEventListener('pointerleave', () => { pointerOn = false; par.tx = 0; par.ty = 0; });
  window.addEventListener('blur', () => { pointerOn = false; });
  if (coarse) {
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null || e.beta == null) return;
      par.tx = Math.max(-1, Math.min(1, e.gamma / 30));
      par.ty = Math.max(-1, Math.min(1, (45 - e.beta) / 30));
    }, { passive: true });
  }

  /* ---- sizing ------------------------------------------------------------- */
  let outputKey = '';
  function rebuildOutput() {
    const key = (view.aspect < 0.78 ? 'p' : 'l') + view.aspect.toFixed(2);
    if (key === outputKey) return;
    outputKey = key;
    seed = 0x51f00d; // same dust layout each rebuild
    buildOutput(outArr, view);
    p5Attr.needsUpdate = true;
  }

  function resize() {
    view.w = Math.max(1, window.innerWidth);
    view.h = Math.max(1, window.innerHeight);
    view.aspect = view.w / view.h;
    view.halfH = TAN * CAM_Z;
    view.halfW = view.halfH * view.aspect;
    const pr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    renderer.setPixelRatio(pr);
    renderer.setSize(view.w, view.h, false);
    camera.aspect = view.aspect;
    camera.updateProjectionMatrix();
    // Particle size in device px = worldSize projected at depth (divided by depth in shader).
    uniforms.uSize.value = WORLD_SIZE * view.h * pr / (2 * TAN);
    // Shrink shapes 0-4 on narrow screens; the word fits itself.
    uniforms.uFit.value = Math.min(1, Math.max(0.3, view.halfW / 2.25));
    rebuildOutput();
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); if (!running) renderOnce(); }, 120);
  }, { passive: true });

  /* ---- frame -------------------------------------------------------------- */
  const mouseWorld = new THREE.Vector3();
  const rayDir = new THREE.Vector3();

  function update(dt, snap) {
    time += dt;
    const ease = (rate) => (snap ? 1 : 1 - Math.exp(-dt * rate));

    if (!sectionDriven) targetPos = targetPageP * 5;
    pos += (targetPos - pos) * ease(2.2);
    if (Math.abs(targetPos - pos) < 1e-4) pos = targetPos;
    secT += (targetSecT - secT) * ease(3);
    pageP += (targetPageP - pageP) * ease(3);

    const from = Math.min(5, Math.floor(pos));
    uniforms.uFrom.value = from;
    uniforms.uTo.value = Math.min(5, from + 1);
    uniforms.uMix.value = from >= 5 ? 0 : pos - from;

    uniforms.uTime.value = time;
    spin += dt * 0.07;
    uniforms.uSpin.value = spin;
    uniforms.uBreath.value = 0.03 * Math.sin(time * 1.15) * weight(0, pos);
    uniforms.uSlide.value = (secT - 0.5) * 0.7 * weight(3, pos);

    burstT += dt;
    uniforms.uBurst.value = burstT;
    fade = snap ? 1 : Math.min(1, fade + dt / 1.4);
    uniforms.uFade.value = fade * fade * (3 - 2 * fade);

    // Base tint drifts with the layer.
    const ti = Math.min(5, Math.floor(pos)), tj = Math.min(5, ti + 1);
    tmpColor.copy(TINTS[ti]).lerp(TINTS[tj], pos - ti);
    uniforms.uBase.value.copy(tmpColor);

    // Layout + parallax (word stays straight-on so it reads).
    const tOff = wide() ? lerpArr(OFFSETS, pos) * view.halfW : 0;
    offsetX += (tOff - offsetX) * ease(2.5);
    group.position.x = offsetX;
    // Vertical layout: lift the hero core above the copy on portrait screens, let the
    // hidden-layer planes slide past low, and raise "GUNR" behind the contact headline.
    const portrait = view.aspect < 0.78;
    const tOffY = view.halfH * (
      (portrait ? 0.35 : 0) * weight(0, pos) -
      0.3 * weight(3, pos) +
      (portrait ? 0.2 : 0.28) * weight(5, pos));
    offsetY += (tOffY - offsetY) * ease(2.5);
    group.position.y = offsetY;
    pulse = snap ? 0 : Math.max(0, pulse - dt / 0.6);
    uniforms.uDim.value = lerpArr(small ? DIM_SMALL : DIM, pos) * (1 + 0.4 * weight(5, pos));
    par.x += (par.tx - par.x) * ease(2.2);
    par.y += (par.ty - par.y) * ease(2.2);
    const calm = 1 - 0.6 * weight(5, pos);
    group.rotation.y = par.x * 0.2 * calm + Math.sin(time * 0.11) * 0.06 * calm;
    group.rotation.x = -par.y * 0.12 * calm + Math.sin(time * 0.083) * 0.04 * calm;

    camera.position.z = CAM_Z - 0.55 * Math.sin(pageP * Math.PI);
    uniforms.uFocus.value = camera.position.z;
    group.updateMatrixWorld();

    // Pointer in group-local space for the hero repulsion.
    const rTarget = pointerOn ? weight(0, pos) : 0;
    repel += (rTarget - repel) * ease(4);
    uniforms.uRepel.value = repel;
    if (repel > 0.001) {
      mouseWorld.set(ndc.x, ndc.y, 0.5).unproject(camera);
      rayDir.copy(mouseWorld).sub(camera.position).normalize();
      const t = -camera.position.z / rayDir.z;
      mouseWorld.copy(camera.position).addScaledVector(rayDir, t);
      group.worldToLocal(mouseWorld);
      uniforms.uMouse.value.copy(mouseWorld);
    }

    const w2 = smooth(0.15, 1, weight(2, pos));
    lineUniforms.uOpacity.value = w2 * uniforms.uFade.value * (1 + 0.8 * pulse);
    lines.visible = w2 > 0.002;
  }

  function renderOnce() {
    update(0, true);
    renderer.render(scene, camera);
  }

  let raf = 0, running = false, manualPause = false, last = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    update(dt, false);
    renderer.render(scene, camera);
  }
  function start() {
    if (!FULL || running || manualPause || document.hidden) return;
    running = true; last = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); stop(); }, false);
  canvas.addEventListener('webglcontextrestored', () => { if (FULL) start(); else renderOnce(); }, false);

  /* ---- public API --------------------------------------------------------- */
  const api = {
    ready: true,
    motion: FULL ? 'full' : 'reduced',
    setProgress(p) {
      targetPageP = clamp01(+p || 0);
    },
    setSection(i, t) {
      i = Math.max(0, Math.min(5, Math.round(+i || 0)));
      t = clamp01(t == null ? 0 : +t);
      sectionDriven = true;
      if (!FULL) {
        // Reduced motion: one still frame per section, never a scroll-linked morph.
        targetSecT = 0; targetPos = i;
        if (i !== lastStaticSec) { lastStaticSec = i; renderOnce(); }
        return;
      }
      targetSecT = t;
      targetPos = i < 5 ? i + smooth(0.65, 1, t) : 5;
    },
    burst() {
      if (!FULL) return;
      burstT = 0;
      fade = Math.max(fade, 0.85);
    },
    // Briefly brightens the attention arcs (research row hover).
    pulse() {
      if (FULL) pulse = 1;
    },
    setAccent,
    pause() { manualPause = true; stop(); },
    resume() { manualPause = false; if (FULL) start(); else renderOnce(); },
    staticFrame() { renderOnce(); }
  };
  window.GUNR_SCENE = api;

  readAccent();
  try {
    new MutationObserver(readAccent).observe(root, { attributes: true, attributeFilter: ['data-theme', 'style'] });
  } catch (e) { /* ignore */ }
  resize();
  booted = true;
  if (FULL) start(); else renderOnce();

  // Re-sample the word once the brand font is available.
  if (document.fonts && document.fonts.load) {
    document.fonts.load(`600 200px "Geist"`).then(() => {
      if (document.fonts.check(`600 200px "Geist"`)) {
        outputKey = '';
        rebuildOutput();
        if (!running) renderOnce();
      }
    }).catch(() => {});
  }

  document.dispatchEvent(new CustomEvent('gunr:scene-ready', { detail: api }));
}
