import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de Privacidad — Agente CRM Inbox",
  description:
    "Cómo Agente CRM Inbox recopila, usa y protege los datos de mensajería de WhatsApp, Facebook Messenger e Instagram.",
};

export default function PrivacyPage() {
  return (
    <>
      <h1>Política de Privacidad</h1>
      <p>Última actualización: 12 de julio de 2026</p>

      <p>
        <strong>Agente CRM Inbox</strong> (el &quot;Servicio&quot;), operado por{" "}
        <strong>Synory Dev</strong> (&quot;nosotros&quot;), es una plataforma de
        bandeja de entrada unificada que permite a empresas gestionar y
        responder — con asistencia de inteligencia artificial — las
        conversaciones que sus clientes les envían por WhatsApp, Facebook
        Messenger e Instagram Direct. Esta política explica qué datos tratamos,
        con qué fin y qué derechos tenés sobre ellos.
      </p>

      <h2>1. Datos que recopilamos</h2>
      <ul>
        <li>
          <strong>Datos de cuenta del negocio:</strong> nombre, email y
          contraseña (cifrada) de los usuarios que administran un espacio de
          trabajo en el Servicio.
        </li>
        <li>
          <strong>Datos de mensajería:</strong> el contenido de los mensajes
          (texto, imágenes, audios, videos y documentos) que los clientes
          finales envían a las cuentas de WhatsApp Business, páginas de
          Facebook o cuentas profesionales de Instagram conectadas al Servicio,
          y las respuestas enviadas desde el Servicio.
        </li>
        <li>
          <strong>Datos de perfil del cliente final:</strong> nombre visible,
          identificador de usuario asignado por la plataforma (número de
          teléfono en WhatsApp; PSID/IGSID en Messenger e Instagram), nombre de
          usuario y foto de perfil pública, cuando la plataforma los provee.
        </li>
        <li>
          <strong>Tokens de acceso:</strong> credenciales de API otorgadas por
          el negocio al conectar sus cuentas (por ejemplo, tokens de página de
          Meta obtenidos mediante OAuth), usadas exclusivamente para operar la
          mensajería autorizada.
        </li>
      </ul>

      <h2>2. Cómo usamos los datos</h2>
      <ul>
        <li>Mostrar las conversaciones en la bandeja de entrada del negocio.</li>
        <li>
          Generar respuestas asistidas por IA en nombre del negocio, cuando el
          negocio activa esa función.
        </li>
        <li>
          Transcribir audios y describir imágenes recibidas, para que el
          negocio y su asistente de IA puedan entenderlos.
        </li>
        <li>Sincronizar contactos con el CRM del negocio, si éste lo configura.</li>
        <li>Operar, mantener y asegurar el Servicio.</li>
      </ul>
      <p>
        No vendemos datos personales ni los usamos para publicidad. Los datos
        obtenidos a través de las plataformas de Meta se usan únicamente para
        prestar la funcionalidad de mensajería descripta, conforme a las{" "}
        <a
          href="https://developers.facebook.com/terms/"
          className="underline"
          rel="noopener noreferrer"
          target="_blank"
        >
          Condiciones de la Plataforma de Meta
        </a>
        .
      </p>

      <h2>3. Con quién compartimos datos</h2>
      <p>
        Usamos proveedores de infraestructura que procesan datos por encargo
        nuestro: alojamiento y base de datos (Supabase, Vercel), APIs de
        mensajería (Meta Platforms, YCloud para WhatsApp), procesamiento de
        lenguaje para las respuestas de IA (OpenRouter y los modelos que el
        negocio configure) y procesamiento de pagos de suscripción
        (MercadoPago). Solo reciben los datos necesarios para su función.
      </p>

      <h2>4. Conservación y seguridad</h2>
      <p>
        Los datos se conservan mientras el negocio mantenga su cuenta activa o
        hasta que solicite su eliminación. Aplicamos cifrado en tránsito
        (HTTPS), controles de acceso por espacio de trabajo y verificación de
        firmas en todos los webhooks entrantes.
      </p>

      <h2>5. Tus derechos</h2>
      <p>
        Podés solicitar acceso, rectificación o eliminación de tus datos
        personales escribiendo a{" "}
        <a href="mailto:desarrollo@synory.dev" className="underline">
          desarrollo@synory.dev
        </a>
        . Si sos cliente final de un negocio que usa el Servicio, también podés
        dirigir tu solicitud a ese negocio. Consultá las instrucciones de
        eliminación de datos en{" "}
        <a href="/data-deletion" className="underline">
          /data-deletion
        </a>
        .
      </p>

      <h2>6. Cambios a esta política</h2>
      <p>
        Publicaremos cualquier cambio en esta página y actualizaremos la fecha
        de &quot;última actualización&quot;.
      </p>

      <h2>7. Contacto</h2>
      <p>
        Synory Dev — Salta, Argentina ·{" "}
        <a href="mailto:desarrollo@synory.dev" className="underline">
          desarrollo@synory.dev
        </a>
      </p>
    </>
  );
}
