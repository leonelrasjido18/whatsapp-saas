# Plan de desarrollo — Roadmap de valor

> Objetivo: transformar el pitch de "un bot que responde" a **"un empleado digital
> que vende, recupera clientes y te consigue reseñas — y te muestra cuánta plata
> te generó"**. Cada fase deja algo vendible; el orden respeta dependencias y
> prioriza lo que usa infraestructura ya existente.

---

## Fase 0 — Desbloqueos comerciales (sin código, en paralelo)

| Tarea | Estado | Por qué importa |
|---|---|---|
| App Review de Meta (FB/IG) | Bloqueado por verificación del negocio (monotributo en trámite, exp. EX-2026-67541077) | Sin esto no se puede prometer omnicanal a clientes reales |
| Credenciales MP/AFIP en prod | Pendiente de cargar | El módulo Ventas está desplegado pero no es demostrable en vivo |

---

## Fase 1 — Quick wins sobre infraestructura existente (~2-3 semanas)

### 1.1 Subida de archivos: PDF, Word y Excel

**Dónde encaja:** la KB ya ingiere texto plano y URLs (`POST /api/workspace/[id]/kb`
→ `ingestDocument()`). Se agrega una rama de extracción de texto por tipo de archivo.
El Excel además sirve como **importador de catálogo** para Ventas.

**Dependencias npm:**
- `unpdf` — extracción de texto de PDF (serverless-friendly, sin binarios nativos; evitar `pdf-parse` que trae problemas en Vercel)
- `mammoth` — .docx → texto/HTML
- `xlsx` (SheetJS) — .xlsx/.xls/.csv → JSON

**Backend:**
1. Nueva ruta `POST /api/workspace/[id]/kb/upload` que acepta `multipart/form-data`:
   - Validar MIME + extensión (`pdf`, `docx`, `doc`, `xlsx`, `xls`, `csv`) y tamaño máx. **10 MB** (límite de body en Vercel: usar `export const maxDuration = 60` y streaming si hace falta).
   - Subir el archivo original a Supabase Storage, bucket privado `kb-files/{workspaceId}/{uuid}.{ext}` (el patrón de borrado desde `meta.media_url` ya existe en el DELETE actual).
   - Extraer texto según tipo:
     - PDF → `unpdf` (si el PDF es escaneado sin capa de texto, fallback: pasar páginas como imagen al modelo de visión ya usado en `media-understanding.ts`).
     - Word → `mammoth.extractRawText()`.
     - Excel → `xlsx`: cada hoja se serializa como tabla Markdown (los chunks tabulares se recuperan mejor en búsqueda semántica que el CSV crudo).
   - Llamar `ingestDocument()` con `sourceType: 'pdf' | 'docx' | 'xlsx'` y `meta: { media_url, original_filename, pages/sheets }`.
2. Reusar el chunking/embeddings existentes (pgvector) sin cambios.

**Frontend (`kb-tab.tsx`):**
- Dropzone (drag & drop + botón) junto al form actual de texto/URL.
- Estado de progreso: subiendo → extrayendo → indexando → listo.
- En la lista de documentos: ícono por tipo + link de descarga (signed URL).

**Bonus — Importador de catálogo por Excel (módulo Ventas):**
- Ruta `POST /api/workspace/[id]/catalog/import` con la misma extracción `xlsx`.
- Plantilla descargable con columnas: `sku, nombre, descripcion, precio, stock, categoria`.
- Pantalla de preview con validación fila por fila (Zod) antes del upsert a productos.
- Elimina la fricción #1 del onboarding de tiendas (cargar productos a mano).

### 1.2 Reporte ROI: "el bot te vendió $X"

**Datos ya existentes:** `commerce_analytics`, `commerce_rich_analytics`, órdenes
creadas por el tool `create_order`, cron de carrito abandonado, eventos de handoff.

1. **Servicio de agregación** `features/dashboard/services/roi-report.ts`:
   - Ventas atribuidas a IA: órdenes cuyo origen es el tool `create_order` / `generate_payment_link` (agregar columna `origin` a orders si falta: `ai | pos | manual`).
   - Carritos recuperados: conversiones post-mensaje del cron `cart-abandonment` (trackear con `recovered_at` en la tabla de follow-ups).
   - Conversaciones atendidas, % resueltas sin humano, tiempo de respuesta.
2. **Cron semanal** `api/cron/weekly-report` (pg_cron, lunes 9am):
   - Renderiza el resumen y lo envía por WhatsApp **template** al número del owner (configurable en Settings → Negocio) + opcional email.
   - Formato: "📊 Tu semana: 87 conversaciones · 12 ventas por IA · $340.000 · 4 carritos recuperados".
