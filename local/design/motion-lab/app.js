/* NOVEN · 墨宇宙 — interaction study 01
   Vanilla ES2020. No dependencies, no network. */

(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;
  const pad2 = n => String(n).padStart(2, '0');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SERIF = '"Songti SC", "Noto Serif SC", "Source Han Serif SC", serif';
  const SANS = '"PingFang SC", "Hiragino Sans GB", "Noto Sans SC", sans-serif';
  const MONO = '"SF Mono", "JetBrains Mono", ui-monospace, monospace';

  const state = {
    scene: 0,
    sound: false,
    slow: false,
    started: false,
    busy: false,
  };

  const motion = ms => (reduced ? Math.min(ms, 120) : Math.round(ms * (state.slow ? 3.5 : 1)));
  const slowFactor = () => (state.slow ? 3.5 : 1);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  /* ── status / toast ─────────────────────────────────────── */

  let statusTimer = 0;
  function status(text) {
    const el = $('#status');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('on', Boolean(text));
    clearTimeout(statusTimer);
    if (text) statusTimer = setTimeout(() => el.classList.remove('on'), 3800);
  }

  let toastTimer = 0;
  function toast(text, actionLabel, action) {
    const el = $('#toast');
    if (!el) return;
    el.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = text;
    el.appendChild(span);
    if (actionLabel) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = actionLabel;
      btn.addEventListener('click', () => {
        el.classList.remove('on');
        if (action) action();
      });
      el.appendChild(btn);
    }
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 4600);
  }

  /* ── sound: everything is synthesised ───────────────────── */

  const Sound = (() => {
    let ctx = null;
    let master = null;
    let noise = null;
    let enabled = false;
    let lastHover = 0;

    function ensure() {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch (_) {
        return null;
      }
      master = ctx.createGain();
      master.gain.value = 0.22;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.ratio.value = 5;
      comp.attack.value = 0.004;
      comp.release.value = 0.18;
      master.connect(comp);
      comp.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 1.2);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      return ctx;
    }

    function resume() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    }

    function setEnabled(value) {
      enabled = value;
      if (value) {
        resume();
        chime(0.5);
      }
    }

    function tone(freq, dur = 0.5, type = 'sine', gain = 0.12, when = 0, slideTo = null) {
      if (!enabled) return;
      const c = ensure();
      if (!c) return;
      const t0 = c.currentTime + when;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.06);
    }

    function noiseHit(opts = {}) {
      if (!enabled) return;
      const c = ensure();
      if (!c) return;
      const {
        dur = 0.18,
        type = 'bandpass',
        freq = 1600,
        q = 1,
        gain = 0.1,
        when = 0,
        sweepTo = null,
        delay = 0,
      } = opts;
      const t0 = c.currentTime + when + delay;
      const src = c.createBufferSource();
      src.buffer = noise;
      const filter = c.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(Math.max(40, freq), t0);
      filter.Q.value = q;
      if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + Math.min(0.03, dur * 0.2));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start(t0);
      src.stop(t0 + dur + 0.03);
    }

    function chime(volume = 1) {
      [523.25, 783.99, 1046.5].forEach((f, i) => tone(f, 1.15, 'sine', 0.06 * volume, i * 0.055));
      tone(261.63, 1.4, 'sine', 0.03 * volume, 0);
    }

    function pluck(freq = 440) {
      tone(freq, 0.42, 'triangle', 0.09);
      tone(freq * 2.005, 0.25, 'sine', 0.025, 0.008);
      noiseHit({ dur: 0.04, freq: freq * 4, q: 1.6, gain: 0.02 });
    }

    function paper(volume = 0.08) {
      noiseHit({ dur: 0.16, freq: 1900, q: 0.7, gain: volume });
      noiseHit({ dur: 0.1, freq: 3200, q: 0.9, gain: volume * 0.5, delay: 0.02 });
    }

    function whoosh(volume = 0.08) {
      noiseHit({ dur: 0.62, type: 'lowpass', freq: 240, sweepTo: 2400, gain: volume });
    }

    function tick(volume = 0.035) {
      noiseHit({ dur: 0.028, type: 'highpass', freq: 3600, q: 0.8, gain: volume });
    }

    function thud() {
      tone(92, 0.38, 'sine', 0.16, 0, 48);
      noiseHit({ dur: 0.12, type: 'lowpass', freq: 260, gain: 0.09 });
    }

    function quill() {
      noiseHit({ dur: 0.05, freq: rand(2600, 3800), q: 1.4, gain: 0.018 });
    }

    function hoverTick() {
      const t = performance.now();
      if (t - lastHover < 90) return;
      lastHover = t;
      tick(0.02);
    }

    return {
      ensure,
      resume,
      setEnabled,
      tone,
      chime,
      pluck,
      paper,
      whoosh,
      tick,
      thud,
      quill,
      hoverTick,
      get enabled() { return enabled; },
    };
  })();

  /* ── dust: ambient field + bursts + convergence ─────────── */

  const Dust = (() => {
    let canvas = null;
    let ctx = null;
    let W = 0;
    let H = 0;
    let DPR = 1;
    let grains = [];
    let motes = [];
    let t = 0;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const sprites = {};

    function makeSprite(r, g, b) {
      const size = 64;
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const x = c.getContext('2d');
      const grd = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grd.addColorStop(0, `rgba(${r},${g},${b},.95)`);
      grd.addColorStop(0.18, `rgba(${r},${g},${b},.46)`);
      grd.addColorStop(0.55, `rgba(${r},${g},${b},.1)`);
      grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
      x.fillStyle = grd;
      x.fillRect(0, 0, size, size);
      return c;
    }

    function spriteFor(name) {
      return sprites[name] || sprites.mint;
    }

    function seed() {
      const count = clamp(Math.round((W * H) / 9000), reduced ? 50 : 90, 240);
      grains = Array.from({ length: count }, () => {
        const depth = rand(0.25, 1);
        return {
          x: rand(0, W),
          y: rand(0, H),
          z: depth,
          r: rand(0.35, 1.6),
          vx: rand(-0.1, 0.1) * depth,
          vy: rand(-0.07, 0.05) * depth,
          tw: rand(0, TAU),
          tws: rand(0.3, 1.1),
          a: rand(0.3, 0.9),
          sprite: Math.random() < 0.14 ? 'gold' : Math.random() < 0.12 ? 'ink' : 'mint',
        };
      });
    }

    function resize() {
      if (!canvas) return;
      W = window.innerWidth;
      H = window.innerHeight;
      DPR = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      for (const g of grains) {
        g.x = clamp(g.x, 0, W);
        g.y = clamp(g.y, 0, H);
      }
      pointer.x = pointer.tx = W / 2;
      pointer.y = pointer.ty = H / 2;
      if (grains.length === 0) seed();
    }

    function init() {
      canvas = $('#dust');
      if (!canvas) return;
      ctx = canvas.getContext('2d');
      sprites.mint = makeSprite(14, 159, 110);
      sprites.gold = makeSprite(181, 139, 58);
      sprites.ink = makeSprite(22, 24, 26);
      resize();
      seed();
      window.addEventListener('pointermove', e => {
        pointer.tx = e.clientX;
        pointer.ty = e.clientY;
      });
    }

    function burst(x, y, count = 24, color = 'mint') {
      if (reduced) count = Math.min(count, 8);
      for (let i = 0; i < count; i++) {
        const angle = rand(0, TAU);
        const speed = rand(0.5, 3.6);
        motes.push({
          kind: 'burst',
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed * 0.8,
          life: 1,
          ttl: rand(480, 1150),
          r: rand(0.8, 2.6),
          sprite: color,
        });
      }
    }

    function converge(points) {
      if (reduced || !points.length) return;
      const per = clamp(Math.ceil(170 / points.length), 8, 22);
      points.forEach(point => {
        for (let i = 0; i < per; i++) {
          const angle = rand(0, TAU);
          const dist = rand(220, 700);
          motes.push({
            kind: 'converge',
            sx: point.x + Math.cos(angle) * dist,
            sy: point.y + Math.sin(angle) * dist,
            tx: point.x + rand(-20, 20),
            ty: point.y + rand(-20, 20),
            t: 0,
            delay: rand(0, 420),
            dur: rand(720, 1450),
            life: 1,
            r: rand(0.8, 2.4),
            sprite: Math.random() < 0.18 ? 'gold' : 'mint',
          });
        }
      });
    }

    function tick(dt) {
      if (!ctx) return;
      const sdt = dt / slowFactor();
      t += sdt / 1000;
      pointer.x = lerp(pointer.x, pointer.tx, 0.055);
      pointer.y = lerp(pointer.y, pointer.ty, 0.055);
      const px = (pointer.x - W / 2) * 0.014;
      const py = (pointer.y - H / 2) * 0.01;

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';

      for (const g of grains) {
        g.x += g.vx * (sdt / 16.67);
        g.y += g.vy * (sdt / 16.67);
        if (g.x < -12) g.x = W + 12;
        if (g.x > W + 12) g.x = -12;
        if (g.y < -12) g.y = H + 12;
        if (g.y > H + 12) g.y = -12;
        const twinkle = 0.5 + 0.5 * Math.sin(t * g.tws + g.tw);
        const alpha = (0.05 + 0.16 * twinkle) * g.a;
        const size = g.r * (5 + 2 * twinkle);
        ctx.globalAlpha = alpha;
        ctx.drawImage(spriteFor(g.sprite), g.x + px * g.z - size / 2, g.y + py * g.z - size / 2, size, size);
      }

      for (const p of motes) {
        p.t += sdt;
        if (p.kind === 'burst') {
          p.vx *= 0.985;
          p.vy *= 0.985;
          p.x += p.vx * (sdt / 16.67);
          p.y += p.vy * (sdt / 16.67);
          p.life -= sdt / p.ttl;
        } else {
          const k = clamp((p.t - p.delay) / p.dur, 0, 1);
          const e = 1 - Math.pow(1 - k, 3);
          p.x = lerp(p.sx, p.tx, e);
          p.y = lerp(p.sy, p.ty, e);
          if (k >= 1) p.life -= sdt / 900;
        }
        if (p.life <= 0) continue;
        const size = p.r * (4 + 6 * p.life);
        ctx.globalAlpha = clamp(p.life, 0, 1) * 0.55;
        ctx.drawImage(spriteFor(p.sprite), p.x - size / 2, p.y - size / 2, size, size);
      }
      motes = motes.filter(p => p.life > 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    return { init, resize, tick, burst, converge };
  })();

  /* ── cursor ─────────────────────────────────────────────── */

  const Cursor = (() => {
    const dot = $('#c-dot');
    const ring = $('#c-ring');
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let tx = x;
    let ty = y;
    let rx = x;
    let ry = y;
    let shown = false;

    function move(e) {
      tx = e.clientX;
      ty = e.clientY;
      if (!shown) {
        shown = true;
        dot.classList.add('on');
        ring.classList.add('on');
      }
    }

    function hover(on) {
      ring.classList.toggle('hover', Boolean(on));
    }

    function press(on) {
      ring.classList.toggle('press', Boolean(on));
    }

    function tick() {
      x = lerp(x, tx, 0.42);
      y = lerp(y, ty, 0.42);
      rx = lerp(rx, tx, 0.15);
      ry = lerp(ry, ty, 0.15);
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
    }

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerover', e => {
      if (e.target.closest('button, .paper-card, .entry, .timeline-event, .mod-tile, [data-cursor]')) hover(true);
      else hover(false);
    });
    window.addEventListener('pointerdown', () => press(true));
    window.addEventListener('pointerup', () => press(false));
    window.addEventListener('pointercancel', () => press(false));

    return { tick, hover };
  })();

  /* ── chapters / stage ───────────────────────────────────── */

  const TITLES = ['冷启动', '卡内空间', '合集', '关系', '时间线', '地图', '协作'];
  const sceneEls = $$('.scene');
  const chapterHost = $('#chapters');
  const chapterBtns = TITLES.map((title, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', `第${i + 1}幕 ${title}`);
    b.innerHTML = `<i>${pad2(i + 1)}</i><span>${title}</span>`;
    b.addEventListener('click', () => go(i));
    chapterHost.appendChild(b);
    return b;
  });

  const hooks = [];
  let active = 0;

  function setActive(n) {
    sceneEls.forEach((el, i) => el.classList.toggle('is-active', i === n));
    chapterBtns.forEach((b, i) => {
      b.classList.toggle('is-active', i === n);
      if (i === n) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    $('#sceneClock').textContent = `${pad2(n + 1)} / 07`;
    $('#progress i').style.width = `${((n + 1) / 7) * 100}%`;
    $('#pagerName').textContent = TITLES[n];
    $('#prevScene').disabled = n === 0;
    $('#nextScene').disabled = n === 6;
  }

  function go(n, options = {}) {
    n = clamp(n, 0, TITLES.length - 1);
    if (n === active && !options.force) return;
    if (state.busy) return;

    const previous = active;
    const finish = () => {
      status('');
      if (hooks[previous] && hooks[previous].leave) hooks[previous].leave();
      active = n;
      state.scene = n;
      setActive(n);
      if (hooks[n] && hooks[n].enter) hooks[n].enter();
    };

    if (reduced || options.instant || !state.started) {
      finish();
      return;
    }

    state.busy = true;
    Sound.whoosh(0.075);
    const wipe = $('#wipe');
    wipe.style.setProperty('--wx', `${rand(32, 68)}%`);
    wipe.style.setProperty('--wy', `${rand(34, 66)}%`);
    wipe.classList.remove('run');
    void wipe.offsetWidth;
    wipe.classList.add('run');
    setTimeout(finish, motion(440));
    setTimeout(() => {
      wipe.classList.remove('run');
      state.busy = false;
    }, motion(1100));
  }

  $('#nextScene').addEventListener('click', () => go(active + 1));
  $('#prevScene').addEventListener('click', () => go(active - 1));

  window.addEventListener('keydown', e => {
    if (!state.started) return;
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(active + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(active - 1);
    } else if (/^[1-7]$/.test(e.key)) {
      e.preventDefault();
      go(Number(e.key) - 1);
    } else if (e.key === 'm' || e.key === 'M') {
      $('#soundBtn').click();
    } else if (e.key === 's' || e.key === 'S') {
      $('#slowBtn').click();
    }
  });

  function syncSound() {
    const b = $('#soundBtn');
    b.textContent = state.sound ? '声音 · 开' : '声音 · 关';
    b.setAttribute('aria-pressed', String(state.sound));
  }

  $('#soundBtn').addEventListener('click', () => {
    state.sound = !state.sound;
    Sound.setEnabled(state.sound);
    syncSound();
    status(state.sound ? '声音已开启 · 每一次状态变化都有反馈' : '声音已关闭');
  });

  $('#slowBtn').addEventListener('click', () => {
    state.slow = !state.slow;
    document.documentElement.style.setProperty('--motion-scale', state.slow ? '3.5' : '1');
    const b = $('#slowBtn');
    b.textContent = state.slow ? '慢放 · 开' : '慢放 ×3';
    b.setAttribute('aria-pressed', String(state.slow));
    status(state.slow ? '动效放慢 3.5 倍 · 逐帧看曲线' : '恢复正常速度');
  });

  function start(withSound) {
    if (state.started) return;
    state.started = true;
    if (withSound) {
      state.sound = true;
      Sound.setEnabled(true);
      syncSound();
    }
    const startEl = $('#start');
    startEl.classList.add('gone');
    setTimeout(() => startEl.remove(), 900);
    setActive(0);
    if (hooks[0] && hooks[0].enter) hooks[0].enter();
    if (hooks[5] && hooks[5].warm) hooks[5].warm();
    status('← → 切幕 · 1–7 直达 · M 静音 · S 慢放');
  }

  $('#startSound').addEventListener('click', () => start(true));
  $('#startSilent').addEventListener('click', () => start(false));

  /* ── 01 · cold start ────────────────────────────────────── */

  const Cosmos = (() => {
    const space = $('#cardSpace');
    const cards = $$('.paper-card', space);
    let selected = -1;

    space.addEventListener('pointermove', e => {
      const r = space.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      space.style.setProperty('--ry', `${x * 6.5}deg`);
      space.style.setProperty('--rx', `${-y * 4.5}deg`);
    });
    space.addEventListener('pointerleave', () => {
      space.style.setProperty('--ry', '0deg');
      space.style.setProperty('--rx', '0deg');
    });

    cards.forEach((card, i) => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--cry', `${x * 13}deg`);
        card.style.setProperty('--crx', `${-y * 11}deg`);
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--cry', '0deg');
        card.style.setProperty('--crx', '0deg');
      });
      card.addEventListener('pointerenter', () => Sound.hoverTick());
      card.addEventListener('click', e => {
        e.stopPropagation();
        if (selected !== i) {
          cards.forEach(c => c.classList.remove('is-selected'));
          card.classList.add('is-selected');
          selected = i;
          const r = card.getBoundingClientRect();
          Dust.burst(r.left + r.width / 2, r.top + r.height / 2, 28, 'mint');
          Sound.pluck(480 + i * 38);
          status(`已选中「${card.dataset.title}」— 再点一次展开`);
          return;
        }
        Sound.whoosh(0.12);
        status('展开卡内空间…');
        setTimeout(() => go(1), 150);
      });
    });

    function enter() {
      selected = -1;
      cards.forEach(c => c.classList.remove('is-selected'));
      status('悬停浮起 · 点击选中 · 再点展开');
      space.classList.remove('live');
      void space.offsetWidth;
      space.classList.add('live');
      requestAnimationFrame(() => {
        const points = cards.map(card => {
          const r = card.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        Dust.converge(points);
      });
      Sound.chime(0.45);
    }

    return { enter, leave() {}, tick() {} };
  })();

  /* ── 02 · inside the card ───────────────────────────────── */

  const Modules = (() => {
    const navs = $$('#moduleNav button');
    const planes = $$('.module-plane');
    const deck = $('#moduleDeck');
    let current = 0;

    function apply() {
      planes.forEach((plane, i) => {
        const d = i - current;
        const depth = Math.min(Math.abs(d), 4);
        plane.style.transform =
          `translateY(-50%) translate3d(${d * 44}px, ${d * -28}px, ${-depth * 148}px) rotateY(-6deg)`;
        plane.style.opacity = i === current ? '1' : String(Math.max(0.08, 0.46 - depth * 0.09));
        plane.style.zIndex = String(20 - depth);
        plane.style.pointerEvents = Math.abs(d) <= 2 ? 'auto' : 'none';
        plane.classList.toggle('is-active', i === current);
      });
      navs.forEach((nav, i) => nav.classList.toggle('is-active', i === current));
    }

    function select(i) {
      if (i === current) return;
      current = i;
      apply();
      Sound.tick(0.05);
      Sound.whoosh(0.035);
      const r = navs[i].getBoundingClientRect();
      Dust.burst(r.right + 10, r.top + r.height / 2, 12, i % 3 === 0 ? 'gold' : 'mint');
    }

    navs.forEach((nav, i) => nav.addEventListener('click', () => select(i)));
    planes.forEach((plane, i) => {
      plane.addEventListener('click', () => {
        if (i !== current) select(i);
      });
    });

    deck.addEventListener('pointermove', e => {
      const r = deck.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      deck.style.setProperty('--ry', `${x * 4}deg`);
      deck.style.setProperty('--rx', `${-y * 3}deg`);
    });
    deck.addEventListener('pointerleave', () => {
      deck.style.setProperty('--ry', '0deg');
      deck.style.setProperty('--rx', '0deg');
    });

    function enter() {
      current = 0;
      planes.forEach(plane => {
        plane.style.transition = 'none';
        plane.style.opacity = '0';
        plane.style.transform = 'translateY(-50%) translate3d(0, 0, -460px) rotateY(-6deg)';
      });
      void deck.offsetWidth;
      planes.forEach(plane => {
        plane.style.transition = '';
      });
      requestAnimationFrame(apply);
      Sound.chime(0.35);
    }

    return { enter, leave() {}, tick() {} };
  })();

  /* ── 03 · collection ────────────────────────────────────── */

  const CollectionScene = (() => {
    const host = $('#collection');
    const viewHost = $('#viewSwitch');
    const detail = $('#entryDetail');
    const people = [
      { name: '沈青梧', role: '主角 · 记录者', glyph: '梧', hue: 164, line: '我把每一场雨都记下来，免得它们白下。', tags: ['青梧记', '旧案'] },
      { name: '顾长风', role: '对手 · 北境来客', glyph: '顾', hue: 38, line: '北境的风不撒谎，撒谎的是从南边回来的人。', tags: ['旧盟', '北境'] },
      { name: '岳无咎', role: '听雨楼主', glyph: '岳', hue: 198, line: '消息和伞一样，雨天最值钱。', tags: ['听雨楼', '授业'] },
      { name: '阿凛', role: '哨塔信使', glyph: '凛', hue: 210, line: '我跑过七座塔，只有一座还亮着灯。', tags: ['北境', '欠命'] },
      { name: '沈砚', role: '失踪的兄长', glyph: '砚', hue: 346, line: '他没有死，只是被写进了别人的故事里。', tags: ['旧案', '缺页'] },
      { name: '赵无咎', role: '旧案主审', glyph: '赵', hue: 4, line: '卷宗不会说谎，但会少三页。', tags: ['旧案', '证词'] },
      { name: '秋娘', role: '苍梧船娘', glyph: '秋', hue: 30, line: '渡口只渡活人，也渡不该活的人。', tags: ['苍梧', '渡口'] },
      { name: '薛停云', role: '顾氏幕僚', glyph: '薛', hue: 268, line: '我替顾家写状纸，也替顾家烧状纸。', tags: ['顾氏', '幕僚'] },
      { name: '莫听', role: '听雨楼暗桩', glyph: '莫', hue: 152, line: '听见了也当没听见，才活得久。', tags: ['听雨楼', '暗桩'] },
    ];
    const views = [
      ['gallery', '画廊'],
      ['list', '列表'],
      ['quote', '语录墙'],
      ['sheet', '技能表'],
      ['multi', '多形态'],
    ];
    let entries = [];
    let dragging = null;
    let dragMoved = false;
    let flipLock = false;

    views.forEach(([key, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.dataset.view = key;
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => setView(key));
      viewHost.appendChild(b);
    });

    function build() {
      host.innerHTML = '';
      const head = document.createElement('div');
      head.className = 'sheet-head';
      head.innerHTML = '<span></span><span>名 / 身份</span><span>一句</span><span>关系</span>';
      host.appendChild(head);
      people.forEach((person, i) => {
        const el = document.createElement('article');
        el.className = 'entry';
        el.dataset.id = String(i);
        el.style.setProperty('--h', String(person.hue));
        el.tabIndex = 0;
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', `${person.name}，${person.role}`);
        el.innerHTML =
          `<span class="entry-art">${person.glyph}</span>` +
          `<div class="entry-top"><strong>${person.name}</strong><span class="entry-role">${person.role}</span></div>` +
          `<p class="entry-line">${person.line}</p>` +
          `<div class="entry-tags">${person.tags.map(t => `<span>${t}</span>`).join('')}</div>`;
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            focusEntry(el);
          }
        });
        el.addEventListener('click', () => {
          if (dragMoved) {
            dragMoved = false;
            return;
          }
          focusEntry(el);
        });
        host.appendChild(el);
      });
      entries = $$('.entry', host);
    }

    function syncView() {
      $$('button', viewHost).forEach(b => {
        const on = b.dataset.view === host.dataset.view;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', String(on));
      });
    }

    function setView(view) {
      if (host.dataset.view === view || flipLock) return;
      const first = new Map(entries.map(el => [el, el.getBoundingClientRect()]));
      host.dataset.view = view;
      syncView();
      const last = new Map(entries.map(el => [el, el.getBoundingClientRect()]));
      entries.forEach(el => {
        const a = first.get(el);
        const b = last.get(el);
        if (!a || !b) return;
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)`, opacity: 0.45 },
            { transform: 'translate(0, 0)', opacity: 1 },
          ],
          { duration: motion(560), easing: 'cubic-bezier(.2,.9,.25,1)' },
        );
      });
      flipLock = true;
      setTimeout(() => {
        flipLock = false;
      }, motion(580));
      Sound.whoosh(0.04);
      Sound.tick(0.03);
      status(`形态 · ${views.find(v => v[0] === view)[1]} — 条目没有换，只是重新摊开`);
    }

    function closeDetail() {
      detail.classList.remove('on');
      entries.forEach(el => el.classList.remove('is-focused'));
    }

    function focusEntry(el) {
      if (el.classList.contains('is-focused')) {
        closeDetail();
        return;
      }
      entries.forEach(e => e.classList.toggle('is-focused', e === el));
      const person = people[Number(el.dataset.id)];
      detail.innerHTML =
        `<button class="detail-close" type="button" aria-label="关闭">×</button>` +
        `<p class="panel-kicker">ENTRY / ${pad2(Number(el.dataset.id) + 1)}</p>` +
        `<h4>${person.name}</h4>` +
        `<p>${person.role}</p>` +
        `<p>${person.line}</p>` +
        `<div class="detail-row"><span>关系</span><b>${person.tags[0]} · ${person.tags[1]}</b></div>` +
        `<div class="detail-row"><span>在卡内</span><b>人物条目 · 可独立打开</b></div>` +
        `<button class="btn-primary" type="button" id="detailOpen" style="margin-top:12px;width:100%">在关系图里打开</button>`;
      detail.classList.add('on');
      detail.querySelector('.detail-close').addEventListener('click', closeDetail);
      detail.querySelector('#detailOpen').addEventListener('click', () => {
        const name = person.name;
        go(3);
        setTimeout(() => {
          if (hooks[3] && hooks[3].focusName) hooks[3].focusName(name);
        }, reduced ? 60 : 700);
      });
      const r = el.getBoundingClientRect();
      Dust.burst(r.left + r.width / 2, r.top + r.height / 2, 18, 'mint');
      Sound.pluck(540 + Number(el.dataset.id) * 24);
    }

    host.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const el = e.target.closest('.entry');
      if (!el) return;
      const r = el.getBoundingClientRect();
      dragging = {
        el,
        startX: e.clientX,
        startY: e.clientY,
        dx: 0,
        dy: 0,
        active: false,
        target: null,
        id: e.pointerId,
      };
      dragMoved = false;
      el.setPointerCapture(e.pointerId);
    });

    host.addEventListener('pointermove', e => {
      if (!dragging) return;
      dragging.dx = e.clientX - dragging.startX;
      dragging.dy = e.clientY - dragging.startY;
      if (!dragging.active && Math.hypot(dragging.dx, dragging.dy) > 8) {
        dragging.active = true;
        dragging.el.classList.add('is-dragging');
        document.body.classList.add('dragging');
        Sound.paper(0.045);
      }
      if (!dragging.active) return;
      dragging.el.style.transform = `translate(${dragging.dx}px, ${dragging.dy}px) scale(1.03)`;
      entries.forEach(en => en.classList.remove('drop-target'));
      let best = null;
      let bestDistance = Infinity;
      for (const en of entries) {
        if (en === dragging.el) continue;
        const r = en.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const d = (e.clientX - cx) ** 2 + (e.clientY - cy) ** 2;
        if (d < bestDistance) {
          bestDistance = d;
          best = en;
        }
      }
      dragging.target = best;
      if (best) best.classList.add('drop-target');
    });

    function endDrag(e) {
      if (!dragging) return;
      const drag = dragging;
      dragging = null;
      document.body.classList.remove('dragging');
      entries.forEach(en => en.classList.remove('drop-target'));
      if (!drag.active) return;

      dragMoved = true;
      setTimeout(() => {
        dragMoved = false;
      }, 0);

      drag.el.classList.remove('is-dragging');
      const first = new Map(entries.map(el => [el, el.getBoundingClientRect()]));

      if (drag.target && drag.target !== drag.el) {
        const r = drag.target.getBoundingClientRect();
        const before = e.clientX < r.left + r.width / 2 || e.clientY < r.top + r.height / 2;
        host.insertBefore(drag.el, before ? drag.target : drag.target.nextSibling);
      }
      drag.el.style.transform = '';
      entries = $$('.entry', host);
      const last = new Map(entries.map(el => [el, el.getBoundingClientRect()]));
      entries.forEach(el => {
        const a = first.get(el);
        const b = last.get(el);
        if (!a || !b) return;
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: 'translate(0, 0)' },
          ],
          { duration: motion(440), easing: 'cubic-bezier(.2,.9,.25,1)' },
        );
      });
      Sound.paper(0.09);
      Sound.tick(0.04);
      status('已重新排序 · 顺序也是叙事');
    }

    host.addEventListener('pointerup', endDrag);
    host.addEventListener('pointercancel', endDrag);

    function enter() {
      closeDetail();
      syncView();
      entries.forEach((el, i) => {
        el.animate(
          [
            { opacity: 0, transform: 'translateY(14px)' },
            { opacity: 1, transform: 'translateY(0)' },
          ],
          { duration: motion(460), delay: motion(i * 32), easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'both' },
        );
      });
      Sound.chime(0.3);
    }

    build();
    return { enter, leave() {}, tick() {} };
  })();

  /* ── 04 · relation graph ────────────────────────────────── */

  const GraphScene = (() => {
    const canvas = $('#graphCanvas');
    const ctx = canvas.getContext('2d');
    const focusEl = $('#graphFocus');
    const hintEl = $('#graphHint');
    const listEl = $('#graphList');
    const legendEl = $('#graphLegend');
    const GROUPS = {
      shen: { name: '沈家', rgb: [14, 159, 110] },
      gu: { name: '顾氏', rgb: [181, 139, 58] },
      bei: { name: '北境', rgb: [79, 134, 168] },
      case: { name: '旧案', rgb: [194, 96, 112] },
    };
    const NODE_DATA = [
      { id: 'shen', name: '沈青梧', role: '记录者', group: 'shen', r: 25 },
      { id: 'gu', name: '顾长风', role: '北境来客', group: 'gu', r: 23 },
      { id: 'yue', name: '岳无咎', role: '听雨楼主', group: 'shen', r: 21 },
      { id: 'lin', name: '阿凛', role: '哨塔信使', group: 'bei', r: 19 },
      { id: 'yan', name: '沈砚', role: '失踪的兄长', group: 'case', r: 21 },
      { id: 'zhao', name: '赵无咎', role: '旧案主审', group: 'case', r: 19 },
      { id: 'qiu', name: '秋娘', role: '苍梧船娘', group: 'bei', r: 18 },
      { id: 'xue', name: '薛停云', role: '顾氏幕僚', group: 'gu', r: 20 },
      { id: 'mo', name: '莫听', role: '听雨楼暗桩', group: 'shen', r: 18 },
      { id: 'lu', name: '陆照', role: '北境守将', group: 'bei', r: 20 },
      { id: 'wen', name: '温酒', role: '旧案证人', group: 'case', r: 17 },
      { id: 'shi', name: '石青', role: '青梧记抄工', group: 'shen', r: 17 },
    ];
    const EDGE_DATA = [
      ['shen', 'gu', '旧盟'], ['shen', 'yue', '授业'], ['shen', 'lin', '欠命'], ['shen', 'yan', '兄妹'],
      ['shen', 'shi', '主仆'], ['gu', 'xue', '幕僚'], ['gu', 'yan', '旧识'], ['gu', 'zhao', '买通'],
      ['yue', 'mo', '暗桩'], ['lin', 'lu', '守塔'], ['lin', 'qiu', '渡河'], ['yan', 'zhao', '旧案'],
      ['zhao', 'wen', '证词'], ['wen', 'yan', '目击'], ['qiu', 'mo', '传信'], ['lu', 'gu', '对峙'],
      ['shi', 'shen', '抄录'], ['yue', 'gu', '旧账'],
    ];
    const nodes = NODE_DATA.map((n, i) => {
      const angle = (i / NODE_DATA.length) * TAU;
      return {
        ...n,
        x: Math.cos(angle) * 235 + Math.cos(angle * 3) * 28,
        y: Math.sin(angle) * 178 + Math.sin(angle * 2) * 24,
        vx: 0,
        vy: 0,
      };
    });
    const byId = new Map(nodes.map(n => [n.id, n]));
    const edges = EDGE_DATA.map(([a, b, label], i) => ({
      a: byId.get(a),
      b: byId.get(b),
      label,
      bend: rand(-0.2, 0.2),
      phase: i * 0.137,
    }));
    let W = 0;
    let H = 0;
    let DPR = 1;
    let hover = null;
    let selected = null;
    let dragged = null;
    let pan = null;
    let moved = false;
    const camera = { x: 0, y: 0, scale: 1 };

    const legend = Object.entries(GROUPS)
      .map(([key, group]) => `<span><i class="dot ${key}"></i>${group.name}</span>`)
      .join('');
    legendEl.innerHTML = legend;

    function resize() {
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      DPR = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
    }

    function toWorld(px, py) {
      return {
        x: (px - W / 2) / camera.scale + camera.x,
        y: (py - H / 2) / camera.scale + camera.y,
      };
    }

    function toScreen(x, y) {
      return {
        x: (x - camera.x) * camera.scale + W / 2,
        y: (y - camera.y) * camera.scale + H / 2,
      };
    }

    function localPoint(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function pick(px, py) {
      const w = toWorld(px, py);
      for (const n of nodes) {
        const dx = n.x - w.x;
        const dy = n.y - w.y;
        const radius = n.r + 10 / camera.scale;
        if (dx * dx + dy * dy < radius * radius) return n;
      }
      return null;
    }

    function stepPhysics(dt) {
      const k = clamp(dt, 0, 32) / 16.67;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 1) d2 = 1;
          const d = Math.sqrt(d2);
          const force = Math.min(2.4, 5400 / d2);
          const fx = (dx / d) * force;
          const fy = (dy / d) * force;
          a.vx -= fx * k;
          a.vy -= fy * k;
          b.vx += fx * k;
          b.vy += fy * k;
        }
      }
      for (const e of edges) {
        const dx = e.b.x - e.a.x;
        const dy = e.b.y - e.a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (d - 158) * 0.0042;
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;
        e.a.vx += fx * k;
        e.a.vy += fy * k;
        e.b.vx -= fx * k;
        e.b.vy -= fy * k;
      }
      for (const n of nodes) {
        n.vx += -n.x * 0.0016 * k;
        n.vy += -n.y * 0.0016 * k;
        n.vx *= 0.9;
        n.vy *= 0.9;
        n.vx = clamp(n.vx, -5, 5);
        n.vy = clamp(n.vy, -5, 5);
        n.x += n.vx * k;
        n.y += n.vy * k;
      }
    }

    function draw(now) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(camera.scale, camera.scale);
      ctx.translate(-camera.x, -camera.y);

      const neighbour = new Set();
      if (selected) {
        neighbour.add(selected.id);
        for (const e of edges) {
          if (e.a === selected) neighbour.add(e.b.id);
          if (e.b === selected) neighbour.add(e.a.id);
        }
      }

      for (const e of edges) {
        const active = selected && (e.a === selected || e.b === selected);
        const dim = selected && !active;
        const dx = e.b.x - e.a.x;
        const dy = e.b.y - e.a.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const cx = (e.a.x + e.b.x) / 2 - (dy / len) * len * e.bend;
        const cy = (e.a.y + e.b.y) / 2 + (dx / len) * len * e.bend;

        ctx.beginPath();
        ctx.moveTo(e.a.x, e.a.y);
        ctx.quadraticCurveTo(cx, cy, e.b.x, e.b.y);
        ctx.lineWidth = active ? 1.7 : 0.8;
        ctx.strokeStyle = active
          ? 'rgba(14,159,110,.62)'
          : `rgba(22,24,26,${dim ? 0.05 : 0.145})`;
        ctx.stroke();

        if (!dim) {
          for (let p = 0; p < 2; p++) {
            const t = (now * 0.00018 + e.phase + p * 0.5) % 1;
            const it = 1 - t;
            const x = it * it * e.a.x + 2 * it * t * cx + t * t * e.b.x;
            const y = it * it * e.a.y + 2 * it * t * cy + t * t * e.b.y;
            ctx.beginPath();
            ctx.arc(x, y, active ? 1.9 : 1.1, 0, TAU);
            ctx.fillStyle = active ? 'rgba(181,139,58,.85)' : 'rgba(14,159,110,.35)';
            ctx.fill();
          }
        }

        if (active) {
          const mx = 0.25 * e.a.x + 0.5 * cx + 0.25 * e.b.x;
          const my = 0.25 * e.a.y + 0.5 * cy + 0.25 * e.b.y;
          ctx.font = `9px ${MONO}`;
          ctx.fillStyle = 'rgba(181,139,58,.85)';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(e.label, mx, my - 5);
        }
      }

      for (const n of nodes) {
        const color = GROUPS[n.group].rgb;
        const isHover = n === hover;
        const isSelected = n === selected;
        const isNeighbour = neighbour.has(n.id);
        const dim = selected && !isNeighbour && !isSelected;
        const alpha = dim ? 0.22 : 1;
        const radius = n.r * (isHover || isSelected ? 1.14 : 1);

        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, radius * 3.1);
        glow.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${0.18 * alpha})`);
        glow.addColorStop(0.5, `rgba(${color[0]},${color[1]},${color[2]},${0.05 * alpha})`);
        glow.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius * 3.1, 0, TAU);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, radius, 0, TAU);
        ctx.fillStyle = `rgba(255,255,255,${0.96 * alpha})`;
        ctx.fill();
        ctx.lineWidth = isSelected ? 2 : 1.2;
        ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${(isSelected || isHover ? 0.96 : 0.55) * alpha})`;
        ctx.stroke();

        ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${0.94 * alpha})`;
        ctx.font = `600 ${Math.round(radius * 0.78)}px ${SERIF}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.name[0], n.x, n.y + 1);

        if (camera.scale > 0.72 || isHover || isSelected) {
          ctx.font = `11px ${SANS}`;
          ctx.fillStyle = `rgba(22,24,26,${(isHover || isSelected ? 0.92 : 0.55) * alpha})`;
          ctx.fillText(n.name, n.x, n.y + radius + 15);
        }
      }

      ctx.restore();
    }

    function freqOf(n) {
      return 300 + nodes.indexOf(n) * 42;
    }

    function focusNode(n, silent = false) {
      selected = n;
      hover = n;
      updatePanel();
      if (!silent) {
        Sound.pluck(freqOf(n));
        const p = toScreen(n.x, n.y);
        Dust.burst(canvas.offsetLeft + p.x, canvas.offsetTop + p.y, 18, 'mint');
      }
    }

    function updatePanel() {
      if (!selected) {
        focusEl.textContent = '未选择';
        hintEl.textContent = '悬停或拖动一个节点；滚轮缩放。';
        listEl.innerHTML = '';
        return;
      }
      focusEl.textContent = selected.name;
      hintEl.textContent = `${selected.role} · ${GROUPS[selected.group].name}`;
      const rels = edges
        .filter(e => e.a === selected || e.b === selected)
        .map(e => ({
          other: e.a === selected ? e.b : e.a,
          label: e.label,
        }));
      listEl.innerHTML = rels
        .map(
          ({ other, label }) =>
            `<li><button type="button" data-node="${other.id}"><span>${other.name}</span><small>${label}</small></button></li>`,
        )
        .join('');
      $$('button', listEl).forEach(btn => {
        btn.addEventListener('click', () => {
          const n = byId.get(btn.dataset.node);
          if (n) focusNode(n);
        });
      });
    }

    function focusName(name) {
      const n = nodes.find(node => node.name === name);
      if (!n) return;
      selected = n;
      hover = n;
      camera.x = n.x;
      camera.y = n.y;
      camera.scale = 1.16;
      updatePanel();
      Sound.pluck(freqOf(n));
    }

    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const p = localPoint(e);
      const n = pick(p.x, p.y);
      moved = false;
      canvas.setPointerCapture(e.pointerId);
      if (n) {
        dragged = n;
        focusNode(n);
        n.vx = 0;
        n.vy = 0;
        canvas.classList.add('grabbing');
      } else {
        pan = { x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y };
      }
    });

    canvas.addEventListener('pointermove', e => {
      const p = localPoint(e);
      if (dragged) {
        const w = toWorld(p.x, p.y);
        dragged.x = w.x;
        dragged.y = w.y;
        dragged.vx = 0;
        dragged.vy = 0;
        moved = true;
        return;
      }
      if (pan) {
        const dx = e.clientX - pan.x;
        const dy = e.clientY - pan.y;
        if (Math.hypot(dx, dy) > 3) moved = true;
        camera.x = clamp(pan.cx - dx / camera.scale, -520, 520);
        camera.y = clamp(pan.cy - dy / camera.scale, -420, 420);
        return;
      }
      const n = pick(p.x, p.y);
      if (n !== hover) {
        hover = n;
        Cursor.hover(Boolean(n));
        if (n) Sound.hoverTick();
      }
    });

    function endPointer() {
      canvas.classList.remove('grabbing');
      if (dragged) {
        dragged = null;
      } else if (pan) {
        const wasPan = moved;
        pan = null;
        if (!wasPan) {
          selected = null;
          hover = null;
          updatePanel();
        }
      }
      moved = false;
    }

    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener(
      'wheel',
      e => {
        e.preventDefault();
        const p = localPoint(e);
        const before = toWorld(p.x, p.y);
        camera.scale = clamp(camera.scale * Math.exp(-e.deltaY * 0.0014), 0.55, 2.2);
        const after = toWorld(p.x, p.y);
        camera.x += before.x - after.x;
        camera.y += before.y - after.y;
      },
      { passive: false },
    );

    for (let i = 0; i < 90; i++) stepPhysics(16.67);

    function enter() {
      if (!W || !H) resize();
      Sound.chime(0.32);
    }

    return {
      enter,
      leave() {},
      tick(dt, now) {
        if (!W || !H) resize();
        stepPhysics(dt / slowFactor());
        draw(now);
      },
      resize,
      focusName,
      debugNodes() {
        return nodes.map(n => {
          const p = toScreen(n.x, n.y);
          return { name: n.name, x: p.x, y: p.y, r: n.r * camera.scale };
        });
      },
    };
  })();

  /* ── 05 · timeline ──────────────────────────────────────── */

  const TimelineScene = (() => {
    const viewport = $('#timelineViewport');
    const world = $('#timelineWorld');
    const detail = $('#timelineDetail');
    const flow = $('#timeFlow');
    const flowCtx = flow.getContext('2d');
    const ERAS = [
      { name: 'ERA I · 灰烬', cn: '旧历', from: 0.02, to: 0.33, bg: 'linear-gradient(180deg, rgba(194,96,112,.07), rgba(194,96,112,.01))' },
      { name: 'ERA II · 听雨', cn: '青梧', from: 0.33, to: 0.68, bg: 'linear-gradient(180deg, rgba(52,211,153,.1), rgba(52,211,153,.02))' },
      { name: 'ERA III · 长夜', cn: '北境', from: 0.68, to: 0.98, bg: 'linear-gradient(180deg, rgba(79,134,168,.08), rgba(79,134,168,.015))' },
    ];
    const EVENTS = [
      { x: 0.05, year: '旧历 29', title: '青梧出生', body: '苍梧巷的雨下了三天。接生婆说，这孩子的第一声哭像翻书。', z: -70 },
      { x: 0.14, year: '旧历 33', title: '第一次握笔', body: '她偷了兄长的秃笔，在墙上写了一个“雨”字，写反了。', z: 10 },
      { x: 0.24, year: '旧历 37', title: '苍梧大火', body: '旧案卷从此缺了三页。沈砚在火里失踪，只留下一枚铜扣。', z: -40 },
      { x: 0.33, year: '旧历 41', title: '进听雨楼', body: '她拿抄书换饭。楼主看了她一眼，把一支旧笔推过来。', z: 50 },
      { x: 0.44, year: '青梧 01', title: '开始写《青梧记》', body: '第一句是：雨是唯一不撒谎的证人。此后四十二章。', z: -20 },
      { x: 0.56, year: '青梧 02', title: '北境来信', body: '阿凛带来一枚冻硬的铜扣，和一句没头没尾的“他还活着”。', z: 30 },
      { x: 0.66, year: '青梧 02', title: '雪夜过河', body: '秋娘的船在冰面上裂了一道缝。两个人都没说话。', z: -55 },
      { x: 0.78, year: '青梧 03', title: '雨夜对峙', body: '顾长风承认自己撒了十一年的谎。雨声太大，她只听清一半。', z: 60 },
      { x: 0.9, year: '青梧 03', title: '旧案重开', body: '第三页被找了回来。纸是新的，字是旧的。', z: -30 },
    ];
    let WORLD = 0;
    let viewW = 0;
    let viewH = 0;
    let offset = 0;
    let offsetTarget = null;
    let velocity = 0;
    let drag = null;
    let selected = -1;
    let built = false;
    let dragMoved = false;

    let FW = 0;
    let FH = 0;
    let FDPR = 1;
    let flowParticles = [];

    function eventX(ev) {
      return 140 + ev.x * (WORLD - 280);
    }

    function targetFor(index) {
      return clamp(viewW / 2 - eventX(EVENTS[index]), -(WORLD - viewW), 0);
    }

    function applyOffset() {
      world.style.transform = `translate3d(${offset}px, 0, 0)`;
    }

    function resizeFlow() {
      FW = viewport.clientWidth || window.innerWidth;
      FH = viewport.clientHeight || window.innerHeight;
      FDPR = Math.min(2, window.devicePixelRatio || 1);
      flow.width = Math.round(FW * FDPR);
      flow.height = Math.round(FH * FDPR);
      flow.style.width = FW + 'px';
      flow.style.height = FH + 'px';
      flowCtx.setTransform(FDPR, 0, 0, FDPR, 0, 0);
      flowParticles = Array.from({ length: 86 }, () => ({
        x: rand(0, FW),
        y: rand(FH * 0.42, FH * 0.92),
        len: rand(8, 46),
        speed: rand(12, 46),
        a: rand(0.04, 0.24),
        gold: Math.random() < 0.28,
      }));
    }

    function build() {
      viewW = viewport.clientWidth;
      viewH = viewport.clientHeight;
      WORLD = Math.max(3000, Math.round(viewW * 2.8));
      world.style.width = WORLD + 'px';
      world.innerHTML = '';

      ERAS.forEach(era => {
        const el = document.createElement('div');
        el.className = 'era';
        el.style.left = `${era.from * WORLD}px`;
        el.style.width = `${(era.to - era.from) * WORLD}px`;
        el.style.setProperty('--era-bg', era.bg);
        el.innerHTML = `<b>${era.name}</b><i>${era.cn}</i>`;
        world.appendChild(el);
      });

      const river = document.createElement('div');
      river.className = 'timeline-river';
      world.appendChild(river);

      EVENTS.forEach((ev, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'timeline-event';
        b.dataset.index = String(i);
        b.style.left = `${eventX(ev)}px`;
        b.style.setProperty('--z', `${ev.z}px`);
        b.style.setProperty('--stem', `${44 + Math.abs(ev.z) * 0.16}px`);
        b.innerHTML =
          `<time>${ev.year}</time><b>${ev.title}</b><small>${ev.body.slice(0, 20)}…</small><span class="stem"></span>`;
        b.addEventListener('click', () => {
          if (dragMoved) {
            dragMoved = false;
            return;
          }
          selectEvent(i, true);
        });
        world.appendChild(b);
      });

      built = true;
      resizeFlow();
    }

    function selectEvent(index, center, silent = false) {
      selected = index;
      $$('.timeline-event', world).forEach((el, i) => el.classList.toggle('is-active', i === index));
      const ev = EVENTS[index];
      detail.innerHTML =
        `<button class="close" type="button" aria-label="关闭">×</button>` +
        `<p class="panel-kicker">EVENT / ${pad2(index + 1)}</p>` +
        `<time>${ev.year}</time><h4>${ev.title}</h4><p>${ev.body}</p>`;
      detail.classList.add('on');
      detail.querySelector('.close').addEventListener('click', () => {
        detail.classList.remove('on');
        selected = -1;
        $$('.timeline-event', world).forEach(el => el.classList.remove('is-active'));
      });
      if (center) {
        velocity = 0;
        offsetTarget = targetFor(index);
        Sound.whoosh(0.05);
      }
      if (!silent) {
        Sound.pluck(410 + index * 26);
        Dust.burst(window.innerWidth / 2, window.innerHeight * 0.56, 14, 'gold');
      }
    }

    function localMouse(e) {
      return { x: e.clientX, y: e.clientY };
    }

    viewport.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      drag = { startX: e.clientX, lastX: e.clientX, startOffset: offset, moved: false };
      dragMoved = false;
      velocity = 0;
      offsetTarget = null;
      viewport.classList.add('grabbing');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    });

    function onMove(e) {
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      if (Math.abs(dx) > 6) {
        drag.moved = true;
        dragMoved = true;
      }
      offset = clamp(drag.startOffset + dx, -(WORLD - viewW), 0);
      velocity = (e.clientX - drag.lastX) * 0.9;
      drag.lastX = e.clientX;
      applyOffset();
    }

    function onUp() {
      viewport.classList.remove('grabbing');
      window.removeEventListener('pointermove', onMove);
      if (drag && !drag.moved) dragMoved = false;
      drag = null;
    }

    viewport.addEventListener(
      'wheel',
      e => {
        e.preventDefault();
        offset = clamp(offset - (e.deltaY + e.deltaX) * 1.05, -(WORLD - viewW), 0);
        offsetTarget = null;
        velocity = 0;
        applyOffset();
      },
      { passive: false },
    );

    function drawFlow(dt) {
      if (!flowCtx) return;
      const sdt = dt / slowFactor();
      flowCtx.clearRect(0, 0, FW, FH);
      const boost = Math.abs(velocity) * 5;
      for (const p of flowParticles) {
        p.x -= (p.speed + boost) * (sdt / 16.67);
        if (p.x + p.len < -20) {
          p.x = FW + rand(0, 80);
          p.y = rand(FH * 0.42, FH * 0.92);
        }
        flowCtx.strokeStyle = p.gold
          ? `rgba(181,139,58,${p.a})`
          : `rgba(14,159,110,${p.a})`;
        flowCtx.lineWidth = 1;
        flowCtx.beginPath();
        flowCtx.moveTo(p.x, p.y);
        flowCtx.lineTo(p.x + p.len, p.y);
        flowCtx.stroke();
      }
    }

    function enter() {
      if (!built) build();
      if (viewW !== viewport.clientWidth) {
        build();
      }
      if (selected < 0) {
        offset = targetFor(2);
        applyOffset();
        selectEvent(2, false, true);
      }
      Sound.chime(0.3);
    }

    function resize() {
      if (!built) return;
      const keep = selected;
      build();
      if (keep >= 0) {
        offset = targetFor(keep);
        applyOffset();
        selectEvent(keep, false, true);
      }
    }

    return {
      enter,
      leave() {},
      resize,
      tick(dt) {
        if (!built) return;
        if (!drag) {
          if (offsetTarget !== null) {
            offset = lerp(offset, offsetTarget, 0.14);
            if (Math.abs(offset - offsetTarget) < 0.4) {
              offset = offsetTarget;
              offsetTarget = null;
            }
            applyOffset();
          } else if (Math.abs(velocity) > 0.02) {
            offset = clamp(offset + velocity, -(WORLD - viewW), 0);
            velocity *= 0.92;
            applyOffset();
            if (Math.abs(velocity) < 0.02) velocity = 0;
          }
        }
        drawFlow(dt);
      },
    };
  })();

  /* ── 06 · map ───────────────────────────────────────────── */

  const MapScene = (() => {
    const canvas = $('#mapCanvas');
    const ctx = canvas.getContext('2d');
    const readout = $('#mapReadout');
    const TW = 1000;
    const TH = 680;
    let MW = 0;
    let MH = 0;
    let DPR = 1;
    let fitScale = 1;
    let terrain = null;
    let built = false;
    let drag = null;
    let hover = null;
    let selected = null;
    const cam = { x: 0, y: 0, scale: 1 };
    const markers = [
      { x: -190, y: 40, name: '苍梧城', kind: 'city', phase: 0.1 },
      { x: 210, y: -150, name: '北境哨塔', kind: 'pass', phase: 0.45 },
      { x: 120, y: 190, name: '雾隐渡', kind: 'pass', phase: 0.72 },
      { x: -300, y: 128, name: '旧案遗址', kind: 'ruin', phase: 0.88 },
    ];
    const flies = Array.from({ length: 44 }, () => ({
      x: rand(-TW / 2, TW / 2),
      y: rand(-TH / 2, TH / 2),
      ph: rand(0, TAU),
      sp: rand(0.2, 0.9),
      gold: Math.random() < 0.2,
    }));

    function hash2(x, y) {
      const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
      return s - Math.floor(s);
    }

    function smooth(t) {
      return t * t * (3 - 2 * t);
    }

    function vnoise(x, y) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = x - xi;
      const yf = y - yi;
      const a = hash2(xi, yi);
      const b = hash2(xi + 1, yi);
      const c = hash2(xi, yi + 1);
      const d = hash2(xi + 1, yi + 1);
      const u = smooth(xf);
      const v = smooth(yf);
      return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
    }

    function fbm(x, y) {
      let value = 0;
      let amp = 0.56;
      let freq = 1;
      for (let i = 0; i < 4; i++) {
        value += amp * vnoise(x * freq, y * freq);
        freq *= 2.03;
        amp *= 0.48;
      }
      return value;
    }

    function colorFor(h) {
      if (h < 0.3) return [227, 239, 235];
      if (h < 0.35) return [216, 233, 227];
      if (h < 0.4) return [203, 225, 213];
      if (h < 0.48) return [219, 235, 224];
      if (h < 0.56) return [231, 242, 234];
      if (h < 0.64) return [214, 232, 219];
      if (h < 0.72) return [193, 219, 201];
      if (h < 0.8) return [169, 203, 179];
      return [142, 185, 155];
    }

    function buildTerrain() {
      const off = document.createElement('canvas');
      off.width = TW;
      off.height = TH;
      const ox = off.getContext('2d');
      const img = ox.createImageData(TW, TH);
      const data = img.data;
      const levels = [0.32, 0.38, 0.44, 0.5, 0.56, 0.62, 0.68, 0.74];
      for (let py = 0; py < TH; py++) {
        for (let px = 0; px < TW; px++) {
          const nx = (px / TW - 0.5) * 2.6;
          const ny = (py / TH - 0.5) * 2.1;
          let h = fbm(nx * 2.4 + 12, ny * 2.4 - 7);
          const dx = px / TW - 0.5;
          const dy = py / TH - 0.5;
          const d = Math.sqrt(dx * dx * 1.15 + dy * dy * 1.5);
          h = h * 1.25 - d * 0.84 + 0.1;
          let [r, g, b] = colorFor(h);
          for (const level of levels) {
            if (Math.abs(h - level) < 0.0045) {
              r = Math.max(0, r - 28);
              g = Math.max(0, g - 22);
              b = Math.max(0, b - 20);
              break;
            }
          }
          const grain = (Math.random() - 0.5) * 5;
          const idx = (py * TW + px) * 4;
          data[idx] = clamp(r + grain, 0, 255);
          data[idx + 1] = clamp(g + grain, 0, 255);
          data[idx + 2] = clamp(b + grain, 0, 255);
          data[idx + 3] = 255;
        }
      }
      ox.putImageData(img, 0, 0);
      const wash = ox.createRadialGradient(TW / 2, TH / 2, TH * 0.15, TW / 2, TH / 2, TW * 0.62);
      wash.addColorStop(0, 'rgba(255,255,255,0)');
      wash.addColorStop(1, 'rgba(22,24,26,.055)');
      ox.fillStyle = wash;
      ox.fillRect(0, 0, TW, TH);
      ox.strokeStyle = 'rgba(22,24,26,.05)';
      ox.lineWidth = 1;
      for (let gx = TW / 8; gx < TW; gx += TW / 8) {
        ox.beginPath();
        ox.moveTo(gx, 0);
        ox.lineTo(gx, TH);
        ox.stroke();
      }
      for (let gy = TH / 6; gy < TH; gy += TH / 6) {
        ox.beginPath();
        ox.moveTo(0, gy);
        ox.lineTo(TW, gy);
        ox.stroke();
      }
      terrain = off;
      built = true;
    }

    function resize() {
      MW = canvas.clientWidth;
      MH = canvas.clientHeight;
      DPR = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(MW * DPR);
      canvas.height = Math.round(MH * DPR);
      fitScale = Math.min(MW / (TW * 1.08), MH / (TH * 1.2)) * 0.96;
      if (cam.scale === 1) {
        cam.scale = fitScale;
        cam.x = 0;
        cam.y = 0;
      }
      clampCam();
    }

    function clampCam() {
      const viewW = MW / cam.scale;
      const viewH = MH / cam.scale;
      const minX = -TW / 2 + viewW / 2;
      const maxX = TW / 2 - viewW / 2;
      const minY = -TH / 2 + viewH / 2;
      const maxY = TH / 2 - viewH / 2;
      cam.x = minX > maxX ? 0 : clamp(cam.x, minX, maxX);
      cam.y = minY > maxY ? 0 : clamp(cam.y, minY, maxY);
    }

    function toScreen(x, y) {
      return {
        x: (x - cam.x) * cam.scale + MW / 2,
        y: (y - cam.y) * cam.scale + MH / 2,
      };
    }

    function toWorld(px, py) {
      return {
        x: (px - MW / 2) / cam.scale + cam.x,
        y: (py - MH / 2) / cam.scale + cam.y,
      };
    }

    function localPoint(e) {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function markerAt(px, py) {
      for (const m of markers) {
        const p = toScreen(m.x, m.y);
        if (Math.hypot(px - p.x, py - p.y) < 18) return m;
      }
      return null;
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function draw(now) {
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      ctx.clearRect(0, 0, MW, MH);

      if (terrain) {
        const tl = toScreen(-TW / 2, -TH / 2);
        const br = toScreen(TW / 2, TH / 2);

        ctx.save();
        ctx.shadowColor = 'rgba(22,24,26,.15)';
        ctx.shadowBlur = 28;
        ctx.shadowOffsetY = 8;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(tl.x - 8, tl.y - 8, br.x - tl.x + 16, br.y - tl.y + 16);
        ctx.restore();

        ctx.save();
        ctx.translate(MW / 2, MH / 2);
        ctx.scale(cam.scale, cam.scale);
        ctx.translate(-cam.x, -cam.y);
        ctx.drawImage(terrain, -TW / 2, -TH / 2, TW, TH);
        ctx.restore();

        ctx.strokeStyle = 'rgba(22,24,26,.12)';
        ctx.lineWidth = 1;
        ctx.strokeRect(tl.x - 1, tl.y - 1, br.x - tl.x + 2, br.y - tl.y + 2);
        ctx.strokeStyle = 'rgba(14,159,110,.4)';
        const tick = 10;
        [
          [tl.x, tl.y, 1, 1],
          [br.x, tl.y, -1, 1],
          [tl.x, br.y, 1, -1],
          [br.x, br.y, -1, -1],
        ].forEach(([x, y, sx, sy]) => {
          ctx.beginPath();
          ctx.moveTo(x, y + sy * tick);
          ctx.lineTo(x, y);
          ctx.lineTo(x + sx * tick, y);
          ctx.stroke();
        });
      }

      for (const fly of flies) {
        fly.x += Math.cos(now * 0.00013 + fly.ph) * fly.sp * 0.22;
        fly.y += Math.sin(now * 0.00017 + fly.ph) * fly.sp * 0.18;
        if (fly.x < -TW / 2) fly.x = TW / 2;
        if (fly.x > TW / 2) fly.x = -TW / 2;
        if (fly.y < -TH / 2) fly.y = TH / 2;
        if (fly.y > TH / 2) fly.y = -TH / 2;
        const p = toScreen(fly.x, fly.y);
        if (p.x < -10 || p.x > MW + 10 || p.y < -10 || p.y > MH + 10) continue;
        const tw = 0.5 + 0.5 * Math.sin(now * 0.001 + fly.ph * 3);
        ctx.globalAlpha = tw * 0.32;
        ctx.fillStyle = fly.gold ? 'rgb(181,139,58)' : 'rgb(14,159,110)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.1, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      for (const m of markers) {
        const p = toScreen(m.x, m.y);
        if (p.x < -90 || p.x > MW + 90 || p.y < -60 || p.y > MH + 60) continue;
        const color = m.kind === 'city' ? [181, 139, 58] : m.kind === 'ruin' ? [194, 96, 112] : [14, 159, 110];
        const pulse = (now / 2100 + m.phase) % 1;
        const isHover = m === hover || m === selected;
        const r = isHover ? 7 : 5.5;

        ctx.beginPath();
        ctx.arc(p.x, p.y, 9 + pulse * 32, 0, TAU);
        ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${(1 - pulse) * 0.34})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 34);
        glow.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},.16)`);
        glow.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 34, 0, TAU);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.92)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const label = m.name;
        ctx.font = `10px ${SANS}`;
        const w = ctx.measureText(label).width + 18;
        const ly = p.y - 24;
        ctx.save();
        ctx.shadowColor = 'rgba(22,24,26,.14)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = 'rgba(255,255,255,.96)';
        roundRect(p.x - w / 2, ly - 15, w, 20, 10);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},${isHover ? 0.55 : 0.24})`;
        ctx.stroke();
        ctx.fillStyle = `rgba(22,24,26,${isHover ? 0.92 : 0.72})`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, p.x, ly - 5);
      }

      const north = 31.2 - (cam.y / TH) * 1.4;
      const east = 122.4 + (cam.x / TW) * 1.8;
      readout.textContent = `N ${north.toFixed(2)}° · E ${east.toFixed(2)}°`;
    }

    function addMarker(x, y) {
      const m = {
        x,
        y,
        name: `无名之地 ${pad2(markers.length + 1)}`,
        kind: 'pass',
        phase: rand(0, 1),
      };
      markers.push(m);
      selected = m;
      const p = toScreen(x, y);
      Dust.burst(p.x, p.y, 26, 'gold');
      Sound.pluck(360 + markers.length * 20);
      status(`已落钉：${m.name} · 拖动地图继续`);
    }

    canvas.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const p = localPoint(e);
      drag = {
        x: e.clientX,
        y: e.clientY,
        cx: cam.x,
        cy: cam.y,
        moved: false,
        hit: markerAt(p.x, p.y),
        point: p,
      };
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', e => {
      const p = localPoint(e);
      if (drag) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (Math.hypot(dx, dy) > 4) drag.moved = true;
        cam.x = drag.cx - dx / cam.scale;
        cam.y = drag.cy - dy / cam.scale;
        clampCam();
        return;
      }
      const hit = markerAt(p.x, p.y);
      if (hit !== hover) {
        hover = hit;
        Cursor.hover(Boolean(hit));
        if (hit) Sound.hoverTick();
      }
    });

    function endPointer() {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.moved) return;
      if (d.hit) {
        selected = d.hit;
        Sound.pluck(500);
        status(`地点：${d.hit.name}`);
      } else {
        const w = toWorld(d.point.x, d.point.y);
        addMarker(w.x, w.y);
      }
    }

    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener(
      'wheel',
      e => {
        e.preventDefault();
        const p = localPoint(e);
        const before = toWorld(p.x, p.y);
        cam.scale = clamp(cam.scale * Math.exp(-e.deltaY * 0.0012), fitScale * 0.62, fitScale * 3.2);
        const after = toWorld(p.x, p.y);
        cam.x += before.x - after.x;
        cam.y += before.y - after.y;
        clampCam();
      },
      { passive: false },
    );

    $('#mapIn').addEventListener('click', () => {
      cam.scale = clamp(cam.scale * 1.22, fitScale * 0.62, fitScale * 3.2);
      clampCam();
      Sound.tick(0.04);
    });
    $('#mapOut').addEventListener('click', () => {
      cam.scale = clamp(cam.scale / 1.22, fitScale * 0.62, fitScale * 3.2);
      clampCam();
      Sound.tick(0.04);
    });
    $('#mapReset').addEventListener('click', () => {
      cam.scale = fitScale;
      cam.x = 0;
      cam.y = 0;
      clampCam();
      Sound.paper(0.06);
      status('视角已归位');
    });

    function warm() {
      if (built) return;
      setTimeout(() => {
        if (!built) buildTerrain();
      }, reduced ? 120 : 900);
    }

    function enter() {
      if (!MW || !MH) resize();
      if (!built) buildTerrain();
      Sound.chime(0.34);
    }

    return {
      enter,
      warm,
      leave() {},
      resize,
      tick(dt, now) {
        if (!MW || !MH) resize();
        draw(now);
      },
    };
  })();

  /* ── 07 · AI collaboration ──────────────────────────────── */

  const AIScene = (() => {
    const log = $('#aiLog');
    const actions = $('#aiActions');
    const miniMods = $('#miniMods');
    let phase = 'idle';
    let initialized = false;
    let streaming = false;

    const initialModules = [
      { name: '角色档案', meta: '7 字段' },
      { name: '多形态', meta: '3 形象' },
      { name: '关系', meta: '4 条强关系' },
      { name: '时间线', meta: '9 事件' },
    ];
    const prompt = '给沈青梧加一个「势力」模块，要能挂首领和驻地。';
    const reply = '收到。我会用 faction 预设建一个「听雨楼」：首领、驻地、旗号三个字段，保留卡片现有的呈现契约。写完再让你确认。';

    function renderMini() {
      miniMods.innerHTML =
        initialModules
          .map(m => `<div class="mod-tile"><b>${m.name}</b><small>${m.meta}</small></div>`)
          .join('') + `<div class="mod-tile slot" id="slot">＋ 待落位</div>`;
    }

    function resetLog() {
      log.innerHTML = `<div class="msg user">${prompt}</div>`;
      log.scrollTop = log.scrollHeight;
    }

    function setActions(kind) {
      if (kind === 'run') {
        actions.innerHTML = '<button class="btn-primary" type="button" id="runAI">开始生成</button>';
        $('#runAI').addEventListener('click', run);
      } else if (kind === 'undo') {
        actions.innerHTML = '<button class="btn-ghost" type="button" id="undoAI">撤销落位</button>';
        $('#undoAI').addEventListener('click', undo);
      } else if (kind === 'retry') {
        actions.innerHTML = '<button class="btn-ghost" type="button" id="retryAI">重来一次</button>';
        $('#retryAI').addEventListener('click', () => {
          resetLog();
          setActions('run');
          phase = 'idle';
        });
      } else {
        actions.innerHTML = '';
      }
    }

    async function run() {
      if (streaming || phase === 'running' || phase === 'accepted') return;
      phase = 'running';
      streaming = true;
      if (!log.querySelector('.msg.user')) resetLog();
      setActions('empty');

      const bubble = document.createElement('div');
      bubble.className = 'msg assistant';
      bubble.innerHTML = '<span class="stream"></span><span class="caret"></span>';
      log.appendChild(bubble);
      const streamSpan = bubble.querySelector('.stream');
      const caret = bubble.querySelector('.caret');
      log.scrollTop = log.scrollHeight;

      const chars = Array.from(reply);
      for (let i = 0; i < chars.length; i++) {
        streamSpan.textContent += chars[i];
        log.scrollTop = log.scrollHeight;
        if (i % 4 === 0) Sound.quill();
        await wait(motion(28));
      }
      caret.remove();

      await wait(motion(280));
      const tool = document.createElement('div');
      tool.className = 'msg tool';
      tool.innerHTML = '<i></i>add_module_preset · faction';
      log.appendChild(tool);
      log.scrollTop = log.scrollHeight;
      Sound.tick(0.05);

      await wait(motion(360));
      const proposal = document.createElement('div');
      proposal.className = 'proposal';
      proposal.id = 'proposal';
      proposal.innerHTML =
        `<div class="proposal-head"><span class="gem"></span>PROPOSAL · 待你拍板</div>` +
        `<div class="proposal-body"><span class="crest">听</span><div><strong>听雨楼</strong><p>势力 · 江南 · 旧案线</p></div></div>` +
        `<div class="proposal-fields"><span>首领 沈青梧</span><span>驻地 苍梧城</span><span>旗号 听雨</span></div>` +
        `<div class="proposal-actions"><button class="btn-primary" type="button" id="acceptProposal">接受并落位</button><button class="btn-ghost" type="button" id="rejectProposal">拒绝</button></div>`;
      log.appendChild(proposal);
      log.scrollTop = log.scrollHeight;
      $('#acceptProposal').addEventListener('click', accept);
      $('#rejectProposal').addEventListener('click', reject);
      phase = 'proposed';
      streaming = false;
      Sound.chime(0.42);
      const r = proposal.getBoundingClientRect();
      Dust.burst(r.left + r.width * 0.2, r.top + r.height / 2, 22, 'gold');
      status('提案已就位 · 接受后模块会飞进卡里');
    }

    function accept() {
      if (phase !== 'proposed') return;
      const proposal = $('#proposal');
      const slot = $('#slot');
      if (!proposal || !slot) return;
      phase = 'flying';
      const a = proposal.getBoundingClientRect();
      const b = slot.getBoundingClientRect();
      const clone = proposal.cloneNode(true);
      clone.removeAttribute('id');
      clone.querySelectorAll('button').forEach(btn => btn.remove());
      clone.classList.add('flying');
      clone.style.left = `${a.left}px`;
      clone.style.top = `${a.top}px`;
      clone.style.width = `${a.width}px`;
      document.body.appendChild(clone);
      proposal.style.visibility = 'hidden';

      const tx = b.left + b.width / 2 - (a.left + a.width / 2);
      const ty = b.top + b.height / 2 - (a.top + a.height / 2);
      const scale = clamp(b.width / a.width * 0.94, 0.18, 1);
      const animation = clone.animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1, filter: 'blur(0)' },
          { transform: `translate(${tx}px, ${ty}px) scale(${scale})`, opacity: 0.12, filter: 'blur(2px)' },
        ],
        { duration: motion(820), easing: 'cubic-bezier(.2,.9,.25,1)', fill: 'forwards' },
      );
      Sound.whoosh(0.1);
      animation.finished
        .catch(() => {})
        .then(() => {
          clone.remove();
          proposal.remove();
          slot.classList.remove('slot');
          slot.classList.add('filled');
          slot.innerHTML = '<b>势力 · 听雨楼</b><small>首领 · 驻地 · 旗号</small>';
          const nr = slot.getBoundingClientRect();
          Dust.burst(nr.left + nr.width / 2, nr.top + nr.height / 2, 46, 'mint');
          Sound.thud();
          setTimeout(() => Sound.chime(0.7), 90);
          phase = 'accepted';
          setActions('empty');
          const note = $('#miniNote');
          note.innerHTML = '已写入 · <button type="button" id="miniUndo">撤销</button>';
          $('#miniUndo').addEventListener('click', undo);
          toast('已写入卡内 · 势力模块', '撤销', undo);
          status('落位完成 · 模块成为卡的一部分');
        });
    }

    function undo() {
      if (phase !== 'accepted') return;
      const slot = $('#slot');
      if (!slot) return;
      slot.animate(
        [
          { transform: 'scale(1)', opacity: 1 },
          { transform: 'scale(.7) translateY(-14px)', opacity: 0 },
        ],
        { duration: motion(360), easing: 'cubic-bezier(.5,0,.75,.4)' },
      );
      Sound.paper(0.08);
      setTimeout(() => {
        slot.classList.add('slot');
        slot.classList.remove('filled');
        slot.textContent = '＋ 待落位';
        const note = $('#miniNote');
        if (note) note.textContent = '接受提案后，模块会飞进这张卡。';
        phase = 'idle';
        resetLog();
        setActions('run');
        toast('已撤销 · 提案回到待办');
        status('已撤销，卡回到落位前');
      }, motion(380));
    }

    function reject() {
      const proposal = $('#proposal');
      if (!proposal || phase !== 'proposed') return;
      phase = 'rejected';
      proposal.classList.add('crumple');
      Sound.paper(0.14);
      setTimeout(() => {
        proposal.remove();
        setActions('retry');
        toast('已拒绝 · 没有写入任何东西');
        status('提案已丢弃');
      }, motion(640));
    }

    function init() {
      if (initialized) return;
      initialized = true;
      renderMini();
      resetLog();
      setActions('run');
    }

    function enter() {
      init();
      Sound.chime(0.3);
    }

    return { enter, leave() {}, tick() {} };
  })();

  /* ── wire hooks + loop ──────────────────────────────────── */

  hooks[0] = Cosmos;
  hooks[1] = Modules;
  hooks[2] = CollectionScene;
  hooks[3] = GraphScene;
  hooks[4] = TimelineScene;
  hooks[5] = MapScene;
  hooks[6] = AIScene;

  Dust.init();
  setActive(0);
  syncSound();

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(64, now - last);
    last = now;
    Dust.tick(dt);
    Cursor.tick();
    const hook = hooks[active];
    if (hook && hook.tick) hook.tick(dt, now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    Dust.resize();
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      hooks.forEach(hook => {
        if (hook && hook.resize) hook.resize();
      });
    }, 140);
  });

  window.__NOVEN__ = { go, start, state, hooks };
})();
