/* SkillBridge dashboard. Renders everything from one data source (data/dashboard.mock.json).
   To wire the extension in later, replace loadData() with the extension's feed; the shape is the contract.
   Links into the library use the room's deep links: #shelf, #desk, #practice and #book-<subject>. */
(function () {
  "use strict";

  var DATA_URL = "data/dashboard.mock.json";
  var LINKS = { practice: "index.html#practice", book: function (id) { return "index.html#book-" + id; } };

  function loadData() {
    return fetch(DATA_URL, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  // ---------- helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function day(iso) { var p = iso.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function shortDate(iso) { var d = day(iso); return MONTHS[d.getMonth()] + " " + String(d.getDate()).padStart(2, "0"); }
  function daysBetween(a, b) { return Math.round((day(b) - day(a)) / 86400000); }
  function ago(iso, today) {
    var n = daysBetween(iso, today);
    return n <= 0 ? "today" : n === 1 ? "yesterday" : n + " days ago";
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : (many || one + "s")); }
  var WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  var ARROW = { down: "↓", up: "↑" };

  // ---------- header, sidebar ----------
  function renderHeader(d, subj) {
    var h = new Date().getHours();
    var part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
    $("greeting").textContent = "Good " + part + ", " + d.learner.firstName;
    $("avatar").textContent = d.learner.initials;
    $("crumb-learner").textContent = d.learner.name;

    var high = d.repeatRisk.filter(function (m) { return m.risk === "high"; }).length;
    var t = d.nextTest, when = WEEKDAYS[day(t.date).getDay()];
    $("summary").innerHTML = '<a href="#repeat-title">' + plural(high, "mistake") + "</a> worth reviewing before " +
      esc(when) + "’s " + esc(subj[t.subject].name) + " test.";

    var left = daysBetween(d.today, t.date);
    $("next-test-name").textContent = t.name;
    $("next-test-when").textContent = when + ", " + MONTHS[day(t.date).getMonth()] + " " + day(t.date).getDate() +
      " (" + (left === 1 ? "tomorrow" : "in " + left + " days") + ")";
    var due = d.due.reduce(function (a, x) { return a + x.count; }, 0);
    $("nav-due").textContent = due;
    $("nav-due").setAttribute("aria-label", due + " due");
  }

  // ---------- stats ----------
  function renderStats(d) {
    $("stats").innerHTML = d.stats.map(function (s) {
      var good = (s.goodWhen === "down" && s.delta < 0) || (s.goodWhen === "up" && s.delta > 0);
      var trend = s.delta === 0 ? s.deltaLabel : (s.delta < 0 ? ARROW.down : ARROW.up) + " " + Math.abs(s.delta) + " " + s.deltaLabel;
      var unit = s.unit || "";
      return '<div class="stat">' +
        '<dt class="visually-hidden">' + esc(s.label + " " + s.period) + "</dt>" +
        '<dd><p class="stat__value"><span class="stat__num">' + esc(s.value) + "</span>" +
          (unit ? '<span class="stat__unit">' + esc(unit) + "</span>" : "") + "</p>" +
          '<p class="stat__label" aria-hidden="true">' + esc(s.label + " " + (unit ? "" : s.period)).trim() + "</p>" +
          '<p class="stat__trend' + (good ? " is-good" : "") + '">' + esc(trend) + "</p></dd>" +
        "</div>";
    }).join("");
  }

  // ---------- most likely to repeat ----------
  var RISK = { high: 3, medium: 2, low: 1 };
  function renderRepeat(d, subj) {
    $("repeat-rows").innerHTML = d.repeatRisk.map(function (m, i) {
      var s = subj[m.subject];
      var pips = [1, 2, 3].map(function (n) { return '<i class="' + (n <= RISK[m.risk] ? "on" : "") + '"></i>'; }).join("");
      var riskName = m.risk.charAt(0).toUpperCase() + m.risk.slice(1);
      var text = [m.pattern, m.detail, s.name, m.callNumber, m.sources.join(" ")].join(" ").toLowerCase();
      return '<div class="row row--repeat" role="row" style="--c:' + esc(s.color) + '" data-text="' + esc(text) + '">' +
        '<div class="mistake" role="cell"><span class="mistake__spine" aria-hidden="true"></span><div>' +
          '<p><span class="mistake__subject">' + esc(s.name) + '</span><span class="mistake__call" translate="no">' + esc(m.callNumber) + "</span></p>" +
          '<p class="mistake__pattern"><span class="visually-hidden">Rank ' + (i + 1) + ": </span>" + esc(m.pattern) + "</p>" +
          '<p class="mistake__detail">' + esc(m.detail) + "</p>" +
        "</div></div>" +
        '<p class="times" role="cell"><strong>' + m.times + "×</strong> <span>last " + esc(ago(m.lastSeen, d.today)) + "</span></p>" +
        '<p class="where" role="cell">' + esc(m.sources.join(", ")) + "</p>" +
        '<p class="risk" role="cell"><span class="risk__pips" aria-hidden="true">' + pips + "</span>" + riskName + "</p>" +
        '<div class="actions" role="cell">' +
          '<a class="btn btn--primary" href="' + LINKS.book(esc(m.subject)) + '" aria-label="Learn it: ' + esc(m.pattern) + '">Learn it</a>' +
          '<a class="btn btn--quiet" href="' + LINKS.practice + '" aria-label="Practise: ' + esc(m.pattern) + '">Practise</a>' +
        "</div>" +
        "</div>";
    }).join("");
  }

  // ---------- trend chart ----------
  var chartData = null;
  function renderTrend(d, subj) {
    chartData = { d: d, subj: subj };
    var weeks = d.trend.weeks, series = d.trend.series;
    var totals = weeks.map(function (_, i) {
      return Object.keys(series).reduce(function (a, k) { return a + series[k][i]; }, 0);
    });
    var first = totals[0], last = totals[totals.length - 1];
    $("trend-sub").textContent = last + " caught last week, " +
      (last < first ? "down from " : last > first ? "up from " : "same as ") + first + " four weeks ago.";
    drawChart();
  }

  function drawChart() {
    if (!chartData) return;
    var d = chartData.d, subj = chartData.subj;
    var fig = $("trend-chart");
    var W = Math.max(260, Math.round(fig.clientWidth));
    var compact = W < 420;
    var H = compact ? 210 : 276;
    var pad = { l: 26, r: compact ? 92 : 104, t: 10, b: 28 };
    var weeks = d.trend.weeks, keys = d.subjects.map(function (s) { return s.id; });
    var max = 0;
    keys.forEach(function (k) { d.trend.series[k].forEach(function (v) { max = Math.max(max, v); }); });
    var top = Math.ceil((max + 1) / 2) * 2;
    var pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;
    function x(i) { return pad.l + 14 + (pw - 28) * i / (weeks.length - 1); }
    function y(v) { return pad.t + ph - ph * v / top; }

    var out = [];
    for (var v = 0; v <= top; v += 2) {
      out.push('<line class="' + (v ? "rule" : "base") + '" x1="' + pad.l + '" x2="' + (W - 2) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>');
      out.push('<text class="tick" x="' + (pad.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "</text>");
    }
    weeks.forEach(function (w, i) {
      out.push('<text class="tick" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(w) + "</text>");
    });
    out.push('<line class="guide" id="trend-guide" x1="0" x2="0" y1="' + pad.t + '" y2="' + (pad.t + ph) + '" visibility="hidden"/>');

    var ends = [];
    keys.forEach(function (k) {
      var vals = d.trend.series[k], c = subj[k].color;
      var path = vals.map(function (v, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }).join("");
      out.push('<path class="series" d="' + path + '" stroke="' + c + '"/>');
      vals.forEach(function (v, i) { out.push('<circle class="dot" cx="' + x(i) + '" cy="' + y(v) + '" r="4" fill="' + c + '"/>'); });
      ends.push({ k: k, y: y(vals[vals.length - 1]), v: vals[vals.length - 1] });
    });
    ends.sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 17) ends[i].y = ends[i - 1].y + 17;
    var lx = x(weeks.length - 1) + 12;
    ends.forEach(function (e) {
      out.push('<text class="end" x="' + lx + '" y="' + (e.y + 4) + '" fill="' + subj[e.k].color + '">' + esc(subj[e.k].name) +
        ' <tspan class="end-num" fill="#5B6470">' + e.v + "</tspan></text>");
    });
    var half = (pw - 28) / (weeks.length - 1) / 2;
    weeks.forEach(function (_, i) {
      out.push('<rect class="hit" data-i="' + i + '" x="' + (x(i) - half) + '" y="' + pad.t + '" width="' + half * 2 + '" height="' + ph + '"/>');
    });

    var table = '<table class="visually-hidden"><caption>Mistakes caught per week by subject</caption><thead><tr><th scope="col">Week of</th>' +
      keys.map(function (k) { return '<th scope="col">' + esc(subj[k].name) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      weeks.map(function (w, i) {
        return '<tr><th scope="row">' + esc(w) + "</th>" + keys.map(function (k) { return "<td>" + d.trend.series[k][i] + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table>";

    fig.innerHTML = '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" aria-hidden="true">' + out.join("") + "</svg>" +
      table + '<div class="tip" id="trend-tip" hidden></div>';

    var tip = $("trend-tip"), guide = $("trend-guide");
    fig.querySelectorAll(".hit").forEach(function (r) {
      r.addEventListener("pointerenter", function () {
        var i = Number(r.getAttribute("data-i"));
        guide.setAttribute("x1", x(i)); guide.setAttribute("x2", x(i)); guide.setAttribute("visibility", "visible");
        tip.innerHTML = '<p class="tip__w">Week of ' + esc(weeks[i]) + "</p>" + keys.map(function (k) {
          return '<p class="tip__row" style="--c:' + subj[k].color + '"><i></i>' + esc(subj[k].name) + "<b>" + d.trend.series[k][i] + "</b></p>";
        }).join("");
        tip.hidden = false;
        var left = x(i) + 12;
        if (left + 150 > W) left = x(i) - 12 - tip.offsetWidth;
        tip.style.left = left + "px";
        tip.style.top = pad.t + "px";
      });
      r.addEventListener("pointerleave", function () { tip.hidden = true; guide.setAttribute("visibility", "hidden"); });
    });
  }

  // ---------- due for review ----------

  // ---------- 3D helpers ----------
  // A CSS cuboid around the box's centre. Faces get classes f-front, f-back, f-left, f-right, f-top, f-bottom.
  // Every face is its own 3D layer, so only the faces the view can show are drawn: the shelf is seen
  // turned left from above and the diorama from above-right, so both show front, right and top only.
  var SEEN = "front right top";
  function cuboid(w, h, d, cls, front) {
    var hw = w / 2, hh = h / 2, hd = d / 2;
    function face(name, fw, fh, t) {
      if (SEEN.indexOf(name) < 0) return "";
      return '<span class="f f-' + name + '" style="width:' + fw + "px;height:" + fh + "px;left:" + (w - fw) / 2 + "px;top:" + (h - fh) / 2 +
        "px;transform:" + t + '">' + (name === "front" && front ? front : "") + "</span>";
    }
    return '<span class="cube ' + (cls || "") + '" style="width:' + w + "px;height:" + h + 'px">' +
      face("back", w, h, "rotateY(180deg) translateZ(" + hd + "px)") +
      face("left", d, h, "rotateY(-90deg) translateZ(" + hw + "px)") +
      face("right", d, h, "rotateY(90deg) translateZ(" + hw + "px)") +
      face("top", w, d, "rotateX(90deg) translateZ(" + hh + "px)") +
      face("bottom", w, d, "rotateX(-90deg) translateZ(" + hh + "px)") +
      face("front", w, h, "translateZ(" + hd + "px)") + "</span>";
  }
  // Place a cuboid in the diorama: x/z on the floor (origin at the floor's centre), y = height of its base.
  function put(x, y, z, w, h, d, cls, front) {
    return '<span class="at" style="transform:translate3d(' + (x - w / 2) + "px," + (-y - h) + "px," + z + 'px)">' +
      cuboid(w, h, d, cls, front) + "</span>";
  }

  function renderBooks(d, subj) {
    var totals = d.subjects.map(function (s) {
      return { s: s, n: d.trend.series[s.id].reduce(function (a, v) { return a + v; }, 0) };
    });
    var max = Math.max.apply(null, totals.map(function (t) { return t.n; }));
    $("books3d").innerHTML = totals.map(function (t) {
      var h = Math.round(96 + 74 * t.n / max);   // taller book = more mistakes caught
      var spine = '<span class="spine__band"></span><span class="spine__name">' + esc(t.s.name) + "</span>" +
        '<span class="spine__num">' + t.n + "</span><span class=\"spine__band\"></span>";
      return '<li class="book3d" style="--c:' + esc(t.s.color) + ";--h:" + h + 'px">' +
        '<a class="book3d__link" href="' + LINKS.book(t.s.id) + '">' +
        '<span class="visually-hidden">Open the ' + esc(t.s.name) + " book: " + plural(t.n, "mistake") + " caught in four weeks</span>" +
        cuboid(44, h, 118, "book", spine) + "</a></li>";
    }).join("");
  }

  function renderDiorama() {
    var W = 360, D = 230, H = 170, out = [];
    // room shell
    out.push('<span class="plane floor" style="width:' + W + "px;height:" + D + "px;left:" + (-W / 2) + "px;top:" + (-D / 2) + 'px;transform:rotateX(90deg)"></span>');
    out.push('<span class="plane rug" style="width:150px;height:96px;left:-60px;top:-30px;transform:rotateX(90deg) translateZ(1px)"></span>');
    out.push('<span class="plane wall wall--back" style="width:' + W + "px;height:" + H + "px;left:" + (-W / 2) + "px;top:" + (-H) + "px;transform:translateZ(" + (-D / 2) + 'px)">' +
      '<span class="window"></span><span class="skirting"></span></span>');
    out.push('<span class="plane wall wall--left" style="width:' + D + "px;height:" + H + "px;left:" + (-D / 2) + "px;top:" + (-H) + "px;transform:translateX(" + (-W / 2) + 'px) rotateY(90deg)"><span class="skirting"></span></span>');
    // bookshelf (Learn)
    var rows = [["#2D4A6E", 30], ["#7B3F36", 26], ["#2F5B47", 32], ["#B7A57A", 22], ["#2D4A6E", 28], ["#7B3F36", 30]];
    function shelfRow(off) {
      return '<span class="books-row">' + rows.map(function (r, i) {
        var c = rows[(i + off) % rows.length];
        return '<i style="background:' + c[0] + ";height:" + c[1] + 'px"></i>';
      }).join("") + "</span>";
    }
    out.push(put(-118, 0, -D / 2 + 22, 100, 140, 40, "wood shelf", shelfRow(0) + shelfRow(2) + shelfRow(4)));
    // desk (Apply)
    out.push(put(4, 54, -6, 112, 7, 58, "wood desk-top"));
    [[-48, -30], [52, -30], [-48, 18], [52, 18]].forEach(function (l) { out.push(put(l[0], 0, l[1], 6, 54, 6, "wood-dark")); });
    out.push(put(-6, 61, -2, 40, 3, 26, "paper-block"));
    out.push(put(34, 61, -16, 6, 30, 6, "brass-block"));
    out.push(put(34, 91, -16, 22, 10, 18, "brass-block"));
    // card catalog (Practice)
    var drawers = "";
    for (var i = 0; i < 9; i++) drawers += "<i><b></b></i>";
    out.push(put(122, 0, -D / 2 + 30, 84, 100, 52, "wood catalog", '<span class="drawers">' + drawers + "</span>"));
    $("diorama").innerHTML = '<span class="world">' + out.join("") + "</span>";
  }

  function renderDue(d, subj) {
    var total = d.due.reduce(function (a, x) { return a + x.count; }, 0);
    var overdue = d.due.reduce(function (a, x) { return a + x.overdue; }, 0);
    $("due-sub").textContent = plural(total, "flashcard") + " across " + WORDS[d.due.length] + " subjects" +
      (overdue ? ", " + overdue + " overdue." : ".");
    $("due-rows").innerHTML = d.due.map(function (x) {
      var s = subj[x.subject];
      return '<li class="due__row"><a class="due__link" href="' + LINKS.practice + '" style="--c:' + esc(s.color) + '">' +
        '<span class="due__tray" aria-hidden="true"></span>' +
        '<span class="due__label"><span class="due__subject">' + esc(s.name) + '</span><span class="due__over">' +
          (x.overdue ? x.overdue + " overdue" : "None overdue") + "</span></span>" +
        '<span class="due__pull" aria-hidden="true"></span>' +
        '<span class="due__count">' + x.count + "<small>" + (x.count === 1 ? "card" : "cards") + "</small></span></a></li>";
    }).join("");
    $("due-all").textContent = "Review all " + total + " cards";
  }

  // ---------- reading log ----------
  function renderLog(d, subj) {
    $("log-rows").innerHTML = d.log.map(function (e) {
      var s = subj[e.subject];
      var text = [e.title, e.result, s.name].join(" ").toLowerCase();
      return '<div class="row row--log" role="row" style="--c:' + esc(s.color) + '" data-text="' + esc(text) + '">' +
        '<time class="log-date" role="cell" datetime="' + esc(e.date) + '">' + shortDate(e.date) + "</time>" +
        '<div class="log-activity" role="cell"><span class="mistake__spine" aria-hidden="true"></span><div>' +
          '<p class="log-title">' + esc(e.title) + '</p><p class="log-subject">' + esc(s.name) + "</p></div></div>" +
        '<p class="log-result" role="cell">' + esc(e.result) + "</p>" +
        '<span class="tag tag--' + esc(e.kind) + '" role="cell">' + (e.kind === "caught" ? "New mistake" : "Session") + "</span>" +
        "</div>";
    }).join("");
  }

  // ---------- search: filters both tables ----------
  function markLast(group) {
    var rows = group.querySelectorAll(".row"), last = null;
    rows.forEach(function (r) { r.classList.remove("is-last"); if (!r.hidden) last = r; });
    if (last) last.classList.add("is-last");
  }
  function filter(q) {
    q = q.trim().toLowerCase();
    [["repeat-rows", "repeat-empty", "mistakes"], ["log-rows", "log-empty", "activity"]].forEach(function (t) {
      var group = $(t[0]), shown = 0;
      group.querySelectorAll(".row").forEach(function (r) {
        var hit = !q || r.getAttribute("data-text").indexOf(q) !== -1;
        r.hidden = !hit;
        if (hit) shown++;
      });
      markLast(group);
      var empty = $(t[1]);
      empty.hidden = shown > 0;
      if (!shown) empty.textContent = "No " + t[2] + " match “" + q + "”. Try a subject, a topic or Khan Academy.";
    });
  }
  $("search").addEventListener("input", function (e) { filter(e.target.value); });
  $("search-form").addEventListener("submit", function (e) { e.preventDefault(); });

  // ---------- sidebar drawer (narrow screens) ----------
  var side = $("sidebar"), scrim = $("scrim"), menu = $("menu-btn");
  function setMenu(open) {
    side.classList.toggle("is-open", open);
    scrim.hidden = !open;
    menu.setAttribute("aria-expanded", String(open));
    menu.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (open) { var first = side.querySelector(".nav__item"); if (first) first.focus(); }
    else menu.focus();
  }
  menu.addEventListener("click", function () { setMenu(!side.classList.contains("is-open")); });
  scrim.addEventListener("click", function () { setMenu(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && side.classList.contains("is-open")) setMenu(false); });

  $("settings-btn").addEventListener("click", function () { var n = $("settings-note"); n.hidden = !n.hidden; });

  function showError(err) {
    $("summary").textContent = "The dashboard data didn’t load (" + err.message + "). Reload the page to try again.";
  }

  loadData().then(function (d) {
    var subj = {};
    d.subjects.forEach(function (s) { subj[s.id] = s; });
    renderHeader(d, subj);
    renderStats(d);
    renderRepeat(d, subj);
    renderTrend(d, subj);
    renderDue(d, subj);
    renderBooks(d, subj);
    renderDiorama();
    renderLog(d, subj);
    markLast($("repeat-rows")); markLast($("log-rows"));
    var fig = $("trend-chart"), lastW = 0;
    if ("ResizeObserver" in window) {
      new ResizeObserver(function () {
        var w = Math.round(fig.clientWidth);
        if (w !== lastW) { lastW = w; drawChart(); }
      }).observe(fig);
    }
    // fit the diorama's fixed 380x250 stage into its frame
    var prev = document.querySelector(".preview"), dio = $("diorama"), world = dio.querySelector(".world");
    var box = null;   // the frame's rect, measured when the pointer comes in (and after scroll or resize)
    function fit() {
      var sc = Math.min(prev.clientWidth / 380, prev.clientHeight / 250);
      dio.style.setProperty("--fit", sc.toFixed(3));
      box = null;
    }
    fit();
    if ("ResizeObserver" in window) new ResizeObserver(fit).observe(prev);
    // the room turns a little toward the pointer (not with reduced motion). Pointer events can come
    // faster than frames: keep the latest position and apply it once per frame, on the rotating
    // element itself so only it restyles.
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      var at = null, queued = 0;
      var apply = function () {
        queued = 0;
        if (!at) { world.style.removeProperty("--ry"); world.style.removeProperty("--rx"); return; }
        world.style.setProperty("--ry", (-30 + at.x * 16).toFixed(1) + "deg");
        world.style.setProperty("--rx", (-20 - at.y * 8).toFixed(1) + "deg");
      };
      var queue = function () { if (!queued) queued = requestAnimationFrame(apply); };
      prev.addEventListener("pointermove", function (e) {
        box = box || prev.getBoundingClientRect();
        at = { x: (e.clientX - box.left) / box.width - 0.5, y: (e.clientY - box.top) / box.height - 0.5 };
        queue();
      });
      prev.addEventListener("pointerleave", function () { at = null; box = null; queue(); });
      window.addEventListener("scroll", function () { box = null; }, { passive: true });
    }
    document.documentElement.classList.add("is-ready");
  }).catch(showError);
})();
