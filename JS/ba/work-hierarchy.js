// Work hierarchy for the Manuscript Editor's "Basic" contents mode.
//
// Each node: { id, label, children? }.
//   id     — numeric record id in manuscript-data/data/works ({id}.xml); the
//            exported ref is {BA.config.baseUri}/{entityPaths.work}/{id}.
//            A node WITHOUT id is a pure heading (shown, not selectable).
//   label  — the work's ba-headword; written as the <title> text on export.
//
// PROVISIONAL: grouped by the umbrella works 84–88 of the data repository.
// Replace with the hierarchy from the project's DOCX work list.

(function () {
  "use strict";
  window.BA.workHierarchy = [
    { id: "84", label: "Hebrew Bible/Old Testament", children: [
      { id: "1", label: "Genesis (Bereshit)" },
      { id: "2", label: "Exodus (Shemot)" },
      { id: "3", label: "Leviticus (Wayiqra)" },
      { id: "4", label: "Numbers (Bemidbar)" },
      { id: "5", label: "Deuteronomy (Devarim)" },
      { id: "6", label: "Joshua" },
      { id: "7", label: "Judges (Shofetim)" },
      { id: "8", label: "1 Samuel (Shmuel Aleph)" },
      { id: "9", label: "2 Samuel (Shmuel Bet)" },
      { id: "10", label: "1 Kings (Melakhim Aleph)" },
      { id: "11", label: "2 Kings (Melakhim Bet)" },
      { id: "12", label: "Isaiah" },
      { id: "13", label: "Jeremiah" },
      { id: "14", label: "Ezekiel" },
      { id: "15", label: "Hosea" },
      { id: "16", label: "Joel" },
      { id: "17", label: "Amos" },
      { id: "18", label: "Obadiah" },
      { id: "19", label: "Jonah" },
      { id: "21", label: "Micah" },
      { id: "22", label: "Nahum" },
      { id: "23", label: "Habakkuk" },
      { id: "24", label: "Zephaniah" },
      { id: "25", label: "Haggai" },
      { id: "26", label: "Zechariah" },
      { id: "27", label: "Malachi" },
      { id: "28", label: "Psalms (Tehillim)" },
      { id: "29", label: "Job" },
      { id: "30", label: "Proverbs (Mishlei)" },
      { id: "31", label: "Ruth" },
      { id: "32", label: "Song of Songs (Shir Hashirim)" },
      { id: "33", label: "Ecclesiastes (Qohelet)" },
      { id: "34", label: "Lamentations (Eikha)" },
      { id: "35", label: "Esther" },
      { id: "36", label: "Daniel" },
      { id: "37", label: "Ezra" },
      { id: "38", label: "Nehemiah" },
      { id: "39", label: "1 Chronicles (Divrei Hayamim Aleph)" },
      { id: "40", label: "2 Chronicles (Divrei Hayamim Bet)" }
    ] },
    { id: "85", label: "Deuterocanonical and Apocryphal Books", children: [
      { id: "41", label: "Tobit" },
      { id: "42", label: "Judith" },
      { id: "43", label: "1 Maccabees" },
      { id: "44", label: "2 Maccabees" },
      { id: "45", label: "3 Maccabees" },
      { id: "46", label: "4 Maccabees" },
      { id: "47", label: "1 Enoch" },
      { id: "48", label: "Jubilees" },
      { id: "49", label: "Psalm 151" },
      { id: "50", label: "Wisdom (of Solomon)Sirach/Ecclesiasticus" },
      { id: "51", label: "Baruch, incl. the Letter of Jeremiah" },
      { id: "52", label: "Additions to Daniel" },
      { id: "53", label: "Additions to Esther" },
      { id: "54", label: "Prayer of Manasseh" },
      { id: "55", label: "1/3 Esdras" },
      { id: "56", label: "2/4 Esdras" }
    ] },
    { id: "86", label: "New Testament", children: [
      { id: "57", label: "Matthew" },
      { id: "58", label: "Mark" },
      { id: "59", label: "Luke" },
      { id: "60", label: "John" },
      { id: "61", label: "Acts of the Apostles" },
      { id: "62", label: "Romans" },
      { id: "63", label: "1 Corinthians" },
      { id: "64", label: "2 Corinthians" },
      { id: "65", label: "Galatians" },
      { id: "66", label: "Ephesians" },
      { id: "67", label: "Philippians" },
      { id: "68", label: "Colossians" },
      { id: "69", label: "1 Thessalonians" },
      { id: "70", label: "2 Thessalonians" },
      { id: "71", label: "1 Timothy" },
      { id: "72", label: "2 Timothy" },
      { id: "73", label: "Titus" },
      { id: "74", label: "Philemon" },
      { id: "75", label: "Hebrews" },
      { id: "76", label: "James" },
      { id: "77", label: "1 Peter" },
      { id: "78", label: "2 Peter" },
      { id: "79", label: "1 John" },
      { id: "80", label: "2 John" },
      { id: "81", label: "3 John" },
      { id: "82", label: "Jude" },
      { id: "83", label: "Revelation" }
    ] },
    { id: "87", label: "Uncertain" },
    { id: "88", label: "Other" }
  ];
})();
