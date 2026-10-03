// Разметка правой панели (на телефоне — нижней шторки) для каждого шага брони.
import { dayLong, dayShort, hh, rub } from './format.js';
import { COURT_COLORS, courtKind } from './map.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const handle = '<button class="handle" data-act="sheet" aria-label="Развернуть панель"></button>';
const errorBox = (msg) => (msg ? `<p class="error" role="alert">${esc(msg)}</p>` : '');

// Рисованная заглушка вместо фото корта. Настоящие фото — в courts.json, поле photos.
function photoStub(c, i) {
  const col = COURT_COLORS[courtKind(c)], out = !c.indoor;
  const v = [[40, 120, 6, 154], [56, 142, 4, 128], [22, 104, 36, 160]][i];
  const yT = 48, yB = 110, t = 0.42, lp = (a, b) => a + (b - a) * t;
  const nl = lp(v[0], v[2]), nr = lp(v[1], v[3]), ny = yT + (yB - yT) * t;
  const top = out ? '#8FBEE6' : '#1C2632', mid = out ? '#D5E4EE' : '#33404E', fl = out ? '#A2ABA4' : '#2C9873';
  const lights = out ? '' : [30, 80, 130].map((x) => `<ellipse cx="${x}" cy="12" rx="14" ry="3" fill="#F4F7E6" opacity=".85"/>`).join('');
  const glass = c.type === 'padel' ? `<polyline points="${v[0]},${yT} ${v[0]},${yT - 14} ${v[1]},${yT - 14} ${v[1]},${yT}" fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.45)"/>` : '';
  return `<svg viewBox="0 0 160 110" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="160" height="110" fill="${top}"/><rect y="26" width="160" height="84" fill="${mid}"/>${lights}<rect y="${yT - 6}" width="160" height="${116 - yT}" fill="${fl}"/><polygon points="${v[0]},${yT} ${v[1]},${yT} ${v[3]},${yB} ${v[2]},${yB}" fill="${col}"/><polygon points="${v[0] + 3},${yT + 2} ${v[1] - 3},${yT + 2} ${v[3] - 6},${yB - 2} ${v[2] + 6},${yB - 2}" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="1"/><line x1="${nl}" y1="${ny}" x2="${nr}" y2="${ny}" stroke="#fff" stroke-width="1.6"/>${glass}</svg>`;
}

function photos(c, store) {
  if (c.photos && c.photos.length) {
    return c.photos.slice(0, 3).map((src) => `<div><img src="${esc(src)}" alt="${esc(store.name(c))}" loading="lazy" style="width:100%;height:100%;object-fit:cover"></div>`).join('');
  }
  return [0, 1, 2].map((i) => `<div>${photoStub(c, i)}</div>`).join('');
}

function soonList(S, store, visible) {
  const fromH = S.day === 0 ? store.nowHour + 1 : store.hours[0];
  const start = S.hour != null ? Math.max(S.hour, fromH) : fromH;
  const items = store.courts.filter(visible).map((c) => {
    const f = store.nextFree(c, S.day, 1, start)[0];
    return f && f[0] === S.day ? { c, h: f[1] } : null;
  }).filter(Boolean).sort((a, b) => a.h - b.h || store.price(a.c, S.day, a.h) - store.price(b.c, S.day, b.h)).slice(0, 6);
  if (!items.length) return `<p class="muted">На ${dayLong(store.dates[S.day], S.day)} свободных кортов не осталось. Выберите другой день.</p>`;
  return `<ul class="soon">${items.map(({ c, h }) => `<li><button data-act="pick" data-id="${c.id}" data-day="${S.day}" data-hour="${h}">
    <i style="background:${COURT_COLORS[courtKind(c)]}"></i><span class="sn">${store.name(c)}</span><span class="sm">${store.meta(c).slice(0, 2).join(', ')}, ${rub(store.price(c, S.day, h))}</span><span class="stime">${hh(h)}</span></button></li>`).join('')}</ul>`;
}

function summary(c, S, store, amount) {
  return `<dl class="card"><dt>Корт</dt><dd>${store.name(c)}</dd><dt>Дата</dt><dd>${dayLong(store.dates[S.day], S.day)}</dd><dt>Время</dt><dd>${hh(S.slot)}–${hh(S.slot + 1)}</dd><dt>${S.step === 'done' ? 'Оплачено' : 'К оплате'}</dt><dd>${rub(amount)}</dd></dl>`;
}

