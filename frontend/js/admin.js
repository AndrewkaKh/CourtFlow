// Админка: вход менеджера и правка цен на аренду кортов.
import { adminApi } from './api.js';
import { hh, rub } from './format.js';

const TARIFFS = {
  padel: { name: 'Падел', sub: 'Крытые корты', color: 'var(--padel)' },
  outdoor: { name: 'Падел на улице', sub: 'Открытые корты', color: 'var(--teal)' },
  hard: { name: 'Теннис, хард', sub: 'Крытые корты', color: 'var(--hard)' },
  clay: { name: 'Теннис, грунт', sub: 'Крытые корты', color: 'var(--clay)' },
};
const KINDS = { base: 'Обычный час', peak: 'Пиковый час' };
const ROWS = { weekdays: 'Будни', weekends: 'Суббота и воскресенье' };
const MAX = 100000;

const $ = (id) => document.getElementById(id);
const show = (el, on = true) => { el.hidden = !on; };
const info = (key) => TARIFFS[key] || { name: key, sub: '', color: 'var(--ink-2)' };
const valid = (n) => Number.isInteger(n) && n >= 1 && n <= MAX;
const input = (key, kind) => document.querySelector(`input[name="${key}.${kind}"]`);

let saved = null; // цены с сервера
let draft = null; // правки, которые не удалось сохранить из-за истёкшей сессии
let peak = null; // редактируемые пиковые часы: { weekdays: Set, weekends: Set }
let paint = null; // протягивание по шкале: { row, on }

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

// ---------- отрисовка ----------

function renderTariffs(p) {
  $('tariffs').innerHTML = Object.entries(p.tariffs).map(([key, t]) => {
    const i = info(key), n = p.courts_per_tariff[key] || 0;
    const field = (kind) => `<label class="pf">
        <span class="pl"><i class="${kind === 'peak' ? 'pk' : ''}"></i>${KINDS[kind]}</span>
        <span class="pin"><input type="number" inputmode="numeric" min="1" max="${MAX}" step="50" required
          name="${key}.${kind}" value="${t[kind]}" aria-label="${i.name}, ${KINDS[kind].toLowerCase()}"
          aria-describedby="note-${key}-${kind}"><b aria-hidden="true">₽</b></span>
        <span class="pnote" id="note-${key}-${kind}"></span></label>`;
    return `<article class="tcard" style="--c:${i.color}">
      <header><i class="dot" aria-hidden="true"></i><div><h3>${i.name}</h3>
        <span>${i.sub ? `${i.sub} · ` : ''}${n} ${plural(n, 'корт', 'корта', 'кортов')}</span></div></header>
      <div class="tprices">${field('base')}${field('peak')}</div>
      <p class="warn" id="warn-${key}" hidden></p></article>`;
  }).join('');
}

function render(p) {
  saved = p;
  renderTariffs(p);
  renderDayline();
  setPeak(p.peak);
  $('updated').textContent = p.updated_at
    ? `Изменено ${new Date(p.updated_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`
    : 'Действуют цены по умолчанию';
  show($('reset'), Boolean(p.updated_at));
  refresh();
}

function setPeak(p) {
  peak = { weekdays: new Set(p.weekdays), weekends: new Set(p.weekends) };
}

const sorted = (set) => [...set].sort((a, b) => a - b);
const sameHours = (set, list) => set.size === list.length && list.every((h) => set.has(h));

function openHours() {
  const out = [];
  for (let h = saved.hours.open; h < saved.hours.close; h++) out.push(h);
  return out;
}

function values() {
  const tariffs = {};
  for (const key of Object.keys(saved.tariffs)) {
    const num = (kind) => { const v = input(key, kind).value.trim(); return v === '' ? NaN : Number(v); };
    tariffs[key] = { base: num('base'), peak: num('peak') };
  }
  return { tariffs, peak: { weekdays: sorted(peak.weekdays), weekends: sorted(peak.weekends) } };
}

function applyDraft(d) {
  for (const [key, t] of Object.entries(d.tariffs)) {
    for (const kind of ['base', 'peak']) if (input(key, kind)) input(key, kind).value = Number.isNaN(t[kind]) ? '' : t[kind];
  }
  setPeak(d.peak);
}

// ---------- шкала пиковых часов ----------

