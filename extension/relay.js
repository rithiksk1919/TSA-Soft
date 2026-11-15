// Runs in the extension's isolated world on every page and frame. It keeps checking whether the
// page is school or education related, and only then passes the actions recorded by hook.js on to
// the background worker. Actions on other pages are dropped here and never leave the page.
//
// The check is local and simple: a list of learning sites and school domains, plus a count of
// education words in the page's title, headings, description and opening text. It runs when the
// page loads, whenever the address or title changes, and every 5 seconds. Each frame is judged
// on its own, so an ad inside a school page is not recorded.
(function () {
  const TOP = window.top === window;

  function post(message) {
    try {
      chrome.runtime.sendMessage(message).catch(function () {});
    } catch (error) {
      /* the extension was reloaded: this page keeps working, it just stops logging */
    }
  }

  /* ---- is this page about school? ---- */
  const SITES = [
    "khanacademy", "coursera", "edx.org", "udemy", "udacity", "brilliant.org", "codecademy", "freecodecamp",
    "quizlet", "quizizz", "kahoot", "gimkit", "blooket", "duolingo", "memrise", "ankiweb",
    "instructure.com", "classroom.google", "schoology", "blackboard", "moodle", "brightspace", "d2l.com",
    "powerschool", "infinitecampus", "edpuzzle", "nearpod", "peardeck", "flipgrid", "seesaw", "clever.com",
    "ixl.com", "deltamath", "mathway", "desmos", "geogebra", "wolframalpha", "symbolab", "mathsisfun", "purplemath",
    "chegg", "studocu", "coursehero", "sparknotes", "cliffsnotes", "litcharts", "shmoop", "byjus", "toppr",
    "britannica", "wikipedia.org", "scholar.google", "jstor", "pubmed", "openstax", "ck12", "collegeboard",
    "w3schools", "geeksforgeeks", "leetcode", "hackerrank", "exercism", "codingbat", "programiz",
    "readworks", "newsela", "commonlit", "noredink", "turnitin", "albert.io", "phet.colorado",
    "physicsclassroom", "libretexts", "tsaweb.org"
  ];
  // AI assistants are used for everything, so they count as school work on less evidence:
  // two school words, or any maths, in the conversation.
  const ASSISTANTS = ["chatgpt.com", "chat.openai.com", "claude.ai", "gemini.google.com", "copilot.microsoft.com", "perplexity.ai", "chat.deepseek.com", "poe.com", "meta.ai", "grok.com"];
  const DOMAIN = /(\.edu(\.[a-z]{2})?$|\.ac\.[a-z]{2}$|\.k12\.|\.sch\.|school|academy|college|university)/i;
  const WORDS = [
    "lesson", "homework", "assignment", "quiz", "exam", "test prep", "midterm", "course", "lecture",
    "syllabus", "tutorial", "practice problem", "worksheet", "study", "flashcard", "textbook", "chapter",
    "curriculum", "teacher", "student", "classroom", "school", "university", "college", "learn", "learning",
    "exercise", "equation", "theorem", "algebra", "geometry", "calculus", "statistics", "physics",
    "chemistry", "biology", "history", "geography", "essay", "grammar", "vocabulary", "reading comprehension",
    "programming", "debugging", "mastery", "transfer check", "worked example", "answer key", "grade",
    "due date", "rubric", "lab report", "science fair", "mistake", "practice",
    // maths
    "solve", "simplify", "factor", "expand", "evaluate", "derivative", "integral", "limit", "fraction", "decimal",
    "percent", "ratio", "proportion", "polynomial", "quadratic", "linear", "slope", "intercept", "function",
    "graph", "variable", "coefficient", "exponent", "logarithm", "square root", "matrix", "vector", "probability",
    "median", "standard deviation", "proof", "formula", "trigonometry", "sine", "cosine", "angle",
    "triangle", "perimeter", "volume", "arithmetic", "multiplication", "division", "math", "maths",
    // science, writing, languages, coding
    "hypothesis", "experiment", "molecule", "atom", "photosynthesis", "velocity", "acceleration",
    "chemical reaction", "periodic table", "evolution", "thesis", "paragraph", "citation",
    "poem", "novel", "conjugate", "algorithm", "recursion", "syntax error",
    // asking for help
    "step by step", "show your work", "how do i solve", "what is the answer"
  ].map(function (w) {
    return { w: w, re: new RegExp("\\b" + w.replace(/ /g, "\\s+") + "(s|es|ing)?\\b") };
  });

  // The words that matter: title, description, headings and the page's main content (not its
  // menus and sidebars). Long pages and chats are read at both ends, so the newest part of a
  // conversation always counts, and so does a question being typed right now.
  function pageText() {
    const meta = document.querySelector('meta[name="description"], meta[property="og:description"]');
    const heads = Array.from(document.querySelectorAll("h1, h2, h3")).slice(0, 20).map(function (h) {
      return h.innerText;
    }).join(" ");
    const main = document.querySelector("main, [role=main], article") || document.body;
    const all = main ? main.innerText || "" : "";
    const body = all.length > 12000 ? all.slice(0, 5000) + " " + all.slice(-7000) : all;
    const active = document.activeElement;
    let typing = "";
    if (active && active.type !== "password" && (active.isContentEditable || /^(TEXTAREA|INPUT)$/.test(active.tagName))) {
      typing = (active.isContentEditable ? active.innerText : active.value) || "";
    }
    return (document.title + " " + (meta ? meta.content : "") + " " + heads + " " + body + " " + typing.slice(0, 2000)).toLowerCase();
  }

  // Maths on the page: rendered formulas (KaTeX, MathJax, MathML), LaTeX, symbols or written equations.
  function hasMath(text, assistant) {
    if (document.querySelector(".katex, .MathJax, mjx-container, math")) {
      return "rendered formulas";
    }
    if (/\\(frac|sqrt|int|sum|lim|cdot|times|pi|theta)\b|\$\$[^$]+\$\$/.test(text)) {
      return "LaTeX";
    }
    if (/[∫√∑π≤≥≠±÷×²³]/.test(text)) {
      return "maths symbols";
    }
    // 2x + 3 = 11, x^2 - 4 = 0, 3/4 + 1/2, f(x) =
    const eq = text.match(/\b\d*[a-z]\s*(\^\s*\d|[+\-*\/]\s*\d)[^=\n]{0,20}=\s*-?\d|\b\d+\s*\/\s*\d+\s*[+\-*]\s*\d+\s*\/\s*\d+|\bf\s*\(\s*x\s*\)\s*=/);
    if (eq) {
      return "equation “" + eq[0].trim().slice(0, 24) + "”";
    }
    // a sum asked for in words: "what's 2+2", "calculate 12 x 3", "what is 7 times 8"
    const ask = text.match(/\b(what'?s|what is|calculate|compute|solve|work out|how much is)\s+\(?-?\d+(\.\d+)?\s*([-+*\/×÷x^]|times|plus|minus|divided by)\s*\(?-?\d+/);
    if (ask) {
      return "arithmetic “" + ask[0].trim().slice(0, 24) + "”";
    }
    // in an AI chat, a bare sum like 2+2 or 12 × 3 is enough (not - or /, which dates use)
    const bare = assistant && text.match(/(?<![\w.:\/-])\d+(\.\d+)?\s*[+*×÷^]\s*\d+(?![\w.\/-])/);
    return bare ? "arithmetic “" + bare[0].trim() + "”" : "";
  }

  // Search engines: only the search counts ("solve 2x+3=11" is school, "pizza near me" is not).
  function searchQuery() {
    const host = location.hostname.toLowerCase();
    if (!/(^|\.)(google|bing|duckduckgo|yahoo|ecosia|brave|startpage)\.[a-z.]+$/.test(host) || !/search|^\/$/.test(location.pathname)) {
      return null;
    }
    const q = new URLSearchParams(location.search).get("q") || new URLSearchParams(location.search).get("p");
    return q === null ? null : q.toLowerCase();
  }

  function classify() {
    const host = location.hostname.toLowerCase();
    const href = location.href.toLowerCase();
    const reasons = [];
    const query = searchQuery();
    if (query !== null) {
      const qMath = hasMath(query + " ", true);
      const qWords = WORDS.filter(function (k) {
        return k.re.test(query);
      }).map(function (k) {
        return k.w;
      });
      if (qMath) {
        reasons.push("maths in the search: " + qMath);
      }
      if (qWords.length) {
        reasons.push("school words in the search (" + qWords.slice(0, 5).join(", ") + ")");
      }
      return { education: !!qMath || qWords.length >= 1, reasons: reasons.length ? reasons : ["search: “" + query.slice(0, 40) + "”"] };
    }
    const site = SITES.find(function (s) {
      return host.includes(s) || href.includes(s);
    });
    if (site) {
      reasons.push("learning site (" + site + ")");
    }
    const schoolDomain = DOMAIN.test(host);
    if (schoolDomain) {
      reasons.push("school address (" + host + ")");
    }
    const skillbridge = /skillbridge/i.test(document.title);
    if (skillbridge) {
      reasons.push("SkillBridge");
    }
    const text = pageText();
    const assistant = ASSISTANTS.find(function (a) {
      return host === a || host.endsWith("." + a);
    });
    const math = hasMath(text, !!assistant);
    if (math) {
      reasons.push("maths: " + math);
    }
    const hits = WORDS.filter(function (k) {
      return k.re.test(text);
    }).map(function (k) {
      return k.w;
    });
    if (hits.length) {
      reasons.push(hits.length + " school words (" + hits.slice(0, 5).join(", ") + ")");
    }
    // A known site, a school address or SkillBridge is enough. Otherwise a page needs four
    // different school words, or maths and two words; an AI assistant needs two words or maths.
    let education = !!site || schoolDomain || skillbridge || hits.length >= 4 || (!!math && hits.length >= 2);
    if (assistant && (hits.length >= 2 || math)) {
      education = true;
      reasons.unshift("study help on " + assistant);
    }
    return { education: education, reasons: reasons };
  }

  /* ---- gate ---- */
  let soon = 0;
  let verdict = null;            // null until the first check
  const early = [];              // actions from before the first check
  // The last minute of actions on a page that is not (yet) school work, kept only in this page's
  // memory: if the page turns into school work (a maths question is typed), they are kept;
  // otherwise they expire here and never leave the page.
  const recent = [];
  function remember(ev) {
    recent.push(ev);
    const cutoff = Date.now() - 60000;
    while (recent.length && (recent[0].t < cutoff || recent.length > 200)) {
      recent.shift();
    }
  }
  function check() {
    if (!document.body) {
      return;
    }
    const v = classify();
    const changed = !verdict || v.education !== verdict.education || v.reasons.join() !== verdict.reasons.join();
    const turnedOn = v.education && (!verdict || !verdict.education);
    verdict = v;
    if (turnedOn && recent.length) {
      // keep only the lead-up to this question: back to the previous message sent (Enter or a
      // form submit before the latest one) and at most a minute
      const cutoff = Date.now() - 60000;
      let start = recent.length;
      let sends = 0;
      for (let i = recent.length - 1; i >= 0 && recent[i].t >= cutoff; i--) {
        const ev = recent[i];
        const sent = (ev.type === "key" && ev.detail && ev.detail.key === "Enter" && !(ev.detail.keys || []).length) || (ev.type === "input" && /^Submitted/.test(ev.summary));
        if (sent && ++sends > 1) {
          break;
        }
        start = i;
      }
      for (const ev of recent.slice(start)) {
        post({ kind: "event", event: ev });
      }
      recent.length = 0;
    }
    if (changed && TOP) {
      post({ kind: "gate", education: v.education, reasons: v.reasons, url: location.href, title: document.title });
    }
    if (early.length) {
      for (const ev of early.splice(0)) {
        if (v.education) {
          post({ kind: "event", event: ev });
        } else {
          remember(ev);
        }
      }
    }
  }

  post({ kind: "hello", url: location.href, top: TOP });
  document.addEventListener("sb-action-log-hello", function () {
    document.dispatchEvent(new CustomEvent("sb-action-log-ready"));
  });
  document.addEventListener("sb-action-log", function (ev) {
    let event;
    try {
      event = JSON.parse(ev.detail);
    } catch (error) {
      return;
    }
    if (verdict === null) {
      if (early.length < 300) {
        early.push(event);
      }
      return;
    }
    // a move inside the page can change the answer: check again first
    if (event.type === "nav") {
      check();
    }
    if (verdict.education) {
      post({ kind: "event", event: event });
    } else {
      remember(event);
      // typing or sending a question can change the answer straight away
      if (event.type === "input" || event.type === "key" || event.type === "click") {
        clearTimeout(soon);
        soon = setTimeout(check, 400);
      }
    }
  });
  // tell hook.js it can send (it may have started first)
  document.dispatchEvent(new CustomEvent("sb-action-log-ready"));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", check, { once: true });
  } else {
    check();
  }
  setInterval(check, 5000);
  let lastTitle = document.title;
  setInterval(function () {
    if (document.title !== lastTitle) {
      lastTitle = document.title;
      check();
    }
  }, 1000);
})();
