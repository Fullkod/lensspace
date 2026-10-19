import type { DocSection } from './types'

// Platform guide: only the superadmin reads it (how LensSpace itself is run). Fixed
// copy because it documents the admin panel exactly as built; keep it in sync with
// src/features/admin and BUSINESS_LOGIC.md (pricing, trial, contracts, branches).
// Markup (see docBlocks.ts): **bold**, «UI label» and `> Ojo:` / `> Nota:` / `> Ejemplo:` notes.

const bullets = (items: string[]) => items.map((item) => `- ${item}`).join('\n')
const steps = (items: string[]) => items.map((item, index) => `${index + 1}. ${item}`).join('\n')

export function platformGuideSections(appUrl: string): DocSection[] {
  return [
    { id: 'overview', title: 'Para empezar', type: 'overview', content: `# Cómo se administra LensSpace

Esta guía es solo para ti, el administrador de la plataforma. Los dueños de las ópticas no la ven.

Todo se hace en ${appUrl}/organizations («Organizaciones» en el menú). Cada óptica es una organización con sus datos separados de las demás.

## La vida de una óptica

${steps([
  'La das de alta, con o sin prueba gratis.',
  'Preparas su contrato, descargas la proforma, la firman y subes la copia firmada.',
  'Registras su pago: la suscripción queda activa hasta el fin del periodo pagado.',
  'Cada vez que paga, vuelves a registrar el pago y el vencimiento se corre un periodo.',
  'Si deja de pagar, al vencer queda en solo lectura. Si se va del todo, la archivas (o la eliminas si nunca la usó).',
])}

## Dónde está cada cosa

Toca una óptica en la lista para abrir su detalle. Ahí están, de arriba abajo: Suscripción, Operación y ajustes manuales, Contrato de licencia, Sucursales y Eliminar organización. A la derecha: Asistencia, Acceso del propietario e Historial.` },

    { id: 'workflow-alta', title: 'Dar de alta una óptica', type: 'workflow', content: `# Dar de alta una óptica

${steps([
  'En Organizaciones, toca «Nueva organización».',
  'Llena los datos (abajo se explica cada uno).',
  'Toca «Crear organización». El dueño ya puede entrar con su correo y la contraseña inicial que le diste.',
  'Mándale al dueño su correo y contraseña por un medio seguro y pídele que la cambie en «Mi perfil».',
])}

## Organización y primera sucursal

${bullets([
  '**Nombre de la óptica:** como la conoce la gente. Sale en los mensajes de WhatsApp.',
  '**Prefijo de pedidos:** 3 a 8 letras o números. Los pedidos salen como JAV-2026-000001. Se sugiere solo desde el nombre; el dueño lo puede cambiar antes de su primer pedido.',
  '**Nombre y código de la sucursal:** la primera sucursal (normalmente «Principal», código MAIN). Es la sucursal principal.',
  '**Zona horaria:** deja America/Havana salvo que la óptica esté en otro país.',
])}

## Propietario

${bullets([
  '**Nombre y correo del dueño:** con ese correo entra. Si el correo ya tiene cuenta en LensSpace, el alta falla: usa otro.',
  '**Contraseña inicial:** mínimo 10 caracteres.',
])}

## Suscripción: período de prueba

${bullets([
  '**15 días o 1 mes de prueba gratis:** la óptica trabaja sin pagar hasta esa fecha.',
  '**Sin prueba:** la óptica queda «En preparación» (solo lectura, sin avisos de cobro) mientras preparas y firmas el contrato. Empieza a trabajar cuando registres su primer pago, y el periodo cuenta desde ese día.',
])}

> Ojo: La prueba solo se da aquí, al crear la óptica. Después nunca se puede volver a dar.

## Módulos

${bullets([
  '**El Núcleo siempre está** (usuarios, seguridad, una sucursal, auditoría).',
  '**Ventas ópticas:** clientes, recetas, catálogo, cotizaciones, pedidos y cobros. Casi siempre hace falta.',
  '**Caja, Producción y WhatsApp** necesitan Ventas ópticas: se activan juntos.',
  '**Analítica:** indicadores para el dueño.',
  '**Multisucursal:** permite tener más sucursales (ver «Sucursales»).',
  'Activa los que vaya a pagar. Puedes cambiarlos después en «Operación y ajustes manuales».',
])}` },

    { id: 'module-precios', title: 'Precios y planes', type: 'module', content: `# Precios y planes

Precios acordados el 10 de octubre de 2026, en USD al mes:

${bullets([
  '**Básico:** 10 (Núcleo + Ventas ópticas + WhatsApp).',
  '**Caja:** +3. **Producción y proveedores:** +5. **Analítica:** +3.',
  '**Multisucursal:** +5 por cada sucursal adicional.',
  '**Completo (una sucursal):** 19.',
  '**Socio fundador:** el Completo a 15 durante 24 meses; después paga el precio de lista.',
  '**Pago anual:** paga 10 meses y recibe 12. También hay trimestral y semestral.',
])}

> Nota: El contrato guarda una copia del precio: si cambias la lista más adelante, los contratos firmados no cambian.` },

    { id: 'workflow-contrato', title: 'Contrato de licencia', type: 'workflow', content: `# Contrato de licencia

## Antes del primer contrato

En Organizaciones toca «Datos del proveedor» y llena tus datos (nombre o negocio, carné o NIT, dirección, teléfono, correo y cómo te pagan). Salen en todas las proformas. Si cambian, los actualizas ahí.

## Preparar y firmar

${steps([
  'Abre la óptica y, en «Contrato de licencia», toca «Preparar contrato».',
  'Escoge el plan (Básico, Completo, Socio fundador o Personalizado), las sucursales extra y la forma de pago. El precio se calcula solo; lo puedes cambiar.',
  'Pon la fecha de inicio, la duración y los datos legales de la óptica. Si la recomendó otra óptica, escógela en «Referida por».',
  'Toca «Crear borrador» y luego «Descargar proforma»: se abre el contrato con la marca LensSpace. Guárdalo como PDF desde la ventana de imprimir.',
  'Cuando lo firmen, toca «Subir contrato firmado» y escoge el PDF o la foto (hasta 10 MB).',
])}

El contrato firmado queda guardado en privado: solo tú lo ves («Ver firmado»). Si se firma uno nuevo, el anterior queda como «Reemplazado».

## Cambiar o anular

${bullets([
  '**Un borrador** se puede editar o descartar.',
  '**Un contrato firmado no se edita:** para cambiar algo, prepara uno nuevo y súbelo firmado.',
  '«Anular» termina el contrato firmado (pide motivo). Con eso no se puede registrar pago hasta que haya otro firmado.',
])}

## Socio fundador

El contrato dice el precio fijo, desde y hasta qué fecha (24 meses), y cuánto paga después. Al registrar un pago pasada esa fecha, el sistema cobra solo el precio nuevo.

## Recomendaciones

Cuando una óptica referida ya pagó su primer periodo, en la óptica que la recomendó aparece «Aplicar crédito». Suma a su vencimiento 15 días si tiene vigente el precio de socio fundador, y 10 días en los demás casos. Una sola vez por cada óptica referida.` },

    { id: 'workflow-cobro', title: 'Cobrar la licencia', type: 'workflow', content: `# Cobrar la licencia

${steps([
  'Cobra a la óptica como hayan acordado (efectivo, transferencia…).',
  'Abre la óptica y, en «Suscripción», toca «Registrar pago».',
  'Revisa lo que se cobra y qué fechas cubre. Escribe una nota si quieres (por ejemplo, la referencia de la transferencia).',
  'Toca «Confirmar». La suscripción queda activa hasta la fecha que viste.',
])}

## Reglas

${bullets([
  '**Sin contrato firmado no se puede registrar pago:** el importe sale del contrato.',
  'Si todavía tiene tiempo pagado o de prueba, el nuevo periodo empieza cuando termina el actual (**no pierde días**).',
  'El primer pago de una óptica «En preparación» empieza **el día del pago**.',
  'El periodo cubre **1 mes** (mensual), **3** (trimestral), **6** (semestral) o **12 meses** (anual, cobrando 10).',
  '**Hay 5 días de margen para pagar:** la óptica sigue trabajando hasta 5 días después del vencimiento. El sexto día queda en solo lectura (ve sus datos pero no puede vender ni cobrar). Al registrar el pago vuelve a trabajar enseguida.',
  '**Los días de margen nunca se regalan.** Si paga dentro del margen, el nuevo periodo empieza el día siguiente al vencimiento.',
  'Si paga ya bloqueada, el periodo empieza **5 días antes del pago**: se cobran los 5 días de margen que usó, pero no los días que estuvo bloqueada.',
])}

> Ejemplo: Vencía el 5 y paga el 20 → el periodo empieza el 15.

## Avisos automáticos por WhatsApp

Cada día a las 10:00 (hora de Cuba; 9:00 en invierno) el sistema manda estos avisos. Vale igual para la prueba y para la suscripción. Ejemplo con vencimiento el día 5:

${bullets([
  '**Días 3 y 4:** al dueño, que debe pagar y con tu teléfono para contactarte.',
  '**Día 5 (vence):** al dueño, y a ti con el nombre, teléfono y correo del dueño.',
  '**Días 6 al 10 (margen):** al dueño, cada día, con cuántos días le quedan y la fecha de bloqueo.',
  '**Día 11:** la óptica queda en solo lectura y se avisa al dueño y a ti.',
])}

En la web, el dueño ve el mismo aviso arriba del panel una vez al día (si lo cierra, vuelve al día siguiente).

> Nota: Para que lleguen, tu teléfono va en «Datos del proveedor» y el del dueño en su perfil (si no lo tiene, se usa el del contrato firmado). En el detalle de la óptica, «Avisos de WhatsApp enviados» muestra cada aviso y si salió.

## La prueba gratis

${bullets([
  'Solo existe si la diste al crear la óptica, y **siempre es gratis**.',
  'Mientras dure y la óptica no haya pagado, puedes corregir su fecha de fin en «Operación y ajustes manuales».',
  'Cuando paga por primera vez, la prueba termina para siempre: **nunca vuelve a prueba**.',
])}` },

    { id: 'workflow-sucursales', title: 'Sucursales', type: 'workflow', content: `# Sucursales

> Nota: Solo tú creas y cambias sucursales. El dueño no puede.

${steps([
  'Activa el módulo Multisucursal en «Operación y ajustes manuales».',
  'Asegúrate de que el contrato firmado tenga las sucursales extra que va a usar.',
  'En «Sucursales», toca «Nueva sucursal», pon nombre, código y motivo.',
  'El dueño asigna a sus vendedores a la sucursal nueva desde su sección Equipo.',
])}

## Reglas

${bullets([
  '**Sucursales activas permitidas = 1 + las sucursales extra** del contrato firmado. Las de un borrador no cuentan hasta que subas el firmado.',
  '**La sucursal principal** es la que sigue trabajando si se apaga Multisucursal; las demás quedan en solo lectura.',
  '«Hacer principal» cambia cuál es la principal.',
  'Una sucursal **no se puede desactivar** si tiene pedidos sin entregar, cobros sin cerrar en caja o vendedores asignados. Sus datos nunca se borran.',
  'Cada vendedor trabaja en una sola sucursal, los clientes son de cada sucursal y la numeración de pedidos es una sola por óptica.',
])}` },

    { id: 'policy-estados', title: 'Suspender, archivar o eliminar', type: 'policy', content: `# Suspender, archivar o eliminar una óptica

El estado de la óptica se cambia en «Operación y ajustes manuales» (con motivo).

${bullets([
  '**Activa:** trabaja normal (si su suscripción está al día).',
  '**Suspendida:** solo lectura. Úsalo para un problema temporal (por ejemplo, un pago en disputa).',
  '**Archivada:** nadie de la óptica puede entrar. Los datos se guardan. Úsalo cuando la óptica deja LensSpace. Si vuelve, ponla otra vez como Activa: todos recuperan su acceso como lo tenían.',
])}

## Eliminar

Al final del detalle de la óptica está «Eliminar organización». Solo funciona si la óptica **nunca tuvo actividad**: sin clientes, pedidos, cobros, mensajes ni contrato firmado. Sirve para una óptica creada por error o que se fue durante la prueba sin usarla.

${steps([
  'Toca «Eliminar organización».',
  'Escribe el nombre exacto de la óptica y el motivo.',
  'Toca «Eliminar definitivamente».',
])}

> Ojo: Eliminar no se puede deshacer.

La cuenta del dueño no se borra (puede estar en otra óptica). Si una óptica tiene historial, archívala: los pedidos y cobros son registros contables y no se borran.` },

    { id: 'module-asistencia', title: 'Asistencia y acceso', type: 'module', content: `# Asistencia y acceso

${bullets([
  '**Asistencia auditada:** para ver los datos de una óptica y ayudarla, inicia una sesión de asistencia con motivo y duración (máximo 2 horas). Queda registrada. Sin esa sesión no ves sus datos operativos.',
  '**Acceso del propietario:** si el dueño olvidó su contraseña, toca «Enviar enlace de restablecimiento» y le llega un correo para crear una nueva.',
  '**Historial:** cada cambio de contrato, pago, sucursal, módulo o estado queda anotado con fecha y motivo.',
  '**Manual:** en el Manual eres el único que edita el contenido de las guías del equipo y del dueño. Esta guía de plataforma no se edita desde ahí.',
])}` },

    { id: 'module-actividad', title: 'Uso y actividad', type: 'module', content: `# Uso y actividad

Sirve para saber si las ópticas usan LensSpace de verdad y qué partes usan más. Solo muestra cifras: nunca nombres de clientes, recetas ni pedidos.

${bullets([
  '**Uso del producto** (en el Panel principal): toda la plataforma junta. Al lado de cada función dice cuántas ópticas la usaron. Si una función casi nadie la usa, ahí hay algo que mejorar o explicar.',
  '**Actividad de una óptica** (en Organizaciones, al abrir su detalle): días con actividad, pedidos, cobrado por moneda, qué partes del flujo usa y una barra por semana con los pedidos de las últimas 8 semanas.',
  '**Equipo y último acceso:** el nombre de cada miembro, su rol y el último día que entró. No dice qué hizo.',
  '**Períodos:** 7 días, 30 días, 90 días o Siempre.',
])}

## Encontrar las ópticas que dejaron de usarlo

${steps([
  'En Organizaciones, abre los filtros.',
  'En «Orden», elige «Menos activas primero».',
  'Arriba quedan las que llevan más tiempo sin actividad. La columna «Activa (30 días)» dice cuántos días trabajaron en el último mes.',
])}

> Nota: «Días con actividad» cuenta los días en que alguien registró algo (un cliente, una receta, un pedido, un cobro o un trabajo de producción). Los WhatsApp automáticos no cuentan.` },

    { id: 'module-errores', title: 'Errores del sistema', type: 'module', content: `# Errores del sistema

Cuando algo falla en LensSpace, queda anotado en ${appUrl}/errors («Errores» en el menú). Solo tú lo ves. Las ópticas siguen viendo su mensaje de siempre.

${bullets([
  '**WhatsApp:** te llega un mensaje a tu teléfono de «Datos del proveedor» la primera vez que aparece cada error, con la pantalla, la óptica y la hora. Si se repite, no te vuelve a escribir: solo suma una vez más en la lista.',
  '**Agrupados:** el mismo fallo en distintos pedidos o clientes cuenta como un solo error, con el número de veces al lado.',
  '**Tope:** como mucho 6 mensajes por hora. Si salen más errores, igual quedan en la lista.',
  '**Sin datos privados:** no se guardan contraseñas, correos, teléfonos ni datos de recetas.',
])}

## Qué hacer con un error

${steps([
  'Toca el error para ver el detalle: cuántas veces pasó, en qué ópticas y las últimas veces.',
  'Pásaselo al equipo técnico para que lo arregle.',
  'Cuando esté arreglado, toca «Marcar resuelto».',
  'Si un error no importa (por ejemplo, algo que hizo una prueba), toca «Ignorar» y no te avisa más.',
])}

> Nota: si un error resuelto vuelve a pasar, se abre solo otra vez y te llega un WhatsApp nuevo.` },

    { id: 'faq', title: 'Preguntas que siempre salen', type: 'faq', content: `# Preguntas que siempre salen

## Subí el contrato pero la suscripción sigue en prueba

Es correcto. Subir el contrato no cobra nada. Cuando paguen, toca «Registrar pago».

## No me deja crear una sucursal

Revisa tres cosas: que Multisucursal esté activo, que el contrato esté firmado (no en borrador) y que tenga sucursales extra libres.

## Quiero darle más días de prueba a una óptica que ya pagó

No se puede volver a prueba: solo se da al crearla. Si quieres regalarle tiempo, corre su fecha de vencimiento en «Operación y ajustes manuales» con un motivo; queda en el historial.

## Una óptica dejó de pagar

El sistema le avisa cada día y, a los 5 días del vencimiento sin pago, la deja sola en solo lectura. Si no vuelve, archívala.

## Un aviso sale «sin teléfono»

Falta el teléfono: el tuyo en «Datos del proveedor» o el del dueño en su perfil o en el contrato.

## La alta dice que el correo ya existe

Ese correo ya tiene cuenta en LensSpace. Usa otro correo para el dueño.` },
  ]
}
