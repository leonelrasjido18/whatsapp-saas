import type { YCloudComponent } from "@/features/settings/lib/template-form";

const YCLOUD_BASE_URL = "https://api.ycloud.com/v2";
const YCLOUD_MESSAGES_URL = `${YCLOUD_BASE_URL}/whatsapp/messages`;
const YCLOUD_TEMPLATES_URL = `${YCLOUD_BASE_URL}/whatsapp/templates`;
const YCLOUD_PHONE_NUMBERS_URL = `${YCLOUD_BASE_URL}/whatsapp/phoneNumbers`;

export class YCloudError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "YCloudError";
  }
}

export interface SendTextResult {
  id: string;
  wamid: string;
  status: string;
}

interface SendTextParams {
  apiKey: string;
  from: string;
  to: string;
  body: string;
}

/**
 * Sends a text message via the YCloud WhatsApp API.
 * Throws YCloudError on non-2xx responses.
 */
export async function sendText(
  params: SendTextParams,
): Promise<SendTextResult> {
  const { apiKey, from, to, body } = params;

  const response = await fetch(YCLOUD_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      type: "text",
      from,
      to,
      text: { body },
    }),
  });

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    throw new YCloudError(
      response.status,
      responseBody,
      `YCloud API error ${response.status}`,
    );
  }

  const data = responseBody as Record<string, unknown>;

  return {
    id: typeof data.id === "string" ? data.id : "",
    wamid: typeof data.wamid === "string" ? data.wamid : "",
    status: typeof data.status === "string" ? data.status : "accepted",
  };
}

interface SendImageParams {
  apiKey: string;
  from: string;
  to: string;
  /** Public/temporary URL of the image (e.g. a Supabase signed URL). */
  link: string;
  caption?: string;
}

/**
 * Sends an image message via the YCloud WhatsApp API.
 * Throws YCloudError on non-2xx responses.
 */
export async function sendImage(
  params: SendImageParams,
): Promise<SendTextResult> {
  const { apiKey, from, to, link, caption } = params;

  const response = await fetch(YCLOUD_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      type: "image",
      from,
      to,
      image: { link, caption },
    }),
  });

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    throw new YCloudError(
      response.status,
      responseBody,
      `YCloud API error ${response.status}`,
    );
  }

  const data = responseBody as Record<string, unknown>;
  return {
    id: typeof data.id === "string" ? data.id : "",
    wamid: typeof data.wamid === "string" ? data.wamid : "",
    status: typeof data.status === "string" ? data.status : "accepted",
  };
}

interface SendAudioParams {
  apiKey: string;
  from: string;
  to: string;
  /** Public/temporary URL of an Ogg/Opus (voice note) or mp3/aac audio file. */
  link: string;
}

/**
 * Sends an audio message via the YCloud WhatsApp API. Ogg/Opus renders as a
 * voice note. Throws YCloudError on non-2xx responses.
 */
