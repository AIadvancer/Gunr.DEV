/* =============================================================================
 * GUNR.DEV — field/field.js
 * -----------------------------------------------------------------------------
 * The page side of the live neural field:
 *   1. rasterises text into a glyph mask and hands it to the trainer (worker.js)
 *   2. receives the network's current height field a few dozen times a second
 *   3. draws it as a topographic map in WebGL2: contour lines that drift, the
 *      glyph plateaus filled solid, relief shading, a hill under the pointer
 *
 * window.GUNR_FIELD.create(canvas, opts) -> field | null (no WebGL2 / Worker)
 *   field.setText(lines, layout)   learn new words (array of strings)
 *   field.perturb(amount)          add noise to the weights; it re-learns
 *   field.setTheme(theme, instant) colours (see COL / NUM keys below)
 *   field.setCamera(zoom, cy)      scroll-driven zoom about a vertical centre
 *   field.setVisible(bool)         stop drawing / training while covered
 *   field.heightAt(u, v)           what the network outputs at a point
 *   field.resize()
 * opts: { workerUrl, font, motion, coarse, onStats(stats), onReady(info) }
 * ========================================================================== */
(function () {
  "use strict";

  var VERT = "#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";

  var FRAG = [
    "#version 300 es",
    "precision highp float;",
    "uniform sampler2D uA,uB;",
    "uniform vec2 uRes,uSize,uPointer,uCenter;",
    "uniform float uMix,uTime,uHeat,uZoom,uDpr,uPointerAmp,uDrift;",
    "uniform float uLineA,uIndexA,uRelief,uGlow,uGrain,uVig,uEngrave;",
    "uniform vec3 uBg,uLine,uFill,uAccent;",
    "out vec4 outColor;",
    "const float STEP=0.04;",     // height between contour lines
    "const float SEA=0.6;",       // glyphs are everything above this height
    "vec4 cubic(float v){vec4 n=vec4(1.,2.,3.,4.)-v;vec4 s=n*n*n;float x=s.x;float y=s.y-4.*s.x;float z=s.z-4.*s.y+6.*s.x;float w=6.-x-y-z;return vec4(x,y,z,w)*(1./6.);}",
    // B-spline bicubic from four bilinear taps: smooth contours from a coarse field.
    "vec2 bicubic(sampler2D t,vec2 uv){",
    "  uv=uv*uSize-.5;vec2 f=fract(uv);uv-=f;",
    "  vec4 xc=cubic(f.x),yc=cubic(f.y);",
    "  vec4 c=uv.xxyy+vec2(-.5,1.5).xyxy;",
    "  vec4 s=vec4(xc.xz+xc.yw,yc.xz+yc.yw);",
    "  vec4 o=(c+vec4(xc.yw,yc.yw)/s)/uSize.xxyy;",
    "  float sx=s.x/(s.x+s.y),sy=s.z/(s.z+s.w);",
    "  return mix(mix(texture(t,o.yw).rg,texture(t,o.xw).rg,sx),mix(texture(t,o.yz).rg,texture(t,o.xz).rg,sx),sy);",
    "}",
    "float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}",
    "void main(){",
    "  vec2 uv=gl_FragCoord.xy/uRes;uv.y=1.-uv.y;",
    "  vec2 p=(uv-uCenter)/uZoom+uCenter;",
    "  vec2 hs=mix(bicubic(uA,p),bicubic(uB,p),uMix);float h=hs.x,hm=hs.y;",
    "  float land=1.-smoothstep(.43,.49,hm);",                // open terrain, clear of the glyph cliffs
    // a hill follows the pointer; contour lines wrap around it
    "  vec2 dp=(p-uPointer)*vec2(uRes.x/uRes.y,1.);",
    "  float hh=hm+uPointerAmp*.16*exp(-dot(dp,dp)/.009)*land;",
    "  float lvl=hh/STEP;",
    "  float fw=max(fwidth(lvl),1e-4);",
    "  float t1=lvl+uTime*uDrift;",
    "  float d1=abs(fract(t1-.5)-.5)/fw;",
    "  float d5=abs(fract(t1/5.-.5)-.5)*5./fw;",
    "  float lw=.5*uDpr;",
    "  float flat_=smoothstep(.0012,.005,fw);",              // no lines on plateaus
    "  float dense=1.-smoothstep(.3,.85,fw);",               // nor where they would alias
    "  float line=(1.-smoothstep(lw-.6,lw+.6,d1))*flat_*dense*land;",
    "  float index=(1.-smoothstep(lw*1.8-.6,lw*1.8+.6,d5))*flat_*dense*land;",
    "  float fh=max(fwidth(h),1e-5);",
    "  float inside=smoothstep(-.7,.7,(h-SEA)/fh);",
    // one inline contour inside the glyphs
    "  float inl=(1.-smoothstep(lw*1.1-.6,lw*1.1+.6,abs(h-.688)/fh))*smoothstep(.0008,.004,fh);",
    "  vec2 g=vec2(dFdx(hh),dFdy(hh))/STEP;",
    "  float shade=clamp((g.y-g.x)*2.4,-1.,1.)*land;",       // light from the top left
    "  float near=smoothstep(.16,.5,hm);",
    "  vec3 col=uBg+shade*uRelief;",
    "  col=mix(col,uAccent,near*near*uGlow);",
    "  vec3 lc=mix(uLine,uAccent,clamp(uHeat*.9+near*near*.55,0.,1.));",
    "  float la=clamp(line*uLineA+index*uIndexA,0.,1.);",
    "  col=mix(col,lc,la);",
    "  vec3 fc=mix(uFill,mix(uBg,uAccent,uHeat),inl*uEngrave);",
    "  float rim=(1.-smoothstep(.5,2.4*uDpr,abs(h-SEA)/fh))*uHeat;",
    "  col=mix(col,fc,inside);",
    "  col=mix(col,uAccent,rim*.85);",
    "  col+=(hash(gl_FragCoord.xy+fract(uTime*.37)*91.)-.5)*uGrain;",
    "  vec2 q=uv-.5;col*=1.-uVig*smoothstep(.25,.85,dot(q,q)*1.6);",
    "  outColor=vec4(col,1.);",
    "}"
  ].join("\n");

  function hex(c) {
    c = String(c).trim().replace("#", "");
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var n = parseInt(c, 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
  var NUM = ["lineA", "indexA", "relief", "glow", "grain", "vig", "engrave"], COL = ["bg", "line", "fill", "accent"];

  function Field(canvas, opts) {
    opts = opts || {};
    var gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" });
    if (!gl || !window.Worker) throw new Error("unsupported");

    var motion = opts.motion !== false, coarse = !!opts.coarse;
    var fam = opts.font || 'Anton, "Arial Narrow", Impact, sans-serif';

    /* ---- GL setup ---------------------------------------------------------- */
    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
    gl.useProgram(prog);
    var U = {};
    ["uA", "uB", "uRes", "uSize", "uPointer", "uCenter", "uMix", "uTime", "uHeat", "uZoom", "uDpr", "uPointerAmp", "uDrift",
      "uLineA", "uIndexA", "uRelief", "uGlow", "uGrain", "uVig", "uEngrave", "uBg", "uLine", "uFill", "uAccent"
    ].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    var vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    function makeTex() {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }
    var texA = makeTex(), texB = makeTex();
    function upload(tex, buf, w, h) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, w, h, 0, gl.RG, gl.FLOAT, buf);
    }

    /* ---- state ------------------------------------------------------------- */
    var grid = null, text = null, layout = null, have = 0, lastBuf = null;
    var mixStart = 0, mixDur = 60, lastFieldAt = 0;
    var visible = true, raf = 0, clock = 0, lastT = 0;
    var heat = 0, heatT = 1, zoom = 1, centerY = 0.5;
    var ptr = { u: 0.5, v: 0.5, tu: 0.5, tv: 0.5, amp: 0, tamp: 0, at: 0 };
    var theme = null, themeT = null, lost = false;
    var stats = { step: 0, loss: 1, sps: 0, state: "init", params: 0 };
    var raster = null, seed = (Math.random() * 4294967295) >>> 0;

    var worker = new Worker(opts.workerUrl || "js/field/worker.js");
    worker.onmessage = function (ev) {
      var m = ev.data;
      if (m.type === "ready") {
        stats.params = m.params;
        if (opts.onReady) opts.onReady(m);
      } else if (m.type === "field") {
        if (!grid || m.w !== grid.gw || m.h !== grid.gh || lost) return;
        var now = performance.now();
        if (!have) { upload(texA, m.buf, m.w, m.h); upload(texB, m.buf, m.w, m.h); }
        else {
          var sw = texA; texA = texB; texB = sw;     // the newest field is always B
          upload(texB, m.buf, m.w, m.h);
          mixDur = Math.min(140, Math.max(34, now - lastFieldAt));
        }
        mixStart = now; lastFieldAt = now; have++;
        lastBuf = m.buf;
        stats.step = m.step; stats.loss = m.loss; stats.sps = m.sps; stats.state = m.state;
        heatT = m.state === "training" ? Math.min(1, Math.max(0, (Math.sqrt(m.loss) - 0.018) / 0.15)) : 0;
        if (opts.onStats) opts.onStats(stats);
        request();
      }
    };

    /* ---- text -> mask ------------------------------------------------------ */
    function rasterize(lines, W, Hh, lay) {
      var cv = raster || (raster = document.createElement("canvas"));
      cv.width = W; cv.height = Hh;
      var ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, Hh);
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
      var REF = 200, i;
      ctx.font = "400 " + REF + "px " + fam;
      var cap = ctx.measureText("H").actualBoundingBoxAscent || REF * 0.72;
      // Each line is set to the same width (poster style), within a height cap.
      var maxS = Hh * lay.maxCap / cap;
      var sc = lines.map(function (ln) { return Math.min(W * lay.fitW / Math.max(1, ctx.measureText(ln).width), maxS); });
      var total = 0;
      for (i = 0; i < sc.length; i++) total += cap * sc[i] + (i ? lay.gap * cap * Math.min(sc[i], sc[i - 1]) : 0);
      var k = Math.min(1, Hh * lay.fitH / total), y = lay.cy * Hh - total * k / 2;
      for (i = 0; i < lines.length; i++) {
        var s = sc[i] * k;
        if (i) y += lay.gap * cap * Math.min(s, sc[i - 1] * k);
        y += cap * s;
        ctx.font = "400 " + (REF * s) + "px " + fam;
        ctx.fillText(lines[i], lay.cx * W, y);
      }
      var img = ctx.getImageData(0, 0, W, Hh).data, mask = new Uint8Array(W * Hh);
      for (i = 0; i < mask.length; i++) mask[i] = img[i * 4] > 110 ? 1 : 0;
      return mask;
    }
    function sendMask() {
      if (!grid || !text) return;
      var S = coarse ? 2 : 3, W = grid.gw * S, Hh = grid.gh * S;
      var mask = rasterize(text, W, Hh, layout);
      worker.postMessage({ type: "mask", mask: mask, W: W, Hh: Hh, S: S, gw: grid.gw, gh: grid.gh }, [mask.buffer]);
    }

    /* ---- sizing ------------------------------------------------------------ */
    function resize() {
      var r = canvas.getBoundingClientRect(), cw = r.width, ch = r.height;
      if (cw < 2 || ch < 2) return;                  // not laid out yet
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var W = Math.round(cw * dpr), Hh = Math.round(ch * dpr);
      if (canvas.width !== W || canvas.height !== Hh) { canvas.width = W; canvas.height = Hh; }
      var asp = cw / ch;
      if (!grid || Math.abs(asp / grid.asp - 1) > 0.08) {
        var N = coarse ? 84000 : 96000;
        var gw = Math.max(96, Math.round(Math.sqrt(N * asp))), gh = Math.max(96, Math.round(gw / asp));
        grid = { gw: gw, gh: gh, asp: asp };
        have = 0; lastBuf = null;
        worker.postMessage({ type: "init", cfg: {
          gw: gw, gh: gh, levels: 7, hidden: 16, batch: coarse ? 1024 : 1536,
          stepsPerFrame: 3, instant: !motion, seed: seed
        } });
        sendMask();
      }
      request();
    }

    /* ---- draw -------------------------------------------------------------- */
    function lerpTheme(k) {
      var done = true, i, j;
      for (i = 0; i < COL.length; i++) for (j = 0; j < 3; j++) {
        var c = theme[COL[i]], d = themeT[COL[i]][j] - c[j];
        if (Math.abs(d) > 0.002) { c[j] += d * k; done = false; } else c[j] = themeT[COL[i]][j];
      }
      for (i = 0; i < NUM.length; i++) {
        var dn = themeT[NUM[i]] - theme[NUM[i]];
        if (Math.abs(dn) > 0.001) { theme[NUM[i]] += dn * k; done = false; } else theme[NUM[i]] = themeT[NUM[i]];
      }
      return done;
    }
    function draw(now) {
      var dt = Math.min(0.05, lastT ? (now - lastT) / 1000 : 0.016);
      lastT = now;
      if (motion) clock += dt;
      var settled = true;
      heat += (heatT - heat) * Math.min(1, dt * 5);
      if (Math.abs(heatT - heat) > 0.004) settled = false;
      if (now - ptr.at > 2600) ptr.tamp = 0;
      ptr.u += (ptr.tu - ptr.u) * Math.min(1, dt * 16);
      ptr.v += (ptr.tv - ptr.v) * Math.min(1, dt * 16);
      ptr.amp += (ptr.tamp - ptr.amp) * Math.min(1, dt * 5);
      if (Math.abs(ptr.tamp - ptr.amp) > 0.004 || Math.abs(ptr.tu - ptr.u) > 0.0005 || Math.abs(ptr.tv - ptr.v) > 0.0005) settled = false;
      if (theme && themeT && !lerpTheme(Math.min(1, dt * 7))) settled = false;
      var mix = Math.min(1, (now - mixStart) / mixDur);
      if (mix < 1) settled = false;
      if (!have || !theme) return settled;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texA);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texB);
      gl.uniform1i(U.uA, 0); gl.uniform1i(U.uB, 1);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform2f(U.uSize, grid.gw, grid.gh);
      gl.uniform2f(U.uCenter, 0.5, centerY);
      gl.uniform2f(U.uPointer, (ptr.u - 0.5) / zoom + 0.5, (ptr.v - centerY) / zoom + centerY);
      gl.uniform1f(U.uMix, mix);
      gl.uniform1f(U.uTime, clock);
      gl.uniform1f(U.uHeat, heat);
      gl.uniform1f(U.uZoom, zoom);
      gl.uniform1f(U.uDpr, canvas.width / Math.max(1, canvas.clientWidth));
      gl.uniform1f(U.uPointerAmp, ptr.amp);
      gl.uniform1f(U.uDrift, motion ? 0.22 : 0);
      gl.uniform1f(U.uLineA, theme.lineA); gl.uniform1f(U.uIndexA, theme.indexA);
      gl.uniform1f(U.uRelief, theme.relief); gl.uniform1f(U.uGlow, theme.glow);
      gl.uniform1f(U.uGrain, theme.grain); gl.uniform1f(U.uVig, theme.vig);
      gl.uniform1f(U.uEngrave, theme.engrave);
      gl.uniform3fv(U.uBg, theme.bg); gl.uniform3fv(U.uLine, theme.line);
      gl.uniform3fv(U.uFill, theme.fill); gl.uniform3fv(U.uAccent, theme.accent);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return settled;
    }
    function frame(now) {
      raf = 0;
      if (!visible || document.hidden || lost) return;
      var settled = draw(now);
      if (motion || !settled) raf = requestAnimationFrame(frame);
    }
    function request() { if (!raf && visible && !document.hidden && !lost) raf = requestAnimationFrame(frame); }

    /* ---- events ------------------------------------------------------------ */
    function onPointer(e) {
      var r = canvas.getBoundingClientRect();
      if (r.width < 2) return;
      ptr.tu = (e.clientX - r.left) / r.width; ptr.tv = (e.clientY - r.top) / r.height;
      if (ptr.amp < 0.02 && !ptr.tamp) { ptr.u = ptr.tu; ptr.v = ptr.tv; }
      ptr.tamp = 1; ptr.at = performance.now();
      request();
    }
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    document.addEventListener("visibilitychange", function () {
      worker.postMessage({ type: document.hidden || !visible ? "pause" : "resume" });
      lastT = 0; request();
    });
    canvas.addEventListener("webglcontextlost", function (e) { e.preventDefault(); lost = true; }, false);
    canvas.addEventListener("webglcontextrestored", function () { location.reload(); }, false);

    /* ---- API --------------------------------------------------------------- */
    function toTheme(t) {
      var o = {};
      COL.forEach(function (k) { o[k] = hex(t[k]); });
      NUM.forEach(function (k) { o[k] = +t[k] || 0; });
      return o;
    }
    this.setText = function (lines, lay) {
      lay = lay || {};
      text = (Array.isArray(lines) ? lines : [lines]).map(function (s) { return String(s); }).filter(Boolean);
      layout = {
        cx: lay.cx == null ? 0.5 : lay.cx, cy: lay.cy == null ? 0.5 : lay.cy,
        fitW: lay.fitW || 0.86, fitH: lay.fitH || 0.56, maxCap: lay.maxCap || 0.42, gap: lay.gap == null ? 0.2 : lay.gap
      };
      sendMask();
    };
    this.perturb = function (amount) { worker.postMessage({ type: "perturb", amount: amount || 1 }); };
    this.setTheme = function (t, instant) {
      themeT = toTheme(t);
      if (!theme || instant) theme = toTheme(t);
      request();
    };
    this.setCamera = function (z, cy) { zoom = z || 1; if (cy != null) centerY = cy; request(); };
    this.setVisible = function (on) {
      on = !!on;
      if (on === visible) return;
      visible = on; lastT = 0;
      worker.postMessage({ type: on && !document.hidden ? "resume" : "pause" });
      request();
    };
    this.heightAt = function (u, v) {
      if (!lastBuf || !grid) return null;
      var x = Math.min(grid.gw - 1, Math.max(0, Math.floor(u * grid.gw)));
      var y = Math.min(grid.gh - 1, Math.max(0, Math.floor(v * grid.gh)));
      return lastBuf[(y * grid.gw + x) * 2];
    };
    this.resize = resize;
    this.stats = stats;
    this.grid = function () { return grid; };

    // Follow the canvas box (orientation changes, late layout, URL-bar resizes).
    var rzT = 0;
    function onBox() { clearTimeout(rzT); rzT = setTimeout(resize, 120); }
    if (window.ResizeObserver) new ResizeObserver(onBox).observe(canvas);
    else window.addEventListener("resize", onBox);
    resize();
  }

  window.GUNR_FIELD = {
    create: function (canvas, opts) {
      try { return new Field(canvas, opts); }
      catch (e) { if (window.console) console.warn("[field] unavailable:", e && e.message); return null; }
    }
  };
})();
