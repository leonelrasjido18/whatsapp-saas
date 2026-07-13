// Página pública de retorno de MercadoPago (no requiere login). Reemplaza el
// viejo back_url a /inbox, que rebotaba al login al cliente que pagaba.
// Usa el root layout (html/body); aquí sólo va el contenido.

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

const MESSAGES: Record<
  string,
  { emoji: string; title: string; subtitle: string; color: string }
> = {
  success: {
    emoji: "✅",
    title: "¡Pago recibido!",
    subtitle:
      "Tu pago se acreditó correctamente. Ya podés volver a WhatsApp: en breve recibís la confirmación de tu pedido.",
    color: "#16a34a",
  },
  pending: {
    emoji: "⏳",
    title: "Pago en proceso",
    subtitle:
      "Tu pago está siendo procesado. Cuando se acredite, te confirmamos el pedido por WhatsApp.",
    color: "#d97706",
  },
  failure: {
    emoji: "⚠️",
    title: "No se pudo completar el pago",
    subtitle:
      "El pago no se procesó. Podés volver a intentarlo desde WhatsApp o elegir otro medio de pago.",
    color: "#dc2626",
  },
};

export default async function PagoGraciasPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const m = MESSAGES[status ?? "success"] ?? MESSAGES.success;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: "100%",
          textAlign: "center",
          borderRadius: 20,
          padding: "40px 28px",
        }}
        className="border bg-card"
      >
        <div style={{ fontSize: 56, lineHeight: 1 }}>{m.emoji}</div>
        <h1
          style={{ fontSize: 24, margin: "20px 0 8px", color: m.color }}
          className="font-display font-semibold"
        >
          {m.title}
        </h1>
        <p className="text-sm text-muted-foreground" style={{ lineHeight: 1.55, margin: 0 }}>
          {m.subtitle}
        </p>
        <p className="text-xs text-muted-foreground/70" style={{ marginTop: 28 }}>
          Ya podés cerrar esta ventana y volver a la conversación.
        </p>
      </div>
    </main>
  );
}
