# LensSpace — Lógica de negocio

## Visión

LensSpace será un SaaS multiempresa para gestionar el ciclo completo de una
óptica, desde la recepción de una receta hasta la entrega de los espejuelos. El
mercado inicial es Cuba. Cada organización empieza con una sucursal y puede crear
más; ningún cliente SaaS puede acceder a los datos de otro.

## Actores

- **Dueño:** configura la organización y ve todas sus sucursales con filtros.
- **Vendedor:** registra clientes, recetas, cotizaciones, pedidos y pagos; también puede actualizar estados operativos.
- **Cristalero/laboratorio:** consulta trabajos asignados y actualiza los cristales.
- **Montador:** consulta montajes asignados y actualiza su progreso.
- **Cliente:** no requiere cuenta en el MVP; decide junto al vendedor y recibe WhatsApp.

Cada tercero tendrá una sola cuenta, aunque trabaje para varias ópticas. Esa cuenta
solo podrá ver los trabajos que cada organización le asigne. El vendedor también
podrá actualizar estados operativos en su nombre, quedando registrado quién hizo
realmente el cambio.

## Empresas y sucursales

- Todo dato operativo pertenece a una organización.
- Cada pedido pertenece exactamente a una sucursal.
- Vendedores e inventario varían por sucursal.
- La configuración comercial y los proveedores se comparten inicialmente dentro de la organización.
- El dueño consulta resultados consolidados o filtrados por sucursal.
- Supabase RLS debe garantizar el aislamiento multiempresa en la base de datos.
- El vendedor solo consulta sus propios pedidos, cobros y caja; no ve las ventas de
  otros vendedores de la misma sucursal, salvo que el dueño le dé el permiso especial.
- Todos los vendedores de una sucursal pueden buscar y reutilizar la ficha básica
  de sus clientes y las recetas necesarias, sin acceder a importes o pagos ajenos.
- El MVP no tendrá roles separados de administrador general o encargado de sucursal.

## Flujo principal

1. El vendedor busca o registra al cliente.
2. Registra la receta y puede adjuntar su imagen o PDF.
3. Selecciona tipo de espejuelo, cristal, tratamientos y armadura si ya fue escogida.
4. El sistema sugiere opciones y muestra advertencias basadas en la receta, pero la decisión final corresponde al vendedor y al cliente.
5. Se calcula una cotización desglosada y se puede enviar por WhatsApp.
6. El vendedor pulsa **Aceptar** cuando el cliente confirma; no hace falta firma.
7. La cotización se convierte en pedido, asociado al cliente, receta y sucursal, sin reintroducir datos.
8. Se registra uno o varios pagos en efectivo, incluido cualquier anticipo.
9. El trabajo de cristales se asigna y envía al proveedor.
10. El cristalero o el vendedor actualizan su progreso hasta que la óptica los recibe.
11. Si falta la armadura, el cliente la escoge y se asocia al pedido.
12. Cristales y armadura se asignan al montador, quien actualiza el trabajo.
13. La óptica recibe y revisa los espejuelos terminados.
14. El vendedor decide cuándo notificar al cliente por WhatsApp.
15. Al recogerlos, se cobra cualquier saldo y se cierra el pedido.

### Pedido familiar: varios pares, un solo pago (LEN0006, 2026-11-08)

- Un pedido puede tener de 1 a 10 **pares**. Quien encarga y paga es el **titular**
  (el cliente del pedido); cada par tiene su **paciente**, su receta, sus conceptos y
  su subtotal. Cada paciente es un cliente de la sucursal; «Nuevo familiar» solo pide
  el nombre y copia el teléfono del titular con WhatsApp desactivado.
- Un solo número de pedido, una sola tasa, un solo saldo y un solo registro de pagos:
  el anticipo (por ejemplo, la mitad) es un pago normal sobre todo el pedido.
- Precio por par: recargos por graduación según la receta de ese par; el mismo
  concepto puede repetirse en pares distintos. El total es la suma de los pares.
- Producción por par: cada par tiene a lo sumo un trabajo vigente de cristales y uno
  de montaje, con proveedores que pueden ser distintos por par («Todos los pares» o
  «Solo par N»). El taller ve «Par 2 de 3», la receta y los conceptos del par, nunca
  quién lo usa, precios ni pagos.
