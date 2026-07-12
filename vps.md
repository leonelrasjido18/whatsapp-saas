# VPS — Proceso de actualización (deploy)

> **Atajo:** escribí **"actualiza vps"** en Claude Code y el agente
> [`actualiza-vps`](.claude/agents/actualiza-vps.md) ejecuta todo este proceso solo.

## Arquitectura

| Qué | Dónde |
| --- | --- |
| Proveedor | Hostinger VPS |
| Host SSH | `root@srv1467601.hstgr.cloud` (IP `187.77.234.239`, auth por clave `~/.ssh/id_ed25519`) |
| Carpeta de la app | `/var/www/whatsapp-saas` |
| Proceso | pm2, nombre **`whatsapp-saas`** (cluster ×1, `npm start`, puerto **3000**) |
| Config pm2 | `/var/www/whatsapp-saas/ecosystem.config.js` |
| Variables de entorno | `/var/www/whatsapp-saas/.env.production` (**no está en git** — editar solo en el servidor) |
| Logs | `/var/log/whatsapp-saas-out.log` y `/var/log/whatsapp-saas-error.log` |
| URL pública | `https://whatsapp.synory.dev` (sin `www` — el `www` no resuelve) |
| Node en el VPS | v20.x |
| Repo | `https://github.com/leonelrasjido18/whatsapp-saas.git` (branch `main`) |

En el mismo VPS conviven otras apps bajo pm2 (`RoyalCuts_API`, `JV_Estetica_API`,
`mk-backend`, `pelu-solo-backend`, `vero-backend`) — **no tocarlas**.

## Proceso de actualización (paso a paso)

El deploy publica lo que está en `origin/main`. Cambios sin commitear NO viajan.

```bash
# 0. LOCAL — asegurarse de que main esté commiteado y pusheado
git status --short          # si hay cambios: commit + push primero
git push origin main

# 1. VPS — descartar ruido local del working tree (archivos que el build ensucia)
ssh root@srv1467601.hstgr.cloud
cd /var/www/whatsapp-saas
git checkout -- next-env.d.ts package-lock.json 2>/dev/null
git status --short          # debe quedar limpio (solo .env.production y ecosystem.config.js sin trackear)

# 2. Traer el código nuevo
git pull origin main

# 3. Dependencias (rápido si no cambió package.json)
npm install --no-audit --no-fund

# 4. Build de producción (si FALLA: NO reiniciar — la versión vieja sigue corriendo)
npm run build

# 5. Reiniciar el proceso (recarga también .env.production)
pm2 restart whatsapp-saas --update-env

# 6. Verificar
pm2 list | grep whatsapp-saas          # status: online
curl -s -o /dev/null -w "%{http_code}" https://whatsapp.synory.dev/login   # → 200
pm2 logs whatsapp-saas --lines 20 --nostream   # sin errores nuevos
```

## Reglas del deploy

1. **Si `npm run build` falla, detenerse ahí.** No reiniciar pm2: el proceso viejo
   sigue sirviendo la última build buena. Arreglar local → push → repetir.
2. **Nunca editar código a mano en el VPS.** Todo cambio va por git. Las únicas
   excepciones son `.env.production` y `ecosystem.config.js` (viven solo en el server).
3. **Nunca commitear/subir `.env.production`** ni pegar sus valores en el chat.
4. Si cambió alguna variable de entorno: editarla en `.env.production` **antes**
   del `pm2 restart` (el restart ya la levanta).
5. Migraciones de base de datos (`supabase/migrations/`) **no se aplican en el
   deploy** — van contra Supabase Cloud por separado (`supabase db push` desde
   local, o SQL Editor). Hacerlo ANTES de deployar código que dependa de ellas.

## Troubleshooting

| Síntoma | Qué hacer |
| --- | --- |
| `git pull` falla por cambios locales | `git stash` (o `git checkout -- <archivo>` si es ruido de build) y reintentar |
| Build muere sin error claro (OOM) | Verificar memoria con `free -m`; reintentar; si persiste, parar apps no críticas durante el build |
| App online pero responde 502 | `pm2 logs whatsapp-saas --lines 50` — casi siempre es env var faltante en `.env.production` |
| Rollback urgente | `git log --oneline -5` → `git checkout <commit-bueno> -- .` no; mejor: `git reset --hard <commit-bueno>` + build + restart (y después arreglar main) |

## Variables de entorno requeridas en `.env.production`

Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`) · OpenRouter (`OPENROUTER_API_KEY`,
`OPENROUTER_DEFAULT_MODEL`) · App (`NEXT_PUBLIC_APP_URL=https://whatsapp.synory.dev`,
`NODE_ENV=production`) · Seguridad (`ENCRYPTION_KEY`, `ENCRYPTION_KEY_VERSION`,
`BUFFER_PROCESS_SECRET`, `CRON_SECRET`) · **Meta** (`META_APP_ID`,
`META_APP_SECRET`, `META_VERIFY_TOKEN`).