export function renderPanel(S, store, { visible, config }) {
  if (S.loading) return `${handle}<p class="loading"><span class="spin"></span>Загружаем расписание</p>`;
  if (!S.sel) {
    return `${handle}${errorBox(S.error)}<div class="block"><h2>Выберите корт</h2><p class="muted">Нажмите на корт на карте, чтобы увидеть фото, цену и свободное время. Выберите время сверху, и свободные корты останутся яркими.</p></div>
      <div class="block"><h3>Ближайшие свободные, ${dayLong(store.dates[S.day], S.day)}</h3>${soonList(S, store, visible)}</div>`;
  }

  const c = store.byId[S.sel];
  const head = `${handle}<div class="ph"><div><h2>${store.name(c)}</h2><div class="chips">${store.meta(c).map((m) => `<span>${m}</span>`).join('')}</div></div>
    <button class="x" data-act="close" aria-label="Закрыть">✕</button></div>`;

  if (S.step === 'form') {
    return `${head}<form class="form" id="bookingForm" novalidate>
      ${summary(c, S, store, store.price(c, S.day, S.slot))}
      ${errorBox(S.error)}
      <div class="field"><label for="f-name">Имя</label><input id="f-name" name="name" autocomplete="name" required minlength="2" value="${esc(S.contact.name)}"></div>
      <div class="field"><label for="f-phone">Телефон</label><input id="f-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" required placeholder="+7 900 000-00-00" value="${esc(S.contact.phone)}">
        <span class="hint">Администратор позвонит, если что-то изменится</span></div>
      <div class="field"><label for="f-email">Почта, необязательно</label><input id="f-email" name="email" type="email" autocomplete="email" value="${esc(S.contact.email)}"></div>
      <label class="check"><input id="f-consent" name="consent" type="checkbox" ${S.contact.consent ? 'checked' : ''}><span>Согласен с <a href="/privacy.html" target="_blank">обработкой персональных данных</a> и <a href="/offer.html" target="_blank">офертой</a></span></label>
      <button class="btn" type="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '<span class="spin"></span>Резервируем слот' : 'Перейти к оплате'}</button>
      <button class="btn ghost" type="button" data-act="back-pick">Изменить время</button>
    </form>`;
  }

  if (S.step === 'pay') {
    const b = S.booking;
    const yk = config.payment_mode === 'yookassa';
    return `${head}<div class="block"><h2 style="font-size:18px">Оплата</h2>
      ${summary(c, S, store, b.amount)}
      <p class="sandbox">Слот закреплён за вами ещё <span class="timer" id="holdTimer">${S.holdLeft || ''}</span>. ${yk
        ? 'Откроется тестовая страница ЮKassa, деньги не спишутся.'
        : 'Это тестовая оплата: деньги не спишутся, данные карты не нужны.'}</p>
      ${errorBox(S.error)}</div>
      <div class="block"><button class="btn ball" data-act="${yk ? 'yookassa' : 'mock-pay'}" ${S.busy ? 'disabled' : ''}>${S.busy ? '<span class="spin"></span>Проводим платёж' : yk ? 'Оплатить в ЮKassa' : 'Оплатить тестовой картой'}</button>
      <button class="btn ghost" data-act="cancel" ${S.busy ? 'disabled' : ''}>Отменить и выбрать другое время</button></div>`;
  }

  if (S.step === 'waiting') {
    return `${head}<div class="block"><p class="loading"><span class="spin"></span>Проверяем оплату в ЮKassa</p>${errorBox(S.error)}</div>`;
  }

  if (S.step === 'done') {
    return `${head}<div class="block" role="status"><div class="done-mark"><svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#1B2400" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <h2>Корт забронирован</h2><p class="muted">Покажите номер брони на ресепшене. Слот уже занят на карте.</p>
      <dl class="card"><dt>Номер брони</dt><dd>${esc(S.booking.code)}</dd></dl>
      ${summary(c, S, store, S.booking.amount)}</div>
      <div class="block"><button class="btn" data-act="again">Забронировать ещё</button></div>`;
  }

  // шаг pick: карточка корта и расписание
  const t = store.tariff(c);
  const near = store.nextFree(c, 0, 3);
  const slots = store.hours.map((h) => {
    const s = store.status(c.id, S.day, h);
    return `<button class="slot" data-act="slot" data-hour="${h}" ${s !== 'free' ? 'disabled' : ''} aria-pressed="${S.slot === h}" aria-label="${hh(h)}, ${s === 'free' ? 'свободно' : s === 'past' ? 'прошло' : 'занято'}">${hh(h)}</button>`;
  }).join('');
  return `${head}${errorBox(S.error)}
    <div class="block"><div class="photos">${photos(c, store)}</div>
    ${c.photos && c.photos.length ? '' : '<p class="note">Иллюстрации-заглушки. Фото корта добавляются в data/courts.json.</p>'}</div>
    <div class="price"><b>от ${rub(t.base)} за час</b><span>После 17:00 и в выходные ${rub(t.peak)}</span></div>
    <div class="block"><h3>Ближайшие свободные</h3><div class="near">${near.length ? near.map(([d, h]) => `<button data-act="near" data-day="${d}" data-hour="${h}">${dayShort(store.dates[d], d)}, ${hh(h)}</button>`).join('') : '<span class="muted">На неделю вперёд всё занято</span>'}</div></div>
    <div class="block"><h3>Расписание на ${dayLong(store.dates[S.day], S.day)}</h3>
      <div class="dayrow">${store.dates.map((iso, d) => `<button class="day" data-act="day" data-day="${d}" aria-pressed="${d === S.day}">${dayShort(iso, d)}</button>`).join('')}</div>
      <div class="slots">${slots}</div></div>
    <div class="cta">${S.slot != null
      ? `<div class="sum"><span>${dayShort(store.dates[S.day], S.day)}, ${hh(S.slot)}–${hh(S.slot + 1)}</span><b>${rub(store.price(c, S.day, S.slot))}</b></div><button class="btn" data-act="to-form">Забронировать</button>`
      : '<button class="btn" disabled>Выберите время</button>'}</div>`;
}
