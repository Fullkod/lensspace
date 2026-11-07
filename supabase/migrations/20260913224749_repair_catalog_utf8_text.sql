-- Repair only the known base-catalog seed rows that were persisted with UTF-8
-- bytes interpreted as Latin-1. User-authored and already-correct text is untouched.
update public.catalog_items as item
set
  name = correction.name,
  description = correction.description
from (values
  ('near', 'Cerca', 'Espejuelo para visión cercana.'),
  ('distance', 'Lejos', 'Espejuelo para visión lejana.'),
  ('bifocal', 'Bifocal', 'Dos zonas de visión.'),
  ('progressive', 'Progresivo', 'Progresión continua de visión.'),
  ('cr39', 'CR-39 1.50', 'Material orgánico estándar.'),
  ('polycarbonate', 'Policarbonato 1.59', 'Ligero y resistente a impactos.'),
  ('high_index_167', 'Alto índice 1.67', 'Perfil reducido para graduaciones altas.'),
  ('anti_reflective', 'Antirreflejo', 'Tratamiento antirreflejo.'),
  ('blue_filter', 'Filtro azul', 'Filtro para luz azul.'),
  ('photochromic', 'Fotocromático', 'Oscurecimiento por radiación UV.'),
  ('hardened', 'Endurecido', 'Protección superficial.'),
  ('standard_mounting', 'Montaje', 'Montaje estándar de cristales.')
) as correction(code, name, description)
where item.organization_id is null
  and item.code = correction.code;

update public.graduation_rules
set
  name = 'Recargo por graduación alta',
  message = 'Por la graduación, considera alto índice 1.67. La recomendación es orientativa y puedes continuar.'
where organization_id is null
  and code = 'progressive_high_power';
