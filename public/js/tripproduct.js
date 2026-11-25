// Product display layer for the 3 fixed trips: price and travel rounds from the local mock catalogue (public/data/trip_products.json).
// Pure functions, joined to the model result by trip_id only. Nothing here takes part in any score, ranking or matching,
// no date is ever made up, and the chosen date is never sent or stored.
const SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const DAY_TH = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

export const priceText = (thb) => `${Number(thb).toLocaleString('en-US')} บาท`;
export function roundLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DAY_TH[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${SHORT[m - 1]} ${y + 543}`;
}
export const productOf = (data, tripId) => (data && data.trips && data.trips[tripId]) || null;
/** Rounds of one trip whose travel date has not passed (today included), earliest first. `today` is a Bangkok 'YYYY-MM-DD'. */
export function upcomingRounds(data, tripId, today) {
  return ((data && data.sessions) || []).filter((s) => s.trip_id === tripId && s.service_date >= today)
    .sort((a, b) => a.service_date.localeCompare(b.service_date));
}
/** The chosen round, only while it is still one of the upcoming rounds of THIS trip. */
export const chosenRound = (data, tripId, today, date) => upcomingRounds(data, tripId, today).find((s) => s.service_date === date) || null;
