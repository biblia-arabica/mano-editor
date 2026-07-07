// GitHub Contents-API submit service. Everything on BA.github.
// Classic script (no build step; loaded via <script>). Depends on BA.config,
// BA.form, BA.authority, BA.validate, BA.util.
//
// Writing uses a fine-grained personal access token supplied by each editor at
// first use and held in localStorage ONLY — never committed, never in the repo.

(function () {
  "use strict";

  var github = window.BA.github = window.BA.github || {};

  var TOKEN_KEY = "ba-github-token";
  var API = "https://api.github.com";

  // ---------- token (localStorage only) ----------

  github.getToken = function () {
    try { return localStorage.getItem(TOKEN_KEY) || null; } catch (e) { return null; }
  };
  github.setToken = function (t) {
    try { if (t) localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* private mode */ }
  };
  github.forgetToken = function () {
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
  };

  // ---------- repo identity ----------

  // {owner, repo} from BA.config.repoUrl; null when unset/malformed.
  github.repoInfo = function () {
    var m = (window.BA.config.repoUrl || "").match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!m) return null;
    return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
  };

  function branch() {
    return (window.BA.config.github && window.BA.config.github.branch) || "main";
  }

  function recordPath(type, id) {
    return window.BA.config.dataDirs[type] + "/" + id + ".xml";
  }
  github.recordPath = recordPath;

  // ---------- data-file listing (live index) ----------
  // Lists data/{dir} on the branch, unauthenticated (60 req/h/IP). If a token is
  // stored it is sent to lift that limit. Resolves an array of
  // { name, download_url } filtered to `\d+.xml`, or null on any failure.
  github.listDataFiles = function (type) {
    var info = github.repoInfo();
    if (!info) return Promise.resolve(null);
    var dir = window.BA.config.dataDirs[type];
    var url = API + "/repos/" + info.owner + "/" + info.repo + "/contents/" + dir +
      "?ref=" + encodeURIComponent(branch());
    var headers = { "Accept": "application/vnd.github+json" };
    var token = github.getToken();
    if (token) headers["Authorization"] = "Bearer " + token;

    return fetch(url, { headers: headers })
      .then(function (res) {
        if (!res.ok) { console.warn("BA.github.listDataFiles: HTTP " + res.status + " for " + dir); return null; }
        return res.json();
      })
      .then(function (arr) {
        if (!Array.isArray(arr)) return null;
        return arr
          .filter(function (f) { return /^\d+\.xml$/.test(f.name); })
          .map(function (f) { return { name: f.name, download_url: f.download_url }; });
      })
      .catch(function (err) {
        console.warn("BA.github.listDataFiles failed: " + err.message);
        return null;
      });
  };

  // UTF-8 safe base64 (contents API wants base64-encoded bytes).
  function b64(xml) {
    return btoa(unescape(encodeURIComponent(xml)));
  }

  function mapError(status) {
    var msg;
    if (status === 401) msg = "Token invalid or expired.";
    else if (status === 403) msg = "Token lacks Contents write for this repository (or rate limit reached).";
    else if (status === 409) msg = "Conflict — reload the record and retry.";
    else msg = "GitHub request failed (HTTP " + status + ").";
    var e = new Error(msg);
    e.__mapped = true;
    throw e;
  }

  // ---------- submit ----------
  // GET the existing file's sha (404 => create), then PUT the new content.
  // Resolves { ok, htmlUrl, created, updated }; rejects with a mapped message.
  github.submitRecord = function (type, id, xml, message) {
    var info = github.repoInfo();
    if (!info) return Promise.reject(new Error("Repository URL is not configured."));
    var token = github.getToken();
    if (!token) return Promise.reject(new Error("No token stored — enter a token first."));

    var path = recordPath(type, id);
    var url = API + "/repos/" + info.owner + "/" + info.repo + "/contents/" + path;
    var headers = { "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json" };

    return fetch(url + "?ref=" + encodeURIComponent(branch()), { headers: headers })
      .then(function (res) {
        if (res.status === 404) return null;                         // create
        if (res.status === 200) return res.json().then(function (j) { return j.sha; });
        return mapError(res.status);                                 // throws
      })
      .then(function (sha) {
        var body = { message: message, content: b64(xml), branch: branch() };
        if (sha) body.sha = sha;
        return fetch(url, { method: "PUT", headers: headers, body: JSON.stringify(body) })
          .then(function (res) {
            if (!res.ok) return mapError(res.status);                // throws
            return res.json().then(function (j) {
              return {
                ok: true,
                created: !sha,
                updated: !!sha,
                htmlUrl: (j.commit && j.commit.html_url) || ""
              };
            });
          });
      })
      .catch(function (err) {
        if (err && err.__mapped) throw err;
        throw new Error("Network error — check your connection and try again.");
      });
  };

  // ---------- token-free fallback: GitHub's prefilled new-file page ----------

  github.prefillUrl = function (type, id, xml) {
    var base = (window.BA.config.repoUrl || "").replace(/\/$/, "");
    return base + "/new/" + branch() + "/" + window.BA.config.dataDirs[type] +
      "?filename=" + encodeURIComponent(id + ".xml") +
      "&value=" + encodeURIComponent(xml);
  };

  github.openPrefillFallback = function (type, id, xml) {
    var url = github.prefillUrl(type, id, xml);
    window.open(url, "_blank", "noopener");
    return url;
  };

  // ---------- submit modal (shared, injected once per page) ----------

  var MODAL_ID = "baSubmitModal";

  function bsModal() {
    return (typeof bootstrap !== "undefined" && bootstrap && bootstrap.Modal) ? bootstrap.Modal : null;
  }
  function esc(s) { return window.BA.util.esc(s == null ? "" : String(s)); }

  function showZoneAlert(html, kind) {
    var z = document.getElementById("alertZone");
    if (!z) { console.warn(html); return; }
    z.innerHTML = '<div class="alert alert-' + (kind || "warning") + ' alert-dismissible" role="alert">' +
      html + '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button></div>';
  }

  github.modalHtml = function () {
    return '<div class="modal fade" id="' + MODAL_ID + '" tabindex="-1" aria-hidden="true">' +
      '<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content">' +
      '<div class="modal-header"><h5 class="modal-title">Submit to repository</h5>' +
      '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>' +
      '<div class="modal-body">' +
      '<p class="mb-1">This commits the record to</p>' +
      '<p><code class="submit-path"></code> on branch <code class="submit-branch"></code>.</p>' +
      '<div class="mb-3"><label class="form-label">Commit message</label>' +
      '<input type="text" class="form-control submit-message"></div>' +
      '<div class="mb-2"><label class="form-label">GitHub token (fine-grained PAT)</label>' +
      '<input type="password" class="form-control submit-token" autocomplete="off" placeholder="github_pat_…"></div>' +
      '<div class="d-flex gap-2 mb-3">' +
      '<button type="button" class="btn btn-primary submit-go"><i class="bi bi-cloud-upload"></i> Submit</button>' +
      '<button type="button" class="btn btn-outline-secondary submit-forget">Forget token</button></div>' +
      '<div class="submit-status"></div>' +
      '<details class="mt-2"><summary class="small">How to create a token</summary>' +
      '<p class="small text-muted mt-2">Create a <strong>fine-grained personal access token</strong> at ' +
      'github.com → Settings → Developer settings → Fine-grained tokens. Set <em>Repository access</em> to ' +
      '<strong>this repository only</strong> and <em>Permissions → Contents</em> to <strong>Read and write</strong>. ' +
      'The token is stored only in this browser and is never committed to the repository.</p></details>' +
      "<hr>" +
      '<p class="small mb-1">No token? <a href="#" class="submit-fallback">Open GitHub’s new-file page</a> with this record prefilled.</p>' +
      '<p class="small text-muted submit-fallback-note d-none"></p>' +
      "</div></div></div></div>";
  };

  function ensureModal() {
    var m = document.getElementById(MODAL_ID);
    if (!m) {
      var w = document.createElement("div");
      w.innerHTML = github.modalHtml();
      m = w.firstChild;
      document.body.appendChild(m);
    }
    return m;
  }

  // Same gate as Download (reuses BA.validate); returns false to abort.
  function validationPasses(type, data) {
    var V = window.BA.validate;
    if (!V || !V.run) return true;
    var issues = V.run(type, data);
    var mandatory = issues.filter(function (i) { return i.severity === "mandatory"; });
    if (mandatory.length) { V.showReport(issues); return false; }
    var recs = issues.filter(function (i) { return i.severity !== "mandatory"; });
    if (recs.length) {
      V.showReport(issues);
      if (!window.confirm("There are recommendations you may want to review. Submit anyway?")) return false;
    }
    return true;
  }

  // opts: { type, id, xml, data, changeNote }
  github.openSubmit = function (opts) {
    var type = opts.type, id = opts.id, xml = opts.xml;

    // Validate before doing anything else (parity with the Download gate).
    if (!validationPasses(type, opts.data)) return;

    var modal = ensureModal();
    var q = function (sel) { return modal.querySelector(sel); };

    q(".submit-path").textContent = recordPath(type, id);
    q(".submit-branch").textContent = branch();
    q(".submit-token").value = github.getToken() || "";
    q(".submit-status").innerHTML = "";

    // Prefill-fallback link + 7000-char size guard.
    var link = q(".submit-fallback");
    var note = q(".submit-fallback-note");
    var url = github.prefillUrl(type, id, xml);
    if (url.length > 7000) {
      link.classList.add("d-none");
      note.classList.remove("d-none");
      note.textContent = "Record too large for the prefill link — download and add it on GitHub manually.";
    } else {
      link.classList.remove("d-none");
      note.classList.add("d-none");
    }
    link.onclick = function (e) { e.preventDefault(); github.openPrefillFallback(type, id, xml); };

    // Commit message: Change note if present, else Add/Update from a collision check.
    q(".submit-message").value = (opts.changeNote && opts.changeNote.trim()) || ("Update " + type + " " + id);
    window.BA.authority.checkCollision(type, id).then(function (exists) {
      if (!(opts.changeNote && opts.changeNote.trim())) {
        q(".submit-message").value = (exists ? "Update " : "Add ") + type + " " + id;
      }
    });

    q(".submit-forget").onclick = function () {
      github.forgetToken();
      q(".submit-token").value = "";
      q(".submit-status").innerHTML = '<div class="alert alert-info py-1 mb-0">Token removed from this browser.</div>';
    };

    q(".submit-go").onclick = function () {
      var token = q(".submit-token").value.trim();
      if (!token) {
        q(".submit-status").innerHTML =
          '<div class="alert alert-warning py-1 mb-0">Enter a token, or use the new-file page link below.</div>';
        return;
      }
      github.setToken(token);
      var message = q(".submit-message").value.trim() || ("Update " + type + " " + id);
      var go = q(".submit-go");
      go.disabled = true;
      q(".submit-status").innerHTML = '<div class="text-muted">Submitting…</div>';

      github.submitRecord(type, id, xml, message).then(function (result) {
        go.disabled = false;
        var inst = bsModal() && bsModal().getInstance(modal);
        if (inst) inst.hide();
        var verb = result.created ? "created" : "updated";
        showZoneAlert('Record ' + verb + ' — <a href="' + esc(result.htmlUrl) +
          '" target="_blank" rel="noopener">view commit</a>. The lookup index updates within ~1 minute.', "success");
        window.BA.form.markClean();
        window.BA.authority.refresh(type);
      }).catch(function (err) {
        go.disabled = false;
        q(".submit-status").innerHTML =
          '<div class="alert alert-danger py-1 mb-0">' + esc(err.message) + "</div>";
      });
    };

    if (bsModal()) bsModal().getOrCreateInstance(modal).show();
  };
})();
