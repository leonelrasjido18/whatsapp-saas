// push.ts — Web Push sender. Delivers a notification to every subscribed device
// of a workspace's members. No-op (safe) when VAPID keys aren't configured.

import webpush from "web-push";
import { createClient as createSbClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:soporte@synory.dev",
    pub,
    priv,
  );
  configured = true;
  return true;
}

function svc(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Sends a push to every device subscribed for the workspace. Dead subscriptions
 * (410/404) are pruned. Best-effort — never throws.
 */
export async function sendPushToWorkspace(
  workspaceId: string,
  payload: { title: string; body: string; url?: string },
  client?: SupabaseClient,
): Promise<number> {
  if (!ensureConfigured()) return 0;
  const supabase = client ?? svc();

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("workspace_id", workspaceId);

  if (!subs || subs.length === 0) return 0;
  const body = JSON.stringify(payload);
  let sent = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint as string,
            keys: { p256dh: s.p256dh as string, auth: s.auth as string },
          },
          body,
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", s.id as string);
        }
      }
    }),
  );

  return sent;
}
