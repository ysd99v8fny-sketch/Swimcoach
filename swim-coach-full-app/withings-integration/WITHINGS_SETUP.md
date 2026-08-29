# Conectar tu báscula Withings a SwimCoach

Mismo patrón que la integración de Strava: OAuth2, tokens guardados y
refrescados en Redis, sin que la clave secreta salga nunca del servidor.

## Archivos nuevos (respeta la misma estructura de carpetas que ya tienes)

```
lib/withings.js
api/withings/auth.js
api/withings/callback.js
api/withings/sync.js
api/body.js
```

## Paso 1 — Crear la app en el portal de Withings

1. Ve a [developer.withings.com](https://developer.withings.com/dashboard/) y crea una cuenta de desarrollador si no la tienes.
2. Crea una nueva aplicación ("Create an app" / "Add application").
3. En **Callback URI** pon: `https://swimcoach-two.vercel.app/api/withings/callback`
   (si tu dominio de Vercel cambia alguna vez, actualízalo aquí también).
4. Anota el **Client ID** y el **Client Secret**.

## Paso 2 — Variables de entorno en Vercel

Añade en **Settings → Environment Variables**:
- `WITHINGS_CLIENT_ID`
- `WITHINGS_CLIENT_SECRET`

Redespliega después de añadirlas (Deployments → ⋯ → Redeploy).

## Paso 3 — Conectar tu cuenta

Sube los 5 archivos a tu repo (respetando las rutas de arriba) y haz push a `main`.
Cuando el deploy termine, visita en el navegador:

```
https://swimcoach-two.vercel.app/api/withings/auth
```

Te llevará a Withings para autorizar el acceso a `user.metrics`. Al aceptar,
verás una pantalla de confirmación.

## Paso 4 — Traer tu primer pesaje

Visita:

```
https://swimcoach-two.vercel.app/api/withings/sync
```

Deberías ver un JSON con `weightKg`, `heightCm`, `fatPct`, `musclePct`, `waterPct`.

## ⚠️ Aviso importante sobre tu modelo de báscula

Si tu Withings es una **Body Scan** (la gama más reciente), hay un fallo conocido:
por defecto, la API solo devuelve peso y BMI, y el resto de campos de
composición corporal llegan vacíos. El arreglo (confirmado por soporte de
Withings) es:

1. Abre la app Health Mate → icono de usuario → engranaje de ajustes → **"Unidades"**.
2. Desactiva **"Masa grasa en %"** (usa unidades de masa en vez de porcentaje).

Con eso la API empieza a devolver también grasa, músculo e hidratación.
Si tras el paso 4 ves `fatPct`, `musclePct` o `waterPct` en `null` aunque el
peso sí llegue, es casi seguro este el motivo — pruébalo y vuelve a
sincronizar.

## Nota sobre % músculo y % agua

Withings no da directamente el músculo ni el agua en porcentaje, solo en kg
(masa muscular en kg, hidratación en kg). `lib/withings.js` ya hace el
cálculo por ti: `musclePct = muscleMassKg / weightKg * 100` y lo mismo para
`waterPct`. El % de grasa (`fatPct`) sí viene directo de Withings.

## Qué falta para pintarlo en la interfaz

Estos 5 archivos dejan los datos disponibles vía `GET /api/body`, pero no
tocan `app.js` — sigue sin haber una tarjeta en la interfaz que los muestre.
Dímelo cuando quieras y te preparo ese componente (React con
`React.createElement`, sin JSX, igual que el resto de `app.js`) para pintarlo
donde prefieras: junto a "Forma física", o en una sección nueva.
