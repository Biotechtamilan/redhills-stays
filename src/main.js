import './style.css';
import seed from '../data/hotels.json';
import { loadDataset, saveDataset, MODE } from './api.js';

const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'quoted', label: 'Quoted' },
  { value: 'booked', label: 'Booked' },
  { value: 'skip', label: 'Skip' },
];
const STATUS_ORDER = Object.fromEntries(STATUSES.map((s, i) => [s.value, i]));
const FILTER_CHIPS = [{ value: 'all', label: 'All' }, ...STATUSES];

const state = {
  raw: null,
  mode: MODE.LOCAL,
  filter: { status: 'all', search: '', hasPhone: false },
  sort: 'distance',
  selectedId: null,
  addOpen: false,
  saveStatus: '',
};

const app = document.getElementById('app');

/* ---------- helpers ---------- */

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

function slugify(str) {
  return String(str)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function uniqueId(name) {
  const base = slugify(name) || 'stay';
  const existing = new Set(state.raw.hotels.map((h) => h.id));
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function kmText(h) {
  return h.km != null && h.km !== '' ? `${Number(h.km).toFixed(2)} km` : 'distance unknown';
}

function ratingText(h) {
  if (!h.rating) return 'unrated';
  return `${h.rating}★${h.reviews ? ` (${h.reviews})` : ''}`;
}

function telHref(phone) {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.length >= 6 ? `tel:${digits}` : null;
}

function isWhatsappable(phone) {
  return Boolean(phone && phone.trim().startsWith('+91'));
}

function waHref(phone) {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

function nowLocalDatetimeValue() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

function getHotel(id) {
  return state.raw.hotels.find((h) => h.id === id);
}

function getVisibleHotels() {
  const { status, search, hasPhone } = state.filter;
  const q = search.trim().toLowerCase();
  let list = state.raw.hotels.filter((h) => {
    if (status !== 'all' && h.status !== status) return false;
    if (hasPhone && !h.phone) return false;
    if (q) {
      const hay = [h.name, h.address, h.type, ...(h.aka || [])].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  list = list.slice().sort((a, b) => {
    switch (state.sort) {
      case 'rating':
        return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
      case 'name':
        return a.name.localeCompare(b.name);
      case 'status':
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      case 'distance':
      default: {
        const ak = a.km == null || a.km === '' ? Infinity : Number(a.km);
        const bk = b.km == null || b.km === '' ? Infinity : Number(b.km);
        return ak - bk;
      }
    }
  });
  return list;
}

/* ---------- persistence ---------- */

async function persist(mutateFn) {
  mutateFn();
  renderList();
  renderCount();
  state.saveStatus = 'Saving…';
  renderDrawerSaveStatus();
  const result = await saveDataset(state.raw, state.mode);
  state.raw = result.data;
  state.mode = result.mode;
  state.saveStatus = result.ok === false ? 'Saved locally only — could not reach the shared store.' : 'Saved.';
  renderBanner();
  renderList();
  renderCount();
  renderDrawerSaveStatus();
}

/* ---------- shell (rendered once) ---------- */

function renderShell() {
  app.innerHTML = `
    <div id="banner-slot"></div>
    <header class="header">
      <div class="header-top">
        <div>
          <h1 class="header-title">Redhills Stays</h1>
          <p class="header-sub">Call tracker · near Sri Angala Eshwari Temple, Red Hills</p>
        </div>
        <div class="header-actions">
          <button class="btn" id="export-btn" type="button">Export JSON</button>
          <button class="btn btn-primary" id="add-btn" type="button">+ Add stay</button>
        </div>
      </div>
      <div class="count-line" id="count-line"></div>
    </header>
    <div class="controls">
      <div class="controls-row">
        <input class="search-input" id="search-input" type="text" placeholder="Search name, address, type…" autocomplete="off" />
        <select class="sort-select" id="sort-select">
          <option value="distance">Sort: distance</option>
          <option value="rating">Sort: rating</option>
          <option value="name">Sort: name</option>
          <option value="status">Sort: status</option>
        </select>
        <label class="check-toggle">
          <input type="checkbox" id="has-phone-toggle" />
          Has phone
        </label>
      </div>
      <div class="controls-row chips" id="status-chips"></div>
    </div>
    <main class="list" id="list"></main>
    <footer class="footer">
      Data lives in <code>data/hotels.json</code> in this repo. No login — anyone with the link can view and edit.
    </footer>
    <div id="overlay-slot"></div>
  `;

  document.getElementById('search-input').addEventListener('input', (e) => {
    state.filter.search = e.target.value;
    renderList();
    renderCount();
  });

  document.getElementById('sort-select').value = state.sort;
  document.getElementById('sort-select').addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderList();
  });

  document.getElementById('has-phone-toggle').addEventListener('change', (e) => {
    state.filter.hasPhone = e.target.checked;
    renderList();
    renderCount();
  });

  const chipsWrap = document.getElementById('status-chips');
  chipsWrap.innerHTML = FILTER_CHIPS.map(
    (c) =>
      `<button class="chip" type="button" data-status="${c.value}" aria-pressed="${
        state.filter.status === c.value
      }">${c.label}</button>`
  ).join('');
  chipsWrap.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    state.filter.status = btn.dataset.status;
    [...chipsWrap.querySelectorAll('.chip')].forEach((c) =>
      c.setAttribute('aria-pressed', String(c.dataset.status === state.filter.status))
    );
    renderList();
    renderCount();
  });

  document.getElementById('add-btn').addEventListener('click', openAddModal);
  document.getElementById('export-btn').addEventListener('click', exportJson);

  document.getElementById('list').addEventListener('click', onListClick);

  renderBanner();
  renderList();
  renderCount();
}

function renderBanner() {
  const slot = document.getElementById('banner-slot');
  slot.innerHTML =
    state.mode === MODE.LOCAL
      ? `<div class="banner"><strong>Local only</strong> — not shared until Vercel env is set.</div>`
      : '';
}

function renderCount() {
  const el = document.getElementById('count-line');
  const total = state.raw.hotels.length;
  const visible = getVisibleHotels().length;
  const byStatus = STATUSES.map(
    (s) => `<span>${state.raw.hotels.filter((h) => h.status === s.value).length} ${s.label.toLowerCase()}</span>`
  ).join('');
  el.innerHTML = `<strong>${visible}</strong> of ${total} shown ${byStatus}`;
}

/* ---------- list ---------- */

function rowTemplate(h) {
  const badges = [
    h.you_shared ? '<span class="badge badge-shared">You shared</span>' : '',
    h.closed ? '<span class="badge badge-closed">Closed</span>' : '',
    h.added_by_user ? '<span class="badge badge-added">Added by you</span>' : '',
  ].join('');

  const tel = telHref(h.phone);
  const actions = [
    tel ? `<a class="btn btn-sm" data-noopen href="${tel}">Call</a>` : '',
    h.maps_url ? `<a class="btn btn-sm" data-noopen href="${escapeHtml(h.maps_url)}" target="_blank" rel="noopener">Maps</a>` : '',
    isWhatsappable(h.phone)
      ? `<a class="btn btn-sm" data-noopen href="${waHref(h.phone)}" target="_blank" rel="noopener">WhatsApp</a>`
      : '',
  ].join('');

  return `
    <button class="row ${h.closed ? 'is-closed' : ''} ${h.status === 'skip' ? 'is-skip' : ''}" type="button" data-id="${escapeHtml(h.id)}">
      <div class="row-top">
        <div class="row-name-wrap">
          <p class="row-name">${escapeHtml(h.name)}</p>
          ${badges}
        </div>
        <span class="status-pill status-${h.status}">${STATUSES.find((s) => s.value === h.status)?.label ?? h.status}</span>
      </div>
      <div class="row-meta">
        <span>${escapeHtml(h.type || 'Stay')}</span>
        <span>${kmText(h)}</span>
        <span>${ratingText(h)}</span>
        ${h.phone ? `<span>${escapeHtml(h.phone)}</span>` : ''}
      </div>
      <div class="row-address">${escapeHtml(h.address || 'No address on file')}</div>
      ${actions ? `<div class="row-actions">${actions}</div>` : ''}
    </button>
  `;
}

function renderList() {
  const listEl = document.getElementById('list');
  const visible = getVisibleHotels();
  listEl.innerHTML = visible.length
    ? visible.map(rowTemplate).join('')
    : `<div class="empty-state">No stays match this filter.</div>`;
}

function onListClick(e) {
  if (e.target.closest('[data-noopen]')) return;
  const row = e.target.closest('.row');
  if (!row) return;
  openDrawer(row.dataset.id);
}

/* ---------- drawer ---------- */

function openDrawer(id) {
  state.selectedId = id;
  state.saveStatus = '';
  renderOverlay();
}

function closeOverlay() {
  state.selectedId = null;
  state.addOpen = false;
  document.getElementById('overlay-slot').innerHTML = '';
}

function drawerTemplate(h) {
  const tel = telHref(h.phone);
  return `
    <div class="scrim" data-close-drawer></div>
    <aside class="drawer" role="dialog" aria-label="${escapeHtml(h.name)} details">
      <div class="drawer-header">
        <div>
          <p class="drawer-title">${escapeHtml(h.name)}</p>
          <div class="row-meta">
            <span>${escapeHtml(h.type || 'Stay')}</span>
            <span>${kmText(h)}</span>
            <span>${ratingText(h)}</span>
          </div>
          <div class="row-address" style="white-space:normal;margin-top:4px;">${escapeHtml(
            h.address || 'No address on file'
          )}</div>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" data-close-drawer aria-label="Close">✕</button>
      </div>
      <div class="drawer-body">
        <div class="drawer-links">
          ${tel ? `<a class="btn btn-sm" href="${tel}">Call ${escapeHtml(h.phone)}</a>` : ''}
          ${h.maps_url ? `<a class="btn btn-sm" href="${escapeHtml(h.maps_url)}" target="_blank" rel="noopener">Open in Maps</a>` : ''}
          ${isWhatsappable(h.phone) ? `<a class="btn btn-sm" href="${waHref(h.phone)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        </div>

        <div class="field">
          <label for="f-status">Status</label>
          <select id="f-status">
            ${STATUSES.map((s) => `<option value="${s.value}" ${s.value === h.status ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </div>

        <div class="field field-inline">
          <input type="checkbox" id="f-contacted" ${h.contacted ? 'checked' : ''} />
          <label for="f-contacted">Contacted</label>
        </div>

        <div class="field">
          <label for="f-contacted-at">Contacted at</label>
          <input type="datetime-local" id="f-contacted-at" value="${escapeHtml(h.contacted_at || '')}" />
        </div>

        <div class="field">
          <label for="f-quoted">Quoted amount</label>
          <input type="text" id="f-quoted" placeholder="e.g. ₹1800 / night" value="${escapeHtml(h.quoted_amount || '')}" />
        </div>

        <div class="field">
          <label for="f-said">What they said</label>
          <textarea id="f-said" placeholder="Notes from the call…">${escapeHtml(h.what_they_said || '')}</textarea>
        </div>

        <div class="field">
          <label for="f-notes">Notes</label>
          <textarea id="f-notes" placeholder="">${escapeHtml(h.notes || '')}</textarea>
        </div>
      </div>
      <div class="drawer-footer">
        <span class="save-status" id="save-status"></span>
        <button class="btn" type="button" data-close-drawer>Close</button>
        <button class="btn btn-primary" type="button" id="save-drawer">Save</button>
      </div>
    </aside>
  `;
}

function renderOverlay() {
  const slot = document.getElementById('overlay-slot');
  if (state.selectedId) {
    const h = getHotel(state.selectedId);
    if (!h) {
      closeOverlay();
      return;
    }
    slot.innerHTML = drawerTemplate(h);
    slot.querySelectorAll('[data-close-drawer]').forEach((el) =>
      el.addEventListener('click', closeOverlay)
    );
    document.getElementById('f-contacted').addEventListener('change', (e) => {
      if (e.target.checked) {
        const atField = document.getElementById('f-contacted-at');
        if (!atField.value) atField.value = nowLocalDatetimeValue();
      }
    });
    document.getElementById('save-drawer').addEventListener('click', () => saveDrawer(h.id));
  } else if (state.addOpen) {
    slot.innerHTML = addModalTemplate();
    slot.querySelectorAll('[data-close-modal]').forEach((el) =>
      el.addEventListener('click', closeOverlay)
    );
    document.getElementById('add-form').addEventListener('submit', onAddSubmit);
  } else {
    slot.innerHTML = '';
  }
}

function renderDrawerSaveStatus() {
  const el = document.getElementById('save-status');
  if (!el) return;
  el.textContent = state.saveStatus;
  el.classList.toggle('is-error', state.saveStatus.includes('could not'));
}

async function saveDrawer(id) {
  const status = document.getElementById('f-status').value;
  const contacted = document.getElementById('f-contacted').checked;
  const contactedAt = document.getElementById('f-contacted-at').value;
  const quotedAmount = document.getElementById('f-quoted').value;
  const whatTheySaid = document.getElementById('f-said').value;
  const notes = document.getElementById('f-notes').value;

  await persist(() => {
    const h = getHotel(id);
    h.status = status;
    h.contacted = contacted;
    h.contacted_at = contactedAt;
    h.quoted_amount = quotedAmount;
    h.what_they_said = whatTheySaid;
    h.notes = notes;
  });
}

/* ---------- add stay modal ---------- */

function openAddModal() {
  state.addOpen = true;
  renderOverlay();
}

function addModalTemplate() {
  return `
    <div class="scrim" data-close-modal></div>
    <div class="modal-wrap">
      <div class="modal" role="dialog" aria-label="Add a stay">
        <div class="modal-header">
          <p class="drawer-title">Add stay</p>
          <button class="btn btn-ghost btn-sm" type="button" data-close-modal aria-label="Close">✕</button>
        </div>
        <form id="add-form">
          <div class="modal-body">
            <div class="field">
              <label for="a-name">Name <span class="required-mark">*</span></label>
              <input type="text" id="a-name" required />
            </div>
            <div class="field">
              <label for="a-phone">Phone</label>
              <input type="text" id="a-phone" placeholder="+91 …" />
            </div>
            <div class="field">
              <label for="a-address">Address</label>
              <input type="text" id="a-address" />
            </div>
            <div class="field">
              <label for="a-km">Distance (km)</label>
              <input type="number" id="a-km" step="0.01" min="0" />
            </div>
            <div class="field">
              <label for="a-type">Type</label>
              <input type="text" id="a-type" placeholder="Hotel, Lodge, Guest house…" />
            </div>
            <div class="field">
              <label for="a-maps">Maps URL</label>
              <input type="url" id="a-maps" placeholder="https://maps.google.com/…" />
            </div>
            <div class="field">
              <label for="a-notes">Notes</label>
              <textarea id="a-notes"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn" type="button" data-close-modal>Cancel</button>
            <button class="btn btn-primary" type="submit">Add stay</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function onAddSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('a-name').value.trim();
  if (!name) return;
  const phone = document.getElementById('a-phone').value.trim();
  const address = document.getElementById('a-address').value.trim();
  const kmRaw = document.getElementById('a-km').value;
  const type = document.getElementById('a-type').value.trim();
  const mapsUrl = document.getElementById('a-maps').value.trim();
  const notes = document.getElementById('a-notes').value.trim();

  const hotel = {
    name,
    lat: null,
    lon: null,
    rating: '',
    reviews: '',
    price_seen: '',
    phone,
    address,
    website: '',
    maps_url: mapsUrl,
    type: type || 'Stay',
    closed: false,
    sponsored: false,
    amenities: [],
    source: ['added-by-user'],
    you_shared: false,
    km: kmRaw === '' ? null : Number(kmRaw),
    contacted: false,
    contacted_at: '',
    quoted_amount: '',
    what_they_said: '',
    notes,
    status: 'new',
    added_by_user: true,
    id: uniqueId(name),
    aka: [],
  };

  closeOverlay();
  await persist(() => {
    state.raw.hotels.push(hotel);
  });
}

/* ---------- export ---------- */

function exportJson() {
  const blob = new Blob([JSON.stringify(state.raw, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `redhills-stays-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------- init ---------- */

async function init() {
  const { data, mode } = await loadDataset(seed);
  state.raw = data;
  state.mode = mode;
  renderShell();
}

init();
