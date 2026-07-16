-- Migration (#3): seed the send_voice_note tool. Unlike the quick-replies tool,
-- this one is NOT auto-enabled — voice replies cost extra (TTS) and are a
-- deliberate choice, so the owner turns it on from the Tools catalog. It also
-- only actually runs when OPENAI_API_KEY is configured (enforced in code).

INSERT INTO public.tools (key, name, description, schema, sensitivity) VALUES
  (
    'send_voice_note',
    'Nota de voz (respuesta hablada)',
    'Responde con una nota de voz de WhatsApp en vez de texto. Usar cuando el cliente manda un audio, pide que le hablen, o una respuesta hablada suma. Requiere tener configurado el proveedor de voz (OPENAI_API_KEY).',
    '{"type":"object","properties":{"text":{"type":"string","maxLength":2000,"description":"Texto a convertir en nota de voz."}},"required":["text"]}',
    'write'
  )
ON CONFLICT (key) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      schema      = EXCLUDED.schema,
      sensitivity = EXCLUDED.sensitivity;

-- No auto-enable: owners opt in per workspace from the Tools catalog.
