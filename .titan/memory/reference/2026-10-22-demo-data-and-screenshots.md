---
name: 2026-10-22 Demo data and website screenshots
description: Fictitious demo data created in the "Óptica Javier Prueba" org to take screenshots for the Fullkod website, and how they were captured
metadata:
  type: reference
---

On 2026-10-22 the demo org "Óptica Javier Prueba" got fictitious data for the Fullkod website screenshots
(`Fullkod/fullkod-web/public/sites/lensspace-*`): 7 customers, 5 orders in different states plus 1 saved quote,
prescriptions and 5 production jobs; the old "Claudia Rodríguez Rodríguez" and "QA PILOTO" customers were renamed.
3 cash registers were left open; the Team screen still shows real names (not captured).

Captured with Playwright against `npx next dev --webpack -p 3103`, names and phones blurred. Team-level
notes on the method: hub `memoria/reference/capturas-de-proyectos.md`. Clean the demo data before using that org
for real QA.
