# Seguridad

No publiques `.env`. No uses `SUPABASE_SERVICE_ROLE_KEY` en React o Vercel. No concedas `SELECT` sobre `auth.users` a `authenticated`. No desactives RLS permanentemente.

Los endpoints administrativos usan la Secret key después de verificar JWT y rol. La defensa principal se replica en RLS para accesos directos del cliente. Antes de producción ejecuta pruebas por rol, valida políticas de privacidad y realiza una revisión independiente de seguridad.
