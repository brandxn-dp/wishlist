import { useEffect, useMemo, useRef, useState } from 'react';
import { boot, useStore } from './store.js';
import { Stack, OverlayHost, Spinner, Empty } from './ui.jsx';
import { Icon } from './icons.jsx';
import { extractUrl } from './format.js';
import Auth from './screens/Auth.jsx';
import ListsScreen from './screens/Lists.jsx';
import TagsScreen from './screens/Tags.jsx';
import SettingsScreen from './screens/Settings.jsx';
import PublicList from './screens/Public.jsx';
import { openAddSheet } from './screens/ItemSheets.jsx';

export default function App() {
  const shared = /^\/s\/([\w-]+)/.exec(location.pathname)?.[1];
  if (shared) {
    return (
      <>
        <PublicList token={shared} />
        <OverlayHost />
      </>
    );
  }
  return <Main />;
}

function Main() {
  const phase = useStore((s) => s.phase);
  const error = useStore((s) => s.error);
  useEffect(() => {
    boot();
  }, []);

  if (phase === 'loading') {
    return (
      <div className="splash">
        <Spinner large />
      </div>
    );
  }
  if (phase === 'auth') {
    return (
      <>
        <Auth />
        <OverlayHost />
      </>
    );
  }
  if (phase === 'error') {
    return (
      <div className="splash">
        <Empty icon="warning" title="Can't reach your server" text={error}>
          <button className="btn mt" onClick={boot}>Try Again</button>
        </Empty>
      </div>
    );
  }
  return <Shell />;
}

const TABS = [
  { id: 'lists', label: 'Lists', icon: 'bag', activeIcon: 'bagFill', Root: ListsScreen },
  { id: 'tags', label: 'Tags', icon: 'tag', activeIcon: 'tagFill', Root: TagsScreen },
  { id: 'settings', label: 'Settings', icon: 'gear', activeIcon: 'gear', Root: SettingsScreen },
];

function Shell() {
  const [tab, setTab] = useState('lists');
  const stacks = useRef({});
  const roots = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, <t.Root key={t.id} />])), []);
  const ready = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, (api) => (stacks.current[t.id] = api)])), []);

  const selectTab = (id) => {
    if (id === tab) stacks.current[id]?.popToRoot();
    else setTab(id);
  };

  // Links shared into the app (Android share sheet / bookmarklet / iOS Shortcut "open URL").
  useEffect(() => {
    if (location.pathname === '/share' || location.pathname === '/add') {
      const p = new URLSearchParams(location.search);
      const url = extractUrl([p.get('url'), p.get('text'), p.get('title')].filter(Boolean).join(' '));
      history.replaceState(null, '', '/');
      openAddSheet(url || '', { autoSubmit: !!url });
    }
  }, []);

  // Paste a product link anywhere to add it.
  useEffect(() => {
    const onPaste = (e) => {
      if (e.target.closest?.('input, textarea, [contenteditable]') || document.body.dataset.overlay) return;
      const url = extractUrl(e.clipboardData?.getData('text') || '');
      if (url) {
        e.preventDefault();
        openAddSheet(url, { autoSubmit: true });
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  return (
    <div className="app">
      {TABS.map((t) => (
        <div key={t.id} className="tab-view" hidden={tab !== t.id}>
          <Stack root={roots[t.id]} onReady={ready[t.id]} />
        </div>
      ))}
      <div className="tabbar-wrap">
        <nav className="tabbar" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => selectTab(t.id)}>
              <Icon name={tab === t.id ? t.activeIcon : t.icon} size={26} weight={1.9} />
              {t.label}
            </button>
          ))}
        </nav>
        <button className="fab" onClick={() => openAddSheet('')} aria-label="Add item" title="Add item (or just paste a link)">
          <Icon name="plus" size={30} weight={2.4} />
        </button>
      </div>
      <OverlayHost />
    </div>
  );
}
