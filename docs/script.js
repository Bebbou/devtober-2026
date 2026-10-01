(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
  var DOCS = window.DOCS || [];
  var currentPage = location.pathname.split("/").pop() || "index.html";

  /* ---------- Titre du héros : apparition mot par mot ---------- */
  var h1 = $("#heroTitle");
  if (h1) h1.innerHTML = h1.textContent.split(" ").map(function (w, i) { return '<span style="--i:' + i + '">' + w + "</span>"; }).join(" ");

  /* ---------- Coloration syntaxique (monochrome) ---------- */
  var RULES = {
    html: { re: /(<!--[\s\S]*?-->)|("(?:[^"\\]|\\.)*")|(<\/?[a-zA-Z][\w-]*)|(\s[\w:-]+(?==))/g, cls: [0, "c", "s", "t", "p"] },
    css: { re: /(\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*")|(@[\w-]+)|((?:--)?[a-z][\w-]*(?=\s*:))|(\.[\w-]+|::?[a-z][\w-]*)|(#[0-9a-fA-F]{3,8}\b|\b\d*\.?\d+(?:px|ms|s|em|rem|%|deg)?)/g, cls: [0, "c", "s", "a", "p", "q", "n"] },
    js: { re: /(\/\/[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|\b(const|let|var|function|return|if|else|new|for|of|while|import|from|export|default|true|false|null|this)\b|\b(\d*\.?\d+)\b/g, cls: [0, "c", "s", "k", "n"] }
  };
  RULES.json = RULES.js;
  function highlight(code, lang) {
    var rule = RULES[lang], out = "", last = 0, m;
    if (!rule) return esc(code);
    rule.re.lastIndex = 0;
    while ((m = rule.re.exec(code))) {
      var g = 1;
      while (g < m.length && m[g] === undefined) g++;
      out += esc(code.slice(last, m.index)) + '<span class="k-' + rule.cls[g] + '">' + esc(m[0]) + "</span>";
      last = m.index + m[0].length;
      if (!m[0].length) rule.re.lastIndex++;
    }
    return out + esc(code.slice(last));
  }

  /* ---------- Blocs de code ----------
     - démo   : le code affiché est le code exécuté (onglets Aperçu / Code)
     - static : data-static, juste du code à lire et à copier (pas d'aperçu) */
  var LABEL = { html: "HTML", css: "CSS", js: "JS", json: "JSON" };
  var clean = function (t) { return t.replace(/^\n/, "").replace(/\s+$/, ""); };

  function buildDemo(demo) {
    var isStatic = demo.hasAttribute("data-static");
    var src = {};
    $$('script[type="text/plain"]', demo).forEach(function (s) { src[s.getAttribute("data-lang")] = clean(s.textContent); s.remove(); });
    var langs = ["html", "css", "js", "json"].filter(function (l) { return src[l]; });
    var active = langs[0], mounted = false, styleEl = null;

    demo.innerHTML =
      '<div class="bar">' +
        '<div class="seg"><button data-v="preview" aria-pressed="true">Aperçu</button><button data-v="code" aria-pressed="false">Code</button></div>' +
        '<div class="tools"><button class="ico" data-act="replay" aria-label="Rejouer"><svg class="i"><use href="#i-replay"/></svg></button></div>' +
      "</div>" +
      '<div class="stage"></div>' +
      '<div class="codewrap" hidden>' +
        '<div class="ctabs">' + langs.map(function (l, i) { return '<button class="t" data-l="' + l + '" aria-selected="' + (i === 0) + '">' + (demo.getAttribute("data-label-" + l) || LABEL[l]) + "</button>"; }).join("") +
        '<button class="ico" data-act="copy"><svg class="i"><use href="#i-copy"/></svg><span>Copier</span></button></div>' +
        "<pre><code></code></pre>" +
      "</div>";

    var stage = $(".stage", demo), wrap = $(".codewrap", demo), codeEl = $("code", demo);

    function mount() {
      if (!styleEl) { styleEl = document.createElement("style"); styleEl.textContent = src.css || ""; document.head.appendChild(styleEl); }
      stage.innerHTML = src.html;
      if (src.js) { try { new Function(src.js)(); } catch (e) { console.error(e); } }
      mounted = true;
    }
    function showCode() { codeEl.innerHTML = highlight(src[active], active); }
    showCode();

    demo.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.v) {
        var code = b.dataset.v === "code";
        $$(".seg button", demo).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
        stage.hidden = code; wrap.hidden = !code;
        $('[data-act="replay"]', demo).style.visibility = code ? "hidden" : "";
        if (!code) mount();
      } else if (b.dataset.l) {
        active = b.dataset.l;
        $$(".ctabs .t", demo).forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
        showCode();
      } else if (b.dataset.act === "replay") {
        b.classList.remove("spin"); void b.offsetWidth; b.classList.add("spin");
        mount();
      } else if (b.dataset.act === "copy") {
        var label = $("span", b), use = $("use", b);
        (navigator.clipboard ? navigator.clipboard.writeText(src[active]) : Promise.reject()).then(function () {
          b.classList.add("ok"); label.textContent = "Copié"; use.setAttribute("href", "#i-check");
          setTimeout(function () { b.classList.remove("ok"); label.textContent = "Copier"; use.setAttribute("href", "#i-copy"); }, 1500);
        }, function () {});
      }
    });

    if (isStatic) { demo.classList.add("static"); stage.hidden = true; wrap.hidden = false; return; }

    // l'animation démarre quand la démo entre à l'écran
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting && !mounted) { mount(); io.disconnect(); } });
      }, { rootMargin: "0px 0px -15% 0px" });
      io.observe(demo);
    } else { mount(); }
  }
  $$(".demo").forEach(buildDemo);

  /* ---------- Liste des projets (accueil) et navigation entre documents ---------- */
  var plist = $("#plist");
  if (plist) {
    plist.innerHTML = DOCS.map(function (d) {
      return '<a href="' + d.href + '"><span class="d">' + d.day + '</span><span class="n">' + d.title + '</span><span class="s">' + d.status + "</span></a>";
    }).join("");
  }
  var docNav = $("#docNav");
  if (docNav) {
    DOCS.forEach(function (d) {
      var a = document.createElement("a");
      a.href = d.href; a.textContent = d.day + " · " + d.title;
      if (d.href === currentPage) a.classList.add("on");
      docNav.appendChild(a);
    });
  }

  /* ---------- Navigation latérale : une entrée par section nommée ---------- */
  var sectionsNav = $("#compNav");
  var named = $$("main section[data-name]");
  named.forEach(function (c) {
    var a = document.createElement("a");
    a.href = "#" + c.id; a.textContent = c.getAttribute("data-name");
    sectionsNav.appendChild(a);
  });
  var links = $$('.side a[href^="#"]');
  var sections = links.map(function (a) { return a.getAttribute("href").slice(1); });
  function spy() {
    var cur = sections[0];
    sections.forEach(function (id) { var el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 140) cur = id; });
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) cur = sections[sections.length - 1];
    links.forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + cur); });
  }
  window.addEventListener("scroll", spy, { passive: true });
  spy();

  /* ---------- Menu mobile ---------- */
  $("#burger").addEventListener("click", function () { document.body.classList.toggle("open"); });
  $("#side").addEventListener("click", function (e) { if (e.target.closest("a")) document.body.classList.remove("open"); });

  /* ---------- Palette de recherche ---------- */
  var pal = $("#pal"), palIn = $("#palIn"), palList = $("#palList"), items = [], sel = 0;
  var entries = DOCS.map(function (d) { return { t: d.day + " · " + d.title, href: d.href, k: "Projet", d: d.title.toLowerCase() }; })
    .concat(named.map(function (c) { return { t: c.getAttribute("data-name"), id: c.id, k: "Cette page", d: c.textContent.toLowerCase() }; }));
  function render() {
    var q = palIn.value.trim().toLowerCase();
    items = entries.filter(function (e) { return !q || e.t.toLowerCase().indexOf(q) >= 0 || (e.d && e.d.indexOf(q) >= 0); }).slice(0, 9);
    sel = 0;
    palList.innerHTML = items.length
      ? items.map(function (e, i) { return '<li><a href="' + (e.href || "#" + e.id) + '" data-i="' + i + '" class="' + (i ? "" : "sel") + '">' + e.t + "<small>" + e.k + "</small></a></li>"; }).join("")
      : '<li class="none">Aucun résultat</li>';
  }
  function mark() { $$("#palList a").forEach(function (a, i) { a.classList.toggle("sel", i === sel); }); }
  function go(e) {
    pal.close();
    if (e.href) { location.href = e.href; return; }
    var el = document.getElementById(e.id);
    if (el) { history.replaceState(null, "", "#" + e.id); el.scrollIntoView(); }
  }
  function openPal() { palIn.value = ""; render(); pal.showModal(); palIn.focus(); }
  $("#kbtn").addEventListener("click", openPal);
  palIn.addEventListener("input", render);
  palIn.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, items.length - 1); mark(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); mark(); }
    else if (e.key === "Enter" && items[sel]) { e.preventDefault(); go(items[sel]); }
  });
  palList.addEventListener("click", function (e) { var a = e.target.closest("a[data-i]"); if (a) { e.preventDefault(); go(items[+a.dataset.i]); } });
  pal.addEventListener("click", function (e) { if (e.target === pal) pal.close(); });
  document.addEventListener("keydown", function (e) {
    var typing = /^(INPUT|TEXTAREA)$/.test((document.activeElement || {}).tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pal.open ? pal.close() : openPal(); }
    else if (e.key === "/" && !typing && !pal.open) { e.preventDefault(); openPal(); }
  });
  if (/Mac|iPhone|iPad/.test(navigator.platform)) $("#kbtn kbd").textContent = "⌘ K";
})();
