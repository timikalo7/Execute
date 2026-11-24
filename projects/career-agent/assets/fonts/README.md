# Vendored fonts

Two families, latin subset, variable weight axes. Vendored rather than fetched at render time so the
CV rendered on one machine is byte-for-byte the CV rendered on another — a font that resolves
differently on a different machine produces a different document, and you would not see the
difference until a recruiter did.

| File | Family | Role | Licence |
|---|---|---|---|
| `LibreFranklin-var.woff2` | Libre Franklin | name, section labels | SIL Open Font Licence 1.1 |
| `SourceSerif4-var.woff2` | Source Serif 4 | body | SIL Open Font Licence 1.1 |
| `SourceSerif4-Italic-var.woff2` | Source Serif 4 Italic | dates, notes | SIL Open Font Licence 1.1 |

Both families are OFL 1.1, which permits redistribution and embedding in a PDF. Downloaded from the
Google Fonts CDN (`fonts.gstatic.com`), latin subset only — 202 KB for all three.

Neither is Calibri, Arial or Times. That is deliberate: a CV set in the word-processor default reads
as a document nobody looked at.
