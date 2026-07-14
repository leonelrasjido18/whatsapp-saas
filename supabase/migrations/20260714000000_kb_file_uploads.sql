-- Migration: KB file uploads (PDF/Word/Excel)
-- Extends kb_documents to accept uploaded-file source types and extends the
-- whatsapp-media bucket's allowed MIME types to cover spreadsheets/CSV
-- (PDF and Word MIME types were already allowed by 20260608000007).

ALTER TABLE kb_documents DROP CONSTRAINT IF EXISTS kb_documents_source_type_check;
ALTER TABLE kb_documents ADD CONSTRAINT kb_documents_source_type_check
  CHECK (source_type IN ('doc', 'faq', 'url', 'snippet', 'pdf', 'docx', 'xlsx'));

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'video/mp4',
  'video/3gpp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/octet-stream'
]
WHERE id = 'whatsapp-media';
