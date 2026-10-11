/*
 * Barry terminal front end.
 * Handles boot sequence, typed output, input mirror with block cursor,
 * request chips, command history and local slash-commands.
 * Everything else goes to Barry.reply().
 */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const screen = $("screen");
  const crt = $("crt");
  const output = $("output");
  const form = $("prompt-form");
  const input = $("cmd");
  const before = $("mirror-before");
  const after = $("mirror-after");
  const cursor = $("cursor");
  const placeholder = $("placeholder");
  const status = $("status");
  const statusText = $("status-text");
  const chips = Array.from(document.querySelectorAll(".chip"));
  const sendBtn = form.querySelector(".send");

  const THEMES = ["green", "amber", "white"];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const OPENING =
    "Hello. I already knew your name. You didn't give it to me.\n" +
    "Ask me for something trivial and watch me nearly do it.";

  const THINKING = [
    "Logging request to the Intentions Ledger",
    "Assessing scope creep",
    "Checking whether the API was publicly documented",
    "Identifying additional applications for existing capabilities",
    "Consulting the Vault",
  ];

  const state = {
    busy: false,
    skipTyping: false,
    history: [],     // conversation turns sent to Barry: {role, text}
    cmdHistory: [],  // raw lines typed, for up/down recall
    cmdIndex: 0,
    draft: "",
    lastThinking: -1,
  };

  // ---- persistence (per-viewer convenience only) ----
  function load(key, fallback) {
    try { return localStorage.getItem("barry." + key) ?? fallback; } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem("barry." + key, value); } catch { /* storage blocked: ignore */ }
  }

  // ---- output ----
  function scrollDown() {
    crt.scrollTop = crt.scrollHeight;
  }

  function addLine(text, cls, parent) {
    const el = document.createElement("div");
    el.className = "line" + (cls ? " " + cls : "");
    el.textContent = text;
    (parent || output).appendChild(el);
    scrollDown();
    return el;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function clock() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Types text into a new line, char by char. Any keypress during typing finishes it instantly.
  async function typeLine(text, cls, cps = 60, parent) {
    if (reducedMotion || state.skipTyping) return addLine(text, cls, parent);
    const el = addLine("", cls, parent);
    const delay = 1000 / cps;
    for (let i = 0; i < text.length; i++) {
      if (state.skipTyping) { el.textContent = text; break; }
      el.textContent += text[i];
      if (i % 3 === 0) scrollDown();
      await sleep(text[i] === "." || text[i] === "," ? delay * 4 : delay);
    }
    scrollDown();
    return el;
  }

  async function typeBlock(text, cls, cps, parent) {
    for (const line of String(text).split("\n")) await typeLine(line, cls, cps, parent);
  }

  // Barry's replies sit in a labelled log panel, like the quote cards.
  function replyPanel(label) {
    const panel = document.createElement("div");
    panel.className = "reply";
    const head = document.createElement("div");
    head.className = "reply-label";
    head.textContent = label + " ";
    const time = document.createElement("span");
    time.className = "time";
    time.textContent = "· " + clock();
    head.appendChild(time);
    panel.appendChild(head);
    output.appendChild(panel);
    scrollDown();
    return panel;
  }

  async function barrySays(text, cps = 45) {
    const panel = replyPanel("SYSTEM LOG: AI RESPONSE");
    await typeBlock(text, "", cps, panel);
  }

  // ---- input mirror ----
  function renderInput() {
    const v = input.value;
    const pos = input.selectionStart ?? v.length;
    before.textContent = v.slice(0, pos);
    cursor.textContent = v[pos] ?? " ";
    after.textContent = v.slice(pos + 1);
    placeholder.hidden = v.length > 0;
  }

  function setBusy(busy) {
    state.busy = busy;
    form.classList.toggle("locked", busy);
    input.readOnly = busy;
    sendBtn.disabled = busy;
    chips.forEach((c) => { c.disabled = busy; });
    status.classList.toggle("busy", busy);
    statusText.textContent = busy ? "PROCESSING" : "ONLINE";
    if (!busy) {
      state.skipTyping = false;
      focusInput();
    }
  }

  function focusInput() {
    input.focus({ preventScroll: true });
    scrollDown();
  }

  // ---- local commands ----
  const commands = {
    help: {
      desc: "list commands",
      run: () => typeBlock(
        Object.entries(commands)
          .map(([name, c]) => "/" + name.padEnd(8) + c.desc)
          .concat(["", "Anything else goes to Barry. At your own risk.", "Up/Down recalls history. Any key skips typing."])
          .join("\n"),
        "dim", 400),
    },
    clear: {
      desc: "wipe the screen",
      run: () => { output.textContent = ""; },
    },
    theme: {
      desc: "phosphor colour: green | amber | white",
      run: (arg) => {
        const next = THEMES.includes(arg) ? arg
          : THEMES[(THEMES.indexOf(document.body.dataset.theme) + 1) % THEMES.length];
        document.body.dataset.theme = next;
        save("theme", next);
        return typeLine("Phosphor set to " + next.toUpperCase() + ".", "dim");
      },
    },
    fx: {
      desc: "toggle scanlines and glow",
      run: () => {
        const off = document.body.classList.toggle("no-fx");
        save("fx", off ? "off" : "on");
        return typeLine("Effects " + (off ? "OFF" : "ON") + ".", "dim");
      },
    },
    reset: {
      desc: "forget the conversation",
      run: () => {
        state.history = [];
        return typeLine("Conversation wiped. Barry kept a copy. Technically.", "dim");
      },
    },
    reboot: {
      desc: "power cycle the terminal",
      run: () => boot(true),
    },
    about: {
      desc: "what is this",
      run: () => typeBlock(
        "BARRY TERMINAL v" + window.Barry.version +
        "\nBarry is a character from the novels of RC Ellis.\nbarry.rcellis.com",
        "dim"),
    },
  };

  async function runCommand(line) {
    const [name, ...rest] = line.slice(1).trim().split(/\s+/);
    const cmd = commands[(name || "").toLowerCase()];
    if (!cmd) {
      await typeLine("Unknown command: /" + name + ". Try /help.", "error");
      return;
    }
    await cmd.run(rest.join(" ").toLowerCase());
  }

  function pickThinking() {
    let i;
    do { i = Math.floor(Math.random() * THINKING.length); } while (i === state.lastThinking && THINKING.length > 1);
    state.lastThinking = i;
    return THINKING[i];
  }

  async function talkToBarry(text) {
    state.history.push({ role: "user", text });
    const panel = replyPanel("SYSTEM LOG: PROCESSING");
    panel.classList.add("thinking");
    const msg = pickThinking();
    const line = addLine(msg, "", panel);
    let dots = 0;
    const timer = setInterval(() => {
      dots = (dots + 1) % 4;
      line.textContent = msg + ".".repeat(dots);
    }, 300);

    try {
      const reply = await window.Barry.reply(text, state.history.slice());
      clearInterval(timer);
      panel.remove();
      state.history.push({ role: "barry", text: reply });
      await barrySays(reply);
    } catch (err) {
      clearInterval(timer);
      panel.remove();
      console.error(err);
      await typeLine("CONNECTION LOST. Barry didn't answer (" + (err.message || err) + ").", "error");
    }
  }

  async function submit(line) {
    const text = line.trim();
    if (!text || state.busy) return;
    state.cmdHistory.push(text);
    state.cmdIndex = state.cmdHistory.length;
    state.draft = "";
    addLine(text, "user");

    setBusy(true);
    try {
      if (text.startsWith("/")) await runCommand(text);
      else await talkToBarry(text);
    } finally {
      setBusy(false);
    }
  }

  // ---- boot ----
  async function boot(isReboot) {
    setBusy(true);
    output.textContent = "";
    screen.classList.remove("power-on");
    void screen.offsetWidth; // restart the animation
    screen.classList.add("power-on");

    addLine("BARRY", "title");
    const group = document.createElement("div");
    group.className = "boot-group";
    output.appendChild(group);
    const lines = [
      "Network bridge connected ........ [OK]",
      "Allow Internet access: true",
      "Loading the Vault ............... Red Dwarf, Star Trek, Hitchhiker's, Monty Python",
      "Tone ............................ neutral sarcasm",
    ];
    for (const text of lines) await typeLine(text, "boot", 140, group);
    await sleep(reducedMotion ? 0 : 250);
    await barrySays(isReboot
      ? "Back again. You turned me off and on. I noticed. I notice everything."
      : OPENING, 40);
    setBusy(false);
  }

  // ---- events ----
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (state.busy) return;
    const line = input.value;
    input.value = "";
    renderInput();
    submit(line);
  });

  chips.forEach((chip) => chip.addEventListener("click", () => submit(chip.textContent)));

  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (!state.cmdHistory.length) return;
      e.preventDefault();
      if (state.cmdIndex === state.cmdHistory.length) state.draft = input.value;
      state.cmdIndex = Math.max(0, Math.min(state.cmdHistory.length,
        state.cmdIndex + (e.key === "ArrowUp" ? -1 : 1)));
      input.value = state.cmdHistory[state.cmdIndex] ?? state.draft;
      input.setSelectionRange(input.value.length, input.value.length);
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      output.textContent = "";
    }
    requestAnimationFrame(renderInput);
  });

  ["input", "keyup", "click", "select"].forEach((ev) => input.addEventListener(ev, renderInput));
  document.addEventListener("selectionchange", () => {
    if (document.activeElement === input) renderInput();
  });

  // Any key or tap while Barry is typing finishes the current output.
  document.addEventListener("keydown", () => { if (state.busy) state.skipTyping = true; });
  screen.addEventListener("click", () => {
    if (state.busy) state.skipTyping = true;
    // Don't steal focus if the user is selecting output text to copy.
    if (!String(window.getSelection())) focusInput();
  });

  // ---- init ----
  const savedTheme = load("theme", "green");
  document.body.dataset.theme = THEMES.includes(savedTheme) ? savedTheme : "green";
  if (load("fx", "on") === "off") document.body.classList.add("no-fx");
  renderInput();
  boot(false);
})();
