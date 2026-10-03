// Яндекс Метрика: подключается, только если в .env задан METRIKA_ID.
// Цели воронки: map_open → court_open → slot_pick → form_submit → payment_start → booking_paid.

let counterId = null;

export function initMetrika(id) {
  if (!id) return;
  counterId = Number(id);
  /* eslint-disable */
  (function (m, e, t, r, i, k, a) {
    m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
    m[i].l = 1 * new Date();
    k = e.createElement(t); a = e.getElementsByTagName(t)[0];
    k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
  /* eslint-enable */
  window.ym(counterId, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
}

export function goal(name, params) {
  if (counterId && window.ym) window.ym(counterId, 'reachGoal', name, params);
}