- «Avisar: listo para recoger» sigue siendo manual y avisa (sin bloquear) mientras
  falte algún par por recibir y revisar. La entrega es de todo el pedido junto.
- WhatsApp: un solo mensaje por evento, al titular, con «Pares: N» y sin nombres de
  pacientes. Los pedidos de un par se ven y notifican igual que antes.
- La ficha de un familiar muestra los pedidos donde lleva un par. El resumen por
  optometrista cuenta los pedidos a través de la receta de cada par.

### Venta a ópticas minoristas (LEN0009 + LEN0010, 2026-11-08)

La organización también puede trabajar como proveedora de otras ópticas («ópticas
minoristas»). Esas ópticas no tienen usuario en LensSpace: el personal de la
organización registra sus pedidos.

- **Ficha de la óptica:** nombre, persona de contacto, teléfono, correo, dirección,
  condiciones de pago (texto y días de crédito opcionales) y notas. Pertenece a la
  organización (se comparte entre sucursales). Solo el dueño la crea, la edita o la
  archiva; archivarla no borra su historial.
- **Precios propios:** cada óptica puede tener un descuento general (%) sobre el
  precio de catálogo y precios fijos para artículos concretos; el precio fijo gana.
  Los recargos por graduación también llevan el descuento. Estos precios no cambian
  el catálogo ni los precios de otras ópticas o de la venta al detalle. Solo el
  dueño los ve y los cambia.
- **Pacientes:** cada trabajo es para un paciente de la óptica minorista, con su
  receta. Se guardan como clientes ligados a esa óptica (teléfono de la óptica,
  WhatsApp desactivado) y no aparecen en la lista de clientes de la sucursal.
- **Pedido comercial:** se abre para una óptica, en una sucursal, y acumula trabajos
  con receta durante varios días (hasta 200). Cada trabajo se valora con los precios
  de la óptica y queda fijo al agregarlo, con quién lo agregó y cuándo. Un trabajo
  puede quitarse, con motivo, solo mientras el pedido esté abierto y sin producción.
- **Estados del pedido comercial:** abierto → cerrado (se manda a fabricar) → listo
  para recoger → entregado → terminado (entregado y pagado). Solo el dueño cierra y
  reabre (con motivo); un pedido cerrado no admite cambios sin reabrirlo. Reabrir no
  toca los trabajos que ya están en producción.
- **Permiso especial:** como excepción, el dueño puede autorizar a un vendedor para
  ver todos los pedidos de su sucursal (ventas normales y comerciales, con lo pagado y el saldo), avisar por WhatsApp, gestionar la producción y entregar, cambiar el estado de los comerciales (incluido
  cerrar y reabrir) y cobrar. Sin ese permiso, cada vendedor solo ve los suyos. Las
  fichas y los precios siguen siendo solo del dueño; lo que cobra entra en su caja y no ve las cotizaciones ni las cajas de otros vendedores.
- **Entrega:** todo el pedido o trabajo por trabajo, quedando registrado quién
  entrega cada uno. Se puede entregar con saldo pendiente (a crédito).
- **Cobro:** se registra una vez, en la caja de quien cobra, y se reparte entre uno o
  varios pedidos de la óptica (primero los más antiguos, ajustable). La deuda de cada
  óptica es la suma de los saldos de sus pedidos, en USD a la tasa de cada pedido.
- **WhatsApp:** los pedidos comerciales no envían mensajes en esta versión.

## Receta

Debe admitir esfera, cilindro y eje por ojo; adición; distancia pupilar conjunta o
por ojo; altura; prisma y base; fecha; médico u optometrista; archivo original y
observaciones. El original se preserva y toda corrección registra autor, fecha,
valor anterior y nuevo.

Las recomendaciones son orientativas y configurables. Pueden advertir sobre una
selección, pero no tomar decisiones clínicas ni bloquear al vendedor autorizado.

## Clientes

El cliente tendrá nombre, uno o varios teléfonos, dirección opcional, fecha de
nacimiento opcional, notas y consentimiento para mensajes. El carné de identidad
u otro identificador será opcional. El teléfono facilita la búsqueda y WhatsApp,
pero no será único porque varias personas pueden compartirlo. El sistema advertirá
de posibles duplicados antes de crear un cliente.

