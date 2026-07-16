// Native booking engine: availability computation from weekly rules minus
// existing appointments, plus create/cancel. Used by the agent tools, the cron
// reminders and the calendar UI.

import { createClient as createSbClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

function svc(): SupabaseClient {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface BookingService {
  id: string;
  name: string;
  duration_min: number;
  price: number;
  deposit_amount: number;
  active: boolean;
}

export interface AvailabilityRule {
  weekday: number; // 0=Sun … 6=Sat
  start_time: string; // "HH:MM:SS"
  end_time: string;
}

export interface Appointment {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  customer_name: string | null;
  service_id: string | null;
}

const SLOT_STEP_MIN = 30; // granularity of offered slots

/** "HH:MM:SS" → minutes since midnight. */
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/**
 * Computes free slots between `from` and `to` for a workspace. Slots are the
 * weekly open hours (availability_rules) minus already-booked appointments,
 * stepped at SLOT_STEP_MIN and sized to fit `durationMin`. Times are compared in
 * UTC (rules are interpreted against the appointment timestamps as stored).
 */
export async function computeAvailability(
  workspaceId: string,
  from: Date,
  to: Date,
  durationMin = 30,
): Promise<string[]> {
  const supabase = svc();

  const [{ data: rules }, { data: appts }] = await Promise.all([
    supabase
      .from("availability_rules")
      .select("weekday, start_time, end_time")
      .eq("workspace_id", workspaceId),
    supabase
      .from("bookings")
      .select("starts_at, ends_at")
      .eq("workspace_id", workspaceId)
      .in("status", ["pending", "confirmed"])
      .gte("starts_at", from.toISOString())
      .lte("starts_at", to.toISOString()),
  ]);

  if (!rules || rules.length === 0) return [];

  const busy = (appts ?? []).map((a) => ({
    start: new Date(a.starts_at as string).getTime(),
    end: new Date(a.ends_at as string).getTime(),
  }));

  const rulesByWeekday = new Map<number, AvailabilityRule[]>();
  for (const r of rules as AvailabilityRule[]) {
    const list = rulesByWeekday.get(r.weekday) ?? [];
    list.push(r);
    rulesByWeekday.set(r.weekday, list);
  }

  const slots: string[] = [];
  const durationMs = durationMin * 60 * 1000;
  const now = Date.now();

  // Walk each day in the range.
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor.getTime() <= to.getTime() && slots.length < 40) {
    const weekday = cursor.getUTCDay();
    const dayRules = rulesByWeekday.get(weekday) ?? [];

    for (const rule of dayRules) {
      const openMin = timeToMinutes(rule.start_time);
      const closeMin = timeToMinutes(rule.end_time);

      for (let m = openMin; m + durationMin <= closeMin; m += SLOT_STEP_MIN) {
        const slotStart = new Date(cursor);
        slotStart.setUTCMinutes(m);
        const startMs = slotStart.getTime();
        const endMs = startMs + durationMs;

        if (startMs < now) continue; // no past slots
        if (startMs < from.getTime() || startMs > to.getTime()) continue;

        const overlaps = busy.some((b) => startMs < b.end && endMs > b.start);
        if (!overlaps) {
          slots.push(slotStart.toISOString());
          if (slots.length >= 40) break;
        }
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return slots;
}

export async function listServices(
  workspaceId: string,
): Promise<BookingService[]> {
  const { data } = await svc()
    .from("booking_services")
    .select("id, name, duration_min, price, deposit_amount, active")
    .eq("workspace_id", workspaceId)
    .eq("active", true)
    .order("name");
  return (data as BookingService[]) ?? [];
}

export interface CreateAppointmentInput {
  workspaceId: string;
  contactId: string | null;
  conversationId: string | null;
  serviceId?: string | null;
  startsAt: string; // ISO
  customerName?: string | null;
  note?: string | null;
  createdBy?: string | null;
}

export interface CreateAppointmentResult {
  ok: boolean;
  appointment?: Appointment;
  /** Seña required to confirm (0 = none), plus the service name for the link. */
  depositAmount?: number;
  serviceName?: string | null;
  error?: string;
}

/**
 * Books an appointment after re-checking the slot is still free (guards against
 * a double-booking race between the agent's availability check and the write).
 */
export async function createAppointment(
  input: CreateAppointmentInput,
): Promise<CreateAppointmentResult> {
  const supabase = svc();
  const start = new Date(input.startsAt);
  if (Number.isNaN(start.getTime())) {
    return { ok: false, error: "Fecha de inicio inválida" };
  }

  let durationMin = 30;
  let depositAmount = 0;
  let serviceName: string | null = null;
  if (input.serviceId) {
    const { data: service } = await supabase
      .from("booking_services")
      .select("duration_min, deposit_amount, name")
      .eq("id", input.serviceId)
      .eq("workspace_id", input.workspaceId)
      .maybeSingle();
    if (service?.duration_min) durationMin = service.duration_min as number;
    depositAmount = Number(service?.deposit_amount ?? 0);
    serviceName = (service?.name as string | null) ?? null;
  }
  const end = new Date(start.getTime() + durationMin * 60 * 1000);

  // Conflict check: any pending/confirmed appointment overlapping this window.
  const { data: conflicts } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at")
    .eq("workspace_id", input.workspaceId)
    .in("status", ["pending", "confirmed"])
    .lt("starts_at", end.toISOString())
    .gt("ends_at", start.toISOString());

  if (conflicts && conflicts.length > 0) {
    return { ok: false, error: "Ese horario ya está ocupado" };
  }

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      workspace_id: input.workspaceId,
      contact_id: input.contactId,
      conversation_id: input.conversationId,
      service_id: input.serviceId ?? null,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: "confirmed",
      customer_name: input.customerName ?? null,
      note: input.note ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("id, starts_at, ends_at, status, customer_name, service_id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo agendar" };
  }
  return {
    ok: true,
    appointment: data as Appointment,
    depositAmount,
    serviceName,
  };
}

export async function listUpcomingForContact(
  workspaceId: string,
  contactId: string,
): Promise<Appointment[]> {
  const { data } = await svc()
    .from("bookings")
    .select("id, starts_at, ends_at, status, customer_name, service_id")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .in("status", ["pending", "confirmed"])
    .gte("starts_at", new Date().toISOString())
    .order("starts_at");
  return (data as Appointment[]) ?? [];
}

export async function cancelAppointment(
  workspaceId: string,
  appointmentId: string,
): Promise<boolean> {
  const { error } = await svc()
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("workspace_id", workspaceId)
    .eq("id", appointmentId)
    .in("status", ["pending", "confirmed"]);
  return !error;
}

// ── Management (settings UI) ──────────────────────────────────────────────────

export async function createService(
  workspaceId: string,
  input: {
    name: string;
    duration_min: number;
    price: number;
    deposit_amount?: number;
  },
): Promise<BookingService> {
  const { data, error } = await svc()
    .from("booking_services")
    .insert({ workspace_id: workspaceId, ...input })
    .select("id, name, duration_min, price, deposit_amount, active")
    .single();
  if (error) throw error;
  return data as BookingService;
}

export async function deleteService(
  workspaceId: string,
  serviceId: string,
): Promise<void> {
  // Soft-delete: keep past appointments' service reference intact.
  const { error } = await svc()
    .from("booking_services")
    .update({ active: false })
    .eq("workspace_id", workspaceId)
    .eq("id", serviceId);
  if (error) throw error;
}

export async function getAvailabilityRules(
  workspaceId: string,
): Promise<AvailabilityRule[]> {
  const { data } = await svc()
    .from("availability_rules")
    .select("weekday, start_time, end_time")
    .eq("workspace_id", workspaceId)
    .order("weekday");
  return (data as AvailabilityRule[]) ?? [];
}

/** Replaces the whole weekly ruleset atomically (delete-all then insert). */
export async function replaceAvailabilityRules(
  workspaceId: string,
  rules: AvailabilityRule[],
): Promise<void> {
  const supabase = svc();
  await supabase
    .from("availability_rules")
    .delete()
    .eq("workspace_id", workspaceId);

  if (rules.length === 0) return;
  const { error } = await supabase.from("availability_rules").insert(
    rules.map((r) => ({
      workspace_id: workspaceId,
      weekday: r.weekday,
      start_time: r.start_time,
      end_time: r.end_time,
    })),
  );
  if (error) throw error;
}

export interface AppointmentDetail extends Appointment {
  note: string | null;
  contact_id: string | null;
}

export async function listAppointmentsInRange(
  workspaceId: string,
  from: string,
  to: string,
): Promise<AppointmentDetail[]> {
  const { data } = await svc()
    .from("bookings")
    .select(
      "id, starts_at, ends_at, status, customer_name, service_id, note, contact_id",
    )
    .eq("workspace_id", workspaceId)
    .gte("starts_at", from)
    .lte("starts_at", to)
    .order("starts_at");
  return (data as AppointmentDetail[]) ?? [];
}

export async function updateAppointmentStatus(
  workspaceId: string,
  appointmentId: string,
  status: "confirmed" | "cancelled" | "no_show" | "done",
): Promise<boolean> {
  const { error } = await svc()
    .from("bookings")
    .update({ status })
    .eq("workspace_id", workspaceId)
    .eq("id", appointmentId);
  return !error;
}
