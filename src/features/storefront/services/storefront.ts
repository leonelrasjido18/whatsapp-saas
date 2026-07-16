// storefront.ts — #2 public mini-site. Read the settings for the owner's config
// panel, resolve the public page by public_key, and assemble the public catalog
// (active products with signed image URLs + the WhatsApp deep link).

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { getSignedUrls } from "@/features/commerce/services/product-images";

function svc(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface StorefrontSettings {
  workspace_id: string;
  enabled: boolean;
  public_key: string;
  headline: string | null;
  subheadline: string | null;
  whatsapp_phone: string | null;
  accent_color: string;
  show_prices: boolean;
}

export interface StorefrontProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  type: "product" | "service";
  imageUrl: string | null;
}

export interface PublicStorefront {
  businessName: string;
  headline: string | null;
  subheadline: string | null;
  accentColor: string;
  showPrices: boolean;
  /** E.164 digits (no +) for the wa.me link; null when no number configured. */
  whatsappDigits: string | null;
  products: StorefrontProduct[];
}

/**
 * Returns the workspace's storefront settings, creating the row on first read so
 * the owner always has a public_key to build the URL/QR from. Uses the caller's
 * RLS-scoped client.
 */
export async function getOrCreateStorefrontSettings(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<StorefrontSettings> {
  const { data } = await supabase
    .from("storefront_settings")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (data) return data as StorefrontSettings;

  const { data: created, error } = await supabase
    .from("storefront_settings")
    .insert({ workspace_id: workspaceId })
    .select("*")
    .single();
  if (error) throw error;
  return created as StorefrontSettings;
}

export interface UpdateStorefrontInput {
  enabled?: boolean;
  headline?: string | null;
  subheadline?: string | null;
  whatsapp_phone?: string | null;
  accent_color?: string;
  show_prices?: boolean;
}

export async function updateStorefrontSettings(
  supabase: SupabaseClient,
  workspaceId: string,
  input: UpdateStorefrontInput,
): Promise<StorefrontSettings> {
  await getOrCreateStorefrontSettings(supabase, workspaceId);
  const { data, error } = await supabase
    .from("storefront_settings")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .select("*")
    .single();
  if (error) throw error;
  return data as StorefrontSettings;
}

/** Digits-only phone for wa.me links (strips +, spaces, dashes). */
function toWaDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/**
 * Assembles the public storefront for a given public_key using the service role.
 * Returns null when the key is unknown or the storefront is disabled.
 */
export async function getPublicStorefront(
  publicKey: string,
): Promise<PublicStorefront | null> {
  const supabase = svc();

  const { data: settings } = await supabase
    .from("storefront_settings")
    .select("*")
    .eq("public_key", publicKey)
    .maybeSingle();

  if (!settings || !settings.enabled) return null;

  const workspaceId = settings.workspace_id as string;

  const [{ data: workspace }, { data: products }, { data: ycloud }] =
    await Promise.all([
      supabase.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
      supabase
        .from("products")
        .select("id, name, description, price, type, image_paths")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("integrations")
        .select("config")
        .eq("workspace_id", workspaceId)
        .eq("provider", "ycloud")
        .maybeSingle(),
    ]);

  // Resolve one signed image URL per product (first photo).
  const firstPaths = (products ?? [])
    .map((p) => (p.image_paths as string[] | null)?.[0])
    .filter((p): p is string => Boolean(p));
  const signed = await getSignedUrls(supabase, firstPaths, 24 * 3600);
  const urlByPath = new Map<string, string>();
  firstPaths.forEach((path, i) => {
    if (signed[i]) urlByPath.set(path, signed[i]);
  });

  const storefrontProducts: StorefrontProduct[] = (products ?? []).map((p) => {
    const firstPath = (p.image_paths as string[] | null)?.[0];
    return {
      id: p.id as string,
      name: p.name as string,
      description: (p.description as string | null) ?? null,
      price: Number(p.price ?? 0),
      type: (p.type as "product" | "service") ?? "product",
      imageUrl: firstPath ? (urlByPath.get(firstPath) ?? null) : null,
    };
  });

  const ycloudPhone = (ycloud?.config as Record<string, unknown> | null)
    ?.phone_number as string | undefined;
  const whatsappDigits = toWaDigits(
    (settings.whatsapp_phone as string | null) ?? ycloudPhone,
  );

  return {
    businessName: (workspace?.name as string) ?? "Nuestra tienda",
    headline: (settings.headline as string | null) ?? null,
    subheadline: (settings.subheadline as string | null) ?? null,
    accentColor: (settings.accent_color as string) ?? "#2563eb",
    showPrices: (settings.show_prices as boolean) ?? true,
    whatsappDigits,
    products: storefrontProducts,
  };
}
