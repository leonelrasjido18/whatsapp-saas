-- FASE 4: Cobros Híbridos MercadoPago

ALTER TABLE workspaces ADD COLUMN mp_access_token TEXT;

-- Restringimos el acceso al token de MercadoPago para que no sea público ni siquiera para agentes, 
-- solo el backend y admins pueden modificarlo. Sin embargo, para simplicidad del prototipo,
-- lo dejamos accesible a los administradores del workspace.

-- Podríamos crear una vista o función de seguridad para desencriptarlo, 
-- pero por ahora nos apoyamos en RLS de la tabla workspaces.
