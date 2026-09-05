import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { Plus, Edit, Trash2, UserCheck, UserX, Key, LogOut, Search } from 'lucide-react';
import { UserFormModal } from '../components/UserFormModal';
import { ConfirmModal } from '../components/ConfirmModal';

const Users = ({ notify }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [confirmModal, setConfirmModal] = useState({ open: false, action: null, message: '' });

  useEffect(() => {
    fetchUsers();
  }, [searchTerm, filterRole, filterStatus]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (filterRole) params.append('role', filterRole);
      if (filterStatus) params.append('status', filterStatus);

      const response = await api.get(`/users?${params.toString()}`);
      setUsers(response.data.data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      notify(error.response?.data?.message || 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (userData) => {
    try {
      await api.post('/users', userData);
      await fetchUsers();
      setModalOpen(false);
    } catch (error) {
      console.error('Error creating user:', error);
      notify(error.response?.data?.message || 'Error al crear usuario');
    }
  };

  const handleUpdateUser = async (userId, userData) => {
    try {
      await api.patch(`/users/${userId}`, userData);
      await fetchUsers();
      setModalOpen(false);
      setEditingUser(null);
    } catch (error) {
      console.error('Error updating user:', error);
      notify(error.response?.data?.message || 'Error al actualizar usuario');
    }
  };

  const handleDeleteUser = async (userId) => {
    try {
      await api.delete(`/users/${userId}`);
      await fetchUsers();
      setConfirmModal({ open: false, action: null, message: '' });
    } catch (error) {
      console.error('Error deleting user:', error);
      notify(error.response?.data?.message || 'Error al eliminar usuario');
    }
  };

  const handleResetPassword = async (userId) => {
    const newPassword = prompt('Ingrese la nueva contraseña temporal (mínimo 8 caracteres):');
    if (newPassword && newPassword.length >= 8) {
      try {
        await api.post(`/users/${userId}/reset-password`, { newPassword });
        notify('Contraseña restablecida exitosamente. El usuario deberá cambiarla en su próximo inicio de sesión.');
      } catch (error) {
        console.error('Error resetting password:', error);
        notify(error.response?.data?.message || 'Error al restablecer contraseña');
      }
    } else if (newPassword) {
      notify('La contraseña debe tener al menos 8 caracteres.');
    }
  };

  const handleRevokeSessions = async (userId) => {
    if (window.confirm('¿Está seguro de revocar todas las sesiones de este usuario?')) {
      try {
        await api.post(`/users/${userId}/revoke-sessions`);
        notify('Sesiones revocadas exitosamente.');
      } catch (error) {
        console.error('Error revoking sessions:', error);
        notify(error.response?.data?.message || 'Error al revocar sesiones');
      }
    }
  };

  const getRoleBadge = (role) => {
    const styles = {
      admin: 'bg-purple-100 text-purple-800',
      staff: 'bg-blue-100 text-blue-800',
      student: 'bg-green-100 text-green-800'
    };
    const labels = {
      admin: 'Admin',
      staff: 'Staff',
      student: 'Alumno'
    };
    return <span className={`px-2 py-1 text-xs rounded-full ${styles[role] || 'bg-gray-100'}`}>{labels[role] || role}</span>;
  };

  const getStatusBadge = (status) => {
    if (status === 'active') {
      return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">Activo</span>;
    }
    return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">Inactivo</span>;
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Usuarios y Permisos</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
        >
          <Plus size={20} />
          Nuevo Usuario
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por nombre o usuario..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-md"
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="px-4 py-2 border rounded-md"
        >
          <option value="">Todos los roles</option>
          <option value="admin">Administrador</option>
          <option value="staff">Staff</option>
          <option value="student">Alumno</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2 border rounded-md"
        >
          <option value="">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
        </select>
        <button onClick={fetchUsers} className="px-4 py-2 bg-gray-200 rounded-md hover:bg-gray-300">
          Actualizar
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Último Acceso</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan="6" className="px-6 py-4 text-center">Cargando usuarios...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan="6" className="px-6 py-4 text-center">No se encontraron usuarios</td></tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap">{user.full_name}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{user.username}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{getRoleBadge(user.role)}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(user.status)}
                    {user.must_change_password && (
                      <span className="ml-2 px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                        Cambio pendiente
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : 'Nunca'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingUser(user);
                          setModalOpen(true);
                        }}
                        className="text-blue-600 hover:text-blue-800"
                        title="Editar"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => handleResetPassword(user.id)}
                        className="text-yellow-600 hover:text-yellow-800"
                        title="Restablecer contraseña"
                      >
                        <Key size={18} />
                      </button>
                      <button
                        onClick={() => handleRevokeSessions(user.id)}
                        className="text-orange-600 hover:text-orange-800"
                        title="Revocar sesiones"
                      >
                        <LogOut size={18} />
                      </button>
                      {user.status === 'active' ? (
                        <button
                          onClick={() => {
                            setConfirmModal({
                              open: true,
                              action: () => handleUpdateUser(user.id, { status: 'inactive' }),
                              message: `¿Está seguro de deshabilitar al usuario ${user.full_name}?`
                            });
                          }}
                          className="text-red-600 hover:text-red-800"
                          title="Deshabilitar"
                        >
                          <UserX size={18} />
                        </button>
                      ) : (
                        <button
                          onClick={() => handleUpdateUser(user.id, { status: 'active' })}
                          className="text-green-600 hover:text-green-800"
                          title="Habilitar"
                        >
                          <UserCheck size={18} />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setConfirmModal({
                            open: true,
                            action: () => handleDeleteUser(user.id),
                            message: `¿Está seguro de eliminar al usuario ${user.full_name}? Esta acción no se puede deshacer.`
                          });
                        }}
                        className="text-red-600 hover:text-red-800"
                        title="Eliminar"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modales */}
      <UserFormModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingUser(null);
        }}
        onSubmit={editingUser ? (data) => handleUpdateUser(editingUser.id, data) : handleCreateUser}
        initialData={editingUser}
        isEditing={!!editingUser}
      />

      <ConfirmModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, action: null, message: '' })}
        onConfirm={confirmModal.action}
        message={confirmModal.message}
      />
    </div>
  );
};

export default Users;