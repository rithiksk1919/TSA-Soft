/* Your subjects: folders of files you upload, each one a book on the shelf.

   - SkillBridge.mine.ready / .list / .onChange: your subjects as shelf books (library.js and
     room.js add them to the flat shelf and to your section of the room's bookcase).
   - SkillBridge.mine.openUploads(): the upload window. Drop folders (each top folder is a
     subject, folders inside it are chapters) or pick one; a preview shows what was found
     before anything is copied. Rename and delete subjects there too.
   - SkillBridge.mine.renderReader(subject, el): the open book for one of your subjects: its
     chapters and files on the left, the open file (or your mistakes in that subject) on the right.

   Files are sent one at a time to the local SkillBridge server (PUT /api/my-files/...), which
   keeps them in data/uploads/ on this computer. */
(function () {
  "use strict";
  var SB = window.SkillBridge = window.SkillBridge || {};
  var listeners = [];
  var mine = SB.mine = { list: [], unfiled: 0 };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var count = new Intl.NumberFormat();
  function size(n) {
    if (n < 1024) return count.format(n) + " B";
    if (n < 1048576) return count.format(Math.round(n / 1024)) + " KB";
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(n / 1048576) + " MB";
  }
  function plural(n, one, many) { return count.format(n) + " " + (n === 1 ? one : many); }
  function fileUrl(sid, path) {
    return "/api/my-files/" + sid + "/" + path.split("/").map(encodeURIComponent).join("/");
  }
  var LOGO = { biology: "dna", chemistry: "flask", science: "flask" };

  function toBook(s) {
    return {
      id: "my-" + s.id, sid: s.id, kind: "uploaded", name: s.name, accent: s.color,
      logo: LOGO[s.topic] || "atom", book: { width: 84, height: 206 }, skills: [], next: null,
      files: s.files, size: s.size, chapters: s.chapters, mistakes: s.mistakes || [], organized: s.organized || {}
    };
  }

  function api(method, url, body) {
    var opts = { method: method, headers: {} };
    if (body !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.error || "The app answered " + r.status + ".");
        return d;
      });
    });
  }

  function load() {
    return api("GET", "/api/my-subjects").then(function (d) {
      mine.list = (d.subjects || []).map(toBook);
      mine.unfiled = d.unfiled || 0;
      return mine.list;
    }).catch(function () {
      mine.list = [];
      return mine.list;
    });
  }
  mine.ready = load();
  mine.onChange = function (fn) { listeners.push(fn); };
  mine.refresh = function () {
    return load().then(function (list) {
      listeners.forEach(function (fn) { try { fn(list); } catch (e) { /* one listener failing does not stop the rest */ } });
      return list;
    });
  };

  /* ================= the open book ================= */
  // Left page: the contents (Gemini's chapters when the subject has been organised, then your
  // mistakes and all your files). Right page: whatever is chosen on the left.

  var KIND_LABEL = { pdf: "PDF", image: "Image", audio: "Audio", video: "Video", document: "Document", slides: "Slides", sheet: "Spreadsheet", text: "Text", file: "File" };
  var books = {};       // sid -> { generated, data } (the organised book, fetched once per version)
  var chosen = {};      // sid -> what is open on the right ("ch-0", "mistakes", "files", "file:<path>")
  var polls = {};
  var timeFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  function allFiles(s) {
    var out = [];
    s.chapters.forEach(function (c) { c.files.forEach(function (f) { out.push(f); }); });
    return out;
  }

  function loadBook(s) {
    var o = s.organized || {};
    if (!o.done) return Promise.resolve(null);
    var have = books[s.sid];
    if (have && have.generated === o.generated) return Promise.resolve(have.data);
    return api("GET", "/api/my-subjects/" + s.sid + "/book").then(function (d) {
      books[s.sid] = { generated: o.generated, data: d };
      return d;
    }).catch(function () { return null; });
  }

  // While Gemini works, check every few seconds; the shelf and the open book update when it's done.
  function watch(s) {
    if (polls[s.sid]) return;
    polls[s.sid] = setInterval(function () {
      api("GET", "/api/my-subjects").then(function (d) {
        var now = (d.subjects || []).find(function (x) { return x.id === s.sid; });
        if (!now || (now.organized || {}).state !== "running") {
          clearInterval(polls[s.sid]);
          delete polls[s.sid];
          mine.refresh();
        } else {
          var st = document.querySelector('.org-status[data-sid="' + s.sid + '"] .org-step');
          if (st && now.organized.step) st.textContent = now.organized.step + "…";
        }
      });
    }, 3000);
  }

  function organize(s) {
    return api("POST", "/api/my-subjects/" + s.sid + "/organize").then(function () {
      s.organized = Object.assign({}, s.organized, { state: "running", step: "Reading your files" });
      watch(s);
    });
  }

  function statusHtml(s, data) {
    var o = s.organized || {};
    var h = '<div class="org-status" data-sid="' + esc(s.sid) + '" role="status">';
    if (o.state === "running") {
      h += '<span class="org-dot org-dot--busy" aria-hidden="true"></span><span class="org-step">' + esc(o.step || "Gemini is reading your files") + "…</span>";
    } else if (o.state === "error") {
      h += '<span class="org-dot org-dot--bad" aria-hidden="true"></span><span>Couldn’t organise: ' + esc(o.error || "something went wrong") + '</span> <button type="button" class="mine-link" data-act="organize">Try again</button>';
    } else if (o.done && data) {
      h += '<span class="org-dot" aria-hidden="true"></span><span>Organised by Gemini, ' + esc(timeFmt.format(new Date(o.generated * 1000))) + (o.stale ? ". You’ve added files since." : ".") + "</span> " +
        '<button type="button" class="mine-link" data-act="organize">' + (o.stale ? "Organise again" : "Reorganise") + "</button>";
    } else if (o.available) {
      h += '<span>Let Gemini read these files and lay them out as chapters, notes and practice.</span> <button type="button" class="mine-btn mine-btn--main" data-act="organize">Organise with Gemini</button>';
    } else {
      h += "<span>Add a Gemini API key to have these files organised for you.</span>";
    }
    return h + "</div>";
  }

  mine.renderReader = function (s, el) {
    var data = books[s.sid] && books[s.sid].generated === (s.organized || {}).generated ? books[s.sid].data : null;
    paint(s, el, data);
    if ((s.organized || {}).state === "running") watch(s);
    if (!data && (s.organized || {}).done) {
      loadBook(s).then(function (d) { if (d && el.left.querySelector('.org-status[data-sid="' + s.sid + '"]')) paint(s, el, d); });
    }
  };

  function paint(s, el, data) {
    var b = data && data.book;
    var nav = "";
    if (b) {
      nav += b.chapters.map(function (c, i) {
        return '<li><button type="button" class="toc" data-open="ch-' + i + '"><span class="toc__n">' + (i + 1) + '</span><span class="toc__t">' + esc(c.title) + '</span><span class="toc__s">' + esc(c.summary) + "</span></button></li>";
      }).join("");
    }
    var nMistakes = s.mistakes.length;
    nav += '<li><button type="button" class="toc toc--aside" data-open="mistakes"><span class="toc__n" aria-hidden="true">!</span><span class="toc__t">Mistakes to review</span><span class="toc__s">' + plural(nMistakes, "mistake", "mistakes") + " in " + esc(s.name) + "</span></button></li>";
    nav += '<li><button type="button" class="toc toc--aside" data-open="files"><span class="toc__n" aria-hidden="true">≡</span><span class="toc__t">Your files</span><span class="toc__s">' + plural(s.files, "file", "files") + " · " + esc(size(s.size)) + "</span></button></li>";

    el.left.innerHTML =
      '<div class="stand-head"><div>' +
        '<p class="eyebrow">Your subject</p>' +
        '<h2 class="page-title" id="where-title" tabindex="-1">' + esc(b ? b.title || s.name : s.name) + "</h2>" +
        '<p class="summary">' + esc(b ? b.overview : plural(s.files, "file", "files") + " in " + plural(s.chapters.length, "folder", "folders")) + "</p>" +
      "</div></div>" +
      statusHtml(s, data) +
      // the contents always show, so a book of mistakes alone (no files yet) still works
      (s.files ? "" : '<p class="mine-empty">No files yet. <button type="button" class="mine-link" data-act="add">Add files to ' + esc(s.name) + "</button></p>") +
      '<nav class="toc-nav" aria-label="Contents"><ol class="toc-list">' + nav + "</ol></nav>";

    // Until the organised book has loaded, show the files without remembering that as the
    // choice, so the first chapter opens as soon as the book arrives.
    var pick = chosen[s.sid] || (b && b.chapters.length ? "ch-0" : "files");
    if (/^ch-/.test(pick) && !(b && b.chapters[+pick.slice(3)])) pick = "files";
    var waiting = !b && (s.organized || {}).done;
    show(s, el, data, pick, waiting);

    el.left.onclick = function (e) {
      var t = e.target.closest("[data-open]");
      if (t) { show(s, el, data, t.dataset.open); return; }
      if (e.target.closest('[data-act="add"]')) { mine.openUploads({ subject: s.sid }); return; }
      if (e.target.closest('[data-act="organize"]')) {
        organize(s).then(function () { paint(s, el, data); }, function (err) {
          var st = el.left.querySelector(".org-status");
          if (st) st.textContent = err.message;
        });
      }
    };
  }

  function show(s, el, data, what, dontRemember) {
    if (!dontRemember) chosen[s.sid] = what;
    el.left.querySelectorAll("[data-open]").forEach(function (b) {
      var on = b.dataset.open === what || (what.indexOf("file:") === 0 && b.dataset.open === "files");
      b.classList.toggle("is-open", on);
      if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
    });
    var b = data && data.book;
    if (/^ch-/.test(what) && b) return showChapter(s, el, b.chapters[+what.slice(3)], +what.slice(3), data);
    if (what === "mistakes") return showReview(s, el, b);
    if (what.indexOf("file:") === 0) {
      var f = allFiles(s).find(function (x) { return x.path === what.slice(5); });
      if (f) return showFile(s, f, el, data);
    }
    return showFiles(s, el, data);
  }

  function sourceButtons(s, paths) {
    if (!paths || !paths.length) return "";
    return '<p class="org-sources"><span>From your files:</span> ' + paths.map(function (p) {
      return '<button type="button" class="org-src" data-file="' + esc(p) + '">' + esc(p.split("/").pop()) + "</button>";
    }).join(" ") + "</p>";
  }

  function wireRight(s, el, data) {
    el.right.onclick = function (e) {
      var f = e.target.closest("[data-file]");
      if (f) { show(s, el, data, "file:" + f.dataset.file); return; }
      var back = e.target.closest("[data-back]");
      if (back) show(s, el, data, back.dataset.back);
    };
  }

  function showChapter(s, el, c, i, data) {
    var sections = c.sections.map(function (sec) {
      var h = '<section class="org-sec"><h3 class="org-h">' + esc(sec.heading) + "</h3>";
      if (sec.notes && sec.notes.length) h += '<ul class="org-notes">' + sec.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>";
      if (sec.example) h += '<div class="org-ex"><p class="org-label">Worked example</p><p class="org-ex__body">' + esc(sec.example) + "</p></div>";
      if (sec.key_terms && sec.key_terms.length) {
        h += '<dl class="org-terms">' + sec.key_terms.map(function (k) { return "<div><dt>" + esc(k.term) + "</dt><dd>" + esc(k.meaning) + "</dd></div>"; }).join("") + "</dl>";
      }
      if (sec.check && sec.check.length) {
        h += '<div class="org-check"><p class="org-label">Check yourself</p>' + sec.check.map(function (q) {
          return "<details><summary>" + esc(q.question) + "</summary><p>" + esc(q.answer) + "</p></details>";
        }).join("") + "</div>";
      }
      return h + "</section>";
    }).join("");
    el.right.innerHTML =
      '<div class="mine-right org-page">' +
        '<p class="org-chapter-n">Chapter ' + (i + 1) + "</p>" +
        '<h2 class="org-title" id="next-title">' + esc(c.title) + "</h2>" +
        '<p class="org-summary">' + esc(c.summary) + "</p>" +
        sourceButtons(s, c.sources) + sections +
      "</div>";
    el.right.scrollTop = 0;
    wireRight(s, el, data);
  }

  // Mistakes: a form to add your own, then every mistake in this subject (the ones you added and
  // the ones the Action Log caught), each with Gemini's explanation when there is one.
  function norm(t) { return String(t || "").toLowerCase().replace(/[^a-z0-9+=×÷*/.-]+/g, " ").trim(); }

  function reviewFor(b, q) {
    if (!b || !b.mistake_review) return null;
    var nq = norm(q);
    return b.mistake_review.find(function (r) { var nr = norm(r.question); return nr && (nr === nq || nq.indexOf(nr) >= 0 || nr.indexOf(nq) >= 0); }) || null;
  }

  function showReview(s, el, b, opts) {
    opts = opts || {};
    var rows = s.mistakes.map(function (m, i) {
      var q = m.what || "";
      var asked = /^Asked “([\s\S]*)”$/.exec(q);
      if (asked) q = asked[1];
      var r = reviewFor(b, q);
      var right = m.detail || (r && r.correct_answer) || "";
      var why = m.why || (r && r.why) || "";
      var tip = m.tip || (r && r.tip) || "";
      var when = m.when ? timeFmt.format(new Date(String(m.when).replace(" ", "T"))) : "";
      return '<li class="mm' + (m.manual ? " mm--mine" : "") + '" data-mid="' + esc(m.id || "") + '" data-i="' + i + '">' +
        '<button type="button" class="mm__q mm__open" data-mk="open" aria-label="Practise at the reading desk: ' + esc(q) + '">' + esc(q) +
          '<span class="mm__go" aria-hidden="true">At the desk</span></button>' +
        (m.answered || right ? '<p class="mm__a">' + (m.answered ? 'You: <b class="mm__you">' + esc(m.answered) + "</b>" : "") +
          (m.answered && right ? " · " : "") + (right ? 'Answer: <b class="mm__right">' + esc(right) + "</b>" : "") + "</p>" : "") +
        (m.note ? '<p class="mm__note">' + esc(m.note) + "</p>" : "") +
        (why ? '<p class="mm__why">' + esc(why) + "</p>" : "") +
        (tip ? '<p class="mm__tip">' + esc(tip) + "</p>" : "") +
        (m.manual && opts.explaining === m.id ? '<p class="mm__busy" role="status"><span class="org-dot org-dot--busy" aria-hidden="true"></span>Gemini is explaining this…</p>' : "") +
        (m.manual && opts.desking === m.id ? '<p class="mm__busy" role="status"><span class="org-dot org-dot--busy" aria-hidden="true"></span>Writing a reading-desk exercise from it…</p>' : "") +
        (m.manual && opts.problem && opts.problem.id === m.id ? '<p class="mm__err" role="alert">' + esc(opts.problem.text) + "</p>" : "") +
        '<div class="mm__foot"><span class="mm__src">' + esc(m.manual ? "Added by you" : (m.page || "From the Action Log")) + (when ? " · " + esc(when) : "") + "</span>" +
          (m.manual ? '<span class="mm__acts">' +
            (m.cards || (m.answered && right && m.answered !== right) ? '<button type="button" class="mine-btn mm__practise" data-mk="practise">Practise' + (m.cards ? " " + m.cards + " cards" : "") + "</button>" : "") +
            (m.desk ? '<button type="button" class="mine-link" data-mk="desk">At the desk</button>'
              : (s.organized || {}).available && opts.desking !== m.id ? '<button type="button" class="mine-link" data-mk="mkdesk">Make a desk exercise</button>' : "") +
            (!why && (s.organized || {}).available ? '<button type="button" class="mine-link" data-mk="explain">Explain it</button>' : "") +
            '<button type="button" class="mine-link mine-link--bad" data-mk="delete">Delete</button></span>' : "") +
        "</div></li>";
    }).join("");
    var gemini = (s.organized || {}).available;
    el.right.innerHTML =
      '<div class="mine-right">' +
        '<div class="mm-head"><h2 class="org-title" id="next-title">Mistakes to review</h2>' +
          '<button type="button" class="mine-btn mine-btn--main" data-mk="new"' + (opts.form ? " hidden" : "") + ">Add a mistake</button></div>" +
        '<form class="mk-form" id="mk-form"' + (opts.form ? "" : " hidden") + ">" +
          '<label class="up__field"><span>The question or problem</span><textarea name="question" rows="2" required autocomplete="off" placeholder="e.g. Balance H2 + O2 → H2O…"></textarea></label>' +
          '<div class="mk-form__two">' +
            '<label class="up__field"><span>Your answer</span><input type="text" name="your_answer" autocomplete="off" placeholder="What you put…"></label>' +
            '<label class="up__field"><span>The right answer</span><input type="text" name="correct_answer" autocomplete="off" placeholder="' + (gemini ? "Blank: Gemini works it out…" : "If you know it…") + '"></label>' +
          "</div>" +
          '<label class="up__field"><span>What went wrong <i>(optional)</i></span><input type="text" name="note" autocomplete="off" placeholder="e.g. forgot to balance the oxygen…"></label>' +
          '<p class="mk-form__err" role="alert" hidden></p>' +
          '<div class="up__actions"><button type="submit" class="mine-btn mine-btn--main">Save mistake</button><button type="button" class="mine-btn" data-mk="cancel">Cancel</button></div>' +
        "</form>" +
        (rows ? '<ol class="mm-list">' + rows + "</ol>"
          : '<p class="mine-note">No mistakes here yet. Add one you made in class or on homework, or let the Action Log extension catch them as you work.</p>') +
      "</div>";

    var form = el.right.querySelector("#mk-form");
    var newBtn = el.right.querySelector('[data-mk="new"]');
    if (opts.form) form.querySelector("textarea").focus();
    newBtn.onclick = function () { form.hidden = false; newBtn.hidden = true; form.querySelector("textarea").focus(); };
    form.querySelector('[data-mk="cancel"]').onclick = function () { form.reset(); form.hidden = true; newBtn.hidden = false; newBtn.focus(); };
    form.onsubmit = function (e) {
      e.preventDefault();
      var fd = new FormData(form);
      var body = { question: fd.get("question"), your_answer: fd.get("your_answer"), correct_answer: fd.get("correct_answer"), note: fd.get("note") };
      var err = form.querySelector(".mk-form__err");
      if (!String(body.question).trim()) { err.hidden = false; err.textContent = "Write the question or problem first."; form.querySelector("textarea").focus(); return; }
      var save = form.querySelector('[type="submit"]');
      save.disabled = true;
      save.textContent = "Saving…";
      api("POST", "/api/my-subjects/" + s.sid + "/mistakes", body).then(function (item) {
        return mine.refresh().then(function () { return item; });
      }).then(function (item) {
        var fresh = current(s);
        showReview(fresh, el, b, { explaining: gemini ? item.id : null });
        if (gemini) explainOne(fresh, el, b, item.id); else reloadCards();
      }, function (e2) {
        save.disabled = false;
        save.textContent = "Save mistake";
        err.hidden = false;
        err.textContent = e2.message;
      });
    };
    el.right.querySelector(".mm-list") && (el.right.querySelector(".mm-list").onclick = function (e) {
      var btn = e.target.closest("[data-mk]");
      var li = e.target.closest("[data-mid]");
      if (!btn || !li) return;
      var mid = li.dataset.mid;
      if (btn.dataset.mk === "open") {
        openAtDesk(s, el, b, s.mistakes[+li.dataset.i], btn);
        return;
      }
      if (btn.dataset.mk === "practise") {
        practise("u-" + s.sid + "-" + mid);
        return;
      }
      if (btn.dataset.mk === "mkdesk") {
        showReview(s, el, b, { desking: mid });
        api("POST", "/api/my-subjects/" + s.sid + "/mistakes/" + mid + "/desk").then(mine.refresh).then(function () {
          reloadCards();
          showReview(current(s), el, b);
        }, function (err2) {
          showReview(current(s), el, b, { problem: { id: mid, text: err2.message } });
        });
        return;
      }
      if (btn.dataset.mk === "desk") {
        // close the book and sit at the reading desk with this exercise
        location.href = "/library/#desk-u-" + s.sid + "-" + mid;
        location.reload();
        return;
      }
      if (btn.dataset.mk === "explain") {
        showReview(s, el, b, { explaining: mid });
        explainOne(s, el, b, mid);
      } else if (btn.dataset.mk === "delete") {
        var acts = li.querySelector(".mm__acts");
        acts.innerHTML = '<span class="mm__confirm">Delete this mistake?</span><button type="button" class="mine-btn mine-btn--bad" data-mk="really">Delete</button><button type="button" class="mine-link" data-mk="keep">Keep</button>';
        acts.querySelector('[data-mk="keep"]').focus();
      } else if (btn.dataset.mk === "keep") {
        showReview(s, el, b);
      } else if (btn.dataset.mk === "really") {
        api("DELETE", "/api/my-subjects/" + s.sid + "/mistakes/" + mid).then(mine.refresh).then(function () { reloadCards(); showReview(current(s), el, b); });
      }
    });
  }

  // The card catalog (cards.json) includes the mistakes you add: reload it after each change.
  function reloadCards() {
    if (SB.desk && SB.desk.reload) SB.desk.reload();
    if (SB.store && SB.store.reloadCards) return SB.store.reloadCards().catch(function () {});
    return Promise.resolve();
  }

  // Close the book, then open this mistake's cards for practice (the card catalog's review).
  function practise(cardMistakeId) {
    reloadCards().then(function () {
      var back = document.getElementById("back");
      if (back) back.click();
      var tries = 0;
      (function whenClosed() {
        if ((SB.bookOpen && SB.bookOpen()) && tries++ < 200) { setTimeout(whenClosed, 50); return; }
        if (SB.reviewMistake) SB.reviewMistake(cardMistakeId);
      })();
    });
  }

  function goDesk(sid, mid) {
    location.href = "/library/#desk-u-" + sid + "-" + mid;
    location.reload();
  }

  // A mistake from the list, at the reading desk. One you added goes straight there; one the Action
  // Log caught is added to your mistakes first (so it gets cards and an exercise too).
  function openAtDesk(s, el, b, m, btn) {
    if (!m) return;
    var gemini = (s.organized || {}).available;
    if (m.manual) {
      if (m.desk) { goDesk(s.sid, m.id); return; }
      if (!gemini) { showReview(s, el, b, { problem: { id: m.id, text: "Add the right answer to this mistake to practise it at the desk." } }); return; }
      showReview(s, el, b, { desking: m.id });
      api("POST", "/api/my-subjects/" + s.sid + "/mistakes/" + m.id + "/desk").then(function () { goDesk(s.sid, m.id); }, function (err) {
        showReview(current(s), el, b, { problem: { id: m.id, text: err.message } });
      });
      return;
    }
    var q = m.what || "";
    var asked = /^Asked “([\s\S]*)”$/.exec(q);
    if (asked) q = asked[1];
    q = q.replace(/^(Assistant said|Message|Alert|Dialog): /, "");
    // "7 × 8 = 56" -> "56"; other details are kept as they are
    var right = m.detail || "";
    if (asked && /=/.test(right)) right = right.split("=").pop().trim();
    var same = s.mistakes.find(function (x) { return x.manual && (x.what || "") === "Asked “" + q + "”"; });
    if (same) { openAtDesk(s, el, b, same, btn); return; }
    if (btn) { btn.disabled = true; btn.querySelector(".mm__go").textContent = "Setting up…"; }
    api("POST", "/api/my-subjects/" + s.sid + "/mistakes", { question: q, your_answer: m.answered || "", correct_answer: right, note: m.page ? "From " + m.page : "" })
      .then(function (item) {
        if (gemini) {
          // Gemini writes the explanation, cards and a fuller exercise in the background
          api("POST", "/api/my-subjects/" + s.sid + "/mistakes/" + item.id + "/explain").then(function () {
            return api("POST", "/api/my-subjects/" + s.sid + "/mistakes/" + item.id + "/desk");
          }).catch(function () {});
        }
        if (right) { setTimeout(function () { goDesk(s.sid, item.id); }, 150); return; }
        return mine.refresh().then(function () { openAtDesk(current(s), el, b, current(s).mistakes.find(function (x) { return x.id === item.id; }), null); });
      }, function (err) {
        if (btn) { btn.disabled = false; btn.querySelector(".mm__go").textContent = "At the desk"; }
        showReview(s, el, b, { problem: { id: m.id || "", text: err.message } });
      });
  }

  function current(s) {
    return mine.list.find(function (x) { return x.sid === s.sid; }) || s;
  }

  function explainOne(s, el, b, mid) {
    api("POST", "/api/my-subjects/" + s.sid + "/mistakes/" + mid + "/explain").then(mine.refresh, function () { return null; })
      .then(function () {
        reloadCards();
        if (chosen[s.sid] === "mistakes") showReview(current(s), el, b, { desking: mid });
        // then a reading-desk exercise built on the same mistake (takes a little longer)
        return api("POST", "/api/my-subjects/" + s.sid + "/mistakes/" + mid + "/desk").then(function () { return mine.refresh().then(function () { return null; }); },
          function (err2) { return { id: mid, text: err2.message }; });
      })
      .then(function (problem) { reloadCards(); if (chosen[s.sid] === "mistakes") showReview(current(s), el, b, problem ? { problem: problem } : {}); });
  }

  function showFiles(s, el, data) {
    var chapters = s.chapters.map(function (c) {
      var files = c.files.map(function (f) {
        return '<li><button type="button" class="mf" data-file="' + esc(f.path) + '">' +
          '<span class="mf__kind mf__kind--' + f.kind + '">' + esc(KIND_LABEL[f.kind] || "File") + "</span>" +
          '<span class="mf__name">' + esc(f.folder ? f.folder + "/" + f.name : f.name) + "</span>" +
          '<span class="mf__size">' + esc(size(f.size)) + "</span></button></li>";
      }).join("");
      return '<section class="mch"><h3 class="mch__title">' + esc(c.name) + ' <span class="mch__n">' + plural(c.files.length, "file", "files") + '</span></h3><ul class="mf-list">' + files + "</ul></section>";
    }).join("");
    var skipped = data && data.skipped && data.skipped.length ? '<p class="mine-note">Gemini couldn’t read ' + plural(data.skipped.length, "file", "files") + ": " + esc(data.skipped.map(function (x) { return x.path.split("/").pop() + " (" + x.reason + ")"; }).join(", ")) + ".</p>" : "";
    el.right.innerHTML =
      '<div class="mine-right">' +
        '<h2 class="org-title" id="next-title">Your files</h2>' +
        '<div class="mine-chapters">' + chapters + "</div>" + skipped +
        '<p><button type="button" class="mine-link" data-act-add="1">Add more files</button></p>' +
      "</div>";
    wireRight(s, el, data);
    el.right.querySelector("[data-act-add]").onclick = function () { mine.openUploads({ subject: s.sid }); };
  }

  function showFile(s, f, el, data) {
    var url = fileUrl(s.sid, f.path);
    var view;
    if (!f.opens) {
      view = '<p class="mine-note">This kind of file can’t open inside the library.</p><p><a class="mine-btn" href="' + esc(url) + '" download>Download ' + esc(f.name) + "</a></p>";
    } else if (f.kind === "pdf") {
      view = '<iframe class="mv mv--pdf" src="' + esc(url) + '#view=FitH" title="' + esc(f.name) + '"></iframe>';
    } else if (f.kind === "image") {
      view = '<img class="mv mv--img" src="' + esc(url) + '" alt="' + esc(f.name) + '">';
    } else if (f.kind === "audio") {
      view = '<audio class="mv" controls src="' + esc(url) + '"></audio>';
    } else if (f.kind === "video") {
      view = '<video class="mv mv--video" controls src="' + esc(url) + '"></video>';
    } else {
      view = '<pre class="mv mv--text">Loading…</pre>';
    }
    var back = chosen[s.sid + ":from"] || "files";
    el.right.innerHTML =
      '<div class="mine-right mine-viewer">' +
        '<div class="mv-head"><button type="button" class="mine-link" data-back="files">All your files</button>' +
        '<a class="mine-link" href="' + esc(url) + '" target="_blank" rel="noopener">Open in a new tab</a></div>' +
        '<h2 class="org-title" id="next-title">' + esc(f.name) + "</h2>" + view +
      "</div>";
    void back;
    wireRight(s, el, data);
    var pre = el.right.querySelector(".mv--text");
    if (pre) {
      fetch(url).then(function (r) { return r.text(); }).then(function (t) {
        pre.textContent = t.length > 200000 ? t.slice(0, 200000) + "\n… (the rest is in the file)" : t;
      }).catch(function () { pre.textContent = "This file could not be read."; });
    }
  }

  /* ================= the upload window ================= */

  var dlg = null;
  var picked = null;   // { groups: [{ name, files: [{ file, path }] }], root, flat }

  function build() {
    dlg = document.createElement("dialog");
    dlg.className = "up";
    dlg.setAttribute("aria-labelledby", "up-title");
    dlg.innerHTML =
      '<div class="up__head"><h2 id="up-title">Your subjects</h2>' +
        '<button type="button" class="up__close" aria-label="Close">' +
          '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button></div>' +
      '<p class="up__lead">Each folder you add becomes a book on the shelf. Folders inside it become its chapters. Files stay on this computer.</p>' +
      '<div class="up__drop" id="up-drop">' +
        '<p class="up__drop-title">Drop subject folders here</p>' +
        '<p class="up__drop-sub">or</p>' +
        '<div class="up__drop-btns">' +
          '<button type="button" class="mine-btn mine-btn--main" data-act="folder">Choose a folder</button>' +
          '<button type="button" class="mine-btn" data-act="files">Add files…</button>' +
        "</div>" +
        '<input type="file" id="up-dir" webkitdirectory multiple hidden>' +
        '<input type="file" id="up-files" multiple hidden>' +
      "</div>" +
      '<section class="up__preview" id="up-preview" hidden aria-live="polite"></section>' +
      '<div class="up__progress" id="up-progress" hidden><progress id="up-bar" max="1" value="0"></progress><p id="up-status" role="status"></p></div>' +
      '<section class="up__list"><h3 class="up__h3">On your shelf</h3><ul id="up-subjects"></ul></section>';
    document.body.appendChild(dlg);

    dlg.querySelector(".up__close").onclick = function () { dlg.close(); };
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    var dir = dlg.querySelector("#up-dir");
    var files = dlg.querySelector("#up-files");
    dlg.querySelector('[data-act="folder"]').onclick = function () { dir.value = ""; dir.click(); };
    dlg.querySelector('[data-act="files"]').onclick = function () { files.value = ""; files.click(); };
    dir.onchange = function () {
      preview(Array.prototype.map.call(dir.files, function (f) { return { file: f, path: f.webkitRelativePath || f.name }; }));
    };
    files.onchange = function () {
      preview(Array.prototype.map.call(files.files, function (f) { return { file: f, path: f.name }; }), true);
    };
    var drop = dlg.querySelector("#up-drop");
    ["dragenter", "dragover"].forEach(function (t) {
      drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("is-over"); });
    });
    ["dragleave", "drop"].forEach(function (t) {
      drop.addEventListener(t, function (e) { e.preventDefault(); if (t === "dragleave" && drop.contains(e.relatedTarget)) return; drop.classList.remove("is-over"); });
    });
    drop.addEventListener("drop", function (e) {
      var items = e.dataTransfer && e.dataTransfer.items ? Array.prototype.slice.call(e.dataTransfer.items) : [];
      var entries = items.map(function (it) { return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; }).filter(Boolean);
      if (!entries.length) {
        preview(Array.prototype.map.call(e.dataTransfer.files, function (f) { return { file: f, path: f.name }; }), true);
        return;
      }
      status("Reading the folders…");
      Promise.all(entries.map(function (en) { return walk(en, ""); })).then(function (lists) {
        status("");
        var all = [].concat.apply([], lists);
        preview(all, entries.every(function (en) { return en.isFile; }));
      });
    });
    dlg.querySelector("#up-subjects").addEventListener("click", onListClick);
  }

  // Every file under a dropped folder, with its path from the dropped item.
  function walk(entry, base) {
    return new Promise(function (resolve) {
      if (entry.isFile) {
        entry.file(function (f) { resolve([{ file: f, path: base + entry.name }]); }, function () { resolve([]); });
        return;
      }
      var reader = entry.createReader();
      var out = [];
      (function more() {
        reader.readEntries(function (batch) {
          if (!batch.length) {
            Promise.all(out.map(function (en) { return walk(en, base + entry.name + "/"); })).then(function (lists) {
              resolve([].concat.apply([], lists));
            });
            return;
          }
          out = out.concat(batch);
          more();
        }, function () { resolve([]); });
      })();
    });
  }

  function skip(path) {
    return path.split("/").some(function (p) { return p.charAt(0) === "." || p === "desktop.ini" || p === "Thumbs.db" || p === "__MACOSX"; });
  }

  // Groups the chosen files into subjects: each top folder is one; loose files go to a chosen subject.
  function preview(list, loose, presetSubject) {
    list = list.filter(function (x) { return !skip(x.path); });
    if (!list.length) { status("Nothing to add: the folder was empty."); return; }
    var groups = {};
    var root = null;
    if (!loose) {
      var tops = {};
      list.forEach(function (x) { tops[x.path.split("/")[0]] = 1; });
      var names = Object.keys(tops);
      // one folder picked that holds only folders (e.g. "School/Math", "School/Biology"):
      // offer each folder inside it as its own subject
      if (names.length === 1 && list.every(function (x) { return x.path.split("/").length > 2; })) root = names[0];
    }
    picked = { list: list, loose: !!loose, root: root, split: !!root, preset: presetSubject || null };
    group();
    showPreview();
  }

  function group() {
    var g = {};
    picked.list.forEach(function (x) {
      var parts = x.path.split("/");
      var name, rest;
      if (picked.loose) { name = ""; rest = parts[parts.length - 1]; }
      else if (picked.split) { name = parts[1]; rest = parts.slice(2).join("/"); }
      else { name = parts[0]; rest = parts.slice(1).join("/"); }
      (g[name] = g[name] || { name: name, files: [] }).files.push({ file: x.file, path: rest });
    });
    picked.groups = Object.keys(g).map(function (k) { return g[k]; });
  }

  function showPreview() {
    var box = dlg.querySelector("#up-preview");
    box.hidden = false;
    var subjects = mine.list;
    var rows = picked.groups.map(function (gr, i) {
      var bytes = gr.files.reduce(function (a, f) { return a + f.file.size; }, 0);
      var chapters = {};
      gr.files.forEach(function (f) { var p = f.path.split("/"); if (p.length > 1) chapters[p[0]] = 1; });
      var ch = Object.keys(chapters);
      var nameField;
      if (picked.loose) {
        nameField = '<label class="up__field"><span>Add to</span><select data-i="' + i + '" name="subject-target">' +
          subjects.map(function (s) { return '<option value="' + esc(s.sid) + '"' + (picked.preset === s.sid ? " selected" : "") + ">" + esc(s.name) + "</option>"; }).join("") +
          '<option value="">A new subject…</option></select></label>' +
          '<label class="up__field up__field--new"' + (subjects.length ? " hidden" : "") + '><span>New subject name</span><input type="text" data-i="' + i + '" name="subject-name" autocomplete="off" placeholder="e.g. Biology…"></label>';
      } else {
        nameField = '<label class="up__field"><span>Book name</span><input type="text" data-i="' + i + '" name="subject-name" autocomplete="off" value="' + esc(gr.name) + '"></label>';
      }
      return '<li class="up__row">' + nameField +
        '<p class="up__meta">' + plural(gr.files.length, "file", "files") + " · " + esc(size(bytes)) +
        (ch.length ? " · chapters: " + esc(ch.slice(0, 4).join(", ")) + (ch.length > 4 ? " and " + (ch.length - 4) + " more" : "") : "") + "</p></li>";
    }).join("");
    box.innerHTML =
      '<h3 class="up__h3">' + (picked.loose ? "Ready to add " + plural(picked.list.length, "file", "files") : "Ready to add " + plural(picked.groups.length, "book", "books")) + "</h3>" +
      (picked.root ? '<label class="up__check"><input type="checkbox" name="split"' + (picked.split ? " checked" : "") + "> Make each folder inside “" + esc(picked.root) + "” its own book</label>" : "") +
      '<ul class="up__rows">' + rows + "</ul>" +
      '<div class="up__actions"><button type="button" class="mine-btn mine-btn--main" data-act="go">Add to the library</button>' +
      '<button type="button" class="mine-btn" data-act="cancel">Cancel</button></div>';
    var split = box.querySelector('input[name="split"]');
    if (split) split.onchange = function () { picked.split = split.checked; group(); showPreview(); };
    box.querySelectorAll('select[name="subject-target"]').forEach(function (sel) {
      sel.onchange = function () { box.querySelector(".up__field--new").hidden = sel.value !== ""; };
    });
    box.querySelector('[data-act="cancel"]').onclick = function () { picked = null; box.hidden = true; box.innerHTML = ""; };
    box.querySelector('[data-act="go"]').onclick = upload;
  }

  function status(t) {
    var p = dlg.querySelector("#up-progress");
    p.hidden = !t;
    dlg.querySelector("#up-status").textContent = t;
  }

  function upload() {
    var box = dlg.querySelector("#up-preview");
    var go = box.querySelector('[data-act="go"]');
    var jobs = [];
    var problem = "";
    picked.groups.forEach(function (gr, i) {
      var sel = box.querySelector('select[data-i="' + i + '"]');
      var input = box.querySelector('input[name="subject-name"][data-i="' + i + '"]');
      var existing = sel && sel.value ? sel.value : null;
      var name = input ? input.value.trim() : "";
      if (!existing && !name) problem = "Give each new book a name.";
      jobs.push({ existing: existing, name: name, files: gr.files });
    });
    if (problem) { status(problem); (box.querySelector('input[name="subject-name"]:not([value])') || box.querySelector("input")).focus(); return; }
    go.disabled = true;
    var total = jobs.reduce(function (a, j) { return a + j.files.length; }, 0);
    var done = 0;
    var failed = [];
    var bar = dlg.querySelector("#up-bar");
    bar.max = total;
    bar.value = 0;
    status("Adding " + plural(total, "file", "files") + "…");
    var chain = Promise.resolve();
    jobs.forEach(function (job) {
      chain = chain.then(function () {
        return job.existing ? { id: job.existing } : api("POST", "/api/my-subjects", { name: job.name });
      }).then(function (subject) {
        job.sid = subject.id;
        var inner = Promise.resolve();
        job.files.forEach(function (f) {
          inner = inner.then(function () {
            status("Adding " + (done + 1) + " of " + total + ": " + f.path);
            return fetch(fileUrl(subject.id, f.path), { method: "PUT", body: f.file }).then(function (r) {
              if (!r.ok) return r.json().catch(function () { return {}; }).then(function (d) { failed.push(f.path + ": " + (d.error || r.status)); });
            }, function () { failed.push(f.path + ": the app didn’t answer"); }).then(function () {
              done++;
              bar.value = done;
            });
          });
        });
        return inner;
      }).catch(function (err) { failed.push(job.name + ": " + err.message); });
    });
    chain.then(function () {
      // Gemini reads each subject that got new files (when a key is set up); the book updates when it's done
      var touched = {};
      jobs.forEach(function (j) { if (j.sid) touched[j.sid] = 1; });
      return Promise.all(Object.keys(touched).map(function (sid) {
        return api("POST", "/api/my-subjects/" + sid + "/organize").then(function () {
          var s = mine.list.find(function (x) { return x.sid === sid; }) || { sid: sid };
          watch(s);
        }, function () { /* no key, or nothing readable: the files are still on the shelf */ });
      }));
    }).then(function () {
      picked = null;
      box.hidden = true;
      box.innerHTML = "";
      return mine.refresh();
    }).then(function () {
      renderList();
      status(failed.length ? "Added " + plural(total - failed.length, "file", "files") + ". These didn’t go in: " + failed.slice(0, 5).join("; ") + (failed.length > 5 ? "…" : "")
        : "Added " + plural(total, "file", "files") + ". Your books are on the shelf, and Gemini is organising them now.");
    });
  }

  function renderList() {
    var ul = dlg.querySelector("#up-subjects");
    if (!mine.list.length) {
      ul.innerHTML = '<li class="up__none">No books of your own yet.</li>';
      return;
    }
    ul.innerHTML = mine.list.map(function (s) {
      return '<li class="up__sub" data-sid="' + esc(s.sid) + '"><span class="up__chip" style="--c:' + esc(s.accent) + '" aria-hidden="true"></span>' +
        '<span class="up__subname">' + esc(s.name) + "</span>" +
        '<span class="up__subn">' + plural(s.files, "file", "files") + (s.mistakes.length ? " · " + plural(s.mistakes.length, "mistake", "mistakes") : "") + "</span>" +
        '<span class="up__subacts"><button type="button" class="mine-link" data-act="more">Add files</button>' +
        '<button type="button" class="mine-link" data-act="rename">Rename</button>' +
        '<button type="button" class="mine-link mine-link--bad" data-act="delete">Delete</button></span></li>';
    }).join("");
  }

  function onListClick(e) {
    var b = e.target.closest("button");
    var li = e.target.closest(".up__sub");
    if (!b || !li) return;
    var s = mine.list.find(function (x) { return x.sid === li.dataset.sid; });
    var act = b.dataset.act;
    if (act === "more") {
      var input = dlg.querySelector("#up-files");
      input.value = "";
      input.onchange = function () {
        preview(Array.prototype.map.call(input.files, function (f) { return { file: f, path: f.name }; }), true, s.sid);
        input.onchange = function () { preview(Array.prototype.map.call(input.files, function (f) { return { file: f, path: f.name }; }), true); };
      };
      input.click();
    } else if (act === "rename") {
      li.innerHTML = '<label class="up__field up__field--inline"><span class="visually-hidden">New name for ' + esc(s.name) + '</span><input type="text" name="rename" autocomplete="off" value="' + esc(s.name) + '"></label>' +
        '<span class="up__subacts"><button type="button" class="mine-btn mine-btn--main" data-act="save">Save name</button><button type="button" class="mine-link" data-act="back">Cancel</button></span>';
      var field = li.querySelector("input");
      field.focus();
      field.select();
      field.onkeydown = function (k) { if (k.key === "Enter") li.querySelector('[data-act="save"]').click(); if (k.key === "Escape") { k.stopPropagation(); renderList(); } };
    } else if (act === "save") {
      var name = li.querySelector("input").value.trim();
      if (!name) return;
      api("POST", "/api/my-subjects/" + s.sid + "/rename", { name: name }).then(mine.refresh).then(renderList, function (err) { status(err.message); });
    } else if (act === "delete") {
      li.innerHTML = '<span class="up__confirm">Delete <b>' + esc(s.name) + "</b> and its " + plural(s.files, "file", "files") + " from this computer?</span>" +
        '<span class="up__subacts"><button type="button" class="mine-btn mine-btn--bad" data-act="really">Delete ' + esc(s.name) + '</button><button type="button" class="mine-link" data-act="back">Keep it</button></span>';
      li.querySelector('[data-act="back"]').focus();
    } else if (act === "really") {
      api("DELETE", "/api/my-subjects/" + s.sid).then(mine.refresh).then(function () { renderList(); status("Deleted " + s.name + "."); }, function (err) { status(err.message); });
    } else if (act === "back") {
      renderList();
    }
  }

  mine.openUploads = function (opts) {
    if (!dlg) build();
    renderList();
    status("");
    if (!dlg.open) dlg.showModal();
    if (opts && opts.subject) {
      var li = dlg.querySelector('.up__sub[data-sid="' + opts.subject + '"] [data-act="more"]');
      if (li) li.click();
    }
  };
})();
