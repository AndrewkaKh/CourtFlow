// Форматирование дат, времени и цен. Даты приходят с сервера строками YYYY-MM-DD (время клуба).

const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const WDL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export const parseIso = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const hh = (h) => String(h).padStart(2, '0') + ':00';
export const rub = (n) => n.toLocaleString('ru-RU') + ' ₽';
export const isWeekend = (iso) => { const g = parseIso(iso).getDay(); return g === 0 || g === 6; };

export function dayShort(iso, index) {
  if (index === 0) return 'Сегодня';
  if (index === 1) return 'Завтра';
  const t = parseIso(iso);
  return `${WD[t.getDay()]}, ${t.getDate()}`;
}

export function dayLong(iso, index) {
  const t = parseIso(iso);
  const prefix = index === 0 ? 'сегодня, ' : index === 1 ? 'завтра, ' : WDL[t.getDay()] + ', ';
  return `${prefix}${t.getDate()} ${MON[t.getMonth()]}`;
}
