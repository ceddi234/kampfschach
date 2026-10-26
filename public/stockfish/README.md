# Stockfish (Schach-Engine für „Gegen den Computer“)

Unverändert übernommen aus dem npm-Paket `stockfish@18.0.8` (Stockfish.js von Nathan Rugg / Chess.com):
`stockfish-18-lite-single.js` + `.wasm` – die kleine Single-Thread-Variante, die ohne besondere Server-Header läuft.

- Stockfish: https://github.com/official-stockfish/Stockfish
- Stockfish.js: https://github.com/nmrugg/stockfish.js
- Lizenz: GNU GPL v3, siehe `COPYING.txt`. Der Quelltext ist unter den Links oben verfügbar.

Kampfschach startet die Engine als eigenständigen Web Worker und spricht mit ihr nur über das UCI-Textprotokoll.
