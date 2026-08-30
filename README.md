# CRM/ERP Supermercados — SaaS Multitenant

## Estado actual de este comprimido

Este ZIP incluye todo lo construido hasta ahora, hasta el **Módulo 6:
abastecimiento + finanzas de mermas**, entregado en esta ronda. Resumen de
lo que se agregó/modificó en esta ronda (ver detalle completo en el chat):

**Backend nuevo:** `database/finance_procurement_backend.sql` — alertas de
stock bajo, sugerencias de compra agrupadas por proveedor, creación atómica
de orden de compra, clasificación contable de mermas (pérdida neta vs.
pendiente de reintegro con proveedor), tabla `loss_recoveries` y su ciclo de
resolución, reporte financiero de recuperación. También agrega el RLS que
faltaba en `suppliers`, `purchase_orders`, `purchase_order_items`,
`accounts_payable`, `categories`, `brands`, `units_of_measure` y `taxes`
(en `schema.sql` quedaron sin política — importante corregirlo antes de
comercializar licencias).

**Frontend nuevo/modificado:**
- POS: grilla de venta estilo Excel (`CartPanel.tsx` reescrito), soporte de
  unidades fraccionarias (kg/g/lb/lt/ml) en `cartStore.ts`, ticket térmico
  imprimible 58mm/80mm (`ThermalReceipt.tsx` + `ReceiptModal.tsx`).
- Mermas: clasificación pérdida neta / reintegro con proveedor
  (`RegisterLossModal.tsx`), panel de gestión de recuperaciones
  (`RecoveryManagementPanel.tsx` nuevo), tabla de historial con impacto
  separado por clasificación.
- Módulo nuevo `procurement/`: alertas de stock (`LowStockAlertsPanel.tsx`),
  sugerencias de compra por proveedor con generación de orden de compra
  (`PurchaseSuggestionsView.tsx`), página `ProcurementPage.tsx`.
- Módulo nuevo `finance/`: reporte de recuperación financiera de mermas
  (`LossRecoveryReport.tsx`), página `FinancePage.tsx`.

**Pendiente de esta misma ronda** (no alcanzado, ver "Próximos pasos"):
multi-tienda/traslados (módulo 4) y CRM de clientes/proveedores como UI
propia (módulo 7) — el módulo de finanzas hoy solo cubre recuperación de
mermas, no flujo de caja consolidado ni cuentas por pagar.

**Consideración de seguridad a resolver antes de producción:** `process_sale`
toma el `unit_price` que le manda el cliente sin comparar contra el precio
de catálogo — así que la edición de precio en la nueva grilla ya funciona
con el backend actual, pero eso también significa que técnicamente permite
que cualquier rol con acceso al POS venda a cualquier precio. Si quieres
restringir la edición de precio a supervisores/administradores, es un
cambio en el rol-check dentro de `process_sale` (o validar en el frontend
ocultando el input según `userRoleCode`).

## Contenido

```
crm-supermercado/
├── database/
│   ├── schema.sql                    # Esquema completo
│   ├── bootstrap_functions.sql       # RPC de tenant/usuario + RLS base
│   ├── pos_backend.sql               # process_sale, turnos de caja, RLS POS
│   ├── losses_backend.sql            # Mermas/vencimientos/ajustes (base)
│   └── finance_procurement_backend.sql  # NUEVO: alertas de stock,
│                                          #   sugerencias de compra, órdenes
│                                          #   de compra, clasificación y
│                                          #   recuperación de mermas, RLS
│                                          #   faltante
└── src/
    ├── shared/
    │   ├── lib/ (supabaseClient.ts, authContext.ts)
    │   └── types/
    │       ├── catalog.ts, pos.ts (extendido: unidades fraccionarias, ticket)
    │       ├── losses.ts (extendido: clasificación/recuperación)
    │       └── procurement.ts        # NUEVO
    └── modules/
        ├── auth/        (login/registro/OTP)
        ├── inventory/    (catálogo, stock, escaneo)
        ├── pos/
        │   ├── store/cartStore.ts        # unidades fraccionarias + precio editable
        │   ├── components/CartPanel.tsx  # grilla estilo Excel
        │   ├── components/ThermalReceipt.tsx  # NUEVO
        │   ├── components/ReceiptModal.tsx    # NUEVO
        │   └── pages/POSTerminalPage.tsx      # integra el ticket
        ├── losses/
        │   ├── components/RegisterLossModal.tsx    # + clasificación/proveedor
        │   ├── components/RecoveryManagementPanel.tsx  # NUEVO
        │   └── pages/LossesAndAdjustmentsPage.tsx      # + pestaña Recuperación
        ├── procurement/                          # NUEVO módulo completo
        │   ├── api/procurementApi.ts
        │   ├── hooks/useProcurement.ts
        │   ├── components/LowStockAlertsPanel.tsx
        │   ├── components/PurchaseSuggestionsView.tsx
        │   └── pages/ProcurementPage.tsx
        └── finance/                              # NUEVO módulo (arranque)
            ├── components/LossRecoveryReport.tsx
            └── pages/FinancePage.tsx
```


