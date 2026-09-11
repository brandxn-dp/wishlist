import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
} from 'react';
import { Icon } from './icons.jsx';

/* ═════════════════════════ Navigation stack ═════════════════════════ */

const NavCtx = createContext({ depth: 0, push() {}, pop() {}, popToRoot() {}, isTop: true });
export const useNav = () => useContext(NavCtx);

let pageSeq = 0;
const TRANSITION = 500;

export function Stack({ root, onReady }) {
  const [pages, setPages] = useState([{ key: 'root', el: root, phase: 'active' }]);
  const nodes = useRef(new Map());

  const push = useCallback((el) => {
    const key = `p${++pageSeq}`;
    setPages((ps) => [...ps.map((p) => ({ ...p, phase: 'covered' })), { key, el, phase: 'entering' }]);
    requestAnimationFrame(() => requestAnimationFrame(() =>
      setPages((ps) => ps.map((p) => (p.key === key ? { ...p, phase: 'active' } : p)))));
  }, []);

  const pop = useCallback(() => {
    setPages((ps) => {
      if (ps.length < 2) return ps;
      const top = ps[ps.length - 1];
      setTimeout(() => setPages((cur) => cur.filter((p) => p.key !== top.key)), TRANSITION);
      return ps.map((p, i) => (i === ps.length - 1 ? { ...p, phase: 'leaving' } : i === ps.length - 2 ? { ...p, phase: 'active' } : p));
    });
  }, []);

  const popToRoot = useCallback(() => {
    setPages((ps) => {
      if (ps.length < 2) return ps;
      const top = ps[ps.length - 1];
      setTimeout(() => setPages((cur) => cur.filter((p, i) => i === 0)), TRANSITION);
      return ps.filter((p, i) => i === 0 || p === top).map((p, i) => ({ ...p, phase: i === 0 ? 'active' : 'leaving' }));
    });
  }, []);

  useEffect(() => onReady?.({ push, pop, popToRoot }), [onReady, push, pop, popToRoot]);

  // Interactive swipe-from-left-edge to go back.
  const drag = useRef(null);
  const onEdgeDown = (e) => {
    if (pages.length < 2) return;
    const top = nodes.current.get(pages[pages.length - 1].key);
    const below = nodes.current.get(pages[pages.length - 2].key);
    if (!top || !below) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, t0: performance.now(), top, below, w: top.offsetWidth, dx: 0 };
    top.classList.add('is-dragging');
    below.classList.add('is-dragging');
  };
  const onEdgeMove = (e) => {
    const d = drag.current;
    if (!d) return;
    d.dx = Math.max(0, e.clientX - d.x0);
    const p = Math.min(1, d.dx / d.w);
    d.top.style.transform = `translateX(${d.dx}px)`;
    d.below.style.transform = `translateX(${-28 * (1 - p)}%)`;
    d.below.style.filter = `brightness(${0.92 + 0.08 * p})`;
  };
  const onEdgeUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    const velocity = d.dx / (performance.now() - d.t0);
    for (const el of [d.top, d.below]) {
      el.classList.remove('is-dragging');
      el.style.transform = '';
      el.style.filter = '';
    }
    if (d.dx > d.w * 0.33 || (velocity > 0.5 && d.dx > 30)) pop();
  };

  return (
    <div className="stack">
      {pages.map((p, i) => {
        const isTop = i === pages.length - 1 || (i === pages.length - 2 && pages[pages.length - 1].phase === 'leaving');
        return (
          <div
            key={p.key}
            ref={(n) => (n ? nodes.current.set(p.key, n) : nodes.current.delete(p.key))}
            className={`page ${p.phase !== 'active' ? `is-${p.phase}` : ''}`}
            aria-hidden={p.phase === 'covered' || undefined}
          >
            <NavCtx.Provider value={{ depth: i, push, pop, popToRoot, isTop }}>{p.el}</NavCtx.Provider>
            {i > 0 && i === pages.length - 1 && (
              <div className="edge-swipe" onPointerDown={onEdgeDown} onPointerMove={onEdgeMove} onPointerUp={onEdgeUp} onPointerCancel={onEdgeUp} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ═════════════════════════ Page chrome ═════════════════════════ */

export function Page({ title, titleNode, large = true, left, right, children, subtitle, noTabbar, scrollRef }) {
  const nav = useNav();
  const [scrolled, setScrolled] = useState(false);
  const onScroll = (e) => {
    const y = e.currentTarget.scrollTop;
    const s = large ? y > 42 : y > 2;
    if (s !== scrolled) setScrolled(s);
  };
  return (
    <>
      <div className={`navbar ${large ? '' : 'inline'} ${scrolled ? 'scrolled' : ''}`}>
        <div className="navbar-side">
          {nav.depth > 0 && (
            <button className="glass-btn icon" onClick={nav.pop} aria-label="Back">
              <Icon name="chevronLeft" weight={2.4} />
            </button>
          )}
          {left}
        </div>
        <div className="navbar-title">{title}</div>
        <div className="navbar-side right">{right}</div>
      </div>
      <div className={`page-scroll ${noTabbar ? 'no-tabbar' : ''}`} onScroll={onScroll} ref={scrollRef}>
        {large ? <h1 className="large-title">{titleNode ?? title}</h1> : <div className="inline-spacer" />}
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
        {children}
      </div>
    </>
  );
}

export function GlassButton({ icon, label, onClick, accent, prominent, disabled, title, className = '', ...rest }) {
  return (
    <button
      className={`glass-btn ${icon && !label ? 'icon' : ''} ${accent ? 'accent' : ''} ${prominent ? 'prominent' : ''} ${className}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={title || label}
      title={title}
      {...rest}
    >
      {icon && <Icon name={icon} weight={2.2} />}
      {label}
    </button>
  );
}

/* ═════════════════════════ Lists ═════════════════════════ */

export function Group({ header, footer, children, subtle, action, className = '' }) {
  return (
    <section className={`group ${className}`}>
      {header && (
        <div className={`group-header ${subtle ? 'subtle' : ''}`}>
          <span>{header}</span>
          {action}
        </div>
      )}
      <div className="group-body">{children}</div>
      {footer && <div className="group-footer">{footer}</div>}
    </section>
  );
}

export function Row({
  icon, iconBg, emoji, round, title, subtitle, detail, strong, chevron, onClick, destructive, action, centered, children,
  right, check, className = '', ...rest
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className={`row ${destructive ? 'destructive' : ''} ${action ? 'action' : ''} ${centered ? 'centered' : ''} ${className}`}
      onClick={onClick}
      type={onClick ? 'button' : undefined}
      {...rest}
    >
      {(icon || emoji) && (
        <div className={`row-icon ${round ? 'round' : ''}`} style={{ background: iconBg }}>
          {emoji || <Icon name={icon} size={18} weight={2.2} />}
        </div>
      )}
      <div className="row-main">
        {children ?? (
          <div className="row-text">
            <div className="row-title">{title}</div>
            {subtitle && <div className="row-subtitle">{subtitle}</div>}
          </div>
        )}
        {detail != null && detail !== '' && <div className={`row-detail ${strong ? 'strong' : ''}`}>{detail}</div>}
        {right}
        {check && <Icon name="check" size={20} weight={2.6} className="row-check" />}
        {chevron && <Icon name="chevronRight" size={15} weight={2.8} className="row-chevron" />}
      </div>
    </Tag>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="switch" onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" role="switch" aria-label={label} checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function Segmented({ options, value, onChange }) {
  const ref = useRef(null);
  const [thumb, setThumb] = useState(null);
  const measure = useCallback(() => {
    const el = ref.current?.querySelector(`[data-v="${CSS.escape(String(value))}"]`);
    if (el) setThumb({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value]);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [measure, options.length]);
  return (
    <div className="segmented" ref={ref} role="tablist">
      {thumb && <div className="seg-thumb" style={thumb} />}
      {options.map((o) => (
        <button key={o.value} data-v={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder = 'Search' }) {
  return (
    <label className="search">
      <Icon name="search" size={18} weight={2.4} />
      <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} enterKeyHint="search" />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear">
          <Icon name="xCircle" size={18} />
        </button>
      )}
    </label>
  );
}

export function Spinner({ large }) {
  return (
    <span className={`spinner ${large ? 'large' : ''}`} role="progressbar" aria-label="Loading">
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} style={{ transform: `rotate(${i * 45}deg)`, animationDelay: `${-0.8 + i * 0.1}s` }} />
      ))}
    </span>
  );
}

export function ProductImage({ src, fallback }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return <div className="img-placeholder">{(fallback || '?').trim().charAt(0).toUpperCase()}</div>;
  return <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} style={{ pointerEvents: 'none' }} />;
}

export function Empty({ icon = 'bag', title, text, children }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} size={40} weight={1.8} />
      </div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

/** Long-press (touch) or right-click (desktop) → callback, while normal taps still click. */
export function useLongPress(onLong, delay = 450) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);
  const cancel = () => clearTimeout(timer.current);
  return useMemo(() => ({
    onPointerDown(e) {
      if (e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      const el = e.currentTarget;
      el.classList.add('pressing');
      timer.current = setTimeout(() => {
        fired.current = true;
        el.classList.remove('pressing');
        navigator.vibrate?.(8);
        onLong(el);
      }, delay);
    },
    onPointerMove(e) {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) {
        cancel();
        e.currentTarget.classList.remove('pressing');
      }
    },
    onPointerUp(e) {
      cancel();
      e.currentTarget.classList.remove('pressing');
    },
    onPointerCancel(e) {
      cancel();
      e.currentTarget.classList.remove('pressing');
    },
    onContextMenu(e) {
      e.preventDefault();
      cancel();
      if (!fired.current) onLong(e.currentTarget);
      fired.current = true;
    },
    onClickCapture(e) {
      if (fired.current) {
        e.stopPropagation();
        e.preventDefault();
        fired.current = false;
      }
    },
  }), [onLong, delay]);
}

/* ═════════════════════════ Overlays (sheets, alerts, menus) ═════════════════════════ */

let overlays = [];
let overlaySeq = 0;
const overlayListeners = new Set();
const setOverlays = (fn) => {
  overlays = fn(overlays);
  overlayListeners.forEach((l) => l());
};
const subscribeOverlays = (l) => (overlayListeners.add(l), () => overlayListeners.delete(l));

function present(type, props) {
  return new Promise((resolve) => {
    const id = ++overlaySeq;
    setOverlays((o) => [...o, { id, type, props, resolve }]);
  });
}

export const presentSheet = (render, opts = {}) => present('sheet', { render, ...opts });
export const confirmAlert = (props) => present('alert', { kind: 'confirm', ...props });
export const promptAlert = (props) => present('alert', { kind: 'prompt', ...props });
export const actionSheet = (props) => present('actions', props);
export const contextMenu = (props) => present('context', props);

export function OverlayHost() {
  const list = useSyncExternalStore(subscribeOverlays, () => overlays);
  const remove = (o, value) => {
    setOverlays((all) => all.filter((x) => x.id !== o.id));
    o.resolve(value);
  };
  useEffect(() => {
    document.body.dataset.overlay = list.length ? '1' : '';
  }, [list.length]);
  return (
    <div className="overlay-root">
      {list.map((o) => {
        const C = { sheet: SheetOverlay, alert: AlertOverlay, actions: ActionSheetOverlay, context: ContextOverlay }[o.type];
        return <C key={o.id} {...o.props} isTop={o === list[list.length - 1]} onGone={(v) => remove(o, v)} />;
      })}
      <ToastHost />
    </div>
  );
}

function useShow(onGone, duration = 420) {
  const [show, setShow] = useState(false);
  const closing = useRef(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    return () => cancelAnimationFrame(r);
  }, []);
  const close = useCallback((value) => {
    if (closing.current) return;
    closing.current = true;
    setShow(false);
    setTimeout(() => onGone(value), duration);
  }, [onGone, duration]);
  return [show, close];
}

function useEscape(isTop, fn) {
  useEffect(() => {
    if (!isTop) return;
    const h = (e) => e.key === 'Escape' && fn();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isTop, fn]);
}

const SheetCtx = createContext({ close() {}, dragHandlers: {} });
export const useSheet = () => useContext(SheetCtx);

function SheetOverlay({ render, size = 'tall', isTop, onGone, dismissable = true }) {
  const [show, close] = useShow(onGone, 480);
  const ref = useRef(null);
  const drag = useRef(null);
  useEscape(isTop, () => dismissable && close());

  const dragHandlers = useMemo(() => ({
    onPointerDown(e) {
      if (!dismissable || e.target.closest('button, input, textarea, select, a') || matchMedia('(min-width: 720px)').matches) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { y0: e.clientY, t0: performance.now(), dy: 0 };
      ref.current.classList.add('dragging');
    },
    onPointerMove(e) {
      const d = drag.current;
      if (!d) return;
      d.dy = e.clientY - d.y0;
      const dy = d.dy > 0 ? d.dy : -Math.sqrt(-d.dy) * 2;
      ref.current.style.transform = `translateY(${dy}px)`;
    },
    onPointerUp() {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      ref.current.classList.remove('dragging');
      ref.current.style.transform = '';
      const v = d.dy / (performance.now() - d.t0);
      if (d.dy > 140 || (v > 0.6 && d.dy > 40)) close();
    },
  }), [close, dismissable]);
  dragHandlers.onPointerCancel = dragHandlers.onPointerUp;

  return (
    <>
      <div className={`backdrop ${show ? 'show' : ''}`} onClick={() => dismissable && close()} />
      <div ref={ref} className={`sheet ${size} ${show ? 'show' : ''}`} role="dialog" aria-modal="true">
        <div className="sheet-grabber" />
        <SheetCtx.Provider value={{ close, dragHandlers }}>{render({ close })}</SheetCtx.Provider>
      </div>
    </>
  );
}

export function SheetHeader({ left, title, right }) {
  const { dragHandlers } = useSheet();
  return (
    <div className="sheet-header" {...dragHandlers}>
      <div className="navbar-side">{left}</div>
      <div className="sheet-title">{title}</div>
      <div className="navbar-side right">{right}</div>
    </div>
  );
}

function AlertOverlay({ kind, title, message, confirm = 'OK', cancel = 'Cancel', destructive, placeholder, value = '', inputType = 'text', onGone, isTop }) {
  const [show, close] = useShow(onGone, 250);
  const [text, setText] = useState(value);
  const input = useRef(null);
  const done = (ok) => close(kind === 'prompt' ? (ok ? text.trim() : null) : ok);
  useEscape(isTop, () => done(false));
  useEffect(() => {
    if (kind === 'prompt') setTimeout(() => input.current?.focus(), 60);
  }, [kind]);
  return (
    <>
      <div className={`backdrop ${show ? 'show' : ''}`} />
      <div className="alert-wrap">
        <div className={`alert ${show ? 'show' : ''}`} role="alertdialog">
          {title && <h4>{title}</h4>}
          {message && <p>{message}</p>}
          {kind === 'prompt' && (
            <input
              ref={input}
              type={inputType}
              value={text}
              placeholder={placeholder}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && done(true)}
            />
          )}
          <div className="alert-actions">
            {cancel && <button onClick={() => done(false)}>{cancel}</button>}
            <button className={destructive ? 'destructive' : 'primary'} onClick={() => done(true)}>
              {confirm}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function ActionSheetOverlay({ title, message, actions, onGone, isTop }) {
  const [show, close] = useShow(onGone, 420);
  useEscape(isTop, () => close());
  const pick = (a) => {
    close();
    setTimeout(() => a.onSelect?.(), 180);
  };
  return (
    <>
      <div className={`backdrop ${show ? 'show' : ''}`} onClick={() => close()} />
      <div className={`action-sheet ${show ? 'show' : ''}`} role="menu">
        <div className="action-group">
          {(title || message) && (
            <div className="action-head">
              {title && <strong>{title}</strong>}
              {message}
            </div>
          )}
          {actions.filter(Boolean).map((a) => (
            <button key={a.label} className={`action-btn ${a.destructive ? 'destructive' : ''} ${a.checked ? 'checked' : ''}`} onClick={() => pick(a)}>
              {a.label}
            </button>
          ))}
        </div>
        <div className="action-group">
          <button className="action-btn cancel" onClick={() => close()}>Cancel</button>
        </div>
      </div>
    </>
  );
}

function ContextOverlay({ preview, actions, onGone, isTop }) {
  const [show, close] = useShow(onGone, 300);
  useEscape(isTop, () => close());
  const pick = (a) => {
    close();
    setTimeout(() => a.onSelect?.(), 120);
  };
  return (
    <>
      <div className={`ctx-backdrop ${show ? 'show' : ''}`} onClick={() => close()} onContextMenu={(e) => (e.preventDefault(), close())} />
      <div className="alert-wrap" style={{ pointerEvents: 'none' }}>
        <div className={`ctx ${show ? 'show' : ''}`} style={{ pointerEvents: 'auto', position: 'relative' }} role="menu">
          {preview && <div className="ctx-preview">{preview}</div>}
          <div className="ctx-menu">
            {actions.filter(Boolean).map((a) => (
              <button key={a.label} className={`ctx-item ${a.destructive ? 'destructive' : ''} ${a.gap ? 'gap' : ''}`} onClick={() => pick(a)}>
                <span>{a.label}</span>
                {a.icon && <Icon name={a.icon} size={20} />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/* ═════════════════════════ Toast ═════════════════════════ */

let toastState = null;
let toastTimer = null;
const toastListeners = new Set();
const setToast = (t) => {
  toastState = t;
  toastListeners.forEach((l) => l());
};

export function toast(text, { error = false, icon } = {}) {
  clearTimeout(toastTimer);
  setToast({ text, error, icon, id: Date.now(), show: true });
  toastTimer = setTimeout(() => setToast({ ...toastState, show: false }), error ? 3600 : 2200);
}

function ToastHost() {
  const t = useSyncExternalStore((l) => (toastListeners.add(l), () => toastListeners.delete(l)), () => toastState);
  if (!t) return null;
  return (
    <div className={`toast ${t.show ? 'show' : ''} ${t.error ? 'error' : ''}`} role="status" aria-live="polite">
      <span className="toast-icon">
        <Icon name={t.icon || (t.error ? 'x' : 'check')} size={16} weight={3} />
      </span>
      <span>{t.text}</span>
    </div>
  );
}
