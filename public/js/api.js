// One place that knows the endpoint names. Tab 1 and Tab 2 both go through here, so both talk to the same engine.
import { getJSON, postJSON } from './util.js';

export const API = {
  catalog: () => getJSON('/api/mumu/catalog'),
  recommend: (profile) => postJSON('/api/mumu/recommendations', profile), // focus_wish_id is never sent: it is not a model input
  place: (id) => getJSON('/api/mumu/places/' + encodeURIComponent(id)),
  trip: (id) => getJSON('/api/mumu/trips/' + encodeURIComponent(id)),
  offers: (placeIds, wishIds) => getJSON(`/api/mumu/proxy-offers?place_ids=${placeIds.join(',')}&wish_ids=${wishIds.join(',')}`),
  feedback: (body) => postJSON('/api/mumu/demo-feedback', body),
  trace: (profile) => postJSON('/api/trace', profile), // same engine, plus every intermediate number (Tab 2)
};
