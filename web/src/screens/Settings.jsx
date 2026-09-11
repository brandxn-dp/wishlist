import { useEffect, useRef, useState } from 'react';
import { useStore, updateSettings, updateProfile, logout, refresh, retagAll, setState, getState } from '../store.js';
import { api } from '../api.js';
import { COLORS, colorOf, useDark } from '../theme.js';
import {
  Page, Group, Row, Toggle, Segmented, SearchField, GlassButton, SheetHeader, Spinner, useNav, presentSheet, promptAlert,
  confirmAlert, actionSheet, toast,
} from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { CURRENCIES, currencyName, timeAgo, plural } from '../format.js';

const REPO = 'https://github.com/brandxn-dp/wishlist';
const fail = (err) => toast(err.message, { error: true });
const set = (patch) => updateSettings(patch).catch(fail);

export default function SettingsScreen() {
  const user = useStore((s) => s.user);
  const server = useStore((s) => s.server);
  const nav = useNav();
  const dark = useDark();
  const file = useRef(null);
  const s = user.settings;
  const initials = (user.name || user.username).split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const c = (k) => colorOf(k, dark);

  const importFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const res = await api('/import', { method: 'POST', body: json });
      toast(`Imported ${plural(res.items, 'item')} into ${plural(res.lists, 'list')}`);
      refresh();
    } catch (err) {
      toast(err instanceof SyntaxError ? "That file isn't valid JSON" : err.message, { error: true });
    }
  };

  const exportData = () => {
    const a = document.createElement('a');
    a.href = '/api/export';
    a.download = '';
    a.click();
  };

  const toggleSignup = async (allowSignup) => {
    try {
      const r = await api('/admin/settings', { method: 'PATCH', body: { allowSignup } });
      setState({ server: { ...getState().server, signupAllowed: r.signupAllowed } });
    } catch (err) {
      fail(err);
    }
  };

  const signOut = async () => {
    if (await confirmAlert({ title: 'Sign out?', message: 'Your wishlists stay safe on your server.', confirm: 'Sign Out', destructive: true })) logout();
  };

  return (
    <Page title="Settings">
      <div className="content">
        <div className="profile">
          <div className="avatar">{initials}</div>
          <h2>{user.name}</h2>
          <p>@{user.username}{user.isAdmin ? ' · Admin' : ''}</p>
        </div>

        <Group>
          <Row icon="person" iconBg={c('graphite')} title="Account" subtitle="Name, password & devices" chevron onClick={() => nav.push(<AccountScreen />)} />
        </Group>

        <Group header="Appearance">
          <Row icon="moon" iconBg={c('indigo')} title="Theme" />
          <div className="row">
            <div className="row-main">
              <Segmented
                value={s.theme}
                onChange={(theme) => set({ theme })}
                options={[
                  { value: 'system', label: 'Automatic' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </div>
          </div>
          <Row icon="palette" iconBg={c(s.accent)} title="Accent Colour" />
          <div className="swatches" style={{ paddingTop: 4 }}>
            {Object.keys(COLORS).map((k) => (
              <button key={k} className={`swatch ${k === s.accent ? 'on' : ''}`} style={{ '--c': c(k) }} onClick={() => set({ accent: k })} aria-label={k} />
            ))}
          </div>
        </Group>

        <Group header="Shopping" footer="List totals are always shown in your currency using daily exchange rates.">
          <Row icon="dollar" iconBg={c('green')} title="Currency" detail={s.currency} chevron onClick={() => nav.push(<CurrencyScreen />)} />
          <Row
            icon="ruler"
            iconBg={c('orange')}
            title="Units"
            right={
              <span style={{ flex: '0 0 180px' }}>
                <Segmented value={s.units} onChange={(units) => set({ units })} options={[{ value: 'imperial', label: 'Imperial' }, { value: 'metric', label: 'Metric' }]} />
              </span>
            }
          />
          <Row icon="globe" iconBg={c('teal')} title="Show Converted Prices" right={<Toggle checked={s.showConverted} onChange={(v) => set({ showConverted: v })} label="Show converted prices" />} />
        </Group>

        <Group
          header="Smart Features"
          footer={
            server.priceCheckHours
              ? `Prices are re-checked about every ${server.priceCheckHours} hours. A green badge appears when something gets cheaper.`
              : 'Background price checks are turned off on this server (PRICE_CHECK_HOURS=0).'
          }
        >
          <Row icon="sparkles" iconBg={c('purple')} title="Auto-Tagging" right={<Toggle checked={s.autoTag} onChange={(v) => set({ autoTag: v })} label="Auto-tagging" />} />
          <Row icon="tag" iconBg={c('pink')} title="Tag Rules" detail={s.tagRules?.length || ''} chevron onClick={() => nav.push(<TagRulesScreen />)} />
          <Row icon="chart" iconBg={c('green')} title="Track Price Drops" right={<Toggle checked={s.trackPrices} onChange={(v) => set({ trackPrices: v })} label="Track price drops" />} />
        </Group>

        <Group header="Add From Anywhere">
          <Row icon="bolt" iconBg={c('orange')} title="iPhone Shortcut, Bookmarklet & API" chevron onClick={() => nav.push(<IntegrationsScreen />)} />
        </Group>

        <Group header="Data">
          <Row icon="download" iconBg={c('blue')} title="Export Wishlists" onClick={exportData} />
          <Row icon="upload" iconBg={c('indigo')} title="Import from File" onClick={() => file.current.click()} />
          <input ref={file} type="file" accept="application/json,.json" className="hidden-input" onChange={importFile} />
        </Group>

        {user.isAdmin && (
          <Group header="Administration" footer="When sign-ups are off, only admins can create accounts.">
            <Row icon="people" iconBg={c('graphite')} title="Users" chevron onClick={() => nav.push(<UsersScreen />)} />
            <Row icon="lock" iconBg={c('red')} title="Allow Sign-ups" right={<Toggle checked={server.signupAllowed} onChange={toggleSignup} label="Allow sign-ups" />} />
          </Group>
        )}

        <Group header="About">
          <Row icon="server" iconBg={c('graphite')} title="Version" detail={server.version} />
          <Row icon="safari" iconBg={c('cyan')} title="Headless Browser" detail={server.browser ? 'Connected' : 'Off'} />
          <Row icon="github" iconBg="#24292f" title="Source Code" chevron onClick={() => window.open(REPO, '_blank', 'noopener')} />
        </Group>

        <Group>
          <Row centered destructive title="Sign Out" onClick={signOut} />
        </Group>
      </div>
    </Page>
  );
}

/* ───────── Account ───────── */

function AccountScreen() {
  const user = useStore((s) => s.user);
  const [name, setName] = useState(user.name || '');
  const saveName = () => name.trim() && name.trim() !== user.name && updateProfile(name.trim()).then(() => toast('Name updated')).catch(fail);

  const signOutOthers = async () => {
    if (!(await confirmAlert({ title: 'Sign out other devices?', message: 'Every other phone and browser will need to sign in again. API tokens keep working.', confirm: 'Sign Out', destructive: true }))) return;
    const r = await api('/me/logout-others', { method: 'POST' }).catch(fail);
    if (r) toast(`Signed out ${plural(r.signedOut, 'device')}`);
  };

  return (
    <Page title="Account" large={false}>
      <div className="content">
        <Group header="Profile">
          <div className="row">
            <div className="row-main">
              <span className="row-label">Name</span>
              <input className="row-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === 'Enter' && e.target.blur()} />
            </div>
          </div>
          <Row title="Username" detail={`@${user.username}`} />
          <Row title="Member Since" detail={new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })} />
        </Group>
        <Group header="Security">
          <Row icon="key" iconBg="var(--accent)" title="Change Password" chevron onClick={() => presentSheet(({ close }) => <PasswordSheet close={close} />, { size: 'auto' })} />
          <Row icon="logout" iconBg="var(--red)" title="Sign Out Other Devices" onClick={signOutOthers} />
        </Group>
      </div>
    </Page>
  );
}

