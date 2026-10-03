// Карта клуба: подложка по схеме кортов, корты поверх, перемещение, зум и наклон 2.5D.

const TILT = 36;
export const ZONE_FRAMES = {
  all: { name: 'Весь клуб', x: 40, y: 110, w: 1020, h: 2450 },
  k1: { name: 'Корпус 1', x: 70, y: 120, w: 970, h: 980 },
  k2: { name: 'Корпус 2', x: 60, y: 1310, w: 960, h: 600 },
  out: { name: 'Улица', x: 70, y: 2010, w: 960, h: 540 },
};

export const courtKind = (c) => (c.type === 'padel' ? 'padel' : c.surface);
export const COURT_COLORS = { padel: '#2F72E4', hard: '#1E4C9E', clay: '#D5764C' };

function courtLines(c) {
  const { x, y, w, h } = c.shape;
  const i = 4;
  let L = `<rect x="${x + i}" y="${y + i}" width="${w - 2 * i}" height="${h - 2 * i}"/>`;
  if (c.type === 'padel') {
    if (w >= h) {
      const mx = x + w / 2, s = w * 0.29, cy = y + h / 2;
      L += `<line x1="${mx - s}" y1="${y + i}" x2="${mx - s}" y2="${y + h - i}"/><line x1="${mx + s}" y1="${y + i}" x2="${mx + s}" y2="${y + h - i}"/><line x1="${mx - s}" y1="${cy}" x2="${mx + s}" y2="${cy}"/><line class="net" x1="${mx}" y1="${y + i}" x2="${mx}" y2="${y + h - i}"/>`;
    } else {
      const my = y + h / 2, s = h * 0.29, cx = x + w / 2;
      L += `<line x1="${x + i}" y1="${my - s}" x2="${x + w - i}" y2="${my - s}"/><line x1="${x + i}" y1="${my + s}" x2="${x + w - i}" y2="${my + s}"/><line x1="${cx}" y1="${my - s}" x2="${cx}" y2="${my + s}"/><line class="net" x1="${x + i}" y1="${my}" x2="${x + w - i}" y2="${my}"/>`;
    }
  } else {
    const sl = x + w * 0.14, sr = x + w * 0.86, my = y + h / 2, s = h * 0.27, cx = x + w / 2;
    L += `<line x1="${sl}" y1="${y + i}" x2="${sl}" y2="${y + h - i}"/><line x1="${sr}" y1="${y + i}" x2="${sr}" y2="${y + h - i}"/><line x1="${sl}" y1="${my - s}" x2="${sr}" y2="${my - s}"/><line x1="${sl}" y1="${my + s}" x2="${sr}" y2="${my + s}"/><line x1="${cx}" y1="${my - s}" x2="${cx}" y2="${my + s}"/><line class="net" x1="${x + i}" y1="${my}" x2="${x + w - i}" y2="${my}"/>`;
  }
  return L;
}

function courtSvg(c, label) {
  const { x, y, w, h } = c.shape;
  const r = Math.min(17, Math.min(w, h) * 0.27), bx = x + w / 2, by = y + h / 2;
  return `<g class="court c-${courtKind(c)}" data-id="${c.id}" tabindex="0" role="button" aria-label="${label}">
    <rect class="side" x="${x}" y="${y + 7}" width="${w}" height="${h}" rx="2"/>
    <g class="lift">
      <rect class="halo" x="${x - 5}" y="${y - 5}" width="${w + 10}" height="${h + 10}" rx="6"/>
      <rect class="top" x="${x}" y="${y}" width="${w}" height="${h}" rx="2"/>
      <g class="lines">${courtLines(c)}</g>
      <circle class="badge" cx="${bx}" cy="${by}" r="${r}"/>
      <text class="num" x="${bx}" y="${by + 1}" style="font-size:${r < 15 ? 12 : 15}px">${c.number}</text>
      <circle class="free-dot" cx="${x + w - 10}" cy="${y + 10}" r="6"/>
    </g></g>`;
}

const parking = (x, y) => `<g class="park" transform="translate(${x} ${y})"><rect x="-30" y="-30" width="60" height="60" rx="10"/><text x="0" y="13">P</text></g><text class="m-label" x="${x}" y="${y + 56}">Парковка</text>`;

