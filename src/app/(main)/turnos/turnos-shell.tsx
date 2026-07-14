"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import AppointmentsTab from "./appointments-tab";
import ServicesTab from "./services-tab";
import HoursTab from "./hours-tab";

export default function TurnosShell({
  workspaceId,
  role,
}: {
  workspaceId: string;
  role: string;
}) {
  const canManage = ["admin", "manager"].includes(role);
  const [tab, setTab] = useState("agenda");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold text-foreground">
          Turnos
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Agenda, servicios y horarios de atención
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="servicios">Servicios</TabsTrigger>
          <TabsTrigger value="horarios">Horarios</TabsTrigger>
        </TabsList>

        <TabsContent value="agenda">
          <AppointmentsTab workspaceId={workspaceId} canManage={canManage} />
        </TabsContent>
        <TabsContent value="servicios">
          <ServicesTab workspaceId={workspaceId} canManage={canManage} />
        </TabsContent>
        <TabsContent value="horarios">
          <HoursTab workspaceId={workspaceId} canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
