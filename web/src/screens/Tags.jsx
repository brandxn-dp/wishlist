import { useCallback, useMemo, useState } from 'react';
import { useStore, renameTag, deleteTag } from '../store.js';
import { Page, Group, Row, SearchField, Empty, useNav, useLongPress, contextMenu, promptAlert, confirmAlert, toast } from '../ui.jsx';
import { Icon } from '../icons.jsx';
import { tagColor, plural } from '../format.js';
import ListDetail from './ListDetail.jsx';

export default function TagsScreen() {
  const items = useStore((s) => s.items);
  const [query, setQuery] = useState('');

  const tags = useMemo(() => {
    const m = new Map();
    for (const it of items) {
      for (const t of it.tags) {
        const key = t.name.toLowerCase();
        const e = m.get(key) || { name: t.name, count: 0, auto: 0 };
        e.count++;
        if (t.auto) e.auto++;
        m.set(key, e);
      }
    }
    return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [items]);

  const q = query.trim().toLowerCase();
  const shown = q ? tags.filter((t) => t.name.toLowerCase().includes(q)) : tags;
  const untagged = items.filter((i) => !i.tags.length).length;

  return (
    <Page title="Tags">
      <div className="content">
        {tags.length > 0 ? (
          <>
            <div className="toolbar">
              <SearchField value={query} onChange={setQuery} placeholder="Search tags" />
            </div>
            <Group
              footer={`New items are tagged automatically based on what they are.${untagged ? ` ${plural(untagged, 'item')} ha${untagged === 1 ? 's' : 've'} no tags.` : ''} Touch and hold a tag to rename it.`}
            >
              {shown.map((t) => (
                <TagRow key={t.name} tag={t} />
              ))}
              {!shown.length && <Row title="No matching tags" />}
            </Group>
          </>
        ) : (
          <Empty icon="tag" title="No tags yet" text="Tags appear as you add items — they're assigned automatically, like Electronics, Shoes or Home." />
        )}
      </div>
    </Page>
  );
}

function TagRow({ tag }) {
  const nav = useNav();
  const onLong = useCallback(() => {
    contextMenu({
      preview: (
        <>
          <div className="row-icon" style={{ background: tagColor(tag.name), margin: 0, width: 44, height: 44, borderRadius: 12 }}>
            <Icon name="tagFill" size={22} />
          </div>
          <div className="ctx-preview-text">
            <div>{tag.name}</div>
            <div>{plural(tag.count, 'item')}</div>
          </div>
        </>
      ),
      actions: [
        {
          label: 'Rename',
          icon: 'pencil',
          onSelect: async () => {
            const to = await promptAlert({ title: 'Rename Tag', value: tag.name, confirm: 'Rename' });
            if (to && to !== tag.name) renameTag(tag.name, to).catch((err) => toast(err.message, { error: true }));
          },
        },
        {
          label: 'Delete Tag',
          icon: 'trash',
          destructive: true,
          onSelect: async () => {
            const ok = await confirmAlert({ title: `Delete “${tag.name}”?`, message: 'The tag is removed from all items. The items stay.', confirm: 'Delete', destructive: true });
            if (ok) deleteTag(tag.name).catch((err) => toast(err.message, { error: true }));
          },
        },
      ],
    });
  }, [tag]);
  const press = useLongPress(onLong);
  return (
    <Row
      {...press}
      icon="tagFill"
      iconBg={tagColor(tag.name)}
      title={tag.name}
      subtitle={tag.auto === tag.count ? 'Auto-tagged' : tag.auto ? `${tag.auto} auto-tagged` : undefined}
      detail={tag.count}
      chevron
      onClick={() => nav.push(<ListDetail tag={tag.name} />)}
    />
  );
}
