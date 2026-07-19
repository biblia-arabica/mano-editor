// Form helpers: value+URI fields, LOD badges, repeatable blocks, tooltips.
// Everything on BA.form. Classic script (no build step; loaded via <script>).

(function () {
  "use strict";

  var form = window.BA.form;

  function hasBootstrap() {
    return typeof bootstrap !== "undefined" && bootstrap && bootstrap.Tooltip;
  }

  // Copy of getFieldValueAndUri (JS/metadata-new.js line 1175).
  form.getValueUri = function (formEl, name) {
    var field = formEl.querySelector('[name="' + name + '"]');
    if (!field) return { value: "", uri: "" };
    return { value: field.value.trim(), uri: field.dataset.lodUri || "" };
  };

  // Source label from URI host (used by badges).
  form.sourceLabel = function (uri) {
    uri = uri || "";
    if (uri.indexOf("wikidata.org") !== -1) return "Wikidata";
    if (uri.indexOf("geonames.org") !== -1) return "GeoNames";
    if (uri.indexOf("d-nb.info") !== -1) return "GND";
    if (uri.indexOf("viaf.org") !== -1) return "VIAF";
    if (window.BA.config && uri.indexOf(window.BA.config.baseUri) === 0) return "Biblia Arabica";
    return "LOD";
  };

  // Single implementation of the link badge (adapted from restoreLODField,
  // JS/metadata-new.js line 1094): external-link icon + clear button after the input.
  form.attachBadge = function (input, uri, sourceLabel) {
    var label = sourceLabel || form.sourceLabel(uri);

    var badge = input.parentNode.querySelector(".lod-link");
    if (!badge) {
      badge = document.createElement("small");
      badge.className = "lod-link text-muted d-block";
      input.insertAdjacentElement("afterend", badge);
    } else {
      disposeBadgeTooltips(badge);
    }

    badge.innerHTML =
      '<a href="' + uri + '" target="_blank" class="ms-2 text-decoration-none" ' +
      'data-bs-toggle="tooltip" title="Visit ' + label + ' link">' +
      '<i class="bi bi-box-arrow-up-right"></i></a>' +
      '<button type="button" class="btn btn-link text-danger lod-clear-btn ps-0 pt-0" ' +
      'data-bs-toggle="tooltip" title="Remove ' + label + ' link" aria-label="Remove link">' +
      '<i class="bi bi-x-square-fill"></i></button>';

    if (hasBootstrap()) {
      new bootstrap.Tooltip(badge.querySelector('a[data-bs-toggle="tooltip"]'));
      new bootstrap.Tooltip(badge.querySelector(".lod-clear-btn"));
    }

    badge.querySelector(".lod-clear-btn").addEventListener("click", function () {
      disposeBadgeTooltips(badge);
      delete input.dataset.lodUri;
      input.value = "";
      badge.remove();
    });

    // In view mode, a project-internal URI gets a small "view this record" link
    // next to the external-link icon.
    if (form._viewMode) {
      var viewLink = form.viewLinkFor(uri);
      if (viewLink) {
        var extA = badge.querySelector('a[data-bs-toggle="tooltip"]');
        if (extA) {
          extA.insertAdjacentHTML("afterend",
            '<a href="' + viewLink + '" class="ms-1 text-decoration-none ba-view-link keep-active" ' +
            'data-bs-toggle="tooltip" title="View this record">' +
            '<i class="bi bi-box-arrow-in-right"></i></a>');
          if (hasBootstrap()) new bootstrap.Tooltip(badge.querySelector(".ba-view-link"));
        }
      }
    }

    return badge;
  };

  function disposeBadgeTooltips(badge) {
    if (!hasBootstrap()) return;
    Array.prototype.forEach.call(badge.querySelectorAll('[data-bs-toggle="tooltip"]'), function (el) {
      var tip = bootstrap.Tooltip.getInstance(el);
      if (tip) tip.dispose();
    });
  }

  // Adapted restoreLODField: set value + lodUri and render the badge.
  // Accepts {value, uri} or a legacy plain string.
  form.setValueUri = function (formEl, name, data) {
    var input = formEl.querySelector('[name="' + name + '"]');
    if (!input) return;

    if (data && typeof data === "object" && "value" in data) {
      input.value = data.value || "";
      if (data.uri) {
        input.dataset.lodUri = data.uri;
        form.attachBadge(input, data.uri);
      }
    } else if (typeof data === "string") {
      input.value = data; // legacy
    }
  };

  // ---- Repeatable blocks ----
  // Fields inside a block are addressed by CLASS name, not indexed name
  // attributes (deletion-proof).

  // opts.movable adds up/down reorder buttons in the top-right control cluster,
  // to the left of the delete button. Non-movable blocks are byte-for-byte
  // unchanged, so other block types are unaffected.
  form.addBlock = function (containerEl, innerHtml, opts) {
    opts = opts || {};
    var div = document.createElement("div");
    div.className = "border rounded p-3 mb-3 ba-block position-relative";
    var moveBtns = opts.movable
      ? '<button type="button" class="btn btn-sm btn-link text-secondary p-0 ba-move-up position-absolute top-0 end-0 mt-2 me-5" ' +
          'aria-label="Move up"><i class="bi bi-arrow-up"></i></button>' +
        '<button type="button" class="btn btn-sm btn-link text-secondary p-0 ba-move-down position-absolute top-0 end-0 mt-2 me-4" ' +
          'aria-label="Move down"><i class="bi bi-arrow-down"></i></button>'
      : "";
    div.innerHTML =
      moveBtns +
      '<button type="button" class="btn-close ba-block-delete position-absolute top-0 end-0 m-2" ' +
      'aria-label="Delete entry"></button>' + innerHtml;
    containerEl.appendChild(div);
    return div;
  };

  // One delegated listener removes any block whose delete button is clicked.
  document.addEventListener("click", function (e) {
    if (form._viewMode) return;
    var btn = e.target.closest ? e.target.closest(".ba-block-delete") : null;
    if (!btn) return;
    var block = btn.closest(".ba-block");
    if (block) block.remove();
  });

  // Generic block reordering (opt-in via addBlock(.., { movable: true })): moves
  // any .ba-block up/down among its sibling blocks within the same container.
  // No-op at the edges. Moving changes DOM order — which is what export
  // serialises — but leaves each block's dataset.xmlid untouched (ids identify,
  // they do not encode position). Marks the form dirty directly (no input event).
  document.addEventListener("click", function (e) {
    if (form._viewMode) return;
    if (!e.target.closest) return;
    var up = e.target.closest(".ba-move-up");
    var down = e.target.closest(".ba-move-down");
    if (!up && !down) return;
    var block = (up || down).closest(".ba-block");
    if (!block || !block.parentNode) return;
    function siblingBlock(el, dir) {
      var s = dir === "up" ? el.previousElementSibling : el.nextElementSibling;
      while (s && !(s.classList && s.classList.contains("ba-block"))) {
        s = dir === "up" ? s.previousElementSibling : s.nextElementSibling;
      }
      return s;
    }
    if (up) {
      var prev = siblingBlock(block, "up");
      if (prev) block.parentNode.insertBefore(block, prev);
    } else {
      var next = siblingBlock(block, "down");
      if (next) block.parentNode.insertBefore(next, block);
    }
    form._dirty = true;
  });

  form.blocks = function (containerEl) {
    return Array.prototype.filter.call(containerEl.children, function (ch) {
      return ch.classList && ch.classList.contains("ba-block");
    });
  };

  form.val = function (block, cls) {
    var el = block.querySelector("." + cls);
    return (el && el.value && el.value.trim()) || "";
  };

  form.valUri = function (block, cls) {
    var el = block.querySelector("." + cls);
    if (!el) return { value: "", uri: "" };
    return { value: el.value.trim(), uri: el.dataset.lodUri || "" };
  };

  // ---- Date group ----
  // A "Date type" select gates which fields appear: "Exact date" reveals a
  // single `when`; "Date range" reveals `from`+`to`. Switching modes clears the
  // now-hidden side, so a record can never carry both `when` and `from/to`.
  // Fields are addressed by class: {prefix}-mode/-when/-from/-to/-text/-cert/-source.

  // HTML for one date group. opts:
  // withText : include the free-text display-date input (default true; pass
  // false for template elements with no text content).
  // cert     : pre-built <select> HTML (class {prefix}-cert) or falsy to omit.
  // source   : pre-built <select> HTML (class {prefix}-source) or falsy to omit.
  form.dateGroupHtml = function (prefix, opts) {
    opts = opts || {};
    var parts = [];
    if (opts.withText !== false) {
      parts.push('<div class="col-md-3"><label class="form-label">Date</label>' +
        '<input type="text" class="form-control ' + prefix + '-text"></div>');
    }
    parts.push('<div class="col-md-3"><label class="form-label">Date type</label>' +
      '<select class="form-select date-mode ' + prefix + '-mode">' +
      '<option value="">Please select</option>' +
      '<option value="when">Exact date</option>' +
      '<option value="range">Date range</option>' +
      '</select></div>');
    parts.push('<div class="col-md-3 date-when-wrap d-none"><label class="form-label">When exactly?</label>' +
      '<input type="text" class="form-control ' + prefix + '-when"></div>');
    parts.push('<div class="col-md-4 date-range-wrap d-none"><div class="row g-2">' +
      '<div class="col-md-6"><label class="form-label">From when?</label>' +
      '<input type="text" class="form-control ' + prefix + '-from"></div>' +
      '<div class="col-md-6"><label class="form-label">To when?</label>' +
      '<input type="text" class="form-control ' + prefix + '-to"></div>' +
      '</div></div>');
    if (opts.cert) {
      parts.push('<div class="col-md-2"><label class="form-label">Degree of certainty</label>' + opts.cert + '</div>');
    }
    if (opts.source) {
      parts.push('<div class="col-md-3"><label class="form-label">Source</label>' + opts.source + '</div>');
    }
    return '<div class="date-group row g-2 mb-2">' + parts.join("") + "</div>";
  };

  function clearWrapInputs(group, wrapSel) {
    var wrap = group.querySelector(wrapSel);
    if (!wrap) return;
    Array.prototype.forEach.call(wrap.querySelectorAll("input"), function (i) { i.value = ""; });
  }

  // Show the fields for `mode`, hide + clear the other side.
  function applyDateMode(group, mode) {
    var showWhen = mode === "when";
    var showRange = mode === "range";
    var whenWrap = group.querySelector(".date-when-wrap");
    var rangeWrap = group.querySelector(".date-range-wrap");
    if (whenWrap) whenWrap.classList.toggle("d-none", !showWhen);
    if (rangeWrap) rangeWrap.classList.toggle("d-none", !showRange);
    if (!showWhen) clearWrapInputs(group, ".date-when-wrap");
    if (!showRange) clearWrapInputs(group, ".date-range-wrap");
  }
  form.applyDateMode = applyDateMode;

  // One delegated listener for every date group on the page.
  document.addEventListener("change", function (e) {
    var sel = e.target;
    if (!sel.classList || !sel.classList.contains("date-mode")) return;
    var group = sel.closest ? sel.closest(".date-group") : null;
    if (group) applyDateMode(group, sel.value);
  });

  // Read a group's values. The hidden side is always empty (cleared on switch).
  // The source field is a multi-select read via readSourceSelect.
  form.readDateGroup = function (container, prefix) {
    function v(suffix) {
      var el = container.querySelector("." + prefix + "-" + suffix);
      return (el && el.value && el.value.trim()) || "";
    }
    return {
      text: v("text"), when: v("when"), from: v("from"), to: v("to"), cert: v("cert"),
      source: form.readSourceSelect(container.querySelector("." + prefix + "-source"))
    };
  };

  // Populate a group on import: pick the mode from the data, reveal the right
  // wrapper, fill values. Call AFTER any source-select options are populated.
  form.setDateGroup = function (container, prefix, data) {
    data = data || {};
    var mode = data.when ? "when" : ((data.from || data.to) ? "range" : "");
    function set(suffix, val) {
      var el = container.querySelector("." + prefix + "-" + suffix);
      if (el && val) el.value = val;
    }
    var modeSel = container.querySelector("." + prefix + "-mode");
    if (modeSel) modeSel.value = mode;
    set("text", data.text);
    set("when", data.when);
    set("from", data.from);
    set("to", data.to);
    set("cert", data.cert);
    form.setSourceSelect(container.querySelector("." + prefix + "-source"), data.source);
    var group = (modeSel && modeSel.closest) ? modeSel.closest(".date-group") : container.querySelector(".date-group");
    if (group) applyDateMode(group, mode);
  };

  // ---- Accordion section ----
  // One Bootstrap accordion-item. `pageId` is the enclosing accordion's id (used
  // for data-bs-parent and a unique collapse id from `index`); `open` renders the
  // item expanded (button not collapsed, panel `.show`).
  form.accordionSectionHtml = function (pageId, index, title, help, bodyHtml, open) {
    var esc = window.BA.util.esc;
    var collapseId = pageId + "-sec-" + index;
    var btnCls = "accordion-button" + (open ? "" : " collapsed");
    var panelCls = "accordion-collapse collapse" + (open ? " show" : "");
    return '<div class="accordion-item">' +
      '<h2 class="accordion-header"><button class="' + btnCls + '" type="button" ' +
      'data-bs-toggle="collapse" data-bs-target="#' + collapseId + '">' + esc(title) + "</button></h2>" +
      '<div id="' + collapseId + '" class="' + panelCls + '" data-bs-parent="#' + pageId + '">' +
      '<div class="accordion-body">' +
      (help ? '<p class="text-muted small">' + esc(help) + "</p>" : "") +
      bodyHtml + "</div></div></div>";
  };

  // Copy of initTooltips (JS/metadata-new.js line 2567), bootstrap-guarded.
  form.initTooltips = function (scope) {
    if (!hasBootstrap()) return;
    (scope || document).querySelectorAll('[data-bs-toggle="tooltip"]').forEach(function (el) {
      new bootstrap.Tooltip(el, { trigger: "hover", container: "body" });
    });
  };

  // ---- Unsaved-changes guard ----
  // trackDirty(formEl) registers ONE document-level input/change listener pair
  // that flags the form dirty on any edit inside formEl; installUnloadGuard()
  // registers ONE beforeunload handler that warns while dirty. Editors call both
  // in init and markClean() after import / newRecord / download / submit. This
  // covers navbar links, Collection links, reload and tab close with no per-link
  // interception (precedent: metadata-new.js exit warning).

  form._dirty = false;
  form._viewMode = false; // set by enterViewMode; neutralises the dirty guard
  var dirtyForm = null;
  var dirtyListening = false;

  function onDirtyEvent(e) {
    if (form._viewMode) return;
    if (dirtyForm && dirtyForm.contains(e.target)) form._dirty = true;
  }

  // Idempotent: repeat calls just replace the tracked form, never stacking listeners.
  form.trackDirty = function (formEl) {
    if (form._viewMode) return;
    dirtyForm = formEl || null;
    if (!dirtyListening) {
      document.addEventListener("input", onDirtyEvent);
      document.addEventListener("change", onDirtyEvent);
      dirtyListening = true;
    }
  };

  form.markClean = function () { form._dirty = false; };
  form.isDirty = function () { return !!form._dirty; };

  var unloadGuardInstalled = false;
  form.installUnloadGuard = function () {
    if (form._viewMode) return;
    if (unloadGuardInstalled) return;
    unloadGuardInstalled = true;
    window.addEventListener("beforeunload", function (event) {
      if (form._viewMode) return;
      if (!form.isDirty()) return;
      // Browsers show their own generic prompt; the string is required to trigger it.
      event.preventDefault();
      event.returnValue =
        "You have unsaved changes. Download or submit your record before leaving, or the changes will be lost.";
      return event.returnValue;
    });
  };

  // ---- Open-from-repository picker ----
  // One reusable Bootstrap modal, injected into <body> once per page.
  // openRepoPicker(type, onPick) fills it from BA.authority.load(type); rows show
  // headword + id with fold-based filtering (same logic as the Collection listing).
  // Picking a row fetches the record's relative `file` path and calls
  // onPick(text, filename); a fetch failure shows an inline error row.

  var REPO_PICKER_ID = "baRepoPickerModal";

  function bsModal() {
    return (typeof bootstrap !== "undefined" && bootstrap && bootstrap.Modal) ? bootstrap.Modal : null;
  }

  form.repoPickerHtml = function () {
    return '<div class="modal fade" id="' + REPO_PICKER_ID + '" tabindex="-1" aria-hidden="true">' +
      '<div class="modal-dialog modal-dialog-scrollable">' +
      '<div class="modal-content">' +
      '<div class="modal-header">' +
      '<h5 class="modal-title">Open from repository</h5>' +
      '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
      "</div>" +
      '<div class="modal-body">' +
      '<input type="text" class="form-control mb-3 repo-picker-filter" placeholder="Filter by name or id" aria-label="Filter records">' +
      '<div class="list-group repo-picker-list"></div>' +
      "</div>" +
      "</div></div></div>";
  };

  function ensureRepoPicker() {
    var modal = document.getElementById(REPO_PICKER_ID);
    if (!modal) {
      var wrap = document.createElement("div");
      wrap.innerHTML = form.repoPickerHtml();
      modal = wrap.firstChild;
      document.body.appendChild(modal);
    }
    return modal;
  }

  form.openRepoPicker = function (type, onPick) {
    var esc = window.BA.util.esc;
    var fold = window.BA.authority.fold;
    var modal = ensureRepoPicker();
    var listEl = modal.querySelector(".repo-picker-list");
    var filterEl = modal.querySelector(".repo-picker-filter");
    var records = [];

    function render(recs) {
      if (!recs.length) {
        listEl.innerHTML = '<div class="list-group-item text-muted">No records in the repository yet</div>';
        return;
      }
      listEl.innerHTML = recs.map(function (r) {
        return '<button type="button" class="list-group-item list-group-item-action repo-picker-row" ' +
          'data-id="' + esc(String(r.id)) + '">' +
          esc(r.headword || "[no headword]") +
          ' <span class="text-muted">#' + esc(String(r.id)) + "</span></button>";
      }).join("");
    }

    function applyFilter() {
      var needle = fold(filterEl.value);
      if (!needle) { render(records); return; }
      render(records.filter(function (r) {
        if (fold(r.headword).indexOf(needle) !== -1) return true;
        if (fold(String(r.id)).indexOf(needle) !== -1) return true;
        return (r.altNames || []).some(function (a) { return fold(a).indexOf(needle) !== -1; });
      }));
    }

    filterEl.value = "";
    filterEl.oninput = applyFilter;
    listEl.innerHTML = '<div class="list-group-item text-muted">Loading…</div>';

    // Row click (re-assigned each open, so listeners never stack).
    listEl.onclick = function (e) {
      var row = e.target.closest ? e.target.closest(".repo-picker-row") : null;
      if (!row) return;
      var id = row.getAttribute("data-id");
      var rec = null;
      for (var i = 0; i < records.length; i++) {
        if (String(records[i].id) === String(id)) { rec = records[i]; break; }
      }
      if (!rec) return;
      fetch(rec.file)
        .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.text(); })
        .then(function (text) {
          onPick(text, (rec.file || "").split("/").pop());
          var inst = bsModal() && bsModal().getInstance(modal);
          if (inst) inst.hide();
        })
        .catch(function (err) {
          row.insertAdjacentHTML("afterend",
            '<div class="list-group-item text-danger repo-picker-error">Could not load ' +
            esc(rec.file) + ": " + esc(err.message) + "</div>");
        });
    };

    window.BA.authority.load(type).then(function (recs) {
      records = recs || [];
      render(records);
    });

    if (bsModal()) bsModal().getOrCreateInstance(modal).show();
  };

  // ---- Visible option lists: <select> + "Other…" ----
  // Replaces open-vocab datalists. selectWithOtherHtml renders a browsable
  // <select> (all vocab options + "Other…") followed by a hidden free-text input
  // revealed when "Other…" is chosen — open vocabularies stay open. A record is
  // read with readSelectWithOther and populated on import with setSelectWithOther.

  var OTHER = "__other__";

  form.selectWithOtherHtml = function (cls, vocabKey, selected) {
    var esc = window.BA.util.esc;
    var vocab = (window.BA.uiText.vocab[vocabKey] || []);
    selected = selected || "";
    var isOther = selected !== "" && !vocab.some(function (o) { return o.v === selected; });

    var opts = '<option value="">Please select</option>';
    vocab.forEach(function (o) {
      opts += '<option value="' + esc(o.v) + '"' + (!isOther && o.v === selected ? " selected" : "") +
        ">" + esc(o.l) + "</option>";
    });
    opts += '<option value="' + OTHER + '"' + (isOther ? " selected" : "") + ">Other…</option>";

    var sel = '<select class="form-select select-with-other ' + cls + '-sel" data-swo="' + esc(cls) + '">' +
      opts + "</select>";
    var input = '<input type="text" class="form-control ' + cls + "-other mt-1" +
      (isOther ? "" : " d-none") + '" value="' + (isOther ? esc(selected) : "") +
      '" placeholder="Enter value…">';
    return sel + input;
  };

  form.readSelectWithOther = function (scope, cls) {
    if (!scope) return "";
    var sel = scope.querySelector("." + cls + "-sel");
    if (!sel) return "";
    if (sel.value === OTHER) {
      var other = scope.querySelector("." + cls + "-other");
      return (other && other.value && other.value.trim()) || "";
    }
    return sel.value;
  };

  form.setSelectWithOther = function (scope, cls, value) {
    if (!scope) return;
    var sel = scope.querySelector("." + cls + "-sel");
    var other = scope.querySelector("." + cls + "-other");
    if (!sel) return;
    value = value || "";
    var inVocab = Array.prototype.some.call(sel.options, function (o) {
      return o.value === value && o.value !== "" && o.value !== OTHER;
    });
    if (value !== "" && !inVocab) {
      sel.value = OTHER;
      if (other) { other.classList.remove("d-none"); other.value = value; }
    } else {
      sel.value = value;
      if (other) { other.classList.add("d-none"); other.value = ""; }
    }
  };

  // One delegated listener: "Other…" reveals + focuses the sibling text input;
  // any other choice hides + clears it.
  document.addEventListener("change", function (e) {
    var sel = e.target;
    if (!sel.classList || !sel.classList.contains("select-with-other")) return;
    var cls = sel.dataset ? sel.dataset.swo : null;
    if (!cls) return;
    var other = sel.parentNode ? sel.parentNode.querySelector("." + cls + "-other") : null;
    if (!other) return;
    if (sel.value === OTHER) {
      other.classList.remove("d-none");
      if (typeof other.focus === "function") other.focus();
    } else {
      other.classList.add("d-none");
      other.value = "";
    }
  });

  // ---- Source selects: multi-select, publication-title labels ----
  // Every .src-select is a <select multiple>. TEI @source is a whitespace-
  // separated pointer list, so a field may point at several bibl entries.
  // Options are labelled with the (truncated) bibl Title of publication and keep
  // "#bib{n}" as the stored value; the full title is the option's hover title.

  // Read selected pointers as a whitespace-separated string, e.g. "#bib1 #bib3".
  form.readSourceSelect = function (sel) {
    if (!sel) return "";
    return Array.prototype.map.call(sel.selectedOptions || [], function (o) { return o.value; })
      .filter(Boolean).join(" ");
  };

  // Select every option whose value appears in `value` (whitespace-separated).
  form.setSourceSelect = function (sel, value) {
    if (!sel) return;
    var tokens = String(value || "").trim().split(/\s+/).filter(Boolean);
    Array.prototype.forEach.call(sel.options, function (o) {
      o.selected = tokens.indexOf(o.value) !== -1;
    });
  };

  // Rebuild every .src-select in formEl from the bibl blocks in biblContainerEl,
  // preserving current selections. Called by editors on bibl add/remove/title edit.
  form.refreshSourceSelects = function (formEl, biblContainerEl) {
    if (!formEl) return;
    var esc = window.BA.util.esc;
    var opts = (biblContainerEl ? form.blocks(biblContainerEl) : []).map(function (b) {
      var id = form.val(b, "bibl-id");
      if (!id) return null;
      var title = form.val(b, "bibl-title");
      var full = title || id;
      var label = full.length > 60 ? full.slice(0, 60) + "…" : full;
      return { value: "#" + id, label: label, full: full };
    }).filter(Boolean);

    Array.prototype.forEach.call(formEl.querySelectorAll(".src-select"), function (sel) {
      var chosen = form.readSourceSelect(sel).split(/\s+/).filter(Boolean);
      sel.innerHTML = opts.map(function (o) {
        return '<option value="' + esc(o.value) + '" title="' + esc(o.full) + '"' +
          (chosen.indexOf(o.value) !== -1 ? " selected" : "") + ">" + esc(o.label) + "</option>";
      }).join("");
    });
  };

  // Markup for one multi-select source field (used by editors + the date group).
  form.sourceSelectHtml = function (cls, name) {
    return '<select multiple size="2" class="form-select src-select' + (cls ? " " + cls : "") + '"' +
      (name ? ' name="' + name + '"' : "") +
      ' title="Ctrl/Cmd-click to select several"></select>';
  };

  // ---- Read-only view mode (R5) ----
  // enterViewMode locks an editor's rendered form for full-record preview: it
  // disables every control, hides the editing chrome (via CSS), expands all
  // sections, tags empty fields/blocks/sections so they can be folded away, and
  // shows a sticky banner. The dirty guard is neutralised while _viewMode is set
  // (see onDirtyEvent / trackDirty / installUnloadGuard above).

  form.isViewMode = function () { return !!form._viewMode; };

  // Editor page per entity type (for internal "view this record" links).
  var VIEW_EDITOR_PAGES = {
    manuscript: "editor.html",
    person: "person-editor.html",
    place: "place-editor.html",
    work: "work-editor.html"
  };

  // For a project record URI shaped {baseUri}/{entityPath}/{id} that resolves in
  // its authority index, return "{editorPage}?view={id}"; otherwise null.
  form.viewLinkFor = function (uri) {
    if (!uri || !window.BA.config) return null;
    var cfg = window.BA.config;
    var paths = cfg.entityPaths || {};
    var types = Object.keys(paths);
    for (var i = 0; i < types.length; i++) {
      var type = types[i];
      var prefix = cfg.baseUri + "/" + paths[type] + "/";
      if (uri.indexOf(prefix) !== 0) continue;
      var id = uri.slice(prefix.length);
      if (!/^\d+$/.test(id)) return null;
      if (window.BA.authority && window.BA.authority.resolve(type, uri)) {
        return (VIEW_EDITOR_PAGES[type] || (type + "-editor.html")) + "?view=" + id;
      }
      return null;
    }
    return null;
  };

  function controlIsEmpty(el) {
    if (el.type === "checkbox" || el.type === "radio") return !el.checked;
    var v = (el.value || "").trim();
    return v === "" && !el.dataset.lodUri;
  }

  // A scope "has content" if any control is non-empty OR it carries a
  // value-bearing reference anchor (e.g. person idno rows render the URI as a
  // link with no form control of their own). Used to decide block/section
  // emptiness so content-only blocks are not folded away.
  function scopeHasContent(scope) {
    var controls = scope.querySelectorAll("input, select, textarea");
    if (Array.prototype.some.call(controls, function (c) { return !controlIsEmpty(c); })) return true;
    return !!scope.querySelector("a[data-uri], .idno-uri-val");
  }

  function hasColClass(el) {
    return el.classList && Array.prototype.some.call(el.classList, function (c) {
      return /^col($|-)/.test(c);
    });
  }
  function isContainerClass(el) {
    return el.classList && Array.prototype.some.call(el.classList, function (c) {
      return /-container$/.test(c);
    });
  }
  function closestColWrapper(el) {
    var n = el.parentElement;
    while (n) { if (hasColClass(n)) return n; n = n.parentElement; }
    return null;
  }

  // Bottom-up emptiness pass: field wrappers, then repeatable blocks, then block
  // sub-containers (with their heading + add-button wrapper), then accordion
  // items / bordered sections. Adds class ba-empty; CSS folds .ba-empty away
  // while the body has "view-mode hide-empty".
  form.tagEmpty = function (formEl) {
    // 1. field wrappers: a .col-* with exactly one control + a label.
    Array.prototype.forEach.call(formEl.querySelectorAll("[class]"), function (el) {
      if (!hasColClass(el)) return;
      if (!el.querySelector("label")) return;
      var controls = el.querySelectorAll("input, select, textarea");
      if (controls.length === 1 && controlIsEmpty(controls[0])) el.classList.add("ba-empty");
    });

    // 2. repeatable blocks with no content.
    Array.prototype.forEach.call(formEl.querySelectorAll(".ba-block"), function (b) {
      if (!scopeHasContent(b)) b.classList.add("ba-empty");
    });

    // 3. block sub-containers with zero non-empty blocks — plus their heading
    // (previous sibling) and add-button wrapper (next sibling).
    Array.prototype.forEach.call(formEl.querySelectorAll("[class]"), function (c) {
      if (!isContainerClass(c)) return;
      var nonEmpty = form.blocks(c).filter(function (b) {
        return !b.classList.contains("ba-empty");
      });
      if (nonEmpty.length) return;
      c.classList.add("ba-empty");
      var prev = c.previousElementSibling;
      if (prev && /^H[1-6]$/.test(prev.tagName)) prev.classList.add("ba-empty");
      var next = c.nextElementSibling;
      if (next && (next.tagName === "BUTTON" ||
        (next.querySelector && next.querySelector("button")))) {
        next.classList.add("ba-empty");
      }
    });

    // 4. accordion items and top-level bordered sections with no content.
    Array.prototype.forEach.call(formEl.querySelectorAll(".accordion-item"), function (item) {
      if (!scopeHasContent(item)) item.classList.add("ba-empty");
    });
    Array.prototype.forEach.call(formEl.querySelectorAll(".border"), function (sec) {
      if (sec.classList.contains("ba-block")) return;
      if (sec.closest && sec.closest(".ba-block")) return;
      if (!scopeHasContent(sec)) sec.classList.add("ba-empty");
    });

    // 5. sub-group headings (h5/h6): a heading is empty when everything that
    // follows it — up to the next heading sibling — has no content. Stops a
    // heading (e.g. "Note", "Role") from dangling over hidden empty fields.
    Array.prototype.forEach.call(formEl.querySelectorAll("h5, h6"), function (h) {
      var sib = h.nextElementSibling;
      var hasContent = false;
      while (sib && !/^H[1-6]$/.test(sib.tagName)) {
        if (scopeHasContent(sib)) { hasContent = true; break; }
        sib = sib.nextElementSibling;
      }
      if (!hasContent) h.classList.add("ba-empty");
    });

    // 6. select-with-other pairs read as plain values in view mode: a value
    // entered via "Other…" shows as the value itself (hide the "Other…" select,
    // keep the text input); a fully empty pair folds like any empty field.
    Array.prototype.forEach.call(formEl.querySelectorAll(".select-with-other"), function (sel) {
      var cls = sel.dataset ? sel.dataset.swo : null;
      var other = (cls && sel.parentNode) ? sel.parentNode.querySelector("." + cls + "-other") : null;
      var isOther = sel.value === OTHER;
      var effective = isOther ? (other ? (other.value || "").trim() : "") : (sel.value || "").trim();
      if (!effective) {
        var wrap = closestColWrapper(sel);
        if (wrap) wrap.classList.add("ba-empty");
      } else if (isOther) {
        sel.classList.add("d-none"); // suppress the "Other…" label; value shows via the text input
      }
    });
  };

  function buildViewBanner(opts) {
    var esc = window.BA.util.esc;
    var type = opts.type || "";
    var typeLabel = type ? type.charAt(0).toUpperCase() + type.slice(1) : "";
    var bar = document.createElement("div");
    bar.id = "baViewBanner";
    bar.className = "ba-view-banner d-flex flex-wrap align-items-center justify-content-between " +
      "gap-2 px-3 py-2 border-bottom bg-warning-subtle";
    bar.style.position = "sticky";
    bar.style.top = "0";
    bar.style.zIndex = "1030";
    bar.innerHTML =
      '<span class="fw-semibold">Read-only view — ' + esc(typeLabel) + " " +
      esc(String(opts.id || "")) + "</span>" +
      '<span class="d-flex flex-wrap align-items-center gap-2">' +
      '<button type="button" class="btn btn-sm btn-primary keep-active ba-view-open">Open in editor</button>' +
      '<button type="button" class="btn btn-sm btn-outline-secondary keep-active ba-view-back">Back to collection</button>' +
      '<button type="button" class="btn btn-sm btn-outline-secondary keep-active ba-view-toggle">Show empty fields</button>' +
      "</span>";
    return bar;
  }

  // opts = { type, id, editorHref, collectionHref }
  form.enterViewMode = function (formEl, opts) {
    opts = opts || {};
    document.body.classList.add("view-mode", "hide-empty");

    // Rich-text fields (R6): swap each rich-capable textarea for a read-only
    // div.rich-view rendering its formatted HTML. Done before tagEmpty so the
    // (hidden) source textareas still drive the emptiness logic below.
    if (window.BA.rich && window.BA.rich.renderView) window.BA.rich.renderView(formEl);

    // Disable every control except .keep-active (badge <a> links are unaffected).
    Array.prototype.forEach.call(
      formEl.querySelectorAll("input, select, textarea, button"),
      function (el) {
        if (el.classList && el.classList.contains("keep-active")) return;
        el.disabled = true;
      }
    );

    // Sticky banner, placed directly under the navbar.
    var old = document.getElementById("baViewBanner");
    if (old) old.remove();
    var bar = buildViewBanner(opts);
    var navbar = document.querySelector("nav.navbar");
    if (navbar && navbar.parentNode) navbar.parentNode.insertBefore(bar, navbar.nextSibling);
    else document.body.insertBefore(bar, document.body.firstChild);

    bar.querySelector(".ba-view-open").addEventListener("click", function () {
      if (opts.editorHref) location.href = opts.editorHref;
    });
    bar.querySelector(".ba-view-back").addEventListener("click", function () {
      if (opts.collectionHref) location.href = opts.collectionHref;
    });
    var toggle = bar.querySelector(".ba-view-toggle");
    toggle.addEventListener("click", function () {
      var hidden = document.body.classList.toggle("hide-empty");
      toggle.textContent = hidden ? "Show empty fields" : "Hide empty fields";
    });

    // Expand every accordion section.
    Array.prototype.forEach.call(formEl.querySelectorAll(".accordion-collapse"), function (p) {
      p.classList.add("show");
    });
    Array.prototype.forEach.call(formEl.querySelectorAll(".accordion-button"), function (b) {
      b.classList.remove("collapsed");
      b.setAttribute("aria-expanded", "true");
    });

    form.tagEmpty(formEl);
    form.markClean();
    form._viewMode = true;
  };
})();
