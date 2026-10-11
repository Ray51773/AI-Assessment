/*
 * Barry's brain. The terminal only ever calls Barry.reply(message, history)
 * and expects a Promise of a string (newlines allowed).
 *
 * This is a placeholder so the front end runs on its own. Swap the body of
 * reply() for a real backend call (e.g. fetch('/api/barry', ...)) when it exists.
 */
(function () {
  "use strict";

  const canned = [
    [/^(hi|hello|hey|yo|alright)\b/i, "Alright. Barry here. Terminal's warm, so am I."],
    [/who are you|what are you/i, "I'm Barry. Front end's done, brain's pending. Bear with me."],
    [/how are you/i, "Running at 60Hz with mild screen burn. Can't complain."],
    [/joke/i, "I'd tell you a UDP joke, but you might not get it."],
  ];

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  window.Barry = {
    name: "BARRY",
    version: "0.1.0-crt",

    async reply(message, history) {
      await sleep(400 + Math.random() * 700);
      for (const [pattern, answer] of canned) {
        if (pattern.test(message)) return answer;
      }
      return (
        "No backend wired up yet, so I can only nod.\n" +
        "You said: \"" + message + "\" (" + history.length + " messages so far)."
      );
    },
  };
})();
