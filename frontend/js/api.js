// Доступ к бэкенду. Весь остальной фронт ходит за данными только через этот модуль:
// в итерации 2 здесь поменяется адрес API, а интерфейс останется прежним.

async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* пустой ответ */ }
  if (!res.ok) {
    const detail = data && data.detail;
    const message = typeof detail === 'string' ? detail
      : Array.isArray(detail) ? 'Проверьте поля формы'
      : `Ошибка сервера (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  config: () => request('/api/config'),
  courts: () => request('/api/courts'),
  availability: (days = 7) => request(`/api/availability?days=${days}`),
  createBooking: (body) => request('/api/bookings', { method: 'POST', body: JSON.stringify(body) }),
  booking: (id) => request(`/api/bookings/${encodeURIComponent(id)}`),
  mockPay: (id) => request(`/api/bookings/${encodeURIComponent(id)}/mock-pay`, { method: 'POST' }),
  cancel: (id) => request(`/api/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
};
