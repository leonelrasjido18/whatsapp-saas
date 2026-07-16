// #1 AI onboarding — apply. Commits an owner-reviewed proposal into business_info,
// products and the KB.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireWorkspaceMember,
  readJsonBody,
} from "@/lib/auth/workspace-access";
import { applyOnboardingProposal } from "@/features/onboarding/services/onboarding-ai";

export const maxDuration = 60;

const ProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  price: z.number().nullable(),
  type: z.enum(["product", "service"]),
});

const ProposalSchema = z.object({
  business: z.object({
    name: z.string().nullable(),
    description: z.string().nullable(),
    address: z.string().nullable(),
    hours: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    website: z.string().nullable(),
  }),
  products: z.array(ProductSchema).max(40),
  faqs: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .max(12),
  rawText: z.string().max(30_000),
});

const BodySchema = z.object({
  proposal: ProposalSchema,
  options: z.object({
    applyBusiness: z.boolean(),
    applyProducts: z.boolean(),
    applyFaqs: z.boolean(),
  }),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: workspaceId } = await params;

  const auth = await requireWorkspaceMember(workspaceId, { minRole: "manager" });
  if (!auth.ok) return auth.response;

  const parsed = await readJsonBody(req);
  if (!parsed.ok) return parsed.response;

  const body = BodySchema.safeParse(parsed.body);
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  try {
    const result = await applyOnboardingProposal(
      workspaceId,
      body.data.proposal,
      body.data.options,
    );
    return NextResponse.json({ data: result });
  } catch (err) {
    console.error("[onboarding-ai/apply]:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al aplicar" },
      { status: 500 },
    );
  }
}
