# /// script
# requires-python = ">=3.10"
# dependencies = ["garminconnect>=0.2.19", "requests"]
# ///
"""
Sincroniza los datos diarios de recuperación de Garmin Connect con SwimCoach.

Corre en el Mac (lo lanza launchd cada pocas horas, ver install_garmin_sync.sh)
y reutiliza la sesión OAuth guardada en ~/.garminconnect por `garmin-mcp-auth`,
así que nunca maneja tu contraseña de Garmin.

Uso manual:
    uv run garmin_sync.py            # últimos 3 días
    uv run garmin_sync.py --days 30  # backfill
"""
import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

import requests
from garminconnect import Garmin

CONFIG = Path.home() / ".swimcoach" / "config.json"
TOKENS = os.environ.get("GARMINTOKENS", str(Path.home() / ".garminconnect"))


def log(msg):
    print(f"[{dt.datetime.now():%Y-%m-%d %H:%M}] {msg}", flush=True)


def safe(fn, *args):
    try:
        return fn(*args)
    except Exception as e:  # un dato que falta no debe tumbar el resto
        log(f"  aviso: {fn.__name__}{args}: {e}")
        return None


def g(d, *path):
    for p in path:
        if isinstance(d, list):
            d = d[p] if isinstance(p, int) and len(d) > p else None
        elif isinstance(d, dict):
            d = d.get(p)
        else:
            return None
    return d


def day_metrics(api, date):
    ds = date.isoformat()
    out = {"date": ds}

    hrv = g(safe(api.get_hrv_data, ds), "hrvSummary")
    if hrv:
        out["hrv_avg"] = hrv.get("lastNightAvg")
        out["hrv_weekly"] = hrv.get("weeklyAvg")
        out["hrv_low"] = g(hrv, "baseline", "balancedLow")
        out["hrv_high"] = g(hrv, "baseline", "balancedUpper")
        out["hrv_status"] = hrv.get("status")

    sleep = g(safe(api.get_sleep_data, ds), "dailySleepDTO")
    if sleep and sleep.get("sleepTimeSeconds"):
        secs = sleep["sleepTimeSeconds"]
        out["sleep_hours"] = round(secs / 3600, 2)
        out["sleep_score"] = g(sleep, "sleepScores", "overall", "value")
        if sleep.get("deepSleepSeconds") is not None:
            out["deep_pct"] = round(100 * sleep["deepSleepSeconds"] / secs, 1)
        if sleep.get("remSleepSeconds") is not None:
            out["rem_pct"] = round(100 * sleep["remSleepSeconds"] / secs, 1)

    rhr = safe(api.get_rhr_day, ds)
    out["rhr"] = g(rhr, "allMetrics", "metricsMap", "WELLNESS_RESTING_HEART_RATE", 0, "value")

    bb = safe(api.get_body_battery, ds, ds)
    values = [v[1] for v in (g(bb, 0, "bodyBatteryValuesArray") or []) if isinstance(v, list) and len(v) > 1 and v[1] is not None]
    if values:
        out["bb_high"], out["bb_low"] = max(values), min(values)

    tr = safe(api.get_training_readiness, ds)
    if isinstance(tr, list):
        scores = [x.get("score") for x in tr if isinstance(x, dict) and x.get("score") is not None]
        out["readiness"] = scores[0] if scores else None
    elif isinstance(tr, dict):
        out["readiness"] = tr.get("score")

    return {k: v for k, v in out.items() if v is not None}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=3)
    ap.add_argument("--dry-run", action="store_true", help="muestra el JSON sin enviarlo")
    args = ap.parse_args()

    cfg = json.loads(CONFIG.read_text())
    api = Garmin()
    try:
        api.login(TOKENS)
    except Exception as e:
        log(f"ERROR: no se pudo usar la sesión de Garmin en {TOKENS}: {e}")
        log("Ejecuta otra vez garmin-mcp-auth para renovarla.")
        sys.exit(1)

    today = dt.date.today()
    days = [day_metrics(api, today - dt.timedelta(days=i)) for i in range(args.days)]
    days = [d for d in days if len(d) > 1]

    if args.dry_run:
        print(json.dumps(days, indent=2, ensure_ascii=False))
        return

    r = requests.post(
        cfg["url"].rstrip("/") + "/api/wellness",
        json={"days": days},
        headers={"x-app-secret": cfg["secret"]},
        timeout=30,
    )
    if not r.ok:
        log(f"ERROR al enviar a SwimCoach: HTTP {r.status_code} {r.text[:200]}")
        sys.exit(1)
    log(f"OK: {len(days)} días enviados ({r.json()})")


if __name__ == "__main__":
    main()
