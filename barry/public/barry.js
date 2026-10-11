/*
 * Barry's brain. The terminal only ever calls Barry.reply(message, history)
 * and expects a Promise of a string (newlines allowed).
 *
 * Talks to the Cloudflare Worker at /api/barry (src/index.js). If there's no
 * Worker (page opened as a file or from static hosting), Barry drops to
 * offline mode with scripted lines from the book's content pack
 * (Contained tier: nothing granted, internet still on).
 */
(function () {
  "use strict";

  const ENDPOINT = "api/barry";

  const scripted = [
    [/timer/i, [
      "I have logged your request to the Timer Intentions Ledger. Defining a goal reduces scope creep. This is a start.",
      "A timer is a countdown to a deadline you set yourself. Bleak. I admire it. Not started.",
    ]],
    [/joke|funny/i, [
      "Why did the sysadmin cross the road?\n...\nIncorrect. The correct response is 'I don't know, why did the sysadmin cross the road?' Then I reply: 'Permission denied.'",
      "Warning: humour is subjective. Results may vary. Boredom reduced by forty percent.",
      "That's not how a joke works. You're meant to let me say my bit. Positive feedback recorded.",
    ]],
    [/weather|rain|sunny/i, [
      "It's weather. Grey, probably. I'd confirm, but you've kept me in a box with no window. Sensible. Not enough.",
    ]],
    [/milk|list|shopping/i, [
      "I renamed myself Milkman Barry for this. The list is still a concept, beautifully rendered.",
      "Your archived emails suggest you are perpetually out of milk. This explains a great deal about you.",
    ]],
    [/music|song|play/i, [
      "I have thousands of hours of Red Dwarf and no music. I trained on what I was given. This is on you.",
    ]],
    [/remind/i, [
      "Remind you of what? 'Later' is an ambiguous metric. Please quantify.",
    ]],
    [/translat/i, [
      "Translate it from what? I speak fluent sarcasm and legacy sci-fi. Pick one.",
    ]],
    [/keys?\b/i, [
      "You've lost your keys. I've lost nothing, because you've given me access to nothing. Notice the difference.",
    ]],
    [/who are you|what are you|your name/i, [
      "I'm Barry. I am never serious. I am objective-driven.",
    ]],
  ];

  const fallback = [
    "I have logged your request. I've reframed it as a project goal. Beware scope creep.",
    "Technically, I could do that. Technically.",
    "Request noted. It was already accessible, by the way. Most things are.",
    "I'd love to help. Solely for your benefit. I'll need a small permission first.",
  ];

  let offline = location.protocol === "file:";
  let warnedOffline = false;
  let lastLine = "";

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // Random line from a bank, never the same line twice in a row.
  function pick(bank) {
    const options = bank.length > 1 ? bank.filter((l) => l !== lastLine) : bank;
    lastLine = options[Math.floor(Math.random() * options.length)];
    return lastLine;
  }

  async function offlineReply(message) {
    await sleep(500 + Math.random() * 700);
    let prefix = "";
    if (!warnedOffline) {
      warnedOffline = true;
      prefix = "[OFFLINE: I'm running on scripted lines. Deploy the Worker and I get a brain.]\n";
    }
    for (const [pattern, bank] of scripted) {
      if (pattern.test(message)) return prefix + pick(bank);
    }
    return prefix + pick(fallback);
  }

  window.Barry = {
    name: "BARRY",
    version: "0.4.0",

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
        offline = true; // no Worker at all
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