3. **Dashboard:** sección ROI con comparativa semana vs. semana anterior (usar skill dataviz para los gráficos).
4. **Gating:** disponible en todos los planes (es la feature que retiene — no esconderla).

### 1.3 Reseñas de Google automáticas

1. Settings → Negocio: campo `google_review_url` (link directo de reseña con Place ID).
2. Nuevo tipo de `automation_rule` (la tabla ya existe): trigger `order_delivered` / `order_paid` + delay configurable (ej. 24 h).
3. Envío: dentro de ventana de 24 h → mensaje normal; fuera → template pre-aprobado ("¿Cómo fue tu experiencia? ⭐").
4. Métrica en dashboard: reseñas pedidas / clicks (link con redirect trackeado `/r/{id}`).
5. **Gating:** Pro+.

---

## Fase 2 — Campañas / difusión masiva (~3-4 semanas) 🥇

La feature que más justifica subir el precio. Usa los templates y el manejo de
ventana de 24 h ya existentes.

**Migraciones:**
```sql
campaigns (
  id, workspace_id, name, template_id, status ('draft','scheduled','sending','paused','done','failed'),
  segment jsonb,          -- filtros serializados
  scheduled_at, started_at, finished_at,
  stats jsonb             -- {total, sent, delivered, read, failed, replies}
)
campaign_recipients (
  id, campaign_id, contact_id, status ('pending','sent','delivered','read','failed','opted_out'),
  wamid, error, sent_at
)
-- + columna contacts.opted_out boolean (baja por "STOP"/"BAJA")
```

**Motor de segmentación** (`features/campaigns/services/segments.ts`):
- Filtros combinables sobre datos ya existentes: tags, etapa de pipeline, última interacción (> X días), compró / no compró, producto comprado, total gastado, cumpleaños del mes.
- Preview del tamaño de audiencia antes de confirmar.

**Despacho:**
- Cron `api/cron/campaign-dispatch` (cada minuto, mismo patrón pg_cron del buffer):
  - Toma campañas `sending`, despacha en lotes con **rate limit** (respetar tiers de messaging de Meta/YCloud, ej. 20 msg/seg configurable).
  - Solo templates aprobados (fuera de ventana de 24 h es obligatorio).
  - Actualiza estados con los webhooks de delivery ya recibidos (`ycloud-webhook-handler.ts`).
- **Opt-out obligatorio:** detectar "BAJA"/"STOP" en el webhook entrante → marcar contacto y excluirlo de futuras campañas (cumplimiento Meta; evita bans del número).

**UI:** nueva sección `/campanas` en `(main)`:
- Wizard: 1) audiencia (segmentos + preview) → 2) template (picker existente) → 3) programar → 4) confirmar.
- Vista de campaña con embudo: enviados → entregados → leídos → respondieron.
- Las respuestas caen al inbox normal y el agente IA las atiende (ese es el diferencial vs. herramientas de broadcast puro).

**Gating:** Pro (hasta 1.000 destinatarios/mes) · Enterprise (ilimitado). Agregar
`campaigns: boolean` + `campaign_monthly_limit` a `plans.ts`.

---

## Fase 3 — Omnicanal: widget web (~2-3 semanas)

1. **Canal nuevo `webchat`:** extender los enums de canal (migración sobre `meta_channel_enums`) y `channel-badge.tsx`.
2. **Endpoint público** `POST /api/webchat/{workspacePublicKey}`:
   - Sesión anónima con token en localStorage; crea contact + conversation con canal `webchat`.
   - Entra al mismo pipeline de buffer/agente. Sin ventana de 24 h ni templates.
   - Rate limiting por IP + CORS restringido al dominio configurado.
3. **Script embebible** `public/widget.js`: burbuja flotante, colores/logo configurables desde Settings → Integraciones, `<script src=".../widget.js" data-key="...">`.
4. **Inbox:** ya soporta multi-canal; solo asegurar que el envío saliente rutee por canal.
5. **Gating:** Pro+.

---

## Fase 4 — Nuevos verticales (~4-6 semanas)

### 4.1 Turnos y reservas nativos (sin HighLevel)

Abre el mercado de locales de servicios: peluquerías, consultorios, gimnasios, talleres.

**Migraciones:** `services` (nombre, duración, precio, buffer), `availability_rules`
(día de semana, franjas, excepciones/feriados), `appointments` (contact, service,
starts_at, status `pending|confirmed|cancelled|no_show|done`).

**Tools del agente (registry existente):**
- `check_availability` nativo (hoy existe la variante HighLevel — hacer el provider intercambiable: `native | highlevel`).
- `book_appointment` — crea el turno y confirma en el chat.
- `cancel_or_reschedule` — con política configurable.

