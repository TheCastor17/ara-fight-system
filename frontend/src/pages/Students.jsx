import React, { useEffect, useState } from 'react';
import { Link, Pencil, Plus, Power, PowerOff, Search, Trash2 } from 'lucide-react';
import { api } from '../api';
import { Empty, Loading, Modal } from '../components/UI';
import { StudentForm } from '../components/Forms';

function errorText(error, fallback) {
  const detail = error?.data?.detail;
  if (Array.isArray(detail)) return detail.join(' ');
  if (typeof detail === 'string') return detail;
  return error?.data?.error || error?.message || fallback;
}

export default function Students({ me, branches, plans, classes, branchId, notify }) {
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editing, setEditing] = useState(null);
  const [link, setLink] = useState(null);
  const [linkBranch, setLinkBranch] = useState(branchId || branches[0]?.id || '');
  const [busyId, setBusyId] = useState(null);

  async function load() {
    const params = new URLSearchParams({ limit: '100' });
    if (branchId) params.set('branch_id', branchId);
    if (search.trim()) params.set('search', search.trim());
    const response = await api.get(`/api/students?${params.toString()}`);
    setRows(response.data || []);
  }

  useEffect(() => {
    load().catch((error) => notify(errorText(error, 'No se pudieron cargar los alumnos.')));
  }, [branchId]);

  useEffect(() => {
    if (branchId) setLinkBranch(branchId);
  }, [branchId]);

  async function showStudent(id) {
    try {
      setBusyId(id);
      setDetail(await api.get(`/api/students/${id}`));
    } catch (error) {
      notify(errorText(error, 'No se pudo cargar la ficha.'));
    } finally {
      setBusyId(null);
    }
  }

  function editStudent(student) {
    const classIds = (student.classes || [])
      .filter((entry) => entry.active !== false)
      .map((entry) => entry.class_id || entry.classes?.id)
      .filter(Boolean);
    setEditing({ ...student, class_ids: classIds });
    setDetail(null);
    setDialog('edit');
  }

  async function saveStudent() {
    setDialog(null);
    setEditing(null);
    await load();
    notify('Alumno actualizado correctamente');
  }

  async function toggleStatus(student) {
    try {
      setBusyId(student.id);
      await api.patch(`/api/students/${student.id}/status`, { active: !student.active });
      await load();
      notify(student.active ? 'Alumno deshabilitado' : 'Alumno habilitado');
    } catch (error) {
      notify(errorText(error, 'No se pudo cambiar el estado del alumno.'));
    } finally {
      setBusyId(null);
    }
  }

  async function removeStudent(student) {
    const accepted = window.confirm(
      `¿Deseas eliminar definitivamente a "${student.first_name} ${student.last_name}"? Esta operación solo se permitirá si no tiene asistencias, pagos o mensualidades.`
    );
    if (!accepted) return;
    try {
      setBusyId(student.id);
      await api.delete(`/api/students/${student.id}`);
      await load();
      notify('Alumno eliminado definitivamente');
    } catch (error) {
      if (error?.data?.error === 'ALUMNO_CON_HISTORIAL_USE_DESHABILITAR') {
        notify('El alumno tiene historial. Debes deshabilitarlo en lugar de eliminarlo.');
      } else {
        notify(errorText(error, 'No se pudo eliminar el alumno.'));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function generateLink(event) {
    event.preventDefault();
    try {
      const response = await api.post('/api/students/registration-links/create', {
        branch_id: linkBranch,
        expires_hours: 72
      });
      setLink(response.url);
    } catch (error) {
      notify(errorText(error, 'No se pudo generar el enlace.'));
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Alumnos</h2>
          <p>Expedientes, inscripciones y estado académico.</p>
        </div>
        <div className="button-group">
          <button className="secondary" onClick={() => setDialog('link')}>
            <Link size={17} /> Generar enlace
          </button>
          <button onClick={() => setDialog('new')}>
            <Plus size={17} /> Nuevo alumno
          </button>
        </div>
      </div>

      <section className="card">
        <div className="toolbar">
          <div className="search">
            <Search size={17} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && load()}
              placeholder="Buscar por nombre o documento"
            />
          </div>
          <button className="secondary" onClick={load}>Buscar</button>
        </div>

        {rows === null ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty text="No hay alumnos registrados." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Alumno</th><th>Sede</th><th>Disciplina</th><th>Plan</th>
                  <th>Asistencia</th><th>Día de pago</th><th>Estado</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((student) => {
                  const busy = busyId === student.id;
                  return (
                    <tr key={student.id}>
                      <td>
                        <div className="person">
                          <span>{student.first_name?.[0]}{student.last_name?.[0]}</span>
                          <section>
                            <b>{student.first_name} {student.last_name}</b>
                            <small>{student.document || 'Sin documento'}</small>
                          </section>
                        </div>
                      </td>
                      <td>{branches.find((branch) => branch.id === student.branch_id)?.name || '—'}</td>
                      <td>{student.discipline_name || '—'}</td>
                      <td>{student.plan_name || '—'}</td>
                      <td>{student.attendance_rate || 0}%</td>
                      <td>Día {student.payment_day}</td>
                      <td>
                        <span className={student.active ? 'pill success' : 'pill neutral'}>
                          {student.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="secondary small" disabled={busy} onClick={() => showStudent(student.id)}>Ver ficha</button>
                          <button className="secondary small" title={student.active ? 'Deshabilitar' : 'Habilitar'} disabled={busy} onClick={() => toggleStatus(student)}>
                            {student.active ? <PowerOff size={14} /> : <Power size={14} />}
                          </button>
                          {me?.role === 'admin' && (
                            <button className="danger small" title="Eliminar definitivamente" disabled={busy} onClick={() => removeStudent(student)}>
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialog === 'new' && (
        <Modal wide title="Registrar nuevo alumno" onClose={() => setDialog(null)}>
          <StudentForm branches={branches} plans={plans} classes={classes} onDone={async () => { setDialog(null); await load(); notify('Alumno registrado'); }} />
        </Modal>
      )}

      {dialog === 'edit' && editing && (
        <Modal wide title={`Editar alumno: ${editing.first_name} ${editing.last_name}`} onClose={() => { setDialog(null); setEditing(null); }}>
          <StudentForm item={editing} branches={branches} plans={plans} classes={classes} onDone={saveStudent} />
        </Modal>
      )}

      {dialog === 'link' && (
        <Modal title="Enlace de preinscripción" onClose={() => { setDialog(null); setLink(null); }}>
          {link ? (
            <>
              <div className="notice">El enlace caduca en 72 horas y solo puede utilizarse una vez.</div>
              <div className="copy-row">
                <input readOnly value={link} />
                <button onClick={() => { navigator.clipboard.writeText(link); notify('Enlace copiado'); }}>Copiar</button>
              </div>
            </>
          ) : (
            <form onSubmit={generateLink}>
              <label className="field">
                <span>Sede</span>
                <select required value={linkBranch} onChange={(event) => setLinkBranch(event.target.value)}>
                  <option value="">Selecciona una sede</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
              <div className="form-actions"><button>Generar enlace seguro</button></div>
            </form>
          )}
        </Modal>
      )}

      {detail && (
        <Modal wide title="Expediente del alumno" onClose={() => setDetail(null)}>
          <div className="student-hero">
            <div className="profile-photo">{detail.first_name?.[0]}{detail.last_name?.[0]}</div>
            <section>
              <h2>{detail.first_name} {detail.last_name}</h2>
              <p>{detail.document || 'Sin documento'} · {detail.discipline_name || 'Sin disciplina'}</p>
              <span className={detail.active ? 'pill success' : 'pill neutral'}>{detail.active ? 'Activo' : 'Inactivo'}</span>
            </section>
            <button onClick={() => editStudent(detail)}><Pencil size={16} /> Editar datos</button>
          </div>
          <div className="detail-grid">
            {[
              ['Documento', detail.document || '—'],
              ['Responsable', detail.guardian_name || '—'],
              ['Contacto', detail.guardian_phone || detail.phone || '—'],
              ['Plan', detail.plan_name || '—'],
              ['Día de pago', detail.payment_day],
              ['Asistencia', `${detail.attendance_rate || 0}%`]
            ].map(([label, value]) => (
              <div key={label}><small>{label}</small><b>{value}</b></div>
            ))}
          </div>
          <div className="tabs-static">Resumen　 Asistencia　 Pagos　 Documentos</div>
          <div className="summary-cards">
            <div><small>CLASES REGISTRADAS</small><b>{detail.classes?.length || 0}</b></div>
            <div><small>ASISTENCIAS</small><b>{detail.attendance?.length || 0}</b></div>
            <div><small>MENSUALIDADES</small><b>{detail.invoices?.length || 0}</b></div>
          </div>
        </Modal>
      )}
    </>
  );
}
