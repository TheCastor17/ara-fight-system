begin;

alter table public.invoices add column if not exists period_start date;
alter table public.invoices add column if not exists period_end date;
alter table public.invoices add column if not exists grace_until date;
alter table public.invoices add column if not exists renewal_number integer;
alter table public.invoices add column if not exists cancelled_at timestamptz;
alter table public.invoices add column if not exists cancelled_by uuid references public.profiles(id);
alter table public.invoices add column if not exists cancellation_reason text;

create or replace function public.renewal_date(
  base_date date,
  months_to_add integer,
  target_day integer
)
returns date
language sql
immutable
as $$
  select make_date(
    extract(year from (date_trunc('month', base_date) + make_interval(months => months_to_add)))::integer,
    extract(month from (date_trunc('month', base_date) + make_interval(months => months_to_add)))::integer,
    least(
      greatest(target_day, 1),
      extract(
        day from (
          date_trunc('month', base_date)
          + make_interval(months => months_to_add + 1)
          - interval '1 day'
        )
      )::integer
    )
  );
$$;

with ranked_invoices as (
  select
    i.id,
    coalesce(i.period_start, i.due_date, i.period) as calculated_start,
    row_number() over (
      partition by i.student_id
      order by coalesce(i.period_start, i.due_date, i.period), i.created_at, i.id
    )::integer as calculated_number,
    s.payment_day
  from public.invoices i
  join public.students s on s.id = i.student_id
)
update public.invoices i
set
  period_start = coalesce(i.period_start, r.calculated_start),
  period_end = coalesce(
    i.period_end,
    public.renewal_date(r.calculated_start, 1, r.payment_day) - 1
  ),
  grace_until = coalesce(i.grace_until, i.due_date + 5),
  renewal_number = coalesce(i.renewal_number, r.calculated_number)
from ranked_invoices r
where r.id = i.id;

alter table public.invoices alter column period_start set not null;
alter table public.invoices alter column period_end set not null;
alter table public.invoices alter column grace_until set not null;
alter table public.invoices alter column renewal_number set not null;

create unique index if not exists invoices_student_period_start_uq
on public.invoices(student_id, period_start);

create index if not exists invoices_due_balance_idx
on public.invoices(due_date, status)
where status <> 'cancelled';

create or replace function public.prepare_renewal_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_row public.students%rowtype;
  existing_count integer;
  start_date date;
begin
  select * into student_row
  from public.students
  where id = new.student_id;

  if not found then
    raise exception 'STUDENT_NOT_FOUND';
  end if;

  select count(*) into existing_count
  from public.invoices
  where student_id = new.student_id;

  if new.period_start is null then
    if existing_count = 0 then
      start_date := coalesce(student_row.enrollment_date, current_date);
    else
      start_date := coalesce(new.due_date, new.period, current_date);
    end if;
    new.period_start := start_date;
  end if;

  new.due_date := coalesce(new.due_date, new.period_start);
  new.period := new.period_start;
  new.period_end := coalesce(
    new.period_end,
    public.renewal_date(new.period_start, 1, student_row.payment_day) - 1
  );
  new.grace_until := coalesce(new.grace_until, new.due_date + 5);
  new.renewal_number := coalesce(
    new.renewal_number,
    existing_count + 1
  );

  return new;
end;
$$;

drop trigger if exists prepare_renewal_invoice_trigger on public.invoices;
create trigger prepare_renewal_invoice_trigger
before insert on public.invoices
for each row
execute function public.prepare_renewal_invoice();

