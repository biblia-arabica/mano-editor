// Work editor: create, import, edit, export one TEI work record
// conforming to templates/work-fulltemplate.xml.
// Renders its form from BA.uiText (labels, help texts, vocabularies).
// No external lookups — person links resolve against the local authority index.
// Exposes window.WorkEditor for wiring and tests.

(function () {
  "use strict";

  var U, F, H, LBL, V;

  function vocab(key) { return (V[key] || []); }
  function lbl(key) { return LBL[key] || { label: key, required: false }; }

  // ---------- HTML fragments ----------

  function labelHtml(key, overrideText) {
    var l = lbl(key);
    var star = l.required
      ? '<span class="required-star" data-bs-toggle="tooltip" title="Required field">*</span>'
      : "";
    var help = l.help
      ? ' <i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="' +
        U.esc(l.help) + '"></i>'
      : "";
    return '<label class="form-label">' + U.esc(overrideText || l.label) + star + help + "</label>";
  }

  function optionsHtml(list, selected, emptyLabel) {
    var out = '<option value="">' + U.esc(emptyLabel || "Please select") + "</option>";
    list.forEach(function (o) {
      out += '<option value="' + U.esc(o.v) + '"' + (o.v === selected ? " selected" : "") + ">" +
        U.esc(o.l) + "</option>";
    });
    return out;
  }

  function citedUnitList() {
    return vocab("citedRangeUnit").map(function (o) {
      return { v: o.v === "page" ? "p" : o.v, l: o.l };
    });
  }

  // title type select: majlis-headword -> ba-headword (Discrepancy 1).
  function titleTypeList() {
    return vocab("titleTypeWork").map(function (o) {
      if (o.v === "majlis-headword") return { v: "ba-headword", l: "BA headword / project title" };
      return { v: o.v, l: o.l };
    });
  }

  function sourceSelectHtml(cls) {
    return F.sourceSelectHtml(cls); // multi-select, title labels
  }

  function sourceSelectNamed(name) {
    return F.sourceSelectHtml("", name);
  }

  function certSelectHtml(cls) {
    return '<select class="form-select ' + cls + '">' + optionsHtml(vocab("certainty"), "", "— certainty —") + "</select>";
  }

  function certSelectNamed(name) {
    return '<select class="form-select" name="' + name + '">' + optionsHtml(vocab("certainty"), "", "— certainty —") + "</select>";
  }

  // ---------- form rendering ----------

  function sectionHtml(title, help, bodyHtml) {
    return '<div class="border rounded p-3 mb-4">' +
      '<h5>' + U.esc(title) +
      (help ? ' <i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="' + U.esc(help) + '"></i>' : "") +
      "</h5>" + bodyHtml + "</div>";
  }

  function heading(key) {
    return "<h6 class=\"mt-3\">" + U.esc(lbl(key).label) +
      (lbl(key).required ? '<span class="required-star" data-bs-toggle="tooltip" title="Required field">*</span>' : "") +
      (lbl(key).help ? ' <i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="' + U.esc(lbl(key).help) + '"></i>' : "") +
      "</h6>";
  }

  function otherLangsSelect() {
    return '<select class="form-select" name="wkOtherLangs" multiple size="3">' +
      vocab("langBasic").map(function (o) {
        return '<option value="' + U.esc(o.v) + '">' + U.esc(o.l) + "</option>";
      }).join("") + "</select>";
  }

  function renderForm() {
    var sections = {};
    window.BA.uiText.sections.work.forEach(function (s) { sections[s.name] = s; });
    function sec(name, fb) { return sections[name] ? sections[name].label : fb; }
    function secHelp(name) { return sections[name] ? sections[name].help : ""; }

    var html =
      // Record metadata (shared block: ID, title, editor, status, change note)
      sectionHtml("Record", "Record identity, editor and publication status.",
        H.recordBlockHtml("work")) +

      // Sections below the Record block live in a Bootstrap accordion (first open).
      '<div class="accordion" id="workAccordion">' +

      // Work
      F.accordionSectionHtml("workAccordion", 0, sec("bibl", "Work"), secHelp("bibl"),
        // Titles (repeatable)
        heading("title") +
        '<div class="titles-container"></div>' +
        '<button type="button" class="btn btn-sm btn-primary mb-3" id="addTitleBtn">' +
        '<i class="bi bi-plus"></i> Add title</button>' +

        // Authors (repeatable)
        heading("author") +
        '<div class="authors-container"></div>' +
        '<button type="button" class="btn btn-sm btn-primary mb-3" id="addAuthorBtn">' +
        '<i class="bi bi-plus"></i> Add author</button>' +

        // Associated persons (repeatable)
        heading("persName") +
        '<div class="persons-container"></div>' +
        '<button type="button" class="btn btn-sm btn-primary mb-3" id="addPersonBtn">' +
        '<i class="bi bi-plus"></i> Add person</button>' +

        // Language
        heading("textLang") +
        '<div class="row mb-3">' +
        '<div class="col-md-4"><label class="form-label">Main language</label>' +
        '<select class="form-select" name="wkMainLang">' + optionsHtml(vocab("langBasic")) + "</select></div>" +
        '<div class="col-md-4"><label class="form-label">Other languages</label>' + otherLangsSelect() + "</div>" +
        '<div class="col-md-4"><label class="form-label">Source</label>' + sourceSelectNamed("wkLangSource") + "</div>" +
        "</div>" +

        // Script term
        heading("term") +
        '<div class="row mb-3">' +
        '<div class="col-md-12"><label class="form-label">' + U.esc(lbl("term").label) + '</label>' +
        '<input type="text" class="form-control" name="wkScript"></div>' +
        "</div>" +

        // Date
        heading("date") +
        F.dateGroupHtml("wk-date", { withText: false, source: sourceSelectHtml("wk-date-source") }) +

        // Incipit — long-text field full-width; attributes (language, source) beneath.
        heading("incipit") +
        '<div class="row mb-2">' +
        '<div class="col-12"><label class="form-label">' + U.esc(lbl("incipit").label) + '</label>' +
        '<textarea class="form-control" name="incText" rows="2"></textarea></div>' +
        "</div>" +
        '<div class="row mb-3">' +
        '<div class="col-md-6"><label class="form-label">Language</label>' +
        '<select class="form-select" name="incLang">' + optionsHtml(vocab("langScript6")) + "</select></div>" +
        '<div class="col-md-6"><label class="form-label">Source</label>' + sourceSelectNamed("incSource") + "</div>" +
        "</div>" +

        // Explicit — long-text field full-width; attributes (language, source) beneath.
        heading("explicit") +
        '<div class="row mb-2">' +
        '<div class="col-12"><label class="form-label">' + U.esc(lbl("explicit").label) + '</label>' +
        '<textarea class="form-control" name="expText" rows="2"></textarea></div>' +
        "</div>" +
        '<div class="row mb-3">' +
        '<div class="col-md-6"><label class="form-label">Language</label>' +
        '<select class="form-select" name="expLang">' + optionsHtml(vocab("langScript6")) + "</select></div>" +
        '<div class="col-md-6"><label class="form-label">Source</label>' + sourceSelectNamed("expSource") + "</div>" +
        "</div>" +

        // Quotes (repeatable)
        heading("quote") +
        '<div class="quotes-container"></div>' +
        '<button type="button" class="btn btn-sm btn-primary mb-3" id="addQuoteBtn">' +
        '<i class="bi bi-plus"></i> Add transcription</button>' +

        // Notes (repeatable)
        heading("note") +
        '<div class="notes-container"></div>' +
        '<button type="button" class="btn btn-sm btn-primary" id="addNoteBtn">' +
        '<i class="bi bi-plus"></i> Add note</button>', true) +

      // Bibliography (repeatable)
      F.accordionSectionHtml("workAccordion", 1, sec("bibliography", "Bibliography"), secHelp("bibliography"),
        '<div class="bibl-container"></div>' +
        '<button type="button" class="btn btn-sm btn-primary" id="addBiblBtn">' +
        '<i class="bi bi-plus"></i> Add reference</button>', false) +
      "</div>"; // close #workAccordion

    document.getElementById("workForm").innerHTML = html;
  }

  // ---------- containers ----------

  function titlesContainer() { return document.querySelector("#workForm .titles-container"); }
  function authorsContainer() { return document.querySelector("#workForm .authors-container"); }
  function personsContainer() { return document.querySelector("#workForm .persons-container"); }
  function quotesContainer() { return document.querySelector("#workForm .quotes-container"); }
  function notesContainer() { return document.querySelector("#workForm .notes-container"); }
  function biblContainer() { return document.querySelector("#workForm .bibl-container"); }

  // ---------- repeatable blocks ----------

  function addTitleBlock(data) {
    data = data || {};
    var block = F.addBlock(titlesContainer(),
      '<div class="row">' +
      '<div class="col-md-5">' + labelHtml("title") +
      '<input type="text" class="form-control ti-text" value="' + U.esc(data.text || "") + '"></div>' +
      '<div class="col-md-3"><label class="form-label">Type</label>' +
      '<select class="form-select ti-type">' + optionsHtml(titleTypeList(), data.type || "ba-headword", "— type —") + "</select></div>" +
      '<div class="col-md-2"><label class="form-label">Language</label>' +
      '<select class="form-select ti-lang">' + optionsHtml(vocab("langScript6"), data.lang) + "</select></div>" +
      '<div class="col-md-2"><label class="form-label">Source</label>' + sourceSelectHtml("ti-source") + "</div>" +
      "</div>");
    refreshSourceSelects();
    if (data.source) F.setSourceSelect(block.querySelector(".ti-source"), data.source);
    F.initTooltips(block);
    return block;
  }

  function setLodInput(input, data, type) {
    var label = data.value || "";
    if (data.uri) {
      var rec = window.BA.authority.resolve(type, data.uri);
      if (rec && rec.headword) label = rec.headword;
      input.dataset.lodUri = data.uri;
    }
    input.value = label || (data.uri || "");
    if (data.uri) F.attachBadge(input, data.uri);
  }

  // Repeatable author: person link + cert + source -> one <author>.
  function addAuthorBlock(data) {
    data = data || {};
    var block = F.addBlock(authorsContainer(),
      '<div class="row">' +
      '<div class="col-md-5">' + labelHtml("author") +
      '<input type="text" class="form-control lod-autocomplete au-person" data-lod="local-person"></div>' +
      '<div class="col-md-3"><label class="form-label">Degree of certainty</label>' + certSelectHtml("au-cert") + "</div>" +
      '<div class="col-md-4"><label class="form-label">Source</label>' + sourceSelectHtml("au-source") + "</div>" +
      "</div>");
    if (data.person) setLodInput(block.querySelector(".au-person"), data.person, "person");
    if (data.cert) block.querySelector(".au-cert").value = data.cert;
    refreshSourceSelects();
    if (data.source) F.setSourceSelect(block.querySelector(".au-source"), data.source);
    F.initTooltips(block);
    return block;
  }

  function addPersonBlock(data) {
    data = data || {};
    var block = F.addBlock(personsContainer(),
      '<div class="row">' +
      '<div class="col-md-4">' + labelHtml("persName") +
      '<input type="text" class="form-control lod-autocomplete ap-person" data-lod="local-person"></div>' +
      '<div class="col-md-3"><label class="form-label">Role</label>' +
      '<select class="form-select ap-role">' + optionsHtml(vocab("workPersonRole"), data.role) + "</select></div>" +
      '<div class="col-md-2"><label class="form-label">Degree of certainty</label>' + certSelectHtml("ap-cert") + "</div>" +
      '<div class="col-md-3"><label class="form-label">Source</label>' + sourceSelectHtml("ap-source") + "</div>" +
      "</div>");
    if (data.person) setLodInput(block.querySelector(".ap-person"), data.person, "person");
    if (data.cert) block.querySelector(".ap-cert").value = data.cert;
    refreshSourceSelects();
    if (data.source) F.setSourceSelect(block.querySelector(".ap-source"), data.source);
    F.initTooltips(block);
    return block;
  }

  function addQuoteBlock(data) {
    data = data || {};
    // quote — long-text field full-width; attributes (language, type, source) beneath.
    var block = F.addBlock(quotesContainer(),
      '<div class="row mb-2">' +
      '<div class="col-12">' + labelHtml("quote") +
      '<textarea class="form-control qt-text" rows="2">' + U.esc(data.text || "") + "</textarea></div>" +
      "</div>" +
      '<div class="row">' +
      '<div class="col-md-4"><label class="form-label">Language</label>' +
      '<select class="form-select qt-lang">' + optionsHtml(vocab("langScript6"), data.lang) + "</select></div>" +
      '<div class="col-md-4"><label class="form-label">Type</label>' +
      '<select class="form-select qt-type">' + optionsHtml(vocab("quoteTypeWork"), data.type, "— type —") + "</select></div>" +
      '<div class="col-md-4"><label class="form-label">Source</label>' + sourceSelectHtml("qt-source") + "</div>" +
      "</div>");
    refreshSourceSelects();
    if (data.source) F.setSourceSelect(block.querySelector(".qt-source"), data.source);
    F.initTooltips(block);
    return block;
  }

  function addNoteBlock(data) {
    data = data || {};
    // note — long-text field full-width; attributes (type, language) beneath.
    var block = F.addBlock(notesContainer(),
      '<div class="row mb-2">' +
      '<div class="col-12">' + labelHtml("note") +
      '<textarea class="form-control nt-text" rows="2">' + U.esc(data.text || "") + "</textarea></div>" +
      "</div>" +
      '<div class="row">' +
      '<div class="col-md-6"><label class="form-label">Type</label>' +
      '<select class="form-select nt-type">' + optionsHtml(vocab("noteTypeWork"), data.type, "— type —") + "</select></div>" +
      '<div class="col-md-6"><label class="form-label">Language</label>' +
      '<select class="form-select nt-lang">' + optionsHtml(vocab("langNoteWork"), data.lang) + "</select></div>" +
      "</div>");
    F.initTooltips(block);
    return block;
  }

  var biblCounter = 0;
  var importedChanges = []; // append-only <change> history carried across import/export

  // Zotero lookup input — rendered only when the provider is enabled (libraryId set).
  function zoteroLookupHtml() {
    var p = window.BA.lod.providers.zotero;
    if (!(p && p.enabled && p.enabled())) return "";
    return '<div class="row mb-2"><div class="col-md-8">' + labelHtml("bibl") +
      '<input type="text" class="form-control lod-autocomplete zot-lookup" data-lod="zotero" ' +
      'placeholder="Search the project\'s Zotero library"></div></div>';
  }

  // Fill a bibl block from a selected Zotero result, then clear the lookup input.
  function fillBiblFromZotero(e) {
    var field = e.target;
    if (!field.classList || !field.classList.contains("zot-lookup")) return;
    var block = field.closest ? field.closest(".ba-block") : null;
    if (!block) return;
    var detail = e.detail || {};
    var titleEl = block.querySelector(".bibl-title");
    var ptrEl = block.querySelector(".bibl-ptr");
    // Prefer the formatted CMOS-17 note citation; fall back to the short title.
    var biblTitle = detail.extra && (detail.extra.citation || detail.extra.title);
    if (titleEl && biblTitle) {
      titleEl.value = biblTitle;
      // Fire input so the dirty guard and source-select refresh run —
      // the reference is then immediately selectable as a source with its title.
      titleEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (ptrEl && detail.uri) ptrEl.value = detail.uri;
    field.value = "";
    delete field.dataset.lodUri;
    var badge = field.parentNode && field.parentNode.querySelector(".lod-link");
    if (badge) badge.remove();
  }

  function addBiblBlock(data) {
    data = data || {};
    var id = data.id || ("bib" + (++biblCounter));
    var m = /^bib(\d+)$/.exec(id);
    if (m && parseInt(m[1], 10) > biblCounter) biblCounter = parseInt(m[1], 10);

    var block = F.addBlock(biblContainer(),
      zoteroLookupHtml() +
      '<div class="row">' +
      '<div class="col-md-3"><label class="form-label">' + U.esc(lbl("title").label) + '</label>' +
      '<input type="text" class="form-control bibl-title" value="' + U.esc(data.title || "") + '"></div>' +
      '<div class="col-md-2"><label class="form-label">Type</label>' +
      '<select class="form-select bibl-type">' + optionsHtml(vocab("biblTypeWork"), data.type, "— type —") + "</select></div>" +
      '<div class="col-md-2">' + labelHtml("citedRange") +
      '<input type="text" class="form-control bibl-cited" value="' + U.esc(data.cited || "") + '"></div>' +
      '<div class="col-md-1"><label class="form-label">Unit</label>' +
      '<select class="form-select bibl-unit">' + optionsHtml(citedUnitList(), data.unit || "p", "—") + "</select></div>" +
      '<div class="col-md-2">' + labelHtml("ptr") +
      '<input type="url" class="form-control bibl-ptr" value="' + U.esc(data.ptr || "") + '"></div>' +
      '<div class="col-md-2"><label class="form-label">ID</label>' +
      '<input type="text" class="form-control bibl-id" value="' + U.esc(id) + '" readonly></div>' +
      "</div>");
    refreshSourceSelects();
    F.initTooltips(block);
    return block;
  }

  // Repopulate every source select from the current bibliography blocks.
  function refreshSourceSelects() {
    F.refreshSourceSelects(document.getElementById("workForm"), biblContainer());
  }

  // ---------- data collection ----------

  function fieldVal(name) {
    var el = document.querySelector('#workForm [name="' + name + '"]');
    return (el && el.value.trim()) || "";
  }

  function fieldUri(name) {
    var el = document.querySelector('#workForm [name="' + name + '"]');
    return (el && el.dataset.lodUri) || "";
  }

  function multiVal(name) {
    var el = document.querySelector('#workForm [name="' + name + '"]');
    if (!el) return "";
    return Array.prototype.filter.call(el.options, function (o) { return o.selected && o.value; })
      .map(function (o) { return o.value; }).join(" ");
  }

  function titleRank(type) { return type === "ba-headword" ? 0 : 1; }

  function getWorkData() {
    var titles = F.blocks(titlesContainer()).map(function (b) {
      return {
        text: F.val(b, "ti-text"), type: F.val(b, "ti-type"),
        lang: F.val(b, "ti-lang"), source: F.readSourceSelect(b.querySelector(".ti-source"))
      };
    }).filter(function (t) { return t.text; });
    titles.sort(function (a, b) { return titleRank(a.type) - titleRank(b.type); });

    var wkDate = F.readDateGroup(document.getElementById("workForm"), "wk-date");

    var authors = F.blocks(authorsContainer()).map(function (b) {
      return { person: F.valUri(b, "au-person"), cert: F.val(b, "au-cert"), source: F.readSourceSelect(b.querySelector(".au-source")) };
    }).filter(function (a) { return a.person.value || a.person.uri; });

    return {
      id: fieldVal("recordId"),
      recordTitle: fieldVal("recordTitle"),
      creatorId: fieldVal("creatorId"),
      status: fieldVal("status") || "unpublished",
      titles: titles,
      authors: authors,
      // compat single author for validate.js (checks d.author.value / d.author.source)
      author: authors[0]
        ? { value: authors[0].person.value, uri: authors[0].person.uri, cert: authors[0].cert, source: authors[0].source }
        : { value: "", uri: "", cert: "", source: "" },
      persons: F.blocks(personsContainer()).map(function (b) {
        return {
          person: F.valUri(b, "ap-person"), role: F.val(b, "ap-role"),
          cert: F.val(b, "ap-cert"), source: F.readSourceSelect(b.querySelector(".ap-source"))
        };
      }).filter(function (p) { return p.person.value || p.person.uri; }),
      lang: {
        main: fieldVal("wkMainLang"), other: multiVal("wkOtherLangs"), source: F.readSourceSelect(document.querySelector('#workForm [name="wkLangSource"]'))
      },
      script: fieldVal("wkScript"),
      date: {
        when: wkDate.when, from: wkDate.from, to: wkDate.to, source: wkDate.source
      },
      incipit: { text: fieldVal("incText"), lang: fieldVal("incLang"), source: F.readSourceSelect(document.querySelector('#workForm [name="incSource"]')) },
      explicit: { text: fieldVal("expText"), lang: fieldVal("expLang"), source: F.readSourceSelect(document.querySelector('#workForm [name="expSource"]')) },
      quotes: F.blocks(quotesContainer()).map(function (b) {
        return { text: F.val(b, "qt-text"), lang: F.val(b, "qt-lang"), type: F.val(b, "qt-type"), source: F.readSourceSelect(b.querySelector(".qt-source")) };
      }).filter(function (x) { return x.text; }),
      notes: F.blocks(notesContainer()).map(function (b) {
        return { text: F.val(b, "nt-text"), lang: F.val(b, "nt-lang"), type: F.val(b, "nt-type") };
      }).filter(function (x) { return x.text; }),
      bibl: F.blocks(biblContainer()).map(function (b) {
        return {
          id: F.val(b, "bibl-id"), title: F.val(b, "bibl-title"), type: F.val(b, "bibl-type"),
          cited: F.val(b, "bibl-cited"), unit: F.val(b, "bibl-unit"), ptr: F.val(b, "bibl-ptr")
        };
      }).filter(function (x) { return x.title || x.cited || x.ptr; })
    };
  }

  // ---------- serialization ----------

  function buildWorkBody(d) {
    var parts = [];

    d.titles.forEach(function (t) {
      parts.push(U.el("title", { "xml:lang": t.lang, type: t.type, source: t.source }, U.esc(t.text)));
    });

    // All <author> elements emit before <persName> (template order).
    d.authors.forEach(function (a) {
      parts.push(U.el("author", { source: a.source, ref: a.person.uri, cert: a.cert }, U.esc(a.person.value)));
    });

    d.persons.forEach(function (p) {
      parts.push(U.el("persName", { role: p.role, source: p.source, ref: p.person.uri, cert: p.cert }, U.esc(p.person.value)));
    });

    if (d.lang.main || d.lang.other) {
      parts.push(U.el("textLang", { mainLang: d.lang.main, otherLangs: d.lang.other, source: d.lang.source }));
    }

    if (d.script) {
      parts.push(U.el("term", { type: "script" }, U.esc(d.script)));
    }

    if (d.date.when || d.date.from || d.date.to) {
      parts.push(U.el("date", { when: d.date.when, from: d.date.from, to: d.date.to, source: d.date.source }));
    }

    if (d.incipit.text) {
      parts.push(U.el("incipit", { "xml:lang": d.incipit.lang, source: d.incipit.source }, U.esc(d.incipit.text)));
    }
    if (d.explicit.text) {
      parts.push(U.el("explicit", { "xml:lang": d.explicit.lang, source: d.explicit.source }, U.esc(d.explicit.text)));
    }

    d.quotes.forEach(function (qt) {
      parts.push(U.el("quote", { "xml:lang": qt.lang, type: qt.type, source: qt.source }, U.esc(qt.text)));
    });

    d.notes.forEach(function (nt) {
      parts.push(U.el("note", { "xml:lang": nt.lang, type: nt.type }, U.esc(nt.text)));
    });

    d.bibl.forEach(function (b) {
      var kids = [];
      if (b.title) kids.push(U.el("title", null, U.esc(b.title)));
      if (b.cited) kids.push(U.el("citedRange", { unit: b.unit }, U.esc(b.cited)));
      if (b.ptr) kids.push(U.el("ptr", { target: b.ptr }));
      parts.push(U.el("bibl", { "xml:id": b.id, type: b.type }, kids));
    });

    var rootId = "work-" + (d.id || "");
    return "<text><body>" +
      U.el("bibl", { "xml:id": rootId, _keep: true }, ["", parts.join("\n"), ""].join("\n")) +
      "</body></text>";
  }

  function buildWorkXML() {
    var d = getWorkData();
    var rb = H.readRecordBlock(document.getElementById("workForm"));
    return U.indent(
      H.prolog("work") + H.rootOpen("work") +
      H.build({
        entityType: "work", articleTitle: rb.recordTitle, recordId: rb.recordId,
        creatorId: rb.creatorId, status: rb.status,
        changeNote: rb.changeNote, changes: importedChanges
      }) +
      buildWorkBody(d) + "</TEI>");
  }

  // ---------- import ----------

  function importWorkXML(text, filename) {
    var doc = U.parse(text); // throws on invalid XML
    var hdr = H.parse(doc);

    biblCounter = 0;
    importedChanges = hdr.changes || [];
    renderForm(); // reset
    wireStaticFields();

    var recordNotice = applyRecordBlock(hdr, filename);

    // The work body is the top-level bibl directly under <body>.
    var body = U.q(doc, "body");
    var root = null;
    if (body) {
      root = Array.prototype.filter.call(body.children, function (ch) { return ch.localName === "bibl"; })[0] || null;
    }
    if (!root) {
      showAlert(recordNotice || "No work <bibl> found in the uploaded file.", "warning");
      F.initTooltips(document.getElementById("workForm"));
      return hdr;
    }

    // Record ID: applyRecordBlock set it from the header idno / filename; fall
    // back to the body xml:id (work-{id}) for legacy files with a base-only idno.
    var idInput = document.querySelector('#workForm [name="recordId"]');
    if (idInput && !idInput.value) {
      var rootId = (root.getAttribute("xml:id") || "").replace(/^work-/, "");
      if (rootId) { idInput.value = rootId; updateUriDisplay(); recordNotice = ""; }
    }

    var kids = Array.prototype.slice.call(root.children);

    // Pass A: nested bibliography (direct bibl children) first.
    kids.forEach(function (ch) {
      if (ch.localName !== "bibl") return;
      addBiblBlock({
        id: ch.getAttribute("xml:id") || "",
        title: U.text(U.q(ch, "title")),
        type: ch.getAttribute("type") || "",
        cited: U.text(U.q(ch, "citedRange")),
        unit: U.attr(U.q(ch, "citedRange"), "unit"),
        ptr: U.attr(U.q(ch, "ptr"), "target")
      });
    });

    // Pass B: everything else in document order.
    kids.forEach(function (ch) {
      switch (ch.localName) {
        case "title":
          var ttype = ch.getAttribute("type") || "";
          if (ttype === "majlis-headword") ttype = "ba-headword";
          addTitleBlock({
            text: U.text(ch), type: ttype,
            lang: ch.getAttribute("xml:lang") || "", source: ch.getAttribute("source") || ""
          });
          break;
        case "author":
          addAuthorBlock({
            person: { value: U.text(ch), uri: ch.getAttribute("ref") || "" },
            cert: ch.getAttribute("cert") || "", source: ch.getAttribute("source") || ""
          });
          break;
        case "persName":
          addPersonBlock({
            person: { value: U.text(ch), uri: ch.getAttribute("ref") || "" },
            role: ch.getAttribute("role") || "", cert: ch.getAttribute("cert") || "",
            source: ch.getAttribute("source") || ""
          });
          break;
        case "textLang":
          document.querySelector('#workForm [name="wkMainLang"]').value = ch.getAttribute("mainLang") || "";
          setMulti("wkOtherLangs", (ch.getAttribute("otherLangs") || "").split(/\s+/).filter(Boolean));
          refreshSourceSelects();
          F.setSourceSelect(document.querySelector('#workForm [name="wkLangSource"]'), ch.getAttribute("source") || "");
          break;
        case "term":
          document.querySelector('#workForm [name="wkScript"]').value = U.text(ch);
          break;
        case "date":
          refreshSourceSelects();
          F.setDateGroup(document.getElementById("workForm"), "wk-date", {
            when: ch.getAttribute("when") || "", from: ch.getAttribute("from") || "",
            to: ch.getAttribute("to") || "", source: ch.getAttribute("source") || ""
          });
          break;
        case "incipit":
          document.querySelector('#workForm [name="incText"]').value = U.text(ch);
          document.querySelector('#workForm [name="incLang"]').value = ch.getAttribute("xml:lang") || "";
          refreshSourceSelects();
          F.setSourceSelect(document.querySelector('#workForm [name="incSource"]'), ch.getAttribute("source") || "");
          break;
        case "explicit":
          document.querySelector('#workForm [name="expText"]').value = U.text(ch);
          document.querySelector('#workForm [name="expLang"]').value = ch.getAttribute("xml:lang") || "";
          refreshSourceSelects();
          F.setSourceSelect(document.querySelector('#workForm [name="expSource"]'), ch.getAttribute("source") || "");
          break;
        case "quote":
          addQuoteBlock({
            text: U.text(ch), lang: ch.getAttribute("xml:lang") || "",
            type: ch.getAttribute("type") || "", source: ch.getAttribute("source") || ""
          });
          break;
        case "note":
          addNoteBlock({
            text: U.text(ch), lang: ch.getAttribute("xml:lang") || "", type: ch.getAttribute("type") || ""
          });
          break;
        case "bibl":
          break; // handled in pass A
        default:
          break;
      }
    });

    refreshSourceSelects();
    F.initTooltips(document.getElementById("workForm"));
    F.markClean(); // freshly imported record is not yet dirty
    showAlert((recordNotice ? recordNotice + " " : "") + "Imported. Review all sections before downloading.",
      recordNotice ? "warning" : "success");
    return hdr;
  }

  function setMulti(name, values) {
    var el = document.querySelector('#workForm [name="' + name + '"]');
    if (!el) return;
    Array.prototype.forEach.call(el.options, function (o) {
      o.selected = values.indexOf(o.value) !== -1;
    });
  }

  // ---------- page wiring ----------

  var previewCM = null;

  function showAlert(message, kind) {
    var zone = document.getElementById("alertZone");
    if (!zone) { console.warn(message); return; }
    zone.innerHTML = '<div class="alert alert-' + (kind || "warning") + ' alert-dismissible" role="alert">' +
      U.esc(message) +
      '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>';
  }

  // Reload all four authority indexes (any editor can link to any type),
  // bypassing the 1 h localStorage cache, then report per-type record counts.
  function reloadIndexes() {
    var types = ["manuscript", "person", "place", "work"];
    Promise.all(types.map(function (t) { return window.BA.authority.refresh(t); }))
      .then(function (lists) {
        var counts = types.map(function (t, i) { return t + ": " + lists[i].length; }).join(", ");
        showAlert("Records reloaded — " + counts + ".", "success");
      });
  }

  function updateUriDisplay() {
    var id = fieldVal("recordId");
    var out = document.getElementById("recordUri");
    if (out) {
      out.textContent = id
        ? window.BA.config.baseUri + "/" + window.BA.config.entityPaths.work + "/" + id
        : "";
    }
  }

  function wireStaticFields() {
    var idInput = document.querySelector('#workForm [name="recordId"]');
    if (idInput) idInput.addEventListener("input", updateUriDisplay);
  }

  // Populate the shared Record block from a parsed header (identical logic in
  // all four editors). Record ID is recovered from the header idno, else the
  // uploaded filename; returns a warning string when neither yields an id.
  function applyRecordBlock(hdr, filename) {
    var form = document.getElementById("workForm");
    function set(name, val) { var el = form.querySelector('[name="' + name + '"]'); if (el) el.value = val; }
    set("recordTitle", hdr.articleTitle || "");
    set("creatorId", hdr.creatorId || "");
    if (hdr.status) set("status", hdr.status);
    var fileId = (filename && (filename.match(/^(\d+)\.xml$/) || [])[1]) || "";
    var recId = hdr.recordId || fileId;
    set("recordId", recId);
    updateUriDisplay();
    return recId ? "" : "Record ID could not be recovered — set it manually before download.";
  }

  function showPreview() {
    var xml = buildWorkXML();
    var ta = document.getElementById("xmlPreviewEditor");
    if (typeof CodeMirror !== "undefined" && ta) {
      if (!previewCM) {
        previewCM = CodeMirror.fromTextArea(ta, { mode: "xml", lineNumbers: true, readOnly: true });
      }
      previewCM.setValue(xml);
      setTimeout(function () { previewCM.refresh(); }, 200);
    } else if (ta) {
      ta.value = xml;
    }
    if (typeof bootstrap !== "undefined") {
      new bootstrap.Modal(document.getElementById("xmlModal")).show();
    }
    return xml;
  }

  function download() {
    var d = getWorkData();
    var id = d.id || "work";
    window.BA.authority.checkCollision("work", id).then(function (exists) {
      if (exists && !window.confirm("A work with id " + id +
        " already exists in the index. Download anyway?")) return;
      var blob = new Blob([buildWorkXML()], { type: "application/xml" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = id + ".xml";
      a.click();
      F.markClean(); // record saved locally
    });
  }

  function newRecord(skipConfirm) {
    if (!skipConfirm && !window.confirm("Clear the form and start a new work record?")) return;
    biblCounter = 0;
    importedChanges = [];
    renderForm();
    wireStaticFields();
    addTitleBlock();
    addAuthorBlock(); // first author block present by default
    window.BA.authority.nextId("work").then(function (id) {
      var input = document.querySelector('#workForm [name="recordId"]');
      if (input && !input.value) { input.value = id; updateUriDisplay(); }
    });
    F.initTooltips(document.getElementById("workForm"));
    F.markClean(); // fresh form
  }

  function init() {
    U = window.BA.util; F = window.BA.form; H = window.BA.header;
    LBL = window.BA.uiText.labels.work.work;
    V = window.BA.uiText.vocab;

    window.BA.authority.load("person"); // local-person autocomplete + resolve()
    window.BA.authority.load("work");    // nextId + collision check

    newRecord(true);

    // Unsaved-changes guard: flag edits inside the form, warn on exit.
    F.trackDirty(document.getElementById("workForm"));
    F.installUnloadGuard();

    // ?view={id} read-only view mode takes precedence over the ?load={id} deep
    // link; both import data/works/{id}.xml on init.
    if (!loadViewFromQuery()) loadFromQuery();

    document.addEventListener("click", function (e) {
      if (!e.target.closest) return;
      if (F.isViewMode()) return;
      if (e.target.closest("#addTitleBtn")) addTitleBlock();
      if (e.target.closest("#addAuthorBtn")) addAuthorBlock();
      if (e.target.closest("#addPersonBtn")) addPersonBlock();
      if (e.target.closest("#addQuoteBtn")) addQuoteBlock();
      if (e.target.closest("#addNoteBtn")) addNoteBlock();
      if (e.target.closest("#addBiblBtn")) addBiblBlock();
      if (e.target.closest("#reloadIndexBtn")) reloadIndexes();
    });

    // Zotero bibliography lookup -> fill title + ptr, clear the lookup.
    document.addEventListener("ba-lod-selected", fillBiblFromZotero);

    document.getElementById("workForm").addEventListener("input", function (e) {
      if (e.target.closest && e.target.closest(".bibl-container")) refreshSourceSelects();
    });

    var up = document.getElementById("fileUpload");
    if (up) {
      up.addEventListener("change", function (e) {
        var file = e.target.files[0];
        if (!file) return;
        if (!file.name.endsWith(".xml")) { showAlert("Only XML files are allowed.", "warning"); return; }
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            importWorkXML(ev.target.result, file.name);
          } catch (err) {
            showAlert("Import failed: " + err.message, "danger");
          }
        };
        reader.readAsText(file);
      });
    }

    var btn = document.getElementById("newRecordBtn");
    if (btn) btn.addEventListener("click", function () { newRecord(false); });
    btn = document.getElementById("previewBtn");
    if (btn) btn.addEventListener("click", showPreview);
    btn = document.getElementById("downloadBtn");
    if (btn) btn.addEventListener("click", download);

    // Open-from-repository picker.
    btn = document.getElementById("openRepoBtn");
    if (btn) btn.addEventListener("click", function () {
      if (F.isDirty() && !window.confirm("Unsaved changes will be lost. Continue?")) return;
      F.openRepoPicker("work", function (text, filename) {
        importWorkXML(text, filename);
        F.markClean();
        showAlert("Loaded " + filename + " from the repository.", "success");
      });
    });

    // Submit to repository: validation gate lives in BA.github.openSubmit.
    btn = document.getElementById("submitRepoBtn");
    if (btn) btn.addEventListener("click", function () {
      var d = getWorkData();
      var rb = H.readRecordBlock(document.getElementById("workForm"));
      window.BA.github.openSubmit({
        type: "work", id: d.id || "work", xml: buildWorkXML(),
        data: d, changeNote: rb.changeNote
      });
    });
  }

  // ?load={id}: resolve the id in the work index and import its file.
  function loadFromQuery() {
    var id = new URLSearchParams(location.search).get("load");
    if (!id || !/^\d+$/.test(id)) return;
    window.BA.authority.load("work").then(function (recs) {
      var rec = null;
      for (var i = 0; i < recs.length; i++) { if (String(recs[i].id) === id) { rec = recs[i]; break; } }
      if (!rec) {
        showAlert("Record " + id + " not found in the work index — rebuild the index if the file was just added", "warning");
        return;
      }
      fetch(rec.file)
        .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
        .then(function (text) { importWorkXML(text, (rec.file || "").split("/").pop()); F.markClean(); })
        .catch(function (err) { showAlert("Could not load record " + id + ": " + err.message, "danger"); });
    });
  }

  // ?view={id}: import the record (same path as ?load=), then lock the form
  // read-only. Returns true when a valid ?view= id was present (so init skips
  // the ?load= path). _viewMode is set before import so badges rendered during
  // import pick up their internal "view this record" links.
  function loadViewFromQuery() {
    var id = new URLSearchParams(location.search).get("view");
    if (!id || !/^\d+$/.test(id)) return false;
    window.BA.authority.load("work").then(function (recs) {
      var rec = null;
      for (var i = 0; i < recs.length; i++) { if (String(recs[i].id) === id) { rec = recs[i]; break; } }
      if (!rec) {
        showAlert("Record " + id + " not found in the work index — rebuild the index if the file was just added", "warning");
        return;
      }
      fetch(rec.file)
        .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
        .then(function (text) {
          F._viewMode = true;
          importWorkXML(text, (rec.file || "").split("/").pop());
          F.enterViewMode(document.getElementById("workForm"), {
            type: "work",
            id: id,
            editorHref: "work-editor.html?load=" + id,
            collectionHref: "collection-works.html"
          });
          buildRevisionHistory();
        })
        .catch(function (err) { showAlert("Could not load record " + id + ": " + err.message, "danger"); });
    });
    return true;
  }

  // Read-only revision-history table under the Record block (view mode only).
  // Each imported <change> becomes one row: resolved editor name, date, note.
  // Appended AFTER F.tagEmpty so this content-only section is never folded away.
  function buildRevisionHistory() {
    if (!importedChanges || !importedChanges.length) return;
    var editorsById = {};
    (window.BA.config.editors || []).forEach(function (ed) { editorsById[ed.id] = ed.name; });

    var rows = importedChanges.map(function (chStr) {
      var el = null;
      try { el = U.q(U.parse("<ba-root>" + chStr + "</ba-root>"), "change"); } catch (e) { el = null; }
      if (!el) return "";
      var who = (el.getAttribute("who") || "").replace(/^#/, "");
      var when = el.getAttribute("when") || "";
      var note = U.text(el);
      var name = editorsById[who] || who;
      return "<tr><td>" + U.esc(name) + "</td><td>" + U.esc(when) + "</td><td>" + U.esc(note) + "</td></tr>";
    }).filter(Boolean).join("");
    if (!rows) return;

    var section = document.createElement("div");
    section.className = "border rounded p-3 mb-4 ba-revision-history";
    section.innerHTML =
      "<h5>Revision history</h5>" +
      '<table class="table table-sm mb-0"><thead><tr>' +
      "<th>Editor</th><th>Date</th><th>Note</th></tr></thead><tbody>" + rows + "</tbody></table>";

    var accordion = document.getElementById("workAccordion");
    if (accordion && accordion.parentNode) accordion.parentNode.insertBefore(section, accordion);
    else document.getElementById("workForm").appendChild(section);
  }

  document.addEventListener("DOMContentLoaded", init);

  // Public API (used by tests and by later tasks' cross-editor links).
  window.WorkEditor = {
    init: init,
    getWorkData: function () { return getWorkData(); },
    buildWorkBody: function (d) { return buildWorkBody(d); },
    buildWorkXML: function () { return buildWorkXML(); },
    importWorkXML: function (t, f) { return importWorkXML(t, f); },
    addTitleBlock: function (d) { return addTitleBlock(d); },
    addAuthorBlock: function (d) { return addAuthorBlock(d); },
    addPersonBlock: function (d) { return addPersonBlock(d); },
    addQuoteBlock: function (d) { return addQuoteBlock(d); },
    addNoteBlock: function (d) { return addNoteBlock(d); },
    addBiblBlock: function (d) { return addBiblBlock(d); },
    refreshSourceSelects: refreshSourceSelects,
    newRecord: newRecord
  };
})();
