# Kampfschach

Animiertes 3D-Schach für zwei – online per Raum-Code oder am selben Gerät.
Läuft komplett im Browser, ohne Konto und ohne eigenen Server.

Beim Schlagen **erwachen die Figuren**: Die Marmor- und Obsidianfiguren verlassen ihren Sockel, werden zu lebendigen
Steinwesen mit leuchtenden Adern und kämpfen – Speerstoß, Hufschlag, Zauberkugel, Kanonenkugel, Lichtsplitter,
Schwerthieb. Der Verlierer zerspringt, der Sieger wird wieder zur Figur. Ein Klick aufs Brett überspringt den Kampf,
der Schalter ⚔ schaltet die Kämpfe ab. Bei Schachmatt kippt der König um.

**Spielen:** https://ceddi234.github.io/kampfschach/

## So spielt ihr zu zweit

1. Einer klickt **Online-Spiel erstellen**, wählt seine Farbe und bekommt einen Code (z. B. `K7F2P`) plus Link.
2. Den Link an den Gegner schicken – er landet direkt im Spiel (oder gibt den Code unter **Mit Code beitreten** ein).
3. Bricht die Verbindung ab (WLAN weg, Laptop zu, Seite neu geladen), verbindet sich das Spiel von selbst wieder.
   Die Partie bleibt im Browser gespeichert und lässt sich im Menü fortsetzen.

## Extras

- **Schachuhr:** beim Erstellen wählbar (ohne Uhr, 3+2, 5+3, 10 Min, 15+10). Die Uhr läuft ab dem zweiten Halbzug,
  pausiert bei Verbindungsabbruch; wer keine Zeit mehr hat, verliert (Remis, wenn der Gegner nicht mehr mattsetzen kann).
- **Zug zurücknehmen:** online nur mit Zustimmung des Gegners, am selben Gerät sofort.
- **Chat & Emotes:** Reiter „Chat“ neben der Zugliste; Emotes steigen neben dem Spieler auf.

## Als App auf dem Mac

- **Safari:** Seite öffnen → Menü **Ablage → Zum Dock hinzufügen**. Danach startet Kampfschach wie eine normale App.
- **Chrome / Edge:** Installieren-Symbol rechts in der Adresszeile → **Installieren**.
- **iPhone/iPad:** Teilen → **Zum Home-Bildschirm**.

## Regeln

Alle offiziellen Schachregeln über [chess.js](https://github.com/jhlywa/chess.js): Rochade, en passant,
Bauernumwandlung (mit Figurwahl), Schach, Matt, Patt, Remis durch dreifache Wiederholung, 50-Züge-Regel und
zu wenig Material – dazu Remis anbieten und Aufgeben.

## Technik

- [three.js](https://threejs.org) – Brett und Figuren, komplett aus Code gebaut (keine 3D-Modelle)
- [PeerJS](https://peerjs.com) – WebRTC-Verbindung direkt zwischen den beiden Browsern; der kostenlose
  PeerJS-Server vermittelt nur den ersten Kontakt
- [Vite](https://vite.dev) – Build, Deploy per GitHub Actions auf GitHub Pages

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Spiellogik + Online-Protokoll
npm run build    # → dist/
```

## Wie es weitergeht

1. ~~Spielbares Online-Schach~~ ✓
2. ~~Erwachende Figuren: Kampf-Animationen für jede Figur~~ ✓
3. ~~Schachuhr, Zug zurücknehmen (mit Zustimmung), Chat & Emotes~~ ✓
4. Gegen den Computer (Stockfish)
