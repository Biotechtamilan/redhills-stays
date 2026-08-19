// Data layer: talk to /api/hotels (GitHub-backed shared store). If that
// endpoint isn't there or isn't configured (local `vite` preview, or a
// Vercel deploy missing GITHUB_TOKEN/GITHUB_REPO), fall back to
// localStorage so the app still works — just not shared.

const LOCAL_KEY = 'redhills-stays:data:v1';
const API_URL = '/api/hotels';

export const MODE = { API: 'api', LOCAL: 'local' };

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocal(data) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
  } catch {
    // localStorage unavailable (private mode, quota) — nothing more we can do here.
  }
}

export async function loadDataset(seed) {
  try {
    const res = await fetch(API_URL, { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.hotels)) {
        return { data, mode: MODE.API };
      }
    }
  } catch {
    // no network / no such route (plain `vite dev` or `vite preview`) — use local fallback below.
  }

  const local = readLocal();
  if (local && Array.isArray(local.hotels)) {
    return { data: local, mode: MODE.LOCAL };
  }
  writeLocal(seed);
  return { data: seed, mode: MODE.LOCAL };
}

export async function saveDataset(data, mode) {
  const payload = { ...data, updated_at: new Date().toISOString() };

  if (mode === MODE.API) {
    try {
      const res = await fetch(API_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const saved = await res.json();
        return { data: saved, mode: MODE.API, ok: true };
      }
    } catch {
      // fall through to local
    }
    // API rejected or unreachable mid-session — don't lose the edit, drop to local.
    writeLocal(payload);
    return { data: payload, mode: MODE.LOCAL, ok: false };
  }

  writeLocal(payload);
  return { data: payload, mode: MODE.LOCAL, ok: true };
}
