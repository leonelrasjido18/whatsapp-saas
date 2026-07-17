// Voice/phone AI (#4) — GET current config, PUT save API key, POST sync assistant.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import {
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import { syncVapiAssistant } from "@/features/voice/services/voice-agent";

function svc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId);
  if (!auth.ok) return auth.response;

  const { data } = await svc()
    .from("integrations")
    .select("enabled, credentials, config")
    .eq("workspace_id", workspaceId)
    .eq("provider", "vapi")
    .maybeSingle();

  const creds = (data?.credentials as Record<string, unknown>) ?? {};
  const config = (data?.config as Record<string, unknown>) ?? {};
  return NextResponse.json({
    data: {
      enabled: Boolean(data?.enabled),
      hasApiKey: Boolean(creds.vapi_api_key),
      assistantId: (config.assistant_id as string | undefined) ?? null,
    },
  });
}

const SaveSchema = z.object({ apiKey: z.string().min(1) });

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;
  const body = SaveSchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: "Falta la API key" }, { status: 400 });
  }

  const supabase = svc();
  const { data: existing } = await supabase
    .from("integrations")
    .select("credentials")
    .eq("workspace_id", workspaceId)
    .eq("provider", "vapi")
    .maybeSingle();

  await supabase.from("integrations").upsert(
    {
      workspace_id: workspaceId,
      provider: "vapi",
      credentials: {
        ...((existing?.credentials as object) ?? {}),
        vapi_api_key: body.data.apiKey,
      },
    },
    { onConflict: "workspace_id,provider" },
  );

  return NextResponse.json({ ok: true });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;
  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const result = await syncVapiAssistant(workspaceId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, assistantId: result.assistantId });
}
