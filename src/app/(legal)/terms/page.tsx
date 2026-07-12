import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Condiciones del Servicio — Agente CRM Inbox",
  description: "Condiciones de uso de la plataforma Agente CRM Inbox.",
};

export default function TermsPage() {
  return (
    <>
      <h1>Condiciones del Servicio</h1>
      <p>Última actualización: 12 de julio de 2026</p>

      <h2>1. El Servicio</h2>
      <p>
        <strong>Agente CRM Inbox</strong>, operado por{" "}
        <strong>Synory Dev</strong>, es una plataforma SaaS que centraliza en
        una bandeja de entrada las conversaciones de WhatsApp, Facebook
        Messenger e Instagram Direct de un negocio, con respuestas asistidas
        por inteligencia artificial. Al crear una cuenta aceptás estas
        condiciones.
      </p>

      <h2>2. Cuentas y conexiones</h2>
      <ul>
        <li>
          Debés proporcionar información veraz y mantener la confidencialidad
          de tus credenciales.
        </li>
        <li>
          Al conectar cuentas de terceros (WhatsApp Business, páginas de
          Facebook, cuentas de Instagram) declarás tener autoridad sobre ellas
          y aceptás las condiciones de esas plataformas, incluidas las{" "}
          <a
            href="https://developers.facebook.com/terms/"
            className="underline"
            rel="noopener noreferrer"
            target="_blank"
          >
            Condiciones de la Plataforma de Meta
          </a>{" "}
          y las políticas de mensajería comercial aplicables.
        </li>
      </ul>

      <h2>3. Uso aceptable</h2>
      <ul>
        <li>No enviar spam ni mensajes a personas que no lo consintieron.</li>
        <li>
          No usar el Servicio para contenido ilegal, engañoso, difamatorio o
          que infrinja derechos de terceros.
        </li>
        <li>
          Respetar las ventanas de mensajería y reglas anti-abuso de cada
          plataforma; el Servicio puede bloquear envíos que las violen.
        </li>
      </ul>

      <h2>4. Inteligencia artificial</h2>
      <p>
        Las respuestas generadas por IA se producen en nombre del negocio y
        bajo su configuración y supervisión. El negocio es responsable del
        contenido que su asistente envía y puede desactivar la IA por
        conversación en cualquier momento.
      </p>

      <h2>5. Pagos</h2>
      <p>
        Las suscripciones se cobran por adelantado a través de MercadoPago. La
        falta de pago puede suspender el Servicio hasta regularizarse.
      </p>

      <h2>6. Disponibilidad y responsabilidad</h2>
      <p>
        El Servicio se presta &quot;tal cual&quot;. Dependemos de APIs de
        terceros (Meta, YCloud, proveedores de IA) cuya disponibilidad no
        controlamos. En la máxima medida permitida por la ley, nuestra
        responsabilidad total se limita a los importes abonados por el negocio
        en los últimos 3 meses.
      </p>

      <h2>7. Terminación</h2>
      <p>
        Podés cancelar tu cuenta cuando quieras. Podemos suspender cuentas que
        violen estas condiciones. Tras la terminación aplican los plazos de
        eliminación descriptos en la{" "}
        <a href="/privacy" className="underline">
          Política de Privacidad
        </a>
        .
      </p>

      <h2>8. Contacto</h2>
      <p>
        Synory Dev — Salta, Argentina ·{" "}
        <a href="mailto:desarrollo@synory.dev" className="underline">
          desarrollo@synory.dev
        </a>
      </p>
    </>
  );
}
