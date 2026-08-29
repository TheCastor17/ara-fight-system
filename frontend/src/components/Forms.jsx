import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Field } from './UI';

function getErrorMessage(error, fallback = 'No se pudo completar la operación.') {
  const detail = error?.data?.detail;
  if (Array.isArray(detail)) return detail.join(' ');
  if (typeof detail === 'string') return detail;
  return error?.data?.error || error?.message || fallback;
}

function normalizeTime(value) {
  return value ? String(value).slice(0, 5) : '18:00';
}

export function BranchForm({ item, onDone }) {
  const [form, setForm] = useState({ name: '', address: '', phone: '', active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({
      name: item?.name || '',
      address: item?.address || '',
      phone: item?.phone || '',
      active: item?.active ?? true
    });
    setError('');
  }, [item]);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        active: Boolean(form.active)
      };
      const data = item
        ? await api.patch(`/api/catalog/branches/${item.id}`, payload)
        : await api.post('/api/catalog/branches', payload);
      onDone(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'No se pudo guardar la sede.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="form-grid">
      <Field label="Nombre">
        <input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      </Field>
      <Field label="Teléfono">
        <input maxLength={20} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
      </Field>
      <Field full label="Dirección">
        <input maxLength={300} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
      </Field>
      <Field label="Estado">
        <select value={String(form.active)} onChange={(event) => setForm({ ...form, active: event.target.value === 'true' })}>
          <option value="true">Activa</option>
          <option value="false">Inactiva</option>
        </select>
      </Field>
      {error && <div className="form-error full">{error}</div>}
      <div className="form-actions full">
        <button type="submit" disabled={saving}>{saving ? 'Guardando...' : item ? 'Guardar cambios' : 'Guardar sede'}</button>
      </div>
    </form>
  );
}

export function DisciplineForm({ branches, item, onDone }) {
  const [form, setForm] = useState({ branch_id: '', name: '', description: '', active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({
      branch_id: item?.branch_id || branches[0]?.id || '',
      name: item?.name || '',
      description: item?.description || '',
      active: item?.active ?? true
    });
    setError('');
  }, [item, branches]);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        branch_id: form.branch_id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        active: Boolean(form.active)
      };
      const data = item
        ? await api.patch(`/api/catalog/disciplines/${item.id}`, payload)
        : await api.post('/api/catalog/disciplines', payload);
      onDone(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'No se pudo guardar la disciplina.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="form-grid">
      <Field label="Sede">
        <select required value={form.branch_id} onChange={(event) => setForm({ ...form, branch_id: event.target.value })}>
          <option value="">Selecciona una sede</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </Field>
      <Field label="Disciplina">
        <input required maxLength={100} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      </Field>
      <Field full label="Descripción">
        <textarea maxLength={500} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      </Field>
      <Field label="Estado">
        <select value={String(form.active)} onChange={(event) => setForm({ ...form, active: event.target.value === 'true' })}>
          <option value="true">Activa</option>
          <option value="false">Inactiva</option>
        </select>
      </Field>
      {error && <div className="form-error full">{error}</div>}
      <div className="form-actions full">
        <button type="submit" disabled={saving}>{saving ? 'Guardando...' : item ? 'Guardar cambios' : 'Guardar disciplina'}</button>
      </div>
    </form>
  );
}

export function PlanForm({ branches, disciplines, item, onDone }) {
  const [form, setForm] = useState({ branch_id: '', discipline_id: '', name: '', price: 0, classes_per_week: 2, active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({
      branch_id: item?.branch_id || '',
      discipline_id: item?.discipline_id || '',
      name: item?.name || '',
      price: Number(item?.price || 0),
      classes_per_week: item?.classes_per_week === null ? '' : Number(item?.classes_per_week || 2),
      active: item?.active ?? true
    });
    setError('');
  }, [item]);

  const availableDisciplines = disciplines.filter((discipline) => !form.branch_id || discipline.branch_id === form.branch_id);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        branch_id: form.branch_id || null,
        discipline_id: form.discipline_id || null,
        name: form.name.trim(),
        price: Number(form.price),
        classes_per_week: form.classes_per_week === '' ? null : Number(form.classes_per_week),
        active: Boolean(form.active)
      };
      const data = item
        ? await api.patch(`/api/catalog/plans/${item.id}`, payload)
        : await api.post('/api/catalog/plans', payload);
      onDone(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'No se pudo guardar el plan.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="form-grid">
      <Field label="Nombre">
        <input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      </Field>
      <Field label="Precio mensual">
        <input required type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} />
      </Field>
      <Field label="Sede">
        <select value={form.branch_id} onChange={(event) => setForm({ ...form, branch_id: event.target.value, discipline_id: '' })}>
          <option value="">Todas las sedes</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </Field>
      <Field label="Disciplina">
        <select value={form.discipline_id} onChange={(event) => setForm({ ...form, discipline_id: event.target.value })}>
          <option value="">Multidisciplina</option>
          {availableDisciplines.map((discipline) => <option key={discipline.id} value={discipline.id}>{discipline.name}</option>)}
        </select>
      </Field>
      <Field label="Clases por semana">
        <input type="number" min="1" max="14" value={form.classes_per_week} onChange={(event) => setForm({ ...form, classes_per_week: event.target.value === '' ? '' : Number(event.target.value) })} />
      </Field>
      <Field label="Estado">
        <select value={String(form.active)} onChange={(event) => setForm({ ...form, active: event.target.value === 'true' })}>
          <option value="true">Activo</option>
          <option value="false">Inactivo</option>
        </select>
      </Field>
      {error && <div className="form-error full">{error}</div>}
      <div className="form-actions full">
        <button type="submit" disabled={saving}>{saving ? 'Guardando...' : item ? 'Guardar cambios' : 'Guardar plan'}</button>
      </div>
    </form>
  );
}