create or replace function public.create_next_renewal(target_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_invoice public.invoices%rowtype;
  student_row public.students%rowtype;
  next_start date;
  next_end date;
  next_id uuid;
  plan_price numeric(10,2);
  next_amount numeric(10,2);
begin
  select * into current_invoice
  from public.invoices
  where id = target_invoice_id;

  if not found or current_invoice.status <> 'paid' then
    return null;
  end if;

  select * into student_row
  from public.students
  where id = current_invoice.student_id;

  if not found or not student_row.active or student_row.plan_id is null then
    return null;
  end if;

  select price into plan_price
  from public.payment_plans
  where id = student_row.plan_id
    and active = true;

  if plan_price is null then
    return null;
  end if;

  next_start := public.renewal_date(
    current_invoice.period_start,
    1,
    student_row.payment_day
  );
  next_end := public.renewal_date(
    next_start,
    1,
    student_row.payment_day
  ) - 1;
  next_amount := greatest(plan_price - coalesce(student_row.discount, 0), 0);

  insert into public.invoices(
    student_id,
    period,
    period_start,
    period_end,
    due_date,
    grace_until,
    amount,
    status,
    renewal_number
  )
  values(
    student_row.id,
    next_start,
    next_start,
    next_end,
    next_start,
    next_start + 5,
    next_amount,
    'pending',
    current_invoice.renewal_number + 1
  )
  on conflict (student_id, period_start) do nothing
  returning id into next_id;

  return next_id;
end;
$$;

revoke all on function public.create_next_renewal(uuid)
from public, anon, authenticated;

create or replace function public.sync_invoice_after_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_id_value uuid;
  invoice_amount numeric(10,2);
  total_paid numeric(10,2);
  due_date_value date;
  new_status public.payment_status;
begin
  invoice_id_value := case
    when tg_op = 'DELETE' then old.invoice_id
    else new.invoice_id
  end;

  select amount, due_date
  into invoice_amount, due_date_value
  from public.invoices
  where id = invoice_id_value
  for update;

  select coalesce(sum(amount), 0)
  into total_paid
  from public.payments
  where invoice_id = invoice_id_value;

  new_status := case
    when total_paid >= invoice_amount then 'paid'::public.payment_status
    when current_date > due_date_value then 'overdue'::public.payment_status
    when total_paid > 0 then 'partial'::public.payment_status
    else 'pending'::public.payment_status
  end;

  update public.invoices
  set status = new_status
  where id = invoice_id_value
    and status <> 'cancelled';

  if new_status = 'paid' then
    perform public.create_next_renewal(invoice_id_value);
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists payment_sync_invoice on public.payments;
create trigger payment_sync_invoice
after insert or update or delete on public.payments
for each row
execute function public.sync_invoice_after_payment();

create or replace function public.refresh_renewal_billing()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  overdue_updated integer := 0;
  partial_updated integer := 0;
  pending_updated integer := 0;
  paid_updated integer := 0;
  generated_count integer := 0;
  invoice_row record;
begin
  update public.invoices i
  set status = 'paid'
  where i.status <> 'cancelled'
    and coalesce((
      select sum(p.amount)
      from public.payments p
      where p.invoice_id = i.id
    ), 0) >= i.amount;
  get diagnostics paid_updated = row_count;

  update public.invoices i
  set status = 'overdue'
  where i.status <> 'cancelled'
    and i.due_date < current_date
    and coalesce((
      select sum(p.amount)
      from public.payments p
      where p.invoice_id = i.id
    ), 0) < i.amount;
  get diagnostics overdue_updated = row_count;

  update public.invoices i
  set status = 'partial'
  where i.status <> 'cancelled'
    and i.due_date >= current_date
    and coalesce((
      select sum(p.amount)
      from public.payments p
      where p.invoice_id = i.id
    ), 0) > 0
    and coalesce((
      select sum(p.amount)
      from public.payments p
      where p.invoice_id = i.id
    ), 0) < i.amount;
  get diagnostics partial_updated = row_count;

  update public.invoices i
  set status = 'pending'
  where i.status <> 'cancelled'
    and i.due_date >= current_date
    and coalesce((
      select sum(p.amount)
      from public.payments p
      where p.invoice_id = i.id
    ), 0) = 0;
  get diagnostics pending_updated = row_count;

  for invoice_row in
    select i.id
    from public.invoices i
    join public.students s on s.id = i.student_id
    where i.status = 'paid'
      and s.active = true
      and s.plan_id is not null
  loop
    if public.create_next_renewal(invoice_row.id) is not null then
      generated_count := generated_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'paid_updated', paid_updated,
    'overdue_updated', overdue_updated,
    'partial_updated', partial_updated,
    'pending_updated', pending_updated,
    'renewals_created', generated_count,
    'executed_at', now()
  );
end;
$$;

revoke all on function public.refresh_renewal_billing()
from public, anon, authenticated;

drop view if exists public.payment_overview;
create view public.payment_overview
with (security_invoker = true)
as
select
  i.id,
  i.student_id,
  i.period,
  i.period_start,
  i.period_end,
  i.due_date,
  i.grace_until,
  i.amount,
  i.status,
  i.renewal_number,
  i.created_at,
  s.branch_id,
  s.first_name,
  s.last_name,
  s.guardian_name,
  s.guardian_phone,
  coalesce((
    select sum(p.amount)
    from public.payments p
    where p.invoice_id = i.id
  ), 0)::numeric(10,2) as paid,
  (i.amount - coalesce((
    select sum(p.amount)
    from public.payments p
    where p.invoice_id = i.id
  ), 0))::numeric(10,2) as balance,
  case
    when i.status = 'cancelled' then 'cancelled'
    when i.status = 'paid' then 'paid'
    when current_date > i.grace_until then 'outside_grace'
    when current_date > i.due_date then 'in_grace'
    when current_date = i.due_date then 'due_today'
    when current_date >= i.due_date - 5 then 'renewal_near'
    else 'upcoming'
  end as academic_status
from public.invoices i
join public.students s on s.id = i.student_id;

notify pgrst, 'reload schema';

commit;
