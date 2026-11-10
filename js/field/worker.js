/* =============================================================================
 * GUNR.DEV — field/worker.js
 * -----------------------------------------------------------------------------
 * Trains a small neural field  f(x, y) -> height  off the main thread.
 *
 *   model   multi-resolution feature grids (L levels, 2 features each, bilinear)
 *           -> MLP (2L -> H leaky-ReLU -> 1)
 *   loss    mean squared error against a target height map
 *   optim   Adam, mini-batches of random positions (half drawn near letter edges)
 *
 * The target is a terrain: text rises as plateaus (a signed distance field of
 * the rasterised glyphs) out of low procedural hills. The page draws whatever
 * the network currently believes, so visitors watch it learn.
 *
 * Messages in:   init {cfg} · mask {mask, W, Hh, S} · perturb {amount}
 *                pause · resume
 * Messages out:  ready {params} · field {buf, w, h, step, loss, sps, state}
 * ========================================================================== */
"use strict";

var C = null;                 // config from the page
var L = 0, F = 2, H = 16, IN = 0;
var lv = [];                  // per level: { nx, ny, rs (row stride), off }
var P = null, Gd = null, M1 = null, V1 = null, NP = 0;
var oW1 = 0, oB1 = 0, oW2 = 0, oB2 = 0, fineFrom = 0, fineTo = 0;
var tw = 0, th = 0, target = null, edge = null;
var colI = null, colF = null, rowI = null, rowF = null;
var feat = null, dfe = null, zh = null, cidx = null, cwt = null;

var step = 0, since = 0, adamT = 0, lossEma = 0.2, lossRef = 1, state = "idle";
var running = true, timer = 0, spsT = 0, spsN = 0, sps = 0;
var seed = 0x9e3779b9;

function rnd() {              // xorshift32 -> [0, 1)
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
}
function gauss() {
  var u = rnd() || 1e-7, v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307179586 * v);
}

/* ---- model ------------------------------------------------------------------- */
function init(cfg) {
  C = cfg;
  tw = cfg.gw; th = cfg.gh;
  L = cfg.levels || 6; H = cfg.hidden || 16; IN = L * F;
  seed = (cfg.seed >>> 0) || 0x9e3779b9;

  var landscape = tw >= th, long = landscape ? tw : th;
  var base = cfg.base || 5, top = cfg.top || long;
  var growth = Math.pow(top / base, 1 / (L - 1));
  var off = 0, l, i;
  lv = [];
  for (l = 0; l < L; l++) {
    var n = base * Math.pow(growth, l);            // cells along the long side
    var nx = Math.max(2, Math.round(landscape ? n : n * tw / th));
    var ny = Math.max(2, Math.round(landscape ? n * th / tw : n));
    lv.push({ nx: nx, ny: ny, rs: (nx + 1) * F, off: off });
    off += (nx + 1) * (ny + 1) * F;
  }
  var NG = off;
  oW1 = off; off += H * IN;
  oB1 = off; off += H;
  oW2 = off; off += H;
  oB2 = off; off += 1;
  NP = off;

  P = new Float32Array(NP); Gd = new Float32Array(NP);
  M1 = new Float32Array(NP); V1 = new Float32Array(NP);

  // Coarse levels start with big smooth bumps, fine levels almost flat: the
  // untrained network already looks like a (wrong) landscape, not pixel noise.
  for (l = 0; l < L; l++) {
    var s = l < 3 ? 0.5 * Math.pow(0.5, l) : 1e-4, end = l + 1 < L ? lv[l + 1].off : NG;
    for (i = lv[l].off; i < end; i++) P[i] = (rnd() * 2 - 1) * s;
  }
  fineFrom = lv[Math.min(3, L - 1)].off; fineTo = NG;
  var a1 = Math.sqrt(6 / IN), a2 = Math.sqrt(0.6 / H);
  for (i = 0; i < H * IN; i++) P[oW1 + i] = (rnd() * 2 - 1) * a1;
  for (i = 0; i < H; i++) P[oW2 + i] = (rnd() * 2 - 1) * a2;
  P[oB2] = 0.2;

  // Per-column / per-row lookup tables for evaluating the whole field.
  colI = new Int32Array(L * tw); colF = new Float32Array(L * tw);
  rowI = new Int32Array(L * th); rowF = new Float32Array(L * th);
  for (l = 0; l < L; l++) {
    var g = lv[l];
    for (i = 0; i < tw; i++) {
      var gx = (i + 0.5) / tw * g.nx, i0 = Math.min(gx | 0, g.nx - 1);
      colI[l * tw + i] = i0 * F; colF[l * tw + i] = gx - i0;
    }
    for (i = 0; i < th; i++) {
      var gy = (i + 0.5) / th * g.ny, j0 = Math.min(gy | 0, g.ny - 1);
      rowI[l * th + i] = j0 * g.rs; rowF[l * th + i] = gy - j0;
    }
  }
  feat = new Float32Array(IN); dfe = new Float32Array(IN); zh = new Float32Array(H);
  cidx = new Int32Array(L); cwt = new Float32Array(L * 4);

  step = 0; since = 0; adamT = 0; lossEma = 0.2; lossRef = 1; state = "idle";
  target = null; edge = null;
  postMessage({ type: "ready", params: NP, levels: L, hidden: H });
}

