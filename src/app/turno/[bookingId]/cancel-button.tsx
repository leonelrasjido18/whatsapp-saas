"use client";

import { useState } from "react";

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );

  async function cancel() {
    if (!confirm("¿Seguro que querés cancelar el turno?")) return;
    setState("loading");
    try {
      const res = await fetch(`/api/turno/${bookingId}/cancel`, {
        method: "POST",
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
        Tu turno fue cancelado. ¡Gracias por avisar!
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={cancel}
        disabled={state === "loading"}
        className="w-full rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition disabled:opacity-50"
      >
        {state === "loading" ? "Cancelando…" : "Cancelar turno"}
      </button>
      {state === "error" && (
        <p className="text-xs text-red-600">No se pudo cancelar. Escribinos por WhatsApp.</p>
      )}
      <p className="text-center text-xs text-neutral-500">
        Para reprogramar, escribinos por WhatsApp y te damos otro horario.
      </p>
    </div>
  );
}
