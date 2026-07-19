// Shared rich-text adapter (BA.rich) — Round 6, W01.
//
// Progressive-enhancement wrapper around the <jinn-tap> web component
// (@jinntec/jinntap, GPL-3.0-or-later, loaded as an unmodified version-pinned
// ES module from jsDelivr — see BA.config.richText). It upgrades designated
// textareas to JinnTap editors, converts between the TEI *fragment* stored in
// the textarea and the *full TEI document* the component's `.xml` property
// speaks, and falls back silently to the plain textarea whenever the CDN module
// cannot load (offline / file:// / blocked). Classic script — no build step.
//
// The textarea always stays the single source of truth: on every edit we write
// the current fragment back into the hidden textarea's value, so all existing
// getData / dirty-tracking code keeps working unchanged.

(function () {
  "use strict";

  var SCHEMA_URL = "JS/ba/jinntap-schema-ba.json";
  var TEI_NS = "http://www.tei-c.org/ns/1.0";
  var LOAD_TIMEOUT_MS = 10000;

  function esc(str) {
    if (window.BA && window.BA.util && window.BA.util.esc) return window.BA.util.esc(str);
    if (str === undefined || str === null) return "";
    return String(str).replace(/[<>&'"]/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c];
    });
  }

  // Serialize an element's element-children to an XML string with all xmlns
  // declarations stripped. Whitespace-only text between block children (e.g.
  // pretty-print newlines) is dropped; our rich fields are always paragraph
  // sequences, so nothing meaningful is lost.
  function serializeChildren(parent) {
    if (!parent) return "";
    var ser = new XMLSerializer();
    var out = "";
    for (var i = 0; i < parent.childNodes.length; i++) {
      var n = parent.childNodes[i];
      if (n.nodeType === 1) out += ser.serializeToString(n);
    }
    return out.replace(/\s+xmlns(:[a-zA-Z0-9_-]+)?="[^"]*"/g, "").trim();
  }

  // A stored value is TEI fragment markup when it starts with a tag (rich fields
  // always begin with "<p>"); anything else is legacy plain text. Matches the
  // raw-vs-escaped test in the editors' body builders, so a literal "<" inside
  // plain text (e.g. "temp < 30") is treated as text, not markup.
  function isFragment(str) {
    return /^\s*</.test(str);
  }

  // ---- config ----

  var config = null;
  function cfg() {
    if (config) return config;
    config = (window.BA && window.BA.config && window.BA.config.richText) || {};
    return config;
  }

  // ---- load(): inject stylesheet + module once, resolve true when ready ----

  var loadPromise = null;
  var api; // forward declaration; assigned to window.BA.rich at the bottom

  function load() {
    if (loadPromise) return loadPromise;
    var c = cfg();
    if (!c.enabled) {
      loadPromise = Promise.resolve(false); // one switch disables the whole feature
      return loadPromise;
    }
    loadPromise = new Promise(function (resolve) {
      var settled = false;
      function fail(msg) {
        if (settled) return;
        settled = true;
        console.warn("BA.rich: " + msg + "; using the plain textarea.");
        resolve(false);
      }
      function ready() {
        if (settled) return;
        settled = true;
        if (api) api.ready = true; // synchronous guard for block-created fields
        resolve(true);
      }
      try {
        if (c.css && !document.querySelector("link[data-ba-rich-css]")) {
          var link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = c.css;
          link.setAttribute("data-ba-rich-css", "");
          document.head.appendChild(link);
        }
        if (!c.module) { fail("no module URL configured"); return; }
        if (!document.querySelector("script[data-ba-rich-module]")) {
          var s = document.createElement("script");
          s.type = "module";
          s.src = c.module;
          s.setAttribute("data-ba-rich-module", "");
          s.onerror = function () { fail("module failed to load"); };
          document.head.appendChild(s);
        }
        if (!(window.customElements && customElements.whenDefined)) {
          fail("custom elements unsupported");
          return;
        }
        var timer = setTimeout(function () { fail("module load timed out"); }, LOAD_TIMEOUT_MS);
        customElements.whenDefined("jinn-tap").then(function () {
          clearTimeout(timer);
          ready();
        });
      } catch (e) {
        fail(e && e.message ? e.message : "load error");
      }
    });
    return loadPromise;
  }

  // ---- fragment <-> full-document conversion ----

  // Seed a widget from a TEI fragment (or legacy plain text). The component's
  // `.xml` property speaks whole TEI documents, so wrap the fragment in a
  // minimal TEI/text/body skeleton. Plain text (no markup) becomes one <p>.
  function setFragment(el, fragmentXml) {
    var frag = fragmentXml == null ? "" : String(fragmentXml);
    var inner;
    if (frag.replace(/^\s+|\s+$/g, "") === "") {
      inner = "<p></p>"; // empty field: body still requires one block
    } else if (isFragment(frag)) {
      inner = frag;
    } else {
      inner = "<p>" + esc(frag) + "</p>"; // plain text -> single escaped paragraph
    }
    el.xml =
      '<TEI xmlns="' + TEI_NS + '"><text><body>' + inner + "</body></text></TEI>";
  }

  // Read the current fragment back out of a widget: parse the full TEI document
  // returned by `.xml`, take the <body>'s children, serialize, strip namespaces.
  function getFragment(el) {
    var xml = el && el.xml;
    if (!xml) return "";
    var doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) return "";
    var body = doc.getElementsByTagNameNS("*", "body")[0];
    if (!body) return "";
    // A widget showing only empty paragraph(s) is an empty field -> "" (so an
    // untouched field emits no element at all, matching the plain-textarea
    // behaviour). A lone <lb/> still counts as content.
    var hasText = (body.textContent || "").replace(/\s+/g, "") !== "";
    var hasLb = body.getElementsByTagNameNS("*", "lb").length > 0;
    if (!hasText && !hasLb) return "";
    return serializeChildren(body);
  }

  // Serialize the inner XML of an arbitrary source-document element (used on
  // import): element children -> fragment markup (xmlns stripped); a text-only
  // element (legacy record) -> its plain text, unchanged.
  function innerXml(node) {
    if (!node) return "";
    for (var i = 0; i < node.childNodes.length; i++) {
      if (node.childNodes[i].nodeType === 1) return serializeChildren(node);
    }
    return (node.textContent || "").trim(); // legacy plain text stays plain
  }

  // Serialize a field value for export: a TEI fragment (starts with a tag) is
  // embedded raw; legacy plain text is XML-escaped. One shared rule for every
  // rich field's body builder (replaces the pilot's inline test).
  function embed(value) {
    var v = value == null ? "" : String(value);
    return isFragment(v) ? v : esc(v);
  }

  // ---- upgrade(): replace a textarea with a live widget ----

  // Upgrade now if the module is already loaded, else once load() resolves.
  // Repeatable-block fields call this at block creation (the module may still be
  // in flight); static fields can also use it after render / import.
  function upgradeWhenReady(textarea) {
    if (!textarea) return;
    if (api && api.ready) { upgrade(textarea); return; }
    load().then(function (ok) { if (ok) upgrade(textarea); });
  }

  function upgrade(textarea) {
    if (!textarea) return null;
    if (textarea._baJinnTap) return textarea._baJinnTap; // idempotent

    var el = document.createElement("jinn-tap");
    el.setAttribute("format", "tei");
    el.setAttribute("schema", SCHEMA_URL);
    el.setAttribute("dir", "auto"); // RTL-aware for Arabic / Hebrew content
    el.className = "ba-rich-widget";
    // Boot with a valid empty paragraph. JinnTap's default empty document is
    // built around <div>, which this subset schema excludes; providing our own
    // initial content avoids that "markup does not match schema" path on load.
    el.innerHTML = "<tei-p></tei-p>";
    // Work around a JinnTap 1.31.0 bug: disconnectedCallback() calls
    // this._disconnectedAbortController.signal(), a field it never sets
    // (connectedCallback stores _disconnectedSignal instead) — so removing the
    // element (deleting a repeatable block, re-rendering the form) throws a
    // TypeError. A harmless no-op keeps removal from ever throwing.
    el._disconnectedAbortController = { signal: function () {} };

    textarea.style.display = "none";
    textarea._baJinnTap = el;
    el._baTextarea = textarea;
    textarea.parentNode.insertBefore(el, textarea.nextSibling);

    el.addEventListener(
      "ready",
      function () {
        // Seed the widget from the hidden textarea (fragment or legacy plain
        // text). We deliberately do NOT rewrite textarea.value here: an untouched
        // legacy / empty field must re-export byte-identical (CHANGES-R6). The
        // textarea stays the storage and keeps its original value until the user
        // actually edits.
        try { setFragment(el, textarea.value); } catch (e) { /* leave empty on failure */ }
        var seeded;
        try { seeded = getFragment(el); } catch (e) { seeded = textarea.value; }
        // Only a genuine edit (fragment differs from what we seeded) writes back
        // to the textarea and flags the form dirty via a bubbling input event —
        // the same hook every other field uses (BA.form.trackDirty). No-op
        // content-change events (e.g. footnote housekeeping) are ignored, so an
        // untouched field is never silently rewritten to <p>-wrapped markup.
        el.addEventListener("content-change", function () {
          var frag;
          try { frag = getFragment(el); } catch (e) { return; }
          if (frag === seeded) return;
          textarea.value = frag;
          seeded = frag;
          textarea.dispatchEvent(new Event("input", { bubbles: true }));
        });
      },
      { once: true }
    );

    return el;
  }

  // ---- renderHtml(): read-only HTML for view mode / collection (W03) ----

  function renderNodes(nodes) {
    var out = "";
    for (var i = 0; i < nodes.length; i++) out += renderNode(nodes[i]);
    return out;
  }

  function renderNode(node) {
    if (node.nodeType === 3) return esc(node.nodeValue || "");
    if (node.nodeType !== 1) return "";
    var rend = node.getAttribute("rend") || "";
    switch (node.localName) {
      case "p":
        return "<p>" + renderNodes(node.childNodes) + "</p>";
      case "lb":
        return "<br/>";
      case "hi":
        if (rend === "h1" || rend === "h2" || rend === "h3")
          return '<span class="rich-' + rend + '">' + renderNodes(node.childNodes) + "</span>";
        return renderNodes(node.childNodes);
      case "emph":
        if (rend === "bold") return "<strong>" + renderNodes(node.childNodes) + "</strong>";
        if (rend === "italic") return "<em>" + renderNodes(node.childNodes) + "</em>";
        return renderNodes(node.childNodes);
      default:
        return esc(node.textContent || "");
    }
  }

  function renderHtml(fragmentXml) {
    var frag = fragmentXml == null ? "" : String(fragmentXml);
    if (frag.replace(/^\s+|\s+$/g, "") === "") return "";
    if (!isFragment(frag)) return "<p>" + esc(frag) + "</p>";
    var doc = new DOMParser().parseFromString(
      '<ba-rich-root xmlns="' + TEI_NS + '">' + frag + "</ba-rich-root>",
      "application/xml"
    );
    if (doc.getElementsByTagName("parsererror").length) return "<p>" + esc(frag) + "</p>";
    return renderNodes(doc.documentElement.childNodes);
  }

  // ---- renderView(): swap rich textareas for read-only HTML (view mode) ----

  // The rich-capable textareas across all editors — the single place that knows
  // the rich fields (kept in sync with the fields upgraded in W01/W02). A page
  // only contains its own fields, so the combined selector is harmless elsewhere.
  var VIEW_FIELD_SELECTOR = [
    'textarea[name="descQuote"]', 'textarea[name="noteText"]',
    'textarea[name="incText"]', 'textarea[name="expText"]',
    'textarea.qt-text', 'textarea.nt-text',
    'textarea.cont-summary', 'textarea.deco-summary', 'textarea.hand-summary',
    'textarea.bind-note', 'textarea.hist-summary',
    'textarea.mi-inc-quote', 'textarea.mi-exp-quote', 'textarea.mi-note',
    'textarea.add-transcr', 'textarea.add-transl', 'textarea.add-note',
    'textarea.sup-note', 'textarea.col-note', 'textarea.cond-note', 'textarea.lay-sum-note',
    'textarea.sc-note', 'textarea.hn-note', 'textarea.dec-note',
    'textarea.acc-note', 'textarea.acc-quote', 'textarea.hv-note', 'textarea.hv-quote'
  ].join(",");

  // Replace each rich-capable textarea under `root` with a read-only
  // div.rich-view rendering its stored fragment as formatted HTML (plain text
  // renders as text; unknown markup degrades to escaped text via renderHtml).
  // The source textarea is hidden but kept in the DOM, so the existing
  // empty-field / block-emptiness logic (F.tagEmpty) keeps working from its
  // value — an empty field yields an empty div.rich-view and still folds away.
  function renderView(root) {
    if (!root) return;
    var tas = root.querySelectorAll(VIEW_FIELD_SELECTOR);
    Array.prototype.forEach.call(tas, function (ta) {
      if (ta._baRichView) return; // idempotent
      var div = document.createElement("div");
      div.className = "rich-view";
      div.innerHTML = renderHtml(ta.value);
      ta.style.display = "none";
      ta._baRichView = div;
      ta.parentNode.insertBefore(div, ta.nextSibling);
    });
  }

  api = {
    schemaUrl: SCHEMA_URL,
    ready: false, // set true once the module is defined (see load())
    load: load,
    upgrade: upgrade,
    upgradeWhenReady: upgradeWhenReady,
    setFragment: setFragment,
    getFragment: getFragment,
    innerXml: innerXml,
    embed: embed,
    renderHtml: renderHtml,
    renderView: renderView
  };
  window.BA.rich = api;
})();
