import { useSyncExternalStore } from 'react';
import { api } from './api.js';
import { applyTheme } from './theme.js';

let state = {
  phase: 'loading', // loading | auth | ready | error
  user: null,
  lists: [],
  items: [],
  rates: null,
  server: null,
  authStatus: null,
  error: null,
};
const listeners = new Set();

export const getState = () => state;
export function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  for (const l of listeners) l();
}
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));
export const useStore = (selector = (s) => s) => useSyncExternalStore(subscribe, () => selector(state));

// Which list the user is looking at, so the + button adds to it.
export const nav = { activeListId: null };

/* ───────── loading & live sync ───────── */

async function toAuth() {
  source?.close();
  source = null;
  let authStatus = null;
  try {
    authStatus = await api('/auth/status');
  } catch {
    /* offline */
  }
  setState({ phase: 'auth', user: null, lists: [], items: [], authStatus });
}

export async function boot() {
  try {
    const data = await api('/bootstrap');
    setState({ phase: 'ready', error: null, ...data });
    applyTheme(data.user.settings);
    connect();
  } catch (err) {
    if (err.status === 401) await toAuth();
    else setState({ phase: 'error', error: err.message });
  }
}

let source = null;
let timer = null;
let lastRefresh = 0;

function connect() {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource('/api/events');
  let dropped = false;
  source.onmessage = () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  };
  source.onerror = () => {
    dropped = true;
  };
  source.onopen = () => {
    if (dropped) refresh();
    dropped = false;
  };
}

export async function refresh() {
  lastRefresh = Date.now();
  try {
    const data = await api('/bootstrap');
    setState({ phase: 'ready', ...data });
    applyTheme(data.user.settings);
  } catch (err) {
    if (err.status === 401) await toAuth();
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.phase === 'ready' && Date.now() - lastRefresh > 2000) refresh();
});

/* ───────── auth ───────── */

export async function login(username, password) {
  await api('/auth/login', { method: 'POST', body: { username, password } });
  await boot();
}

export async function register(body) {
  await api('/auth/register', { method: 'POST', body });
  await boot();
}

export async function logout() {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  await caches?.delete('wl-data-v1').catch(() => {});
  await toAuth();
}

/* ───────── account ───────── */

export async function updateSettings(patch) {
  const prev = state.user;
  const settings = { ...prev.settings, ...patch };
  setState({ user: { ...prev, settings } });
  applyTheme(settings);
  try {
    const { user } = await api('/me', { method: 'PATCH', body: { settings: patch } });
    setState({ user });
  } catch (err) {
    setState({ user: prev });
    applyTheme(prev.settings);
    throw err;
  }
}

export async function updateProfile(name) {
  const { user } = await api('/me', { method: 'PATCH', body: { name } });
  setState({ user });
}

/* ───────── lists ───────── */

const replaceList = (list) => setState((s) => ({ lists: s.lists.map((l) => (l.id === list.id ? list : l)) }));

export async function createList(data) {
  const { list } = await api('/lists', { method: 'POST', body: data });
  setState((s) => ({ lists: [...s.lists.filter((l) => l.id !== list.id), list] }));
  return list;
}

export async function updateList(id, data) {
  setState((s) => ({ lists: s.lists.map((l) => (l.id === id ? { ...l, ...data } : l)) }));
  const { list } = await api(`/lists/${id}`, { method: 'PATCH', body: data });
  replaceList(list);
  return list;
}

export async function deleteList(id) {
  setState((s) => ({ lists: s.lists.filter((l) => l.id !== id), items: s.items.filter((i) => i.listId !== id) }));
  await api(`/lists/${id}`, { method: 'DELETE' });
}

export async function shareList(id, enabled) {
  const { list } = await api(`/lists/${id}/share`, { method: 'POST', body: { enabled } });
  replaceList(list);
  return list;
}

export async function reorderLists(ids) {
  setState((s) => ({ lists: ids.map((id, i) => ({ ...s.lists.find((l) => l.id === id), position: i + 1 })) }));
  await api('/lists/reorder', { method: 'POST', body: { ids } });
}

/* ───────── items ───────── */

const replaceItem = (item) => setState((s) => ({ items: s.items.map((i) => (i.id === item.id ? item : i)) }));

export async function addItem({ url, listId, allowDuplicate }) {
  const res = await api('/items', { method: 'POST', body: { url, listId, allowDuplicate } });
  if (!res.duplicate) setState((s) => ({ items: [res.item, ...s.items.filter((i) => i.id !== res.item.id)] }));
  return res;
}

export async function updateItem(id, patch) {
  const prev = state.items.find((i) => i.id === id);
  const optimistic = { ...patch };
  delete optimistic.imageUrl;
  if (optimistic.tags) optimistic.tags = optimistic.tags.map((t) => (typeof t === 'string' ? { name: t, auto: false } : t));
  if (prev) replaceItem({ ...prev, ...optimistic });
  try {
    const { item } = await api(`/items/${id}`, { method: 'PATCH', body: patch });
    replaceItem(item);
    return item;
  } catch (err) {
    if (prev) replaceItem(prev);
    throw err;
  }
}

export async function deleteItem(id) {
  const prev = state.items;
  setState((s) => ({ items: s.items.filter((i) => i.id !== id) }));
  try {
    await api(`/items/${id}`, { method: 'DELETE' });
  } catch (err) {
    setState({ items: prev });
    throw err;
  }
}

export async function refreshItem(id) {
  const { item } = await api(`/items/${id}/refresh`, { method: 'POST' });
  replaceItem(item);
  return item;
}

/* ───────── tags ───────── */

export async function renameTag(from, to) {
  await api('/tags/rename', { method: 'POST', body: { from, to } });
  await refresh();
}

export async function deleteTag(name) {
  setState((s) => ({ items: s.items.map((i) => ({ ...i, tags: i.tags.filter((t) => t.name.toLowerCase() !== name.toLowerCase()) })) }));
  await api(`/tags/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export async function retagAll() {
  const res = await api('/items/retag', { method: 'POST' });
  await refresh();
  return res;
}
