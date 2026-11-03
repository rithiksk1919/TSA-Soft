// Minimal dependency-free code editor: textarea over a highlighted <pre>, line gutter, Tab = 4 spaces.
import { esc } from "./ui.js";

const KW = new Set("False None True and as assert break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "));
const BI = new Set("print len range sum min max abs round int float str list dict set tuple sorted enumerate zip map filter isinstance callable any all".split(" "));

function highlight(code) {
  const re = /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b/g;
  let out = "", last = 0, m, prevDef = false;
  while ((m = re.exec(code))) {
    out += esc(code.slice(last, m.index));
    if (m[1]) out += `<span class="tok-com">${esc(m[1])}</span>`;
    else if (m[2]) out += `<span class="tok-str">${esc(m[2])}</span>`;
    else if (m[3]) out += `<span class="tok-num">${m[3]}</span>`;
    else if (m[4]) {
      const w = m[4];
      if (prevDef) out += `<span class="tok-fn">${w}</span>`;
      else if (KW.has(w)) out += `<span class="tok-kw">${w}</span>`;
      else if (BI.has(w)) out += `<span class="tok-bi">${w}</span>`;
      else out += w;
      prevDef = w === "def" || w === "class";
      last = re.lastIndex;
      continue;
    }
    prevDef = false;
    last = re.lastIndex;
  }
  return out + esc(code.slice(last)) + "\n";
}

export function createEditor(host, initial, { onChange, readOnly = false } = {}) {
  host.innerHTML = `<div class="editor"><div class="gutter"></div><div class="code-area"><pre aria-hidden="true"></pre><textarea spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Code editor"></textarea></div></div>`;
  const ta = host.querySelector("textarea"), pre = host.querySelector("pre"), gutter = host.querySelector(".gutter");
  let errLine = null;
  ta.value = initial || "";
  ta.readOnly = readOnly;
  const paint = () => {
    pre.innerHTML = highlight(ta.value);
    const n = ta.value.split("\n").length;
    gutter.innerHTML = Array.from({ length: n }, (_, i) => `<div class="${i + 1 === errLine ? "err" : ""}">${i + 1 === errLine ? "●" : i + 1}</div>`).join("");
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, 280)}px`;
  };
  ta.addEventListener("input", () => { errLine = null; paint(); onChange && onChange(ta.value); });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const s = ta.selectionStart;
      ta.setRangeText("    ", s, ta.selectionEnd, "end");
      ta.dispatchEvent(new Event("input"));
    } else if (e.key === "Enter") {
      const s = ta.selectionStart;
      const line = ta.value.slice(0, s).split("\n").pop();
      let indent = line.match(/^\s*/)[0];
      if (/:\s*$/.test(line)) indent += "    ";
      e.preventDefault();
      ta.setRangeText("\n" + indent, s, ta.selectionEnd, "end");
      ta.dispatchEvent(new Event("input"));
    }
  });
  paint();
  return {
    get value() { return ta.value; },
    set value(v) { ta.value = v; paint(); },
    setErrorLine(n) { errLine = n; paint(); },
    focus() { ta.focus(); },
  };
}
