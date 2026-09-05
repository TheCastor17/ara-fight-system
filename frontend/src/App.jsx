import React, { useEffect, useState } from 'react';
import { LayoutDashboard, Users, CalendarCheck, BookOpen, WalletCards, MapPin, MessageCircle, UserRound, LogOut, Menu, ShieldCheck, UserCog } from 'lucide-react';
import { api, saveSession, clearSession, hasSession } from './api';
import { Loading, Toast } from './components/UI';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Attendance from './pages/Attendance';
import { Branches, Classes } from './pages/Catalog';
import Payments from './pages/Payments';
import Notifications from './pages/Notifications';
import UsersPage from './pages/Users';

const items = {
  admin: [
    ['Dashboard', LayoutDashboard],
    ['Alumnos', Users],
    ['Asistencia', CalendarCheck],
    ['Clases', BookOpen],
    ['Pagos', WalletCards],
    ['Sedes', MapPin],
    ['Notificaciones', MessageCircle],
    ['Usuarios', UserCog],
    ['Mi perfil', UserRound]
  ],
  staff: [
    ['Dashboard', LayoutDashboard],
    ['Alumnos', Users],
    ['Asistencia', CalendarCheck],
    ['Clases', BookOpen],
    ['Mi perfil', UserRound]
  ],
  student: [
    ['Dashboard', LayoutDashboard],
    ['Mi perfil', UserRound]
  ]
};