// Подложка — здания и зоны, нарисованные по схеме кортов клуба.
const BACKGROUND = `
<defs><pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path class="grid-line" d="M40 0H0V40"/></pattern></defs>
<rect class="g-ground" x="-600" y="-500" width="2300" height="3700"/>
<rect x="-600" y="-500" width="2300" height="3700" fill="url(#grid)"/>
<path class="walk" d="M235 1072V1365M270 1072V1365M868 1072V1365"/>
<text class="m-zone" x="95" y="150">Корпус 1</text>
<rect class="b-side" x="95" y="1055" width="920" height="16"/>
<rect class="b-base" x="95" y="175" width="920" height="880"/>
<rect class="f-pad" x="100" y="192" width="178" height="345"/>
<rect class="f-floor" x="305" y="185" width="705" height="358"/>
<rect class="f-pad" x="100" y="598" width="178" height="338"/>
<rect class="f-floor" x="305" y="580" width="705" height="356"/>
<rect class="f-pad" x="378" y="944" width="212" height="76"/>
<rect class="f-pad" x="660" y="938" width="352" height="114"/>
<rect class="f-teal" x="668" y="978" width="76" height="50"/>
<text class="m-small" x="706" y="1044">Настольный теннис</text>
<rect class="b-wall" x="95" y="175" width="920" height="880"/>
<text class="m-label" x="190" y="186">Падел</text>
<text class="m-label" x="657" y="180">Падел</text>
<text class="m-label" x="190" y="592">Падел</text>
<text class="m-label" x="657" y="575">Большой теннис</text>
<text class="m-label" x="484" y="940">Одиночный падел, 2 этаж</text>
<text class="m-label" x="920" y="934">Падел, 1 этаж</text>
${parking(552, 1210)}
<text class="m-zone" x="80" y="1335">Корпус 2</text>
<rect class="b-side" x="80" y="1880" width="915" height="16"/>
<rect class="b-base" x="80" y="1365" width="915" height="515"/>
<rect class="f-floor" x="85" y="1370" width="174" height="415"/>
<rect class="f-floor" x="265" y="1370" width="726" height="358"/>
<rect class="f-water" x="96" y="1556" width="150" height="218"/>
<path d="M96 1556q9-12 18 0t18 0 18 0 18 0 18 0 18 0 18 0 18 0" fill="none" stroke="#fff" stroke-width="3"/>
<text class="m-small" x="171" y="1670" style="font-size:15px">Бассейн 25 м</text>
<rect class="f-floor" x="345" y="1750" width="535" height="120"/>
<text class="m-small" x="612" y="1815" style="font-size:15px">Тренажёрный зал, 3 этаж</text>
<rect class="f-teal" x="290" y="1798" width="50" height="72"/>
<rect class="f-pad" x="905" y="1742" width="84" height="62"/>
<text class="m-small" x="947" y="1777">Стенка</text>
<rect class="b-wall" x="80" y="1365" width="915" height="515"/>
<text class="m-label" x="628" y="1360">Большой теннис, грунт</text>
<text class="m-label" x="169" y="1360">2 этаж</text>
${parking(552, 1990)}
<text class="m-zone" x="80" y="2050">Улица</text>
<rect class="f-plaza" x="80" y="2066" width="940" height="478" rx="18"/>
<rect class="b-side" x="398" y="2410" width="297" height="12"/>
<rect class="b-base" x="398" y="2268" width="297" height="142"/>
<rect class="b-base" x="488" y="2250" width="117" height="20"/>
<rect class="b-wall" x="398" y="2268" width="297" height="142"/>
<text class="m-label" x="546" y="2200">Открытые падел-корты</text>`;

/**
 * @param {object} o
 * @param {Array} o.courts
 * @param {(id:string)=>void} o.onSelect
 * @param {(court:object)=>string} o.tipHtml
 * @param {(court:object)=>string} o.label
 * @param {(zone:string)=>void} o.onZone
 */