function trainStep(lr) {
  Gd.fill(0);
  var B = C.batch, loss = 0, inv = 2 / B, ne = edge ? edge.length : 0;
  var s, l, k, i, g, b, b2, a, wo;
  for (s = 0; s < B; s++) {
    var u, v;
    if (ne && (s & 1)) {                           // half the batch hugs the glyph edges
      var e = edge[(rnd() * ne) | 0];
      u = ((e % tw) + rnd()) / tw; v = (((e / tw) | 0) + rnd()) / th;
    } else { u = rnd(); v = rnd(); }

    // target height, bilinear at texel centres
    var tx = u * tw - 0.5, ty = v * th - 0.5;
    var x0 = Math.floor(tx), y0 = Math.floor(ty), ax = tx - x0, ay = ty - y0, x1 = x0 + 1, y1 = y0 + 1;
    if (x0 < 0) x0 = 0; if (x1 > tw - 1) x1 = tw - 1;
    if (y0 < 0) y0 = 0; if (y1 > th - 1) y1 = th - 1;
    var t = (target[y0 * tw + x0] * (1 - ax) + target[y0 * tw + x1] * ax) * (1 - ay) +
            (target[y1 * tw + x0] * (1 - ax) + target[y1 * tw + x1] * ax) * ay;

    // forward: grid features
    for (l = 0; l < L; l++) {
      g = lv[l];
      var gx = u * g.nx, gy = v * g.ny, i0 = gx | 0, j0 = gy | 0;
      if (i0 > g.nx - 1) i0 = g.nx - 1;
      if (j0 > g.ny - 1) j0 = g.ny - 1;
      var fx = gx - i0, fy = gy - j0;
      b = g.off + j0 * g.rs + i0 * F; b2 = b + g.rs;
      var w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
      cidx[l] = b; k = l * 4;
      cwt[k] = w00; cwt[k + 1] = w10; cwt[k + 2] = w01; cwt[k + 3] = w11;
      feat[l * 2]     = P[b] * w00 + P[b + 2] * w10 + P[b2] * w01 + P[b2 + 2] * w11;
      feat[l * 2 + 1] = P[b + 1] * w00 + P[b + 3] * w10 + P[b2 + 1] * w01 + P[b2 + 3] * w11;
    }
    // forward: MLP
    var y = P[oB2];
    for (k = 0; k < H; k++) {
      a = P[oB1 + k]; wo = oW1 + k * IN;
      for (i = 0; i < IN; i++) a += P[wo + i] * feat[i];
      zh[k] = a;
      y += P[oW2 + k] * (a > 0 ? a : 0.1 * a);
    }
    var err = y - t;
    loss += err * err;

    // backward
    var dy = err * inv;
    Gd[oB2] += dy;
    for (i = 0; i < IN; i++) dfe[i] = 0;
    for (k = 0; k < H; k++) {
      a = zh[k];
      Gd[oW2 + k] += dy * (a > 0 ? a : 0.1 * a);
      var dz = dy * P[oW2 + k] * (a > 0 ? 1 : 0.1);
      Gd[oB1 + k] += dz; wo = oW1 + k * IN;
      for (i = 0; i < IN; i++) { Gd[wo + i] += dz * feat[i]; dfe[i] += dz * P[wo + i]; }
    }
    for (l = 0; l < L; l++) {
      b = cidx[l]; b2 = b + lv[l].rs; k = l * 4;
      var d0 = dfe[l * 2], d1 = dfe[l * 2 + 1];
      a = cwt[k];     Gd[b] += a * d0;      Gd[b + 1] += a * d1;
      a = cwt[k + 1]; Gd[b + 2] += a * d0;  Gd[b + 3] += a * d1;
      a = cwt[k + 2]; Gd[b2] += a * d0;     Gd[b2 + 1] += a * d1;
      a = cwt[k + 3]; Gd[b2 + 2] += a * d0; Gd[b2 + 3] += a * d1;
    }
  }
  // Adam
  adamT++;
  var be1 = 0.9, be2 = 0.99;
  var alpha = lr * Math.sqrt(1 - Math.pow(be2, adamT)) / (1 - Math.pow(be1, adamT));
  for (i = 0; i < NP; i++) {
    var gr = Gd[i];
    var m = M1[i] = be1 * M1[i] + (1 - be1) * gr;
    var vv = V1[i] = be2 * V1[i] + (1 - be2) * gr * gr;
    P[i] -= alpha * m / (Math.sqrt(vv) + 1e-9);
  }
  // Decoupled weight decay on the fine levels: detail the target doesn't ask
  // for fades out, which keeps the open terrain's contour lines calm.
  var wd = 1 - lr * 0.6;
  for (i = fineFrom; i < fineTo; i++) P[i] *= wd;
  return loss / B;
}

