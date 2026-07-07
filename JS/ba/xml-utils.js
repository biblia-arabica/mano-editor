// XML string building + namespace-aware parsing helpers.
// Everything on BA.util. Classic script (no build step; loaded via <script>).

(function () {
  "use strict";

  var util = window.BA.util;

  // Copy of escapeXml (JS/metadata-new.js line 1148).
  util.esc = function (str) {
    if (typeof str !== "string") str = JSON.stringify(str);
    if (str === undefined || str === null) return "";
    return str.replace(/[<>&'"]/g, function (c) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c];
    }) || "";
  };

  // Build an XML element string.
  // attrs: keys with "", null, undefined are omitted. Special keys:
  // _keep: true  -> emit <tag/> even when there are no attrs and no content
  // _text: raw text content, escaped (convenience)
  // content: string (already-built XML / escaped text) or array of strings (joined "\n").
  // Empty content + no attrs -> "" (unless _keep). Empty content + attrs -> self-closing.
  util.el = function (tag, attrs, content) {
    attrs = attrs || {};
    var keep = attrs._keep === true;
    var attrParts = [];
    Object.keys(attrs).forEach(function (k) {
      if (k === "_keep" || k === "_text") return;
      var v = attrs[k];
      if (v === "" || v === null || v === undefined) return;
      attrParts.push(k + '="' + util.esc(String(v)) + '"');
    });

    var inner = "";
    if (Array.isArray(content)) {
      inner = content.filter(function (c) { return c !== "" && c !== null && c !== undefined; }).join("\n");
    } else if (content !== undefined && content !== null) {
      inner = String(content);
    }
    if (attrs._text !== undefined && attrs._text !== null && attrs._text !== "") {
      inner += util.esc(String(attrs._text));
    }

    var open = "<" + tag + (attrParts.length ? " " + attrParts.join(" ") : "");
    if (inner === "") {
      if (attrParts.length === 0 && !keep) return "";
      return open + "/>";
    }
    return open + ">" + inner + "</" + tag + ">";
  };

  // Cosmetic pretty-printer: 4-space indent per depth. Never used for correctness.
  util.indent = function (xml) {
    var out = [];
    var depth = 0;
    var nodes = xml.replace(/>\s+</g, "><").split(/></);
    nodes.forEach(function (node, i) {
      if (i !== 0) node = "<" + node;
      if (i !== nodes.length - 1) node = node + ">";

      var isClosing = /^<\//.test(node);
      var isSelfClosing = /\/>$/.test(node);
      var isPiOrDecl = /^<[?!]/.test(node);
      var closesItself = /<[^/?!][^>]*>[\s\S]*<\/[^>]+>$/.test(node); // <a>text</a> in one fragment

      if (isClosing) depth = Math.max(0, depth - 1);
      out.push(new Array(depth + 1).join("    ") + node);
      if (!isClosing && !isSelfClosing && !isPiOrDecl && !closesItself) depth += 1;
    });
    return out.join("\n");
  };

  // ---- Parsing helpers ----

  // DOMParser wrapper; throws Error with the parsererror text on invalid XML.
  util.parse = function (xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, "application/xml");
    var err = doc.getElementsByTagName("parsererror");
    if (err.length) throw new Error("XML parse error: " + (err[0].textContent || "").trim());
    return doc;
  };

  function parseStep(step) {
    var m = step.match(/^([^\[]+)(?:\[@([\w:.-]+)=['"]([^'"]*)['"]\])?$/);
    if (!m) throw new Error("BA.util path: bad step '" + step + "'");
    return { name: m[1], attr: m[2], val: m[3] };
  }

  function matches(el, st) {
    if (el.localName !== st.name) return false;
    if (st.attr !== undefined && el.getAttribute(st.attr) !== st.val) return false;
    return true;
  }

  // All matches for a "/"-separated path of local names (namespace-agnostic).
  // First step matches any descendant of `node`; each further step must be a
  // direct child of the previous step's match. Steps support name[@attr='v'].
  util.qa = function (node, path) {
    var steps = path.split("/").map(parseStep);
    var current = [node];
    steps.forEach(function (st, i) {
      var next = [];
      current.forEach(function (ctx) {
        var cand;
        if (i === 0) {
          cand = Array.prototype.slice.call(ctx.getElementsByTagNameNS("*", st.name));
        } else {
          cand = Array.prototype.filter.call(ctx.children || [], function (ch) {
            return ch.localName === st.name;
          });
        }
        cand.forEach(function (el) {
          if (matches(el, st) && next.indexOf(el) === -1) next.push(el);
        });
      });
      current = next;
    });
    return current;
  };

  // First match or null.
  util.q = function (node, path) {
    return util.qa(node, path)[0] || null;
  };

  util.attr = function (node, name) {
    return (node && node.getAttribute(name)) || "";
  };

  util.text = function (node) {
    return (node && node.textContent && node.textContent.trim()) || "";
  };
})();
