import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import { authorizedFetch, deviceId, isNative } from "./auth";

async function saveToken(token: string) {
  const id = await deviceId();
  await authorizedFetch(`/admin/devices/${encodeURIComponent(id)}/push-token`, {
    method: "PUT",
    body: JSON.stringify({ token })
  });
}

export async function registerPushNotifications(onAlert: () => void) {
  if (!isNative) return;
  const supported = await FirebaseMessaging.isSupported();
  if (!supported.isSupported) return;
  let permission = await FirebaseMessaging.checkPermissions();
  if (permission.receive === "prompt") permission = await FirebaseMessaging.requestPermissions();
  if (permission.receive !== "granted") return;
  const { token } = await FirebaseMessaging.getToken();
  await saveToken(token);
  await FirebaseMessaging.addListener("tokenReceived", ({ token: next }) => void saveToken(next));
  await FirebaseMessaging.addListener("notificationReceived", onAlert);
  await FirebaseMessaging.addListener("notificationActionPerformed", onAlert);
}
