// Точка входа: состояние страницы и связка карты, фильтров и панели брони.
import { api } from './api.js';
import { goal, initMetrika } from './analytics.js';
import { dayLong, dayShort, hh, rub } from './format.js';
import { createMap, ZONE_FRAMES } from './map.js';
import { renderPanel } from './panel.js';
import { createStore } from './store.js';

const $ = (id) => document.getElementById(id);
const panel = $('panel'), daysEl = $('days'), hourEl = $('hour'), countEl = $('count'), zonesEl = $('zones');

const S = {
  type: 'all', day: 0, hour: null,
  sel: null, slot: null, step: 'pick',
  booking: null, error: '', busy: false, loading: true, holdLeft: '',
  contact: loadContact(),
};
let store, map, config, holdTimer = null;

// ---------- контакты запоминаются в браузере, чтобы не вводить заново ----------
function loadContact() {
  try { return { name: '', phone: '', email: '', consent: false, ...JSON.parse(localStorage.getItem('cf-contact') || '{}') }; }
  catch (_) { return { name: '', phone: '', email: '', consent: false }; }
}
function saveContact() {
  try { localStorage.setItem('cf-contact', JSON.stringify({ ...S.contact, consent: false })); } catch (_) { /* приватный режим */ }
}

const visible = (c) => S.type === 'all' || c.type === S.type;

// ---------- отрисовка ----------
function update() {
  daysEl.innerHTML = store.dates.map((iso, d) => `<button class="day" data-day="${d}" aria-pressed="${d === S.day}">${dayShort(iso, d)}</button>`).join('');
  hourEl.value = S.hour == null ? '' : String(S.hour);
  $('timeWrap').classList.toggle('on', S.hour != null);
  $('lfree').hidden = S.hour == null;

  map.paint({
    visible,
    selected: S.sel,
    freeAt: S.hour != null ? (c) => store.status(c.id, S.day, S.hour) === 'free' : null,
  });

  const vis = store.courts.filter(visible);
  const iso = store.dates[S.day];
  if (S.hour != null) {
    const free = vis.filter((c) => store.status(c.id, S.day, S.hour) === 'free').length;
    countEl.innerHTML = `Свободно <b>${free}</b> из ${vis.length} кортов, ${dayLong(iso, S.day)} в ${hh(S.hour)}`;
  } else countEl.textContent = `${vis.length} кортов, ${dayLong(iso, S.day)}`;

  renderZones();
  renderSide();
}

function renderSide() {
  panel.innerHTML = renderPanel(S, store, { visible, config });
}

function renderZones() {
  zonesEl.innerHTML = Object.entries(ZONE_FRAMES).map(([z, v]) => {
    let n = '';
    if (S.hour != null) {
      const list = store.courts.filter((c) => (z === 'all' || c.zone === z) && visible(c) && store.status(c.id, S.day, S.hour) === 'free');
      n = `<small>${list.length}</small>`;
    }
    return `<button data-zone="${z}" aria-pressed="${map.zone === z}">${v.name}${n}</button>`;
  }).join('');
}

function tipHtml(c) {
  let st = '';
  if (S.hour != null) {
    const free = store.status(c.id, S.day, S.hour) === 'free';
    st = `<span class="st ${free ? 'free' : ''}">${free ? 'Свободен' : 'Занят'} в ${hh(S.hour)}</span>`;
  }
  return `<b>${store.name(c)}</b>${store.meta(c).slice(0, 2).join(', ')}<br>от ${rub(store.minPrice(c))} за час${st}`;
}

// ---------- данные ----------
async function refresh() {
  try {
    store.setAvailability(await api.availability(7));
    if (S.day >= store.dates.length) S.day = 0;
  } catch (e) {
    S.error = 'Не удалось обновить расписание. Проверьте, что сервер запущен.';
  }
}

// ---------- действия ----------
function select(id, day, hour) {
  const c = store.byId[id];
  if (!c) return;
  if (S.step === 'pay' || S.step === 'waiting') return; // не теряем оплату на середине
  S.sel = id; S.step = 'pick'; S.error = '';
  if (day != null) S.day = day;
  const want = hour != null ? hour : S.hour;
  S.slot = want != null && store.status(c.id, S.day, want) === 'free' ? want : null;
  map.hideTip();
  panel.classList.remove('collapsed');
  map.focusCourt(id);
  goal('court_open', { court: id });
  update();
  panel.scrollTop = 0;
}

