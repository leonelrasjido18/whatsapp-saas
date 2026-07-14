import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { dispatchTemplate } from "@/features/inbox/services/dispatch";

// Birthday greetings: sends an approved template (usually with a coupon) to
// contacts whose birthday is today. Like the reengagement cron, it only runs
// for workspaces that configured a birthday template on their YCloud
// integration (config.birthday_template). Runs once daily.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  try {
    const { data: integrations } = await supabase
      .from("integrations")
      .select("workspace_id, config")
      .eq("provider", "ycloud")
      .eq("enabled", true);

    const templateByWs = new Map<string, string>();
    for (const it of integrations ?? []) {
      const tpl = (it.config as Record<string, unknown> | null)?.birthday_template;
      if (typeof tpl === "string" && tpl.length > 0) {
        templateByWs.set(it.workspace_id as string, tpl);
      }
    }

    if (templateByWs.size === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        note: "No hay templates de cumpleaños configurados (config.birthday_template).",
      });
    }

    const today = new Date();
    const mm = String(today.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(today.getUTCDate()).padStart(2, "0");
    const monthDay = `${mm}-${dd}`;

    let sent = 0;

    for (const [wsId, templateName] of templateByWs) {
      // Contacts opted-in with a birthday set. We fetch a bounded set and match
      // month/day in JS (birthday is stored as text in custom_fields).
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, custom_fields")
        .eq("workspace_id", wsId)
        .eq("opt_in", true)
        .not("custom_fields->>birthday", "is", null)
        .limit(500);

      for (const contact of contacts ?? []) {
        const raw = (contact.custom_fields as { birthday?: string } | null)
          ?.birthday;
        if (typeof raw !== "string") continue;
        const match = raw.match(/(\d{2})-(\d{2})$/); // trailing MM-DD
        if (!match || `${match[1]}-${match[2]}` !== monthDay) continue;

        const { data: conv } = await supabase
          .from("conversations")
          .select("id")
          .eq("workspace_id", wsId)
          .eq("contact_id", contact.id)
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!conv) continue;

        const result = await dispatchTemplate({
          workspaceId: wsId,
          conversationId: conv.id,
          templateName,
        }).catch(() => ({ ok: false as const }));

        if (result.ok) sent++;
      }
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    console.error("[Cron birthday-greetings] exception:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "error" },
      { status: 500 },
    );
  }
}
