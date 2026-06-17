/**
 * src/components/UsersView.jsx — Gestión de usuarios (solo admin).
 *
 * Permite listar, crear y borrar usuarios; ajustar su rol y permisos por-etapa
 * cuando son capturadores.
 */

import { useState, useEffect, useCallback } from 'react';
import { Users, Plus, Trash2, Loader2, AlertCircle, Shield, Eye, HardHat, X, Check, Compass, Lock, KeyRound, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  listAllUsers,
  createUser,
  deleteUser,
  updateUserProfile,
  changeUserPassword,
  ROLES,
  ALL_STAGE_IDS,
  RAAL_STAGE_IDS,
} from '../lib/auth.js';

const ROLE_LABELS = {
  admin: { label: 'Administrador', icon: Shield, color: 'text-brand-400', bg: 'bg-brand-500/10' },
  capturador: { label: 'Capturador', icon: HardHat, color: 'text-blue-400', bg: 'bg-blue-500/10' },
  scout: { label: 'Scout', icon: Compass, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  director: { label: 'Director', icon: Eye, color: 'text-purple-400', bg: 'bg-purple-500/10' },
  servicios_urbanos: { label: 'Servicios Urbanos', icon: Shield, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  participacion_ciudadana: { label: 'Part. Ciudadana', icon: Shield, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  raal: { label: 'RAAL', icon: HardHat, color: 'text-amber-400', bg: 'bg-amber-500/10' },
};

const STAGE_LABELS = {
  marca: 'Marca',
  dado: 'Dado',
  parado: 'Poste instalado',
  camaras: 'Cámaras',
  internet: 'Internet',
  conexion_poste: 'Conexión poste',
  centro: 'Centro',
};

export default function UsersView({ currentProfile }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [pwdUser, setPwdUser] = useState(null); // user being password-changed
  const [newPwd, setNewPwd] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const USERS_PAGE_SIZE = 10;

  const filteredUsers = search.trim()
    ? users.filter(u => {
        const q = search.toLowerCase();
        return (u.displayName || '').toLowerCase().includes(q)
          || (u.email || '').toLowerCase().includes(q)
          || (u.role || '').toLowerCase().includes(q)
          || (ROLE_LABELS[u.role]?.label || '').toLowerCase().includes(q);
      })
    : users;
  useEffect(() => { setPage(0); }, [search]);
  const usersTotalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PAGE_SIZE));
  const usersSafePage = Math.min(page, usersTotalPages - 1);
  const pagedUsers = filteredUsers.slice(usersSafePage * USERS_PAGE_SIZE, (usersSafePage + 1) * USERS_PAGE_SIZE);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listAllUsers();
      setUsers(list);
    } catch (e) {
      setError(e?.message || 'Error cargando usuarios');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleDelete = async (user) => {
    if (user.userId === currentProfile?.userId) {
      alert('No podés borrar tu propia cuenta.');
      return;
    }
    if (!window.confirm(`¿Seguro que querés borrar a ${user.email}?`)) return;
    try {
      await deleteUser(user.userId);
      await loadUsers();
    } catch (e) {
      alert('Error al borrar: ' + (e?.message || e));
    }
  };

  const handleChangePassword = async () => {
    if (!pwdUser || !newPwd) return;
    if (newPwd.length < 6) { alert('La contraseña debe tener al menos 6 caracteres'); return; }
    setPwdSaving(true);
    try {
      await changeUserPassword(pwdUser.userId, newPwd);
      alert(`Contraseña de ${pwdUser.email} actualizada.`);
      setPwdUser(null);
      setNewPwd('');
    } catch (e) {
      alert('Error: ' + (e?.message || e));
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <div className="space-y-4 h-full overflow-y-auto p-4 sm:p-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-brand-700/20 flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-brand-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-stone-950">Usuarios</h2>
            <p className="text-xs text-stone-600">{users.length} cuentas activas</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium rounded-lg px-3 py-2 transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Crear usuario
        </button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-500" strokeWidth={1.5} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, email o rol…"
               className="w-full bg-white border border-stone-300 rounded-lg pl-9 pr-3 py-2 text-sm text-stone-800 placeholder-stone-500 focus:outline-none focus:border-brand-600" />
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-stone-500" />
        </div>
      ) : (
        <div className="bg-stone-50 border border-stone-300 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-stone-100/50 text-xs text-stone-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Usuario</th>
                <th className="text-left px-4 py-2 font-medium">Email</th>
                <th className="text-left px-4 py-2 font-medium">Rol</th>
                <th className="text-left px-4 py-2 font-medium">Etapas permitidas</th>
                <th className="text-right px-4 py-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pagedUsers.map(u => {
                const roleInfo = ROLE_LABELS[u.role] || { label: u.role, icon: Users, color: 'text-stone-600', bg: 'bg-gray-100' };
                const RoleIcon = roleInfo.icon;
                const isMe = u.userId === currentProfile?.userId;
                return (
                  <tr key={u.userId} className="border-t border-stone-300 hover:bg-stone-100/30">
                    <td className="px-4 py-3 text-stone-800">
                      {u.displayName || '—'}
                      {isMe && <span className="ml-2 text-xs text-brand-500">(vos)</span>}
                    </td>
                    <td className="px-4 py-3 text-stone-600 text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 ${roleInfo.bg} ${roleInfo.color} text-xs font-medium rounded-full px-2 py-0.5`}>
                        <RoleIcon className="w-3 h-3" />
                        {roleInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-600">
                      {u.role === 'capturador' ? (
                        (u.allowedStages || []).length === ALL_STAGE_IDS.length
                          ? <span className="text-green-400">Todas</span>
                          : (u.allowedStages || []).length === 0
                            ? <span className="text-red-400">Ninguna</span>
                            : <span>{(u.allowedStages || []).length} de {ALL_STAGE_IDS.length}</span>
                      ) : (
                        <span className="text-stone-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => setEditingUser(u)}
                        className="text-xs text-stone-600 hover:text-stone-950"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => { setPwdUser(u); setNewPwd(''); }}
                        className="text-xs text-blue-500 hover:text-blue-700"
                      >
                        🔑 Contraseña
                      </button>
                      {!isMe && (
                        <button
                          onClick={() => handleDelete(u)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-stone-500 text-sm">
                    {search.trim() ? 'Sin usuarios que coincidan con la búsqueda.' : 'No hay usuarios registrados.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && usersTotalPages > 1 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs font-mono text-stone-500">
            {filteredUsers.length.toLocaleString()} usuarios · Página {usersSafePage + 1} de {usersTotalPages}
          </div>
          <div className="flex gap-1">
            <button disabled={usersSafePage === 0} onClick={() => setPage(Math.max(0, usersSafePage - 1))}
                    className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-brand-600 hover:text-brand-600 disabled:opacity-30 text-xs font-mono flex items-center gap-1 rounded">
              <ChevronLeft className="w-3.5 h-3.5" strokeWidth={1.5} /> Anterior
            </button>
            <button disabled={usersSafePage >= usersTotalPages - 1} onClick={() => setPage(Math.min(usersTotalPages - 1, usersSafePage + 1))}
                    className="px-3 py-1.5 border border-stone-300 text-stone-600 hover:border-brand-600 hover:text-brand-600 disabled:opacity-30 text-xs font-mono flex items-center gap-1 rounded">
              Siguiente <ChevronRight className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadUsers(); }}
        />
      )}
      {/* Modal cambiar contraseña */}
      {pwdUser && (
        <div className="fixed inset-x-0 bottom-0 top-[53px] z-50 flex items-center justify-center backdrop-blur-sm p-4" onClick={() => setPwdUser(null)}>
          <div className="bg-stone-50 border border-stone-300 rounded-xl max-w-sm w-full p-6 shadow-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Lock className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-950">Cambiar contraseña</h3>
                <p className="text-xs text-stone-600">{pwdUser.email}</p>
              </div>
              <button onClick={() => setPwdUser(null)} className="ml-auto text-stone-500 hover:text-stone-950">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-mono text-stone-600 mb-1 block">Nueva contraseña</label>
                <input type="text" value={newPwd} onChange={e => setNewPwd(e.target.value)}
                       placeholder="Mínimo 6 caracteres"
                       className="w-full bg-white border-2 border-stone-300 rounded-lg px-3 py-2.5 text-sm text-stone-950 placeholder-stone-500 font-mono focus:outline-none focus:border-blue-500" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPwdUser(null)}
                        className="flex-1 px-4 py-2.5 border-2 border-stone-300 text-stone-600 hover:bg-stone-100 text-xs font-mono uppercase tracking-wider rounded-lg font-bold">
                  Cancelar
                </button>
                <button onClick={handleChangePassword} disabled={pwdSaving || newPwd.length < 6}
                        className="flex-1 px-4 py-2.5 bg-blue-500 border-2 border-blue-500 text-white hover:bg-blue-600 disabled:bg-stone-200 disabled:border-stone-200 disabled:text-stone-500 text-xs font-mono uppercase tracking-wider rounded-lg font-bold flex items-center justify-center gap-2">
                  {pwdSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onUpdated={() => { setEditingUser(null); loadUsers(); }}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Modal: Crear usuario
// -----------------------------------------------------------------------------
function CreateUserModal({ onClose, onCreated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState(ROLES.CAPTURADOR);
  const [allowedStages, setAllowedStages] = useState(new Set(ALL_STAGE_IDS));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const toggleStage = (sid) => {
    const next = new Set(allowedStages);
    if (next.has(sid)) next.delete(sid); else next.add(sid);
    setAllowedStages(next);
  };

  const submit = async () => {
    if (!email || !password || password.length < 6) {
      setError('Email y password de al menos 6 caracteres son requeridos.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createUser({
        email,
        password,
        role,
        displayName,
        allowedStages: role === ROLES.CAPTURADOR ? Array.from(allowedStages) : role === ROLES.RAAL ? RAAL_STAGE_IDS : ALL_STAGE_IDS,
      });
      onCreated();
    } catch (e) {
      setError(e?.message || 'Error al crear');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-[53px] backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-stone-50 border border-stone-300 rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-stone-950">Crear usuario</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={e => { e.preventDefault(); submit(); }} className="space-y-3" autoComplete="off">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Nombre completo</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder="Juan Pérez" className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-950 focus:outline-none focus:border-brand-600" />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="juan@ejemplo.com" className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-950 focus:outline-none focus:border-brand-600" />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Contraseña temporal (mín. 6 caracteres)</label>
            <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="La podrá cambiar después" className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-950 focus:outline-none focus:border-brand-600" />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Rol</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-950 focus:outline-none focus:border-brand-600">
              <option value={ROLES.ADMIN}>Administrador — todos los permisos</option>
              <option value={ROLES.CAPTURADOR}>Capturador — edita etapas permitidas</option>
              <option value={ROLES.SCOUT}>Scout — verificación en campo</option>
              <option value={ROLES.DIRECTOR}>Director — solo lectura</option>
              <option value={ROLES.SERVICIOS_URBANOS}>Servicios Urbanos — visor + propuestas</option>
              <option value={ROLES.PARTICIPACION_CIUDADANA}>Participación Ciudadana — visor + propuestas</option>
              <option value={ROLES.RAAL}>RAAL — captura E1-E3</option>
            </select>
          </div>

          {(role === ROLES.CAPTURADOR || role === ROLES.RAAL) && (
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-2">Etapas que puede capturar</label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_STAGE_IDS.map(sid => (
                  <label key={sid} className="flex items-center gap-2 bg-stone-100 rounded-lg px-3 py-2 cursor-pointer hover:bg-stone-200">
                    <input type="checkbox" checked={allowedStages.has(sid)} onChange={() => toggleStage(sid)}
                      className="w-4 h-4 accent-brand-500" />
                    <span className="text-xs text-stone-800">{STAGE_LABELS[sid]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-800 text-sm rounded-lg py-2">
              Cancelar
            </button>
            <button onClick={submit} disabled={loading}
              className="flex-1 bg-brand-700 hover:bg-brand-600 disabled:bg-stone-200 text-stone-950 text-sm font-medium rounded-lg py-2 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Crear
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Modal: Editar usuario
// -----------------------------------------------------------------------------
function EditUserModal({ user, onClose, onUpdated }) {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [role, setRole] = useState(user.role);
  const [allowedStages, setAllowedStages] = useState(new Set(user.allowedStages || ALL_STAGE_IDS));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const toggleStage = (sid) => {
    const next = new Set(allowedStages);
    if (next.has(sid)) next.delete(sid); else next.add(sid);
    setAllowedStages(next);
  };

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await updateUserProfile(user.userId, {
        role,
        displayName,
        allowedStages: role === ROLES.CAPTURADOR ? Array.from(allowedStages) : role === ROLES.RAAL ? RAAL_STAGE_IDS : ALL_STAGE_IDS,
      });
      onUpdated();
    } catch (e) {
      setError(e?.message || 'Error al actualizar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-x-0 bottom-0 top-[53px] backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-stone-50 border border-stone-300 rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-stone-950">Editar usuario</h3>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Email</label>
            <div className="text-sm text-stone-500 bg-stone-100 rounded-lg px-3 py-2">{user.email}</div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Nombre completo</label>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
              className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-950 focus:outline-none focus:border-brand-600" />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Rol</label>
            <select value={role} onChange={e => setRole(e.target.value)}
              className="w-full bg-stone-100 border border-stone-300 rounded-lg px-3 py-2 text-sm text-stone-950 focus:outline-none focus:border-brand-600">
              <option value={ROLES.ADMIN}>Administrador</option>
              <option value={ROLES.CAPTURADOR}>Capturador</option>
              <option value={ROLES.SCOUT}>Scout</option>
              <option value={ROLES.DIRECTOR}>Director</option>
            </select>
          </div>

          {role === ROLES.CAPTURADOR && (
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-2">Etapas que puede capturar</label>
              <div className="grid grid-cols-2 gap-2">
                {ALL_STAGE_IDS.map(sid => (
                  <label key={sid} className="flex items-center gap-2 bg-stone-100 rounded-lg px-3 py-2 cursor-pointer hover:bg-stone-200">
                    <input type="checkbox" checked={allowedStages.has(sid)} onChange={() => toggleStage(sid)}
                      className="w-4 h-4 accent-brand-500" />
                    <span className="text-xs text-stone-800">{STAGE_LABELS[sid]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-800 text-sm rounded-lg py-2">
              Cancelar
            </button>
            <button onClick={submit} disabled={loading}
              className="flex-1 bg-brand-700 hover:bg-brand-600 disabled:bg-stone-200 text-white disabled:text-stone-500 text-sm font-medium rounded-lg py-2 flex items-center justify-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
