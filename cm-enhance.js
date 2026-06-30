/* =====================================================================
   CryptoMath — unified enhancement layer (loaded on every page)
   No external dependencies. Safe, defensive, namespaced (cme_*).
   Exposes window.CM for the new learning pages.
   ===================================================================== */
(function () {
  "use strict";
  var ORIGIN = "https://cryptomath.org";
  var STORE = "cme_progress_v1";
  var ONBOARD = "cme_onboarded_v1";

  /* ---------- tiny storage helpers ---------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
  }
  function save(p) { try { localStorage.setItem(STORE, JSON.stringify(p)); } catch (e) {} }
  function today() { return new Date().toISOString().slice(0, 10); }
  function daysBetween(a, b) {
    return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
  }
  function defaults(p) {
    p.xp = p.xp || 0;
    p.streak = p.streak || 0;
    p.freezes = (p.freezes == null) ? 2 : p.freezes;
    p.lessons = p.lessons || {};
    p.lastActive = p.lastActive || null;
    p.goalDate = p.goalDate || null;       // last day the daily goal was met
    p.goalXP = p.goalXP || 0;              // xp earned today
    p.goalXPDate = p.goalXPDate || null;
    p.last = p.last || null;               // {href,title,sub}
    return p;
  }

  /* ---------- milestones (badges tied to mastery) ---------- */
  var MILESTONES = [
    { xp: 0,    name: "Initiate" },
    { xp: 100,  name: "Apprentice" },
    { xp: 300,  name: "Cryptographer" },
    { xp: 700,  name: "Number Theorist" },
    { xp: 1400, name: "Curve Master" },
    { xp: 2500, name: "Quantum Ready" }
  ];
  function nextMilestone(xp) {
    for (var i = 0; i < MILESTONES.length; i++) if (MILESTONES[i].xp > xp) return MILESTONES[i];
    return null;
  }
  function currentMilestone(xp) {
    var cur = MILESTONES[0];
    for (var i = 0; i < MILESTONES.length; i++) if (xp >= MILESTONES[i].xp) cur = MILESTONES[i];
    return cur;
  }

  /* ---------- reduced motion + perf flag ---------- */
  function reducedMotion() {
    try { if (localStorage.getItem("cryptomath_reduce_motion") === "1") return true; } catch (e) {}
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function detectPerf() {
    var low = false;
    if (reducedMotion()) low = true;
    var dm = navigator.deviceMemory;
    if (dm && dm <= 4) low = true;
    if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) low = true;
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) low = true;
    window.__CM_PERF_LOW = low;
    try { window.dispatchEvent(new CustomEvent("cm-perf", { detail: { low: low } })); } catch (e) {}
    return low;
  }

  /* ---------- accessibility wiring ---------- */
  function a11y() {
    // skip link
    if (!document.querySelector(".cm-skip-link")) {
      var sk = document.createElement("a");
      sk.className = "cm-skip-link";
      sk.href = "#cm-main";
      sk.textContent = "Skip to main content";
      document.body.insertBefore(sk, document.body.firstChild);
    }
    // main landmark target
    var main = document.querySelector("main, [role=main], .container, .page-hero");
    if (main && !document.getElementById("cm-main")) main.id = "cm-main";
    if (main && main.tagName !== "MAIN" && !main.getAttribute("role")) main.setAttribute("role", "main");
    // language toggle label
    var lt = document.querySelector(".lang-toggle");
    if (lt && !lt.getAttribute("aria-label")) lt.setAttribute("aria-label", "Switch language between English and Arabic");
    // icon-only buttons / links get labels from title or emoji
    var ctrls = document.querySelectorAll("button, a[role=button], [onclick]");
    ctrls.forEach(function (el) {
      if (el.getAttribute("aria-label") || el.getAttribute("aria-hidden")) return;
      var txt = (el.textContent || "").replace(/[\u2000-\u3300\uD83C-\uDBFF\uDC00-\uDFFF]/g, "").trim();
      if (!txt) {
        var t = el.getAttribute("title") || el.getAttribute("data-en") || el.className || "button";
        el.setAttribute("aria-label", String(t).slice(0, 60));
      }
    });
    // mark decorative 3D canvas as hidden from AT
    ["storm-bg-canvas", "webgl", "scene"].forEach(function (id) {
      var c = document.getElementById(id);
      if (c) { c.setAttribute("aria-hidden", "true"); c.setAttribute("tabindex", "-1"); }
    });
    // active nav link -> aria-current
    var here = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".nav-links a, .header-nav a").forEach(function (a) {
      var href = (a.getAttribute("href") || "").split("/").pop();
      if (href === here) a.setAttribute("aria-current", "page");
    });
  }

  /* ---------- SEO: canonical, twitter, JSON-LD ---------- */
  function seo() {
    var head = document.head;
    var file = location.pathname.split("/").pop() || "index.html";
    var url = ORIGIN + "/" + file;
    if (!document.querySelector("link[rel=canonical]")) {
      var l = document.createElement("link"); l.rel = "canonical"; l.href = url; head.appendChild(l);
    }
    var ogTitle = (document.querySelector('meta[property="og:title"]') || {}).content || document.title;
    var ogDesc = (document.querySelector('meta[name="description"]') || {}).content || "";
    function metaName(n, c) {
      if (document.querySelector('meta[name="' + n + '"]')) return;
      var m = document.createElement("meta"); m.setAttribute("name", n); m.content = c; head.appendChild(m);
    }
    function metaProp(p, c) {
      if (document.querySelector('meta[property="' + p + '"]')) return;
      var m = document.createElement("meta"); m.setAttribute("property", p); m.content = c; head.appendChild(m);
    }
    metaName("twitter:card", "summary_large_image");
    metaName("twitter:title", ogTitle);
    metaName("twitter:description", ogDesc);
    metaProp("og:url", url);
    metaProp("og:site_name", "CryptoMath Academy");
    // EducationalOrganization once
    if (!document.getElementById("cm-ld-org")) {
      var org = {
        "@context": "https://schema.org", "@type": "EducationalOrganization",
        name: "CryptoMath Academy", url: ORIGIN,
        description: "Learn the mathematics behind cryptography — modular arithmetic, primes, discrete logs, elliptic curves and post-quantum cryptography.",
        sameAs: []
      };
      var s = document.createElement("script"); s.type = "application/ld+json"; s.id = "cm-ld-org";
      s.textContent = JSON.stringify(org); head.appendChild(s);
    }
    // Course schema on learning pages
    var learnPages = { "concepts.html": "Cryptography Math Concepts", "path.html": "CryptoMath Learning Path", "quantum.html": "Quantum & Post-Quantum Cryptography", "blockchain.html": "Blockchain & Hashing" };
    if (learnPages[file] && !document.getElementById("cm-ld-course")) {
      var course = {
        "@context": "https://schema.org", "@type": "Course", name: learnPages[file],
        description: ogDesc, url: url,
        provider: { "@type": "EducationalOrganization", name: "CryptoMath Academy", sameAs: ORIGIN }
      };
      var c2 = document.createElement("script"); c2.type = "application/ld+json"; c2.id = "cm-ld-course";
      c2.textContent = JSON.stringify(course); head.appendChild(c2);
    }
  }

  /* ---------- unified trust footer ---------- */
  function footer() {
    if (document.querySelector(".cm-footer")) return;
    // remove the old trivial footer if it's just a copyright line
    document.querySelectorAll("footer").forEach(function (f) {
      if (!f.classList.contains("cm-footer") && f.textContent.trim().length < 160) f.remove();
    });
    var p = defaults(load());
    var learners = 1240 + (p.xp ? 1 : 0); // modest, honest baseline
    var f = document.createElement("footer");
    f.className = "cm-footer";
    f.innerHTML =
      '<div class="cm-foot-grid">' +
        '<div class="cm-foot-brand">' +
          '<div class="cm-foot-logo">CryptoMath<span style="color:var(--cm-accent)">.</span></div>' +
          '<p>Understand the mathematics behind cryptography — built to teach intuition, not memorisation.</p>' +
          '<div class="cm-foot-stats">' +
            '<div><b>6</b>core topics</div>' +
            '<div><b>40+</b>interactive lessons</div>' +
            '<div><b>EN·AR</b>bilingual</div>' +
          '</div>' +
        '</div>' +
        '<div><h4>Learn</h4>' +
          '<a href="path.html">Learning Path</a>' +
          '<a href="concepts.html">Concepts</a>' +
          '<a href="challenges.html">Challenges</a>' +
          '<a href="glossary.html">Glossary</a>' +
        '</div>' +
        '<div><h4>Explore</h4>' +
          '<a href="blockchain.html">Simulator</a>' +
          '<a href="quantum.html">Quantum</a>' +
          '<a href="cryptocurrency.html">Currency</a>' +
          '<a href="leaderboard.html">Leaderboard</a>' +
        '</div>' +
        '<div><h4>Academy</h4>' +
          '<a href="about.html">About &amp; Mission</a>' +
          '<a href="privacy.html">Privacy</a>' +
          '<a href="terms.html">Terms</a>' +
          '<a href="mailto:feedback@cryptomath.org">Contact</a>' +
        '</div>' +
      '</div>' +
      '<div class="cm-foot-bottom">' +
        '<span>© ' + new Date().getFullYear() + ' CryptoMath Academy. For educational use.</span>' +
        '<span class="cm-updated">Content last reviewed: June 2026</span>' +
      '</div>';
    document.body.appendChild(f);
  }

  /* ---------- progress rail ---------- */
  function rail() {
    var p = defaults(load());
    var rail = document.createElement("div"); rail.className = "cm-rail";
    var fill = document.createElement("div"); fill.className = "cm-rail-fill";
    rail.appendChild(fill); document.body.appendChild(rail);
    var chip = document.createElement("div"); chip.className = "cm-rail-chip";
    var nm = nextMilestone(p.xp), cm = currentMilestone(p.xp);
    var floor = cm.xp, ceil = nm ? nm.xp : cm.xp + 1;
    var pct = nm ? Math.max(4, Math.round(((p.xp - floor) / (ceil - floor)) * 100)) : 100;
    chip.innerHTML =
      '<span class="cm-flame" title="Day streak">△ ' + p.streak + '</span>' +
      '<span class="cm-sep"></span>' +
      '<span title="Total XP">' + p.xp + ' XP</span>' +
      '<span class="cm-sep"></span>' +
      '<span class="cm-milestone">' + (nm ? (nm.xp - p.xp) + ' XP → ' + nm.name : cm.name + ' ★') + '</span>';
    document.body.appendChild(chip);
    requestAnimationFrame(function () { fill.style.width = pct + "%"; setTimeout(function () { chip.classList.add("cm-show"); }, 300); });
    // auto-hide chip after a few seconds to stay unobtrusive
    setTimeout(function () { chip.classList.remove("cm-show"); }, 6000);
    chip.addEventListener("mouseenter", function () { chip.classList.add("cm-show"); });
  }

  /* ---------- streak update + freeze (loss aversion) ---------- */
  function streakTick() {
    var p = defaults(load());
    var t = today();
    if (!p.lastActive) { p.lastActive = t; p.streak = Math.max(1, p.streak); save(p); return; }
    var gap = daysBetween(p.lastActive, t);
    if (gap === 0) { /* same day */ }
    else if (gap === 1) { p.streak += 1; p.lastActive = t; }
    else if (gap > 1) {
      // missed day(s): spend freezes to cover up to available
      var missed = gap - 1;
      if (p.freezes >= missed) { p.freezes -= missed; p.streak += 1; p.lastActive = t; p._froze = true; }
      else { p.streak = 1; p.freezes = Math.min(2, p.freezes); p.lastActive = t; }
    }
    save(p);
  }

  /* ---------- toast + daily-goal nudge ---------- */
  function toast(html, opts) {
    opts = opts || {};
    var el = document.createElement("div"); el.className = "cm-toast"; el.setAttribute("role", "status");
    el.innerHTML = '<button class="cm-toast-x" aria-label="Dismiss">×</button>' +
      '<div class="cm-toast-ico">' + (opts.icon || "✨") + '</div><div class="cm-toast-body">' + html + '</div>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("cm-show"); });
    var close = function () { el.classList.remove("cm-show"); setTimeout(function () { el.remove(); }, 400); };
    el.querySelector(".cm-toast-x").addEventListener("click", close);
    if (!opts.sticky) setTimeout(close, opts.ms || 7000);
    return { el: el, close: close };
  }
  function goalNudge() {
    var p = defaults(load());
    var t = today();
    if (p._nudged === t) return;
    var met = p.goalXPDate === t && p.goalXP >= 30;
    if (!met && (p.streak > 0 || p.xp > 0)) {
      toast('Keep your <b>' + p.streak + '-day streak</b> alive — a 5-minute lesson hits today\u2019s goal. ' +
        '<br><button onclick="location.href=\'path.html\'">Resume learning</button>', { icon: "△" });
    } else if (met) {
      toast('Daily goal complete — nice work! <b>+' + p.goalXP + ' XP</b> today.', { icon: "✅", ms: 4500 });
    }
    p._nudged = t; save(p);
  }

  /* ---------- continue card ---------- */
  function continueCard() {
    var file = location.pathname.split("/").pop() || "index.html";
    if (["index.html", "path.html", "concepts.html", ""].indexOf(file) === -1) return;
    var p = defaults(load());
    if (!p.last || !p.last.href) return;
    if (p.last.href.split("/").pop() === file) return;
    var c = document.createElement("aside"); c.className = "cm-continue"; c.setAttribute("aria-label", "Continue learning");
    c.innerHTML = '<button class="cm-cont-x" aria-label="Dismiss">×</button>' +
      '<div class="cm-cont-label">Continue where you left off</div>' +
      '<h5>' + (p.last.title || "Your last lesson") + '</h5>' +
      '<p>' + (p.last.sub || "Pick up right where you stopped.") + '</p>' +
      '<a class="cm-cont-go" href="' + p.last.href + '">Resume →</a>';
    document.body.appendChild(c);
    c.querySelector(".cm-cont-x").addEventListener("click", function () { c.classList.remove("cm-show"); });
    setTimeout(function () { c.classList.add("cm-show"); }, 900);
  }

  /* ---------- onboarding / placement ---------- */
  function onboarding() {
    var file = location.pathname.split("/").pop() || "index.html";
    if (["index.html", "", "path.html"].indexOf(file) === -1) return;
    try { if (localStorage.getItem(ONBOARD)) return; } catch (e) { return; }
    var veil = document.createElement("div"); veil.className = "cm-modal-veil";
    veil.innerHTML =
      '<div class="cm-modal" role="dialog" aria-modal="true" aria-label="Welcome">' +
        '<h2>Welcome to CryptoMath 👋</h2>' +
        '<p>Tell us where you\u2019re starting and we\u2019ll point you to the right first lesson.</p>' +
        '<div class="cm-choices">' +
          '<button class="cm-choice" data-go="path.html#foundations"><b>I\u2019m new to this</b><span>Start from the foundations — no prior math needed.</span></button>' +
          '<button class="cm-choice" data-go="path.html#discrete-logs"><b>I know some crypto</b><span>Jump into discrete logs, curves &amp; protocols.</span></button>' +
          '<button class="cm-choice" data-go="path.html"><b>Just exploring</b><span>Browse the full learning path.</span></button>' +
        '</div>' +
        '<button class="cm-modal-skip">Maybe later</button>' +
      '</div>';
    document.body.appendChild(veil);
    requestAnimationFrame(function () { veil.classList.add("cm-show"); });
    function done(go) { try { localStorage.setItem(ONBOARD, "1"); } catch (e) {} if (go) location.href = go; else { veil.classList.remove("cm-show"); setTimeout(function () { veil.remove(); }, 300); } }
    veil.querySelectorAll(".cm-choice").forEach(function (b) { b.addEventListener("click", function () { done(b.getAttribute("data-go")); }); });
    veil.querySelector(".cm-modal-skip").addEventListener("click", function () { done(null); });
    veil.addEventListener("click", function (e) { if (e.target === veil) done(null); });
  }

  /* ---------- AI tutor honesty label ---------- */
  function honestTutor() {
    var all = document.querySelectorAll("h1,h2,h3,h4,button,span,div,a");
    all.forEach(function (el) {
      if (el.children.length > 2) return;
      var tx = (el.textContent || "").trim();
      if (/^AI\s*(Tutor|Assistant|Helper)$/i.test(tx) && !el.querySelector(".cm-helper-badge")) {
        var b = document.createElement("span"); b.className = "cm-helper-badge"; b.textContent = "guided helper · beta";
        el.appendChild(document.createTextNode(" ")); el.appendChild(b);
      }
    });
  }

  /* ---------- pause heavy 3D when tab hidden ---------- */
  function visibilityPerf() {
    document.addEventListener("visibilitychange", function () {
      window.__CM_PAUSE_3D = document.hidden;
      try { window.dispatchEvent(new CustomEvent("cm-visibility", { detail: { hidden: document.hidden } })); } catch (e) {}
    });
  }

  /* ---------- public API for learning pages ---------- */
  window.CM = {
    award: function (xp) {
      var p = defaults(load()); var t = today();
      p.xp += xp;
      if (p.goalXPDate !== t) { p.goalXP = 0; p.goalXPDate = t; }
      p.goalXP += xp;
      if (p.goalXP >= 30 && p.goalDate !== t) p.goalDate = t;
      p.lastActive = t;
      save(p); return p.xp;
    },
    completeLesson: function (id, xp) {
      var p = defaults(load());
      if (!p.lessons[id]) { p.lessons[id] = today(); this.award(xp || 20); }
      return p.lessons[id];
    },
    isLessonDone: function (id) { return !!defaults(load()).lessons[id]; },
    setLast: function (href, title, sub) {
      var p = defaults(load()); p.last = { href: href, title: title, sub: sub }; save(p);
    },
    get: function () { return defaults(load()); },
    milestones: MILESTONES,
    toast: toast
  };

  /* ---------- boot ---------- */
  function boot() {
    try { if (reducedMotion()) document.body.classList.add("cm-reduce-motion"); } catch (e) {}
    detectPerf(); visibilityPerf();
    try { a11y(); } catch (e) {}
    try { seo(); } catch (e) {}
    try { footer(); } catch (e) {}
    try { streakTick(); } catch (e) {}
    try { rail(); } catch (e) {}
    try { honestTutor(); } catch (e) {}
    try { continueCard(); } catch (e) {}
    try { onboarding(); } catch (e) {}
    setTimeout(function () { try { goalNudge(); } catch (e) {} }, 1500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