function PasswordSheet({ close }) {
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const ok = f.current && f.next.length >= 8 && f.next === f.confirm;
  const save = async () => {
    setBusy(true);
    try {
      await api('/me/password', { method: 'POST', body: { current: f.current, next: f.next } });
      toast('Password changed');
      close();
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  };
  const field = (k, placeholder, auto) => (
    <div className="row">
      <div className="row-main">
        <input className="row-input left" type="password" placeholder={placeholder} autoComplete={auto} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      </div>
    </div>
  );
  return (
    <>
      <SheetHeader
        left={<GlassButton icon="x" title="Cancel" onClick={() => close()} />}
        title="Change Password"
        right={<GlassButton icon="check" title="Save" prominent disabled={!ok || busy} onClick={save} />}
      />
      <div className="sheet-body">
        <Group>{field('current', 'Current password', 'current-password')}</Group>
        <Group footer={f.next && f.next.length < 8 ? 'At least 8 characters.' : f.confirm && f.next !== f.confirm ? "Passwords don't match." : 'Other devices will be signed out.'}>
          {field('next', 'New password', 'new-password')}
          {field('confirm', 'Confirm new password', 'new-password')}
        </Group>
      </div>
    </>
  );
}

/* ───────── Currency ───────── */

function CurrencyScreen() {
  const current = useStore((s) => s.user.settings.currency);
  const nav = useNav();
  const [q, setQ] = useState('');
  const all = CURRENCIES.map((code) => ({ code, name: currencyName(code) }));
  const shown = q ? all.filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(q.toLowerCase())) : all;
  return (
    <Page title="Currency" large={false}>
      <div className="content">
        <div className="toolbar" style={{ paddingTop: 4 }}>
          <SearchField value={q} onChange={setQ} placeholder="Search currencies" />
        </div>
        <Group footer="Prices stay in each store's currency. Totals and conversions use this one.">
          {shown.map((c) => (
            <Row
              key={c.code}
              title={c.name}
              subtitle={c.code}
              check={c.code === current}
              onClick={() => {
                set({ currency: c.code });
                nav.pop();
              }}
            />
          ))}
        </Group>
      </div>
    </Page>
  );
}

