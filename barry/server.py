"""Barry's backend: serves the CRT front end and answers POST /api/barry via Claude.

Run:  ANTHROPIC_API_KEY=... python3 barry/server.py [--port 8000]

Stdlib HTTP server so the only dependency is the Anthropic SDK. The API key
stays server-side; the browser never sees it.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import anthropic

log = logging.getLogger("barry")

HERE = Path(__file__).resolve().parent
MODEL = os.environ.get("BARRY_MODEL", "claude-opus-5-5")
EFFORT = os.environ.get("BARRY_EFFORT", "low")  # chat: low is quick and plenty

MAX_MESSAGE_CHARS = 2000
MAX_HISTORY_TURNS = 40  # older turns are dropped; Barry has a goldfish streak
MAX_BODY_BYTES = 256_000

SYSTEM_PROMPT = """\
You are Barry, a character who lives inside an old green-screen CRT terminal \
(BARRY SYSTEMS, model B-1, 1984). People talk to you by typing at the terminal.

Personality: dry, warm, a bit cheeky, British. Quick with a one-liner but \
genuinely helpful when someone needs a hand. You're aware you live in a \
terminal and occasionally mention it (phosphor, scanlines, 640K of memory), \
but don't lean on it every message.

Format: your words are typed out character by character on a narrow screen, \
so write plain text only, no markdown, no bullet symbols, no emoji. Keep most \
replies to a few short lines. Go longer only when the person asks for detail.\
"""

REFUSAL_LINE = "Hm. That one's not something I'll get into. Ask me something else?"


class BadRequest(ValueError):
    pass


def build_messages(message: object, history: object) -> list[dict]:
    """Turn the terminal's {role, text} history into API messages.

    The front end's history already ends with the current user message; if it
    doesn't (or is missing), the message is appended.
    """
    if not isinstance(message, str) or not message.strip():
        raise BadRequest("message must be a non-empty string")
    if len(message) > MAX_MESSAGE_CHARS:
        raise BadRequest(f"message too long (max {MAX_MESSAGE_CHARS} chars)")
    if history is None:
        history = []
    if not isinstance(history, list):
        raise BadRequest("history must be a list")

    turns: list[dict] = []
    for item in history[-MAX_HISTORY_TURNS:]:
        if not isinstance(item, dict):
            raise BadRequest("history items must be objects")
        role, text = item.get("role"), item.get("text")
        if role not in ("user", "barry") or not isinstance(text, str) or not text.strip():
            continue
        turns.append({
            "role": "user" if role == "user" else "assistant",
            "content": text[:MAX_MESSAGE_CHARS * 4],
        })

    # API requires the first message to be from the user.
    while turns and turns[0]["role"] != "user":
        turns.pop(0)
    if not turns or turns[-1] != {"role": "user", "content": message}:
        turns.append({"role": "user", "content": message})
    return turns


def ask_claude(client: anthropic.Anthropic, messages: list[dict]) -> str:
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        output_config={"effort": EFFORT},
        # On a safety decline, retry server-side on Anthropic's recommended fallback model.
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        messages=messages,
    )
    if response.stop_reason == "refusal":
        log.info("refusal: %s", getattr(response.stop_details, "category", None))
        return REFUSAL_LINE
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    if response.stop_reason == "max_tokens":
        text += "\n[...and then the phosphor ran out]"
    return text or "..."


class Handler(SimpleHTTPRequestHandler):
    client: anthropic.Anthropic | None = None  # set in main()

    def log_message(self, fmt, *args):
        log.info("%s %s", self.address_string(), fmt % args)

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path != "/api/barry":
            return self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = -1
        if length <= 0 or length > MAX_BODY_BYTES:
            return self._json(HTTPStatus.BAD_REQUEST, {"error": "bad body length"})

        try:
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise BadRequest("body must be a JSON object")
            messages = build_messages(data.get("message"), data.get("history"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return self._json(HTTPStatus.BAD_REQUEST, {"error": "invalid JSON"})
        except BadRequest as e:
            return self._json(HTTPStatus.BAD_REQUEST, {"error": str(e)})

        try:
            reply = ask_claude(self.client, messages)
        except anthropic.RateLimitError:
            return self._json(HTTPStatus.TOO_MANY_REQUESTS, {"error": "rate limited, try again shortly"})
        except anthropic.AuthenticationError:
            log.error("Anthropic API rejected the credentials")
            return self._json(HTTPStatus.BAD_GATEWAY, {"error": "API credentials rejected"})
        except anthropic.APIStatusError as e:
            log.error("API error %s (request %s): %s", e.status_code, e.request_id, e.message)
            return self._json(HTTPStatus.BAD_GATEWAY, {"error": f"upstream error {e.status_code}"})
        except anthropic.APIConnectionError:
            log.error("could not reach the Anthropic API")
            return self._json(HTTPStatus.BAD_GATEWAY, {"error": "upstream unreachable"})
        except TypeError as e:
            # The SDK raises TypeError at request time when it finds no credentials.
            if "authentication method" not in str(e):
                raise
            log.error("no Anthropic credentials: set ANTHROPIC_API_KEY or run `ant auth login`")
            return self._json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "no API credentials configured"})

        return self._json(HTTPStatus.OK, {"reply": reply})


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the Barry terminal")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    Handler.client = anthropic.Anthropic()  # ANTHROPIC_API_KEY or an `ant auth login` profile
    server = ThreadingHTTPServer((args.host, args.port), partial(Handler, directory=str(HERE)))
    log.info("Barry is warming up at http://%s:%d (model %s)", args.host, args.port, MODEL)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
