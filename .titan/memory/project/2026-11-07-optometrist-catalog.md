# Optometrist catalog and per-optometrist summary (LEN0008)

Date: 2026-11-07

Decision (product owner): optometrists are an organization catalog, not free text.

- `public.optometrists` per organization; unique by `normalized_name`
  (`private.normalize_person_name`: case, accents, extra spaces and a leading
  Dr./Dra./Lic. ignored). `prescription_revisions.optometrist_id` links each revision;
  `prescriber_name` stays as the recorded snapshot.
- The prescription form keeps a text field with suggestions (`OptometristInput`).
  A new name is added to the catalog by `create_prescription_revision` when the
  prescription is saved (owner and sellers); the field warns "Nuevo: se agregará…".
- The owner manages the catalog in Equipo → Optometristas: add, rename, merge
  duplicates (`create_optometrist`, `rename_optometrist`, `merge_optometrists`;
  SECURITY DEFINER with owner + can-operate checks). Merge repoints revisions and
  deletes the duplicate; it cannot be undone.
- Summary (`get_optometrist_summary`, owner + analytics module): a prescription counts
  once, for the optometrist of revision 1, on its prescription date; archived
  prescriptions excluded; orders count on their creation day (business timezone)
  for the optometrist of the revision they were made from. Idle optometrists show zeros.