function renderDayline() {
  const hours = openHours();
  $('dayline').innerHTML = Object.entries(ROWS).map(([row, name]) => `
    <div class="dl-block" data-row="${row}">
      <div class="dl-head"><b>${name}</b>
        <span class="dl-acts">${row === 'weekends' ? '<button type="button" data-act="copy">Как в будни</button>' : ''}<button type="button" data-act="all">Весь день</button><button type="button" data-act="none">Очистить</button></span></div>
      <div class="dl-cells" role="group" aria-label="Пиковые часы: ${name.toLowerCase()}" style="--n:${hours.length}">${hours.map((h, i) =>
        `<button type="button" data-hour="${h}" tabindex="${i ? -1 : 0}" aria-pressed="false" title="${hh(h)}–${hh(h + 1)}"
          aria-label="${hh(h)}–${hh(h + 1)}">${String(h).padStart(2, '0')}</button>`).join('')}</div>
    </div>`).join('');
}

/** Раскрашивает шкалу по текущим правкам. Возвращает число изменённых строк. */
function paintDayline() {
  let changed = 0;
  for (const row of Object.keys(ROWS)) {
    const set = peak[row], block = document.querySelector(`[data-row="${row}"]`);
    for (const b of block.querySelectorAll('[data-hour]')) {
      const on = set.has(Number(b.dataset.hour));
      b.classList.toggle('pk', on);
      b.setAttribute('aria-pressed', String(on));
    }
    const diff = !sameHours(set, saved.peak[row]);
    if (diff) changed++;
    block.classList.toggle('changed', diff);
  }
  return changed;
}

function setHour(row, hour, on) {
  if (peak[row].has(hour) === on) return;
  if (on) peak[row].add(hour); else peak[row].delete(hour);
  refresh();
}

function focusCell(cell, focusVisible = true) {
  for (const b of cell.parentElement.children) b.tabIndex = -1;
  cell.tabIndex = 0;
  cell.focus({ preventScroll: true, focusVisible });
}

/** Сверяет форму с сохранёнными ценами: подсветка правок, ошибки, панель сохранения. */
function refresh() {
  const v = values();
  let changes = 0, invalid = 0;
  for (const [key, t] of Object.entries(saved.tariffs)) {
    const def = saved.defaults.tariffs[key] || t;
    for (const kind of ['base', 'peak']) {
      const el = input(key, kind), val = v.tariffs[key][kind], ok = valid(val), changed = val !== t[kind];
      if (changed) changes++;
      if (!ok) invalid++;
      el.classList.toggle('changed', changed && ok);
      el.setAttribute('aria-invalid', String(!ok));
      const note = $(`note-${key}-${kind}`);
      note.classList.toggle('bad', !ok);
      note.textContent = !ok ? `Целое число от 1 до ${rub(MAX)}`
        : changed ? `было ${rub(t[kind])}`
        : val !== def[kind] ? `по умолчанию ${rub(def[kind])}` : '';
    }
    const tv = v.tariffs[key], cheapPeak = valid(tv.base) && valid(tv.peak) && tv.peak < tv.base;
    $(`warn-${key}`).textContent = cheapPeak ? 'Пиковый час дешевле обычного. Так и задумано?' : '';
    show($(`warn-${key}`), cheapPeak);
  }
  changes += paintDayline();

  $('saveState').textContent = invalid ? `Исправьте ${invalid} ${plural(invalid, 'поле', 'поля', 'полей')}`
    : changes ? `Не сохранено: ${changes} ${plural(changes, 'изменение', 'изменения', 'изменений')}`
    : 'Все изменения сохранены';
  $('savebar').classList.toggle('dirty', changes > 0);
  $('save').disabled = !changes || invalid > 0;
  $('discard').disabled = !changes;
  return { changes, invalid };
}

let toastTimer = 0;
function toast(text, bad = false) {
  const t = $('toast');
  t.textContent = text;
  t.classList.toggle('bad', bad);
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), bad ? 6000 : 3500);
}

// ---------- экраны ----------

async function showPricing() {
  show($('login'), false);
  render(await adminApi.pricing());
  if (draft) { applyDraft(draft); draft = null; refresh(); }
  show($('pricingForm'));
  show($('logout'));
}

function showLogin(hint) {
  show($('pricingForm'), false);
  show($('logout'), false);
  $('loginHint').textContent = hint || 'Пароль выдаёт администратор сайта.';
  show($('login'));
  $('password').focus();
}

// ---------- действия ----------

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.submitter;
  if (!$('password').value) { $('loginError').textContent = 'Введите пароль'; show($('loginError')); return; }
  btn.disabled = true;
  try {
    await adminApi.login($('password').value);
    $('password').value = '';
    show($('loginError'), false);
    await showPricing();
  } catch (err) {
    $('loginError').textContent = err.message;
    show($('loginError'));
  } finally {
    btn.disabled = false;
  }
});