export function createMap({ svg, stage, plane, tip, courts, onSelect, tipHtml, label, onZone }) {
  svg.innerHTML = BACKGROUND + courts.map((c) => courtSvg(c, label(c))).join('');
  const els = {};
  svg.querySelectorAll('.court').forEach((g) => { els[g.dataset.id] = g; });
  const byId = Object.fromEntries(courts.map((c) => [c.id, c]));

  const V = { cx: 550, cy: 600, k: 0.6 };
  let d3 = true;
  let zone = 'k1';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cosT = () => (d3 ? Math.cos((TILT * Math.PI) / 180) : 1);
  const kFit = (z) => { const b = ZONE_FRAMES[z]; return Math.min(stage.clientWidth / b.w, stage.clientHeight / b.h) * (d3 ? 0.92 : 0.96); };
  const kMin = () => kFit('all') * 0.75;
  const kMax = () => Math.max(4, kFit('k1') * 4);
  const clampK = (k) => Math.min(kMax(), Math.max(kMin(), k));

  function render() {
    const pw = plane.offsetWidth, ph = plane.offsetHeight;
    if (!pw || !ph) return;
    const vw = pw / V.k, vh = ph / V.k;
    svg.setAttribute('viewBox', `${V.cx - vw / 2} ${V.cy - vh / 2} ${vw} ${vh}`);
  }

  let raf = null;
  function animateTo(cx, cy, k) {
    cancelAnimationFrame(raf);
    const s = { ...V }, t0 = performance.now(), dur = reduce ? 0 : 520;
    const step = (t) => {
      const p = dur ? Math.min(1, (t - t0) / dur) : 1, e = 1 - Math.pow(1 - p, 3);
      V.cx = s.cx + (cx - s.cx) * e; V.cy = s.cy + (cy - s.cy) * e; V.k = s.k * Math.pow(k / s.k, e);
      render();
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function fitZone(z, anim = true) {
    zone = z;
    const b = ZONE_FRAMES[z], k = clampK(kFit(z));
    const cy = b.y + b.h / 2 + (d3 ? b.h * 0.04 : 0);
    if (anim) animateTo(b.x + b.w / 2, cy, k); else { V.cx = b.x + b.w / 2; V.cy = cy; V.k = k; render(); }
    onZone(z);
  }

  function focusCourt(id) {
    const c = byId[id];
    if (!c) return;
    const { x, y, w, h } = c.shape;
    const k = clampK(Math.max(V.k, kFit(c.zone) * 1.15));
    const mobile = innerWidth <= 820;
    animateTo(x + w / 2, y + h / 2 + (mobile ? h * 0.9 + 90 / k : 0), k);
  }

  function setTilt(on) {
    d3 = on;
    stage.style.setProperty('--tilt', on ? TILT + 'deg' : '0deg');
  }

  // ---- ввод: перетаскивание, щипок, колесо, клавиатура ----
  const ptrs = new Map();
  let drag = null, pinch = null, moved = false, downCourt = null;

  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.zones,.tools,.legend')) return;
    try { stage.setPointerCapture(e.pointerId); } catch (_) { /* старые браузеры */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { moved = false; downCourt = e.target.closest('.court'); drag = { x: e.clientX, y: e.clientY }; }
    else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: V.k }; drag = null; moved = true; }
  });
  stage.addEventListener('pointermove', (e) => {
    if (ptrs.has(e.pointerId)) {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        V.k = clampK((pinch.k * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d); render();
      } else if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!moved && Math.hypot(dx, dy) > 6) { moved = true; stage.classList.add('dragging'); tip.hidden = true; cancelAnimationFrame(raf); }
        if (moved) { V.cx -= dx / V.k; V.cy -= dy / (V.k * cosT()); drag = { x: e.clientX, y: e.clientY }; render(); }
      }
      return;
    }
    if (e.pointerType === 'mouse') {
      const g = e.target.closest('.court');
      if (g) showTip(g, e); else tip.hidden = true;
    }
  });
  const up = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) {
      if (!moved && downCourt && e.type === 'pointerup') onSelect(downCourt.dataset.id);
      drag = null; downCourt = null; stage.classList.remove('dragging');
    }
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') tip.hidden = true; });
  stage.addEventListener('wheel', (e) => {
    e.preventDefault(); cancelAnimationFrame(raf);
    const nk = clampK(V.k * Math.exp(-e.deltaY * 0.0016));
    if (!d3) {
      const r = plane.getBoundingClientRect(), px = e.clientX - r.left - r.width / 2, py = e.clientY - r.top - r.height / 2;
      const wx = V.cx + px / V.k, wy = V.cy + py / V.k;
      V.k = nk; V.cx = wx - px / V.k; V.cy = wy - py / V.k;
    } else V.k = nk;
    render();
  }, { passive: false });
  svg.addEventListener('keydown', (e) => {
    const g = e.target.closest('.court');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(g.dataset.id); }
  });

  function showTip(g, e) {
    const r = stage.getBoundingClientRect();
    tip.innerHTML = tipHtml(byId[g.dataset.id]);
    tip.style.left = Math.min(r.width - 120, Math.max(120, e.clientX - r.left)) + 'px';
    tip.style.top = Math.max(70, e.clientY - r.top) + 'px';
    tip.hidden = false;
  }

  /** Обновить вид кортов: видимость по фильтру, выбранный, свободен/занят в выбранный час. */
  function paint({ visible, selected, freeAt }) {
    svg.classList.toggle('timed', !!freeAt);
    for (const c of courts) {
      const g = els[c.id], v = visible(c);
      g.classList.toggle('off', !v);
      g.classList.toggle('is-sel', selected === c.id);
      g.setAttribute('tabindex', v ? '0' : '-1');
      if (freeAt) { const f = freeAt(c); g.classList.toggle('free', f); g.classList.toggle('busy', !f); }
      else g.classList.remove('free', 'busy');
    }
  }

  new ResizeObserver(() => render()).observe(plane);

  return {
    paint,
    fitZone,
    focusCourt,
    zoomBy: (f) => animateTo(V.cx, V.cy, clampK(V.k * f)),
    toggleTilt: () => { setTilt(!d3); return d3; },
    get zone() { return zone; },
    hideTip: () => { tip.hidden = true; },
  };
}