export async function sendAudio(
  params: SendAudioParams,
): Promise<SendTextResult> {
  const { apiKey, from, to, link } = params;

  const response = await fetch(YCLOUD_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      type: "audio",
      from,
      to,
      audio: { link },
    }),
  });

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    throw new YCloudError(
      response.status,
      responseBody,
      `YCloud sendAudio error ${response.status}`,
    );
  }

  const data = responseBody as Record<string, unknown>;
  return {
    id: typeof data.id === "string" ? data.id : "",
    wamid: typeof data.wamid === "string" ? data.wamid : "",
    status: typeof data.status === "string" ? data.status : "accepted",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// sendInteractiveButtons — WhatsApp interactive reply buttons (max 3)
// ──────────────────────────────────────────────────────────────────────────────

export interface InteractiveButton {
  /** Stable id echoed back in the webhook when tapped. */
  id: string;
  /** Visible label (WhatsApp caps this at 20 chars). */
  title: string;
}

interface SendInteractiveParams {
  apiKey: string;
  from: string;
  to: string;
  body: string;
  buttons: InteractiveButton[];
  /** Optional small header text above the body. */
  header?: string;
  /** Optional footer text below the body. */
  footer?: string;
}

/**
 * Sends an interactive "reply buttons" message (up to 3 buttons). Only valid
 * inside the 24h customer-service window — WhatsApp rejects interactive
 * messages otherwise (use a template instead). Throws YCloudError on non-2xx.
 */
export async function sendInteractiveButtons(
  params: SendInteractiveParams,
): Promise<SendTextResult> {
  const { apiKey, from, to, body, buttons, header, footer } = params;

  const trimmed = buttons.slice(0, 3).map((b) => ({
    type: "reply" as const,
    reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) },
  }));

  const interactive: Record<string, unknown> = {
    type: "button",
    body: { text: body.slice(0, 1024) },
    action: { buttons: trimmed },
  };
  if (header) interactive.header = { type: "text", text: header.slice(0, 60) };
  if (footer) interactive.footer = { text: footer.slice(0, 60) };

  const response = await fetch(YCLOUD_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ type: "interactive", from, to, interactive }),
  });

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    throw new YCloudError(
      response.status,
      responseBody,
      `YCloud sendInteractive error ${response.status}`,
    );
  }

  const data = responseBody as Record<string, unknown>;
  return {
    id: typeof data.id === "string" ? data.id : "",
    wamid: typeof data.wamid === "string" ? data.wamid : "",
    status: typeof data.status === "string" ? data.status : "accepted",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// sendTemplate
// ──────────────────────────────────────────────────────────────────────────────

export interface TemplateParams {
  apiKey: string;
  from: string; // E.164
  to: string; // E.164
  templateName: string;
  /** Default 'es'. NEVER 'es_PA' — Movinsa production gotcha */
  language?: string;
  /**
   * FLAT array per component (Movinsa gotcha).
   * Each parameters entry must be a flat { type: 'text', text: string }.
   */
  components?: Array<{
    type: "header" | "body" | "footer" | "button";
    parameters: Array<{ type: "text"; text: string }>;
  }>;
}

export interface SendTemplateResult {
  id: string;
  wamid: string;
  status: string;
}

/**
 * Sends a template message via the YCloud WhatsApp API.
 * Templates bypass the 24h window restriction.
 * Throws YCloudError on non-2xx responses.
 */
export async function sendTemplate(
  params: TemplateParams,
): Promise<SendTemplateResult> {
  const {
    apiKey,
    from,
    to,
    templateName,
    language = "es",
    components,
  } = params;

  const response = await fetch(YCLOUD_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      type: "template",
      from,
      to,
      template: {
        name: templateName,
        language: { code: language },
        ...(components ? { components } : {}),
      },
    }),
  });

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    throw new YCloudError(
      response.status,
      responseBody,
      `YCloud sendTemplate error ${response.status}`,
    );
  }

  const data = responseBody as Record<string, unknown>;

  return {
    id: typeof data.id === "string" ? data.id : "",
    wamid: typeof data.wamid === "string" ? data.wamid : "",
    status: typeof data.status === "string" ? data.status : "accepted",
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// fetchYCloudTemplates
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Fetches all WhatsApp templates from the YCloud account.
 * Returns the raw records array for further processing.
 */
export async function fetchYCloudTemplates(apiKey: string): Promise<unknown[]> {
  const url = `${YCLOUD_BASE_URL}/whatsapp/templates?limit=100`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-API-Key": apiKey,
    },
  });

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    throw new YCloudError(
      response.status,
      responseBody,
      `YCloud fetchTemplates error ${response.status}`,
    );
  }

  const data = responseBody as Record<string, unknown>;
  return Array.isArray(data.records) ? data.records : [];
}

// ──────────────────────────────────────────────────────────────────────────────
// resolveWabaId
// ──────────────────────────────────────────────────────────────────────────────

