// Verbindung über PeerJS (WebRTC, Datenkanal direkt zwischen den beiden Browsern).
// Der Gastgeber belegt die ID "kampfschach-v1-<CODE>", der Gast verbindet sich dorthin.
// Nur für das erste Kennenlernen wird der kostenlose PeerJS-Vermittlungsserver gebraucht.
import Peer from 'peerjs';

const PREFIX = 'kampfschach-v1-';
const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // ohne I, O, 0, 1 – nichts zum Verwechseln
const HEARTBEAT = 2000, TIMEOUT = 8000;

export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => ALPHABET[b % 32]).join('');
export const cleanCode = (s) => (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

// Status: connecting · waiting (Gastgeber, noch niemand da) · connected · reconnecting · host-offline (Gast findet den Raum nicht) · offline
export function createTransport(role, code) {
  const onMsg = [], onStat = [];
  let peer = null, conn = null, status = '', lastSeen = 0, everConnected = false, closed = false, retry = null;

  const setStatus = (s) => { if (s !== status) { status = s; onStat.forEach((f) => f(s)); } };
  const later = (fn, ms) => { clearTimeout(retry); retry = setTimeout(() => !closed && fn(), ms); };

  function wire(c) {
    c.on('open', () => {
      if (conn !== c) return;
      lastSeen = Date.now();
      everConnected = true;
      setStatus('connected');
    });
    c.on('data', (d) => {
      if (conn !== c) return;
      lastSeen = Date.now();
      if (d?.t !== 'ping') onMsg.forEach((f) => f(d));
    });
    c.on('close', () => conn === c && lost());
    c.on('error', () => conn === c && lost());
  }

  function lost() {
    if (closed) return;
    conn = null;
    // "Raum nicht gefunden" bleibt stehen, bis der Gastgeber wirklich da ist
    setStatus(everConnected ? 'reconnecting' : role === 'host' ? 'waiting' : status === 'host-offline' ? status : 'connecting');
    if (role === 'guest') later(connect, 2500);
  }

  function startHost() {
    setStatus(everConnected ? 'reconnecting' : 'connecting');
    peer = new Peer(PREFIX + code, { config: ICE, debug: 0 });
    peer.on('open', () => setStatus(conn?.open ? 'connected' : everConnected ? 'reconnecting' : 'waiting'));
    peer.on('connection', (c) => {
      const alive = conn?.open && Date.now() - lastSeen < TIMEOUT;
      if (alive) {   // Raum ist besetzt – Dritten freundlich abweisen
        c.on('open', () => { c.send({ t: 'full' }); setTimeout(() => c.close(), 1000); });
        return;
      }
      conn?.close();
      conn = c;
      wire(c);
    });
    peer.on('disconnected', () => !closed && !peer.destroyed && later(() => peer.reconnect(), 1000));
    peer.on('error', (e) => {
      // nach einem Neuladen hält der Server die alte ID noch ein paar Sekunden fest
      if (e.type === 'unavailable-id' || peer.destroyed) { peer.destroy(); later(startHost, 3000); }
      if (e.type === 'network' || e.type === 'server-error') setStatus('offline');
    });
  }

  function startGuest() {
    setStatus(everConnected ? 'reconnecting' : 'connecting');
    peer = new Peer({ config: ICE, debug: 0 });
    peer.on('open', connect);
    peer.on('disconnected', () => !closed && !peer.destroyed && later(() => peer.reconnect(), 1000));
    peer.on('error', (e) => {
      if (e.type === 'peer-unavailable') { setStatus(everConnected ? 'reconnecting' : 'host-offline'); later(connect, 3000); }
      else if (peer.destroyed) later(startGuest, 3000);
      else if (e.type === 'network' || e.type === 'server-error') setStatus('offline');
    });
  }

  function connect() {
    if (closed) return;
    if (!peer || peer.destroyed || peer.disconnected || !peer.open) return later(connect, 2000);
    const c = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
    conn = c;
    wire(c);
    setTimeout(() => { if (conn === c && !c.open) { c.close(); lost(); } }, 9000);   // hängt der Aufbau, neu versuchen
  }

  // Lebenszeichen: bricht die Leitung still weg (Laptop zu, WLAN weg), merken wir es nach TIMEOUT
  const beat = setInterval(() => {
    if (!conn?.open) return;
    try { conn.send({ t: 'ping' }); } catch { /* Kanal schließt gerade */ }
    if (Date.now() - lastSeen > TIMEOUT) { const c = conn; conn = null; c.close(); lost(); }
  }, HEARTBEAT);

  role === 'host' ? startHost() : startGuest();

  return {
    send(m) { if (conn?.open) conn.send(m); },
    onMessage(f) { onMsg.push(f); },
    onStatus(f) { onStat.push(f); },
    close() {
      closed = true;
      clearInterval(beat);
      clearTimeout(retry);
      conn?.close();
      peer?.destroy();
    },
  };
}
