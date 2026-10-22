// Данные с сервера и вычисления поверх них: статус слота, цена, ближайшие свободные.
import { hourRanges, isWeekend, rub } from './format.js';

export const ZONE_NAMES = { k1: 'Корпус 1', k2: 'Корпус 2', out: 'Улица' };

export function createStore(catalog) {
  const byId = Object.fromEntries(catalog.courts.map((c) => [c.id, c]));
  const hours = [];
  for (let h = catalog.hours.open; h < catalog.hours.close; h++) hours.push(h);
  let avail = null;

  const store = {
    courts: catalog.courts,
    byId,
    hours,
    get dates() { return avail ? avail.dates : []; },
    get nowHour() { return avail ? avail.now_hour : 0; },
    setAvailability(a) { avail = a; },

    /** 'free' | 'busy' | 'past' */
    status(courtId, dayIdx, hour) {
      const iso = avail && avail.dates[dayIdx];
      const row = iso && avail.courts[courtId] && avail.courts[courtId][iso];
      const ch = row ? row[hour - avail.open_hour] : 'b';
      return ch === 'f' ? 'free' : ch === 'p' ? 'past' : 'busy';
    },
    markBusy(courtId, dayIdx, hour) {
      const iso = avail.dates[dayIdx], row = avail.courts[courtId][iso], i = hour - avail.open_hour;
      avail.courts[courtId][iso] = row.slice(0, i) + 'b' + row.slice(i + 1);
    },

    tariff(c) { return catalog.tariffs[c.tariff]; },
    price(c, dayIdx, hour) {
      const t = store.tariff(c), p = catalog.peak;
      const peakHours = isWeekend(avail.dates[dayIdx]) ? p.weekends : p.weekdays;
      return peakHours.includes(hour) ? t.peak : t.base;
    },
    /** «В пиковые часы 4 800 ₽: в будни 17:00–23:00, в выходные весь день». Пусто, если пика нет. */
    peakNote(c) {
      const t = store.tariff(c), { weekdays, weekends } = catalog.peak;
      if (t.peak === t.base || (!weekdays.length && !weekends.length)) return '';
      const part = (hrs) => (hrs.length === hours.length ? 'весь день' : hourRanges(hrs));
      const when = weekdays.join() === weekends.join() ? `ежедневно ${part(weekdays)}`
        : [weekdays.length && `в будни ${part(weekdays)}`, weekends.length && `в выходные ${part(weekends)}`]
          .filter(Boolean).join(', ');
      return `В пиковые часы ${rub(t.peak)}: ${when}`;
    },
    /** Самая низкая цена часа, которая реально действует. */
    minPrice(c) {
      const t = store.tariff(c), { weekdays, weekends } = catalog.peak;
      const used = [];
      if (weekdays.length < hours.length || weekends.length < hours.length) used.push(t.base);
      if (weekdays.length || weekends.length) used.push(t.peak);
      return Math.min(...used);
    },

    nextFree(c, fromDay, limit, fromHour = null) {
      const out = [];
      for (let d = fromDay; d < store.dates.length && out.length < limit; d++) {
        for (const h of hours) {
          if (d === fromDay && fromHour != null && h < fromHour) continue;
          if (store.status(c.id, d, h) === 'free') { out.push([d, h]); if (out.length >= limit) break; }
        }
      }
      return out;
    },

    name(c) {
      if (c.type === 'padel') return (c.single ? 'Одиночный падел-корт ' : 'Падел-корт ') + c.number;
      return 'Теннисный корт ' + c.number;
    },
    meta(c) {
      const m = [ZONE_NAMES[c.zone], c.indoor ? 'Крытый' : 'Открытый'];
      if (c.type === 'tennis') m.push(c.surface === 'clay' ? 'Грунт' : 'Хард');
      else m.push(c.single ? 'Для игры 1 на 1' : 'Для игры 2 на 2');
      if (c.floor) m.push(c.floor);
      return m;
    },
  };
  return store;
}
