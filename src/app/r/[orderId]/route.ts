// Tracked review-link redirect: /r/{orderId} → bumps the workspace's click
// counter, then 302s to its configured Google review URL. Public (the customer
// clicks it from WhatsApp), so it only ever exposes the redirect — no data.

import { NextRequest, NextResponse } from "next/server";
import { createClient as createSvcClient } from "@supabase/supabase-js";
import { trackReviewClick } from "@/features/commerce/services/reviews";

function svc() {
  return createSvcClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> },
) {
  const { orderId } = await params;
  const db = svc();

  const { data: order } = await db
    .from("orders")
    .select("workspace_id")
    .eq("id", orderId)
    .maybeSingle();

  const fallback = new URL("/", req.url);

  if (!order?.workspace_id) {
    return NextResponse.redirect(fallback);
  }

  const url = await trackReviewClick(db, order.workspace_id as string).catch(
    () => null,
  );

  return NextResponse.redirect(url ? new URL(url) : fallback);
}
