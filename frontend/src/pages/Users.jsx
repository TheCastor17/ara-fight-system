import React, { useEffect, useState, useCallback } from 'react';
import { UserPlus, Search, Pencil, Trash2, KeyRound, RefreshCw, UserCog, ShieldCheck, Ban } from 'lucide-react';
import { api } from '../api';
import { ConfirmModal } from '../components/ConfirmModal';
import { UserFormModal } from '../components/UserFormModal';
import { Toast } from '../components/UI';

export default function UsersPage({ notify }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [message, setMessage] = useState('');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // ✅ CORREGIDO: Se agregó el prefijo '/api/'
      const response = await api.get('/api/users');
      
      // ✅ CORREGIDO: El backend devuelve { data: [...] }, extraemos la propiedad 'data'
      const usersList = response.data || [];
      setUsers(usersList);
    } catch (e) {
      console.error('Error fetching users:', e);
      setError('Error al cargar usuarios');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // ... (El resto de tu lógica de filtros, modales, etc., se mantiene igual)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Usuarios y Permisos</h2>
          <p>Gestión integral de la academia.</p>
        </div>
      </div>

      <div className="toolbar">
        <button className="btn primary" onClick={() => setShowCreate(true)}>
          <UserPlus size={16} /> Nuevo Usuario
        </button>
        <div className="search-box">
          <Search size={16} />
          <input 
            type="text" 
            placeholder="Buscar por nombre o usuario..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
          <option value="">Todos los roles</option>
          <option value="admin">Admin</option>
          <option value="staff">Staff</option>
          <option value="student">Estudiante</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
        </select>
        <button className="btn secondary" onClick={loadUsers}>
          <RefreshCw size={16} /> Actualizar
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>NOMBRE</th>
              <th>USUARIO</th>
              <th>ROL</th>
              <th>ESTADO</th>
              <th>ÚLTIMO ACCESO</th>
              <th>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="text-center">Cargando...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan="6" className="text-center">No se encontraron usuarios</td></tr>
            ) : (
              users.map(user => (
                <tr key={user.id}>
                  <td>{user.full_name}</td>
                  <td>{user.username}</td>
                  <td><span className={`pill ${user.role}`}>{user.role}</span></td>
                  <td><span className={`pill ${user.status}`}>{user.status}</span></td>
                  <td>{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Nunca'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" title="Editar" onClick={() => setEditingUser(user)}>
                        <Pencil size={16} />
                      </button>
                      <button className="icon-btn" title="Resetear contraseña" onClick={() => { /* Lógica reset */ }}>
                        <KeyRound size={16} />
                      </button>
                      <button className="icon-btn danger" title="Eliminar" onClick={() => setDeletingUser(user)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Modales y Toasts (mantén tu lógica original aquí) */}
      {showCreate && <UserFormModal onClose={() => setShowCreate(false)} onSaved={loadUsers} notify={notify} />}
      {editingUser && <UserFormModal user={editingUser} onClose={() => setEditingUser(null)} onSaved={loadUsers} notify={notify} />}
      {deletingUser && <ConfirmModal 
        title="Eliminar usuario" 
        message={`¿Seguro que deseas eliminar a ${deletingUser.full_name}?`}
        onConfirm={async () => {
          try {
            await api.delete(`/api/users/${deletingUser.id}`);
            notify('Usuario eliminado');
            setDeletingUser(null);
            loadUsers();
          } catch (e) {
            notify('Error al eliminar');
          }
        }}
        onCancel={() => setDeletingUser(null)}
      />}
      <Toast message={message} />
    </div>
  );
}