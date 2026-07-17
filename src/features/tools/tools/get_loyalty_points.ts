import { z } from "zod";
import { createClient as createSbClient } from "@supabase/supabase-js";
import { Tool } from "../core/tool";

// Lets the agent tell the customer their loyalty points balance.

function svc() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const schema = z.object({});

export const getLoyaltyPointsTool: Tool<z.infer<typeof schema>> = {
  name: "get_loyalty_points",
  description:
    "Consulta cuántos puntos de fidelidad acumuló el cliente. Usar cuando pregunta por sus puntos o beneficios.",
  sensitivity: "read",
  schema,
  enabledFor: () => true,
  run: async (_args, ctx) => {
    try {
      const { data } = await svc()
        .from("contacts")
        .select("loyalty_points")
        .eq("id", ctx.contactId)
        .maybeSingle();
      const points = Number(data?.loyalty_points ?? 0);
      return {
        ok: true,
        output: {
          points,
          message:
            points > 0
              ? `El cliente tiene ${points} puntos acumulados.`
              : "El cliente todavía no tiene puntos.",
        },
      };
    } catch (e) {
      return {
        ok: false,
        output: null,
        error: e instanceof Error ? e.message : "error",
      };
    }
  },
};