function closeSel() {
  S.sel = null; S.slot = null; S.step = 'pick'; S.error = '';
  update();
}

function setDay(d) {
  S.day = d;
  if (S.slot != null && S.sel && store.status(S.sel, d, S.slot) !== 'free') S.slot = null;
  update();
}

function startHoldTimer() {
  clearInterval(holdTimer);
  const until = new Date(S.booking.hold_until).getTime();
  const tick = async () => {
    const left = Math.max(0, Math.round((until - Date.now()) / 1000));
    S.holdLeft = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const el = $('holdTimer');
    if (el) el.textContent = S.holdLeft;
    if (left === 0 && S.step === 'pay') {
      clearInterval(holdTimer);
      S.step = 'pick'; S.slot = null; S.booking = null;
      S.error = 'Время на оплату истекло, слот освобождён. Выберите время заново.';
      await refresh(); update();
    }
  };
  tick();
  holdTimer = setInterval(tick, 1000);
}

async function submitForm(form) {
  const fd = new FormData(form);
  S.contact = { name: (fd.get('name') || '').trim(), phone: (fd.get('phone') || '').trim(), email: (fd.get('email') || '').trim(), consent: fd.get('consent') === 'on' };
  saveContact();
  if (S.contact.name.length < 2) { S.error = 'Укажите имя'; return renderSide(); }
  if (S.contact.phone.replace(/\D/g, '').length < 10) { S.error = 'Укажите телефон полностью, например +7 900 000-00-00'; return renderSide(); }
  if (!S.contact.consent) { S.error = 'Отметьте согласие на обработку персональных данных'; return renderSide(); }

  S.busy = true; S.error = ''; renderSide();
  goal('form_submit');
  try {
    S.booking = await api.createBooking({
      court_id: S.sel, date: store.dates[S.day], hour: S.slot,
      name: S.contact.name, phone: S.contact.phone, email: S.contact.email || null, consent: true,
    });
    store.markBusy(S.sel, S.day, S.slot);
    S.step = 'pay';
    startHoldTimer();
  } catch (e) {
    S.error = e.message;
    if (e.status === 409) { await refresh(); S.step = 'pick'; S.slot = null; }
  } finally {
    S.busy = false;
    update();
  }
}

async function mockPay() {
  S.busy = true; S.error = ''; renderSide();
  goal('payment_start', { mode: 'mock' });
  try {
    await new Promise((r) => setTimeout(r, 700)); // имитация похода в платёжную систему
    S.booking = await api.mockPay(S.booking.id);
    clearInterval(holdTimer);
    S.step = 'done';
    goal('booking_paid', { amount: S.booking.amount });
    await refresh();
  } catch (e) {
    S.error = e.message;
  } finally {
    S.busy = false;
    update();
  }
}

async function cancelBooking() {
  clearInterval(holdTimer);
  try { if (S.booking) await api.cancel(S.booking.id); } catch (_) { /* слот всё равно освободится по таймеру */ }
  S.booking = null; S.step = 'pick'; S.error = '';
  await refresh(); update();
}

