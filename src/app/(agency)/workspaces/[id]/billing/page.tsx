'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import type { PlanTier } from '@/shared/types/billing';
import type { Payment } from '@/shared/types/billing';
import {
  generatePaymentLink,
  markWorkspaceAsPaidManually,
  changeWorkspacePlan,
  suspendWorkspace,
  reactivateWorkspace,
  getWorkspacePaymentHistory,
} from '@/features/billing/services/billing-actions';
import { PLANS } from '@/features/billing/plans';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface WorkspaceInfo {
  id: string;
  name: string;
  plan_tier: PlanTier;
  subscription_status: string;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  past_due: 'bg-yellow-100 text-yellow-800',
  suspended: 'bg-red-100 text-red-800',
  trial: 'bg-blue-100 text-blue-800',
};

export default function BillingPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>('starter');
  const [manualAmount, setManualAmount] = useState('');
  const [manualNotes, setManualNotes] = useState('');

  // Fetch workspace info (in real app, would come from server component)
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        // Get payment history
        const { payments: paymentData } = await getWorkspacePaymentHistory(workspaceId);
        setPayments(paymentData);

        // TODO: Fetch workspace info from server action
      } catch (err) {
        console.error('Failed to load billing data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [workspaceId]);

  const handleGeneratePaymentLink = async () => {
    setLoading(true);
    try {
      const result = await generatePaymentLink(
        workspaceId,
        selectedPlan,
        `${window.location.origin}/(agency)/workspaces/${workspaceId}/billing?payment=success`,
      );

      if (result.success && result.init_point) {
        // Redirect to MercadoPago
        window.location.href = result.init_point;
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      console.error('Failed to generate payment link:', err);
      alert('Error generando link de pago');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPaid = async () => {
    if (!manualAmount || !workspace) return;

    setLoading(true);
    try {
      const result = await markWorkspaceAsPaidManually(
        workspaceId,
        parseFloat(manualAmount),
        'ARS',
        manualNotes || undefined,
      );

      if (result.success) {
        alert('Pago registrado exitosamente');
        setManualAmount('');
        setManualNotes('');
        // Refresh payments
        const { payments: paymentData } = await getWorkspacePaymentHistory(workspaceId);
        setPayments(paymentData);
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      console.error('Failed to mark as paid:', err);
      alert('Error registrando pago');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePlan = async () => {
    setLoading(true);
    try {
      const result = await changeWorkspacePlan(workspaceId, selectedPlan);

      if (result.success) {
        alert('Plan actualizado');
        // Reload workspace
        if (workspace) {
          setWorkspace({ ...workspace, plan_tier: selectedPlan });
        }
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      console.error('Failed to change plan:', err);
      alert('Error cambiando plan');
    } finally {
      setLoading(false);
    }
  };

  const handleSuspend = async () => {
    if (!confirm('¿Suspender este workspace?')) return;

    setLoading(true);
    try {
      const result = await suspendWorkspace(workspaceId);

      if (result.success) {
        alert('Workspace suspendido');
        if (workspace) {
          setWorkspace({ ...workspace, subscription_status: 'suspended' });
        }
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      console.error('Failed to suspend:', err);
      alert('Error suspendiendo workspace');
    } finally {
      setLoading(false);
    }
  };

  const handleReactivate = async () => {
    setLoading(true);
    try {
      const result = await reactivateWorkspace(workspaceId);

      if (result.success) {
        alert('Workspace reactivado');
        if (workspace) {
          setWorkspace({ ...workspace, subscription_status: 'active' });
        }
      } else {
        alert(`Error: ${result.error}`);
      }
    } catch (err) {
      console.error('Failed to reactivate:', err);
      alert('Error reactivando workspace');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !workspace) {
    return <div className="p-6">Cargando...</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Billing: {workspace?.name || workspaceId}</h1>
      </div>

      {/* Current Plan & Status */}
      {workspace && (
        <Card>
          <CardHeader>
            <CardTitle>Estado Actual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Plan</p>
                <p className="text-lg font-semibold">{PLANS[workspace.plan_tier].name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Estado de suscripción</p>
                <Badge className={statusColors[workspace.subscription_status]}>
                  {workspace.subscription_status}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Links */}
      <Card>
        <CardHeader>
          <CardTitle>Generar Link de Pago</CardTitle>
          <CardDescription>Crear un link de suscripción en MercadoPago</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Seleccionar Plan</label>
            <select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value as PlanTier)}
              className="w-full border rounded px-3 py-2"
            >
              {Object.entries(PLANS).map(([tier, plan]) => (
                <option key={tier} value={tier}>
                  {plan.name} - ${plan.price_ars} ARS/mes
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleGeneratePaymentLink} disabled={loading}>
            Generar Link MercadoPago
          </Button>
        </CardContent>
      </Card>

      {/* Manual Payment */}
      <Card>
        <CardHeader>
          <CardTitle>Registrar Pago Manual</CardTitle>
          <CardDescription>Marcar como pagado (transferencia, efectivo, etc.)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Monto (ARS)</label>
            <input
              type="number"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Notas (opcional)</label>
            <textarea
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              className="w-full border rounded px-3 py-2"
              placeholder="Ej: Transferencia bancaria, número de referencia..."
            />
          </div>
          <Button onClick={handleMarkAsPaid} disabled={loading || !manualAmount}>
            Registrar Pago
          </Button>
        </CardContent>
      </Card>

      {/* Change Plan */}
      <Card>
        <CardHeader>
          <CardTitle>Cambiar Plan</CardTitle>
          <CardDescription>Upgrade/downgrade del plan del cliente</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Nuevo Plan</label>
            <select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(e.target.value as PlanTier)}
              className="w-full border rounded px-3 py-2"
            >
              {Object.entries(PLANS).map(([tier, plan]) => (
                <option key={tier} value={tier}>
                  {plan.name}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={handleChangePlan} disabled={loading}>
            Actualizar Plan
          </Button>
        </CardContent>
      </Card>

      {/* Suspend/Reactivate */}
      <Card>
        <CardHeader>
          <CardTitle>Controlar Acceso</CardTitle>
          <CardDescription>Suspender o reactivar el workspace</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {workspace?.subscription_status === 'suspended' ? (
              <Button onClick={handleReactivate} disabled={loading} variant="default">
                Reactivar Workspace
              </Button>
            ) : (
              <Button onClick={handleSuspend} disabled={loading} variant="destructive">
                Suspender Workspace
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle>Historial de Pagos</CardTitle>
          <CardDescription>Todos los pagos registrados para este workspace</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-gray-500">No hay pagos registrados</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2">Fecha</th>
                    <th className="text-left px-4 py-2">Monto</th>
                    <th className="text-left px-4 py-2">Método</th>
                    <th className="text-left px-4 py-2">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-t">
                      <td className="px-4 py-2">
                        {new Date(payment.created_at).toLocaleDateString('es-AR')}
                      </td>
                      <td className="px-4 py-2">${payment.amount} {payment.currency}</td>
                      <td className="px-4 py-2 capitalize">{payment.method}</td>
                      <td className="px-4 py-2">
                        <Badge
                          className={
                            payment.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }
                        >
                          {payment.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