function evalField(out) {
  var q = 0, i, j, l, k, a, wo;
  for (j = 0; j < th; j++) {
    for (i = 0; i < tw; i++) {
      for (l = 0; l < L; l++) {
        var g = lv[l];
        var b = g.off + rowI[l * th + j] + colI[l * tw + i], b2 = b + g.rs;
        var fx = colF[l * tw + i], fy = rowF[l * th + j], gx = 1 - fx;
        var t0 = P[b] * gx + P[b + 2] * fx, t1 = P[b + 1] * gx + P[b + 3] * fx;
        feat[l * 2]     = t0 + (P[b2] * gx + P[b2 + 2] * fx - t0) * fy;
        feat[l * 2 + 1] = t1 + (P[b2 + 1] * gx + P[b2 + 3] * fx - t1) * fy;
      }
      var y = P[oB2];
      for (k = 0; k < H; k++) {
        a = P[oB1 + k]; wo = oW1 + k * IN;
        for (l = 0; l < IN; l++) a += P[wo + l] * feat[l];
        y += P[oW2 + k] * (a > 0 ? a : 0.1 * a);
      }
      out[q++] = y;
    }
  }
}

/* ---- target: glyph mask -> signed distance -> terrain ------------------------ */
var INF = 1e20;
function edt1d(f, d, v, z, n) {                    // Felzenszwalb & Huttenlocher
  var k = 0, q, s, p;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (q = 1; q < n; q++) {
    for (;;) {
      p = v[k];
      s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p);
      if (s <= z[k] && k > 0) k--; else break;
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
  }
}
function edt2d(grid, W, Hh) {                      // in place, squared distances
  var n = Math.max(W, Hh);
  var f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  var x, y;
  for (x = 0; x < W; x++) {
    for (y = 0; y < Hh; y++) f[y] = grid[y * W + x];
    edt1d(f, d, v, z, Hh);
    for (y = 0; y < Hh; y++) grid[y * W + x] = d[y];
  }
  for (y = 0; y < Hh; y++) {
    for (x = 0; x < W; x++) f[x] = grid[y * W + x];
    edt1d(f, d, v, z, W);
    for (x = 0; x < W; x++) grid[y * W + x] = d[x];
  }
}
function hash2(ix, iy) {
  var h = (ix * 374761393 + iy * 668265263 + 1013904223) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  var a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function terrain(x, y) {                           // 0..1, gentle hills
  return 0.55 * vnoise(x, y) + 0.3 * vnoise(x * 2.1 + 7.3, y * 2.1 - 3.1) + 0.15 * vnoise(x * 4.3 - 11.7, y * 4.3 + 5.9);
}

function setMask(m) {
  var W = m.W, Hh = m.Hh, S = m.S, mask = m.mask, n = W * Hh, i;
  var dIn = new Float64Array(n), dOut = new Float64Array(n), any = false;
  for (i = 0; i < n; i++) {
    if (mask[i]) { dOut[i] = 0; dIn[i] = INF; any = true; } else { dOut[i] = INF; dIn[i] = 0; }
  }
  if (any) { edt2d(dOut, W, Hh); edt2d(dIn, W, Hh); }

  // Height profile across a glyph edge (d = signed distance in field cells):
  //   a steep "cliff" 0.5 -> 0.7 within +-cl cells keeps the 0.6 shoreline crisp,
  //   inside it keeps rising gently (room for one inline contour),
  //   outside it decays into the procedural hills.
  var short = Math.min(tw, th);
  var cl = Math.min(2.6, Math.max(1.3, short * 0.008)), R = short * 0.125, freq = 2.3 / short, h0 = S >> 1;
  var t = new Float32Array(tw * th), ed = [];
  for (var j = 0; j < th; j++) {
    for (i = 0; i < tw; i++) {
      var q = (j * S + h0) * W + (i * S + h0);
      var far = 0.03 + 0.3 * terrain(i * freq + 3.7, j * freq + 1.9), hgt, d;
      if (!any) hgt = far;
      else if (mask[q]) {
        d = (Math.sqrt(dIn[q]) - 0.5) / S;
        hgt = d < cl ? 0.6 + 0.1 * d / cl : Math.min(0.95, 0.7 + 0.03 * (d - cl));
      } else {
        d = (Math.sqrt(dOut[q]) - 0.5) / S;
        hgt = d < cl ? 0.6 - 0.1 * d / cl : far + (0.5 - far) * Math.exp(-(d - cl) / R);
      }
      t[j * tw + i] = hgt;
      if (hgt > 0.47 && hgt < 0.78) ed.push(j * tw + i);
    }
  }
  target = t;
  edge = ed.length ? new Int32Array(ed) : null;
  since = 0; lossRef = 1; state = "training";
  // Reduced motion: show the finished terrain at once; the network catches up quietly.
  if (C.instant) post(target);
  kick();
}

function perturb(amount) {
  if (!P) return;
  for (var l = 0; l < L; l++) {
    var s = amount * 0.55 * Math.pow(0.66, l), end = l + 1 < L ? lv[l + 1].off : oW1;
    for (var i = lv[l].off; i < end; i++) P[i] += gauss() * s;
  }
  M1.fill(0); V1.fill(0); adamT = 0;
  since = 0; lossRef = 1; lossEma = Math.max(lossEma, 0.05); state = "training";
  kick();
}

/* ---- loop -------------------------------------------------------------------- */
// Two channels per texel: the raw output (crisp glyph shoreline) and a softly
// blurred copy (silky contour lines on the open terrain).
var rawF = null, tmpF = null, smF = null;
function blurPass(src, dst, w, h, horiz) {         // binomial 1 4 6 4 1
  var x, y, i, a, b, c, d, e;
  if (horiz) {
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x;
      a = src[y * w + (x > 1 ? x - 2 : 0)]; b = src[y * w + (x > 0 ? x - 1 : 0)]; c = src[i];
      d = src[y * w + (x < w - 1 ? x + 1 : w - 1)]; e = src[y * w + (x < w - 2 ? x + 2 : w - 1)];
      dst[i] = (a + e + 4 * (b + d) + 6 * c) * 0.0625;
    }
  } else {
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      i = y * w + x;
      a = src[(y > 1 ? y - 2 : 0) * w + x]; b = src[(y > 0 ? y - 1 : 0) * w + x]; c = src[i];
      d = src[(y < h - 1 ? y + 1 : h - 1) * w + x]; e = src[(y < h - 2 ? y + 2 : h - 1) * w + x];
      dst[i] = (a + e + 4 * (b + d) + 6 * c) * 0.0625;
    }
  }
}
function post(src) {
  var n = tw * th, i;
  if (!rawF || rawF.length !== n) { rawF = new Float32Array(n); tmpF = new Float32Array(n); smF = new Float32Array(n); }
  var buf = new Float32Array(n * 2), sm = smF;
  if (src) tmpF.set(src); else evalField(tmpF);
  soften(tmpF, rawF, tw, th);
  blurPass(rawF, tmpF, tw, th, true); blurPass(tmpF, sm, tw, th, false);
  blurPass(sm, tmpF, tw, th, true); blurPass(tmpF, sm, tw, th, false);
  for (i = 0; i < n; i++) { buf[i * 2] = rawF[i]; buf[i * 2 + 1] = sm[i]; }
  postMessage({ type: "field", buf: buf, w: tw, h: th, step: step, loss: lossEma, sps: sps, state: state }, [buf.buffer]);
}
function loop() {
  timer = 0;
  if (!running || !target) return;
  var t0 = performance.now();
  if (state === "training") {
    var maxN = C.instant ? 60 : (C.stepsPerFrame || 3) * (since > 140 ? 2 : 1), budget = C.instant ? 26 : 15, n = 0;
    while (n < maxN && performance.now() - t0 < budget) {
      var lr = Math.max(0.0022, 0.014 * Math.pow(0.5, since / 320)) * Math.min(1, (step + 4) / 40);
      var ls = trainStep(lr);
      lossEma += (ls - lossEma) * (since < 8 ? 0.5 : 0.12);
      step++; since++; n++; spsN++;
      if (since % 70 === 0) {                       // plateau check
        if (since >= 420 && (lossEma > lossRef * 0.975 || lossEma < 2e-5)) state = "idle";
        lossRef = lossEma;
      }
      if (since > 1400) state = "idle";
      if (state === "idle") break;
    }
    var now = performance.now();
    if (!spsT) spsT = now;
    if (now - spsT > 500) { sps = spsN * 1000 / (now - spsT); spsN = 0; spsT = now; }
    if (C.instant && state !== "idle") { timer = setTimeout(loop, 0); return; }
  }
  post();
  if (state === "training") timer = setTimeout(loop, Math.max(0, 33 - (performance.now() - t0)));
}
function kick() { if (!timer && running && target) timer = setTimeout(loop, 0); }

