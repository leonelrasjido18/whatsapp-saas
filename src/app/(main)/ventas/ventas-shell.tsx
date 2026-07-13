"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plan } from "@/features/billing/plans";
import CatalogTab from "./catalog-tab";
import OrdersTab from "./orders-tab";
import ClientsTab from "./clients-tab";
import BalancesTab from "./balances-tab";

interface VentasShellProps {
  workspaceId: string;
  role: string;
  plan: Plan;
}

export default function VentasShell({ workspaceId, role, plan }: VentasShellProps) {
  const [activeTab, setActiveTab] = useState("catalog");

  return (
    <div className="h-full flex flex-col p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Comercio</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona tu catálogo, ventas, clientes y balances.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full md:w-auto self-start">
          <TabsTrigger value="catalog">Catálogo</TabsTrigger>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="balances">Balances</TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-auto mt-4 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <TabsContent value="catalog" className="h-full m-0">
            <CatalogTab workspaceId={workspaceId} role={role} />
          </TabsContent>
          <TabsContent value="ventas" className="h-full m-0">
            <OrdersTab workspaceId={workspaceId} role={role} />
          </TabsContent>
          <TabsContent value="clientes" className="h-full m-0">
            <ClientsTab workspaceId={workspaceId} />
          </TabsContent>
          <TabsContent value="balances" className="h-full m-0 p-4 overflow-y-auto">
            <BalancesTab workspaceId={workspaceId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
