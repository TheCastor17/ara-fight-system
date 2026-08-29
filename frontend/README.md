# DojoCloud Frontend v2

Frontend React/Vite conectado al backend v2.

## Instalar

```cmd
copy .env.example .env
npm install
npm run dev
```

`.env`:

```env
VITE_API_URL=http://localhost:4000
```

Reinicia Vite después de cambiar `.env`.

## Requisitos

- Backend v2 ejecutándose en `http://localhost:4000`.
- Migración `002_complete_backend.sql` aplicada.
- Usuario con perfil activo.
- Para registrar alumnos, primero crea una sede, una disciplina, un plan y una clase.

## Funciones conectadas

- Login, refresh y cierre de sesión.
- Dashboard real.
- Widgets de gráfica.
- Sedes y disciplinas.
- Planes.
- Clases.
- Alumnos y ficha amplia.
- Enlace público de preinscripción.
- Asistencia masiva.
- Mensualidades, detalle y registro de pagos.
- Automatizaciones y pausa.
- Filtro global por sede.
- Navegación por rol.
