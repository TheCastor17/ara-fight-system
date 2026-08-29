# DojoCloud Backend v2

Backend Node.js/Express para Supabase y WhatsApp Cloud API. Esta versión elimina cifras ficticias del backend y proporciona endpoints reales para Dashboard, alumnos, enlaces públicos, asistencia, clases, pagos, sedes, disciplinas, planes, widgets, archivos y notificaciones.

## 1. Requisitos

- Node.js 20 o posterior.
- Proyecto Supabase existente con la migración inicial ya aplicada.
- Cuenta Administrador vinculada a `public.profiles`.

## 2. Actualizar Supabase

En Supabase SQL Editor, ejecuta todo el archivo:

`supabase/migrations/002_complete_backend.sql`

El script es aditivo e idempotente. No borra tus usuarios.

## 3. Configurar

```bash
cp .env.example .env
```

Completa las variables de Supabase. La `SUPABASE_SERVICE_ROLE_KEY` debe contener la Secret key y nunca debe colocarse en el frontend.

## 4. Ejecutar

```bash
npm install
npm run check
npm test
npm run dev
```

Comprueba `http://localhost:4000/health`.

## 5. Primeros datos

Puedes ejecutar una sola vez:

```bash
npm run seed
```

Crea una sede principal y tres disciplinas si la tabla de sedes está vacía.

## 6. Rutas principales

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/weekly-attendance`
- `GET /api/dashboard/activity`
- `GET|POST /api/dashboard/widgets`
- `GET|POST|PATCH /api/students`
- `POST /api/students/registration-links/create`
- `GET|POST /public/registration/:token`
- `GET /api/attendance/class/:classId?date=YYYY-MM-DD`
- `POST /api/attendance/bulk`
- `GET|POST|PATCH /api/catalog/branches`
- `GET|POST|PATCH /api/catalog/disciplines`
- `GET|POST|PATCH /api/catalog/plans`
- `GET|POST|PATCH|DELETE /api/catalog/classes`
- `GET /api/payments/monthly`
- `GET /api/payments/invoices/:id`
- `POST /api/payments`
- `POST /api/files/upload-url`
- `POST /api/files/download-url`
- `GET|POST|PATCH /api/notifications`
- `GET|POST /webhooks/whatsapp`

## 7. Importante para tu frontend

Este ZIP es el backend. Tu frontend actual todavía contiene números y listas demostrativas. Debes reemplazar esos arreglos por llamadas a estas rutas. Instalar este backend no modifica automáticamente los archivos React.

El Dashboard debe consultar `/api/dashboard/summary`; Asistencia debe consultar `/api/attendance/class/:classId` y guardar en `/api/attendance/bulk`; Nuevo alumno debe enviar a `/api/students`; Generar enlace debe enviar a `/api/students/registration-links/create`.

## 8. Seguridad

- Cinco intentos por correo normalizado e IP durante 15 minutos.
- Supabase Auth como segunda barrera de rate limit.
- JWT verificado en servidor.
- Rol obtenido desde `profiles`, no desde el navegador.
- Secret key solo en backend.
- RLS preservado.
- CORS allowlist.
- Helmet, HPP, límite de cuerpo y rate limit global.
- Validación Joi.
- Webhook WhatsApp con firma HMAC.
- Buckets privados con URLs firmadas.
- Registro de auditoría.
- Enlaces públicos con token aleatorio, hash, expiración y uso único.