onmessage = function (ev) {
  var m = ev.data;
  if (m.type === "init") { if (timer) { clearTimeout(timer); timer = 0; } init(m.cfg); }
  else if (m.type === "mask") { if (C && m.gw === tw && m.gh === th) setMask(m); }
  else if (m.type === "perturb") perturb(m.amount || 1);
  else if (m.type === "pause") { running = false; if (timer) { clearTimeout(timer); timer = 0; } }
  else if (m.type === "resume") { running = true; spsT = 0; spsN = 0; kick(); }
};

// Light 3x3 smoothing of the raw output: steadies the glyph shoreline without moving it.
function soften(src, dst, w, h) {
  for (var y = 0; y < h; y++) {
    var y0 = (y > 0 ? y - 1 : 0) * w, y1 = y * w, y2 = (y < h - 1 ? y + 1 : h - 1) * w;
    for (var x = 0; x < w; x++) {
      var xa = x > 0 ? x - 1 : 0, xb = x < w - 1 ? x + 1 : w - 1;
      dst[y1 + x] = (src[y0 + xa] + src[y0 + xb] + src[y2 + xa] + src[y2 + xb] +
        2 * (src[y0 + x] + src[y2 + x] + src[y1 + xa] + src[y1 + xb]) + 4 * src[y1 + x]) * 0.0625;
    }
  }
}
