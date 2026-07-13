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
