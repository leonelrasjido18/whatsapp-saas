// Business type (vertical) drives which modules a workspace sees. One source of
// truth for the nav + settings visibility so the client only sees what applies
// to them (a shop doesn't see Turnos, a peluquería doesn't see Ventas).

export type BusinessType = "comercio" | "servicios" | "general";

export const BUSINESS_TYPES: {
  value: BusinessType;
  label: string;
  description: string;
}[] = [
  {
    value: "comercio",
    label: "Comercio",
    description: "Vende productos: catálogo, pedidos y cobros",
  },
  {
    value: "servicios",
    label: "Servicios / Turnos",
    description: "Da turnos: peluquería, consultorio, gimnasio",
  },
  {
    value: "general",
    label: "General",
    description: "Muestra todos los módulos",
  },
];

export function normalizeBusinessType(value: unknown): BusinessType {
  return value === "comercio" || value === "servicios" ? value : "general";
}

/** Whether the commerce module (Ventas: catálogo, pedidos, cobros) is shown. */
export function showsCommerce(type: BusinessType): boolean {
  return type === "comercio" || type === "general";
}

/** Whether the bookings module (Turnos: agenda, servicios, horarios) is shown. */
export function showsBookings(type: BusinessType): boolean {
  return type === "servicios" || type === "general";
}

/**
 * Maps a business type to the legacy agent use-case used to seed the starter
 * prompt and active agent at workspace creation.
 */
export function resolveUseCase(
  type: BusinessType,
): "setter" | "soporte" | "agendamiento" | "general" {
  if (type === "comercio") return "soporte";
  if (type === "servicios") return "agendamiento";
  return "general";
}

/**
 * Default agent tools to enable for a new workspace of this type, by tool key.
 * A shop starts able to sell; a services business starts able to book.
 */
export function defaultToolKeysForBusinessType(type: BusinessType): string[] {
  if (type === "comercio") {
    return [
      "catalog_search",
      "create_order",
      "generate_payment_link",
      "get_order_status",
      "send_product_image",
    ];
  }
  if (type === "servicios") {
    return [
      "check_availability_native",
      "book_appointment",
      "cancel_appointment",
      "get_order_status",
    ];
  }
  return ["catalog_search", "handoff_a_ventas"];
}
