# Barry

An interactive chat character that lives in a retro CRT terminal.

Barry's brain is Claude (`claude-opus-5-5` by default), called from a small
Python server so the API key never reaches the browser.

## Run it

```bash
pip install -r barry/requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...      # or `ant auth login`
python3 barry/server.py                  # then visit http://localhost:8000
```

Options: `--port`, `--host` (defaults to `127.0.0.1`; only bind wider on a
network you trust, since anyone who can reach it spends your API credit).
Environment: `BARRY_MODEL` (default `claude-opus-5-5`), `BARRY_EFFORT`
(default `low`, which keeps chat snappy and cheap).

Opening `index.html` directly, or hosting it without the server, still works:
Barry drops into **offline mode** with a few canned lines.

## Files

| File | What it does |
|---|---|
| `index.html` | Page shell: bezel, screen, input line |
| `style.css` | Phosphor themes, scanlines, vignette, flicker, power-on animation |
| `terminal.js` | Boot sequence, typed output, block cursor, history, slash commands |
| `barry.js` | Calls `/api/barry`; falls back to offline mode if there's no server |
| `server.py` | Serves the page and answers `POST /api/barry` via the Claude API |

## How a message flows

1. `terminal.js` calls `Barry.reply(message, history)`, where `history` is
   `[{ role: "user" | "barry", text }]`.
2. `barry.js` POSTs `{ message, history }` to `/api/barry`.
3. `server.py` validates it (message up to 2,000 chars, last 40 turns kept),
   adds Barry's persona as the system prompt and calls Claude.
4. The reply comes back as `{ reply }` and gets typed onto the screen.

Errors come back as `{ error }` with a 4xx/5xx status, and the terminal prints
`CARRIER LOST` with the reason. Missing credentials give a 503, rate limits a
429. If Claude declines a message, the server first retries on Anthropic's
recommended fallback model; if that also declines, Barry says so in character.

Barry's personality lives in `SYSTEM_PROMPT` at the top of `server.py`.

## Tests

```bash
python3 -m pytest tests/test_barry_server.py
```

These use a fake Claude client, so they need no API key and cost nothing.

## Terminal commands

`/help`, `/clear`, `/theme [green|amber|white]`, `/fx`, `/reset`, `/reboot`, `/about`.
Up/Down recalls previous lines, Ctrl+L clears, any key or tap skips typing.

Theme and effects choices are saved in `localStorage`. `prefers-reduced-motion`
turns off typing, flicker and the power-on animation.