/* ───────── Tag rules ───────── */

function TagRulesScreen() {
  const rules = useStore((s) => s.user.settings.tagRules || []);
  const builtIn = useStore((s) => s.server.builtInTags || []);
  const [busy, setBusy] = useState(false);

  const edit = (index) => presentSheet(({ close }) => <RuleSheet rule={rules[index]} close={close} onSave={(rule) => {
    const next = [...rules];
    if (rule === null) next.splice(index, 1);
    else if (index == null) next.push(rule);
    else next[index] = rule;
    set({ tagRules: next });
  }} />, { size: 'auto' });

  const retag = async () => {
    if (!(await confirmAlert({ title: 'Re-tag all items?', message: 'Automatic tags are recalculated. Tags you added yourself are kept.', confirm: 'Re-tag' }))) return;
    setBusy(true);
    try {
      const r = await retagAll();
      toast(`Re-tagged ${plural(r.count, 'item')}`);
    } catch (err) {
      fail(err);
    }
    setBusy(false);
  };

  return (
    <Page title="Tag Rules" large={false}>
      <div className="content">
        <p className="group-footer" style={{ padding: '4px 36px 18px', fontSize: 15 }}>
          Your own rules run alongside the built-in categories. If a product's name, brand or store contains a keyword, it gets the tag.
        </p>
        <Group header="Your Rules">
          {rules.map((r, i) => (
            <Row key={i} icon="tagFill" iconBg="var(--accent)" title={r.tag} subtitle={r.keywords || 'No keywords'} chevron onClick={() => edit(i)} />
          ))}
          <Row action icon="plus" iconBg="var(--green)" title="Add Rule" onClick={() => edit(null)} />
        </Group>
        <Group>
          <Row action centered title={busy ? 'Re-tagging…' : 'Re-tag All Items'} onClick={busy ? undefined : retag} right={busy ? <Spinner /> : null} />
        </Group>
        <Group header="Built-in Categories" footer="Detected automatically from the product name, store and page categories.">
          <div className="tag-editor">
            {builtIn.map((t) => (
              <span key={t} className="chip small">{t}</span>
            ))}
          </div>
        </Group>
      </div>
    </Page>
  );
}

