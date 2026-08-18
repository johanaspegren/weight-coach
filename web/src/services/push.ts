import { getVapidKey, postSubscription } from "./api";

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

export async function subscribePush(): Promise<string> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("Push not supported in this browser.");
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Permission denied.");

  const reg = await navigator.serviceWorker.ready;
  const { key } = await getVapidKey();
  if (!key) throw new Error("VAPID key not configured on the server.");

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
  await postSubscription(sub.toJSON());
  return "Subscribed. You'll get a nudge at 23:00.";
}
