'use server';

/**
 * Billing server actions (super-admin only)
 * - Generate payment links
 * - Record manual payments
 * - Change plans
 * - Suspend/reactivate workspaces
 */

import { createServerClient } from '@supabase/ssr';
import { createClient as createSbClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getMercadoPagoClient } from './mercadopago-client';
import { getPlan, type PlanTier } from '../plans';
import type { Payment, SubscriptionStatus } from '@/shared/types/billing';

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getUser() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: any }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Ignore
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

async function isSuperAdmin(): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;

  const { data } = await svc()
    .from('users')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  return data?.is_super_admin ?? false;
}

/**
 * Generate a payment link for MercadoPago subscription
 */
export async function generatePaymentLink(
  workspaceId: string,
  planTier: PlanTier,
  backUrl?: string,
): Promise<{ success: boolean; init_point?: string; error?: string }> {
  if (!(await isSuperAdmin())) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Get workspace and user info
    const { data: workspace } = await svc()
      .from('workspaces')
      .select('id, name')
      .eq('id', workspaceId)
      .single();

    if (!workspace) {
      return { success: false, error: 'Workspace not found' };
    }

    // Get first admin email (for MercadoPago payer)
    const { data: member } = await svc()
      .from('memberships')
      .select('users!inner(email)')
      .eq('workspace_id', workspaceId)
      .eq('role', 'admin')
      .limit(1)
      .single();

    if (!member || !('users' in member) || !member.users) {
      return { success: false, error: 'No admin found for workspace' };
    }

    const adminEmail = (member.users as any).email;
    const plan = getPlan(planTier);

    // Create preapproval link
    const mp = getMercadoPagoClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const finalBackUrl =
      backUrl ||
      `${appUrl}/(agency)/workspaces/${workspaceId}/billing?payment=success`;

    const { init_point, preapproval_id } = await mp.createPreapprovalLink(
      workspaceId,
      workspace.name,
      plan.price_ars,
      adminEmail,
      finalBackUrl,
    );

    // Store preapproval_id in workspace for reference
    await svc()
      .from('workspaces')
      .update({ mercadopago_subscription_id: preapproval_id })
      .eq('id', workspaceId);

    return { success: true, init_point };
  } catch (err) {
    console.error('[billing] generatePaymentLink error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Record a manual payment (owner marks it as paid by transfer, etc.)
 */
export async function markWorkspaceAsPaidManually(
  workspaceId: string,
  amount: number,
  currency: string = 'ARS',
  notes?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!(await isSuperAdmin())) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const user = await getUser();
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Insert payment record
    const { error: paymentError } = await svc()
      .from('payments')
      .insert({
        workspace_id: workspaceId,
        amount,
        currency,
        method: 'manual',
        status: 'approved',
        recorded_by: user.id,
      });

    if (paymentError) {
      throw paymentError;
    }

    // Update workspace subscription status to active
    const { error: wsError } = await svc()
      .from('workspaces')
      .update({
        subscription_status: 'active',
        billing_notes: notes || null,
      })
      .eq('id', workspaceId);

    if (wsError) {
      throw wsError;
    }

    return { success: true };
  } catch (err) {
    console.error('[billing] markWorkspaceAsPaidManually error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Change workspace plan (upgrade/downgrade)
 */
export async function changeWorkspacePlan(
  workspaceId: string,
  newTier: PlanTier,
): Promise<{ success: boolean; error?: string }> {
  if (!(await isSuperAdmin())) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Verify plan exists
    getPlan(newTier); // Throws if invalid

    const { error } = await svc()
      .from('workspaces')
      .update({
        plan_tier: newTier,
      })
      .eq('id', workspaceId);

    if (error) throw error;

    return { success: true };
  } catch (err) {
    console.error('[billing] changeWorkspacePlan error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Suspend a workspace (stop processing messages)
 */
export async function suspendWorkspace(
  workspaceId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  if (!(await isSuperAdmin())) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const { error } = await svc()
      .from('workspaces')
      .update({
        subscription_status: 'suspended',
        billing_notes: reason || 'Suspended by admin',
      })
      .eq('id', workspaceId);

    if (error) throw error;

    return { success: true };
  } catch (err) {
    console.error('[billing] suspendWorkspace error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Reactivate a suspended workspace
 */
export async function reactivateWorkspace(
  workspaceId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!(await isSuperAdmin())) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const { error } = await svc()
      .from('workspaces')
      .update({
        subscription_status: 'active',
      })
      .eq('id', workspaceId);

    if (error) throw error;

    return { success: true };
  } catch (err) {
    console.error('[billing] reactivateWorkspace error:', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Get billing history for a workspace
 */
export async function getWorkspacePaymentHistory(
  workspaceId: string,
): Promise<{ payments: Payment[]; error?: string }> {
  if (!(await isSuperAdmin())) {
    return { payments: [], error: 'Unauthorized' };
  }

  try {
    const { data, error } = await svc()
      .from('payments')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return { payments: data || [] };
  } catch (err) {
    console.error('[billing] getWorkspacePaymentHistory error:', err);
    return {
      payments: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
