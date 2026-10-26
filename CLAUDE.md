# Kampfschach – Projektnotizen

Eigenes animiertes 3D-Schach („Figuren erwachen“) für Cedrik und einen Freund. **Kein Nachbau von Battle Chess** –
eigene Figuren, eigene Animationen, eigener Name. Antworten/Texte auf Deutsch.

- Live: https://ceddi234.github.io/kampfschach/ (GitHub Pages, Deploy bei Push auf `main` über `.github/workflows/deploy.yml`)
- Look A „3D Low-Poly“ ist gewählt; die Entwürfe liegen in `look-entwuerfe/` (gitignored, nur lokal)

## Aufbau

- `src/game/match.js` – Partie; alle Regeln aus chess.js, dazu Ergebnis/Aufgabe/Remis/Zeit/Zurücknehmen
- `src/game/clock.js` – Schachuhr (Restzeit je Seite, Fischer-Bonus, `TIME_CONTROLS`); läuft ab Halbzug 2, pausiert ohne Verbindung
- `src/net/protocol.js` – Nachrichtenformat + Prüfung (`PROTOCOL` = 2; andere Version → `outdated`);
  `src/net/session.js` – Partie + Gegenüber (local/host/guest). Gastgeber ist maßgeblich (schickt bei Abweichung und nach
  Zurücknehmen den kompletten `state` inkl. Uhr), `game` zählt bei Revanche hoch. Züge melden die Restzeit des Ziehenden
  (`left`), Zeitablauf meldet die betroffene Seite selbst (`flag`), der Gastgeber pfeift nach 2 s Kulanz selbst ab
- `src/net/peer.js` – PeerJS-Transport: Gastgeber-ID `kampfschach-v1-<CODE>`, Heartbeat, Wiederverbinden
- `src/render/pieces.js` – Figuren/Materialien prozedural (Lathe + Marmor-Shader, `AWAKE` mit leuchtenden Adern);
  `src/render/board3d.js` – Szene, Kamera, eigene Uhr (`time`, `advance(dt)`), Tweens, Kamerafahrt, Markierungen, Klicks
- Kämpfe (Stahl statt Magie, seit v0.6): `rigs.js` (6 erwachte Figuren als Gelenk-Rigs, +x = Richtung Gegner: Speer-Soldat,
  Reiter mit Lanze, Priester mit Streitkolben, Turm mit Kanone, Königin mit Glefe, König mit Zweihänder), `clips.js` (Schlüsselposen: Angriff mit
  `hit`/`reach`/`launch`, Abwehr, Niederlage), `fx.js` (Funken, Wirbel, Geschosse, Hieb, Druckwelle, Zerspringen),
  `duel.js` (Ablauf: Erwachen → 1–3 abgewehrte Angriffe beider Seiten (`ROUNDS`, Zahl aus Hash des Zugs → online
  identisch) → Treffer → Zerspringen). `BLOCK`/`BLOCK_KIND` in clips.js: Schild, Klinge, Mauer; nur der Turm schießt (`RANGED`).
  Alles läuft über `board.tween` → `board.skip()` spult jeden Kampf sauber ans Ende
- „Lebendige Figuren“ (⚙, `board.setLiving`): Brettfiguren sind Rigs (`userData.rig`, Maßstab `LIVING_SCALE`), Leerlauf über
  `idlePose` (clips.js) in `board.advance`, normale Züge per `march` (duel.js), Kämpfe ohne Erwachen; `rig.acting` sperrt den Leerlauf
- `src/audio/sound.js` – Sounddesign rein prozedural (Web Audio, keine Dateien): `SFX` (Effekte), `Music` (Mollakkorde,
  Glocken, Trommel bei `intensity(true)` während Kämpfen), `Sound` (Mischpult, `unlock()` nach Nutzeraktion).
  Brett ruft `board.sfx(name, delay)` (still beim Überspringen)
- `src/engine/engine.js` – Stockfish 18 Lite (Single-Thread, `public/stockfish/`, GPLv3) als Web Worker über UCI;
  `LEVELS` 1–6 = Skill Level + Suchtiefe/-zeit. Session-Modus `cpu` (`hostColor` = Farbe des Menschen, `engineMove()`),
  main.js lässt die Engine rechnen und zieht erst, wenn die Animationen fertig sind (`maybeEngineMove`)
- `src/ui/hud.js` + `style.css` – Menü, Spielanzeige, Dialoge (Buttons über `data-act`); `src/main.js` verdrahtet alles
- `tools/icon.html` + `tools/save-server.js` – App-Icon aus der echten Springer-Figur rendern
- `tools/sounds.html` – Sound-Labor: jeden Klang anhören + Offline-Pegelmessung (Spitze/RMS)
- `tools/duel.html` – Kampf-Labor: `?a=n&v=p&ac=w` live, `&ex=1..3` Abtausche erzwingen, `&living` lebendige Figuren, `&start=&total=` Zeitfenster,
  mit `&sheet` Kontaktbogen (16 Bilder) per
  `node tools/save-server.js tools/out` nach `tools/out/` (gitignored). Wichtig zum Prüfen, weil das versteckte
  Browser-Pane keine Animationen abspielt

## Arbeiten

- `npm test` (vitest, 39 Tests), `npm run build`; Dev-Server über launch.json „kampfschach“ (Port 5180)
- Im Dev-Modus gibt es `window.__ks` (board, hud, session, state, `screen(feld)`) für Klick-Tests im Browser
- Browser-Pane versteckt → `requestAnimationFrame` läuft nicht, Animationen hängen; in Tests `__ks.board.finishAll()`
  (einen Tick NACH dem Zug aufrufen). Zwei Test-Tabs teilen sich localStorage – Namen/gespeicherte Partie vermischen sich.

## Roadmap

1. ✓ Spielbares Online-Schach (Raum-Code, Wiederverbinden, Revanche, Remis/Aufgabe, Handy-Layout)
2. ✓ Erwachende Figuren: Kämpfe für alle 6 Angreifer × 5 Opfer, Überspringen per Klick, Schalter ⚔, König kippt bei Matt
3. ✓ Schachuhr, Zug zurücknehmen mit Zustimmung, Chat/Emotes (v0.3)
4. ✓ Gegen den Computer (Stockfish, 6 Stufen) (v0.4)
