import React, { useEffect, useState } from 'react';

import { api } from '../api';
import {
  Loading,
  Empty,
  Modal,
  Field,
  money,
  date
} from '../components/UI';
import { Plans } from './Catalog';

const paymentStatusLabels = {
  pending: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagado',
  overdue: 'Vencido',
  cancelled: 'Cancelado'
};

const paymentMethodLabels = {
  transfer: 'Transferencia',
  cash: 'Efectivo',
  card: 'Tarjeta',
  yape: 'Yape',
  plin: 'Plin',
  other: 'Otro'
};

function getPaymentStatusLabel(status) {
  return paymentStatusLabels[status] || status || 'Sin estado';
}

function getPaymentMethodLabel(method) {
  return paymentMethodLabels[method] || method || 'Sin especificar';
}

function getPaymentStatusClass(status) {
  if (status === 'paid') {
    return 'success';
  }

  if (status === 'overdue') {
    return 'error';
  }

  if (status === 'cancelled') {
    return 'neutral';
  }

  return 'warning';
}

function getErrorMessage(
  error,
  fallback = 'No se pudo completar la operación.'
) {
  const detail = error?.data?.detail;

  if (Array.isArray(detail)) {
    return detail.join(' ');
  }

  if (typeof detail === 'string') {
    return detail;
  }

  return error?.data?.error || error?.message || fallback;
}

function getLocalDateTimeValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - offset * 60 * 1000);

  return localDate.toISOString().slice(0, 16);
}