## Catálogo y precios

El cálculo puede combinar montaje, armadura, tipo (cerca, lejos, bifocal o
progresivo), material del cristal, tratamientos y efectos. Hay precios base,
combinaciones que modifican o sustituyen precios y variaciones según graduación.

El producto incluirá un catálogo inicial de tipos, reglas y bandas de graduación.
Cada óptica podrá ajustar ese catálogo, sus precios, compatibilidades y recargos.
El catálogo separará costo interno, precio de venta y reglas. El precio aceptado
se copia al pedido como instantánea.

Cada elemento del catálogo conserva su propia moneda: algunos precios pueden estar
en CUP y otros en USD. Las combinaciones que solo se cobran en USD permanecen en
USD, salvo que el vendedor acepte CUP y aplique la tasa fijada para esa venta. Los
cálculos deben partir siempre de los importes y monedas definidos en el catálogo,
sin convertirlos silenciosamente a una única moneda global.

No se guardarán versiones completas de cotización. Las modificaciones posteriores
a la aceptación sí quedan en el historial. Si cambia el total, el vendedor debe
registrar una nueva confirmación del cliente. Tras enviar el trabajo al proveedor
de cristales, los datos productivos y comerciales quedan bloqueados en el flujo
normal.

## Monedas, pagos y caja

- Monedas iniciales: CUP y USD; cada organización podrá habilitar otras.
- Forma de pago inicial: efectivo.
- Un pedido admite múltiples pagos y mantiene su saldo pendiente.
- Cada venta conserva su propia tasa de cambio como una instantánea histórica.
- El vendedor define esa tasa al confirmar la venta, porque
  las tasas son variables y una tasa global posterior no debe alterar el pedido.
- Un pedido puede recibir pagos mezclados en CUP y USD. Cada pago conserva importe,
  moneda, tasa aplicada, equivalencia para el saldo, vendedor y caja receptora.
- La organización puede configurar un anticipo recomendado o mínimo.
- El vendedor puede omitirlo sin autorización especial, quedando la excepción registrada.
- Cada vendedor tiene una caja propia.
- El cierre de caja es diario, por vendedor, sucursal y moneda; el dueño puede ver
  resultados consolidados.
- Cerrar la caja no impide que el vendedor reciba cobros posteriores.
- Los cobros posteriores quedan marcados como posteriores al cierre. El vendedor
  genera un cierre complementario sin modificar el cierre anterior; el resumen
  diario consolida el cierre principal y todos sus complementarios.
- Reembolsos, cancelaciones, recibos y facturas quedan fuera del MVP.

## Estados

El pedido tendrá dimensiones independientes:

- **Comercial:** borrador, cotizado, esperando aceptación, aceptado, entregado, cerrado.
- **Pago:** sin pago, parcial, pagado.
- **Cristales:** pendiente, listo para enviar, enviado, en fabricación, terminado, recibido, incidencia.
- **Armadura:** pendiente de selección, seleccionada, disponible.
- **Montaje:** pendiente, listo para enviar, enviado, en montaje, terminado, recibido, revisado, incidencia.
- **Entrega:** no listo, listo para recoger, cliente notificado, entregado.

La interfaz podrá derivar un estado general. Cada transición registra fecha, actor,
notas y origen. Deben contemplarse cristales defectuosos, errores de receta,
roturas, repetición del trabajo y otras incidencias.

No se permite marcar un pedido como entregado mientras conserve saldo pendiente.
La única excepción son los pedidos comerciales a ópticas minoristas, que pueden
entregarse a crédito (ver «Venta a ópticas minoristas»).

Después de enviar el trabajo al cristalero, una corrección requiere abrir una
incidencia. Se conserva el trabajo original y se crea una corrección o repetición
vinculada, indicando si el costo corresponde a la óptica, cristalero, montador o
cliente. Solo se pide nueva confirmación comercial si cambia el total del cliente.

## Historial

Cada pedido conserva una cronología de creación y aceptación; cambios de receta,
configuración y precio; confirmaciones; asignaciones; estados; pagos y excepciones;
archivos; notas; mensajes y resultados; incidencias y repeticiones. Siempre se
identifica al usuario que ejecutó la acción, incluso si actualizó en nombre de un tercero.

## Asignación de proveedores

