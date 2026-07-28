"""One-shot: python -m weight_coach.providers.tuya_debug

Lists the linked app account's users, their devices, and the current status
(data points) of each. From the output you'll see:
  - the scale's device_id (put it in TUYA_DEVICE_ID)
  - the app account's uid  (put it in TUYA_UID)
  - the DP codes we need to parse (weight, unit, body impedance, etc.)"""
import json

from .. import http as _http
_http.install()

from tuya_connector import TuyaOpenAPI

from ..config import settings


def die(msg: str) -> None:
    print(f"❌ {msg}")
    raise SystemExit(1)


def main() -> None:
    if not (settings.tuya_access_id and settings.tuya_access_secret):
        die("Set TUYA_ACCESS_ID and TUYA_ACCESS_SECRET in .env")

    api = TuyaOpenAPI(settings.tuya_endpoint, settings.tuya_access_id, settings.tuya_access_secret)
    r = api.connect()
    if not r.get("success"):
        die(f"Auth failed: {r}")
    print(f"✅ Authenticated against {settings.tuya_endpoint}\n")

    # Try several device-listing endpoints — Tuya's API surface has multiple
    # depending on how the device was linked to the project.
    devices: list[dict] = []
    tried = []

    def try_path(path: str, params: dict | None = None, extract=lambda r: (r.get("result") or {}).get("list") or []):
        r = api.get(path, params=params)
        ok = r.get("success")
        items = extract(r) if ok else []
        tried.append((path, ok, len(items) if ok else r.get("msg")))
        return items

    devices = try_path("/v1.0/iot-01/associated-users/devices", {"page_no": 1, "page_size": 50},
                       extract=lambda r: (r.get("result") or {}).get("devices") or [])
    if not devices:
        devices = try_path("/v1.3/iot-03/devices", {"page_size": 50})
    if not devices:
        devices = try_path("/v2.0/cloud/thing/device", {"page_size": 50})

    print("Endpoint attempts:")
    for path, ok, info in tried:
        print(f"  {path:55} ok={ok}  {'items=' + str(info) if isinstance(info, int) else 'error=' + str(info)}")
    print()

    if not devices:
        die("No devices found through any endpoint. Check that the QR scan was completed with the Smart Life account that owns the scale.")

    print(f"Found {len(devices)} device(s).\n")

    for d in devices:
        dev_id = d.get("id") or d.get("device_id")
        print(f"--- Device ---")
        print(f"  id:       {dev_id}")
        print(f"  name:     {d.get('name') or d.get('custom_name')}")
        print(f"  product:  {d.get('product_name')}  (category={d.get('category')})")
        print(f"  online:   {d.get('is_online', d.get('online'))}")
        print(f"  owner:    uid={d.get('uid')}")
        # Current status
        s = api.get(f"/v1.0/devices/{dev_id}/status")
        if s.get("success"):
            print("  status DPs:")
            for dp in s.get("result", []):
                print(f"    {dp.get('code'):25} = {dp.get('value')}")
        # Recent logs (last 7d) — many scales only send on weigh events
        end_ms = int(__import__("time").time() * 1000)
        start_ms = end_ms - 7 * 24 * 3600 * 1000
        logs = api.get(
            f"/v1.0/devices/{dev_id}/logs",
            params={"start_time": start_ms, "end_time": end_ms, "type": 7, "size": 20},
        )
        if logs.get("success"):
            entries = logs.get("result", {}).get("logs", [])
            print(f"  last 7d logs ({len(entries)}):")
            for e in entries[:10]:
                print(f"    {e.get('event_time')}  {e.get('code')}={e.get('value')}")
        print()


if __name__ == "__main__":
    main()
