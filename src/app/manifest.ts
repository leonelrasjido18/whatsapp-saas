import type { MetadataRoute } from "next";

// PWA manifest — makes the app installable on phones ("Agregar a inicio").
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agente WA",
    short_name: "Agente WA",
    description: "Panel del agente de WhatsApp con IA",
    start_url: "/inbox",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
