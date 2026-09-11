import { useState } from 'react';
import { createList, deleteList, shareList, updateList, reorderLists, getState, useStore } from '../store.js';
import { COLORS, colorOf, useDark } from '../theme.js';
import { Group, Row, Toggle, SheetHeader, GlassButton, presentSheet, confirmAlert, toast } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { plural } from '../format.js';

const EMOJIS = [
  '🎁', '🛍️', '🛒', '❤️', '⭐️', '🎄', '🎂', '🎉', '💍', '💎', '👗', '👟', '👜', '🧥', '👕', '👖', '🕶️', '⌚️', '💄', '🧴',
  '💻', '📱', '🎧', '📷', '🎮', '📚', '🏠', '🛋️', '🪴', '🍳', '☕️', '🍷', '🧸', '👶', '🐶', '🐱', '⚽️', '🚲', '🏕️', '✈️',
  '🧳', '🚗', '🔧', '🎨', '🎸', '💡', '🌸', '🦄', '🏋️', '🎿', '🏄', '⛳️',
];

export const openListEditor = (list) => presentSheet(({ close }) => <ListEditor list={list} close={close} />);

function ListEditor({ list, close }) {
  const dark = useDark();
  const [name, setName] = useState(list?.name || '');
  const [emoji, setEmoji] = useState(list?.emoji || '🎁');
  const [color, setColor] = useState(list?.color || 'blue');
  const [busy, setBusy] = useState(false);
  const c = colorOf(color, dark);

  const save = async () => {
    setBusy(true);
    try {
      const data = { name: name.trim(), emoji, color };
      close(list ? await updateList(list.id, data) : await createList(data));
    } catch (err) {
      toast(err.message, { error: true });
      setBusy(false);
    }
  };

  return (
    <>
      <SheetHeader
        left={<GlassButton icon="x" title="Cancel" onClick={() => close()} />}
        title={list ? 'Edit List' : 'New List'}
        right={<GlassButton icon="check" title="Done" prominent disabled={!name.trim() || busy} onClick={save} />}
      />
      <div className="sheet-body">
        <div className="list-preview" style={{ '--c': c }}>
          <div className="list-preview-icon">{emoji}</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="List Name"
            autoFocus={!list}
            maxLength={80}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && save()}
          />
        </div>
        <Group>
          <div className="swatches">
            {Object.keys(COLORS).map((k) => (
              <button key={k} className={`swatch ${k === color ? 'on' : ''}`} style={{ '--c': colorOf(k, dark) }} onClick={() => setColor(k)} aria-label={k} />
            ))}
          </div>
        </Group>
        <Group>
          <div className="emoji-grid">
            {EMOJIS.map((e) => (
              <button key={e} className={e === emoji ? 'on' : ''} onClick={() => setEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
        </Group>
      </div>
    </>
  );
}

export const openShareSheet = (listId) => presentSheet(({ close }) => <ShareSheet listId={listId} close={close} />, { size: 'auto' });

function ShareSheet({ listId, close }) {
  const list = useStore((s) => s.lists.find((l) => l.id === listId));
  const [busy, setBusy] = useState(false);
  if (!list) return null;
  const url = list.shareToken ? `${location.origin}/s/${list.shareToken}` : null;

  const toggle = async (on) => {
    setBusy(true);
    try {
      await shareList(list.id, on);
    } catch (err) {
      toast(err.message, { error: true });
    }
    setBusy(false);
  };
  const copy = async () => {
    await navigator.clipboard?.writeText(url);
    toast('Link copied');
  };
  const share = () => navigator.share?.({ title: list.name, text: `My wishlist: ${list.name}`, url }).catch(() => {});

  return (
    <>
      <SheetHeader title="Share List" right={<GlassButton icon="x" title="Close" onClick={() => close()} />} />
      <div className="sheet-body">
        <Group footer="Anyone with the link can see this list and its prices — read-only. Your notes stay private.">
          <Row icon="link" iconBg="var(--accent)" title="Public Link" right={<Toggle checked={!!url} onChange={toggle} label="Public link" />} />
        </Group>
        {url && !busy && (
          <>
            <div className="code">{url}</div>
            <div style={{ display: 'flex', gap: 10, padding: '0 16px' }}>
              <button className="btn tinted" style={{ flex: 1 }} onClick={copy}>
                <Icon name="copy" size={20} /> Copy
              </button>
              {navigator.share && (
                <button className="btn" style={{ flex: 1 }} onClick={share}>
                  <Icon name="share" size={20} /> Share
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export async function confirmDeleteList(list, onDeleted) {
  const count = getState().items.filter((i) => i.listId === list.id).length;
  const ok = await confirmAlert({
    title: `Delete “${list.name}”?`,
    message: count ? `This will also delete ${plural(count, 'item')} in this list.` : 'This list is empty.',
    confirm: 'Delete',
    destructive: true,
  });
  if (!ok) return;
  onDeleted?.();
  try {
    await deleteList(list.id);
  } catch (err) {
    toast(err.message, { error: true });
  }
}

export const openReorderSheet = () => presentSheet(({ close }) => <ReorderSheet close={close} />);

function ReorderSheet({ close }) {
  const lists = useStore((s) => s.lists);
  const dark = useDark();
  const [order, setOrder] = useState(lists.map((l) => l.id));
  const move = (i, d) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOrder(next);
  };
  const save = async () => {
    close();
    await reorderLists(order).catch((err) => toast(err.message, { error: true }));
  };
  return (
    <>
      <SheetHeader
        left={<GlassButton icon="x" title="Cancel" onClick={() => close()} />}
        title="Reorder Lists"
        right={<GlassButton icon="check" title="Done" prominent onClick={save} />}
      />
      <div className="sheet-body">
        <Group>
          {order.map((id, i) => {
            const l = lists.find((x) => x.id === id);
            if (!l) return null;
            return (
              <Row
                key={id}
                emoji={l.emoji}
                round
                iconBg={colorOf(l.color, dark)}
                title={l.name}
                right={
                  <span style={{ display: 'flex', gap: 6 }}>
                    <GlassButton icon="arrowUp" title="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="small" />
                    <GlassButton icon="arrowDown" title="Move down" disabled={i === order.length - 1} onClick={() => move(i, 1)} />
                  </span>
                }
              />
            );
          })}
        </Group>
      </div>
    </>
  );
}