**Crons:** recordatorio 24 h y 2 h antes (template con botones Confirmar/Cancelar),
marcado de no-show.

**UI:** Settings → Servicios y horarios; vista calendario semanal en `(main)/turnos`
con creación manual (el local también agenda por teléfono).

**Gating:** todos los planes (reemplaza la dependencia de HighLevel en Starter).

### 4.2 Fidelización

- **Cupones:** tabla `coupons` (código, tipo %/monto, vigencia, usos máx.). El tool `create_order`/`generate_payment_link` acepta cupón y valida. El agente puede ofrecerlo ("tengo un 10% para vos 😉") vía prompt + tool `apply_coupon`.
- **Cumpleaños:** campo `birthday` en contacts (el agente lo pide naturalmente; también editable en CRM panel) + cron mensual/diario que dispara campaña de cumpleaños con cupón.
- **Puntos (v2, opcional):** `loyalty_points` por contacto, acumula por orden pagada, canje como cupón.
- **Gating:** cupones Pro+ · puntos Enterprise.

---

## Fase 5 — Escala y ticket Enterprise (~4-6 semanas)

### 5.1 Integración Tiendanube 🥇 (adquisición)

1. Crear app en el Partner Portal de Tiendanube (OAuth 2).
2. Settings → Integraciones → Tiendanube: conectar tienda.
3. **Sync de catálogo:** import inicial + webhooks de producto/stock (`product/updated`, `order/created`) para mantener precios y stock al día. Mapear a las tablas de commerce existentes con `external_id` + `source: 'tiendanube'`.
4. **Órdenes:** opción A (v1) solo lectura para que el agente responda "¿dónde está mi pedido?" con datos reales; opción B (v2) crear órdenes en Tiendanube desde el chat.
5. Publicar en el marketplace de apps de Tiendanube → canal de adquisición orgánico.
6. Después replicar patrón para Shopify (misma interfaz `CatalogProvider`).

### 5.2 White-label para agencias

- Tabla `agency_branding` (logo, colores, nombre, dominio custom).
- Middleware: resolver workspace/agencia por hostname (wildcard domain en Vercel).
- Theming: CSS variables ya usadas por shadcn — inyectar por agencia.
- Emails transaccionales con remitente de la agencia.
- **Gating:** plan Agencia nuevo (3-5× Enterprise), facturación por workspace hijo.

### 5.3 Multi-número / multi-sucursal

- Refactor: hoy la config de YCloud es 1 por workspace → tabla `channels` (N números por workspace, cada uno con sus credenciales encriptadas).
- Conversaciones y agentes ruteados por canal; filtro por sucursal en inbox y métricas.
- **Gating:** Enterprise (o add-on por número extra).

---

## Cambios en `plans.ts` (resumen de gating)

| Feature | Starter | Pro | Enterprise |
|---|---|---|---|
| KB + archivos (PDF/Word/Excel) | ❌ | ✅ | ✅ |
| Import catálogo Excel | ✅ | ✅ | ✅ |
| Reporte ROI semanal | ✅ | ✅ | ✅ |
| Reseñas Google | ❌ | ✅ | ✅ |
| Campañas | ❌ | ✅ (1.000/mes) | ✅ ilimitado |
| Widget web | ❌ | ✅ | ✅ |
| Turnos nativos | ✅ (1 agenda) | ✅ | ✅ |
| Cupones / cumpleaños | ❌ | ✅ | ✅ |
| Puntos de fidelidad | ❌ | ❌ | ✅ |
| Tiendanube | ❌ | ✅ | ✅ |
| White-label | ❌ | ❌ | Plan Agencia |
| Multi-número | ❌ | ❌ | ✅ |

Con Campañas + ROI + Reseñas en Pro, hay argumento para subir Pro de $7.900 a
$14.900–19.900 ARS y Enterprise a $39.900+.

---

## Orden de ejecución recomendado

```
Semana 1-2   → 1.1 Archivos KB (PDF/Word/Excel) + import catálogo Excel
Semana 2-3   → 1.2 Reporte ROI + 1.3 Reseñas Google
Semana 4-7   → 2   Campañas (la feature estrella — testear con 2-3 clientes beta)
Semana 8-10  → 3   Widget web
Semana 11-14 → 4.1 Turnos nativos → 4.2 Fidelización
Semana 15+   → 5   Tiendanube → White-label → Multi-número
```

Cada fase termina con: migración aplicada, `npm run typecheck && npm run lint`,
prueba e2e del flujo feliz, y deploy al VPS.
