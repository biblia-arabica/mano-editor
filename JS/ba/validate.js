// Validation: per-entity rule sets + a report modal, wired into every
// editor's "Download XML" button. Mandatory issues block download; recommendations
// show the report with a "Download anyway" confirm.
// Everything on BA.validate. Classic script (no build step; loaded via <script>).

(function () {
  "use strict";

  var validate = window.BA.validate = window.BA.validate || {};
  function esc(s) { return window.BA.util ? window.BA.util.esc(s) : String(s == null ? "" : s); }

  // ---------- shared predicates ----------

  var DATE_RE = /^-?\d{4}(-\d{2}(-\d{2})?)?$/;      // YYYY, YYYY-MM, YYYY-MM-DD (leading - = BCE)
  var GEO_RE = /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/; // "lat, lng"

  function isPosInt(s) { s = String(s == null ? "" : s).trim(); return /^\d+$/.test(s) && parseInt(s, 10) > 0; }
  function biblIds(d) { return (d.bibl || []).map(function (b) { return b.id; }); }
  function mand(context, message) { return { context: context, message: message, severity: "mandatory" }; }
  function rec(context, message) { return { context: context, message: message, severity: "recommendation" }; }

  function headwordOk(type, d) {
    if (type === "person") return (d.names || []).some(function (n) { return n.type === "ba-headword" && n.name; });
    if (type === "place") return (d.names || []).some(function (n) { return n.headword && n.name; });
    if (type === "work") return (d.titles || []).some(function (t) { return t.type === "ba-headword" && t.text; });
    if (type === "manuscript") return !!(d.ident && (d.ident.msName || d.ident.shelfmark));
    return true;
  }
  function headwordMsg(type) {
    if (type === "manuscript") return "Add a manuscript name or a shelfmark (the record needs a headword).";
    if (type === "work") return "Mark at least one title as the headword (type “BA headword”).";
    return "Mark at least one name as the headword (type “BA headword”).";
  }

  // Date groups per type: [{ when, from, to, ctx }]
  function collectDates(type, d) {
    var out = [];
    function push(ev, ctx) { if (ev) out.push({ when: ev.when, from: ev.from, to: ev.to, ctx: ctx }); }
    if (type === "person") {
      (d.births || []).forEach(function (e) { push(e, "Birth date"); });
      (d.deaths || []).forEach(function (e) { push(e, "Death date"); });
      (d.floruits || []).forEach(function (e) { push(e, "Floruit date"); });
    } else if (type === "work") {
      push(d.date, "Date");
    } else if (type === "manuscript") {
      ((d.hands && d.hands.handNotes) || []).forEach(function (h) { push(h, "Hand date"); });
      if (d.binding) push(d.binding, "Binding date");
      ((d.history && d.history.provenance) || []).forEach(function (p) { push(p, "Provenance date"); });
      ((d.history && d.history.acquisition) || []).forEach(function (a) { push(a, "Acquisition date"); });
    }
    return out;
  }

  // Source selects that point at a #bibl-id: [{ val, ctx }]
  function collectSources(type, d) {
    var out = [];
    function add(val, ctx) { if (val) out.push({ val: val, ctx: ctx }); }
    if (type === "person") {
      (d.names || []).forEach(function (n) { add(n.source, "Name source"); });
      if (d.state) add(d.state.source, "Role source");
      collectDates("person", d); // no-op, dates carry their own sources below
      (d.births || []).concat(d.deaths || [], d.floruits || []).forEach(function (e) { add(e.dateSource, "Life-event date source"); add(e.placeSource, "Life-event place source"); });
      if (d.sex) add(d.sex.source, "Sex source");
      if (d.faith) add(d.faith.source, "Faith source");
      (d.occupations || []).forEach(function (o) { add(o.source, "Occupation source"); });
      (d.residences || []).forEach(function (r) { add(r.source, "Residence source"); });
    } else if (type === "place") {
      (d.names || []).forEach(function (n) { add(n.source, "Name source"); });
      if (d.desc) add(d.desc.source, "Description source");
      if (d.location) { add(d.location.geoSource, "Coordinates source"); add(d.location.settlementSource, "City source"); add(d.location.regionSource, "Region source"); }
    } else if (type === "work") {
      (d.titles || []).forEach(function (t) { add(t.source, "Title source"); });
      if (d.author) add(d.author.source, "Author source");
      (d.persons || []).forEach(function (p) { add(p.source, "Person source"); });
      if (d.lang) add(d.lang.source, "Language source");
      if (d.date) add(d.date.source, "Date source");
      if (d.incipit) add(d.incipit.source, "Incipit source");
      if (d.explicit) add(d.explicit.source, "Explicit source");
      (d.quotes || []).forEach(function (q) { add(q.source, "Quote source"); });
    }
    return out;
  }

  // Ref-capable fields: [{ value, uri, ctx }]
  function collectRefs(type, d) {
    var out = [];
    function add(obj, ctx) { if (obj) out.push({ value: obj.value, uri: obj.uri, ctx: ctx }); }
    if (type === "person") {
      (d.births || []).forEach(function (e) { add(e.place, "Birth place"); });
      (d.deaths || []).forEach(function (e) { add(e.place, "Death place"); });
      (d.floruits || []).forEach(function (e) { add(e.place, "Floruit place"); });
      (d.residences || []).forEach(function (r) { add(r.place, "Residence place"); });
    } else if (type === "place") {
      if (d.location) { add(d.location.settlement, "City"); add(d.location.region, "Region"); }
    } else if (type === "work") {
      add(d.author, "Author");
      (d.persons || []).forEach(function (p) { add(p.person, "Associated person"); });
    } else if (type === "manuscript") {
      (d.msItems || []).forEach(function (m) { add(m.work, "Work"); add(m.author, "Author"); });
      ((d.hands && d.hands.handNotes) || []).forEach(function (h) { add(h.scribe, "Scribe"); add(h.place, "Hand place"); });
      if (d.binding) add(d.binding.place, "Binding place");
      ((d.history && d.history.provenance) || []).forEach(function (p) { add(p.place, "Provenance place"); add(p.person, "Provenance person"); });
      ((d.history && d.history.acquisition) || []).forEach(function (a) { add(a.place, "Acquisition place"); add(a.person, "Acquisition person"); });
    }
    return out;
  }

  // ---------- rich-text fields (R6) ----------

  // Rich-capable field values per type: [{ value, ctx }]. Kept in step with the
  // fields upgraded to JinnTap in W01/W02 (NOT the layoutDesc/page-layout
  // summary, which stays structured and is excluded from rich text).
  function collectRich(type, d) {
    var out = [];
    function add(v, ctx) { if (v != null && String(v) !== "") out.push({ value: v, ctx: ctx }); }
    if (type === "place") {
      if (d.desc) add(d.desc.text, "Description");
    } else if (type === "person") {
      if (d.note) add(d.note.text, "Note");
    } else if (type === "work") {
      if (d.incipit) add(d.incipit.text, "Incipit");
      if (d.explicit) add(d.explicit.text, "Explicit");
      (d.quotes || []).forEach(function (q, i) { add(q.text, "Quote " + (i + 1)); });
      (d.notes || []).forEach(function (n, i) { add(n.text, "Note " + (i + 1)); });
    } else if (type === "manuscript") {
      add(d.summary, "Contents summary");
      (d.msItems || []).forEach(function (m, i) {
        add(m.incQuote, "Text unit " + (i + 1) + " incipit");
        add(m.expQuote, "Text unit " + (i + 1) + " explicit");
        add(m.note, "Text unit " + (i + 1) + " note");
      });
      if (d.support) { add(d.support.note, "Support note"); add(d.support.colNote, "Collation note"); add(d.support.condNote, "Condition note"); }
      if (d.layout) add(d.layout.sumNote, "Page-layout summary note");
      if (d.hands) {
        add(d.hands.summary, "Hand summary");
        (d.hands.scripts || []).forEach(function (s, i) { add(s.note, "Script " + (i + 1) + " note"); });
        (d.hands.handNotes || []).forEach(function (h, i) { add(h.note, "Hand " + (i + 1) + " note"); });
      }
      if (d.deco) {
        add(d.deco.summary, "Text-layout summary");
        (d.deco.notes || []).forEach(function (n, i) { add(n.note, "Text-layout feature " + (i + 1) + " note"); });
      }
      (d.additions || []).forEach(function (a, i) {
        add(a.transcr, "Incodicated document " + (i + 1) + " transcription");
        add(a.transl, "Incodicated document " + (i + 1) + " translation");
        add(a.note, "Incodicated document " + (i + 1) + " note");
      });
      if (d.binding) add(d.binding.note, "Binding note");
      (d.accMats || []).forEach(function (a, i) {
        add(a.note, "Heritage document " + (i + 1) + " note");
        add(a.quote, "Heritage document " + (i + 1) + " quote");
      });
      if (d.history) {
        add(d.history.summary, "History summary");
        (d.history.provenance || []).forEach(function (p, i) { add(p.quote, "Provenance " + (i + 1) + " quote"); add(p.note, "Provenance " + (i + 1) + " note"); });
        (d.history.acquisition || []).forEach(function (a, i) { add(a.quote, "Acquisition " + (i + 1) + " quote"); add(a.note, "Acquisition " + (i + 1) + " note"); });
      }
    }
    return out;
  }

  // One whitelist for all rich fields (CHANGES-R6 mapping table): paragraph,
  // line break, italic/bold via emph@rend, headline via hi@rend="h1".
  var RICH_ALLOWED = { p: true, lb: true, emph: true, hi: true };
  var RICH_UNSUPPORTED = "Unsupported markup — allowed: paragraphs, line breaks, headlines, bold, italic.";

  // Returns an issue message if the parsed fragment uses any element or
  // attribute outside the whitelist, else null.
  function richMarkupIssue(doc) {
    var els = doc.documentElement.getElementsByTagName("*");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var name = el.localName;
      if (!RICH_ALLOWED[name]) return RICH_UNSUPPORTED;
      if (name === "emph") {
        var r = el.getAttribute("rend");
        if (r !== "italic" && r !== "bold") return RICH_UNSUPPORTED;
      } else if (name === "hi") {
        var hr = el.getAttribute("rend");
        if (hr !== "h1" && hr !== "h2" && hr !== "h3") return RICH_UNSUPPORTED;
      } else if (name === "lb") {
        if (el.childNodes && el.childNodes.length) return RICH_UNSUPPORTED;
      }
    }
    return null;
  }

  // Validate every rich-capable field: markup must be well-formed and use only
  // the whitelisted elements/attributes. Belt-and-braces — JinnTap output is
  // always valid, but a textarea-fallback record could be hand-typed.
  function checkRich(type, d, issues) {
    if (!(window.BA.util && window.BA.util.parse)) return; // no XML parser (non-DOM env)
    collectRich(type, d).forEach(function (f) {
      var v = String(f.value == null ? "" : f.value);
      if (!/^\s*</.test(v)) return; // plain text carries no markup to check
      var doc;
      try { doc = window.BA.util.parse("<x>" + v + "</x>"); }
      catch (e) { issues.push(mand(f.ctx, "Text formatting is malformed and cannot be saved — re-enter it, or remove stray “<” characters.")); return; }
      var msg = richMarkupIssue(doc);
      if (msg) issues.push(mand(f.ctx, msg));
    });
  }

  // ---------- per-type mandatory field rules ----------

  validate.rules = {
    person: [
      { context: "Gender", severity: "mandatory",
        test: function (d) { return !d.sex || !d.sex.value || ["M", "F", "U"].indexOf(d.sex.value) !== -1; },
        message: "Gender must be Male, Female, or Unknown." }
    ],
    place: [
      { context: "Place name", severity: "mandatory",
        test: function (d) { return (d.names || []).some(function (n) { return n.name; }); },
        message: "At least one place name is required." },
      { context: "Coordinates", severity: "mandatory",
        test: function (d) { return !(d.location && d.location.geo) || GEO_RE.test(d.location.geo); },
        message: "Coordinates must be in “latitude, longitude” decimal form (e.g. 30.05, 31.23)." }
    ],
    work: [
      { context: "Title", severity: "mandatory",
        test: function (d) { return (d.titles || []).some(function (t) { return t.text; }); },
        message: "At least one title is required." }
    ],
    manuscript: [
      { context: "Country of location", severity: "mandatory", test: function (d) { return !!(d.ident && d.ident.country); }, message: "Country of location is required." },
      { context: "Place", severity: "mandatory", test: function (d) { return !!(d.ident && d.ident.settlement); }, message: "Settlement (place) is required." },
      { context: "Institution", severity: "mandatory", test: function (d) { return !!(d.ident && d.ident.repository); }, message: "Holding institution (repository) is required." },
      { context: "Collection", severity: "mandatory", test: function (d) { return !!(d.ident && d.ident.collection); }, message: "Collection is required." },
      { context: "Shelfmark", severity: "mandatory", test: function (d) { return !!(d.ident && d.ident.shelfmark); }, message: "Shelfmark is required." },
      { context: "Content", severity: "recommendation", test: function (d) { return (d.msItems || []).length > 0; }, message: "Consider describing at least one text unit (msItem)." }
    ]
  };

  // ---------- run ----------

  validate.run = function (type, d) {
    var issues = [];

    if (!isPosInt(d.id)) issues.push(mand("Record ID", "Record ID must be a positive integer."));
    if (!d.recordTitle) issues.push(mand("Record title", "A record title is required."));
    if (!d.creatorId) issues.push(mand("Editor", "An editor must be selected."));
    if (!headwordOk(type, d)) issues.push(mand("Headword", headwordMsg(type)));

    (validate.rules[type] || []).forEach(function (r) {
      if (!r.test(d)) issues.push({ context: r.context, message: r.message, severity: r.severity || "mandatory" });
    });

    collectDates(type, d).forEach(function (g) {
      // Safety net only: the date-type selector (BA.form date group)
      // clears the hidden side, so `when` and `from/to` can no longer coexist
      // through the UI. Kept to guard hand-edited imports.
      if (g.when && (g.from || g.to)) issues.push(mand(g.ctx, "Use either a single date (When exactly?) or a range (From/To), not both."));
      [g.when, g.from, g.to].forEach(function (v) {
        if (v && !DATE_RE.test(v)) issues.push(mand(g.ctx, "Date “" + v + "” must be YYYY, YYYY-MM, or YYYY-MM-DD."));
      });
    });

    var ids = biblIds(d);
    collectSources(type, d).forEach(function (s) {
      // @source is a whitespace-separated pointer list — check each token.
      String(s.val || "").trim().split(/\s+/).filter(Boolean).forEach(function (tok) {
        var v = tok.replace(/^#/, "");
        if (v && ids.indexOf(v) === -1) issues.push(mand(s.ctx, "Source points to a bibliography entry that no longer exists."));
      });
    });

    collectRefs(type, d).forEach(function (r) {
      if (r.value && !r.uri) issues.push(rec(r.ctx, r.ctx + " has text but is not linked to a record."));
    });

    checkRich(type, d, issues);

    return issues;
  };

  // ---------- report + download gate ----------

  function reportZone() {
    var z = document.getElementById("alertZone");
    if (!z) {
      z = document.createElement("div");
      z.id = "alertZone";
      z.className = "mt-3";
      document.body.insertBefore(z, document.body.firstChild);
    }
    return z;
  }

  function showReport(issues) {
    var mandatory = issues.filter(function (i) { return i.severity === "mandatory"; });
    var recs = issues.filter(function (i) { return i.severity !== "mandatory"; });
    var html = '<div class="alert alert-' + (mandatory.length ? "danger" : "warning") + ' alert-dismissible" role="alert">' +
      '<h5><i class="bi bi-exclamation-triangle"></i> Validation report</h5>';
    if (mandatory.length) {
      html += '<h6 class="text-danger mt-2">Must fix before download</h6><ul>' +
        mandatory.map(function (i) { return "<li><strong>" + esc(i.context) + "</strong>: " + esc(i.message) + "</li>"; }).join("") + "</ul>";
    }
    if (recs.length) {
      html += '<h6 class="text-warning mt-2">Recommendations</h6><ul>' +
        recs.map(function (i) { return "<li><strong>" + esc(i.context) + "</strong>: " + esc(i.message) + "</li>"; }).join("") + "</ul>";
    }
    html += '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>';
    var z = reportZone();
    z.innerHTML = html;
    if (typeof z.scrollIntoView === "function") {
      try { z.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) { /* non-DOM env */ }
    }
  }
  validate.showReport = showReport;

  function clearReport() { var z = document.getElementById("alertZone"); if (z) z.innerHTML = ""; }

  // Identify the editor active on this page via its public API.
  function currentEditor() {
    if (window.MsEditor) return { type: "manuscript", data: function () { return window.MsEditor.getMsData(); } };
    if (window.PersonEditor) return { type: "person", data: function () { return window.PersonEditor.getPersonData(); } };
    if (window.PlaceEditor) return { type: "place", data: function () { return window.PlaceEditor.getPlaceData(); } };
    if (window.WorkEditor) return { type: "work", data: function () { return window.WorkEditor.getWorkData(); } };
    return null;
  }

  // Gate runs before the editor's own download handler (capture phase on document,
  // so it fires regardless of listener registration order).
  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("#downloadBtn") : null;
    if (!btn) return;
    var ed = currentEditor();
    if (!ed) return;

    var issues = validate.run(ed.type, ed.data());
    var mandatory = issues.filter(function (i) { return i.severity === "mandatory"; });
    var recs = issues.filter(function (i) { return i.severity !== "mandatory"; });

    if (mandatory.length) {
      showReport(issues);
      e.stopImmediatePropagation();
      e.preventDefault();
      return;
    }
    if (recs.length) {
      showReport(issues);
      if (!window.confirm("There are recommendations you may want to review. Download anyway?")) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return;
      }
    } else {
      clearReport();
    }
    // no mandatory issues (and recs accepted) -> let the editor's handler run
  }, true);
})();
