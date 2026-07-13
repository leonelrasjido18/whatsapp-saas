"use client";

import { useEffect, useState } from "react";
import { formatArs } from "@/features/commerce/lib/money";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ClientMetric {
  id: string;
  name: string;
  phone: string;
  customer_tier: "new" | "regular" | "vip" | "inactive";
  total_spent: number;
  last_purchase_at?: string;
}

export default function ClientsTab({ workspaceId }: { workspaceId: string }) {
  const [clients, setClients] = useState<ClientMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/workspace/${workspaceId}/clients`);
        const json = await res.json();
        if (json.data) setClients(json.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [workspaceId]);

  const filtered = clients.filter(c => 
    (c.name || "").toLowerCase().includes(search.toLowerCase()) || 
    (c.phone || "").includes(search)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o teléfono..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-muted-foreground">Cargando clientes...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 border rounded-lg bg-muted/20">
          <p className="text-muted-foreground">No se encontraron clientes.</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
                <th className="px-4 py-3 font-medium">Clasificación</th>
                <th className="px-4 py-3 font-medium">Última Compra</th>
                <th className="px-4 py-3 font-medium text-right">Total Gastado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(client => (
                <tr key={client.id} className="bg-card hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{client.name || "Sin nombre"}</td>
                  <td className="px-4 py-3">{client.phone}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full font-bold ${
                      client.customer_tier === 'vip' ? 'bg-purple-100 text-purple-800' :
                      client.customer_tier === 'regular' ? 'bg-blue-100 text-blue-800' :
                      client.customer_tier === 'new' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {client.customer_tier}
                    </span>
                  </td>
                  <td className="px-4 py-3">{client.last_purchase_at ? new Date(client.last_purchase_at).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatArs(client.total_spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
