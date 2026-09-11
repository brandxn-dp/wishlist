// A small SF Symbols–style icon set (24×24, rounded strokes).
const P = (d) => <path d={d} />;

const gearTeeth = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4;
  const p = (r) => `${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
  return `M${p(7.2)}L${p(10)}`;
}).join('');

const ICONS = {
  plus: P('M12 5v14M5 12h14'),
  minus: P('M5 12h14'),
  chevronRight: P('M9.5 5.5 16 12l-6.5 6.5'),
  chevronLeft: P('M14.5 5.5 8 12l6.5 6.5'),
  chevronDown: P('M5.5 9.5 12 16l6.5-6.5'),
  ellipsis: (
    <g fill="currentColor" stroke="none">
      <circle cx="5.5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="18.5" cy="12" r="1.8" />
    </g>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      {P('m20 20-4.6-4.6')}
    </>
  ),
  tag: (
    <>
      {P('M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V4a1 1 0 0 1 1-1h9l7.6 7.6a2 2 0 0 1 0 2.8z')}
      <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  tagFill: (
    <g fill="currentColor" stroke="none">
      <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V4a1 1 0 0 1 1-1h9l7.6 7.6a2 2 0 0 1 0 2.8zM8 9.6A1.6 1.6 0 1 0 8 6.4a1.6 1.6 0 0 0 0 3.2z" fillRule="evenodd" />
    </g>
  ),
  list: (
    <>
      {P('M9 6h11M9 12h11M9 18h11')}
      <g fill="currentColor" stroke="none">
        <circle cx="4.5" cy="6" r="1.5" />
        <circle cx="4.5" cy="12" r="1.5" />
        <circle cx="4.5" cy="18" r="1.5" />
      </g>
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="6.6" />
      <circle cx="12" cy="12" r="2.6" />
      <path d={gearTeeth} strokeWidth="3" />
    </>
  ),
  share: P('M12 3v12M8 6.5 12 3l4 3.5M7 10H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-1'),
  trash: P('M4 6.5h16M10 11v6M14 11v6M6 6.5l.9 12.6A2 2 0 0 0 8.9 21h6.2a2 2 0 0 0 2-1.9L18 6.5M9 6.5V4.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4.5v2'),
  pencil: P('M4 20h4L19.3 8.7a2.8 2.8 0 0 0-4-4L4 16v4zM13.5 6.5l4 4'),
  refresh: P('M20 11.5A8 8 0 1 1 17.7 6M20 4v5.5h-5.5'),
  check: P('M5 12.5 9.5 17 19 7'),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" />
      <path d="m7.5 12.3 3 3 6-6.3" stroke="#fff" strokeWidth="2.2" />
    </>
  ),
  circle: <circle cx="12" cy="12" r="9.5" />,
  star: P('M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z'),
  starFill: <path d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="currentColor" />,
  link: P('M10 14a4.5 4.5 0 0 0 6.4 0l3-3A4.5 4.5 0 0 0 13 4.6l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1'),
  x: P('M6.5 6.5l11 11M17.5 6.5l-11 11'),
  xCircle: (
    <>
      <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="var(--bg, #fff)" strokeWidth="2" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="2" />
      <rect x="13" y="4" width="7" height="7" rx="2" />
      <rect x="4" y="13" width="7" height="7" rx="2" />
      <rect x="13" y="13" width="7" height="7" rx="2" />
    </>
  ),
  rows: (
    <>
      <rect x="3.5" y="4" width="5" height="5" rx="1.5" />
      <rect x="3.5" y="15" width="5" height="5" rx="1.5" />
      {P('M12 6.5h8.5M12 17.5h8.5')}
    </>
  ),
  arrowDown: P('M12 5v14M6.5 13.5 12 19l5.5-5.5'),
  arrowUp: P('M12 19V5M6.5 10.5 12 5l5.5 5.5'),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      {P('M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z')}
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10.5" rx="2.5" />
      {P('M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3')}
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="4" />
      {P('M4.5 20.5a7.5 7.5 0 0 1 15 0')}
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.5" r="3.5" />
      {P('M2.5 20a6.5 6.5 0 0 1 13 0M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.2a6.5 6.5 0 0 1 3.5 5.8')}
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4.5" />
      {P('M11.3 11.7 20 3M16.5 6.5l3 3M14.5 8.5l2 2')}
    </>
  ),
  download: P('M12 3.5v12M7 11l5 5 5-5M4.5 20.5h15'),
  upload: P('M12 16V4M7 8.5l5-5 5 5M4.5 20.5h15'),
  sparkles: (
    <>
      {P('M11 3.5 12.6 8a3 3 0 0 0 1.9 1.9l4.5 1.6-4.5 1.6a3 3 0 0 0-1.9 1.9L11 19.5 9.4 15a3 3 0 0 0-1.9-1.9L3 11.5 7.5 9.9A3 3 0 0 0 9.4 8z')}
      {P('M19 2.5v4M17 4.5h4M18.5 17v3M17 18.5h3')}
    </>
  ),
  palette: (
    <>
      {P('M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.8 1.7-1.6 0-1.1-.9-1.3-.9-2.3 0-.9.7-1.4 1.6-1.4H16a5 5 0 0 0 5-5C21 6.6 17 3 12 3z')}
      <g fill="currentColor" stroke="none">
        <circle cx="7.5" cy="11" r="1.3" />
        <circle cx="10" cy="7" r="1.3" />
        <circle cx="14.5" cy="7" r="1.3" />
      </g>
    </>
  ),
  dollar: P('M12 2.5v19M16.5 6.5c-.8-1.4-2.5-2.2-4.5-2.2-2.7 0-4.6 1.4-4.6 3.5 0 4.9 9.6 2.6 9.6 7.8 0 2.1-2 3.6-4.9 3.6-2.3 0-4.1-.9-5-2.5'),
  ruler: (
    <>
      <rect x="2.5" y="8" width="19" height="8" rx="2" />
      {P('M6.5 8v3M10 8v4.5M13.5 8v3M17 8v4.5')}
    </>
  ),
  moon: P('M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11z'),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      {P('M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4')}
    </>
  ),
  bag: (
    <>
      {P('M5.2 8h13.6l-1 11.6a1.6 1.6 0 0 1-1.6 1.4H7.8a1.6 1.6 0 0 1-1.6-1.4z')}
      {P('M8.8 10.5V7a3.2 3.2 0 0 1 6.4 0v3.5')}
    </>
  ),
  bagFill: (
    <>
      <path d="M5.2 8h13.6l-1 11.6a1.6 1.6 0 0 1-1.6 1.4H7.8a1.6 1.6 0 0 1-1.6-1.4z" fill="currentColor" stroke="none" />
      {P('M8.8 10.5V7a3.2 3.2 0 0 1 6.4 0v3.5')}
    </>
  ),
  heart: P('M12 20.5s-7.5-4.6-9.2-9.6C1.6 7.3 3.9 4 7.3 4c2 0 3.5 1.1 4.7 2.8C13.2 5.1 14.7 4 16.7 4c3.4 0 5.7 3.3 4.5 6.9-1.7 5-9.2 9.6-9.2 9.6z'),
  sort: P('M7.5 4v16M3.5 8l4-4 4 4M16.5 20V4M12.5 16l4 4 4-4'),
  folder: P('M3 7.5A2.5 2.5 0 0 1 5.5 5h3.6l2.2 2.3h7.2A2.5 2.5 0 0 1 21 9.8v7.7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z'),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2.5" />
      {P('M15.5 8.5V6a2.5 2.5 0 0 0-2.5-2.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5')}
    </>
  ),
  safari: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      <path d="m15.8 8.2-2.2 5.4-5.4 2.2 2.2-5.4z" fill="currentColor" stroke="none" />
    </>
  ),
  photo: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="3" />
      <circle cx="8.5" cy="10" r="1.6" />
      {P('m21 16-5-5-8.5 8.5')}
    </>
  ),
  clipboard: (
    <>
      <rect x="5" y="4.5" width="14" height="17" rx="2.5" />
      <rect x="8.5" y="2.5" width="7" height="4" rx="1.5" />
    </>
  ),
  bolt: P('M13 2.5 4.5 13.5h6.5l-1 8 8.5-11h-6.5z'),
  info: (
    <>
      <circle cx="12" cy="12" r="9.5" />
      {P('M12 11v5.5M12 7.6v.1')}
    </>
  ),
  chart: P('M3.5 17.5 9 12l4 4 7.5-8M15 8h5.5v5.5'),
  shield: P('M12 3 19.5 6v5.8c0 4.6-3.2 8.3-7.5 9.2-4.3-.9-7.5-4.6-7.5-9.2V6z'),
  logout: P('M14.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3.5M10 16.5 5.5 12 10 7.5M5.5 12H16'),
  server: (
    <>
      <rect x="3.5" y="4" width="17" height="7" rx="2" />
      <rect x="3.5" y="13" width="17" height="7" rx="2" />
      <g fill="currentColor" stroke="none">
        <circle cx="7" cy="7.5" r="1" />
        <circle cx="7" cy="16.5" r="1" />
      </g>
    </>
  ),
  warning: (
    <>
      {P('M10.3 4.2 2.8 17.5A2 2 0 0 0 4.5 20.5h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z')}
      {P('M12 9.5v4.5M12 17v.1')}
    </>
  ),
  eye: (
    <>
      {P('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z')}
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  cart: (
    <>
      {P('M2.5 3.5h2.8l2.4 11.3a2 2 0 0 0 2 1.6h8a2 2 0 0 0 2-1.5l1.6-7.4H6.3')}
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17.5" cy="20" r="1.3" />
    </>
  ),
  tray: P('M3 13.5 5.5 5h13l2.5 8.5v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 13.5h5l1.5 2.5h5l1.5-2.5h5'),
  github: <path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.7-.2.7-.5v-1.7c-2.7.6-3.2-1.2-3.2-1.2-.4-1.1-1.1-1.4-1.1-1.4-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.1-.2-4.3-1.1-4.3-4.7 0-1 .4-1.9 1-2.6-.1-.2-.4-1.2.1-2.5 0 0 .8-.3 2.6 1a9 9 0 0 1 4.8 0c1.8-1.3 2.6-1 2.6-1 .5 1.3.2 2.3.1 2.5.6.7 1 1.6 1 2.6 0 3.7-2.2 4.5-4.3 4.7.3.3.6.9.6 1.8v2.6c0 .3.2.6.7.5A9.5 9.5 0 0 0 12 2.5z" fill="currentColor" stroke="none" />,
};

export function Icon({ name, size = 22, weight = 2, className, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {ICONS[name] || null}
    </svg>
  );
}
