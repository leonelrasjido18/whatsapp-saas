// comment-reply.ts — #13 Comentario → DM. When someone comments on a FB/IG post,
// we send them a private reply (a DM), which starts a normal conversation the AI
// then handles. Reuses the connected Meta page token.
//
// REQUISITOS (config de Meta, no de código):
//  - La app de Meta debe estar suscrita a los webhooks de `feed` (FB) /
//    `comments` (IG) de la página.
//  - Permisos: pages_manage_engagement (FB) / instagram_manage_comments (IG).

const GRAPH_VERSION = "v23.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export interface CommentEvent {
  commentId: string;
  fromId: string | null;
  text: string | null;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Extracts new-comment events from one webhook `entry.changes`. Ignores edits,
 * removals and hidden actions — only fresh comments trigger a DM.
 */
export function extractCommentEvents(entry: unknown): CommentEvent[] {
  const entryObj = asRecord(entry);
  const changes = entryObj && Array.isArray(entryObj.changes) ? entryObj.changes : [];
  const out: CommentEvent[] = [];

  for (const change of changes) {
    const c = asRecord(change);
    if (!c) continue;
    const field = typeof c.field === "string" ? c.field : "";
    if (field !== "feed" && field !== "comments") continue;

    const value = asRecord(c.value);
    if (!value) continue;

    // FB feed carries item/verb; IG comments arrive directly as a comment value.
    const isFbComment =
      field === "feed" && value.item === "comment" && value.verb === "add";
    const isIgComment = field === "comments";
    if (!isFbComment && !isIgComment) continue;

    const commentId =
      typeof value.comment_id === "string"
        ? value.comment_id
        : typeof value.id === "string"
          ? value.id
          : null;
    if (!commentId) continue;

    const from = asRecord(value.from);
    const fromId =
      (from && typeof from.id === "string" ? from.id : null) ??
      (typeof value.from_id === "string" ? value.from_id : null);

    const text =
      typeof value.message === "string"
        ? value.message
        : typeof value.text === "string"
          ? value.text
          : null;

    out.push({ commentId, fromId, text });
  }

  return out;
}

/**
 * Sends a private reply (DM) to the author of a comment. Best-effort — returns
 * false on any error so the webhook keeps processing.
 */
export async function sendPrivateReply(
  accessToken: string,
  commentId: string,
  message: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${commentId}/private_replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, access_token: accessToken }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