/** Strips everything but digits so "+52 998…" and "52998…" compare equal. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Resolves the WhatsApp Business Account ID for a phone number. Template
 * creation (POST /v2/whatsapp/templates) requires `wabaId`, which we don't
 * store — so we look it up from the registered phone number at submit time.
 * Falls back to the first registered number's WABA when only one exists.
 */
export async function resolveWabaId(
  apiKey: string,
  phoneNumberE164: string,
): Promise<string> {
  const response = await fetch(`${YCLOUD_PHONE_NUMBERS_URL}?limit=100`, {
    method: "GET",
    headers: { "X-API-Key": apiKey },
  });

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    throw new YCloudError(
      response.status,
      responseBody,
      `YCloud resolveWabaId error ${response.status}`,
    );
  }

  const data = responseBody as Record<string, unknown>;
  // The phoneNumbers endpoint returns { items: [...] }; older shapes used
  // `records`/`data` — accept any of them defensively.
  const items = (
    Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.records)
        ? data.records
        : Array.isArray(data.data)
          ? data.data
          : []
  ) as Array<Record<string, unknown>>;

  const target = digitsOnly(phoneNumberE164);
  const match = items.find(
    (p) =>
      typeof p.phoneNumber === "string" && digitsOnly(p.phoneNumber) === target,
  );

  const wabaId =
    (match?.wabaId as string | undefined) ??
    (items[0]?.wabaId as string | undefined);

  if (!wabaId) {
    throw new YCloudError(
      404,
      responseBody,
      "No se encontró el wabaId del número en YCloud",
    );
  }

  return wabaId;
}

// ──────────────────────────────────────────────────────────────────────────────
// createYCloudTemplate
// ──────────────────────────────────────────────────────────────────────────────

export interface CreateTemplatePayload {
  wabaId: string;
  name: string;
  language: string;
  category: string; // UPPERCASE: UTILITY | MARKETING | AUTHENTICATION
  components: YCloudComponent[];
}

export interface CreateTemplateResult {
  id: string;
  status: string;
}

/**
 * Submits a WhatsApp template to YCloud for Meta approval.
 * Returns the provider template id + initial status (usually "PENDING").
 * Throws YCloudError (with the parsed YCloud error body) on non-2xx.
 */
export async function createYCloudTemplate(
  apiKey: string,
  payload: CreateTemplatePayload,
): Promise<CreateTemplateResult> {
  const response = await fetch(YCLOUD_TEMPLATES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    const message = extractYCloudErrorMessage(responseBody);
    throw new YCloudError(
      response.status,
      responseBody,
      message ?? `YCloud createTemplate error ${response.status}`,
    );
  }

  const data = responseBody as Record<string, unknown>;
  return {
    id: typeof data.id === "string" ? data.id : "",
    status: typeof data.status === "string" ? data.status : "PENDING",
  };
}

/** Pulls a human-readable message out of a YCloud error envelope. */
function extractYCloudErrorMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const obj = body as Record<string, unknown>;
  if (typeof obj.message === "string") return obj.message;
  const error = obj.error as Record<string, unknown> | undefined;
  if (error && typeof error.message === "string") return error.message;
  return null;
}

/**
 * Sends a typing indicator ("escribiendo...") via YCloud WhatsApp API.
 * @param apiKey - YCloud API key
 * @param from - Sender phone (with country code, e.g., +1234567890)
 * @param to - Recipient phone (with country code, e.g., +1234567890)
 * @param isTyping - true for "typing", false for "stop_typing"
 */
export async function sendTypingIndicator(
  apiKey: string,
  from: string,
  to: string,
  isTyping: boolean = true,
): Promise<void> {
  try {
    const response = await fetch(YCLOUD_MESSAGES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        type: "status",
        from,
        to,
        status: isTyping ? "typing" : "stop_typing",
      }),
    });

    if (!response.ok) {
      console.warn(
        `[ycloud-client] typing indicator failed (${response.status})`,
      );
    }
  } catch (err) {
    console.warn("[ycloud-client] typing indicator error:", err);
  }
}