function RuleSheet({ rule, close, onSave }) {
  const [tag, setTag] = useState(rule?.tag || '');
  const [keywords, setKeywords] = useState(rule?.keywords || '');
  return (
    <>
      <SheetHeader
        left={<GlassButton icon="x" title="Cancel" onClick={() => close()} />}
        title={rule ? 'Edit Rule' : 'New Rule'}
        right={<GlassButton icon="check" title="Save" prominent disabled={!tag.trim() || !keywords.trim()} onClick={() => (onSave({ tag: tag.trim(), keywords: keywords.trim() }), close())} />}
      />
      <div className="sheet-body">
        <Group>
          <div className="row">
            <div className="row-main">
              <span className="row-label">Tag</span>
              <input className="row-input" placeholder="e.g. Birthday" value={tag} onChange={(e) => setTag(e.target.value)} autoFocus />
            </div>
          </div>
        </Group>
        <Group header="Keywords" footer="Separate keywords with commas, e.g. “lego, puzzle, board game”.">
          <div className="row">
            <div className="row-main">
              <textarea className="row-input" placeholder="keyword, another keyword" value={keywords} onChange={(e) => setKeywords(e.target.value)} />
            </div>
          </div>
        </Group>
        {rule && (
          <Group>
            <Row centered destructive title="Delete Rule" onClick={() => (onSave(null), close())} />
          </Group>
        )}
      </div>
    </>
  );
}

/* ───────── Integrations ───────── */

