/*
 * Barry's brain. The terminal only ever calls Barry.reply(message, history)
 * and expects a Promise of a string (newlines allowed).
 *
 * Talks to server.py at /api/barry. If there's no server (page opened as a
 * file or from static hosting), Barry drops to offline mode with canned lines.
 */
(function () {
  "use strict";

  const ENDPOINT = "api/barry";

  const canned = [
    [/^(hi|hello|hey|yo|alright)\b/i, "Alright. Barry here. Terminal's warm, so am I."],
    [/who are you|what are you/i, "I'm Barry. Normally there's a brain attached. Today it's out to lunch."],
    [/how are you/i, "Running at 60Hz with mild screen burn. Can't complain."],
    [/joke/i, "I'd tell you a UDP joke, but you might not get it."],
  ];

  let offline = location.protocol === "file:";
  let warnedOffline = false;

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function offlineReply(message) {
    await sleep(400 + Math.random() * 600);
    let prefix = "";
    if (!warnedOffline) {
      warnedOffline = true;
      prefix = "[OFFLINE MODE: no server found. Run barry/server.py for the real me.]\n";
    }
    for (const [pattern, answer] of canned) {
      if (pattern.test(message)) return prefix + answer;
    }
    return prefix + "No brain connected, so I can only nod. *nods*";
  }

  window.Barry = {
    name: "BARRY",
    version: "0.2.0",

    async reply(message, history) {
      if (offline) return offlineReply(message);

      let res;
      try {
        res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, history }),
        });
      } catch {
        offline = true; // no server at all
        return offlineReply(message);
      }

      // Static hosting answers 404/405/501 for a POST it doesn't understand.
      if ([404, 405, 501].includes(res.status)) {
        offline = true;
        return offlineReply(message);
      }

      let data = {};
      try { data = await res.json(); } catch { /* fall through to error below */ }
      if (!res.ok || typeof data.reply !== "string") {
        throw new Error(data.error || "HTTP " + res.status);
      }
      return data.reply;
    },
  };
})();
