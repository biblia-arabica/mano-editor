#!/usr/bin/env python3
"""Patch MANO editor import for legacy TEI incipits, explicits and grouped loci.
Run at the root of a local checkout of biblia-arabica/mano-editor:
    python3 fix_mano_import.py
Then review with git diff and commit normally.
"""
from pathlib import Path
import sys

path = Path('JS/ba/ms-editor.js')
if not path.is_file():
    sys.exit('Run from the root of the mano-editor repository.')
s = path.read_text(encoding='utf-8')
old_locus = '''      directChildren(item, "locus").forEach(function (loc) { // direct children only — not incipit/explicit locus
        var it = addSubTo(block, "mi-locus");
        setB(it, "mi-locus-from", attr(loc, "from")); setB(it, "mi-locus-to", attr(loc, "to"));
      });'''
new_locus = '''      // Accept loci directly in msItem and inside TEI locusGrp.
      // Incipit and explicit loci are handled separately below.
      directChildren(item, "locus").concat(
        directChildren(item, "locusGrp").reduce(function (all, grp) {
          return all.concat(directChildren(grp, "locus"));
        }, [])
      ).forEach(function (loc) {
        var it = addSubTo(block, "mi-locus");
        setB(it, "mi-locus-from", attr(loc, "from"));
        setB(it, "mi-locus-to", attr(loc, "to"));
      });'''
old_text = '''      var inc = directChild(item, "incipit");
      if (inc) { var il = directChild(inc, "locus"); setB(block, "mi-inc-from", attr(il, "from")); setB(block, "mi-inc-to", attr(il, "to")); var iq = directChild(inc, "quote"); setB(block, "mi-inc-quote", R.innerXml(iq)); setB(block, "mi-inc-lang", attr(iq, "xml:lang")); }
      var exp = directChild(item, "explicit");
      if (exp) { var el2 = directChild(exp, "locus"); setB(block, "mi-exp-from", attr(el2, "from")); setB(block, "mi-exp-to", attr(el2, "to")); var eq = directChild(exp, "quote"); setB(block, "mi-exp-quote", R.innerXml(eq)); setB(block, "mi-exp-lang", attr(eq, "xml:lang")); }'''
new_text = '''      // Import both text-only and quote-wrapped TEI incipits/explicits.
      var inc = directChild(item, "incipit");
      if (inc) {
        var il = directChild(inc, "locus");
        var iq = directChild(inc, "quote");
        setB(block, "mi-inc-from", attr(il, "from"));
        setB(block, "mi-inc-to", attr(il, "to"));
        setB(block, "mi-inc-quote", R.innerXml(iq || inc));
        setB(block, "mi-inc-lang", attr(iq || inc, "xml:lang"));
      }
      var exp = directChild(item, "explicit");
      if (exp) {
        var el2 = directChild(exp, "locus");
        var eq = directChild(exp, "quote");
        setB(block, "mi-exp-from", attr(el2, "from"));
        setB(block, "mi-exp-to", attr(el2, "to"));
        setB(block, "mi-exp-quote", R.innerXml(eq || exp));
        setB(block, "mi-exp-lang", attr(eq || exp, "xml:lang"));
      }'''
for before, after, label in ((old_locus, new_locus, 'locusGrp'), (old_text, new_text, 'incipit/explicit')):
    if before in s:
        if s.count(before) != 1:
            sys.exit(f'Ambiguous {label} match. No changes written.')
        s = s.replace(before, after)
    elif after in s:
        print(f'{label}: already patched')
    else:
        sys.exit(f'{label}: expected importer source not found. No changes written.')
path.write_text(s, encoding='utf-8')
print(f'Patched {path}. Review with: git diff -- {path}')
