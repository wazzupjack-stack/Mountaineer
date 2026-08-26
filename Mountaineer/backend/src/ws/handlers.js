const { IN, OUT } = require('./protocol');

// Simple in-memory token bucket so one connection can't spam bet/cashOut
// messages faster than a human could plausibly click.
const BUCKET_MAX = 10;
const BUCKET_REFILL_MS = 1000;

function allow(ws) {
  const now = Date.now();
  if (ws._bucket === undefined) { ws._bucket = BUCKET_MAX; ws._bucketAt = now; }
  const elapsed = now - ws._bucketAt;
  ws._bucket = Math.min(BUCKET_MAX, ws._bucket + (elapsed / BUCKET_REFILL_MS) * BUCKET_MAX);
  ws._bucketAt = now;
  if (ws._bucket < 1) return false;
  ws._bucket -= 1;
  return true;
}

function handleMessage(ws, raw, rooms) {
  let msg;
  try { msg = JSON.parse(raw); } catch (e) { return; }
  if (!msg || typeof msg.type !== 'string') return;

  if (msg.type === IN.SUBSCRIBE || msg.type === IN.UNSUBSCRIBE) {
    const room = rooms.get(msg.mountainId);
    if (!room) return;
    if (msg.type === IN.SUBSCRIBE) room.addSubscriber(ws);
    else room.removeSubscriber(ws);
    return;
  }

  if (![IN.BET, IN.CANCEL_BET, IN.CASH_OUT].includes(msg.type)) return;
  if (!allow(ws)) {
    ws.send(JSON.stringify({ type: OUT.ERROR, code: 'rate_limited', message: 'Slow down.' }));
    return;
  }
  const room = rooms.get(msg.mountainId);
  if (!room) return;

  if (msg.type === IN.BET) room.placeBet(ws, msg.slot, msg.stake, msg.autoCashout);
  else if (msg.type === IN.CANCEL_BET) room.cancelBet(ws, msg.slot);
  else if (msg.type === IN.CASH_OUT) room.cashOut(ws, msg.slot);
}

function handleClose(ws, rooms) {
  for (const room of rooms.values()) room.removeSubscriber(ws);
}

module.exports = { handleMessage, handleClose };
