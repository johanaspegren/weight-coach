"""One-shot BLE scanner: python -m weight_coach.providers.ble_scan

Prints every BLE advertisement heard, with name / MAC / RSSI / raw manufacturer
data. Step on the scale while it runs; the entry that jumps in signal strength
is your device."""
import asyncio
from datetime import datetime

from bleak import BleakScanner

SCAN_SECONDS = 90
CLOSE_RSSI = -70  # devices closer than this get flagged


def _fmt_mfr(mfr: dict) -> str:
    if not mfr:
        return ""
    parts = []
    for cid, payload in mfr.items():
        parts.append(f"[cid=0x{cid:04x} {payload.hex()}]")
    return " ".join(parts)


async def main():
    # For each MAC, remember every payload we've seen so a weight change shows up as a new line.
    history: dict[str, set[str]] = {}
    close_devices: dict[str, list[str]] = {}

    def cb(device, adv):
        name = adv.local_name or device.name or ""
        mfr = _fmt_mfr(adv.manufacturer_data or {})
        svc = ",".join(adv.service_uuids or []) or "-"
        # Fingerprint an advertisement by name + mfr + svc so payload changes surface.
        fp = f"{name}|{mfr}|{svc}"
        prev = history.setdefault(device.address, set())
        rssi_now = adv.rssi
        close = rssi_now >= CLOSE_RSSI
        # Print if new fingerprint, or first time seeing a close variant
        if fp in prev and not close:
            return
        prev.add(fp)
        ts = datetime.now().strftime("%H:%M:%S")
        star = "★" if close else " "
        print(f"{ts} {star} {rssi_now:>4} dBm  {device.address}  name={name!r:32}  svc={svc}  mfr={mfr}")
        if close:
            close_devices.setdefault(device.address, []).append(f"{name} {mfr}")

    print(f"Scanning for {SCAN_SECONDS}s. Step on the scale, wait 10s, step off, step on again.")
    print(f"'★' = strong signal (≥{CLOSE_RSSI} dBm), likely near you.\n")
    scanner = BleakScanner(detection_callback=cb)
    await scanner.start()
    await asyncio.sleep(SCAN_SECONDS)
    await scanner.stop()
    print(f"\nDone. Devices with strong signal (candidates for scale):")
    for addr, entries in close_devices.items():
        print(f"  {addr}: {entries[0]}   (seen {len(entries)}x close)")


if __name__ == "__main__":
    asyncio.run(main())
