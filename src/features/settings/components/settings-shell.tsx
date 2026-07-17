"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BusinessInfoForm } from "./business-info-form";
import { ToolsCatalog } from "./tools-catalog";
import { IntegrationsTab } from "./integrations-tab";
import { TeamTab } from "./team-tab";
import { TemplatesTab } from "./templates-tab";
import { AutomationsTab } from "./automations-tab";
import { KbTab } from "./kb-tab";
import { AiOnboardingTab } from "./ai-onboarding-tab";
import { LocationsTab } from "./locations-tab";
import { VoiceTab } from "./voice-tab";
import { ReviewsTab } from "./reviews-tab";
import { WebchatTab } from "./webchat-tab";
import { StorefrontTab } from "./storefront-tab";
import { CouponsTab } from "./coupons-tab";
import { AgentsTab } from "@/features/agents/components/agents-tab";
import { PromptImprovementTab } from "@/features/agents/components/prompt-improvement-tab";
import type { AgentDto } from "@/features/agents/types";
import {
  showsCommerce,
  type BusinessType,
} from "@/features/workspace/lib/business-type";

interface ToolItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  sensitivity: string | null;
  enabled: boolean;
  config: Record<string, unknown> | null;
}

interface Props {
  workspaceId: string;
  role: string;
  businessType?: BusinessType;
  initialBusinessInfo: Record<string, unknown> | null;
  initialTools: ToolItem[];
  initialIntegrations: unknown[];
  initialTemplates?: unknown[];
  initialAgents?: AgentDto[];
}

export function SettingsShell({
  workspaceId,
  businessType = "general",
  initialBusinessInfo,
  initialTools,
  initialIntegrations,
  initialTemplates = [],
  initialAgents = [],
}: Props) {
  // Coupons only make sense where there are orders to discount (commerce).
  const showCoupons = showsCommerce(businessType);
  const biForForm = initialBusinessInfo as {
    structured: Record<string, unknown>;
    free_text: string | null;
  } | null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="font-display text-xl font-semibold text-foreground mb-6">
        Configuración del Workspace
      </h1>

      <Tabs defaultValue="agentes">
        {/* Scroll the tab strip within its own track instead of letting 11 tabs
            push horizontal overflow onto the whole page. */}
        <div className="mb-6 -mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">
            <TabsTrigger value="agentes">Agentes</TabsTrigger>
            <TabsTrigger value="mejora-ia">Mejora IA</TabsTrigger>
            <TabsTrigger value="integraciones">Integraciones</TabsTrigger>
            <TabsTrigger value="negocio">Negocio</TabsTrigger>
            <TabsTrigger value="sucursales">Sucursales</TabsTrigger>
            <TabsTrigger value="voz">IA Telefónica</TabsTrigger>
            <TabsTrigger value="autocarga">Autocarga IA</TabsTrigger>
            <TabsTrigger value="tools">Tools</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="knowledge-base">Knowledge Base</TabsTrigger>
            <TabsTrigger value="resenas">Reseñas</TabsTrigger>
            <TabsTrigger value="webchat">Widget Web</TabsTrigger>
            {showCoupons && <TabsTrigger value="tienda">Tienda</TabsTrigger>}
            {showCoupons && <TabsTrigger value="cupones">Cupones</TabsTrigger>}
            <TabsTrigger value="equipo">Equipo</TabsTrigger>
            <TabsTrigger value="automatizaciones">Automatizaciones</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="agentes">
          <div className="p-6 space-y-6 rounded-lg border border-border/60 bg-card">
            <AgentsTab
              workspaceId={workspaceId}
              initialAgents={initialAgents}
            />
          </div>
        </TabsContent>

        <TabsContent value="mejora-ia">
          <div className="p-6 space-y-6 rounded-lg border border-border/60 bg-card">
            <PromptImprovementTab workspaceId={workspaceId} />
          </div>
        </TabsContent>

        <TabsContent value="integraciones">
          <div className="p-6 space-y-6 rounded-lg border border-border/60 bg-card">
            <IntegrationsTab
              workspaceId={workspaceId}
              initialIntegrations={initialIntegrations}
            />
          </div>
        </TabsContent>

        <TabsContent value="negocio">
          <div className="p-6 space-y-6 rounded-lg border border-border/60 bg-card">
            <BusinessInfoForm workspaceId={workspaceId} initial={biForForm} />
          </div>
        </TabsContent>

        <TabsContent value="sucursales">
          <div className="p-6 space-y-6 rounded-lg border border-border/60 bg-card">
            <LocationsTab workspaceId={workspaceId} />
          </div>
        </TabsContent>

        <TabsContent value="voz">
          <div className="p-6 space-y-6 rounded-lg border border-border/60 bg-card">
            <VoiceTab workspaceId={workspaceId} />
          </div>
        </TabsContent>

        <TabsContent value="autocarga">
          <div className="p-6 space-y-6 rounded-lg border border-border/60 bg-card">
            <AiOnboardingTab workspaceId={workspaceId} />
          </div>
        </TabsContent>

        <TabsContent value="tools">
          <div className="p-6 space-y-6 rounded-lg border border-border/60 bg-card">
            <ToolsCatalog
              workspaceId={workspaceId}
              initialTools={initialTools}
            />
          </div>
        </TabsContent>

        <TabsContent value="templates">
          <div className="p-6 rounded-lg border border-border/60 bg-card">
            <TemplatesTab
              workspaceId={workspaceId}
              initialTemplates={initialTemplates}
            />
          </div>
        </TabsContent>
        <TabsContent value="knowledge-base">
          <div className="p-6 space-y-6 rounded-lg border border-border/60 bg-card">
            <KbTab workspaceId={workspaceId} />
          </div>
        </TabsContent>

        <TabsContent value="resenas">
          <div className="p-6 space-y-6 rounded-lg border border-border/60 bg-card">
            <ReviewsTab workspaceId={workspaceId} />
          </div>
        </TabsContent>

        <TabsContent value="webchat">
          <div className="p-6 space-y-6 rounded-lg border border-border/60 bg-card">
            <WebchatTab workspaceId={workspaceId} />
          </div>
        </TabsContent>

        {showCoupons && (
          <TabsContent value="tienda">
            <div className="p-6 space-y-6 rounded-lg border border-border/60 bg-card">
              <StorefrontTab workspaceId={workspaceId} />
            </div>
          </TabsContent>
        )}

        {showCoupons && (
          <TabsContent value="cupones">
            <div className="p-6 space-y-6 rounded-lg border border-border/60 bg-card">
              <CouponsTab workspaceId={workspaceId} />
            </div>
          </TabsContent>
        )}

        <TabsContent value="equipo">
          <div className="p-6 space-y-6 rounded-lg border border-border/60 bg-card">
            <TeamTab workspaceId={workspaceId} />
          </div>
        </TabsContent>

        <TabsContent value="automatizaciones">
          <div className="p-6 space-y-6 rounded-lg border border-border/60 bg-card">
            <AutomationsTab workspaceId={workspaceId} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