## Dependencias del frontend

Además de lo que ya tenías (`@supabase/supabase-js`, `lucide-react`), el
Módulo 2 requiere:

```
npm install @tanstack/react-query
npm install zustand
```

Envuelve tu app con el provider (una sola vez, en tu `App.tsx` o `main.tsx`):

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const queryClient = new QueryClient();

<QueryClientProvider client={queryClient}>
  <App />
</QueryClientProvider>
```

## Cómo aplicar el backend

1. Crea un proyecto en Supabase.
2. Ejecuta `database/schema.sql` en el SQL Editor.
3. Ejecuta `database/bootstrap_functions.sql` a continuación (depende de
   las tablas del paso anterior).
3b. Ejecuta `database/pos_backend.sql` (depende de bootstrap_functions.sql,
    por `auth_tenant_id()`).
3c. Ejecuta `database/losses_backend.sql` (depende de los tres anteriores).
3d. Ejecuta `database/finance_procurement_backend.sql` (depende de todos
    los anteriores — altera `products` e `inventory_losses`, y activa RLS
    en tablas que en `schema.sql` habían quedado sin política).
4. Inserta manualmente los roles base (el bootstrap y las aprobaciones de
   ajuste los necesitan — `approve_stock_adjustment` busca por `code`):

```sql
insert into roles (code, name) values
  ('superadmin', 'Super Administrador'),
  ('store_admin', 'Administrador de Tienda'),
  ('cashier', 'Cajero'),
  ('inventory_admin', 'Administrador de Inventario'),
  ('supervisor', 'Supervisor');
```

5. Inserta al menos un plan (el bootstrap asigna el más económico por defecto):

```sql
insert into plans (name, max_users, max_stores, price_monthly, trial_days)
values ('Básico', 5, 1, 29.00, 14);
```

## Variables de entorno del frontend

Crea un `.env` en la raíz del proyecto Vite:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

## Configuración adicional para el Módulo 2

Crea el bucket de Storage para imágenes de producto (Dashboard → Storage, o
SQL):

```sql
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true);

create policy "Lectura pública de imágenes de producto"
  on storage.objects for select using (bucket_id = 'product-images');

create policy "Tenants suben sus propias imágenes"
  on storage.objects for insert
  with check (bucket_id = 'product-images' and auth.role() = 'authenticated');