Cada **par** del pedido tiene como máximo un cristalero y un montador activos. En un
pedido de un par esto equivale a la regla original; en un pedido familiar cada par
puede ir a un proveedor distinto (decisión del 2026-11-08). Las repeticiones por incidencia permanecen
vinculadas al trabajo original y pueden reasignarse.

## Numeración de pedidos

Todos los pedidos usan el formato `ORG-AÑO-CONSECUTIVO`, por ejemplo
`VIS-2026-000123`. `ORG` se genera para cada organización con las primeras tres
letras normalizadas de su nombre. El dueño puede cambiarlo antes de crear el primer
pedido; después queda fijo aunque cambie el nombre de la organización. El
consecutivo es independiente por organización y año. Además, cada pedido conserva
un identificador interno global no visible.

## Panel del dueño

El panel consolidado, con filtros por sucursal, vendedor y período, mostrará:

- Pedidos por estado e incidencias.
- Ventas y cobros por vendedor y sucursal.
- Saldos pendientes.
- Trabajos por cristalero y montador.
- Tiempo promedio desde aceptación hasta entrega.
- Diferencias de caja.
- Productos, tratamientos y tipos de lentes más vendidos.

El MVP no incluirá fechas prometidas, estimaciones de producción, prioridades,
urgencias ni indicadores de atraso.

## Administración del SaaS

- El alta inicial no será autoservicio: el superadministrador crea la organización
  y su primera cuenta de dueño.
- La autenticación de dueños, vendedores y proveedores usa correo y contraseña.
- El dueño crea o invita a sus vendedores y vincula a sus proveedores externos.
- El propietario de LensSpace será el superadministrador de la plataforma.
- El superadministrador puede crear, activar, suspender y consultar organizaciones;
  mantener el catálogo base; consultar uso y estado técnico; y prestar soporte.
- El acceso asistido a una organización debe quedar auditado con identidad, fecha,
  motivo y acciones realizadas.
- El superadministrador no es un rol operativo de ninguna óptica y no debe aparecer
  como vendedor ni propietario de sus datos comerciales.

## Suscripciones

El MVP gestionará suscripciones manualmente, sin pasarela de pago. Cada organización
tendrá fecha de inicio, fecha de vencimiento y uno de estos estados:

- **En preparación:** óptica creada sin prueba, mientras se prepara y firma el
  contrato. Solo lectura y sin avisos de cobro hasta el primer pago (decisión del
  2026-10-11). Nunca se vuelve a este estado.
- **Prueba:** acceso temporal de evaluación.
- **Activa:** operación normal.
- **Vencida:** acceso de solo lectura; no permite nuevas operaciones.
- **Suspendida:** toda operación bloqueada para los usuarios de la óptica; los
  datos quedan en solo lectura (decisión del 2026-10-02).

El superadministrador registra renovaciones y cambios de estado. Los datos siguen
perteneciendo a la organización aunque su suscripción venza o sea suspendida.

Estados de la organización (decisión del 2026-10-11):

- **Activa:** opera según su suscripción.
- **Suspendida:** solo lectura.
- **Archivada:** nadie de la óptica puede entrar; los datos se conservan y la
  organización se puede restaurar con los accesos que tenía.
- **Eliminar** solo es posible si la organización nunca tuvo actividad (clientes,
  cotizaciones, pedidos, cobros, cajas, producción, mensajes, contrato firmado o
  referidos). Con historial se archiva: pedidos y cobros son registros contables.
  La cuenta del dueño no se borra.

El manual tiene una «Guía de la plataforma» que solo ve el superadministrador, con el
alta de ópticas, precios, contratos, cobros, sucursales y estados.

Habrá un solo tipo de plan contractual, pero será configurable por organización.
El panel administrativo registrará como mínimo:

- Monto pactado de la suscripción y su moneda.
- Periodicidad, fecha de inicio, vencimiento y fecha de última renovación.
- Estado actual.
- Módulos habilitados.
- Notas administrativas del acuerdo.

### Precios y contratos de licencia (decisión del 2026-10-10)

| Plan o módulo | USD al mes |
|---------------|-----------|
| Básico: Núcleo + Ventas ópticas + WhatsApp | 10 |
| + Caja / + Producción / + Analítica | 3 / 5 / 3 |
| + Multisucursal | 5 por sucursal adicional |
| Completo (una sucursal) | 19 |
| Socio fundador (Completo) | 15 durante 24 meses; después, precio de lista |

