"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/**
 * "Activar notificaciones" — registers the service worker and subscribes the
 * device to Web Push. Hidden when the browser doesn't support it or VAPID isn't
 * configured. Once subscribed, shows an enabled state.
 */
export function PushEnableButton() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      Boolean(vapidKey);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time capability probe
    setSupported(ok);
    if (ok && Notification.permission === "granted") {
      navigator.serviceWorker.getRegistration().then((reg) => {
        reg?.pushManager.getSubscription().then((sub) => {
          if (sub) setEnabled(true);
        });
      });
    }
  }, [vapidKey]);

  if (!supported) return null;

  async function enable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Permiso de notificaciones denegado");
        return;
      }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey!) as BufferSource,
      });
      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error();
      setEnabled(true);
      toast.success("Notificaciones activadas");
    } catch {
      toast.error("No se pudieron activar las notificaciones");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={enable}
      disabled={busy || enabled}
    >
      {enabled ? (
        <>
          <BellRing className="h-3.5 w-3.5 mr-1.5 text-primary" aria-hidden />
          Notificaciones activas
        </>
      ) : (
        <>
          <Bell className="h-3.5 w-3.5 mr-1.5" aria-hidden />
          Activar notificaciones
        </>
      )}
    </Button>
  );
}