function Login({ done }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await api.login(email, password);
      if (response?.session) {
        saveSession(response.session);
        done();
      } else {
        setError('Respuesta inválida del servidor');
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(
        err.status === 429
          ? 'Se alcanzó el límite de intentos. Espera 15 minutos.'
          : err.data?.detail?.remaining !== undefined
          ? `Credenciales incorrectas. Intentos disponibles: ${err.data.detail.remaining}`
          : 'No fue posible iniciar sesión.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-art">
        <div className="brand">
          <span>🥋</span>Ara Fight System
        </div>
        <div>
          <small>GESTION MULTISEDE</small>
          <h1>Academia de<br/>Artes Marciales.</h1>
          <p>Alumnos, asistencia, clases y mensualidades en un entorno unificado.</p>
        </div>
        <em></em>
      </section>
      <section className="login-panel">
        <form onSubmit={submit}>
          <div className="brand dark">
            <span>🥋</span>Ara Fight System
          </div>
          <h2>Iniciar sesión</h2>
          <p>Ingresa tu usuario o correo electrónico.</p>
          <label>
            Usuario o correo
            <input
              type="text"
              autoComplete="username"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              minLength="4"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button disabled={busy}>{busy ? 'Verificando...' : 'Ingresar'}</button>
        </form>
      </section>
    </main>
  );
}

function Profile({ me }) {
  return (
    <>
      <div className="page-head">
        <div>
          <h2>Mi perfil</h2>
          <p>Información de acceso y permisos.</p>
        </div>
      </div>
      <section className="card profile-card">
        <div className="profile-photo">
          {(me.full_name || me.email).split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <section>
          <h2>{me.full_name || 'Usuario'}</h2>
          <p>{me.email}</p>
          <span className="pill success">{me.role}</span>
        </section>
      </section>
    </>
  );
}

function PublicRegistration({ token }) {
  const [meta, setMeta] = useState(null);
  const [done, setDone] = useState(false);
  const [f, setF] = useState({
    first_name: '',
    last_name: '',
    document: '',
    birth_date: null,
    phone: '',
    email: '',
    address: '',
    guardian_name: '',
    guardian_document: '',
    guardian_relationship: '',
    guardian_phone: '',
    guardian_email: '',
    payment_day: 1
  });

  useEffect(() => {
    api.get(`/public/registration/${token}`)
      .then(setMeta)
      .catch(() => setMeta(false));
  }, []);

  async function submit(e) {
    e.preventDefault();
    await api.post(`/public/registration/${token}`, f);
    setDone(true);
  }

  if (meta === null) return <Loading />;
  if (meta === false) return <div className="public-message">El enlace no existe, expiró o ya fue utilizado.</div>;
  if (done) return (
    <div className="public-message">
      <ShieldCheck size={50} />
      <h2>Datos enviados</h2>
      <p>La academia revisará la inscripción.</p>
    </div>
  );

  return (
    <main className="public-page">
      <form className="public-form" onSubmit={submit}>
        <div className="brand dark">
          <span>🥋</span>Ara Fight System
        </div>
        <h1>Preinscripción</h1>
        <p>Sede: <b>{meta.branch.name}</b></p>
        <div className="form-grid">
          <label className="field">
            <span>Nombres</span>
            <input required value={f.first_name} onChange={e => setF({ ...f, first_name: e.target.value })} />
          </label>
          <label className="field">
            <span>Apellidos</span>
            <input required value={f.last_name} onChange={e => setF({ ...f, last_name: e.target.value })} />
          </label>
          <label className="field">
            <span>Documento</span>
            <input value={f.document} onChange={e => setF({ ...f, document: e.target.value })} />
          </label>
          <label className="field">
            <span>Fecha de nacimiento</span>
            <input type="date" onChange={e => setF({ ...f, birth_date: e.target.value })} />
          </label>
          <label className="field">
            <span>Responsable</span>
            <input value={f.guardian_name} onChange={e => setF({ ...f, guardian_name: e.target.value })} />
          </label>
          <label className="field">
            <span>WhatsApp</span>
            <input value={f.guardian_phone} onChange={e => setF({ ...f, guardian_phone: e.target.value })} />
          </label>
          <label className="field">
            <span>Correo</span>
            <input type="email" value={f.guardian_email} onChange={e => setF({ ...f, guardian_email: e.target.value })} />
          </label>
          <label className="field">
            <span>Día de pago preferido</span>
            <input type="number" min="1" max="31" value={f.payment_day} onChange={e => setF({ ...f, payment_day: Number(e.target.value) })} />
          </label>
        </div>
        <button>Enviar información</button>
      </form>
    </main>
  );
}

function Shell({ logout }) {
  const [me, setMe] = useState(null);
  const [page, setPage] = useState('Dashboard');
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState('');
  const [catalog, setCatalog] = useState({
    branches: [],
    disciplines: [],
    plans: [],
    classes: []
  });
  const [message, setMessage] = useState('');

  function notify(v) {
    setMessage(v);
    setTimeout(() => setMessage(''), 2600);
  }

  async function loadCatalog() {
    const [b, d, p, c] = await Promise.all([
      api.get('/api/catalog/branches'),
      api.get('/api/catalog/disciplines'),
      api.get('/api/catalog/plans'),
      api.get('/api/catalog/classes')
    ]);
    setCatalog({ branches: b, disciplines: d, plans: p, classes: c });
  }

  useEffect(() => {
    api.get('/api/me')
      .then(async x => {
        setMe(x);
        await loadCatalog();
      })
      .catch(() => {
        clearSession();
        logout();
      });
  }, []);

  if (!me) return <Loading />;

  let component;
  if (page === 'Dashboard') {
    component = <Dashboard me={me} branchId={branchId} notify={notify} />;
  } else if (page === 'Alumnos') {
    component = <Students {...catalog} branchId={branchId} notify={notify} />;
  } else if (page === 'Asistencia') {
    component = <Attendance classes={catalog.classes} branchId={branchId} notify={notify} />;
  } else if (page === 'Clases') {
    component = <Classes me={me} {...catalog} reload={loadCatalog} branchId={branchId} notify={notify} />;
  } else if (page === 'Pagos') {
    component = <Payments {...catalog} reloadCatalog={loadCatalog} branchId={branchId} notify={notify} />;
  } else if (page === 'Sedes') {
    component = <Branches branches={catalog.branches} disciplines={catalog.disciplines} reload={loadCatalog} notify={notify} />;
  } else if (page === 'Notificaciones') {
    component = <Notifications branches={catalog.branches} notify={notify} />;
  } else if (page === 'Usuarios') {
    component = <UsersPage notify={notify} />;
  } else {
    component = <Profile me={me} />;
  }

  return (
    <div className="app">
      <aside className={open ? 'open' : ''}>
        <div className="brand">
          <span>🥋</span>Ara Fight System
        </div>
        <nav>
          {items[me.role].map(([name, Icon]) => (
            <button
              key={name}
              className={page === name ? 'active' : ''}
              onClick={() => { setPage(name); setOpen(false); }}
            >
              <Icon size={18} />
              {name}
            </button>
          ))}
        </nav>
        <div className="account">
          <b>{me.full_name || me.email}</b>
          <small>{me.role}</small>
          <button onClick={() => { clearSession(); logout(); }}>
            <LogOut size={16} /> Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <button className="icon-btn mobile-menu" onClick={() => setOpen(!open)}>
            <Menu />
          </button>
          <div>
            <h1>{page}</h1>
            <p>Gestión integral de la academia.</p>
          </div>
          {me.role === 'admin' && (
            <select value={branchId} onChange={e => setBranchId(e.target.value)}>
              <option value="">Todas las sedes</option>
              {catalog.branches.map(x => (
                <option value={x.id} key={x.id}>{x.name}</option>
              ))}
            </select>
          )}
        </header>
        {component}
        <Toast message={message} />
      </main>
    </div>
  );
}

export default function App() {
  const path = location.pathname.split('/').filter(Boolean);
  if (path[0] === 'registro' && path[1]) {
    return <PublicRegistration token={path[1]} />;
  }

  const [logged, setLogged] = useState(hasSession());
  return logged ? <Shell logout={() => setLogged(false)} /> : <Login done={() => setLogged(true)} />;
}