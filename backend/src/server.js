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

import usersRoutes from './routes/users.js';

const app = express();

app.set(
  'trust proxy',
  Number(process.env.TRUST_PROXY || 1)
);

app.disable('x-powered-by');

app.use((req, res, next) => {
  req.id = crypto.randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
});


app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'same-site'
    }
  })
);

/* Restringe los orígenes que pueden consumir la API.*/
app.use(
  cors({
    origin(origin, callback) {
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

/* Protección contra HTTP Parameter Pollution.*/
app.use(hpp());

app.use(
  express.json({
    limit: '250kb',

    verify: (req, res, buffer) => {
      req.rawBody = buffer;
    }
  })
);

app.use((req, res, next) => {
  req.ip_hash = sha(req.ip);
  next();
});

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

/* Comprobación pública de salud del backend. */
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    version: '2.0.1',
    environment: config.nodeEnv,
    time: new Date().toISOString()
  });
});

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

/* Rutas de autenticación. */
app.use('/auth', auth);

/* Rutas protegidas de la aplicación. */
app.use('/api/dashboard', dashboard);
app.use('/api/students', students);
app.use('/api/attendance', attendance);
app.use('/api/catalog', catalog);
app.use('/api/payments', payments);
app.use('/api/files', files);
app.use('/api/notifications', notifications);
app.use('/api/users', usersRoutes);

app.use('/public', publicRoutes);

/* Webhooks externos. */
app.use('/webhooks', webhooks);

/* Respuesta para rutas inexistentes. */
app.use(notFound);

app.use(errorHandler);

/* Inicio del servidor HTTP. */
const server = app.listen(
  config.port,
  () => {
    console.log(`✅ Ara System API v2.0.1 en http://localhost:${config.port}`);
    console.log(`✅ Health check: http://localhost:${config.port}/health`);
    console.log(`✅ Auth login: http://localhost:${config.port}/auth/login`);
    console.log('✅ Servidor listo. Esperando peticiones...');
  }
);

startScheduler();

/* Cierre controlado del servidor. */
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