# Entrenador de Natación — app con backend + automatización real

Esta versión ya no depende de que copies datos a mano ni de tokens que caducan cada 6h.
Un pequeño backend (funciones serverless en Vercel) gestiona el OAuth de Strava, refresca
los tokens solo, guarda tu histórico en una base de datos, y un webhook trae cada sesión
nueva automáticamente en cuanto la subes a Strava — sin que tengas que tocar nada.

## Qué vas a necesitar

- Una cuenta de GitHub (ya tienes una, de la PWA anterior)
- Una cuenta gratuita en [Vercel](https://vercel.com) (puedes entrar con tu GitHub)
- Una cuenta de Strava con acceso a "My API Application"
- Una clave de API de Anthropic ([console.anthropic.com](https://console.anthropic.com))

---

## Paso 1 — Crear la app de Strava

1. Ve a [strava.com/settings/api](https://www.strava.com/settings/api).
2. Crea una aplicación. En **"Authorization Callback Domain"** pon de momento `localhost` — lo cambiarás en el paso 4 una vez tengas la URL real de Vercel.
3. Anota el **Client ID** y el **Client Secret** — los necesitas en el paso 3.

## Paso 2 — Subir el código a GitHub

1. Crea un repositorio nuevo, por ejemplo `swim-coach-app`.
2. Sube **todo el contenido de esta carpeta** (incluida la carpeta `api/` y `lib/`, no solo los archivos sueltos).

## Paso 3 — Crear el proyecto en Vercel

1. Entra en [vercel.com/new](https://vercel.com/new), importa el repositorio `swim-coach-app`.
2. Framework Preset: **Other** (déjalo en automático, Vercel lo detecta bien con esta estructura).
3. Antes de darle a "Deploy", añade las variables de entorno (sección "Environment Variables"):
   - `STRAVA_CLIENT_ID`
   - `STRAVA_CLIENT_SECRET`
   - `STRAVA_WEBHOOK_VERIFY_TOKEN` — invéntate cualquier cadena aleatoria, ej. `anton-swim-2026-xk9`
   - `ANTHROPIC_API_KEY`
   - `APP_SECRET` — invéntate otra cadena/código de acceso (ej. `anton-2026`); es lo que la app te pedirá una vez en el navegador para poder usarla. Sin esta variable, todos los endpoints devuelven error 500.
4. Dale a **Deploy**. En 1-2 minutos tendrás una URL tipo `https://swim-coach-app.vercel.app`.

## Paso 4 — Conectar la base de datos (Upstash Redis vía Marketplace)

Vercel eliminó su "KV" nativo — ahora se hace a través del Marketplace, con Upstash como proveedor. El resultado es el mismo, solo cambia dónde se pulsa.

1. En el dashboard del proyecto en Vercel, pestaña **Storage**.
2. Busca la sección **"Marketplace Database Providers"** (o similar) → elige **Upstash**.
3. Te dará a elegir entre dejar que Vercel gestione la cuenta de Upstash por ti, o conectar una propia — elige la opción gestionada por Vercel, es más simple.
4. Elige **Redis** como producto, dale un nombre, y créala.
5. Cuando te pregunte a qué proyecto conectarla, selecciona `swim-coach-app`.
6. Esto añade automáticamente las variables `KV_REST_API_URL` y `KV_REST_API_TOKEN` (o `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`, el código funciona con cualquiera de los dos) — no tienes que copiarlas a mano.
7. Como el primer deploy se hizo antes de tener la base de datos, redespliega: **Deployments** → los tres puntos del último deploy → **Redeploy**.

## Paso 5 — Actualizar la URL de callback en Strava

1. Vuelve a [strava.com/settings/api](https://www.strava.com/settings/api).
2. Cambia **"Authorization Callback Domain"** a tu dominio de Vercel sin `https://`, ej. `swim-coach-app.vercel.app`.

## Paso 6 — Conectar tu cuenta de Strava

Abre en el navegador:
```
https://TU-DOMINIO.vercel.app/api/strava/auth
```
Te llevará a Strava para autorizar la app. Al aceptar, verás una pantalla de confirmación — ya está conectada.

## Paso 7 — Sincronización inicial (backfill del histórico)

La primera vez que abras la app en el navegador te pedirá el código de acceso (`APP_SECRET` que pusiste en el paso 3) — lo guarda en ese navegador y no lo vuelve a pedir. Pulsa **"sincronizar Strava"** dentro de la app para traer todo tu histórico (puede tardar unos segundos si tienes muchas sesiones).

## Paso 8 — Registrar el webhook (la parte que automatiza todo)

Esto es lo único que requiere una terminal (no hay forma de hacerlo desde la web de Strava). Si no tienes terminal a mano, dímelo en el chat y te doy el comando `curl` exacto para copiar y pegar en cualquier terminal online.

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=TU_CLIENT_ID \
  -F client_secret=TU_CLIENT_SECRET \
  -F callback_url=https://TU-DOMINIO.vercel.app/api/strava/webhook \
  -F verify_token=EL_MISMO_STRAVA_WEBHOOK_VERIFY_TOKEN_QUE_PUSISTE_EN_VERCEL
```

Si todo va bien, Strava responde con un `id` de suscripción. A partir de aquí, **cada vez que subas un nado a Strava, aparecerá solo en la app en segundos** — sin tocar nada.

## Paso 9 — Instalar en el iPhone

Igual que antes: abre la URL de Vercel en Safari → Compartir → "Añadir a pantalla de inicio".

---

## Qué hace cada pieza

| Endpoint | Qué hace |
|---|---|
| `GET /api/strava/auth` | Redirige a Strava para autorizar la app (una vez) |
| `GET /api/strava/callback` | Recibe el código de Strava y guarda los tokens |
| `GET /api/strava/sync` | Backfill / resincronización manual de todo el histórico (requiere código de acceso) |
| `GET\|POST /api/strava/webhook` | Verificación + recepción de eventos en tiempo real |
| `GET\|POST\|DELETE /api/sessions` | La app lee/escribe el registro de sesiones (requiere código de acceso) |
| `POST /api/coach` | Proxy seguro al chat de Claude (requiere código de acceso) |

## Seguridad

- Las claves (`STRAVA_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `APP_SECRET`) viven solo en las variables de entorno de Vercel — nunca llegan al navegador salvo el código de acceso que tú mismo escribes al usar la app.
- El repo es público en GitHub, así que todos los endpoints de datos exigen ese código de acceso (`x-app-secret`) — sin él, cualquiera que encuentre la URL podría leer o borrar tu historial, o gastar tu crédito de Anthropic.

## Actualizar la app más adelante

Pídeme cambios como siempre en el chat — te doy los archivos actualizados, los subes a tu repositorio de GitHub y Vercel despliega la nueva versión solo.