export default function Payments({
  branches,
  disciplines,
  plans,
  reloadCatalog,
  branchId,
  notify
}) {
  const [tab, setTab] = useState('dashboard');
  const [rows, setRows] = useState(null);
  const [detail, setDetail] = useState(null);
  const [paymentForm, setPaymentForm] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);

  async function load() {
    try {
      const params = new URLSearchParams({
        limit: '100'
      });

      if (branchId) {
        params.set('branch_id', branchId);
      }

      const response = await api.get(
        `/api/payments/monthly?${params.toString()}`
      );

      setRows(response.data || []);
    } catch (error) {
      setRows([]);

      notify(
        getErrorMessage(
          error,
          'No se pudieron cargar las mensualidades.'
        )
      );
    }
  }

  useEffect(() => {
    setRows(null);
    load();
  }, [branchId]);

  const paidAmount = (rows || []).reduce(
    (total, invoice) => {
      return total + Number(invoice.paid || 0);
    },
    0
  );

  const expectedAmount = (rows || []).reduce(
    (total, invoice) => {
      return total + Number(invoice.amount || 0);
    },
    0
  );

  const pendingAmount = Math.max(
    expectedAmount - paidAmount,
    0
  );

  const overdueCount = (rows || []).filter(
    (invoice) => invoice.status === 'overdue'
  ).length;

  async function viewInvoice(invoiceId) {
    try {
      setLoadingDetail(true);

      const response = await api.get(
        `/api/payments/invoices/${invoiceId}`
      );

      setDetail(response);
    } catch (error) {
      notify(
        getErrorMessage(
          error,
          'No se pudo cargar el detalle de la mensualidad.'
        )
      );
    } finally {
      setLoadingDetail(false);
    }
  }

  function openPaymentForm(invoice) {
    setPaymentForm({
      invoice_id: invoice.id,
      student_name: `${invoice.first_name} ${invoice.last_name}`,
      available_balance: Number(invoice.balance || 0),
      amount: Number(invoice.balance || 0),
      paid_at: getLocalDateTimeValue(),
      method: 'transfer',
      operation_code: '',
      notes: ''
    });
  }

  async function savePayment(event) {
    event.preventDefault();

    if (!paymentForm) {
      return;
    }

    const amount = Number(paymentForm.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      notify('El monto debe ser mayor que cero.');
      return;
    }

    if (amount > paymentForm.available_balance) {
      notify('El monto no puede superar el saldo pendiente.');
      return;
    }

    try {
      setSavingPayment(true);

      await api.post('/api/payments', {
        invoice_id: paymentForm.invoice_id,
        amount,
        paid_at: new Date(paymentForm.paid_at).toISOString(),
        method: paymentForm.method,
        operation_code:
          paymentForm.operation_code.trim() || null,
        notes: paymentForm.notes.trim() || null
      });

      setPaymentForm(null);
      setDetail(null);

      await load();

      notify('Pago registrado correctamente');
    } catch (error) {
      notify(
        getErrorMessage(
          error,
          'No se pudo registrar el pago.'
        )
      );
    } finally {
      setSavingPayment(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Control financiero</h2>

          <p>
            Información real de mensualidades y pagos.
          </p>
        </div>
      </div>

      <div className="tabs">
        <button
          type="button"
          className={tab === 'dashboard' ? 'active' : ''}
          onClick={() => setTab('dashboard')}
        >
          Dashboard
        </button>

        <button
          type="button"
          className={tab === 'monthly' ? 'active' : ''}
          onClick={() => setTab('monthly')}
        >
          Mensualidades
        </button>

        <button
          type="button"
          className={tab === 'plans' ? 'active' : ''}
          onClick={() => setTab('plans')}
        >
          Planes
        </button>
      </div>

      {tab === 'dashboard' && (
        <div className="stats">
          <article className="card stat">
            <div>
              <small>Total esperado</small>
            </div>

            <b>{money(expectedAmount)}</b>
          </article>

          <article className="card stat">
            <div>
              <small>Recaudado</small>
            </div>

            <b>{money(paidAmount)}</b>
          </article>

          <article className="card stat">
            <div>
              <small>Por cobrar</small>
            </div>

            <b>{money(pendingAmount)}</b>
          </article>

          <article className="card stat">
            <div>
              <small>Vencidos</small>
            </div>

            <b>{overdueCount}</b>
          </article>
        </div>
      )}

      {tab === 'monthly' && (
        rows === null ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty text="No hay mensualidades." />
        ) : (
          <section className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Alumno</th>
                    <th>Vencimiento</th>
                    <th>Monto</th>
                    <th>Pagado</th>
                    <th>Saldo</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <b>
                          {invoice.first_name}{' '}
                          {invoice.last_name}
                        </b>

                        <small>
                          {invoice.guardian_name || ''}
                        </small>
                      </td>

                      <td>
                        {date(invoice.due_date)}
                      </td>

                      <td>
                        {money(invoice.amount)}
                      </td>

                      <td>
                        {money(invoice.paid)}
                      </td>

                      <td>
                        {money(invoice.balance)}
                      </td>

                      <td>
                        <span
                          className={`pill ${getPaymentStatusClass(
                            invoice.status
                          )}`}
                        >
                          {getPaymentStatusLabel(
                            invoice.status
                          )}
                        </span>
                      </td>

                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="secondary small"
                            disabled={loadingDetail}
                            onClick={() => viewInvoice(invoice.id)}
                          >
                            Ver
                          </button>

                          {Number(invoice.balance) > 0 &&
                            invoice.status !== 'cancelled' && (
                              <button
                                type="button"
                                className="small"
                                onClick={() => openPaymentForm(invoice)}
                              >
                                Registrar
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      )}

      {tab === 'plans' && (
        <Plans
          branches={branches}
          disciplines={disciplines}
          plans={plans}
          reload={reloadCatalog}
          notify={notify}
        />
      )}

      {detail && (
        <Modal
          title="Detalle de mensualidad"
          onClose={() => setDetail(null)}
        >
          <div className="detail-grid">
            <div>
              <small>Alumno</small>

              <b>
                {detail.first_name}{' '}
                {detail.last_name}
              </b>
            </div>

            <div>
              <small>Monto</small>
              <b>{money(detail.amount)}</b>
            </div>

            <div>
              <small>Pagado</small>
              <b>{money(detail.paid)}</b>
            </div>

            <div>
              <small>Saldo</small>
              <b>{money(detail.balance)}</b>
            </div>

            <div>
              <small>Vencimiento</small>
              <b>{date(detail.due_date)}</b>
            </div>

            <div>
              <small>Estado</small>

              <b>
                {getPaymentStatusLabel(
                  detail.status
                )}
              </b>
            </div>
          </div>

          <h3>Historial</h3>

          {detail.payments?.length ? (
            detail.payments.map((payment) => (
              <div
                className="notice"
                key={payment.id}
              >
                {date(payment.paid_at)} ·{' '}
                {money(payment.amount)} ·{' '}
                {getPaymentMethodLabel(
                  payment.method
                )}
              </div>
            ))
          ) : (
            <Empty text="Sin abonos registrados." />
          )}
        </Modal>
      )}

      {paymentForm && (
        <Modal
          title="Registrar pago"
          onClose={() => setPaymentForm(null)}
        >
          <form
            className="form-grid"
            onSubmit={savePayment}
          >
            <div className="notice full">
              Alumno: {paymentForm.student_name}
              <br />
              Saldo disponible:{' '}
              {money(
                paymentForm.available_balance
              )}
            </div>

            <Field label="Monto">
              <input
                type="number"
                required
                min="0.01"
                max={paymentForm.available_balance}
                step="0.01"
                value={paymentForm.amount}
                onChange={(event) => {
                  setPaymentForm({
                    ...paymentForm,
                    amount: Number(
                      event.target.value
                    )
                  });
                }}
              />
            </Field>

            <Field label="Fecha">
              <input
                type="datetime-local"
                required
                value={paymentForm.paid_at}
                onChange={(event) => {
                  setPaymentForm({
                    ...paymentForm,
                    paid_at: event.target.value
                  });
                }}
              />
            </Field>

            <Field label="Medio">
              <select
                value={paymentForm.method}
                onChange={(event) => {
                  setPaymentForm({
                    ...paymentForm,
                    method: event.target.value
                  });
                }}
              >
                <option value="transfer">
                  Transferencia
                </option>

                <option value="cash">
                  Efectivo
                </option>

                <option value="card">
                  Tarjeta
                </option>

                <option value="yape">
                  Yape
                </option>

                <option value="plin">
                  Plin
                </option>

                <option value="other">
                  Otro
                </option>
              </select>
            </Field>

            <Field label="Operación">
              <input
                maxLength={100}
                value={paymentForm.operation_code}
                onChange={(event) => {
                  setPaymentForm({
                    ...paymentForm,
                    operation_code:
                      event.target.value
                  });
                }}
              />
            </Field>

            <Field
              full
              label="Observación"
            >
              <textarea
                maxLength={500}
                value={paymentForm.notes}
                onChange={(event) => {
                  setPaymentForm({
                    ...paymentForm,
                    notes: event.target.value
                  });
                }}
              />
            </Field>

            <div className="form-actions full">
              <button
                type="submit"
                disabled={savingPayment}
              >
                {savingPayment
                  ? 'Registrando...'
                  : 'Confirmar pago'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
