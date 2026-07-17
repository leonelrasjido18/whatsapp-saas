// locations.ts — branches (sucursales) CRUD + agent context helper.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSbClient } from "@supabase/supabase-js";

function svc(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface Location {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  hours: string | null;
  is_active: boolean;
}

export async function listLocations(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<Location[]> {
  const { data } = await supabase
    .from("locations")
    .select("id, name, address, phone, hours, is_active")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  return (data as Location[]) ?? [];
}

export async function createLocation(
  supabase: SupabaseClient,
  workspaceId: string,
  input: { name: string; address?: string; phone?: string; hours?: string },
): Promise<Location> {
  const { data, error } = await supabase
    .from("locations")
    .insert({ workspace_id: workspaceId, ...input })
    .select("id, name, address, phone, hours, is_active")
    .single();
  if (error) throw error;
  return data as Location;
}

export async function deleteLocation(
  supabase: SupabaseClient,
  workspaceId: string,
  locationId: string,
): Promise<void> {
  await supabase
    .from("locations")
    .update({ is_active: false })
    .eq("workspace_id", workspaceId)
    .eq("id", locationId);
}

/**
 * Prompt block listing the branches, so the agent can answer "¿dónde están?"
 * and direct customers to the right one. Returns "" when there are 0-1 branches
 * (a single location is already covered by the business info).
 */
export async function buildLocationsContext(
  workspaceId: string,
): Promise<string> {
  const locations = await listLocations(svc(), workspaceId);
  if (locations.length < 2) return "";

  const lines = locations.map((l) => {
    const parts = [l.name];
    if (l.address) parts.push(`📍 ${l.address}`);
    if (l.hours) parts.push(`🕒 ${l.hours}`);
    if (l.phone) parts.push(`📞 ${l.phone}`);
    return `- ${parts.join(" · ")}`;
  });

  return (
    "## Sucursales\n" +
    "El negocio tiene varias sucursales. Si el cliente pregunta por ubicación, " +
    "horarios o quiere reservar/comprar, ayudalo a elegir la sucursal correcta:\n" +
    lines.join("\n")
  );
}