```

Inserta al menos una unidad de medida y una categoría para que el formulario
de producto tenga opciones (si no, los selects aparecen vacíos):

```sql
insert into units_of_measure (tenant_id, code, name) values ('<tu-tenant-id>', 'unidad', 'Unidad');
insert into categories (tenant_id, name) values ('<tu-tenant-id>', 'General');
```

## Configuración adicional para el Módulo 3 (POS)

`create_tenant_and_owner` ya crea una tienda principal automáticamente, pero
esa tienda necesita al menos una caja registradora antes de poder vender:

```sql
insert into cash_registers (store_id, name)
values ('<id-de-la-tienda>', 'Caja 1');
```

Sin esto, `CashShiftGate` mostrará "No hay cajas registradas para esta
tienda" y el terminal no dejará vender.

## Configuración adicional para el Módulo 5 (mermas/vencimientos/ajustes)

Este módulo lee `inventory_batches`, pero **nada de lo construido hasta
ahora crea lotes automáticamente** — ni la entrada manual del Módulo 2
(`registerManualStockEntry`) ni `process_sale` los tocan. Para que
`ExpirationAlertsPanel` y el selector PEPS del formulario de merma muestren
algo, necesitas insertar lotes de prueba manualmente:

```sql
insert into inventory_batches (tenant_id, product_id, store_id, batch_code, quantity, expiration_date)
values ('<tenant-id>', '<product-id>', '<store-id>', 'LOTE-001', 24, current_date + interval '5 days');
```

`LossesAndAdjustmentsPage` necesita el `role.code` del usuario (viene de
`fetchUserContext()` en `authContext.ts`) para decidir si mostrar los
botones de aprobar/rechazar ajustes — pásalo como prop `userRoleCode`.

## Configuración adicional para el Módulo 6 (abastecimiento/finanzas de mermas)

- Asigna `preferred_supplier_id` a tus productos para que las alertas de
  stock y las sugerencias de compra puedan agruparse por proveedor y
  generar la orden de compra directamente:

```sql
update products set preferred_supplier_id = '<supplier-id>' where id = '<product-id>';
```

- Sin proveedor asignado, el producto igual aparece en las alertas y
  sugerencias, pero agrupado en "Sin proveedor asignado" — desde ahí no se
  puede generar la orden de compra hasta asignarlo (por diseño, para no
  crear órdenes "huérfanas").
- Las sugerencias de compra usan el historial de `stock_movements` con
  `movement_type = 'sale'` de los últimos 30 días (configurable) para
  estimar venta diaria promedio. Si el negocio es nuevo y no tiene ventas
  registradas todavía, la sugerencia cae de vuelta al criterio de "el doble
  del mínimo configurado".
- La clasificación de merma como "pendiente de reintegro" exige seleccionar
  proveedor y no está disponible para el motivo "hurto" (un hurto no se
  gestiona con el proveedor). El backend valida esto igual que el frontend.

## Pendiente de configurar

- **Verificación por WhatsApp**: el diseño de referencia pedía envío del
  código por WhatsApp. Supabase Auth no lo soporta de forma nativa — se
  implementó con OTP por email como base funcional. Para WhatsApp real,
  configura un proveedor SMS con soporte WhatsApp (ej. Twilio) en el
  dashboard de Auth y cambia `signInWithOtp({ email })` por
  `signInWithOtp({ phone })` en el flujo de registro.
- **Flujo de "recuperar contraseña"**: actualmente reutiliza la misma vista
  `VerifyView` que el registro. Falta el paso final de ingresar la nueva
  contraseña después de verificar el código — no estaba en las imágenes de
  referencia que compartiste, así que no se implementó.
- **Router**: no se incluyó `react-router` ni las rutas `/panel`, `/admin`,
  `/suscripcion-suspendida` a las que redirige el código — son placeholders.
- **`ProductImageUploader` usa `window.location.reload()`** tras subir una
  imagen, como atajo para refrescar la lista sin cablear invalidación de
  cache entre componentes. Funciona, pero no es elegante — cuando conectes
  el router real, cámbialo por `queryClient.invalidateQueries(["product", id])`.
- **`total_stock` en la tabla del catálogo** se calcula sumando
  `inventory_stock` en una segunda consulta (Postgrest no soporta `SUM` en
  selects anidados). Con catálogos muy grandes (+10,000 SKUs) esto conviene
  moverlo a una vista materializada.
- **Impresión de tickets/facturas térmicas — RESUELTO PARCIALMENTE en esta
  ronda**: ahora existe `ThermalReceipt.tsx` + `ReceiptModal.tsx`, que
  arman un layout a escala 58mm/80mm e imprimen con `window.print()`
  (con `@media print` que oculta todo menos el ticket). Esto funciona bien
  con la mayoría de impresoras térmicas de punto de venta que el sistema
  operativo reconoce como una impresora normal. Lo que **sigue sin
  resolverse** es hablar directo el protocolo ESC/POS (corte automático de
  papel, apertura de cajón monedero por comando, impresión silenciosa sin
  el diálogo de impresión del navegador) — eso todavía requiere un agente
  local (ej. QZ Tray) o una app nativa.
- **Cierre de turno (`CloseShiftModal`)**: al confirmar, la mutación invalida
  la query del turno abierto, y como `CashShiftGate` re-renderiza en cuanto
  el turno pasa a `null`, el modal con el resumen de diferencia de caja
  puede desmontarse antes de que el cajero alcance a leerlo, dependiendo de
  qué tan rápido responda la red. Antes de llevarlo a producción, conviene
  separar el resultado del cierre en un estado que no dependa de que
  `ActiveTerminal` siga montado (ej. levantarlo un nivel más arriba, en
  `POSTerminalPage`).
- **Pago dividido (split tender)**: el backend (`process_sale` y
  `sale_payments`) ya soporta múltiples pagos por venta, pero la UI actual
  solo arma uno. Si necesitas "$30 en tarjeta + $20 en efectivo" en una
  misma venta, hay que extender `PaymentModal` para acumular varias líneas
  de pago antes de confirmar — el esquema no cambia.
- **`process_sale` no consume `inventory_batches`**: la venta descuenta el
  stock agregado (`inventory_stock`), pero no toca los lotes con fecha de
  vencimiento — el POS y el módulo de mermas manejan PEPS/FIFO de forma
  independiente por ahora. En un negocio real con control estricto de
  lotes, la venta también debería descontar del lote más antiguo. No lo
  hice porque cambia el contrato de `process_sale` (tendría que recibir
  qué lote usar por línea) y hubiera sido un cambio grande para este turno
  — avísame si quieres que lo integre.
- **Nada crea lotes automáticamente todavía**: ni la entrada manual del
  Módulo 2 ni ninguna otra pantalla generan filas en `inventory_batches` —
  hoy solo se pueden insertar por SQL directo (ver sección de
  configuración del Módulo 5 arriba). Eso normalmente se resuelve en el
  módulo de compras/recepción de mercancía (pendiente).
- **El registro de merma no requiere aprobación** (según tu especificación
  original, que solo pedía aprobación para "ajustes de stock"), pero si en
  la práctica también quieres que las mermas por hurto pasen por un
  supervisor antes de tocar el inventario, es el mismo patrón pending →
  approved que ya usa `stock_adjustments` — se puede replicar.
- **Edición de precio unitario en la grilla del POS no tiene control de
  rol todavía**: cualquier usuario con acceso al terminal puede cambiar el
  precio de una línea (ver nota de seguridad al inicio de este README).
  Antes de producción, decide si eso debe restringirse por rol.
- **`get_purchase_suggestions` no descuenta órdenes de compra ya generadas
  y aún no recibidas**: si generas una orden de compra y todavía no llega
  la mercancía, la siguiente consulta de sugerencias puede volver a sugerir
  el mismo producto (porque el stock físico sigue bajo). Para evitarlo
  habría que sumar `purchase_order_items` con `purchase_orders.status =
  'pending'` como "stock en tránsito" al calcular el déficit — quedó fuera
  de esta ronda.
- **Módulo de finanzas incompleto**: por ahora solo cubre el reporte de
  recuperación de mermas que pedía este ciclo de trabajo. Flujo de caja
  consolidado, cuentas por pagar (`accounts_payable`) y utilidad por
  categoría/producto quedan para una siguiente iteración.

## Próximos pasos (módulos aún no construidos)

Según el orden que definimos:

1. ~~Catálogo de productos (UI + lógica)~~ ✅ construido
2. ~~Inventario básico (stock por tienda)~~ ✅ construido (stock por tienda +
   entrada manual; falta el resto: PEPS/FIFO por lote y alertas de vencimiento)
3. ~~Terminal POS~~ ✅ construido (venta atómica, grilla estilo Excel,
   unidades fraccionarias, ticket térmico 58/80mm, efectivo/tarjeta/
   transferencia/fiado, apertura y cierre de caja)
4. Multi-tienda y traslados — pendiente
5. ~~Mermas, vencimientos y ajustes con aprobación~~ ✅ construido (alertas
   por urgencia, registro de merma con FIFO opcional, clasificación
   pérdida neta / reintegro con proveedor, gestión de recuperación,
   ajustes con flujo pending → approved/rejected)
6. ~~Abastecimiento (alertas de stock + sugerencias de compra)~~ ✅
   construido en esta ronda — ver limitación de "stock en tránsito" arriba
7. Finanzas y analítica — arrancado (reporte de recuperación de mermas);
   falta flujo de caja, cuentas por pagar y utilidad por categoría
8. CRM de clientes/proveedores (UI dedicada) — pendiente; hoy `suppliers`
   y `customers` solo se consultan desde otros módulos (POS, mermas,
   abastecimiento), no tienen pantalla de administración propia

Dime con cuál seguimos y lo construimos con el mismo nivel de detalle.
