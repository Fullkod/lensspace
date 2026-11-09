# Client guide PDF (single guide, Kshop format)

Date: 2026-11-09

Source: Roberto asked for guides like the Kshop ones (`_materiales/kshop/guias`), but only one,
because the web and the future APK offer the same options.

- Location, outside this repo: `C:\Local-Disc-D\Project\Fullkod\_materiales\LensSpace\guias\`.
  PDF: `lensspace-guia.pdf` (A4, 20 pages). Source in `_fuente/`: `guia.html`, `estilo.css`.
- Rebuild from `_fuente/`: `node recortar.cjs` (screenshots) and `node build.cjs` (PDF, warns on
  page overflow). Both use Playwright from this repo.
- It complements `/manual`; it does not replace it. Plain Cuban Spanish rules apply
  (`feedback/2026-10-04-plain-language-end-user-docs.md`).
- Button labels were checked against the code on 2026-11-09. Update the guide when labels change.
- When the APK ships, change «Pon LensSpace en tu teléfono» (page 2), which describes «Instalar app».
- Screenshots are crops of `public/manual/` and `.titan/qa/` (test data only). The QA organizations
  no longer exist, so retaking them needs a test login.
- Support number on the last page: +1 575 263 9686 (Roberto's decision, 2026-11-09).
- The web address in client documents is `lensspace.fullkod.com`.