- Pago mensual, trimestral, semestral o anual; el anual cobra 10 meses por 12.
- Cada contrato se prepara en el panel, se descarga como proforma con la marca
  LensSpace y se sube firmado. El contrato firmado guarda una copia del precio,
  la vigencia y los módulos; cambiar la lista de precios no lo altera.
- Recomendaciones: cuando una óptica referida paga su primer periodo, la óptica
  que la recomendó suma 15 días a su vencimiento si tiene vigente el precio de
  socio fundador, y 10 días en los demás casos. Una sola vez por óptica referida.
- Los datos del proveedor que salen en el contrato se editan en el panel.

Prueba y pago (decisión del 2026-10-11):

- La prueba es gratis (importe 0) y solo se da al crear la organización, cuando se
  decide: 15 días o 1 mes. Después la óptica paga o se va: nunca vuelve a prueba, y
  una óptica que entró pagando no puede tener prueba. Mientras dura la prueba
  original se puede corregir su fecha de fin. Una óptica dada de alta sin prueba
  queda «En preparación» (solo lectura) hasta su primer pago, que cuenta desde ese día.
- Margen de pago (decisión del 2026-10-11, se paga en efectivo o Zelle): al vencer
  la prueba o el periodo pagado, la óptica sigue operando 5 días; el sexto queda en
  solo lectura hasta que se registra un pago. Los días de margen nunca se regalan:
  el nuevo periodo empieza el día siguiente al vencimiento o, si ya estaba
  bloqueada, 5 días antes del pago (se cobran los días de margen usados, no los días
  bloqueada). Fórmula: inicio = max(vencimiento + 1, hoy − 5). Pagar durante la prueba
  o con tiempo pagado no hace perder días.
- Avisos (WhatsApp diario a las 10:00 de Cuba + aviso web una vez al día): al dueño
  desde 2 días antes del vencimiento hasta el último día de margen, con el teléfono
  del administrador; al administrador el día del vencimiento, con los datos del
  dueño; y a ambos el día del bloqueo.
- «Registrar pago» exige el contrato firmado: cobra el importe del periodo según el
  contrato (el precio de socio fundador pasa al de lista al terminar sus 24 meses),
  activa la suscripción y extiende el vencimiento un periodo desde hoy o desde el
  fin del periodo pagado en curso.

La prueba dura 15 días por defecto, aunque el superadministrador puede ajustar su
duración. Al vencer, la organización pasa a solo lectura. La suspensión no será
automática: la decide el superadministrador. Una renovación válida restablece el
acceso operativo inmediatamente.

## Arquitectura modular y habilitaciones

- Toda capacidad funcional se agrupa en módulos identificables.
- Al crear o renegociar una organización, el superadministrador habilita los
  módulos pactados y ajusta el monto de la suscripción.
- La autorización de cada operación se valida en servidor; ocultar una opción del
  menú no sustituye la protección de datos y acciones.
- Las habilitaciones tienen fecha, autor e historial de cambios.
- Los módulos pueden declarar dependencias para impedir combinaciones inválidas.
- Desactivar un módulo bloquea nuevas operaciones, oculta sus acciones a los
  vendedores y conserva la información anterior en modo lectura para el dueño.
- Reactivar un módulo recupera su operación y datos sin reconstrucciones.
- Las funcionalidades futuras, como inventario o garantías, podrán añadirse como
  módulos sin rediseñar la suscripción.

La matriz confirmada es:

1. **Núcleo obligatorio:** organización, usuarios, seguridad, una sucursal,
   auditoría y suscripción.
2. **Ventas ópticas:** clientes, recetas, catálogo, reglas de graduación,
   cotizaciones, pedidos, pagos y saldos.
3. **Caja:** cajas individuales, cierres principales y complementarios,
   diferencias y consolidación.
4. **Producción y proveedores:** cristaleros, montadores, asignaciones, estados,
   incidencias, repeticiones y acceso externo.
5. **WhatsApp:** plantillas, envío manual, historial e integración con OpenWA.
6. **Analítica:** indicadores de ventas, cobros, saldos, operación y productos.
7. **Multisucursal:** sucursales adicionales, usuarios por sucursal y vistas
   consolidadas.
