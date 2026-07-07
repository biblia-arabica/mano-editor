// Shared Biblia Arabica teiHeader builder.
// All four record types share one header; only publicationStmt/idno and the
// xml-model processing instructions differ. Everything on BA.header.
// Classic script (no build step; loaded via <script>).

(function () {
  "use strict";

  var header = window.BA.header;

  function cfg() { return window.BA.config; }
  function esc(s) { return window.BA.util.esc(s); }

  function todayISO() {
    return new Date().toISOString().split("T")[0];
  }
  header.todayISO = todayISO;

  var XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';

  // xml-model PIs per entity type (copied from the templates).
  var PI_MS = '<?xml-model href="http://www.tei-c.org/release/xml/tei/custom/schema/relaxng/tei_ms.rng" type="application/xml" schematypens="http://relaxng.org/ns/structure/1.0"?>\n' +
    '<?xml-model href="http://www.tei-c.org/release/xml/tei/custom/schema/relaxng/tei_ms.rng" type="application/xml" schematypens="http://purl.oclc.org/dsdl/schematron"?>';
  var PI_SYRIACA = '<?xml-model href="http://syriaca.org/documentation/syriaca-tei-main.rnc" type="application/relax-ng-compact-syntax"?>';

  header.prolog = function (entityType) {
    var pi = (entityType === "manuscript" || entityType === "person") ? PI_MS : PI_SYRIACA;
    return XML_DECL + "\n" + pi + "\n";
  };

  header.rootOpen = function (entityType) {
    if (entityType === "manuscript" || entityType === "person") {
      return '<TEI xmlns="http://www.tei-c.org/ns/1.0">';
    }
    return '<TEI xml:lang="en" xmlns="http://www.tei-c.org/ns/1.0">';
  };

  // Project block (sponsors, funders, principals) built from BA.config.teiHeader.
  // Each sponsor/funder: { ref, name, nameDe? } → an <orgName> with an optional
  // German <orgName xml:lang="de"> in parentheses. Each principal: { ref, name }.
  function orgEntry(tag, s) {
    var refAttr = s.ref ? ' ref="' + esc(s.ref) + '"' : "";
    var en = "<orgName>" + esc(s.name || "") + "</orgName>";
    if (s.nameDe) {
      return "<" + tag + refAttr + ">" + en +
        ' (<orgName xml:lang="de">' + esc(s.nameDe) + "</orgName>) </" + tag + ">";
    }
    return "<" + tag + refAttr + ">" + en + "</" + tag + ">";
  }

  function projectBlock() {
    var th = cfg().teiHeader || {};
    var parts = [];
    (th.sponsors || []).forEach(function (s) { parts.push(orgEntry("sponsor", s)); });
    (th.funders || []).forEach(function (s) { parts.push(orgEntry("funder", s)); });
    (th.principals || []).forEach(function (p) {
      parts.push('<principal' + (p.ref ? ' ref="' + esc(p.ref) + '"' : "") + ">" +
        esc(p.name || "") + "</principal>");
    });
    return parts.join("\n");
  }

  var FIXED_RESPSTMT =
    '<respStmt>' +
    '<resp>Srophé app design and development by</resp>' +
    '<name type="person" ref="http://syriaca.org/documentation/editors.xml#wsalesky">Winona Salesky</name>' +
    '</respStmt>';

  function editorsXml() {
    return cfg().editors.map(function (ed) {
      return '<editor xml:id="' + esc(ed.id) + '" role="' + esc(ed.role) + '" ref="' +
        esc(ed.refs.join(" ")) + '">' + esc(ed.name) + "</editor>";
    }).join("\n");
  }

  // opts: { entityType, articleTitle, articleLang = "en", recordId, creatorId,
  // status = "unpublished", changeDate = today ISO, changeNote,
  // changes = [] }
  // articleTitle  -> title[@level="a"] verbatim (no headword derivation).
  // recordId      -> when set, publicationStmt/idno = base + "/" + id (no
  // trailing slash); when empty, the trailing-slash base.
  // changes       -> serialized historical <change> strings, re-emitted
  // verbatim and FIRST inside revisionDesc.
  // changeNote/creatorId -> one new <change who when>note</change> appended
  // after the history (self-closing when the note is empty).
  header.build = function (opts) {
    var articleLang = opts.articleLang || "en";
    var status = opts.status || "unpublished";
    var changeDate = opts.changeDate || todayISO();
    var idnoBase = cfg().baseUri + "/" + cfg().entityPaths[opts.entityType] + "/";
    var idnoText = opts.recordId ? idnoBase + opts.recordId : idnoBase;

    var titleA = opts.articleTitle
      ? '<title level="a" xml:lang="' + esc(articleLang) + '">' + esc(opts.articleTitle) + "</title>"
      : '<title level="a" xml:lang="' + esc(articleLang) + '"/>';

    var who = "#" + esc(opts.creatorId || "");
    var when = esc(changeDate);
    var note = opts.changeNote || "";
    var newChange = note
      ? '<change who="' + who + '" when="' + when + '">' + esc(note) + "</change>"
      : '<change who="' + who + '" when="' + when + '"/>';
    var history = (opts.changes || []).filter(Boolean);
    var revisionInner = history.concat([newChange]).join("\n");

    return "<teiHeader>\n<fileDesc>\n<titleStmt>\n" +
      titleA + "\n" +
      '<title level="m" xml:lang="en">' + esc(cfg().projectTitle) + "</title>\n" +
      projectBlock() + "\n" +
      editorsXml() + "\n" +
      FIXED_RESPSTMT + "\n" +
      "</titleStmt>\n<publicationStmt>\n" +
      "<authority>" +
      '<ref target="' + esc(cfg().authority.target) + '">' + esc(cfg().authority.text) + "</ref>" +
      "</authority>\n" +
      '<idno type="URI">' + esc(idnoText) + "</idno>\n" +
      "<availability>" +
      '<licence target="' + esc(cfg().licence.target) + '"><p>' + esc(cfg().licence.text) + "</p></licence>" +
      "</availability>\n" +
      "</publicationStmt>\n<sourceDesc>\n<p>Born digital.</p>\n</sourceDesc>\n</fileDesc>\n" +
      '<revisionDesc status="' + esc(status) + '">' +
      revisionInner +
      "</revisionDesc>\n</teiHeader>";
  };

  // Extract { articleTitle, articleLang, recordId, creatorId, status, changes }
  // from an imported TEI Document (used by all editors' import code).
  // recordId : trailing "/(\d+)$" of the publicationStmt idno text, else "".
  // changes  : ALL revisionDesc/change elements serialized verbatim, with the
  // tei xmlns attribute stripped (append-only history is preserved).
  header.parse = function (doc) {
    var q = window.BA.util.q;
    var qa = window.BA.util.qa;
    var titleA = q(doc, "titleStmt/title[@level='a']");
    var revision = q(doc, "revisionDesc");
    var change = q(doc, "revisionDesc/change");
    var who = (change && change.getAttribute("who")) || "";
    var idnoText = window.BA.util.text(q(doc, "publicationStmt/idno[@type='URI']"));
    var idMatch = idnoText.match(/\/(\d+)$/);
    var changes = qa(doc, "revisionDesc/change").map(function (el) {
      return new XMLSerializer().serializeToString(el).replace(/ xmlns="[^"]*"/g, "");
    });
    return {
      articleTitle: window.BA.util.text(titleA),
      articleLang: (titleA && (titleA.getAttribute("xml:lang") || titleA.getAttributeNS("http://www.w3.org/XML/1998/namespace", "lang"))) || "",
      recordId: idMatch ? idMatch[1] : "",
      creatorId: who.replace(/^#/, ""),
      status: (revision && revision.getAttribute("status")) || "",
      changes: changes
    };
  };

  // ---- Small HTML helpers for the record-metadata block ----

  header.creatorSelectHtml = function (selectedId) {
    var opts = cfg().editors.map(function (ed) {
      return '<option value="' + esc(ed.id) + '"' + (ed.id === selectedId ? " selected" : "") + ">" +
        esc(ed.name) + "</option>";
    }).join("");
    return '<select class="form-select" name="creatorId">' +
      '<option value="">Please select</option>' + opts + "</select>";
  };

  header.statusSelectHtml = function (selected) {
    return '<select class="form-select" name="status">' +
      ["unpublished", "draft", "published"].map(function (s) {
        return '<option value="' + s + '"' + (s === (selected || "unpublished") ? " selected" : "") + ">" + s + "</option>";
      }).join("") + "</select>";
  };

  // Shared Record-metadata block used by all four editors:
  // Record ID (+ URI display + reload button), Record title, Editor, Status,
  // and a Change note. Returns the inner field markup; each editor wraps it in
  // its own section container.
  var STAR = '<span class="required-star" data-bs-toggle="tooltip" title="Required field">*</span>';

  header.recordBlockHtml = function (entityType) {
    return '<div class="row">' +
      '<div class="col-md-4"><label class="form-label">Record ID' + STAR + "</label>" +
      '<div class="input-group">' +
      '<input type="text" class="form-control" name="recordId">' +
      '<button type="button" class="btn btn-sm btn-outline-secondary" id="reloadIndexBtn" title="Reload records"><i class="bi bi-arrow-clockwise"></i></button>' +
      "</div>" +
      '<small class="text-muted" id="recordUri"></small></div>' +
      '<div class="col-md-4"><label class="form-label">Editor' + STAR + "</label>" +
      header.creatorSelectHtml("") + "</div>" +
      '<div class="col-md-4"><label class="form-label">Status</label>' + header.statusSelectHtml("") + "</div>" +
      "</div>" +
      '<div class="row mt-2">' +
      '<div class="col-md-6"><label class="form-label">Record title' + STAR + "</label>" +
      '<input type="text" class="form-control" name="recordTitle"></div>' +
      '<div class="col-md-6"><label class="form-label">Change note ' +
      '<i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" title="Describe your edits; stored in the record\'s revision history"></i></label>' +
      '<textarea class="form-control" name="changeNote" rows="1"></textarea></div>' +
      "</div>";
  };

  // Read the five record-block values back off the form.
  header.readRecordBlock = function (form) {
    function v(name) {
      var el = form && form.querySelector('[name="' + name + '"]');
      return el ? (el.value || "").trim() : "";
    }
    return {
      recordId: v("recordId"),
      recordTitle: v("recordTitle"),
      creatorId: v("creatorId"),
      status: v("status") || "unpublished",
      changeNote: v("changeNote")
    };
  };
})();
