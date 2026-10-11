# Barry

An interactive chat character that lives in a retro CRT terminal.

Runs entirely on Cloudflare: the terminal is served as Workers Static Assets,
and Barry's brain is **Workers AI** (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`
by default), called from a Worker. No API keys to manage; the `AI` binding
handles auth.

## Run it

```bash
cd barry
npm install
npx wrangler login     # once; Workers AI needs your Cloudflare account, even in dev
npm run dev            # http://localhost:8787
npm run deploy         # publishes to https://barry.<your-subdomain>.workers.dev
```

`npm run dev` serves the page locally but runs the AI calls on Cloudflare, so
they use your account's Workers AI allowance.

Opening `public/index.html` directly, or hosting `public/` anywhere without
the Worker, still works: Barry drops into **offline mode** with canned lines.

## Configuration

In `wrangler.jsonc` under `vars`:

| Var | Default | What it does |
|---|---|---|
| `BARRY_MODEL` | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Any Workers AI text-generation model that takes chat `messages` |
| `BARRY_MAX_TOKENS` | `600` | Longest reply Barry can give |

The default model has a 24k-token context window, so the Worker sends at most
the last 30 turns / 24,000 characters of chat history.

Barry's personality lives in `SYSTEM_PROMPT` at the top of `src/index.js`.

## Files

| File | What it does |
|---|---|
| `public/index.html` | Page shell: bezel, screen, input line |
| `public/style.css` | Phosphor themes, scanlines, vignette, flicker, power-on animation |
| `public/terminal.js` | Boot sequence, typed output, block cursor, history, slash commands |
| `public/barry.js` | Calls `/api/barry`; falls back to offline mode if there's no Worker |
| `src/index.js` | The Worker: validates the chat and calls Workers AI |
| `wrangler.jsonc` | Worker, AI binding and static assets config |

## How a message flows

1. `terminal.js` calls `Barry.reply(message, history)`, where `history` is
   `[{ role: "user" | "barry", text }]`.
2. `barry.js` POSTs `{ message, history }` to `/api/barry`.
3. The Worker validates it (message up to 2,000 chars, history trimmed, only
   `user`/`barry` roles accepted so nobody can inject a system turn), adds
   Barry's persona as the system message and calls `env.AI.run`.
4. The reply comes back as `{ reply }` and gets typed onto the screen.

Errors come back as `{ error }` with a 4xx/5xx status, and the terminal prints
`CARRIER LOST` with the reason.

## Tests

```bash
npm test
```

Uses Node's built-in test runner and a fake `env.AI`, so no Cloudflare account
is needed and nothing is billed.

## Terminal commands

`/help`, `/clear`, `/theme [green|amber|white]`, `/fx`, `/reset`, `/reboot`, `/about`.
Up/Down recalls previous lines, Ctrl+L clears, any key or tap skips typing.

Theme and effects choices are saved in `localStorage`. `prefers-reduced-motion`
turns off typing, flicker and the power-on animation.