export function ClassForm({ branches, disciplines, item, onDone }) {
  const [form, setForm] = useState({ branch_id: '', discipline_id: '', name: '', instructor_id: null, weekdays: [1, 3, 5], start_time: '18:00', duration_minutes: 60, capacity: 25, active: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  useEffect(() => {
    setForm({
      branch_id: item?.branch_id || '',
      discipline_id: item?.discipline_id || '',
      name: item?.name || '',
      instructor_id: item?.instructor_id || null,
      weekdays: Array.isArray(item?.weekdays) ? [...item.weekdays] : [1, 3, 5],
      start_time: normalizeTime(item?.start_time),
      duration_minutes: Number(item?.duration_minutes || 60),
      capacity: Number(item?.capacity || 25),
      active: item?.active ?? true
    });
    setError('');
  }, [item]);

  const availableDisciplines = disciplines.filter((discipline) => !form.branch_id || discipline.branch_id === form.branch_id);

  function toggleDay(dayIndex) {
    setForm((current) => ({
      ...current,
      weekdays: current.weekdays.includes(dayIndex)
        ? current.weekdays.filter((day) => day !== dayIndex)
        : [...current.weekdays, dayIndex].sort((a, b) => a - b)
    }));
  }

  async function save(event) {
    event.preventDefault();
    setError('');
    if (!form.weekdays.length) {
      setError('Selecciona al menos un día de la semana.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        branch_id: form.branch_id,
        discipline_id: form.discipline_id,
        name: form.name.trim(),
        instructor_id: form.instructor_id || null,
        weekdays: form.weekdays,
        start_time: normalizeTime(form.start_time),
        duration_minutes: Number(form.duration_minutes),
        capacity: Number(form.capacity),
        active: Boolean(form.active)
      };
      const data = item
        ? await api.patch(`/api/catalog/classes/${item.id}`, payload)
        : await api.post('/api/catalog/classes', payload);
      onDone(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, item ? 'No se pudo modificar la clase.' : 'No se pudo crear la clase.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="form-grid">
      <Field label="Nombre de la clase">
        <input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      </Field>
      <Field label="Estado">
        <select value={String(form.active)} onChange={(event) => setForm({ ...form, active: event.target.value === 'true' })}>
          <option value="true">Activa</option>
          <option value="false">Inactiva</option>
        </select>
      </Field>
      <Field label="Sede">
        <select required value={form.branch_id} onChange={(event) => setForm({ ...form, branch_id: event.target.value, discipline_id: '' })}>
          <option value="">Selecciona una sede</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </Field>
      <Field label="Disciplina">
        <select required value={form.discipline_id} onChange={(event) => setForm({ ...form, discipline_id: event.target.value })}>
          <option value="">Selecciona una disciplina</option>
          {availableDisciplines.map((discipline) => <option key={discipline.id} value={discipline.id}>{discipline.name}</option>)}
        </select>
      </Field>
      <Field label="Hora de inicio">
        <input type="time" required value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} />
      </Field>
      <Field label="Duración en minutos">
        <input type="number" required min="15" max="300" value={form.duration_minutes} onChange={(event) => setForm({ ...form, duration_minutes: Number(event.target.value) })} />
      </Field>
      <Field label="Aforo máximo">
        <input type="number" required min="1" max="500" value={form.capacity} onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })} />
      </Field>
      <Field full label="Días de la semana">
        <div className="day-picker">
          {days.map((dayName, dayIndex) => (
            <button type="button" key={dayName} className={form.weekdays.includes(dayIndex) ? 'selected' : ''} onClick={() => toggleDay(dayIndex)}>
              {dayName}
            </button>
          ))}
        </div>
      </Field>
      {error && <div className="form-error full">{error}</div>}
      <div className="form-actions full">
        <button type="submit" disabled={saving}>{saving ? 'Guardando...' : item ? 'Guardar cambios' : 'Crear clase'}</button>
      </div>
    </form>
  );
}

