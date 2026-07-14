// Manuscript editor: build + export one TEI manuscript record conforming
// to templates/full-mss-template.xml. msDesc lives in text/body/listBibl/msDesc.
// All person/place/work references use local-* autocomplete only.
// Renders its accordion form from BA.uiText.
// Exposes window.MsEditor for wiring and tests.

(function () {
  "use strict";

  var U, F, H, V;
  var LBLROOT; // BA.uiText.labels.mss

  var FORM = "#msFormContainer";

  // Round-trip: unmapped children captured on import, keyed by parent path,
  // re-emitted verbatim at the end of that parent on the next export.
  var importExtras = {};
  var importedChanges = []; // append-only <change> history carried across import/export

  function vocab(key) { return (V[key] || []); }
  function L(section, key) {
    var s = LBLROOT[section] || {};
    return s[key] || { label: key, required: false };
  }

  // ---------- HTML helpers ----------

  function esc(s) { return U.esc(s); }

  function optionsHtml(list, selected, emptyLabel) {
    var out = '<option value="">' + esc(emptyLabel || "Please select") + "</option>";
    list.forEach(function (o) {
      out += '<option value="' + esc(o.v) + '"' + (o.v === selected ? " selected" : "") + ">" +
        esc(o.l) + "</option>";
    });
    return out;
  }

  function citedUnitList() {
    return vocab("citedRangeUnit").map(function (o) {
      return { v: o.v === "page" ? "p" : o.v, l: o.l };
    });
  }

  function labelHtml(section, key, overrideText) {
    var l = L(section, key);
    var star = l.required
      ? '<span class="required-star" data-bs-toggle="tooltip" title="Required field">*</span>' : "";
    var help = l.help
      ? ' <i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="' + esc(l.help) + '"></i>' : "";
    return '<label class="form-label">' + esc(overrideText || l.label) + star + help + "</label>";
  }

  // Label for an element's attribute, sourced from the uiText attribute gloss
  // (do not hard-code). e.g. attrLabelHtml("script-hand-description","metamark","function").
  function attrLabelHtml(section, key, attrName) {
    return '<label class="form-label">' + esc(L(section, key).attrs[attrName].label) + "</label>";
  }
  // Language label for a note's xml:lang select.
  function langLabelHtml(section) {
    return attrLabelHtml(section, "note", "xml:lang");
  }

  // Open-vocab fields use the shared visible <select> + "Other…" helper:
  // F.selectWithOtherHtml(cls, vocabKey, "").

  function selectHtml(cls, vocabKey, empty) {
    return '<select class="form-select ' + cls + '">' + optionsHtml(vocab(vocabKey), "", empty) + "</select>";
  }

  function multiSelectHtml(cls, vocabKey) {
    return '<select class="form-select ' + cls + '" multiple size="4">' +
      vocab(vocabKey).map(function (o) { return '<option value="' + esc(o.v) + '">' + esc(o.l) + "</option>"; }).join("") +
      "</select>";
  }

  function textInput(cls) { return '<input type="text" class="form-control ' + cls + '">'; }
  function textarea(cls) { return '<textarea class="form-control ' + cls + '" rows="2"></textarea>'; }
  function langSelect(cls, vocabKey) { return '<select class="form-select ' + cls + '">' + optionsHtml(vocab(vocabKey || "langScript6")) + "</select>"; }
  function certSelect(cls) { return '<select class="form-select ' + cls + '">' + optionsHtml(vocab("certainty"), "", "— certainty —") + "</select>"; }

  function col(n, inner) { return '<div class="col-md-' + n + '">' + inner + "</div>"; }
  function row(inner) { return '<div class="row g-2 mb-2">' + inner + "</div>"; }

  function locusRow(fromCls, toCls, section) {
    return row(
      col(6, labelHtml(section || "content-description", "locus") +
        '<div class="input-group"><span class="input-group-text">from</span>' + textInput(fromCls) +
        '<span class="input-group-text">to</span>' + textInput(toCls) + "</div>"));
  }

  // Date group: "Date type" gates when/range fields. ms date elements
  // (handNote/binding origDate, history date) carry no text content -> withText:false.
  function dateRow(prefix) {
    return F.dateGroupHtml(prefix, { withText: false });
  }

  // ---------- accordion scaffold ----------
  // Uses the shared BA.form.accordionSectionHtml. ms keeps every section
  // collapsed by default (open = false), unchanged from before the extraction.

  function addBtn(id, text) {
    return '<button type="button" class="btn btn-sm btn-primary mb-2" id="' + id + '"><i class="bi bi-plus"></i> ' + esc(text) + "</button>";
  }

  // ---------- Repeatable sub-lists ----------
  // A lightweight repeatable list nested inside a parent (a section or a
  // .ba-block). Each entry is a `.{cls}-item` — deliberately NOT a `.ba-block`,
  // so the outer F.blocks() never captures it, and its own `.sublist-del` button
  // (distinct from `.ba-block-delete`) removes only that entry.
  function subList(cls, addLabel) {
    return '<div class="sublist-wrap mb-2">' +
      '<div class="' + cls + '-list"></div>' +
      '<button type="button" class="btn btn-sm btn-outline-secondary sublist-add" data-sub="' + cls + '">' +
      '<i class="bi bi-plus"></i> ' + esc(addLabel) + "</button></div>";
  }

  function locusEntry(cls) {
    return '<div class="input-group input-group-sm"><span class="input-group-text">from</span>' +
      textInput(cls + "-from") + '<span class="input-group-text">to</span>' + textInput(cls + "-to") + "</div>";
  }

  // cls -> inner field markup for one entry (no delete button; that is added by
  // addSub). The section heading carries the field name, so the main input here
  // has no label; only secondary attributes (language, cert, role) are labelled.
  var SUBITEM = {
    "mi-locus": function () { return locusEntry("mi-locus"); },
    "mi-title": function () {
      return row(col(6, '<input type="text" class="form-control lod-autocomplete mi-work" data-lod="local-work">') +
        col(3, '<label class="form-label">Language</label>' + langSelect("mi-title-lang")) +
        col(3, '<label class="form-label">Degree of certainty</label>' + certSelect("mi-title-cert")));
    },
    "mi-author": function () {
      return row(col(8, '<input type="text" class="form-control lod-autocomplete mi-author" data-lod="local-person">') +
        col(4, '<label class="form-label">Degree of certainty</label>' + certSelect("mi-author-cert")));
    },
    "col-catchwords": function () { return selectHtml("col-catchwords", "catchwords"); },
    "lay-sum-desc": function () { return selectHtml("lay-sum-desc", "pageLayoutFeature"); },
    "ly-just": function () { return selectHtml("ly-just", "justificationFeature"); },
    "ly-ruling": function () { return selectHtml("ly-ruling", "ruling"); },
    "ly-pricking": function () { return selectHtml("ly-pricking", "pricking"); },
    "dec-desc": function () { return selectHtml("dec-desc", "textLayoutFeature"); },
    "hn-locus": function () { return locusEntry("hn-locus"); },
    "hn-persname": function () {
      return row(col(7, '<input type="text" class="form-control lod-autocomplete hn-scribe" data-lod="local-person">') +
        col(5, '<label class="form-label">Role</label>' + selectHtml("hn-role", "handPersonRole")));
    },
    "hn-place": function () { return '<input type="text" class="form-control lod-autocomplete hn-place" data-lod="local-place">'; },
    "hn-metamark": function () {
      return row(col(8, labelHtml("script-hand-description", "metamark") + textInput("hn-metamark-text")) +
        col(4, attrLabelHtml("script-hand-description", "metamark", "function") + selectHtml("hn-metamark", "handMetamarkFunction")));
    },
    "bind-place": function () { return '<input type="text" class="form-control lod-autocomplete bind-place" data-lod="local-place">'; },
    "hv-place": function () { return '<input type="text" class="form-control lod-autocomplete hv-place" data-lod="local-place">'; },
    "hv-person": function () {
      return row(col(8, '<input type="text" class="form-control lod-autocomplete hv-person" data-lod="local-person">') +
        col(4, '<label class="form-label">Role</label>' + selectHtml("hv-role", "historyPersonRole")));
    }
  };

  // Heading + sub-list, using the uiText label for `section/key` as the heading.
  function subSection(section, key, cls, addLabel) {
    return '<h6 class="small text-muted mt-2 mb-1">' + esc(L(section, key).label) + "</h6>" + subList(cls, addLabel);
  }
  // Heading + sub-list with a literal heading (fields with no uiText key).
  function subHead(text, cls, addLabel) {
    return '<h6 class="small text-muted mt-2 mb-1">' + esc(text) + "</h6>" + subList(cls, addLabel);
  }

  // Append one entry to a sublist and return the new .sublist-item element.
  function addSub(listEl, cls) {
    var item = document.createElement("div");
    item.className = "sublist-item " + cls + "-item border-start border-2 ps-2 mb-2 position-relative";
    item.innerHTML =
      '<button type="button" class="btn-close sublist-del position-absolute top-0 end-0" aria-label="Delete entry"></button>' +
      '<div class="pe-4">' + SUBITEM[cls]() + "</div>";
    listEl.appendChild(item);
    if (F && F.initTooltips) F.initTooltips(item);
    return item;
  }

  // All entries of a sublist scoped to `parent` (a block or the form container).
  function subEntries(parent, cls) {
    return Array.prototype.slice.call((parent || document).querySelectorAll("." + cls + "-item"));
  }

  // Append an entry to the `{cls}-list` inside `parent` (used by import).
  function addSubTo(parent, cls) {
    var list = (parent || document).querySelector("." + cls + "-list");
    return list ? addSub(list, cls) : null;
  }

  // ---------- section form bodies ----------

  function fIdentification() {
    return row(
      col(4, labelHtml("identification", "country") + F.selectWithOtherHtml("msid-country", "mssCountry", "")) +
      col(4, labelHtml("identification", "settlement") + F.selectWithOtherHtml("msid-settlement", "mssSettlement", "")) +
      col(4, labelHtml("identification", "repository") + F.selectWithOtherHtml("msid-repository", "mssRepository", ""))) +
      row(
        col(4, labelHtml("identification", "collection") + F.selectWithOtherHtml("msid-collection", "mssCollection", "")) +
        col(4, labelHtml("identification", "idno") + textInput("msid-shelfmark")) +
        col(4, labelHtml("identification", "msName") + textInput("msid-msname"))) +
      "<h6>" + esc(L("identification", "altIdentifier").label) + "</h6>" +
      '<div class="altid-container"></div>' + addBtn("addAltIdBtn", "Add alternate identifier");
  }

  function fContent() {
    return row(col(12, labelHtml("content-description", "summary") + textarea("cont-summary"))) +
      row(col(4, '<label class="form-label">Language</label>' + langSelect("cont-summary-lang"))) +
      "<h6>" + esc(L("content-description", "msItem").label) + "</h6>" +
      '<div class="msitems-container"></div>' + addBtn("addMsItemBtn", "Add text unit");
  }

  function fCodicological() {
    return row(
      col(4, labelHtml("codicological-definition", "objectType") + selectHtml("cod-text", "codicologicalType")) +
      col(4, '<label class="form-label">Book form</label>' + selectHtml("cod-style", "objectTypeStyle")) +
      col(4, '<label class="form-label">Format</label>' + selectHtml("cod-rend", "objectTypeRend"))) +
      "<h6>" + esc(L("codicological-definition", "bibl").label) + "</h6>" +
      '<div class="joins-container"></div>' + addBtn("addJoinBtn", "Add manuscript join");
  }

  function fWritingMaterial() {
    return row(
      col(6, labelHtml("writing-material", "material") + F.selectWithOtherHtml("sup-material", "writingMaterial", "")) +
      col(4, labelHtml("writing-material", "note") + textInput("sup-note")) +
      col(2, langLabelHtml("writing-material") + langSelect("sup-note-lang"))) +
      row(
        col(4, labelHtml("writing-material", "measure") + textInput("ext-folios")) +
        col(4, labelHtml("writing-material", "height") + textInput("ext-h")) +
        col(4, labelHtml("writing-material", "width") + textInput("ext-w"))) +
      row(
        col(6, labelHtml("writing-material", "foliation") + '<div class="input-group">' +
          selectHtml("fol-style", "foliationStyle", "Style") + selectHtml("fol-rendition", "foliationRendition", "Rendition") + "</div>")) +
      "<h6>" + esc(L("writing-material", "collation").label) + "</h6>" +
      row(
        col(3, labelHtml("writing-material", "formula") + selectHtml("col-formula", "quireFormula")) +
        col(3, '<label class="form-label">Unit</label>' + textInput("col-unit")) +
        col(3, '<label class="form-label">Note</label>' + textInput("col-note")) +
        col(3, langLabelHtml("writing-material") + langSelect("col-note-lang"))) +
      subSection("writing-material", "catchwords", "col-catchwords", "Add ordering of the quires") +
      "<h6>" + esc(L("writing-material", "condition").label) + "</h6>" +
      row(
        col(3, '<label class="form-label">Note</label>' + textInput("cond-note")) +
        col(3, langLabelHtml("writing-material") + langSelect("cond-note-lang")) +
        col(3, labelHtml("writing-material", "ab") + textInput("cond-writing")) +
        col(3, '<label class="form-label">Characterization</label>' + selectHtml("cond-rend", "conditionWritingRend")));
  }

  function fPageLayout() {
    return "<h6>" + esc(L("page-layout", "summary").label) + "</h6>" +
      subSection("page-layout", "desc", "lay-sum-desc", "Add page-layout feature") +
      row(col(4, '<label class="form-label">Note</label>' + textInput("lay-sum-note")) +
        col(4, langLabelHtml("page-layout") + langSelect("lay-sum-note-lang"))) +
      "<h6>" + esc(L("page-layout", "layout").label) + "</h6>" +
      '<div class="layouts-container"></div>' + addBtn("addLayoutBtn", "Add layout");
  }

  function fTextLayout() {
    return row(col(12, labelHtml("text-layout", "summary") + textarea("deco-summary"))) +
      row(col(4, '<label class="form-label">Language</label>' + langSelect("deco-summary-lang"))) +
      "<h6>" + esc(L("text-layout", "decoNote").label) + "</h6>" +
      '<div class="deco-container"></div>' + addBtn("addDecoBtn", "Add text-layout feature");
  }

  function fScriptHand() {
    return "<h6>" + esc(L("script-hand-description", "scriptNote").label) + "</h6>" +
      '<div class="scripts-container"></div>' + addBtn("addScriptBtn", "Add script") +
      "<h6 class=\"mt-3\">" + esc(L("script-hand-description", "summary").label) + "</h6>" +
      row(col(12, '<label class="form-label">Summary of hand</label>' + textarea("hand-summary"))) +
      row(col(4, '<label class="form-label">Language</label>' + langSelect("hand-summary-lang"))) +
      "<h6>" + esc(L("script-hand-description", "handNote").label) + "</h6>" +
      '<div class="hands-container"></div>' + addBtn("addHandBtn", "Add hand");
  }

  function fIncodicated() {
    return '<div class="additions-container"></div>' + addBtn("addAdditionBtn", "Add incodicated document");
  }

  function fBinding() {
    return row(
      col(6, labelHtml("binding-description", "objectType") + selectHtml("bind-type", "bindingObjectType")) +
      col(6, labelHtml("binding-description", "material") + selectHtml("bind-material", "bindingMaterial"))) +
      row(
        col(8, labelHtml("binding-description", "condition") + textInput("bind-condition-text")) +
        col(4, attrLabelHtml("binding-description", "condition", "key") + selectHtml("bind-condition", "bindingConditionKey"))) +
      subHead("Place of origin", "bind-place", "Add place of origin") +
      dateRow("bind") +
      // dimensions (height/width/depth) is one TEI element; the binding note is
      // a separate element -> its own full-width row (long-text).
      row(
        col(4, labelHtml("binding-description", "height") + textInput("bind-h")) +
        col(4, labelHtml("binding-description", "width") + textInput("bind-w")) +
        col(4, labelHtml("binding-description", "depth") + textInput("bind-depth"))) +
      row(col(9, '<label class="form-label">Note</label>' + textarea("bind-note")) +
        col(3, langLabelHtml("binding-description") + langSelect("bind-note-lang")));
  }

  function fHeritage() {
    return '<div class="accmat-container"></div>' + addBtn("addAccMatBtn", "Add heritage document");
  }

  function fHistory() {
    return row(col(12, '<label class="form-label">Summary</label>' + textarea("hist-summary"))) +
      row(col(4, '<label class="form-label">Language</label>' + langSelect("hist-summary-lang", "langBasic"))) +
      "<h6>" + esc(L("manuscript-history", "provenance") ? L("manuscript-history", "provenance").label : "Modern owner") + "</h6>" +
      '<div class="prov-container"></div>' + addBtn("addProvBtn", "Add provenance") +
      "<h6 class=\"mt-3\">" + esc(L("manuscript-history", "acquisition") ? L("manuscript-history", "acquisition").label : "Acquisition") + "</h6>" +
      '<div class="acq-container"></div>' + addBtn("addAcqBtn", "Add acquisition");
  }

  function fReproductions() {
    return '<div class="repros-container"></div>' + addBtn("addReproBtn", "Add reproduction");
  }

  function fBibliography() {
    return '<div class="bibl-container"></div>' + addBtn("addBiblBtn", "Add reference");
  }

  // Map: section name -> body builder. Order/titles from BA.uiText.sections.mss.
  var SECTION_BODY = {
    identification: fIdentification,
    reproductions: fReproductions,
    "codicological-definition": fCodicological,
    "content-description": fContent,
    "writing-material": fWritingMaterial,
    "page-layout": fPageLayout,
    "text-layout": fTextLayout,
    "script-hand-description": fScriptHand,
    "incodicated-documents": fIncodicated,
    "binding-description": fBinding,
    "heritage-data": fHeritage,
    "manuscript-history": fHistory,
    bibliography: fBibliography
  };

  function renderForm() {
    var meta =
      '<div class="border rounded p-3 mb-3">' +
      '<h5>Record</h5>' +
      H.recordBlockHtml("manuscript") +
      "</div>";

    var acc = '<div class="accordion" id="msAccordion">';
    window.BA.uiText.sections.mss.forEach(function (s, i) {
      var body = SECTION_BODY[s.name];
      if (!body) return;
      acc += F.accordionSectionHtml("msAccordion", i, s.label, s.help, body(), false);
    });
    acc += "</div>";

    document.getElementById("msFormContainer").innerHTML = meta + acc;
  }

  // ---------- repeatable blocks ----------

  function container(cls) { return document.querySelector(FORM + " ." + cls); }

  function addAltIdBlock() {
    return F.addBlock(container("altid-container"),
      row(col(5, '<label class="form-label">Type</label>' + selectHtml("alt-type", "altIdentifierType")) +
        col(7, '<label class="form-label">Identifier</label>' + textInput("alt-idno"))));
  }

  var idCounters = { msitem: 0, layout: 0, hand: 0, addition: 0, bib: 0 };

  function addMsItemBlock() {
    var n = ++idCounters.msitem;
    // Text units are user-reorderable (movable). Reordering changes DOM order,
    // which is what the msContents export serialises; the block's dataset.xmlid
    // ("msitem-{n}") stays fixed, so the emitted xml:id no longer encodes
    // position — it is a stable identifier, by design.
    var block = F.addBlock(container("msitems-container"),
      row(col(6, labelHtml("content-description", "msItem") + selectHtml("mi-class", "msItemClass"))) +
      subSection("content-description", "locus", "mi-locus", "Add range of folios") +
      subSection("content-description", "title", "mi-title", "Add canonical title") +
      subSection("content-description", "author", "mi-author", "Add canonical author") +
      row(col(6, '<label class="form-label">Main language</label>' + '<select class="form-select mi-mainlang">' + optionsHtml(vocab("langBasic")) + "</select>") +
        col(6, '<label class="form-label">Other languages</label>' + multiSelectHtml("mi-otherlangs", "langBasic"))) +
      // incipit — quote (long-text) full-width first, its locus + language beneath.
      "<h6>" + esc(L("content-description", "incipit").label) + "</h6>" +
      row(col(12, textarea("mi-inc-quote"))) +
      row(col(6, '<div class="input-group"><span class="input-group-text">from</span>' + textInput("mi-inc-from") +
          '<span class="input-group-text">to</span>' + textInput("mi-inc-to") + "</div>") +
        col(6, '<label class="form-label">Language</label>' + langSelect("mi-inc-lang"))) +
      // explicit — quote (long-text) full-width first, its locus + language beneath.
      "<h6>" + esc(L("content-description", "explicit").label) + "</h6>" +
      row(col(12, textarea("mi-exp-quote"))) +
      row(col(6, '<div class="input-group"><span class="input-group-text">from</span>' + textInput("mi-exp-from") +
          '<span class="input-group-text">to</span>' + textInput("mi-exp-to") + "</div>") +
        col(6, '<label class="form-label">Language</label>' + langSelect("mi-exp-lang"))) +
      // note — long-text field full-width; language beneath.
      row(col(12, labelHtml("content-description", "note") + textarea("mi-note"))) +
      row(col(4, '<label class="form-label">Language</label>' + langSelect("mi-note-lang"))),
      { movable: true });
    block.dataset.xmlid = "msitem-" + n;
    F.initTooltips(block);
    return block;
  }

  function addJoinBlock() {
    return F.addBlock(container("joins-container"),
      row(col(4, labelHtml("codicological-definition", "idno") +
          '<input type="text" class="form-control lod-autocomplete join-idno" data-lod="local-manuscript" ' +
          'placeholder="Search manuscript records — or type a shelfmark">') +
        col(4, labelHtml("codicological-definition", "citedRange") + textInput("join-folios")) +
        col(4, labelHtml("codicological-definition", "ptr") + '<input type="url" class="form-control join-ptr">')));
  }

  function addLayoutBlock() {
    var n = ++idCounters.layout;
    var block = F.addBlock(container("layouts-container"),
      row(col(3, '<label class="form-label">' + esc(L("page-layout", "layout").attrs.writtenLines.label) + '</label>' + textInput("ly-lines")) +
        col(3, '<label class="form-label">Columns</label>' + textInput("ly-cols")) +
        col(6, labelHtml("page-layout", "locus") + '<div class="input-group"><span class="input-group-text">from</span>' +
          textInput("ly-locus-from") + '<span class="input-group-text">to</span>' + textInput("ly-locus-to") + "</div>")) +
      row(col(6, labelHtml("page-layout", "height") + textInput("ly-h")) +
        col(6, labelHtml("page-layout", "width") + textInput("ly-w"))) +
      subSection("page-layout", "metamark", "ly-just", "Add justification") +
      subHead("Ruling", "ly-ruling", "Add ruling") +
      subHead("Pricking", "ly-pricking", "Add pricking"));
    block.dataset.xmlid = "layout-" + n;
    F.initTooltips(block);
    return block;
  }

  function addScriptBlock() {
    return F.addBlock(container("scripts-container"),
      row(col(3, '<label class="form-label">Graphic system</label>' + selectHtml("sc-lang", "scriptGraphicSystem")) +
        col(3, '<label class="form-label">Script type</label>' + selectHtml("sc-script", "scriptType")) +
        col(3, '<label class="form-label">Script mode</label>' + selectHtml("sc-style", "scriptMode")) +
        col(3, '<label class="form-label">Script quality</label>' + selectHtml("sc-rend", "scriptQuality"))) +
      row(col(9, '<label class="form-label">Note</label>' + textInput("sc-note")) +
        col(3, '<label class="form-label">Language</label>' + langSelect("sc-note-lang"))));
  }

  function addHandBlock() {
    var n = ++idCounters.hand;
    var block = F.addBlock(container("hands-container"),
      row(col(6, '<label class="form-label">Ink</label>' + selectHtml("hn-medium", "inkMedium")) +
        col(6, '<label class="form-label">HebrewPal link</label>' + '<input type="url" class="form-control hn-source">')) +
      subSection("script-hand-description", "locus", "hn-locus", "Add range of folios") +
      subSection("script-hand-description", "persName", "hn-persname", "Add person") +
      subSection("script-hand-description", "placeName", "hn-place", "Add place of origin") +
      subSection("script-hand-description", "metamark", "hn-metamark", "Add special graphic sign") +
      dateRow("hn") +
      row(col(9, '<label class="form-label">Note</label>' + textInput("hn-note")) +
        col(3, '<label class="form-label">Language</label>' + langSelect("hn-note-lang"))));
    block.dataset.xmlid = "hand-" + n;
    F.initTooltips(block);
    return block;
  }

  function addDecoBlock() {
    return F.addBlock(container("deco-container"),
      subSection("text-layout", "desc", "dec-desc", "Add text-layout feature") +
      row(col(8, '<label class="form-label">Note</label>' + textInput("dec-note")) +
        col(4, '<label class="form-label">Note language</label>' + langSelect("dec-note-lang"))));
  }

  function addAdditionBlock() {
    var n = ++idCounters.addition;
    var block = F.addBlock(container("additions-container"),
      row(col(6, labelHtml("incodicated-documents", "objectType") + selectHtml("add-type", "incodicatedType")) +
        col(6, labelHtml("incodicated-documents", "locus") + '<div class="input-group"><span class="input-group-text">from</span>' +
          textInput("add-locus-from") + '<span class="input-group-text">to</span>' + textInput("add-locus-to") + "</div>")) +
      // transcription / translation / note — long-text fields full-width, language beneath.
      row(col(12, '<label class="form-label">Transcription</label>' + textarea("add-transcr"))) +
      row(col(4, '<label class="form-label">Language</label>' + langSelect("add-transcr-lang"))) +
      row(col(12, '<label class="form-label">Translation</label>' + textarea("add-transl"))) +
      row(col(4, '<label class="form-label">Language</label>' + langSelect("add-transl-lang"))) +
      row(col(12, labelHtml("incodicated-documents", "note") + textarea("add-note"))) +
      row(col(4, '<label class="form-label">Language</label>' + langSelect("add-note-lang"))));
    block.dataset.xmlid = "addition-" + n;
    F.initTooltips(block);
    return block;
  }

  function addAccMatBlock() {
    return F.addBlock(container("accmat-container"),
      row(col(8, labelHtml("heritage-data", "note") + textInput("acc-note")) +
        col(4, '<label class="form-label">Language</label>' + langSelect("acc-note-lang"))) +
      row(col(6, labelHtml("heritage-data", "persName") + '<input type="text" class="form-control lod-autocomplete acc-person" data-lod="local-person">')) +
        row(col(8, labelHtml("heritage-data", "quote") + textInput("acc-quote")) +
        col(4, '<label class="form-label">Language</label>' + langSelect("acc-quote-lang", "langQuoteHeritage"))) +
      zoteroLookupHtml("acc-title", "acc-ptr") +
      row(col(4, labelHtml("heritage-data", "title") + textInput("acc-title")) +
        col(3, labelHtml("heritage-data", "citedRange") + textInput("acc-cited")) +
        col(2, '<label class="form-label">Unit</label>' + '<select class="form-select acc-unit">' + optionsHtml(citedUnitList(), "p", "—") + "</select>") +
        col(3, '<label class="form-label">Link</label>' + '<input type="url" class="form-control acc-ptr">')));
  }

  function histBlockHtml() {
    return dateRow("hv") +
      subSection("manuscript-history", "placeName", "hv-place", "Add place name") +
      row(col(6, labelHtml("manuscript-history", "locus") + '<div class="input-group"><span class="input-group-text">from</span>' +
          textInput("hv-locus-from") + '<span class="input-group-text">to</span>' + textInput("hv-locus-to") + "</div>")) +
      subSection("manuscript-history", "persName", "hv-person", "Add person") +
      row(col(6, labelHtml("manuscript-history", "stamp") + textInput("hv-stamp")) +
        col(6, labelHtml("manuscript-history", "quote") + textInput("hv-quote"))) +
      row(col(6, '<label class="form-label">Transcription language</label>' + langSelect("hv-quote-lang", "langBasic")) +
        col(3, '<label class="form-label">Note</label>' + textInput("hv-note")) +
        col(3, '<label class="form-label">Note language</label>' + langSelect("hv-note-lang")));
  }

  function addProvBlock() { return F.addBlock(container("prov-container"), histBlockHtml()); }
  function addAcqBlock() { return F.addBlock(container("acq-container"), histBlockHtml()); }

  function addReproBlock() {
    return F.addBlock(container("repros-container"),
      row(col(4, labelHtml("reproductions", "title") + selectHtml("sur-title", "reproductionType")) +
        col(4, labelHtml("reproductions", "publisher") + F.selectWithOtherHtml("sur-publisher", "reproductionPublisher", "")) +
        col(4, labelHtml("reproductions", "ptr") + '<input type="url" class="form-control sur-ptr">')));
  }

  // Zotero lookup input — rendered only when the provider is enabled (libraryId set).
  // The title/ptr fields it fills are named per-block via data-*-target, so the
  // same input+handler serve the main Bibliography (bibl-title/bibl-ptr) and the
  // heritage items (acc-title/acc-ptr).
  function zoteroLookupHtml(titleCls, ptrCls) {
    var p = window.BA.lod.providers.zotero;
    if (!(p && p.enabled && p.enabled())) return "";
    titleCls = titleCls || "bibl-title"; ptrCls = ptrCls || "bibl-ptr";
    return row(col(8, labelHtml("bibliography", "bibl") +
      '<input type="text" class="form-control lod-autocomplete zot-lookup" data-lod="zotero" ' +
      'data-title-target="' + esc(titleCls) + '" data-ptr-target="' + esc(ptrCls) + '" ' +
      'placeholder="Search the project\'s Zotero library">'));
  }

  // Fill a bibl block from a selected Zotero result, then clear the lookup input.
  // Target fields are resolved by class within the containing .ba-block.
  function fillBiblFromZotero(e) {
    var field = e.target;
    if (!field.classList || !field.classList.contains("zot-lookup")) return;
    var block = field.closest ? field.closest(".ba-block") : null;
    if (!block) return;
    var detail = e.detail || {};
    var titleEl = block.querySelector("." + (field.dataset.titleTarget || "bibl-title"));
    var ptrEl = block.querySelector("." + (field.dataset.ptrTarget || "bibl-ptr"));
    // Prefer the formatted CMOS-17 note citation; fall back to the short title.
    var biblTitle = detail.extra && (detail.extra.citation || detail.extra.title);
    if (titleEl && biblTitle) {
      titleEl.value = biblTitle;
      // Fire input so the dirty guard registers the change.
      titleEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (ptrEl && detail.uri) ptrEl.value = detail.uri;
    field.value = "";
    delete field.dataset.lodUri;
    var badge = field.parentNode && field.parentNode.querySelector(".lod-link");
    if (badge) badge.remove();
  }

  // Manuscript-join lookup: when a join-idno resolves against a manuscript
  // record, keep the label as the visible shelfmark and auto-fill the block's
  // ptr/@target with the record URI (only if empty). The idno itself stays plain
  // text on export (dataset.lodUri is not serialised), matching the template.
  function fillJoinPtrFromLookup(e) {
    var field = e.target;
    if (!field.classList || !field.classList.contains("join-idno")) return;
    var block = field.closest ? field.closest(".ba-block") : null;
    if (!block) return;
    var detail = e.detail || {};
    var ptrEl = block.querySelector(".join-ptr");
    if (ptrEl && !ptrEl.value && detail.uri) ptrEl.value = detail.uri;
  }

  function addBiblBlock() {
    var id = "bib" + (++idCounters.bib);
    var block = F.addBlock(container("bibl-container"),
      zoteroLookupHtml() +
      row(col(4, labelHtml("bibliography", "title") + textInput("bibl-title")) +
        col(3, labelHtml("bibliography", "citedRange") + textInput("bibl-cited")) +
        col(2, '<label class="form-label">Unit</label>' + '<select class="form-select bibl-unit">' + optionsHtml(citedUnitList(), "p", "—") + "</select>") +
        col(2, labelHtml("bibliography", "ptr") + '<input type="url" class="form-control bibl-ptr">') +
        col(1, '<label class="form-label">ID</label>' + '<input type="text" class="form-control bibl-id" value="' + esc(id) + '" readonly>')));
    F.initTooltips(block);
    return block;
  }

  // ---------- data collection ----------

  function qv(name) { var el = document.querySelector(FORM + ' [name="' + name + '"]'); return (el && el.value.trim()) || ""; }
  function blockMulti(b, cls, sep) {
    var el = b.querySelector("." + cls);
    if (!el) return "";
    return Array.prototype.filter.call(el.options, function (o) { return o.selected && o.value; })
      .map(function (o) { return o.value; }).join(sep || " ");
  }
  function blocks(cls) { var c = container(cls); return c ? F.blocks(c) : []; }

  function getMsData() {
    var bindDate = F.readDateGroup(document.querySelector(FORM), "bind");
    return {
      id: qv("recordId"), recordTitle: qv("recordTitle"), creatorId: qv("creatorId"), status: qv("status") || "unpublished",

      ident: {
        country: selVal("msid-country"), settlement: selVal("msid-settlement"),
        repository: selVal("msid-repository"), collection: selVal("msid-collection"),
        shelfmark: fieldClass("msid-shelfmark"), msName: fieldClass("msid-msname"),
        altIds: blocks("altid-container").map(function (b) {
          return { type: F.val(b, "alt-type"), idno: F.val(b, "alt-idno") };
        }).filter(function (a) { return a.type || a.idno; })
      },

      summary: fieldClass("cont-summary"), summaryLang: fieldClass("cont-summary-lang"),
      msItems: blocks("msitems-container").map(function (b) {
        return {
          xmlid: b.dataset.xmlid, cls: F.val(b, "mi-class"),
          loci: subEntries(b, "mi-locus").map(function (it) { return { from: F.val(it, "mi-locus-from"), to: F.val(it, "mi-locus-to") }; }).filter(function (l) { return l.from || l.to; }),
          titles: subEntries(b, "mi-title").map(function (it) { return { work: F.valUri(it, "mi-work"), lang: F.val(it, "mi-title-lang"), cert: F.val(it, "mi-title-cert") }; }).filter(function (t) { return t.work.value || t.work.uri; }),
          authors: subEntries(b, "mi-author").map(function (it) { return { author: F.valUri(it, "mi-author"), cert: F.val(it, "mi-author-cert") }; }).filter(function (a) { return a.author.value || a.author.uri; }),
          mainLang: F.val(b, "mi-mainlang"), otherLangs: blockMulti(b, "mi-otherlangs", " "),
          incFrom: F.val(b, "mi-inc-from"), incTo: F.val(b, "mi-inc-to"), incQuote: F.val(b, "mi-inc-quote"), incLang: F.val(b, "mi-inc-lang"),
          expFrom: F.val(b, "mi-exp-from"), expTo: F.val(b, "mi-exp-to"), expQuote: F.val(b, "mi-exp-quote"), expLang: F.val(b, "mi-exp-lang"),
          note: F.val(b, "mi-note"), noteLang: F.val(b, "mi-note-lang")
        };
      }),

      cod: {
        text: fieldClass("cod-text"), style: fieldClass("cod-style"), rend: fieldClass("cod-rend"),
        joins: blocks("joins-container").map(function (b) {
          return { idno: F.val(b, "join-idno"), folios: F.val(b, "join-folios"), ptr: F.val(b, "join-ptr") };
        }).filter(function (j) { return j.idno || j.folios || j.ptr; })
      },

      support: {
        material: selVal("sup-material"), note: fieldClass("sup-note"), noteLang: fieldClass("sup-note-lang"),
        folios: fieldClass("ext-folios"), height: fieldClass("ext-h"), width: fieldClass("ext-w"),
        folStyle: fieldClass("fol-style"), folRendition: fieldClass("fol-rendition"),
        colFormula: fieldClass("col-formula"), colUnit: fieldClass("col-unit"),
        colCatchwords: subEntries(document.querySelector(FORM), "col-catchwords").map(function (it) { return F.val(it, "col-catchwords"); }).filter(Boolean),
        colNote: fieldClass("col-note"), colNoteLang: fieldClass("col-note-lang"),
        condNote: fieldClass("cond-note"), condNoteLang: fieldClass("cond-note-lang"), condWriting: fieldClass("cond-writing"), condRend: fieldClass("cond-rend")
      },

      layout: {
        sumDesc: subEntries(document.querySelector(FORM), "lay-sum-desc").map(function (it) { return F.val(it, "lay-sum-desc"); }).filter(Boolean),
        sumNote: fieldClass("lay-sum-note"), sumNoteLang: fieldClass("lay-sum-note-lang"),
        layouts: blocks("layouts-container").map(function (b) {
          return {
            xmlid: b.dataset.xmlid, lines: F.val(b, "ly-lines"), cols: F.val(b, "ly-cols"),
            locusFrom: F.val(b, "ly-locus-from"), locusTo: F.val(b, "ly-locus-to"),
            height: F.val(b, "ly-h"), width: F.val(b, "ly-w"),
            just: subEntries(b, "ly-just").map(function (it) { return F.val(it, "ly-just"); }).filter(Boolean),
            ruling: subEntries(b, "ly-ruling").map(function (it) { return F.val(it, "ly-ruling"); }).filter(Boolean),
            pricking: subEntries(b, "ly-pricking").map(function (it) { return F.val(it, "ly-pricking"); }).filter(Boolean)
          };
        })
      },

      hands: {
        summary: fieldClass("hand-summary"), summaryLang: fieldClass("hand-summary-lang"),
        scripts: blocks("scripts-container").map(function (b) {
          return {
            lang: F.val(b, "sc-lang"), script: F.val(b, "sc-script"), style: F.val(b, "sc-style"),
            rend: F.val(b, "sc-rend"), note: F.val(b, "sc-note"), noteLang: F.val(b, "sc-note-lang")
          };
        }),
        handNotes: blocks("hands-container").map(function (b) {
          var hnDate = F.readDateGroup(b, "hn");
          return {
            xmlid: b.dataset.xmlid, medium: F.val(b, "hn-medium"), source: F.val(b, "hn-source"),
            loci: subEntries(b, "hn-locus").map(function (it) { return { from: F.val(it, "hn-locus-from"), to: F.val(it, "hn-locus-to") }; }).filter(function (l) { return l.from || l.to; }),
            scribes: subEntries(b, "hn-persname").map(function (it) { return { person: F.valUri(it, "hn-scribe"), role: F.val(it, "hn-role") }; }).filter(function (s) { return s.person.value || s.person.uri; }),
            places: subEntries(b, "hn-place").map(function (it) { return F.valUri(it, "hn-place"); }).filter(function (p) { return p.value || p.uri; }),
            metamarks: subEntries(b, "hn-metamark").map(function (it) { return { fn: F.val(it, "hn-metamark"), text: F.val(it, "hn-metamark-text") }; }).filter(function (m) { return m.fn || m.text; }),
            when: hnDate.when, from: hnDate.from, to: hnDate.to,
            note: F.val(b, "hn-note"), noteLang: F.val(b, "hn-note-lang")
          };
        })
      },

      deco: {
        summary: fieldClass("deco-summary"), summaryLang: fieldClass("deco-summary-lang"),
        notes: blocks("deco-container").map(function (b) {
          return {
            desc: subEntries(b, "dec-desc").map(function (it) { return F.val(it, "dec-desc"); }).filter(Boolean),
            note: F.val(b, "dec-note"), noteLang: F.val(b, "dec-note-lang")
          };
        })
      },

      additions: blocks("additions-container").map(function (b) {
        return {
          xmlid: b.dataset.xmlid, type: F.val(b, "add-type"),
          locusFrom: F.val(b, "add-locus-from"), locusTo: F.val(b, "add-locus-to"),
          transcr: F.val(b, "add-transcr"), transcrLang: F.val(b, "add-transcr-lang"),
          transl: F.val(b, "add-transl"), translLang: F.val(b, "add-transl-lang"),
          note: F.val(b, "add-note"), noteLang: F.val(b, "add-note-lang")
        };
      }),

      binding: {
        type: fieldClass("bind-type"), material: fieldClass("bind-material"), condition: fieldClass("bind-condition"), conditionText: fieldClass("bind-condition-text"),
        places: subEntries(document.querySelector(FORM), "bind-place").map(function (it) { return F.valUri(it, "bind-place"); }).filter(function (p) { return p.value || p.uri; }),
        when: bindDate.when, from: bindDate.from, to: bindDate.to,
        height: fieldClass("bind-h"), width: fieldClass("bind-w"), depth: fieldClass("bind-depth"),
        note: fieldClass("bind-note"), noteLang: fieldClass("bind-note-lang")
      },

      accMats: blocks("accmat-container").map(function (b) {
        return {
          note: F.val(b, "acc-note"), noteLang: F.val(b, "acc-note-lang"), person: F.valUri(b, "acc-person"),
          quote: F.val(b, "acc-quote"), quoteLang: F.val(b, "acc-quote-lang"),
          title: F.val(b, "acc-title"), cited: F.val(b, "acc-cited"), unit: F.val(b, "acc-unit"), ptr: F.val(b, "acc-ptr")
        };
      }),

      history: {
        summary: fieldClass("hist-summary"), summaryLang: fieldClass("hist-summary-lang"),
        provenance: blocks("prov-container").map(histEvent),
        acquisition: blocks("acq-container").map(histEvent)
      },

      repros: blocks("repros-container").map(function (b) {
        return { type: F.val(b, "sur-title"), publisher: F.readSelectWithOther(b, "sur-publisher"), ptr: F.val(b, "sur-ptr") };
      }).filter(function (r) { return r.type || r.publisher || r.ptr; }),

      bibl: blocks("bibl-container").map(function (b) {
        return {
          id: F.val(b, "bibl-id"), title: F.val(b, "bibl-title"),
          cited: F.val(b, "bibl-cited"), unit: F.val(b, "bibl-unit"), ptr: F.val(b, "bibl-ptr")
        };
      }).filter(function (x) { return x.title || x.cited || x.ptr; })
    };
  }

  function histEvent(b) {
    var hvDate = F.readDateGroup(b, "hv");
    return {
      when: hvDate.when, from: hvDate.from, to: hvDate.to,
      places: subEntries(b, "hv-place").map(function (it) { return F.valUri(it, "hv-place"); }).filter(function (p) { return p.value || p.uri; }),
      locusFrom: F.val(b, "hv-locus-from"), locusTo: F.val(b, "hv-locus-to"),
      persons: subEntries(b, "hv-person").map(function (it) { return { person: F.valUri(it, "hv-person"), role: F.val(it, "hv-role") }; }).filter(function (p) { return p.person.value || p.person.uri; }),
      quote: F.val(b, "hv-quote"), quoteLang: F.val(b, "hv-quote-lang"),
      stamp: F.val(b, "hv-stamp"), note: F.val(b, "hv-note"), noteLang: F.val(b, "hv-note-lang")
    };
  }

  // single-field helpers scoped to #msFormContainer by class
  function fieldClass(cls) { var el = document.querySelector(FORM + " ." + cls); return (el && el.value && el.value.trim()) || ""; }
  // Read/write an open-vocab select+Other field scoped to the whole form.
  function selVal(cls) { return F.readSelectWithOther(document.querySelector(FORM), cls); }
  function setSel(cls, v) { F.setSelectWithOther(document.querySelector(FORM), cls, v); }
  function fieldClassUri(cls) { var el = document.querySelector(FORM + " ." + cls); return { value: (el && el.value.trim()) || "", uri: (el && el.dataset.lodUri) || "" }; }
  function fieldMulti(cls, sep) {
    var el = document.querySelector(FORM + " ." + cls);
    if (!el) return "";
    return Array.prototype.filter.call(el.options, function (o) { return o.selected && o.value; })
      .map(function (o) { return o.value; }).join(sep || " ");
  }

  // ---------- serialization ----------

  function el(tag, attrs, content) { return U.el(tag, attrs, content); }
  function wrap(tag, attrs, kids) {
    kids = kids.filter(function (k) { return k !== "" && k !== null && k !== undefined; });
    if (!kids.length) return "";
    return U.el(tag, attrs, kids);
  }
  // Append captured unmapped children (raw XML) for a given parent path.
  function withExtras(pathKey, kids) { return kids.concat(importExtras[pathKey] || []); }
  function locus(from, to) { return el("locus", { from: from, to: to }); }
  // Measurement leaves carry a fixed unit attribute, so they must be value-gated
  // explicitly (an empty <height unit="mm"/> would otherwise never be "empty").
  function mmEl(tag, v) { return v ? el(tag, { unit: "mm" }, esc(v)) : ""; }
  function dims(h, w, depth) {
    return wrap("dimensions", null, [mmEl("height", h), mmEl("width", w), mmEl("depth", depth)]);
  }
  function dimsTyped(type, h, w) {
    return wrap("dimensions", { type: type }, [mmEl("height", h), mmEl("width", w)]);
  }
  function citedEl(unit, cited) { return cited ? el("citedRange", { unit: unit }, esc(cited)) : ""; }
  function titleEl(t) { return t ? el("title", null, esc(t)) : ""; }
  function ptrEl(p) { return p ? el("ptr", { target: p }) : ""; }

  function buildMsIdentifier(d) {
    var i = d.ident;
    var kids = [
      el("country", null, esc(i.country)),
      el("settlement", null, esc(i.settlement)),
      el("repository", null, esc(i.repository)),
      el("collection", null, esc(i.collection)),
      el("idno", null, esc(i.shelfmark))
    ];
    i.altIds.forEach(function (a) {
      kids.push(el("altIdentifier", { type: a.type }, el("idno", null, esc(a.idno))));
    });
    kids.push(el("msName", null, esc(i.msName)));
    return wrap("msIdentifier", null, withExtras("msIdentifier", kids));
  }

  function buildMsContents(d) {
    var kids = [el("summary", { "xml:lang": d.summaryLang }, esc(d.summary))];
    d.msItems.forEach(function (m) {
      var mk = [];
      // Template order within msItem: locus*, title*, author*, textLang, incipit, explicit, note.
      m.loci.forEach(function (l) { mk.push(locus(l.from, l.to)); });
      m.titles.forEach(function (t) { mk.push(el("title", { "xml:lang": t.lang, ref: t.work.uri, cert: t.cert }, esc(t.work.value))); });
      m.authors.forEach(function (a) { mk.push(el("author", { ref: a.author.uri, cert: a.cert }, esc(a.author.value))); });
      if (m.mainLang || m.otherLangs) mk.push(el("textLang", { mainLang: m.mainLang, otherLangs: m.otherLangs }));
      var inc = wrap("incipit", null, [locus(m.incFrom, m.incTo), el("quote", { "xml:lang": m.incLang }, esc(m.incQuote))]);
      if (inc) mk.push(inc);
      var exp = wrap("explicit", null, [locus(m.expFrom, m.expTo), el("quote", { "xml:lang": m.expLang }, esc(m.expQuote))]);
      if (exp) mk.push(exp);
      if (m.note) mk.push(el("note", { "xml:lang": m.noteLang }, esc(m.note)));
      var item = wrap("msItem", { "xml:id": m.xmlid, "class": m.cls }, mk);
      if (item) kids.push(item);
    });
    return wrap("msContents", null, withExtras("msContents", kids));
  }

  function buildCodicological(d) {
    var c = d.cod;
    var kids = [];
    var ot = (c.text || c.style || c.rend) ? el("objectType", { rend: c.rend, style: c.style }, esc(c.text)) : "";
    if (ot) kids.push(ot);
    var joins = c.joins.map(function (j) {
      return wrap("bibl", null, [
        j.idno ? el("idno", { type: "manuscript-join" }, esc(j.idno)) : "",
        citedEl("folios", j.folios),
        ptrEl(j.ptr)
      ]);
    }).filter(Boolean);
    var lb = wrap("listBibl", null, joins);
    if (lb) kids.push(lb);
    return wrap("ab", { type: "codicological-definition" }, kids);
  }

  function buildObjectDesc(d) {
    var s = d.support;
    var support = wrap("support", null, [el("material", null, esc(s.material)), el("note", { "xml:lang": s.noteLang }, esc(s.note))]);
    var measure = s.folios ? el("measure", { unit: "folio" }, esc(s.folios)) : "";
    var extent = wrap("extent", null, [measure, dims(s.height, s.width)]);
    var foliation = (s.folStyle || s.folRendition) ? el("foliation", { style: s.folStyle, rendition: s.folRendition }) : "";
    var collation = wrap("collation", null, [
      el("formula", null, esc(s.colFormula)), el("unit", null, esc(s.colUnit))
    ].concat(s.colCatchwords.map(function (c) { return el("catchwords", null, esc(c)); }))
      .concat([el("note", { "xml:lang": s.colNoteLang }, esc(s.colNote))]));
    var condition = wrap("condition", null, [
      el("note", { "xml:lang": s.condNoteLang }, esc(s.condNote)),
      (s.condWriting || s.condRend) ? el("ab", { type: "writing", rend: s.condRend }, esc(s.condWriting)) : ""
    ]);
    var supportDesc = wrap("supportDesc", null, [support, extent, foliation, collation, condition]);

    var ly = d.layout;
    var summary = wrap("summary", null, ly.sumDesc.map(function (f) { return el("desc", null, esc(f)); })
      .concat([el("note", { "xml:lang": ly.sumNoteLang }, esc(ly.sumNote))]));
    var layouts = ly.layouts.map(function (l) {
      // Template order within layout: locus, dimensions, metamark*, ab[ruling]*, ab[pricking]*.
      return wrap("layout", { writtenLines: l.lines, columns: l.cols, "xml:id": l.xmlid }, [
        locus(l.locusFrom, l.locusTo),
        dimsTyped("written", l.height, l.width)
      ].concat(l.just.map(function (j) { return el("metamark", { "function": "justification" }, esc(j)); }))
        .concat(l.ruling.map(function (r) { return el("ab", { type: "ruling" }, esc(r)); }))
        .concat(l.pricking.map(function (p) { return el("ab", { type: "pricking" }, esc(p)); })));
    }).filter(Boolean);
    var layoutDesc = wrap("layoutDesc", null, [summary].concat(layouts));

    return wrap("objectDesc", null, [supportDesc, layoutDesc]);
  }

  function buildHandDesc(d) {
    var h = d.hands;
    var kids = [el("summary", { "xml:lang": h.summaryLang }, esc(h.summary))];
    h.handNotes.forEach(function (hn) {
      // Template order within handNote: locus*, persName*, placeName*, metamark*, origDate, note.
      var hk = [].concat(
        hn.loci.map(function (l) { return locus(l.from, l.to); }),
        hn.scribes.map(function (s) { return el("persName", { ref: s.person.uri, role: s.role }, esc(s.person.value)); }),
        hn.places.map(function (p) { return el("placeName", { ref: p.uri }, esc(p.value)); }),
        hn.metamarks.map(function (m) { return el("metamark", { "function": m.fn }, esc(m.text)); }),
        [(hn.when || hn.from || hn.to) ? el("origDate", { when: hn.when, from: hn.from, to: hn.to }) : ""],
        [hn.note ? el("note", { "xml:lang": hn.noteLang }, esc(hn.note)) : ""]
      );
      var note = wrap("handNote", { medium: hn.medium, "xml:id": hn.xmlid, source: hn.source }, hk);
      if (note) kids.push(note);
    });
    return wrap("handDesc", null, kids);
  }

  function buildScriptDesc(d) {
    var notes = d.hands.scripts.map(function (s) {
      var note = s.note ? el("note", { "xml:lang": s.noteLang }, esc(s.note)) : "";
      // scriptNote carries meaningful attributes even without a nested note.
      return U.el("scriptNote", { "xml:lang": s.lang, script: s.script, style: s.style, rend: s.rend }, note ? [note] : "");
    }).filter(Boolean);
    return wrap("scriptDesc", null, notes);
  }

  function buildDecoDesc(d) {
    var kids = [el("summary", { "xml:lang": d.deco.summaryLang }, esc(d.deco.summary))];
    d.deco.notes.forEach(function (n) {
      var dn = wrap("decoNote", null, n.desc.map(function (f) { return el("desc", null, esc(f)); })
        .concat([el("note", { "xml:lang": n.noteLang }, esc(n.note))]));
      if (dn) kids.push(dn);
    });
    return wrap("decoDesc", null, kids);
  }

  function buildAdditions(d) {
    var items = d.additions.map(function (a) {
      return wrap("item", { "xml:id": a.xmlid }, [
        a.type ? el("objectType", null, esc(a.type)) : "",
        locus(a.locusFrom, a.locusTo),
        a.transcr ? el("quote", { type: "transcription", "xml:lang": a.transcrLang }, esc(a.transcr)) : "",
        a.transl ? el("quote", { type: "translation", "xml:lang": a.translLang }, esc(a.transl)) : "",
        a.note ? el("note", { "xml:lang": a.noteLang }, esc(a.note)) : ""
      ]);
    }).filter(Boolean);
    var list = wrap("list", null, items);
    return wrap("additions", null, [list]);
  }

  function buildBinding(d) {
    var b = d.binding;
    // Template order within decoNote: objectType, origPlace*, origDate, material, note, dimensions.
    var deco = wrap("decoNote", null, [
      b.type ? el("objectType", null, esc(b.type)) : ""
    ].concat(b.places.map(function (p) { return el("origPlace", { ref: p.uri }, esc(p.value)); }))
      .concat([
        (b.when || b.from || b.to) ? el("origDate", { when: b.when, from: b.from, to: b.to }) : "",
        b.material ? el("material", null, esc(b.material)) : "",
        b.note ? el("note", { "xml:lang": b.noteLang }, esc(b.note)) : "",
        dims(b.height, b.width, b.depth)
      ]));
    var condition = (b.condition || b.conditionText) ? el("condition", { key: b.condition }, esc(b.conditionText)) : "";
    var binding = wrap("binding", null, [deco, condition]);
    return wrap("bindingDesc", null, [binding]);
  }

  function buildAccMat(d) {
    var items = d.accMats.map(function (a) {
      var bibl = wrap("bibl", null, [titleEl(a.title), citedEl(a.unit, a.cited), ptrEl(a.ptr)]);
      return wrap("item", null, [
        a.note ? el("note", { "xml:lang": a.noteLang }, esc(a.note)) : "",
        a.person.value ? el("persName", { ref: a.person.uri }, esc(a.person.value)) : "",
        a.quote ? el("quote", { "xml:lang": a.quoteLang }, esc(a.quote)) : "",
        bibl
      ]);
    }).filter(Boolean);
    var list = wrap("list", null, items);
    return wrap("accMat", null, [list]);
  }

  function buildPhysDesc(d) {
    return wrap("physDesc", null, withExtras("physDesc", [
      buildCodicological(d), buildObjectDesc(d), buildHandDesc(d),
      buildScriptDesc(d), buildDecoDesc(d), buildAdditions(d), buildBinding(d), buildAccMat(d)
    ]));
  }

  function buildHistEvent(tag, ev) {
    // Template order: date, placeName*, locus, persName*, quote, stamp, note.
    return wrap(tag, null, [
      (ev.when || ev.from || ev.to) ? el("date", { when: ev.when, from: ev.from, to: ev.to }) : ""
    ].concat(ev.places.map(function (p) { return el("placeName", { ref: p.uri }, esc(p.value)); }))
      .concat([locus(ev.locusFrom, ev.locusTo)])
      .concat(ev.persons.map(function (p) { return el("persName", { ref: p.person.uri, role: p.role }, esc(p.person.value)); }))
      .concat([
        ev.quote ? el("quote", { "xml:lang": ev.quoteLang }, esc(ev.quote)) : "",
        ev.stamp ? el("stamp", null, esc(ev.stamp)) : "",
        ev.note ? el("note", { "xml:lang": ev.noteLang }, esc(ev.note)) : ""
      ]));
  }

  function buildHistory(d) {
    var kids = [el("summary", { "xml:lang": d.history.summaryLang }, esc(d.history.summary))];
    d.history.provenance.forEach(function (p) { var x = buildHistEvent("provenance", p); if (x) kids.push(x); });
    d.history.acquisition.forEach(function (a) { var x = buildHistEvent("acquisition", a); if (x) kids.push(x); });
    return wrap("history", null, withExtras("history", kids));
  }

  function buildAdditional(d) {
    var surBibls = d.repros.map(function (r) {
      return wrap("bibl", null, [titleEl(r.type), el("publisher", null, esc(r.publisher)), ptrEl(r.ptr)]);
    }).filter(Boolean);
    var surrogates = surBibls.length ? el("surrogates", null, el("listBibl", null, surBibls)) : "";

    var bibls = d.bibl.map(function (b) {
      return el("bibl", { "xml:id": b.id }, [titleEl(b.title), citedEl(b.unit, b.cited), ptrEl(b.ptr)].filter(Boolean));
    });
    var listBibl = wrap("listBibl", null, bibls);

    return wrap("additional", null, withExtras("additional", [surrogates, listBibl]));
  }

  function buildMsBody(d) {
    var msDesc = wrap("msDesc", null, withExtras("msDesc", [
      buildMsIdentifier(d), buildMsContents(d), buildPhysDesc(d), buildHistory(d), buildAdditional(d)
    ]));
    return "<text><body><listBibl>" + msDesc + "</listBibl></body></text>";
  }

  function buildMsXML() {
    var d = getMsData();
    var rb = H.readRecordBlock(document.querySelector(FORM));
    return U.indent(
      H.prolog("manuscript") + H.rootOpen("manuscript") +
      H.build({ entityType: "manuscript", articleTitle: rb.recordTitle, recordId: rb.recordId,
        creatorId: rb.creatorId, status: rb.status, changeNote: rb.changeNote, changes: importedChanges }) +
      buildMsBody(d) + "</TEI>");
  }

  // ---------- import ----------

  function directChildren(parent, name) {
    return parent ? Array.prototype.filter.call(parent.children, function (c) { return c.localName === name; }) : [];
  }
  function directChild(parent, name) { return directChildren(parent, name)[0] || null; }
  function attr(node, name) { return U.attr(node, name); }
  function serializeVerbatim(node) {
    return new XMLSerializer().serializeToString(node).replace(/ xmlns="http:\/\/www\.tei-c\.org\/ns\/1\.0"/, "");
  }

  function setVal(cls, v) { var el = document.querySelector(FORM + " ." + cls); if (el) el.value = v || ""; }
  function setB(block, cls, v) {
    var el = block.querySelector("." + cls);
    if (!el) return;
    // For selects, keep values absent from the vocab visible (e.g. legacy/crossed
    // ruling↔pricking values) by appending a temporary "(legacy)" option so they
    // round-trip on export instead of being silently dropped.
    if (el.tagName === "SELECT" && v &&
        !Array.prototype.some.call(el.options, function (o) { return o.value === v; })) {
      var opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v + " (legacy)";
      el.appendChild(opt);
    }
    el.value = v || "";
  }
  function setMultiCls(cls, values) {
    var el = document.querySelector(FORM + " ." + cls);
    if (el) Array.prototype.forEach.call(el.options, function (o) { o.selected = values.indexOf(o.value) !== -1; });
  }
  function setMultiB(block, cls, values) {
    var el = block.querySelector("." + cls);
    if (el) Array.prototype.forEach.call(el.options, function (o) { o.selected = values.indexOf(o.value) !== -1; });
  }
  function fillLod(input, value, ref, type) {
    var label = value;
    if (ref) {
      var rec = window.BA.authority.resolve(type, ref);
      if (rec && rec.headword) label = rec.headword;
      input.dataset.lodUri = ref;
    }
    input.value = label || value || ref || "";
    if (ref) F.attachBadge(input, ref);
  }
  function setLod(cls, value, ref, type) { var input = document.querySelector(FORM + " ." + cls); if (input) fillLod(input, value, ref, type); }
  function setLodB(block, cls, value, ref, type) { var input = block.querySelector("." + cls); if (input) fillLod(input, value, ref, type); }
  function splitList(s) { return (s || "").split(/;\s*/).filter(Boolean); }
  function splitSpace(s) { return (s || "").split(/\s+/).filter(Boolean); }

  function captureExtras(parent, pathKey, known) {
    var extras = [], tags = [];
    Array.prototype.forEach.call(parent.children, function (ch) {
      if (known.indexOf(ch.localName) === -1) { extras.push(serializeVerbatim(ch)); tags.push(ch.localName); }
    });
    if (extras.length) {
      importExtras[pathKey] = (importExtras[pathKey] || []).concat(extras);
      console.warn("BA ms import: preserved unmapped <" + pathKey + "> children verbatim: " + tags.join(", "));
    }
  }

  function importMsIdentifier(msDesc) {
    var mi = directChild(msDesc, "msIdentifier");
    if (!mi) return;
    setSel("msid-country", U.text(directChild(mi, "country")));
    setSel("msid-settlement", U.text(directChild(mi, "settlement")));
    setSel("msid-repository", U.text(directChild(mi, "repository")));
    setSel("msid-collection", U.text(directChild(mi, "collection")));
    setVal("msid-shelfmark", U.text(directChild(mi, "idno")));
    setVal("msid-msname", U.text(directChild(mi, "msName")));
    directChildren(mi, "altIdentifier").forEach(function (alt) {
      var block = addAltIdBlock();
      setB(block, "alt-type", alt.getAttribute("type"));
      setB(block, "alt-idno", U.text(directChild(alt, "idno")));
    });
    captureExtras(mi, "msIdentifier", ["country", "settlement", "repository", "collection", "idno", "altIdentifier", "msName"]);
  }

  function importMsContents(msDesc) {
    var mc = directChild(msDesc, "msContents");
    if (!mc) return;
    var summary = directChild(mc, "summary");
    setVal("cont-summary", U.text(summary)); setVal("cont-summary-lang", attr(summary, "xml:lang"));
    directChildren(mc, "msItem").forEach(function (item) {
      var block = addMsItemBlock();
      if (item.getAttribute("xml:id")) block.dataset.xmlid = item.getAttribute("xml:id");
      setB(block, "mi-class", item.getAttribute("class"));
      directChildren(item, "locus").forEach(function (loc) { // direct children only — not incipit/explicit locus
        var it = addSubTo(block, "mi-locus");
        setB(it, "mi-locus-from", attr(loc, "from")); setB(it, "mi-locus-to", attr(loc, "to"));
      });
      directChildren(item, "title").forEach(function (title) {
        var it = addSubTo(block, "mi-title");
        setLodB(it, "mi-work", U.text(title), attr(title, "ref"), "work");
        setB(it, "mi-title-lang", attr(title, "xml:lang")); setB(it, "mi-title-cert", attr(title, "cert"));
      });
      directChildren(item, "author").forEach(function (author) {
        var it = addSubTo(block, "mi-author");
        setLodB(it, "mi-author", U.text(author), attr(author, "ref"), "person");
        setB(it, "mi-author-cert", attr(author, "cert"));
      });
      var tl = directChild(item, "textLang");
      if (tl) { setB(block, "mi-mainlang", attr(tl, "mainLang")); setMultiB(block, "mi-otherlangs", splitSpace(attr(tl, "otherLangs"))); }
      var inc = directChild(item, "incipit");
      if (inc) { var il = directChild(inc, "locus"); setB(block, "mi-inc-from", attr(il, "from")); setB(block, "mi-inc-to", attr(il, "to")); var iq = directChild(inc, "quote"); setB(block, "mi-inc-quote", U.text(iq)); setB(block, "mi-inc-lang", attr(iq, "xml:lang")); }
      var exp = directChild(item, "explicit");
      if (exp) { var el2 = directChild(exp, "locus"); setB(block, "mi-exp-from", attr(el2, "from")); setB(block, "mi-exp-to", attr(el2, "to")); var eq = directChild(exp, "quote"); setB(block, "mi-exp-quote", U.text(eq)); setB(block, "mi-exp-lang", attr(eq, "xml:lang")); }
      var note = directChild(item, "note");
      setB(block, "mi-note", U.text(note)); setB(block, "mi-note-lang", attr(note, "xml:lang"));
    });
    captureExtras(mc, "msContents", ["summary", "msItem"]);
  }

  function importPhysDesc(msDesc) {
    var phys = directChild(msDesc, "physDesc");
    if (!phys) return;

    var ab = directChild(phys, "ab");
    if (ab) {
      var ot = directChild(ab, "objectType");
      setVal("cod-text", U.text(ot)); setVal("cod-rend", attr(ot, "rend")); setVal("cod-style", attr(ot, "style"));
      var lb = directChild(ab, "listBibl");
      if (lb) directChildren(lb, "bibl").forEach(function (bl) {
        var block = addJoinBlock();
        setB(block, "join-idno", U.text(directChild(bl, "idno")));
        setB(block, "join-folios", U.text(directChild(bl, "citedRange")));
        setB(block, "join-ptr", attr(directChild(bl, "ptr"), "target"));
      });
    }

    var od = directChild(phys, "objectDesc");
    if (od) {
      var sd = directChild(od, "supportDesc");
      if (sd) {
        var support = directChild(sd, "support");
        if (support) { setSel("sup-material", U.text(directChild(support, "material"))); var supNote = directChild(support, "note"); setVal("sup-note", U.text(supNote)); setVal("sup-note-lang", attr(supNote, "xml:lang")); }
        var extent = directChild(sd, "extent");
        if (extent) { setVal("ext-folios", U.text(directChild(extent, "measure"))); var dm = directChild(extent, "dimensions"); if (dm) { setVal("ext-h", U.text(directChild(dm, "height"))); setVal("ext-w", U.text(directChild(dm, "width"))); } }
        var fol = directChild(sd, "foliation");
        if (fol) { setVal("fol-style", attr(fol, "style")); setVal("fol-rendition", attr(fol, "rendition")); }
        var col = directChild(sd, "collation");
        if (col) {
          setVal("col-formula", U.text(directChild(col, "formula"))); setVal("col-unit", U.text(directChild(col, "unit")));
          directChildren(col, "catchwords").forEach(function (cw) { var it = addSubTo(document.querySelector(FORM), "col-catchwords"); setB(it, "col-catchwords", U.text(cw)); });
          var colNote = directChild(col, "note"); setVal("col-note", U.text(colNote)); setVal("col-note-lang", attr(colNote, "xml:lang"));
        }
        var cond = directChild(sd, "condition");
        if (cond) { var condNote = directChild(cond, "note"); setVal("cond-note", U.text(condNote)); setVal("cond-note-lang", attr(condNote, "xml:lang")); var wab = directChild(cond, "ab"); setVal("cond-writing", U.text(wab)); setVal("cond-rend", attr(wab, "rend")); }
      }
      var ld = directChild(od, "layoutDesc");
      if (ld) {
        var lsum = directChild(ld, "summary");
        if (lsum) {
          // legacy: a single <desc>"a; b"</desc> splits into one entry per feature.
          directChildren(lsum, "desc").forEach(function (dsc) { splitList(U.text(dsc)).forEach(function (f) { var it = addSubTo(document.querySelector(FORM), "lay-sum-desc"); setB(it, "lay-sum-desc", f); }); });
          var lsumNote = directChild(lsum, "note"); setVal("lay-sum-note", U.text(lsumNote)); setVal("lay-sum-note-lang", attr(lsumNote, "xml:lang"));
        }
        directChildren(ld, "layout").forEach(function (ly) {
          var block = addLayoutBlock();
          if (ly.getAttribute("xml:id")) block.dataset.xmlid = ly.getAttribute("xml:id");
          setB(block, "ly-lines", ly.getAttribute("writtenLines")); setB(block, "ly-cols", ly.getAttribute("columns"));
          var l = directChild(ly, "locus"); setB(block, "ly-locus-from", attr(l, "from")); setB(block, "ly-locus-to", attr(l, "to"));
          var dm = directChild(ly, "dimensions"); if (dm) { setB(block, "ly-h", U.text(directChild(dm, "height"))); setB(block, "ly-w", U.text(directChild(dm, "width"))); }
          directChildren(ly, "metamark").forEach(function (mm) { splitList(U.text(mm)).forEach(function (j) { var it = addSubTo(block, "ly-just"); setB(it, "ly-just", j); }); }); // legacy split
          directChildren(ly, "ab").forEach(function (a) {
            if (a.getAttribute("type") === "ruling") { var it = addSubTo(block, "ly-ruling"); setB(it, "ly-ruling", U.text(a)); }
            if (a.getAttribute("type") === "pricking") { var it = addSubTo(block, "ly-pricking"); setB(it, "ly-pricking", U.text(a)); }
          });
        });
      }
    }

    var hd = directChild(phys, "handDesc");
    if (hd) {
      var hsum = directChild(hd, "summary");
      setVal("hand-summary", U.text(hsum)); setVal("hand-summary-lang", attr(hsum, "xml:lang"));
      directChildren(hd, "handNote").forEach(function (hn) {
        var block = addHandBlock();
        if (hn.getAttribute("xml:id")) block.dataset.xmlid = hn.getAttribute("xml:id");
        setB(block, "hn-medium", hn.getAttribute("medium")); setB(block, "hn-source", hn.getAttribute("source"));
        directChildren(hn, "locus").forEach(function (l) { var it = addSubTo(block, "hn-locus"); setB(it, "hn-locus-from", attr(l, "from")); setB(it, "hn-locus-to", attr(l, "to")); });
        directChildren(hn, "persName").forEach(function (pn) { var it = addSubTo(block, "hn-persname"); setLodB(it, "hn-scribe", U.text(pn), attr(pn, "ref"), "person"); setB(it, "hn-role", attr(pn, "role")); });
        directChildren(hn, "placeName").forEach(function (pl) { var it = addSubTo(block, "hn-place"); setLodB(it, "hn-place", U.text(pl), attr(pl, "ref"), "place"); });
        directChildren(hn, "metamark").forEach(function (mm) { var it = addSubTo(block, "hn-metamark"); setB(it, "hn-metamark", attr(mm, "function")); setB(it, "hn-metamark-text", U.text(mm)); });
        var odt = directChild(hn, "origDate"); if (odt) F.setDateGroup(block, "hn", { when: attr(odt, "when"), from: attr(odt, "from"), to: attr(odt, "to") });
        var note = directChild(hn, "note"); setB(block, "hn-note", U.text(note)); setB(block, "hn-note-lang", attr(note, "xml:lang"));
      });
    }

    var scd = directChild(phys, "scriptDesc");
    if (scd) directChildren(scd, "scriptNote").forEach(function (sn) {
      var block = addScriptBlock();
      setB(block, "sc-lang", sn.getAttribute("xml:lang")); setB(block, "sc-script", sn.getAttribute("script"));
      setB(block, "sc-style", sn.getAttribute("style")); setB(block, "sc-rend", sn.getAttribute("rend"));
      var note = directChild(sn, "note"); setB(block, "sc-note", U.text(note)); setB(block, "sc-note-lang", attr(note, "xml:lang"));
    });

    var dd = directChild(phys, "decoDesc");
    if (dd) {
      var dsum = directChild(dd, "summary");
      setVal("deco-summary", U.text(dsum)); setVal("deco-summary-lang", attr(dsum, "xml:lang"));
      directChildren(dd, "decoNote").forEach(function (dn) {
        var block = addDecoBlock();
        directChildren(dn, "desc").forEach(function (dsc) { splitList(U.text(dsc)).forEach(function (f) { var it = addSubTo(block, "dec-desc"); setB(it, "dec-desc", f); }); }); // legacy split
        var note = directChild(dn, "note"); setB(block, "dec-note", U.text(note)); setB(block, "dec-note-lang", attr(note, "xml:lang"));
      });
    }

    var adds = directChild(phys, "additions");
    if (adds) {
      var list = directChild(adds, "list");
      if (list) directChildren(list, "item").forEach(function (it) {
        var block = addAdditionBlock();
        if (it.getAttribute("xml:id")) block.dataset.xmlid = it.getAttribute("xml:id");
        setB(block, "add-type", U.text(directChild(it, "objectType")));
        var l = directChild(it, "locus"); setB(block, "add-locus-from", attr(l, "from")); setB(block, "add-locus-to", attr(l, "to"));
        directChildren(it, "quote").forEach(function (qt) {
          if (qt.getAttribute("type") === "transcription") { setB(block, "add-transcr", U.text(qt)); setB(block, "add-transcr-lang", attr(qt, "xml:lang")); }
          if (qt.getAttribute("type") === "translation") { setB(block, "add-transl", U.text(qt)); setB(block, "add-transl-lang", attr(qt, "xml:lang")); }
        });
        var note = directChild(it, "note"); setB(block, "add-note", U.text(note)); setB(block, "add-note-lang", attr(note, "xml:lang"));
      });
    }

    var bd = directChild(phys, "bindingDesc");
    if (bd) {
      var binding = directChild(bd, "binding");
      if (binding) {
        var deco = directChild(binding, "decoNote");
        if (deco) {
          setVal("bind-type", U.text(directChild(deco, "objectType")));
          directChildren(deco, "origPlace").forEach(function (op) { var it = addSubTo(document.querySelector(FORM), "bind-place"); setLodB(it, "bind-place", U.text(op), attr(op, "ref"), "place"); });
          var odt2 = directChild(deco, "origDate"); if (odt2) F.setDateGroup(document.querySelector(FORM), "bind", { when: attr(odt2, "when"), from: attr(odt2, "from"), to: attr(odt2, "to") });
          setVal("bind-material", U.text(directChild(deco, "material")));
          var bindNote = directChild(deco, "note"); setVal("bind-note", U.text(bindNote)); setVal("bind-note-lang", attr(bindNote, "xml:lang"));
          var dm = directChild(deco, "dimensions"); if (dm) { setVal("bind-h", U.text(directChild(dm, "height"))); setVal("bind-w", U.text(directChild(dm, "width"))); setVal("bind-depth", U.text(directChild(dm, "depth"))); }
        }
        var cond2 = directChild(binding, "condition"); if (cond2) { setVal("bind-condition", attr(cond2, "key")); setVal("bind-condition-text", U.text(cond2)); }
      }
    }

    var am = directChild(phys, "accMat");
    if (am) {
      var alist = directChild(am, "list");
      if (alist) directChildren(alist, "item").forEach(function (it) {
        var block = addAccMatBlock();
        var note = directChild(it, "note"); setB(block, "acc-note", U.text(note)); setB(block, "acc-note-lang", attr(note, "xml:lang"));
        var accPn = directChild(it, "persName"); setLodB(block, "acc-person", U.text(accPn), attr(accPn, "ref"), "person");
        var qt = directChild(it, "quote"); setB(block, "acc-quote", U.text(qt)); setB(block, "acc-quote-lang", attr(qt, "xml:lang"));
        var bl = directChild(it, "bibl");
        if (bl) { setB(block, "acc-title", U.text(directChild(bl, "title"))); var cr = directChild(bl, "citedRange"); setB(block, "acc-cited", U.text(cr)); if (cr) setB(block, "acc-unit", attr(cr, "unit")); setB(block, "acc-ptr", attr(directChild(bl, "ptr"), "target")); }
      });
    }

    captureExtras(phys, "physDesc", ["ab", "objectDesc", "handDesc", "scriptDesc", "decoDesc", "additions", "bindingDesc", "accMat"]);
  }

  function fillHistBlock(block, ev) {
    var d = directChild(ev, "date"); if (d) F.setDateGroup(block, "hv", { when: attr(d, "when"), from: attr(d, "from"), to: attr(d, "to") });
    directChildren(ev, "placeName").forEach(function (pl) { var it = addSubTo(block, "hv-place"); setLodB(it, "hv-place", U.text(pl), attr(pl, "ref"), "place"); });
    var l = directChild(ev, "locus"); setB(block, "hv-locus-from", attr(l, "from")); setB(block, "hv-locus-to", attr(l, "to"));
    directChildren(ev, "persName").forEach(function (pn) { var it = addSubTo(block, "hv-person"); setLodB(it, "hv-person", U.text(pn), attr(pn, "ref"), "person"); setB(it, "hv-role", attr(pn, "role")); });
    var qt = directChild(ev, "quote"); setB(block, "hv-quote", U.text(qt)); setB(block, "hv-quote-lang", attr(qt, "xml:lang"));
    setB(block, "hv-stamp", U.text(directChild(ev, "stamp")));
    var note = directChild(ev, "note"); setB(block, "hv-note", U.text(note)); setB(block, "hv-note-lang", attr(note, "xml:lang"));
  }

  function importHistory(msDesc) {
    var hist = directChild(msDesc, "history");
    if (!hist) return;
    var sum = directChild(hist, "summary");
    setVal("hist-summary", U.text(sum)); setVal("hist-summary-lang", attr(sum, "xml:lang"));
    directChildren(hist, "provenance").forEach(function (p) { fillHistBlock(addProvBlock(), p); });
    directChildren(hist, "acquisition").forEach(function (a) { fillHistBlock(addAcqBlock(), a); });
    captureExtras(hist, "history", ["summary", "provenance", "acquisition"]);
  }

  function importAdditional(msDesc) {
    var add = directChild(msDesc, "additional");
    if (!add) return;
    var sur = directChild(add, "surrogates");
    if (sur) {
      var slb = directChild(sur, "listBibl");
      if (slb) directChildren(slb, "bibl").forEach(function (bl) {
        var block = addReproBlock();
        setB(block, "sur-title", U.text(directChild(bl, "title")));
        F.setSelectWithOther(block, "sur-publisher", U.text(directChild(bl, "publisher")));
        setB(block, "sur-ptr", attr(directChild(bl, "ptr"), "target"));
      });
    }
    directChildren(add, "listBibl").forEach(function (lb) {
      directChildren(lb, "bibl").forEach(function (bl) {
        var block = addBiblBlock();
        if (bl.getAttribute("xml:id")) block.querySelector(".bibl-id").value = bl.getAttribute("xml:id");
        setB(block, "bibl-title", U.text(directChild(bl, "title")));
        var cr = directChild(bl, "citedRange"); setB(block, "bibl-cited", U.text(cr)); if (cr) setB(block, "bibl-unit", attr(cr, "unit"));
        setB(block, "bibl-ptr", attr(directChild(bl, "ptr"), "target"));
      });
    });
    captureExtras(add, "additional", ["surrogates", "listBibl"]);
  }

  function importMsXML(text, filename) {
    var doc = U.parse(text); // throws on invalid XML
    var hdr = H.parse(doc);

    idCounters = { msitem: 0, layout: 0, hand: 0, addition: 0, bib: 0 };
    importExtras = {};
    importedChanges = hdr.changes || [];
    renderForm();
    wireStaticFields();

    var notices = [];
    var recordNotice = applyRecordBlock(hdr, filename);
    if (recordNotice) notices.push(recordNotice);

    var msDesc = U.q(doc, "body/listBibl/msDesc");
    var legacy = false;
    if (!msDesc) { msDesc = U.q(doc, "sourceDesc/msDesc"); if (msDesc) legacy = true; }
    if (!msDesc) {
      showAlert("No msDesc found in the uploaded file.", "danger");
      F.initTooltips(document.getElementById("msFormContainer"));
      return hdr;
    }

    importMsIdentifier(msDesc);
    importMsContents(msDesc);
    importPhysDesc(msDesc);
    importHistory(msDesc);
    importAdditional(msDesc);
    captureExtras(msDesc, "msDesc", ["msIdentifier", "msContents", "physDesc", "history", "additional"]);

    F.initTooltips(document.getElementById("msFormContainer"));

    if (legacy) notices.unshift("Imported from MANO-format file; review all sections.");
    var kind = (legacy || notices.length) ? "warning" : "success";
    F.markClean(); // freshly imported record is not yet dirty
    showAlert((legacy ? "" : "Imported. ") + notices.join(" ") || "Imported. Review all sections before downloading.", kind);
    return hdr;
  }

  // ---------- page wiring ----------

  var previewCM = null;

  function showAlert(message, kind) {
    var zone = document.getElementById("alertZone");
    if (!zone) { console.warn(message); return; }
    zone.innerHTML = '<div class="alert alert-' + (kind || "warning") + ' alert-dismissible" role="alert">' +
      esc(message) + '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>';
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
    var id = qv("recordId");
    var out = document.getElementById("recordUri");
    if (out) out.textContent = id ? window.BA.config.baseUri + "/" + window.BA.config.entityPaths.manuscript + "/" + id : "";
  }

  function wireStaticFields() {
    var idInput = document.querySelector(FORM + ' [name="recordId"]');
    if (idInput) idInput.addEventListener("input", updateUriDisplay);
  }

  // Populate the shared Record block from a parsed header (identical logic in
  // all four editors). Record ID is recovered from the header idno, else the
  // uploaded filename; returns a warning string when neither yields an id.
  function applyRecordBlock(hdr, filename) {
    var form = document.querySelector(FORM);
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
    var xml = buildMsXML();
    var ta = document.getElementById("xmlPreviewEditor");
    if (typeof CodeMirror !== "undefined" && ta) {
      if (!previewCM) previewCM = CodeMirror.fromTextArea(ta, { mode: "xml", lineNumbers: true, readOnly: true });
      previewCM.setValue(xml);
      setTimeout(function () { previewCM.refresh(); }, 200);
    } else if (ta) { ta.value = xml; }
    if (typeof bootstrap !== "undefined") new bootstrap.Modal(document.getElementById("xmlModal")).show();
    return xml;
  }

  function download() {
    var d = getMsData();
    var id = d.id || "manuscript";
    window.BA.authority.checkCollision("manuscript", id).then(function (exists) {
      if (exists && !window.confirm("A manuscript with id " + id + " already exists in the index. Download anyway?")) return;
      var blob = new Blob([buildMsXML()], { type: "application/xml" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = id + ".xml"; a.click();
      F.markClean(); // record saved locally
    });
  }

  function newRecord(skipConfirm) {
    if (!skipConfirm && !window.confirm("Clear the form and start a new manuscript description?")) return;
    idCounters = { msitem: 0, layout: 0, hand: 0, addition: 0, bib: 0 };
    importExtras = {};
    importedChanges = [];
    renderForm();
    wireStaticFields();
    window.BA.authority.nextId("manuscript").then(function (id) {
      var input = document.querySelector(FORM + ' [name="recordId"]');
      if (input && !input.value) { input.value = id; updateUriDisplay(); }
    });
    F.initTooltips(document.getElementById("msFormContainer"));
    F.markClean(); // fresh form
  }

  var ADD_HANDLERS = {
    addAltIdBtn: addAltIdBlock, addMsItemBtn: addMsItemBlock, addJoinBtn: addJoinBlock,
    addLayoutBtn: addLayoutBlock, addScriptBtn: addScriptBlock, addHandBtn: addHandBlock,
    addDecoBtn: addDecoBlock, addAdditionBtn: addAdditionBlock, addAccMatBtn: addAccMatBlock,
    addProvBtn: addProvBlock, addAcqBtn: addAcqBlock, addReproBtn: addReproBlock, addBiblBtn: addBiblBlock
  };

  function init() {
    U = window.BA.util; F = window.BA.form; H = window.BA.header;
    V = window.BA.uiText.vocab; LBLROOT = window.BA.uiText.labels.mss;

    window.BA.authority.load("person");
    window.BA.authority.load("place");
    window.BA.authority.load("work");
    window.BA.authority.load("manuscript");

    newRecord(true);

    // Unsaved-changes guard: flag edits inside the form, warn on exit.
    F.trackDirty(document.getElementById("msFormContainer"));
    F.installUnloadGuard();

    // ?view={id} read-only view mode takes precedence over the ?load={id} deep
    // link; both import data/manuscripts/{id}.xml on init.
    if (!loadViewFromQuery()) loadFromQuery();

    document.addEventListener("click", function (e) {
      if (!e.target.closest) return;
      if (F.isViewMode()) return;
      Object.keys(ADD_HANDLERS).forEach(function (id) {
        if (e.target.closest("#" + id)) ADD_HANDLERS[id]();
      });
      if (e.target.closest("#reloadIndexBtn")) reloadIndexes();
      // Repeatable sub-lists (add / delete one entry).
      var addSubBtn = e.target.closest(".sublist-add");
      if (addSubBtn) {
        var cls = addSubBtn.getAttribute("data-sub");
        var list = addSubBtn.parentNode.querySelector("." + cls + "-list");
        if (list) addSub(list, cls);
      }
      var delSubBtn = e.target.closest(".sublist-del");
      if (delSubBtn) { var it = delSubBtn.closest(".sublist-item"); if (it) it.remove(); }
    });

    // Zotero bibliography lookup -> fill title + ptr, clear the lookup.
    document.addEventListener("ba-lod-selected", fillBiblFromZotero);
    document.addEventListener("ba-lod-selected", fillJoinPtrFromLookup);

    var up = document.getElementById("fileUpload");
    if (up) {
      up.addEventListener("change", function (e) {
        var file = e.target.files[0];
        if (!file) return;
        if (!file.name.endsWith(".xml")) { showAlert("Only XML files are allowed.", "warning"); return; }
        var reader = new FileReader();
        reader.onload = function (ev) {
          try { importMsXML(ev.target.result, file.name); }
          catch (err) { showAlert("Import failed: " + err.message, "danger"); }
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
      F.openRepoPicker("manuscript", function (text, filename) {
        importMsXML(text, filename);
        F.markClean();
        showAlert("Loaded " + filename + " from the repository.", "success");
      });
    });

    // Submit to repository: validation gate lives in BA.github.openSubmit.
    btn = document.getElementById("submitRepoBtn");
    if (btn) btn.addEventListener("click", function () {
      var d = getMsData();
      var rb = H.readRecordBlock(document.querySelector(FORM));
      window.BA.github.openSubmit({
        type: "manuscript", id: d.id || "manuscript", xml: buildMsXML(),
        data: d, changeNote: rb.changeNote
      });
    });
  }

  // ?load={id}: resolve the id in the manuscript index and import its file.
  function loadFromQuery() {
    var id = new URLSearchParams(location.search).get("load");
    if (!id || !/^\d+$/.test(id)) return;
    window.BA.authority.load("manuscript").then(function (recs) {
      var rec = null;
      for (var i = 0; i < recs.length; i++) { if (String(recs[i].id) === id) { rec = recs[i]; break; } }
      if (!rec) {
        showAlert("Record " + id + " not found in the manuscript index — rebuild the index if the file was just added", "warning");
        return;
      }
      fetch(rec.file)
        .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
        .then(function (text) { importMsXML(text, (rec.file || "").split("/").pop()); F.markClean(); })
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
    window.BA.authority.load("manuscript").then(function (recs) {
      var rec = null;
      for (var i = 0; i < recs.length; i++) { if (String(recs[i].id) === id) { rec = recs[i]; break; } }
      if (!rec) {
        showAlert("Record " + id + " not found in the manuscript index — rebuild the index if the file was just added", "warning");
        return;
      }
      fetch(rec.file)
        .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
        .then(function (text) {
          F._viewMode = true;
          importMsXML(text, (rec.file || "").split("/").pop());
          F.enterViewMode(document.getElementById("msFormContainer"), {
            type: "manuscript",
            id: id,
            editorHref: "editor.html?load=" + id,
            collectionHref: "collection-manuscripts.html"
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
      var elC = null;
      try { elC = U.q(U.parse("<ba-root>" + chStr + "</ba-root>"), "change"); } catch (e) { elC = null; }
      if (!elC) return "";
      var who = (elC.getAttribute("who") || "").replace(/^#/, "");
      var when = elC.getAttribute("when") || "";
      var note = U.text(elC);
      var name = editorsById[who] || who;
      return "<tr><td>" + esc(name) + "</td><td>" + esc(when) + "</td><td>" + esc(note) + "</td></tr>";
    }).filter(Boolean).join("");
    if (!rows) return;

    var section = document.createElement("div");
    section.className = "border rounded p-3 mb-3 ba-revision-history";
    section.innerHTML =
      "<h5>Revision history</h5>" +
      '<table class="table table-sm mb-0"><thead><tr>' +
      "<th>Editor</th><th>Date</th><th>Note</th></tr></thead><tbody>" + rows + "</tbody></table>";

    var accordion = document.getElementById("msAccordion");
    if (accordion && accordion.parentNode) accordion.parentNode.insertBefore(section, accordion);
    else document.getElementById("msFormContainer").appendChild(section);
  }

  document.addEventListener("DOMContentLoaded", init);

  window.MsEditor = {
    init: init,
    getMsData: function () { return getMsData(); },
    buildMsBody: function (d) { return buildMsBody(d); },
    buildMsXML: function () { return buildMsXML(); },
    importMsXML: function (t, f) { return importMsXML(t, f); },
    buildMsIdentifier: function (d) { return buildMsIdentifier(d); },
    buildMsContents: function (d) { return buildMsContents(d); },
    buildPhysDesc: function (d) { return buildPhysDesc(d); },
    buildHistory: function (d) { return buildHistory(d); },
    buildAdditional: function (d) { return buildAdditional(d); },
    addAltIdBlock: addAltIdBlock, addMsItemBlock: addMsItemBlock, addJoinBlock: addJoinBlock,
    addLayoutBlock: addLayoutBlock, addScriptBlock: addScriptBlock, addHandBlock: addHandBlock,
    addDecoBlock: addDecoBlock, addAdditionBlock: addAdditionBlock, addAccMatBlock: addAccMatBlock,
    addProvBlock: addProvBlock, addAcqBlock: addAcqBlock, addReproBlock: addReproBlock, addBiblBlock: addBiblBlock,
    newRecord: newRecord
  };
})();
