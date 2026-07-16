-- Migration (#7): message_feedback — thumbs up/down on the AI's replies from the
-- inbox. A 👎 with a written correction becomes a Knowledge Base document, so the
-- agent "learns" the right answer for next time. 👍/👎 without text is kept for
-- quality analytics.

CREATE TABLE IF NOT EXISTS public.message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
  correction TEXT,
  -- When a correction was pushed into the KB, we record the created doc.
  kb_document_id UUID,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One rating per message (re-rating overwrites via upsert).
  UNIQUE (message_id)
);

CREATE INDEX IF NOT EXISTS idx_message_feedback_workspace
  ON public.message_feedback(workspace_id, created_at DESC);

ALTER TABLE public.message_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws members read message_feedback" ON public.message_feedback
  FOR SELECT USING (workspace_id IN (SELECT auth_workspace_ids()));

-- Any member can rate; writes go through the API which stamps created_by.
CREATE POLICY "ws members write message_feedback" ON public.message_feedback
  FOR INSERT WITH CHECK (workspace_id IN (SELECT auth_workspace_ids()));

CREATE POLICY "ws members update message_feedback" ON public.message_feedback
  FOR UPDATE USING (workspace_id IN (SELECT auth_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT auth_workspace_ids()));