8. **Futuros:** inventario completo, garantías/posventa, facturación y nuevos
   métodos de pago.

Caja y Producción dependen de Ventas ópticas; WhatsApp depende de Ventas ópticas;
Multisucursal amplía el Núcleo. Si se desactiva Multisucursal, se escoge una
sucursal activa y las restantes quedan en modo lectura.

Decisiones del 2026-10-10: solo el superadministrador crea, edita, activa o
desactiva sucursales, hasta el número que permite el contrato firmado (1 incluida
más las sucursales extra). Cada óptica tiene una sucursal principal, que sigue
operando sin Multisucursal. Un vendedor trabaja en una sola sucursal, los clientes
son por sucursal y la numeración de pedidos es única por óptica. Una sucursal no se
desactiva con pedidos sin entregar, cobros sin cerrar en caja o vendedores asignados.

## Conservación y eliminación

- Clientes, recetas, pedidos, pagos, cierres e historial no se eliminan físicamente.
- Cuando corresponda se archivan, desactivan o anulan, preservando trazabilidad.
- Los artículos y reglas del catálogo se desactivan; si fueron usados, sus
  referencias e instantáneas históricas permanecen.
- Solo el superadministrador puede ejecutar una eliminación definitiva por una
  necesidad excepcional y mediante un procedimiento futuro explícito y auditado.

## WhatsApp

- El vendedor decide cuándo enviar cada mensaje.
- Habrá plantillas por estado y botones desde el pedido.
- Se registra contenido, destinatario, fecha, actor y resultado del intento.
- La integración futura usará el servicio OpenWA del propietario en una VPS.
- La mensajería se aislará detrás de una interfaz para no acoplar los pedidos a OpenWA.
- Credenciales y detalles privados nunca se guardarán en la documentación.
- El saldo pendiente de los mensajes («Pago recibido», «Tu pedido está listo») se
  dice siempre en USD, a la tasa congelada de la venta y redondeado al centavo hacia
  arriba (decisión del 2026-11-08).
- En la app todo importe de pedido (saldo, total, cobrado, KPIs y analítica del dueño)
  se muestra en USD, convirtiendo cada pedido a su propia tasa, y el formulario de
  pago propone USD. La base no cambia: precios de catálogo, cada pago y la caja
  conservan su moneda, y el saldo se sigue llevando en CUP equivalentes a la tasa
  congelada de la venta (decisión del 2026-11-08).

## Armaduras e inventario

En el MVP se asocia al pedido una armadura con descripción y precio. Para una fase
posterior queda el catálogo completo con marca, modelo, color, talla, SKU, fotos,
costo, precio, existencias por sucursal, reservas y armaduras del cliente.

## Fuera del MVP

- Inventario completo de armaduras.
- Garantías, devoluciones y servicio posventa.
- Reembolsos y cancelaciones formales.
- Recibos y facturas fiscales.
- Firma o cuenta del cliente.
- Diagnóstico clínico automatizado.
- Formas de pago distintas al efectivo.

## Requisitos no funcionales

- Next.js, Supabase y Vercel.
- RLS multiempresa y archivos privados.
- Fechas con zona horaria de la organización.
- Acciones sensibles auditables e historial no editable desde la UI.
- Habilitaciones de módulos aplicadas tanto en la interfaz como en el servidor.
- Secretos exclusivamente en variables de entorno.

## Éxito del MVP

Una óptica puede procesar un pedido real desde la receta hasta la entrega, conocer
su estado sin depender de mensajes dispersos, registrar pagos y responsables, y
enviar manualmente las notificaciones pertinentes por WhatsApp.

## Secuencia

1. Diseñar el esquema multiempresa, RLS, auditoría y suscripciones.
2. Implementar autenticación, alta administrada, organizaciones, sucursales y roles.
3. Implementar clientes, recetas, catálogo y motor de precios.
4. Implementar cotización, pedido, pagos y cierre de caja.
5. Implementar trabajos de cristales y montaje.
6. Implementar historial, paneles y notificaciones desacopladas.
7. Implementar el panel del superadministrador.
8. Integrar OpenWA cuando se proporcionen sus detalles.
9. Validar el flujo completo con una óptica piloto en Cuba.