// Возврат со страницы ЮKassa: /?booking=<id>
async function resumeFromPayment(id) {
  history.replaceState(null, '', location.pathname);
  S.step = 'waiting';
  for (let i = 0; i < 15; i++) {
    let b;
    try { b = await api.booking(id); } catch (e) { S.error = e.message; break; }
    const day = store.dates.indexOf(b.date);
    S.sel = b.court_id; S.day = day >= 0 ? day : 0; S.slot = b.hour; S.booking = b;
    panel.classList.remove('collapsed');
    if (b.status === 'paid') { S.step = 'done'; goal('booking_paid', { amount: b.amount }); await refresh(); break; }
    if (b.status !== 'pending') { S.step = 'pick'; S.slot = null; S.error = 'Оплата не прошла, слот освобождён. Попробуйте ещё раз.'; await refresh(); break; }
    update();
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (S.step === 'waiting') S.error = 'ЮKassa пока не подтвердила оплату. Обновите страницу через минуту.';
  update();
}

// ---------- события ----------
function bindEvents() {
  daysEl.addEventListener('click', (e) => { const b = e.target.closest('[data-day]'); if (b) setDay(+b.dataset.day); });
  hourEl.addEventListener('change', () => {
    S.hour = hourEl.value === '' ? null : +hourEl.value;
    if (S.sel && S.step === 'pick' && S.hour != null && store.status(S.sel, S.day, S.hour) === 'free') S.slot = S.hour;
    update();
  });
  $('seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-type]');
    if (!b) return;
    S.type = b.dataset.type;
    [...e.currentTarget.children].forEach((x) => x.setAttribute('aria-pressed', x === b));
    if (S.sel && S.step === 'pick' && !visible(store.byId[S.sel])) { S.sel = null; S.slot = null; }
    update();
  });
  zonesEl.addEventListener('click', (e) => { const b = e.target.closest('[data-zone]'); if (b) map.fitZone(b.dataset.zone); });
  $('zin').onclick = () => map.zoomBy(1.4);
  $('zout').onclick = () => map.zoomBy(1 / 1.4);
  $('t3d').onclick = (e) => {
    const on = map.toggleTilt();
    e.currentTarget.textContent = on ? '2D' : '3D';
    e.currentTarget.setAttribute('aria-label', on ? 'Показать план сверху' : 'Показать в перспективе');
  };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.sel && S.step === 'pick') closeSel(); });

  panel.addEventListener('submit', (e) => { if (e.target.id === 'bookingForm') { e.preventDefault(); submitForm(e.target); } });
  panel.addEventListener('input', (e) => {
    const f = e.target;
    if (f.name && f.name in S.contact) S.contact[f.name] = f.type === 'checkbox' ? f.checked : f.value;
  });
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'sheet') { panel.classList.toggle('collapsed'); return; }
    if (a === 'close') {
      if (S.step === 'pay') { cancelBooking().then(closeSel); return; }
      closeSel();
      if (innerWidth <= 820) panel.classList.add('collapsed');
      return;
    }
    if (a === 'pick') { select(b.dataset.id, +b.dataset.day, +b.dataset.hour); return; }
    if (a === 'day') { setDay(+b.dataset.day); return; }
    if (a === 'near') { S.day = +b.dataset.day; S.slot = +b.dataset.hour; update(); return; }
    if (a === 'slot') { const h = +b.dataset.hour; S.slot = S.slot === h ? null : h; if (S.slot != null) goal('slot_pick'); renderSide(); return; }
    if (a === 'to-form') { S.step = 'form'; S.error = ''; renderSide(); panel.scrollTop = 0; return; }
    if (a === 'back-pick') { S.step = 'pick'; S.error = ''; renderSide(); return; }
    if (a === 'mock-pay') { mockPay(); return; }
    if (a === 'yookassa') { goal('payment_start', { mode: 'yookassa' }); location.href = S.booking.confirmation_url; return; }
    if (a === 'cancel') { cancelBooking(); return; }
    if (a === 'again') { S.step = 'pick'; S.slot = null; S.booking = null; update(); }
  });
}

// ---------- запуск ----------
async function main() {
  try {
    const [cfg, catalog] = await Promise.all([api.config(), api.courts()]);
    config = cfg;
    store = createStore(catalog);
    await refresh();
  } catch (e) {
    $('mapStatus').textContent = 'Сервер не отвечает. Запустите python run.py и обновите страницу.';
    panel.innerHTML = '<p class="error">Не удалось загрузить данные клуба.</p>';
    return;
  }
  $('mapStatus').hidden = true;
  initMetrika(config.metrika_id);
  goal('map_open');

  const badge = $('modeBadge');
  badge.textContent = config.payment_mode === 'yookassa' ? 'Тестовый магазин ЮKassa' : 'Демо: оплата тестовая';
  badge.hidden = false;

  hourEl.innerHTML = '<option value="">любое время</option>' + store.hours.map((h) => `<option value="${h}">${hh(h)}</option>`).join('');

  map = createMap({
    svg: $('map'), stage: $('stage'), plane: $('plane'), tip: $('tip'),
    courts: store.courts,
    onSelect: (id) => select(id),
    tipHtml,
    label: (c) => `${store.name(c)}, ${store.meta(c)[0]}`,
    onZone: () => renderZones(),
  });
  bindEvents();
  S.loading = false;
  update();
  requestAnimationFrame(() => map.fitZone('k1', false));

  const resumeId = new URLSearchParams(location.search).get('booking');
  if (resumeId) resumeFromPayment(resumeId);

  // Расписание меняется — подтягиваем свежее раз в минуту, пока человек выбирает.
  setInterval(async () => { if (S.step === 'pick') { await refresh(); update(); } }, 60000);
}

main();