export function StudentForm({ branches, plans, classes, item, onDone }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', document: '', birth_date: '', phone: '', email: '', address: '',
    guardian_name: '', guardian_document: '', guardian_relationship: '', guardian_phone: '', guardian_email: '',
    branch_id: '', plan_id: '', payment_day: 1, discount: 0, class_ids: []
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({
      first_name: item?.first_name || '',
      last_name: item?.last_name || '',
      document: item?.document || '',
      birth_date: item?.birth_date || '',
      phone: item?.phone || '',
      email: item?.email || '',
      address: item?.address || '',
      guardian_name: item?.guardian_name || '',
      guardian_document: item?.guardian_document || '',
      guardian_relationship: item?.guardian_relationship || '',
      guardian_phone: item?.guardian_phone || '',
      guardian_email: item?.guardian_email || '',
      branch_id: item?.branch_id || '',
      plan_id: item?.plan_id || '',
      payment_day: Number(item?.payment_day || 1),
      discount: Number(item?.discount || 0),
      class_ids: Array.isArray(item?.class_ids) ? item.class_ids : []
    });
    setError('');
  }, [item]);

  const availablePlans = plans.filter((plan) => !plan.branch_id || plan.branch_id === form.branch_id);
  const availableClasses = classes.filter((classItem) => classItem.branch_id === form.branch_id && classItem.active !== false);

  function toggleClass(classId) {
    setForm((current) => ({
      ...current,
      class_ids: current.class_ids.includes(classId)
        ? current.class_ids.filter((id) => id !== classId)
        : [...current.class_ids, classId]
    }));
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        first_name: form.first_name.trim(), last_name: form.last_name.trim(),
        document: form.document.trim() || null, birth_date: form.birth_date || null,
        phone: form.phone.trim() || null, email: form.email.trim() || null,
        address: form.address.trim() || null, guardian_name: form.guardian_name.trim() || null,
        guardian_document: form.guardian_document.trim() || null,
        guardian_relationship: form.guardian_relationship.trim() || null,
        guardian_phone: form.guardian_phone.trim() || null,
        guardian_email: form.guardian_email.trim() || null,
        branch_id: form.branch_id, plan_id: form.plan_id || null,
        payment_day: Number(form.payment_day), discount: Number(form.discount), class_ids: form.class_ids
      };
      const data = item
        ? await api.patch(`/api/students/${item.id}`, payload)
        : await api.post('/api/students', payload);
      onDone(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError, item ? 'No se pudo modificar el alumno.' : 'No se pudo registrar el alumno.'));
    } finally {
      setSaving(false);
    }
  }

  const input = (key, type = 'text') => (
    <input type={type} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
  );

  return (
    <form onSubmit={save} className="form-grid">
      <h3 className="full form-section">Datos personales</h3>
      <Field label="Nombres"><input required value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} /></Field>
      <Field label="Apellidos"><input required value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} /></Field>
      <Field label="Documento">{input('document')}</Field>
      <Field label="Nacimiento">{input('birth_date', 'date')}</Field>
      <Field label="Teléfono">{input('phone')}</Field>
      <Field label="Correo">{input('email', 'email')}</Field>
      <Field full label="Dirección">{input('address')}</Field>

      <h3 className="full form-section">Tutor o responsable</h3>
      <Field label="Nombre">{input('guardian_name')}</Field>
      <Field label="Documento">{input('guardian_document')}</Field>
      <Field label="Parentesco">{input('guardian_relationship')}</Field>
      <Field label="WhatsApp">{input('guardian_phone')}</Field>
      <Field full label="Correo del responsable">{input('guardian_email', 'email')}</Field>

      <h3 className="full form-section">Inscripción y pagos</h3>
      <Field label="Sede">
        <select required value={form.branch_id} onChange={(event) => setForm({ ...form, branch_id: event.target.value, plan_id: '', class_ids: [] })}>
          <option value="">Selecciona una sede</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
      </Field>
      <Field label="Plan">
        <select value={form.plan_id} onChange={(event) => setForm({ ...form, plan_id: event.target.value })}>
          <option value="">Sin plan</option>
          {availablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
        </select>
      </Field>
      <Field label="Día de pago">
        <input type="number" min="1" max="31" required value={form.payment_day} onChange={(event) => setForm({ ...form, payment_day: Number(event.target.value) })} />
      </Field>
      <Field label="Descuento">
        <input type="number" min="0" step="0.01" value={form.discount} onChange={(event) => setForm({ ...form, discount: Number(event.target.value) })} />
      </Field>
      <Field full label="Clases">
        {!form.branch_id ? <div className="notice">Selecciona una sede para ver las clases disponibles.</div> : availableClasses.length === 0 ? <div className="notice">La sede seleccionada no tiene clases activas.</div> : (
          <div className="checks">
            {availableClasses.map((classItem) => (
              <label key={classItem.id}>
                <input type="checkbox" checked={form.class_ids.includes(classItem.id)} onChange={() => toggleClass(classItem.id)} />
                {classItem.name}
              </label>
            ))}
          </div>
        )}
      </Field>
      {error && <div className="form-error full">{error}</div>}
      <div className="form-actions full">
        <button type="submit" disabled={saving}>{saving ? 'Guardando...' : item ? 'Guardar cambios' : 'Registrar alumno'}</button>
      </div>
    </form>
  );
}
