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
import { sendProductImageTool } from "./tools/send_product_image";
import { sendQuickRepliesTool } from "./tools/send_quick_replies";
import { sendVoiceNoteTool } from "./tools/send_voice_note";
import { suggestRelatedProductsTool } from "./tools/suggest_related_products";
import { checkAvailabilityNativeTool } from "./tools/check-availability-native";
import { bookAppointmentTool } from "./tools/book-appointment";
import { cancelAppointmentTool } from "./tools/cancel-appointment";

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
registry.register(sendProductImageTool);
registry.register(sendQuickRepliesTool);
registry.register(sendVoiceNoteTool);
registry.register(suggestRelatedProductsTool);
registry.register(checkAvailabilityNativeTool);
registry.register(bookAppointmentTool);
registry.register(cancelAppointmentTool);

export { registry };
export type {
  Tool,
  ToolContext,
  ToolResult,
  ToolSensitivity,
} from "./core/tool";
