# Barry

An interactive chat character that lives in a retro CRT terminal.

This is the **front end only**. Barry's replies come from a placeholder in
`barry.js` until a real backend exists.

## Run it

No build step. Open `barry/index.html` in a browser, or serve the folder:

```bash
python3 -m http.server -d barry 8000   # then visit http://localhost:8000
```

## Files

| File | What it does |
|---|---|
| `index.html` | Page shell: bezel, screen, input line |
| `style.css` | Phosphor themes, scanlines, vignette, flicker, power-on animation |
| `terminal.js` | Boot sequence, typed output, block cursor, history, slash commands |
| `barry.js` | Barry's brain. **Swap this for the real backend.** |

## Plugging in a backend

The terminal only calls one function:

```js
Barry.reply(message, history) // -> Promise<string>
```

`history` is `[{ role: "user" | "barry", text }]`. Return a string (newlines
are fine). If it throws, the terminal prints `CARRIER LOST` with the error.

## Terminal commands

`/help`, `/clear`, `/theme [green|amber|white]`, `/fx`, `/reset`, `/reboot`, `/about`.
Up/Down recalls previous lines, Ctrl+L clears, any key or tap skips typing.

Theme and effects choices are saved in `localStorage`. `prefers-reduced-motion`
turns off typing, flicker and the power-on animation.