async function save() {
  const { changes, invalid } = refresh();
  if (!changes || invalid) return;
  const body = values();
  $('save').disabled = true;
  try {
    render(await adminApi.savePricing(body));
    toast('Цены сохранены. Клиенты уже видят новые цены');
  } catch (err) {
    if (err.status === 401) {
      draft = body;
      showLogin('Сессия истекла. Войдите снова, ваши правки сохранятся.');
      return;
    }
    toast(err.message, true);
    refresh();
  }
}

$('pricingForm').addEventListener('submit', (e) => { e.preventDefault(); save(); });
$('pricingForm').addEventListener('input', refresh);
$('pricingForm').addEventListener('change', refresh);

// Нажатие переключает час, протягивание красит часы в то же состояние, что и первый.
$('dayline').addEventListener('pointerdown', (e) => {
  const cell = e.target.closest('[data-hour]');
  if (!cell || e.button !== 0) return;
  e.preventDefault();
  const row = cell.closest('[data-row]').dataset.row, h = Number(cell.dataset.hour);
  paint = { row, on: !peak[row].has(h) };
  focusCell(cell, false); // рамка фокуса нужна только при работе с клавиатуры
  setHour(row, h, paint.on);
});
$('dayline').addEventListener('pointermove', (e) => {
  if (!paint) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const cell = el && el.closest(`[data-row="${paint.row}"] [data-hour]`);
  if (cell) setHour(paint.row, Number(cell.dataset.hour), paint.on);
});
for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, () => { paint = null; });

$('dayline').addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]');
  if (act) {
    const row = act.closest('[data-row]').dataset.row;
    peak[row] = new Set(act.dataset.act === 'all' ? openHours() : act.dataset.act === 'copy' ? peak.weekdays : []);
    refresh();
    return;
  }
  // Клик мышью уже обработан в pointerdown, здесь только Enter и пробел (detail === 0).
  const cell = e.target.closest('[data-hour]');
  if (cell && e.detail === 0) {
    const row = cell.closest('[data-row]').dataset.row, h = Number(cell.dataset.hour);
    setHour(row, h, !peak[row].has(h));
  }
});

$('dayline').addEventListener('keydown', (e) => {
  const cell = e.target.closest('[data-hour]');
  if (!cell) return;
  const cells = [...cell.parentElement.children], i = cells.indexOf(cell);
  const other = () => {
    const blocks = [...$('dayline').querySelectorAll('.dl-cells')];
    return blocks.find((b) => b !== cell.parentElement).children[i];
  };
  const next = { ArrowRight: cells[i + 1], ArrowLeft: cells[i - 1], Home: cells[0], End: cells[cells.length - 1],
    ArrowDown: e.key === 'ArrowDown' && other(), ArrowUp: e.key === 'ArrowUp' && other() }[e.key];
  if (next) { e.preventDefault(); focusCell(next); }
});

$('discard').addEventListener('click', () => { render(saved); toast('Правки отменены'); });

$('reset').addEventListener('click', async () => {
  if (!confirm('Вернуть все цены и пиковое время к значениям по умолчанию?')) return;
  try {
    render(await adminApi.resetPricing());
    toast('Цены возвращены к значениям по умолчанию');
  } catch (err) {
    if (err.status === 401) return showLogin('Сессия истекла. Войдите снова.');
    toast(err.message, true);
  }
});

$('logout').addEventListener('click', async () => {
  if (saved && refresh().changes && !confirm('Есть несохранённые правки. Всё равно выйти?')) return;
  await adminApi.logout().catch(() => {});
  saved = null;
  showLogin();
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !$('pricingForm').hidden) {
    e.preventDefault();
    save();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (saved && !$('pricingForm').hidden && refresh().changes) e.preventDefault();
});

(async () => {
  try {
    const s = await adminApi.session();
    if (!s.enabled) {
      $('disabled').innerHTML = '<b>Админка выключена.</b> Задайте пароль менеджера в файле <code>.env</code> строкой <code>ADMIN_PASSWORD=…</code> и перезапустите сервер.';
      show($('disabled'));
    } else if (s.logged_in) {
      await showPricing();
    } else {
      showLogin();
    }
  } catch (err) {
    $('disabled').textContent = err.status === 404
      ? 'Сервер не знает об админке. Перезапустите его, чтобы подхватить новую версию.'
      : `Не удалось загрузить админку: ${err.message}`;
    show($('disabled'));
  } finally {
    show($('loading'), false);
  }
})();
