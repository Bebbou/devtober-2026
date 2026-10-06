(function () {
  "use strict";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
  var DOCS = window.DOCS || [];
  var THEMES = window.THEMES || [];
  var CFG = window.DEVTOBER || { year: 2026, month: 10 };
  var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
  var now = new Date();
  // Le jour du défi : seulement pendant le mois du Devtober, sinon 0
  var today = now.getFullYear() === CFG.year && now.getMonth() + 1 === CFG.month ? now.getDate() : 0;
  var currentPage = location.pathname.split("/").pop() || "index.html";

  /* ---------- Coloration du code ---------- */
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

  /* ---------- Blocs de code : onglets par langage + bouton copier ---------- */
  var LABEL = { html: "html", css: "css", js: "js", json: "json" };

  $$(".code").forEach(function (box) {
    var src = {};
    $$('script[type="text/plain"]', box).forEach(function (s) {
      src[s.getAttribute("data-lang")] = s.textContent.replace(/^\n/, "").replace(/\s+$/, "");
      s.remove();
    });
    var langs = ["html", "css", "js", "json"].filter(function (l) { return src[l]; });
    var active = langs[0];

    box.innerHTML =
      '<div class="code-bar">' +
        langs.map(function (l, i) {
          return '<button class="t" data-l="' + l + '" aria-selected="' + (i === 0) + '">' + (box.getAttribute("data-label-" + l) || LABEL[l]) + "</button>";
        }).join("") +
        '<button class="copy" type="button">copier</button>' +
      "</div><pre><code></code></pre>";

    var codeEl = $("code", box);
    var show = function () { codeEl.innerHTML = highlight(src[active], active); };
    show();

    box.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.l) {
        active = b.dataset.l;
        $$(".t", box).forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
        show();
      } else if (b.classList.contains("copy") && navigator.clipboard) {
        navigator.clipboard.writeText(src[active]).then(function () {
          b.textContent = "copié";
          setTimeout(function () { b.textContent = "copier"; }, 1400);
        }, function () {});
      }
    });
  });

  /* ---------- Liste des projets (accueil) et navigation entre documents ---------- */
  /* ---------- Calendrier : une case par jour, avec son thème ---------- */
  var dayDoc = function (n) { return DOCS.filter(function (d) { return +d.day === n; })[0]; };
  var total = THEMES.length || 31;

  var cal = $("#cal");
  if (cal) {
    cal.innerHTML = THEMES.map(function (theme, i) {
      var n = i + 1, doc = dayDoc(n);
      var state = doc ? "done" : n === today ? "today" : "todo";
      var note = { done: "terminé", today: "aujourd'hui", todo: "" }[state];
      var inner = "<b>" + pad(n) + '</b><span class="t">' + theme + "</span><small>" + note + "</small>";
      return doc
        ? '<a class="day done" href="' + doc.href + '">' + inner + "</a>"
        : '<div class="day ' + state + '">' + inner + "</div>";
    }).join("");
  }

  /* ---------- Le pouls du défi : une ligne de vie à 31 emplacements ----------
     un battement par jour terminé, un point pour aujourd'hui, du plat pour la suite */
  var pulse = $("#pulse");
  if (pulse) {
    var SLOT = 20, BASE = 44, W = total * SLOT;
    var beat = function (x) {
      return "M" + (x - 9) + " " + BASE + "H" + (x - 4) + "L" + (x - 2) + " " + (BASE - 6) + "L" + x + " 8L" + (x + 2) + " 56L" + (x + 4) + " " + (BASE - 4) + "L" + (x + 6) + " " + BASE + "H" + (x + 9);
    };
    var parts = ['<path class="flat" d="M0 ' + BASE + "H" + W + '"/>'];
    var doneCount = 0;
    for (var n = 1; n <= total; n++) {
      var x = (n - 0.5) * SLOT;
      if (dayDoc(n)) { parts.push('<path class="beat" d="' + beat(x) + '"/>'); doneCount++; }
      else if (n === today) parts.push('<circle class="now" cx="' + x + '" cy="' + BASE + '" r="3.5"/>');
    }
    var caption = doneCount + " jour" + (doneCount > 1 ? "s" : "") + " sur " + total + (today ? " · aujourd'hui : jour " + pad(today) + ", " + (THEMES[today - 1] || "").toLowerCase() : "");
    pulse.innerHTML =
      '<svg viewBox="0 0 ' + W + ' 64" preserveAspectRatio="none" role="img" aria-label="' + caption + '">' + parts.join("") + "</svg>" +
      '<p class="pulse-cap">' + caption + "</p>";
  }

  var docNav = $("#docNav");
  if (docNav) {
    DOCS.forEach(function (d) {
      var a = document.createElement("a");
      a.href = d.href;
      a.textContent = d.day + " · " + d.title;
      if (d.href === currentPage) a.classList.add("on");
      docNav.appendChild(a);
    });
    var cur = $("a.on", docNav);
    if (cur && docNav.scrollWidth > docNav.clientWidth) {
      docNav.scrollLeft = cur.offsetLeft - (docNav.clientWidth - cur.offsetWidth) / 2;
    }
  }

  /* ---------- Sommaire de la page : une entrée par section nommée ---------- */
  var secNav = $("#secNav");
  var named = $$("main section[data-name]");
  if (secNav) {
    if (named.length < 2) {
      secNav.hidden = true;
    } else {
      named.forEach(function (s) {
        var a = document.createElement("a");
        a.href = "#" + s.id;
        a.textContent = s.getAttribute("data-name");
        secNav.appendChild(a);
      });
      var links = $$("a", secNav);
      var spy = function () {
        var cur = named[0].id;
        named.forEach(function (s) { if (s.getBoundingClientRect().top < 140) cur = s.id; });
        if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) cur = named[named.length - 1].id;
        links.forEach(function (a) {
          var on = a.getAttribute("href") === "#" + cur;
          a.classList.toggle("on", on);
          // sur téléphone la rangée défile : l'entrée active reste visible
          if (on && secNav.scrollWidth > secNav.clientWidth) {
            secNav.scrollLeft = a.offsetLeft - (secNav.clientWidth - a.offsetWidth) / 2;
          }
        });
      };
      window.addEventListener("scroll", spy, { passive: true });
      spy();
    }
  }
})();
