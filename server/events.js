// Server-Sent Events hub: every connected device for a user gets a nudge when that user's data changes.
const clients = new Map(); // userId -> Set<res>

export function subscribe(req, res) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  const userId = req.user.id;
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);

  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    clients.get(userId)?.delete(res);
  });
}

export function emit(userId, payload = {}) {
  const set = clients.get(userId);
  if (!set) return;
  const data = `data: ${JSON.stringify({ type: 'changed', at: Date.now(), ...payload })}\n\n`;
  for (const res of set) res.write(data);
}
