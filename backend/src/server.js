import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import { rateLimit } from 'express-rate-limit';

import { config } from './config.js';

import auth from './routes/auth.js';
import dashboard from './routes/dashboard.js';
import students from './routes/students.js';
import publicRoutes from './routes/public.js';
import attendance from './routes/attendance.js';
import catalog from './routes/catalog.js';
import payments from './routes/payments.js';
import files from './routes/files.js';
import notifications from './routes/notifications.js';
import webhooks from './routes/webhooks.js';

import { authenticate } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/error.js';
import { sha } from './utils.js';
import { startScheduler } from './services/scheduler.js';

const app = express();

/*
 * Render utiliza un proxy inverso.
 * TRUST_PROXY=1 permite interpretar correctamente la IP del cliente.
 */
app.set(
  'trust proxy',
  Number(process.env.TRUST_PROXY || 1)
);

app.disable('x-powered-by');

/*
 * Genera un identificador único para cada solicitud.
 */
app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
});

/*
 * Añade cabeceras HTTP de seguridad.
 */
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'same-site'
    }
  })
);

/*
 * Restringe los orígenes que pueden consumir la API.
 */
app.use(
  cors({
    origin(origin, callback) {
      /*
       * Las solicitudes sin encabezado Origin pueden proceder de
       * herramientas como Postman, curl o verificaciones internas.
       */
      if (!origin || config.frontendUrls.includes(origin)) {
        return callback(null, true);
      }

      const error = new Error('CORS_DENEGADO');
      error.status = 403;
      error.code = 'CORS_DENEGADO';

      return callback(error);
    },

    methods: [
      'GET',
      'POST',
      'PATCH',
      'DELETE',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-cron-secret'
    ],

    maxAge: 86400
  })
);

/*
 * Protección contra HTTP Parameter Pollution.
 */
app.use(hpp());

/*
 * Analizador del cuerpo JSON.
 *
 * rawBody se conserva para comprobar la firma HMAC
 * de los webhooks enviados por Meta.
 */
app.use(
  express.json({
    limit: '250kb',

    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    }
  })
);

/*
 * Conserva un hash de la IP para auditoría.
 * No almacena la dirección IP directamente.
 */
app.use((req, res, next) => {
  req.ip_hash = sha(req.ip);
  next();
});

/*
 * Límite general para la API.
 *
 * El control específico de cinco intentos fallidos de inicio
 * de sesión se encuentra adicionalmente en el servicio de login.
 */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.generalLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,

    handler: (req, res) => {
      res.status(429).json({
        error: 'DEMASIADAS_SOLICITUDES',
        requestId: req.id
      });
    }
  })
);

/*
 * Comprobación pública de salud del backend.
 */
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    version: '2.0.1',
    environment: config.nodeEnv,
    time: new Date().toISOString()
  });
});

/*
 * Ruta requerida por el frontend después del inicio de sesión.
 *
 * El middleware authenticate:
 *
 * 1. Lee el Bearer token.
 * 2. Valida el token mediante Supabase Auth.
 * 3. Consulta public.profiles.
 * 4. Comprueba que el perfil esté activo.
 */
app.get(
  '/api/me',
  authenticate,
  (req, res) => {
    res.json({
      id: req.profile.id,
      role: req.profile.role,
      branch_id: req.profile.branch_id,
      full_name: req.profile.full_name,
      active: req.profile.active,
      email: req.user.email
    });
  }
);

/*
 * Rutas de autenticación.
 */
app.use('/auth', auth);

/*
 * Rutas protegidas de la aplicación.
 */
app.use('/api/dashboard', dashboard);
app.use('/api/students', students);
app.use('/api/attendance', attendance);
app.use('/api/catalog', catalog);
app.use('/api/payments', payments);
app.use('/api/files', files);
app.use('/api/notifications', notifications);

/*
 * Formulario público de preinscripción.
 *
 * Estas rutas no requieren una sesión administrativa, pero
 * validan el token de registro, la expiración y el uso único.
 */
app.use('/public', publicRoutes);

/*
 * Webhooks externos.
 */
app.use('/webhooks', webhooks);

/*
 * Respuesta para rutas inexistentes.
 */
app.use(notFound);

/*
 * Control centralizado de errores.
 * Debe permanecer después de todas las rutas.
 */
app.use(errorHandler);

/*
 * Inicio del servidor HTTP.
 */
const server = app.listen(
  config.port,
  () => {
    console.log(
      `DojoCloud API v2.0.1 en http://localhost:${config.port}`
    );
  }
);

/*
 * Inicia el programador de notificaciones solamente cuando
 * ENABLE_SCHEDULER=true en el archivo .env.
 */
startScheduler();

/*
 * Cierre controlado del servidor.
 */
function shutdown(signal) {
  console.log(`${signal} recibido. Cerrando servidor...`);

  server.close((error) => {
    if (error) {
      console.error(
        'Error durante el cierre del servidor:',
        error
      );

      process.exit(1);
    }

    console.log('Servidor cerrado correctamente.');
    process.exit(0);
  });

  /*
   * Evita que el proceso permanezca abierto indefinidamente
   * si alguna conexión no termina.
   */
  setTimeout(() => {
    console.error(
      'Cierre forzado porque se superó el tiempo máximo.'
    );

    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  shutdown('SIGINT');
});