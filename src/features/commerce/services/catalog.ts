import type { SupabaseClient } from "@supabase/supabase-js";
import { CreateProductInput, AdjustStockInput, Product, ProductCategory } from "../types";

export async function getProducts(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select(`*, category:product_categories(*)`)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Product[];
}

export async function createProduct(
  supabase: SupabaseClient,
  workspaceId: string,
  input: CreateProductInput
): Promise<Product> {
  const { data, error } = await supabase
    .from("products")
    .insert({
      workspace_id: workspaceId,
      ...input,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

export async function updateProduct(
  supabase: SupabaseClient,
  workspaceId: string,
  productId: string,
  patch: Record<string, unknown>
): Promise<Product> {
  const { data, error } = await supabase
    .from("products")
    .update(patch)
    .eq("id", productId)
    .eq("workspace_id", workspaceId)
    .select()
    .single();
  if (error) throw error;
  return data as Product;
}

/**
 * Deletes a product. Order history is preserved (order_items.product_id is set
 * to NULL by the FK, and product_name is stored denormalized); stock movements
 * cascade-delete. Best-effort removes the product's images from Storage.
 */
export async function deleteProduct(
  supabase: SupabaseClient,
  workspaceId: string,
  productId: string
): Promise<void> {
  const { data: existing } = await supabase
    .from("products")
    .select("image_paths")
    .eq("id", productId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", productId)
    .eq("workspace_id", workspaceId);
  if (error) throw error;

  const paths = (existing?.image_paths as string[] | null) ?? [];
  if (paths.length > 0) {
    await supabase.storage
      .from("whatsapp-media")
      .remove(paths)
      .catch(() => {}); // non-fatal: DB row is already gone
  }
}

export async function getCategories(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<ProductCategory[]> {
  const { data, error } = await supabase
    .from("product_categories")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data as ProductCategory[];
}

export async function adjustStock(
  supabase: SupabaseClient,
  workspaceId: string,
  productId: string,
  userId: string,
  input: AdjustStockInput
): Promise<number> {
  const { data, error } = await supabase.rpc("adjust_stock", {
    p_workspace_id: workspaceId,
    p_product_id: productId,
    p_delta: input.delta,
    p_type: input.type,
    p_note: input.note || null,
    p_user_id: userId,
  });
  if (error) throw error;
  return data;
}
