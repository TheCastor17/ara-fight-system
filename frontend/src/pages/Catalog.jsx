import React, { useState } from 'react';
import { Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { api } from '../api';
import { Empty, Modal, money } from '../components/UI';
import { BranchForm, DisciplineForm, PlanForm, ClassForm } from '../components/Forms';

function getErrorMessage(error, fallback = 'No se pudo completar la operación.') {
  const detail = error?.data?.detail;
  if (Array.isArray(detail)) return detail.join(' ');
  if (typeof detail === 'string') return detail;
  return error?.data?.error || error?.message || fallback;
}

function getWeekdayNames(weekdays) {
  const names = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
  if (!Array.isArray(weekdays) || weekdays.length === 0) return '—';
  return weekdays.map((day) => names[day] ?? day).join(' · ');
}

function classPayload(item, active = item.active !== false) {
  return {
    branch_id: item.branch_id,
    discipline_id: item.discipline_id,
    name: item.name,
    instructor_id: item.instructor_id || null,
    weekdays: Array.isArray(item.weekdays) ? item.weekdays : [],
    start_time: String(item.start_time || '18:00').slice(0, 5),
    duration_minutes: Number(item.duration_minutes || 60),
    capacity: Number(item.capacity || 1),
    active
  };
}

export function Branches({ branches, disciplines, reload, notify }) {
  const [filter, setFilter] = useState('');
  const [modal, setModal] = useState(null);
  const shownBranches = filter ? branches.filter((branch) => branch.id === filter) : branches;
  const shownDisciplines = disciplines.filter((discipline) => !filter || discipline.branch_id === filter);

  async function done(message) {
    setModal(null);
    await reload();
    notify(message);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Sedes y disciplinas</h2>
          <p>Vista general o detallada por sede.</p>
        </div>
        <div className="button-group">
          <select value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="">Vista general</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
          <button type="button" onClick={() => setModal('branch')}><Plus size={17} /> Nueva sede</button>
        </div>
      </div>

      {shownBranches.length === 0 ? <Empty text="No hay sedes registradas." /> : (
        <div className="branch-grid">
          {shownBranches.map((branch) => {
            const count = disciplines.filter((discipline) => discipline.branch_id === branch.id).length;
            return (
              <section className="card branch-card" key={branch.id}>
                <div className="card-title">
                  <h3>{branch.name}</h3>
                  <span className={branch.active ? 'pill success' : 'pill neutral'}>{branch.active ? 'Activa' : 'Inactiva'}</span>
                </div>
                <p>{branch.address || 'Dirección pendiente'}</p>
                <b>{count} {count === 1 ? 'disciplina' : 'disciplinas'}</b>
              </section>
            );
          })}
        </div>
      )}

      <section className="card top-gap">
        <div className="card-title">
          <h3>Disciplinas</h3>
          <button type="button" className="secondary" onClick={() => setModal('discipline')}><Plus size={16} /> Añadir disciplina</button>
        </div>
        {shownDisciplines.length === 0 ? <Empty text="No hay disciplinas para la sede seleccionada." /> : (
          <div className="plan-grid top-gap">
            {shownDisciplines.map((discipline) => (
              <article className="plan-card" key={discipline.id}>
                <h3>{discipline.name}</h3>
                <p>{branches.find((branch) => branch.id === discipline.branch_id)?.name || 'Sede no disponible'}</p>
                <span className={discipline.active ? 'pill success' : 'pill neutral'}>{discipline.active ? 'Activa' : 'Inactiva'}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      {modal === 'branch' && (
        <Modal title="Nueva sede" onClose={() => setModal(null)}>
          <BranchForm onDone={() => done('Sede guardada correctamente')} />
        </Modal>
      )}
      {modal === 'discipline' && (
        <Modal title="Añadir disciplina" onClose={() => setModal(null)}>
          <DisciplineForm branches={branches} onDone={() => done('Disciplina guardada correctamente')} />
        </Modal>
      )}
    </>
  );
}

export function Classes({ me, branches, disciplines, classes, reload, branchId, notify }) {
  const [selectedClass, setSelectedClass] = useState(undefined);
  const [busyId, setBusyId] = useState(null);
  const shownClasses = classes.filter((item) => !branchId || item.branch_id === branchId);

  function editClass(item) {
    setSelectedClass({
      ...item,
      weekdays: Array.isArray(item.weekdays) ? [...item.weekdays] : [],
      start_time: String(item.start_time || '18:00').slice(0, 5),
      duration_minutes: Number(item.duration_minutes || 60),
      capacity: Number(item.capacity || 1),
      active: item.active !== false
    });
  }

  async function formDone() {
    const editing = selectedClass !== null;
    setSelectedClass(undefined);
    await reload();
    notify(editing ? 'Clase actualizada correctamente' : 'Clase creada correctamente');
  }

  async function toggleStatus(item) {
    try {
      setBusyId(item.id);
      await api.patch(`/api/catalog/classes/${item.id}`, classPayload(item, !item.active));
      await reload();
      notify(item.active ? 'Clase deshabilitada' : 'Clase habilitada');
    } catch (error) {
      notify(getErrorMessage(error, 'No se pudo cambiar el estado de la clase.'));
    } finally {
      setBusyId(null);
    }
  }

  async function removeClass(item) {
    if (!window.confirm(`¿Deseas eliminar la clase "${item.name}"?`)) return;
    try {
      setBusyId(item.id);
      await api.delete(`/api/catalog/classes/${item.id}`);
      await reload();
      notify('Clase eliminada');
    } catch (error) {
      if (error?.data?.error === 'CLASE_CON_HISTORIAL_USE_DESHABILITAR') {
        notify('La clase tiene historial. Debes deshabilitarla en lugar de eliminarla.');
      } else {
        notify(getErrorMessage(error, 'No se pudo eliminar la clase.'));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Clases y horarios</h2>
          <p>Programación por sede y disciplina.</p>
        </div>
        {me.role === 'admin' && <button type="button" onClick={() => setSelectedClass(null)}><Plus size={17} /> Crear clase</button>}
      </div>

      <section className="card">
        {shownClasses.length === 0 ? <Empty text="No hay clases creadas para la sede seleccionada." /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Clase</th><th>Sede</th><th>Disciplina</th><th>Días</th><th>Horario</th><th>Duración</th><th>Aforo</th><th>Estado</th>
                  {me.role === 'admin' && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {shownClasses.map((item) => {
                  const branch = branches.find((entry) => entry.id === item.branch_id);
                  const discipline = disciplines.find((entry) => entry.id === item.discipline_id);
                  const busy = busyId === item.id;
                  return (
                    <tr key={item.id}>
                      <td><b>{item.name}</b></td>
                      <td>{branch?.name || '—'}</td>
                      <td>{discipline?.name || '—'}</td>
                      <td>{getWeekdayNames(item.weekdays)}</td>
                      <td>{String(item.start_time || '').slice(0, 5)}</td>
                      <td>{item.duration_minutes} min</td>
                      <td>{item.capacity}</td>
                      <td><span className={item.active ? 'pill success' : 'pill neutral'}>{item.active ? 'Activa' : 'Inactiva'}</span></td>
                      {me.role === 'admin' && (
                        <td>
                          <div className="table-actions">
                            <button type="button" className="secondary small" title="Editar clase" disabled={busy} onClick={() => editClass(item)}><Pencil size={14} /></button>
                            <button type="button" className="secondary small" title={item.active ? 'Deshabilitar clase' : 'Habilitar clase'} disabled={busy} onClick={() => toggleStatus(item)}>{item.active ? <PowerOff size={14} /> : <Power size={14} />}</button>
                            <button type="button" className="danger small" title="Eliminar clase" disabled={busy} onClick={() => removeClass(item)}><Trash2 size={14} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedClass !== undefined && (
        <Modal wide title={selectedClass ? `Editar clase: ${selectedClass.name}` : 'Crear clase'} onClose={() => setSelectedClass(undefined)}>
          <ClassForm branches={branches} disciplines={disciplines} item={selectedClass} onDone={formDone} />
        </Modal>
      )}
    </>
  );
}

export function Plans({ branches, disciplines, plans, reload, notify }) {
  const [selectedPlan, setSelectedPlan] = useState(undefined);

  async function done() {
    const editing = selectedPlan !== null;
    setSelectedPlan(undefined);
    await reload();
    notify(editing ? 'Plan actualizado correctamente' : 'Plan creado correctamente');
  }

  return (
    <>
      <div className="page-head">
        <div><h2>Planes de pago</h2><p>Precios y frecuencia de entrenamiento.</p></div>
        <button type="button" onClick={() => setSelectedPlan(null)}><Plus size={17} /> Nuevo plan</button>
      </div>

      {plans.length === 0 ? <Empty text="No hay planes de pago registrados." /> : (
        <div className="plan-grid">
          {plans.map((plan) => {
            const discipline = disciplines.find((entry) => entry.id === plan.discipline_id);
            const branch = branches.find((entry) => entry.id === plan.branch_id);
            return (
              <article className="card plan-card" key={plan.id}>
                <span className="pill blue">{discipline?.name || 'Multidisciplina'}</span>
                <h3>{plan.name}</h3>
                <strong>{money(plan.price)}</strong>
                <p>{plan.classes_per_week ? `${plan.classes_per_week} clases por semana` : 'Clases ilimitadas'}</p>
                <p>{branch?.name || 'Todas las sedes'}</p>
                <span className={plan.active ? 'pill success' : 'pill neutral'}>{plan.active ? 'Activo' : 'Inactivo'}</span>
                <div className="top-gap">
                  <button type="button" className="secondary" onClick={() => setSelectedPlan(plan)}><Pencil size={15} /> Editar plan</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedPlan !== undefined && (
        <Modal title={selectedPlan ? `Editar plan: ${selectedPlan.name}` : 'Nuevo plan'} onClose={() => setSelectedPlan(undefined)}>
          <PlanForm item={selectedPlan} branches={branches} disciplines={disciplines} onDone={done} />
        </Modal>
      )}
    </>
  );
}
