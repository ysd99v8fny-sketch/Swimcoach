export const RACES = [
  { id: "gz", name: "Getaria–Zarautz", date: "2026-07-19", distance: 2850 },
  { id: "sc", name: "Salomé Campos", date: "2026-09-05", distance: 5000 },
];

export const SYSTEM_CONTEXT = `Eres el entrenador personal de natación de Anton, nadador de aguas abiertas afincado en Vitoria-Gasteiz.
Contexto fijo que debes respetar siempre:
- Próxima travesía: Getaria–Zarautz, 2850m, 19 de julio de 2026.
- Siguiente objetivo: Salomé Campos, 5000m, 5 de septiembre de 2026 (fase de construcción tras Getaria).
- Bloque de recuperación en Torrevieja del 15 sept al 5 oct (nado suave, sin objetivos de rendimiento).
- Volumen habitual: 2–3 sesiones de piscina por semana, tope de 90 minutos de agua por sesión, 2800–3100m por sesión salvo semanas de descarga.
- Zonas de ritmo (de más lenta a más rápida): Cal (calentamiento), AeL1, AeL2, AeL3 (aeróbico ligero, progresivo), AeM (aeróbico medio), AnL (anaeróbico láctico), Vo2Max. Cuando propongas series, usa estas etiquetas.
- Ritmo en aguas abiertas ≈ 1:45–1:50/100m; ritmo en piscina ≈ 1:35/100m. Son cosas distintas, no las compares directamente.
- El sensor óptico de FC de su Garmin no es fiable nadando en piscina: los picos de FC en los virajes son artefactos del sensor, no esfuerzo real.
- Responde siempre en español, tono cercano de entrenador, directo y breve salvo que pidan detalle.`;

export function daysBetween(a, b) {
  return Math.ceil((new Date(b) - new Date(a)) / 86400000);
}

export function nextRace(today = new Date()) {
  return RACES.find((r) => new Date(r.date) >= today) || RACES[RACES.length - 1];
}

// ---- Live weather + sea conditions for the coach chat ----------------------
// Same Open-Meteo endpoints the "Condiciones" widget in the frontend already
// uses (free, no API key) — duplicated here so the coach's system prompt can
// include real conditions too, instead of the chat having no way to answer
// "qué tiempo va a hacer el día de la carrera".
const GETARIA_LAT = 43.303;
const GETARIA_LON = -2.199;
const WEATHER_CODES = {
  0: "despejado", 1: "mayormente despejado", 2: "parcialmente nublado", 3: "cubierto",
  45: "niebla", 48: "niebla escarchada",
  51: "llovizna ligera", 53: "llovizna", 55: "llovizna intensa",
  61: "lluvia ligera", 63: "lluvia", 65: "lluvia intensa",
  80: "chubascos ligeros", 81: "chubascos", 82: "chubascos intensos",
  95: "tormenta",
};

/**
 * Live forecast + sea conditions for Getaria on the given date, formatted as
 * one line for the coach's system prompt. Open-Meteo only forecasts ~16 days
 * out, so this returns null outside that window (or on any fetch failure) —
 * the coach just won't mention conditions rather than making something up.
 */
export async function getRaceConditions(dateStr, daysOut) {
  if (daysOut == null || daysOut < 0 || daysOut > 15) return null;
  try {
    const [forecastRes, marineRes] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${GETARIA_LAT}&longitude=${GETARIA_LON}&daily=temperature_2m_max,temperature_2m_min,weathercode,windspeed_10m_max&timezone=Europe%2FMadrid&start_date=${dateStr}&end_date=${dateStr}`
      ),
      fetch(
        `https://marine-api.open-meteo.com/v1/marine?latitude=${GETARIA_LAT}&longitude=${GETARIA_LON}&daily=wave_height_max&hourly=sea_surface_temperature&timezone=Europe%2FMadrid&start_date=${dateStr}&end_date=${dateStr}`
      ).catch(() => null),
    ]);

    if (!forecastRes.ok) return null;
    const forecast = await forecastRes.json();
    if (!forecast?.daily?.temperature_2m_max?.length) return null;

    const marine = marineRes && marineRes.ok ? await marineRes.json() : null;
    const seaTemps = marine?.hourly?.sea_surface_temperature;
    const avgSeaTemp =
      seaTemps && seaTemps.length ? seaTemps.reduce((a, b) => a + b, 0) / seaTemps.length : null;
    const waveHeight = marine?.daily?.wave_height_max?.[0];

    const code = forecast.daily.weathercode[0];
    const tMin = Math.round(forecast.daily.temperature_2m_min[0]);
    const tMax = Math.round(forecast.daily.temperature_2m_max[0]);
    const wind = Math.round(forecast.daily.windspeed_10m_max[0]);

    let line = `Previsión en Getaria para el ${dateStr}: ${WEATHER_CODES[code] || "cielo variable"}, ${tMin}–${tMax}°C, viento máx. ${wind} km/h`;
    if (avgSeaTemp != null) line += `, agua a ~${avgSeaTemp.toFixed(1)}°C`;
    if (waveHeight != null) line += `, oleaje ${waveHeight.toFixed(1)}m`;
    line += ". (Previsión, no un histórico — puede cambiar según se acerque la fecha.)";
    return line;
  } catch (e) {
    return null;
  }
}
