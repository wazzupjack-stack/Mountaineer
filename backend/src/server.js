require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');

const { runMigrations } = require('./db');
const { resolveSession } = require('./auth/session');
const authRoutes = require('./auth/routes');
const { createRooms } = require('./game/rooms');
const { handleMessage, handleClose } = require('./ws/handlers');

const PORT = process.env.PORT || 8080;

async function main() {
  await runMigrations();
  const rooms = await createRooms();

  const app = express();
  app.use(express.json());
  app.use('/api', authRoutes);
  // This app is under active development and rebuilt/redeployed often —
  // browsers must never hold onto a stale copy of the client across a
  // rebuild, or a real fix can look like it "didn't work."
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', ws => {
    ws.on('message', raw => handleMessage(ws, raw, rooms));
    ws.on('close', () => handleClose(ws, rooms));
  });

  server.on('upgrade', async (req, socket, head) => {
    if (!req.url.startsWith('/ws')) { socket.destroy(); return; }
    let session = null;
    try { session = await resolveSession(req); } catch (e) { /* anonymous */ }
    wss.handleUpgrade(req, socket, head, ws => {
      if (session) { ws.userId = session.userId; ws.username = session.username; }
      wss.emit('connection', ws, req);
    });
  });

  server.listen(PORT, () => console.log(`Mountaineer listening on :${PORT}`));
}

main().catch(err => {
  console.error('Fatal startup error', err);
  process.exit(1);
});
