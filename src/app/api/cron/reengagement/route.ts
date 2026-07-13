import { NextResponse } from "next/server";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { dispatchTemplate } from "@/features/inbox/services/dispatch";

// Re-enganche de clientes inactivos. Como el contacto está fuera de la ventana
// de 24h (>90 días sin comprar), WhatsApp EXIGE un template aprobado. El cron
// sólo actúa si el workspace configuró un template de re-enganche en la
// integración de YCloud (config.reengagement_template); si no, no hace nada.
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
    // Sólo workspaces con un template de re-enganche configurado.
    const { data: integrations } = await supabase
      .from("integrations")
      .select("workspace_id, config")
      .eq("provider", "ycloud")
      .eq("enabled", true);

    const templateByWs = new Map<string, string>();
    for (const it of integrations ?? []) {
      const tpl = (it.config as Record<string, unknown> | null)
        ?.reengagement_template;
      if (typeof tpl === "string" && tpl.length > 0) {
        templateByWs.set(it.workspace_id as string, tpl);
      }
    }

    if (templateByWs.size === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
        note: "No hay templates de re-enganche configurados (config.reengagement_template).",
      });
    }

    const cutoff = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
    let sent = 0;

    for (const [wsId, templateName] of templateByWs) {
      // Contactos inactivos, no re-enganchados en los últimos 60 días.
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id")
        .eq("workspace_id", wsId)
        .eq("customer_tier", "inactive")
        .eq("opt_in", true)
        .or(`reengaged_at.is.null,reengaged_at.lt.${cutoff}`)
        .limit(30);

      for (const contact of contacts ?? []) {
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
        }).catch(() => ({ ok: false }));

        await supabase
          .from("contacts")
          .update({ reengaged_at: new Date().toISOString() })
          .eq("id", contact.id);

        if (result.ok) sent++;
      }
    }

    return NextResponse.json({ ok: true, sent });
  } catch (err: any) {
    console.error("[Cron reengagement] exception:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
