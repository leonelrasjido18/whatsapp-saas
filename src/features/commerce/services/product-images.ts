import type { SupabaseClient } from "@supabase/supabase-js";

export const PRODUCT_MEDIA_BUCKET = "whatsapp-media";

/**
 * Returns signed URLs for a list of image paths in the bucket.
 */
export async function getSignedUrls(
  supabase: SupabaseClient,
  paths: string[],
  expiresIn: number = 3600
): Promise<string[]> {
  if (!paths || paths.length === 0) return [];
  const { data, error } = await supabase.storage
    .from(PRODUCT_MEDIA_BUCKET)
    .createSignedUrls(paths, expiresIn);
    
  if (error) {
    console.error("Error creating signed URLs:", error);
    return [];
  }
  
  return (data || []).map((d) => d.signedUrl).filter((url): url is string => Boolean(url));
}