function IntegrationsScreen() {
  const lists = useStore((s) => s.lists);
  const [tokens, setTokens] = useState(null);
  const bookmark = useRef(null);
  const origin = location.origin;
  const bookmarklet = `javascript:(function(){window.open('${origin}/add?url='+encodeURIComponent(location.href),'_blank')})()`;

  const load = () => api('/tokens').then((r) => setTokens(r.tokens)).catch(fail);
  useEffect(() => {
    load();
  }, []);
  // React refuses javascript: URLs in JSX, so set the bookmarklet href directly.
  useEffect(() => {
    bookmark.current?.setAttribute('href', bookmarklet);
  }, [bookmarklet]);

  const create = async () => {
    const name = await promptAlert({ title: 'New API Token', message: 'Give it a name so you remember where it’s used.', value: 'iPhone Shortcut', confirm: 'Create' });
    if (!name) return;
    try {
      const { token } = await api('/tokens', { method: 'POST', body: { name } });
      load();
      presentSheet(({ close }) => (
        <>
          <SheetHeader title="Your Token" right={<GlassButton icon="check" title="Done" prominent onClick={() => close()} />} />
          <div className="sheet-body">
            <div className="notice info">
              <Icon name="info" size={20} />
              <div>Copy this now — for your security it won't be shown again.</div>
            </div>
            <div className="code">{token}</div>
            <div style={{ padding: '0 16px' }}>
              <button className="btn block" onClick={() => navigator.clipboard?.writeText(token).then(() => toast('Token copied'))}>
                <Icon name="copy" size={20} /> Copy Token
              </button>
            </div>
          </div>
        </>
      ), { size: 'auto' });
    } catch (err) {
      fail(err);
    }
  };

  const revoke = async (t) => {
    if (!(await confirmAlert({ title: `Revoke “${t.name}”?`, message: 'Anything using this token will stop working.', confirm: 'Revoke', destructive: true }))) return;
    await api(`/tokens/${t.id}`, { method: 'DELETE' }).catch(fail);
    load();
  };

  const copy = (text, what = 'Copied') => navigator.clipboard?.writeText(text).then(() => toast(what));

  return (
    <Page title="Add From Anywhere" large={false}>
      <div className="content">
        <Group header="API Tokens" footer="Tokens let Shortcuts and scripts add items without your password.">
          {tokens === null && <Row title="Loading…" right={<Spinner />} />}
          {tokens?.map((t) => (
            <Row key={t.id} icon="key" iconBg="var(--orange)" title={t.name} subtitle={`Created ${timeAgo(t.createdAt)}${t.lastUsedAt ? ` · Used ${timeAgo(t.lastUsedAt)}` : ''}`} onClick={() => revoke(t)} />
          ))}
          <Row action icon="plus" iconBg="var(--green)" title="Create Token" onClick={create} />
        </Group>

        <Group header="iPhone & iPad Share Sheet">
          <ol className="steps">
            <li>Create a token above and copy it.</li>
            <li>Open the <b>Shortcuts</b> app → <b>+</b>. Name it <b>Add to Wishlist</b>.</li>
            <li>Tap the <b>ⓘ</b> button and turn on <b>Show in Share Sheet</b>. Set it to receive <b>URLs</b> and <b>Safari web pages</b>.</li>
            <li>
              Add <b>Get Contents of URL</b>. Set the URL to the address below, <b>Method</b> to POST, add a <b>Header</b> named
              <b> Authorization</b> with value <b>Bearer YOUR_TOKEN</b>, and set <b>Request Body</b> to JSON with a text field
              <b> url</b> = <b>Shortcut Input</b>.
            </li>
            <li>
              <i>Optional, for stores that block servers:</i> before that step, add <b>Run JavaScript on Web Page</b> with
              <b> completion(document.documentElement.outerHTML)</b>, then add a second JSON field <b>html</b> = <b>JavaScript Result</b>.
              The page is read from your phone instead.
            </li>
            <li>Add <b>Show Notification</b> “Added to Wishlist”.</li>
          </ol>
          <div className="code" onClick={() => copy(`${origin}/api/items`, 'Address copied')}>{origin}/api/items</div>
        </Group>

        <Group header="Computer Bookmarklet" footer="Drag the button to your bookmarks bar. Click it on any product page to add it.">
          <div style={{ padding: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a ref={bookmark} className="btn small" onClick={(e) => e.preventDefault()} title="Drag me to your bookmarks bar">
              <Icon name="plus" size={18} /> Add to Wishlist
            </a>
            <button className="btn small tinted" onClick={() => copy(bookmarklet, 'Bookmarklet copied')}>
              <Icon name="copy" size={18} /> Copy Code
            </button>
          </div>
        </Group>

        <Group header="Android" footer="Install the app from Chrome's menu (Add to Home screen). “Wishlist” then appears in the share sheet.">
          <Row icon="share" iconBg="var(--green)" title="Share → Wishlist" />
        </Group>

        <Group header="List IDs" footer="Add “listId” to the JSON body to choose a list. Otherwise items go to your first list. Tap to copy.">
          {lists.map((l) => (
            <Row key={l.id} emoji={l.emoji} round iconBg="var(--fill-2)" title={l.name} detail={l.id} onClick={() => copy(l.id, 'List ID copied')} />
          ))}
        </Group>

        <Group header="API Example">
          <div className="code" style={{ userSelect: 'text' }}>
            curl -X POST {origin}/api/items \<br />
            &nbsp;&nbsp;-H "Authorization: Bearer YOUR_TOKEN" \<br />
            &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
            &nbsp;&nbsp;-d '{`{"url":"https://…"}`}'
          </div>
        </Group>
      </div>
    </Page>
  );
}

/* ───────── Users (admin) ───────── */

function UsersScreen() {
  const me = useStore((s) => s.user);
  const [users, setUsers] = useState(null);
  const load = () => api('/admin/users').then((r) => setUsers(r.users)).catch(fail);
  useEffect(() => {
    load();
  }, []);

  const manage = (u) =>
    actionSheet({
      title: u.name,
      message: `@${u.username}`,
      actions: [
        u.id !== me.id && {
          label: u.isAdmin ? 'Remove Admin' : 'Make Admin',
          onSelect: () => api(`/admin/users/${u.id}`, { method: 'PATCH', body: { isAdmin: !u.isAdmin } }).then(load).catch(fail),
        },
        {
          label: 'Reset Password',
          onSelect: async () => {
            const password = await promptAlert({ title: 'New Password', message: `Set a new password for ${u.name}. They'll be signed out everywhere.`, inputType: 'password', placeholder: '8+ characters', confirm: 'Set' });
            if (password) api(`/admin/users/${u.id}`, { method: 'PATCH', body: { password } }).then(() => toast('Password reset')).catch(fail);
          },
        },
        u.id !== me.id && {
          label: 'Delete User',
          destructive: true,
          onSelect: async () => {
            if (await confirmAlert({ title: `Delete ${u.name}?`, message: `Their ${plural(u.itemCount, 'item')} and lists will be permanently deleted.`, confirm: 'Delete', destructive: true })) {
              api(`/admin/users/${u.id}`, { method: 'DELETE' }).then(load).catch(fail);
            }
          },
        },
      ],
    });

  return (
    <Page title="Users" large={false}>
      <div className="content">
        <Group footer="Everyone gets their own private lists. Use Share List to show a list to someone.">
          {users === null && <Row title="Loading…" right={<Spinner />} />}
          {users?.map((u) => (
            <Row key={u.id} onClick={() => manage(u)} chevron>
              <div className="avatar small" style={{ marginRight: 12 }}>{(u.name || u.username)[0].toUpperCase()}</div>
              <div className="row-text">
                <div className="row-title">{u.name}{u.id === me.id ? ' (You)' : ''}</div>
                <div className="row-subtitle">@{u.username} · {plural(u.itemCount, 'item')}{u.isAdmin ? ' · Admin' : ''}</div>
              </div>
            </Row>
          ))}
          <Row action icon="plus" iconBg="var(--green)" title="Add User" onClick={() => presentSheet(({ close }) => <NewUserSheet close={close} onDone={load} />, { size: 'auto' })} />
        </Group>
      </div>
    </Page>
  );
}

function NewUserSheet({ close, onDone }) {
  const [f, setF] = useState({ name: '', username: '', password: '', isAdmin: false });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api('/admin/users', { method: 'POST', body: f });
      toast(`${f.name || f.username} can now sign in`);
      onDone();
      close();
    } catch (err) {
      fail(err);
      setBusy(false);
    }
  };
  const input = (k, placeholder, extra = {}) => (
    <div className="row">
      <div className="row-main">
        <input className="row-input left" placeholder={placeholder} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} />
      </div>
    </div>
  );
  return (
    <>
      <SheetHeader
        left={<GlassButton icon="x" title="Cancel" onClick={() => close()} />}
        title="Add User"
        right={<GlassButton icon="check" title="Create" prominent disabled={busy || !f.username || f.password.length < 8} onClick={save} />}
      />
      <div className="sheet-body">
        <Group footer="Share the username and password with them. They can change the password later.">
          {input('name', 'Name')}
          {input('username', 'Username', { autoCapitalize: 'none', autoCorrect: 'off' })}
          {input('password', 'Password (8+ characters)', { type: 'password', autoComplete: 'new-password' })}
        </Group>
        <Group>
          <Row title="Admin" right={<Toggle checked={f.isAdmin} onChange={(isAdmin) => setF({ ...f, isAdmin })} label="Admin" />} />
        </Group>
      </div>
    </>
  );
}
