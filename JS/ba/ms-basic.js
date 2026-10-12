// Manuscript editor — "Basic" contents mode.
//
// Basic mode catalogues a manuscript's contents as a plain list of works picked
// from the hierarchical work list (BA.workHierarchy, JS/ba/work-hierarchy.js).
// Each selected work becomes exactly one fragment in msContents:
//
//   <msItem xml:id="msitem-1"><title ref="{baseUri}/work/1">Genesis (Bereshit)</title></msItem>
//
// This module owns the Basic pane (tree, filter, ordered selection) and the
// compatibility tests that decide whether a record may be shown in Basic mode.
// Mode switching and serialisation live in ms-editor.js, which reads the
// selection through msItems() in the same shape as the Advanced data, so
// buildMsContents() serialises both modes with the same code.
//
// Exposes window.BA.msBasic.

(function () {
  "use strict";

  var ROOT = ".ba-basic-pane";
  var items = [];      // ordered selection: [{ id: "1", xmlid: "msitem-1" }]
  var byId = null;     // id -> { id, label, path } (lazy, from BA.workHierarchy)

  function esc(s) { return window.BA.util.esc(s); }
  function hierarchy() { return window.BA.workHierarchy || []; }

  function workPrefix() {
    var c = window.BA.config;
    return c.baseUri + "/" + c.entityPaths.work + "/";
  }
  function uriFor(id) { return workPrefix() + id; }
  // Work id for a project work URI, or "" when the URI is not one.
  function idFromUri(uri) {
    var p = workPrefix();
    if (!uri || uri.indexOf(p) !== 0) return "";
    var id = uri.slice(p.length);
    return /^\d+$/.test(id) ? id : "";
  }

  function index() {
    if (byId) return byId;
    byId = {};
    (function walk(nodes, path) {
      (nodes || []).forEach(function (n) {
        if (n.id) byId[String(n.id)] = { id: String(n.id), label: n.label, path: path.slice() };
        walk(n.children, n.label ? path.concat(n.label) : path);
      });
    })(hierarchy(), []);
    return byId;
  }
  function known(id) { return !!index()[String(id)]; }
  function label(id) { var r = index()[String(id)]; return r ? r.label : id; }

  // ---------- markup ----------

  function nodeHtml(n, depth) {
    var kids = n.children || [];
    var hasKids = kids.length > 0;
    var search = (n.label || "").toLowerCase();
    var head;
    if (n.id) {
      var cbId = "bawt-" + n.id;
      head = '<div class="form-check mb-0">' +
        '<input class="form-check-input ba-work-cb" type="checkbox" id="' + cbId + '" value="' + esc(String(n.id)) + '">' +
        '<label class="form-check-label" for="' + cbId + '">' + esc(n.label) + "</label></div>";
    } else {
      head = '<span class="fw-semibold small">' + esc(n.label) + "</span>";
    }
    var toggle = hasKids
      ? '<button type="button" class="btn btn-link btn-sm p-0 me-1 ba-wt-toggle" aria-label="Expand or collapse">' +
        '<i class="bi bi-chevron-right"></i></button>'
      : '<span class="ba-wt-spacer me-1"></span>';
    return '<li class="ba-wt-node' + (hasKids ? " ba-wt-collapsed" : "") + '" data-search="' + esc(search) + '">' +
      '<div class="d-flex align-items-center">' + toggle + head + "</div>" +
      (hasKids ? '<ul class="ba-wt-children list-unstyled">' +
        kids.map(function (k) { return nodeHtml(k, depth + 1); }).join("") + "</ul>" : "") +
      "</li>";
  }

  // Full Basic pane (filter + tree + ordered selection). Static HTML; events
  // are delegated from wire().
  function paneHtml() {
    return '<div class="ba-basic-pane">' +
      '<div class="ba-worktree-wrap">' +
      '<div class="d-flex gap-2 mb-2">' +
      '<input type="search" class="form-control form-control-sm ba-wt-filter" placeholder="Filter works…" aria-label="Filter works">' +
      '<button type="button" class="btn btn-sm btn-outline-secondary ba-wt-expand-all text-nowrap">Expand all</button>' +
      '<button type="button" class="btn btn-sm btn-outline-secondary ba-wt-collapse-all text-nowrap">Collapse all</button>' +
      "</div>" +
      '<ul class="ba-worktree list-unstyled border rounded p-2 mb-3">' +
      hierarchy().map(function (n) { return nodeHtml(n, 0); }).join("") + "</ul>" +
      "</div>" +
      '<h6>Selected works <span class="text-muted small fw-normal">(in manuscript order)</span></h6>' +
      '<ol class="list-group list-group-numbered ba-basic-selected mb-2"></ol>' +
      "</div>";
  }

  // ---------- state + rendering ----------

  function root() { return document.querySelector(ROOT); }

  function nextXmlId() {
    var max = 0;
    items.forEach(function (it) {
      var m = /^msitem-(\d+)$/.exec(it.xmlid || "");
      if (m) max = Math.max(max, +m[1]);
    });
    return "msitem-" + (max + 1);
  }

  function render() {
    var r = root();
    if (!r) return;
    var sel = {};
    items.forEach(function (it) { sel[it.id] = true; });
    Array.prototype.forEach.call(r.querySelectorAll(".ba-work-cb"), function (cb) { cb.checked = !!sel[cb.value]; });
    var list = r.querySelector(".ba-basic-selected");
    if (!items.length) {
      list.innerHTML = '<li class="list-group-item text-muted small ba-basic-empty">No works selected yet — tick works in the list above.</li>';
      return;
    }
    list.innerHTML = items.map(function (it, i) {
      var path = index()[it.id] ? index()[it.id].path.join(" › ") : "";
      return '<li class="list-group-item d-flex align-items-center gap-2" data-id="' + esc(it.id) + '">' +
        '<span class="flex-grow-1">' + esc(label(it.id)) +
        (path ? ' <span class="text-muted small">— ' + esc(path) + "</span>" : "") + "</span>" +
        '<code class="small text-muted">work/' + esc(it.id) + "</code>" +
        '<span class="btn-group btn-group-sm ba-sel-actions">' +
        '<button type="button" class="btn btn-outline-secondary ba-sel-up" aria-label="Move up"' + (i === 0 ? " disabled" : "") + '><i class="bi bi-arrow-up"></i></button>' +
        '<button type="button" class="btn btn-outline-secondary ba-sel-down" aria-label="Move down"' + (i === items.length - 1 ? " disabled" : "") + '><i class="bi bi-arrow-down"></i></button>' +
        '<button type="button" class="btn btn-outline-danger ba-sel-del" aria-label="Remove"><i class="bi bi-x-lg"></i></button>' +
        "</span></li>";
    }).join("");
  }

  function touch() {
    var F = window.BA.form;
    if (F && !F._viewMode) F._dirty = true;
  }

  // Replace the selection. list: [{ id, xmlid? }]; unknown ids are dropped.
  function setItems(list) {
    items = [];
    (list || []).forEach(function (it) {
      var id = String(it.id);
      if (!known(id) || items.some(function (x) { return x.id === id; })) return;
      items.push({ id: id, xmlid: it.xmlid || nextXmlId() });
    });
    render();
  }

  function filter(q) {
    var r = root();
    if (!r) return;
    q = (q || "").trim().toLowerCase();
    // Bottom-up: a node is visible when it or any descendant matches.
    function visit(li) {
      var kids = Array.prototype.slice.call(li.querySelectorAll(":scope > ul > li"));
      var anyKid = false;
      kids.forEach(function (k) { if (visit(k)) anyKid = true; });
      var self = !q || li.dataset.search.indexOf(q) !== -1;
      var show = self || anyKid;
      li.classList.toggle("d-none", !show);
      if (q && anyKid) li.classList.remove("ba-wt-collapsed");
      // A matching parent shows all its children.
      if (q && self) kids.forEach(function (k) { unhide(k); });
      return show;
    }
    function unhide(li) {
      li.classList.remove("d-none");
      Array.prototype.forEach.call(li.querySelectorAll("li"), function (x) { x.classList.remove("d-none"); });
    }
    Array.prototype.forEach.call(r.querySelectorAll(".ba-worktree > li"), visit);
  }

  function setAllCollapsed(collapsed) {
    var r = root();
    if (!r) return;
    Array.prototype.forEach.call(r.querySelectorAll(".ba-wt-node"), function (li) {
      if (li.querySelector(":scope > ul")) li.classList.toggle("ba-wt-collapsed", collapsed);
    });
  }

  var wired = false;
  function wire() {
    if (wired) return;
    wired = true;
    document.addEventListener("change", function (e) {
      var cb = e.target;
      if (!cb.classList || !cb.classList.contains("ba-work-cb") || !cb.closest(ROOT)) return;
      if (cb.checked) {
        if (!items.some(function (x) { return x.id === cb.value; })) items.push({ id: cb.value, xmlid: nextXmlId() });
      } else {
        items = items.filter(function (x) { return x.id !== cb.value; });
      }
      render();
    });
    document.addEventListener("input", function (e) {
      if (e.target.classList && e.target.classList.contains("ba-wt-filter") && e.target.closest(ROOT)) filter(e.target.value);
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest || !e.target.closest(ROOT)) return;
      if (window.BA.form && window.BA.form.isViewMode()) return;
      var t;
      if ((t = e.target.closest(".ba-wt-toggle"))) {
        t.closest(".ba-wt-node").classList.toggle("ba-wt-collapsed");
        return;
      }
      if (e.target.closest(".ba-wt-expand-all")) { setAllCollapsed(false); return; }
      if (e.target.closest(".ba-wt-collapse-all")) { setAllCollapsed(true); return; }
      var li = e.target.closest(".ba-basic-selected > li[data-id]");
      if (!li) return;
      var i = items.map(function (x) { return x.id; }).indexOf(li.dataset.id);
      if (i < 0) return;
      if (e.target.closest(".ba-sel-up") && i > 0) {
        items.splice(i - 1, 0, items.splice(i, 1)[0]);
      } else if (e.target.closest(".ba-sel-down") && i < items.length - 1) {
        items.splice(i + 1, 0, items.splice(i, 1)[0]);
      } else if (e.target.closest(".ba-sel-del")) {
        items.splice(i, 1);
      } else return;
      touch();
      render();
    });
  }

  // ---------- data in the Advanced shape ----------

  // Selection as msItem data objects in the shape getMsData() produces for
  // Advanced blocks, so buildMsContents/validation treat both modes alike.
  function msItems() {
    return items.map(function (it) {
      return {
        xmlid: it.xmlid, cls: "", loci: [],
        titles: [{ work: { value: label(it.id), uri: uriFor(it.id) }, lang: "", cert: "" }],
        authors: [], mainLang: "", otherLangs: "",
        incFrom: "", incTo: "", incQuote: "", incLang: "",
        expFrom: "", expTo: "", expQuote: "", expLang: "",
        note: "", noteLang: ""
      };
    });
  }

  // ---------- compatibility tests ----------
  // Each returns { ok: true, items: [{id, xmlid}] } or { ok: false, reason }.

  function fail(reason) { return { ok: false, reason: reason }; }

  // On import: msContents (a DOM element, may be null) may only hold msItem
  // fragments of the Basic shape. An empty or missing msContents is compatible
  // (items: []).
  function checkDom(mc) {
    if (!mc) return { ok: true, items: [] };
    var out = [], seen = {};
    var kids = Array.prototype.slice.call(mc.children);
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.localName !== "msItem") return fail("msContents contains <" + k.localName + ">");
      var extraAttr = Array.prototype.filter.call(k.attributes, function (a) { return a.name !== "xml:id"; });
      if (extraAttr.length) return fail("a text unit carries @" + extraAttr[0].name);
      var ch = Array.prototype.slice.call(k.children);
      if (ch.length !== 1 || ch[0].localName !== "title") {
        var other = ch.filter(function (c) { return c.localName !== "title"; })[0];
        return fail(other ? "a text unit contains <" + other.localName + ">" : "a text unit has " + (ch.length ? "several titles" : "no title"));
      }
      var t = ch[0];
      var tAttr = Array.prototype.filter.call(t.attributes, function (a) { return a.name !== "ref"; });
      if (tAttr.length) return fail("a title carries @" + tAttr[0].name);
      if (t.children.length) return fail("a title contains markup");
      var id = idFromUri(t.getAttribute("ref"));
      if (!id) return fail("a title has no project work reference");
      if (!known(id)) return fail("work " + id + " is not in the work list");
      if (seen[id]) return fail("work " + id + " occurs more than once");
      seen[id] = true;
      out.push({ id: id, xmlid: k.getAttribute("xml:id") || "" });
    }
    return { ok: true, items: out };
  }

  // On switching Advanced -> Basic: the form data (getMsData) must hold nothing
  // beyond one project work title per text unit. Fully empty blocks are ignored.
  // `extras` = raw unmapped msContents children preserved from import.
  function checkData(d, extras) {
    if ((extras || []).length) return fail("the record has msContents elements the form does not show");
    if (d.summary) return fail("a contents summary is filled in");
    var out = [], seen = {};
    for (var i = 0; i < d.msItems.length; i++) {
      var m = d.msItems[i], n = i + 1;
      var filled = m.cls || m.loci.length || m.authors.length || m.mainLang || m.otherLangs ||
        m.incFrom || m.incTo || m.incQuote || m.expFrom || m.expTo || m.expQuote || m.note;
      if (!filled && !m.titles.length) continue; // empty block
      if (filled) return fail("text unit " + n + " has fields beyond the title");
      if (m.titles.length !== 1) return fail("text unit " + n + " has " + m.titles.length + " titles");
      var t = m.titles[0];
      if (t.lang || t.cert) return fail("the title of text unit " + n + " has a language or certainty");
      var id = idFromUri(t.work.uri);
      if (!id || !known(id)) return fail("the title of text unit " + n + " is not a work from the work list");
      if (seen[id]) return fail("work " + id + " occurs more than once");
      seen[id] = true;
      out.push({ id: id, xmlid: m.xmlid });
    }
    return { ok: true, items: out };
  }

  window.BA.msBasic = {
    paneHtml: paneHtml,
    wire: wire,
    setItems: setItems,
    getItems: function () { return items.map(function (x) { return { id: x.id, xmlid: x.xmlid }; }); },
    msItems: msItems,
    checkDom: checkDom,
    checkData: checkData,
    label: label,
    uriFor: uriFor
  };
})();
