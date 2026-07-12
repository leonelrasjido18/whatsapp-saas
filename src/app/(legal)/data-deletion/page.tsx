import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Eliminación de Datos — Agente CRM Inbox",
  description:
    "Cómo solicitar la eliminación de tus datos personales de Agente CRM Inbox.",
};

export default function DataDeletionPage() {
  return (
    <>
      <h1>Instrucciones para la Eliminación de Datos</h1>
      <p>Última actualización: 12 de julio de 2026</p>

      <p>
        Podés solicitar la eliminación de los datos personales que{" "}
        <strong>Agente CRM Inbox</strong> (Synory Dev) almacena sobre vos,
        según tu caso:
      </p>

      <h2>Si sos cliente final (le escribiste a un negocio por WhatsApp, Messenger o Instagram)</h2>
      <ul>
        <li>
          Enviá un email a{" "}
          <a href="mailto:desarrollo@synory.dev" className="underline">
            desarrollo@synory.dev
          </a>{" "}
          con el asunto <strong>&quot;Eliminación de datos&quot;</strong>,
          indicando la plataforma (WhatsApp / Messenger / Instagram), tu número
          de teléfono o nombre de usuario, y el negocio con el que conversaste.
        </li>
        <li>
          También podés pedírselo directamente al negocio, que puede eliminar
          tu contacto y conversaciones desde la plataforma.
        </li>
      </ul>

      <h2>Si sos un negocio con cuenta en el Servicio</h2>
      <ul>
        <li>
          Al desconectar tus integraciones (Configuración → Integraciones) se
          eliminan los tokens de acceso de forma inmediata.
        </li>
        <li>
          Para eliminar tu espacio de trabajo completo (contactos,
          conversaciones, mensajes y archivos multimedia), escribí a{" "}
          <a href="mailto:desarrollo@synory.dev" className="underline">
            desarrollo@synory.dev
          </a>{" "}
          desde el email de tu cuenta.
        </li>
      </ul>

      <h2>Plazos</h2>
      <p>
        Confirmamos la recepción dentro de las 72 horas y completamos la
        eliminación en un máximo de <strong>30 días</strong>, salvo datos que
        debamos conservar por obligación legal (por ejemplo, comprobantes de
        facturación). La eliminación incluye copias de seguridad en el
        siguiente ciclo de rotación.
      </p>

      <h2>Contacto</h2>
      <p>
        Synory Dev ·{" "}
        <a href="mailto:desarrollo@synory.dev" className="underline">
          desarrollo@synory.dev
        </a>
      </p>
    </>
  );
}
