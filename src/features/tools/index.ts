import { registry } from "./registry";
import { echoTool } from "./tools/echo";
import { scheduleLinkTool } from "./tools/schedule-link";
import { scheduleHighLevelTool } from "./tools/schedule-highlevel";
import { checkAvailabilityTool } from "./tools/check-availability";
import { customWebhookTool } from "./tools/custom-webhook";
import { catalogSearchTool } from "./tools/catalog_search";
import { createOrderTool } from "./tools/create_order";
import { getOrderStatusTool } from "./tools/get_order_status";
import { generatePaymentLinkTool } from "./tools/generate_payment_link";
import { handoffAVentasTool } from "./tools/handoff_a_ventas";

registry.register(echoTool);
registry.register(scheduleLinkTool);
registry.register(scheduleHighLevelTool);
registry.register(checkAvailabilityTool);
registry.register(customWebhookTool);
registry.register(catalogSearchTool);
registry.register(createOrderTool);
registry.register(getOrderStatusTool);
registry.register(generatePaymentLinkTool);
registry.register(handoffAVentasTool);

export { registry };
export type {
  Tool,
  ToolContext,
  ToolResult,
  ToolSensitivity,
} from "./core/tool";
