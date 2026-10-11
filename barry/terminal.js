/*
 * CRT terminal front end for Barry.
 * Handles boot sequence, typed output, input mirror with block cursor,
 * command history and local slash-commands. Everything else goes to Barry.reply().
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

  const THEMES = ["green", "amber", "white"];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const state = {
    busy: false,
    skipTyping: false,
    history: [],     // conversation turns sent to Barry: {role, text}
    cmdHistory: [],  // raw lines typed, for up/down recall
    cmdIndex: 0,
    draft: "",
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

  function addLine(text, cls) {
    const el = document.createElement("div");
    el.className = "line" + (cls ? " " + cls : "");
    el.textContent = text;
    output.appendChild(el);
    scrollDown();
    return el;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // Types text into a new line, char by char. Any keypress during typing finishes it instantly.
  async function typeLine(text, cls, cps = 60) {
    if (reducedMotion || state.skipTyping) return addLine(text, cls);
    const el = addLine("", cls);
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

  // Multi-line text. Only the first line of a Barry reply carries the "BARRY:" prefix.
  async function typeBlock(text, cls, cps) {
    const lines = String(text).split("\n");
    for (let i = 0; i < lines.length; i++) {
      const c = cls === "barry" && i > 0 ? "barry-cont" : cls;
      await typeLine(lines[i], c, cps);
    }
  }

  // ---- input mirror ----
  function renderInput() {
    const v = input.value;
    const pos = input.selectionStart ?? v.length;
    before.textContent = v.slice(0, pos);
    cursor.textContent = v[pos] ?? " ";
    after.textContent = v.slice(pos + 1);
  }

  function setBusy(busy) {
    state.busy = busy;
    form.hidden = busy;
    cursor.classList.toggle("busy", busy);
    if (!busy) {
      state.skipTyping = false;
      focusInput();
    }
  }

  function focusInput() {
    if (!form.hidden) input.focus({ preventScroll: true });
    scrollDown();
  }

  // ---- local commands ----
  const commands = {
    help: {
      desc: "list commands",
      run: () => typeBlock(
        Object.entries(commands)
          .map(([name, c]) => "  /" + name.padEnd(8) + c.desc)
          .concat(["", "  Anything else gets sent to Barry.", "  Up/Down recalls history. Any key skips typing."])
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
      desc: "toggle flicker and wobble",
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
        return typeLine("Barry's short-term memory wiped. He won't mind.", "dim");
      },
    },
    reboot: {
      desc: "power cycle the terminal",
      run: () => boot(true),
    },
    about: {
      desc: "what is this",
      run: () => typeBlock(
        "BARRY TERMINAL v" + window.Barry.version + "\nCRT front end. Brain lives in barry.js.",
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

  async function talkToBarry(text) {
    state.history.push({ role: "user", text });
    const thinking = addLine("BARRY is thinking", "dim");
    let dots = 0;
    const timer = setInterval(() => {
      dots = (dots + 1) % 4;
      thinking.textContent = "BARRY is thinking" + ".".repeat(dots);
    }, 300);

    try {
      const reply = await window.Barry.reply(text, state.history.slice());
      clearInterval(timer);
      thinking.remove();
      state.history.push({ role: "barry", text: reply });
      await typeBlock(reply, "barry", 45);
    } catch (err) {
      clearInterval(timer);
      thinking.remove();
      console.error(err);
      await typeLine("CARRIER LOST. Barry didn't answer (" + (err.message || err) + ").", "error");
    }
  }

  async function submit(line) {
    const text = line.trim();
    if (!text) return;
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
    await sleep(reducedMotion ? 0 : 650);

    const lines = [
      ["BARRY SYSTEMS (C) 1984", "dim", 120],
      ["MEMORY CHECK ........ 640K OK", "dim", 120],
      ["PHOSPHOR ............ " + document.body.dataset.theme.toUpperCase(), "dim", 120],
      ["LOADING PERSONALITY . OK", "dim", 120],
      ["", "", 120],
    ];
    for (const [text, cls, cps] of lines) await typeLine(text, cls, cps);
    await typeBlock(isReboot
      ? "Back again. Did you turn me off and on to fix something? Classic."
      : "Alright. I'm Barry.\nType something, or /help if you're the cautious type.", "barry", 40);
    addLine("");
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

  input.addEventListener("focus", () => screen.classList.add("focused"));
  input.addEventListener("blur", () => screen.classList.remove("focused"));

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
