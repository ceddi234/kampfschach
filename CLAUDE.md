# Kampfschach – Projektnotizen

Eigenes animiertes 3D-Schach („Figuren erwachen“) für Cedrik und einen Freund. **Kein Nachbau von Battle Chess** –
eigene Figuren, eigene Animationen, eigener Name. Antworten/Texte auf Deutsch.

- Live: https://ceddi234.github.io/kampfschach/ (GitHub Pages, Deploy bei Push auf `main` über `.github/workflows/deploy.yml`)
- Look A „3D Low-Poly“ ist gewählt; die Entwürfe liegen in `look-entwuerfe/` (gitignored, nur lokal)

## Aufbau

- `src/game/match.js` – Partie; alle Regeln aus chess.js, dazu Ergebnis/Aufgabe/Remis
- `src/net/protocol.js` – Nachrichtenformat + Prüfung; `src/net/session.js` – Partie + Gegenüber (local/host/guest),
  Gastgeber ist maßgeblich (schickt bei Abweichung den kompletten `state`), `game` zählt bei Revanche hoch
- `src/net/peer.js` – PeerJS-Transport: Gastgeber-ID `kampfschach-v1-<CODE>`, Heartbeat, Wiederverbinden
- `src/render/pieces.js` – Figuren/Materialien prozedural (Lathe + Marmor-Shader); `src/render/board3d.js` – Szene,
  Kamera, Zug-Animationen (Tweens), Markierungen, Klick-Erkennung
- `src/ui/hud.js` + `style.css` – Menü, Spielanzeige, Dialoge (Buttons über `data-act`); `src/main.js` verdrahtet alles
- `tools/icon.html` + `tools/save-server.js` – App-Icon aus der echten Springer-Figur rendern

## Arbeiten

- `npm test` (vitest, 19 Tests), `npm run build`; Dev-Server über launch.json „kampfschach“ (Port 5180)
- Im Dev-Modus gibt es `window.__ks` (board, hud, session, state, `screen(feld)`) für Klick-Tests im Browser
- Browser-Pane versteckt → `requestAnimationFrame` läuft nicht, Animationen hängen; in Tests `__ks.board.finishAll()`
  (einen Tick NACH dem Zug aufrufen). Zwei Test-Tabs teilen sich localStorage – Namen/gespeicherte Partie vermischen sich.

## Roadmap

1. ✓ Spielbares Online-Schach (Raum-Code, Wiederverbinden, Revanche, Remis/Aufgabe, Handy-Layout)
2. Erwachende Figuren: Kampf-Animationen (Entwurf: Marmor-Pferd vs. Obsidian-Soldat in `look-entwuerfe/look.html`)
3. Schachuhr, Zug zurücknehmen mit Zustimmung, Chat/Emotes
4. Gegen den Computer (Stockfish WASM)
