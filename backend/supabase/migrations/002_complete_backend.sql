begin;
create extension if not exists pgcrypto;
-- Adiciones seguras al esquema inicial
alter table public.students add column if not exists phone text;
alter table public.students add column if not exists email text;
alter table public.students add column if not exists address text;
alter table public.students add column if not exists guardian_document text;
alter table public.students add column if not exists guardian_relationship text;
alter table public.students add column if not exists guardian_email text;
alter table public.students add column if not exists discount numeric(10,2) not null default 0 check(discount>=0);
alter table public.students add column if not exists enrollment_date date not null default current_date;
alter table public.audit_logs add column if not exists ip_hash text;
alter table public.notification_logs add column if not exists dedupe_key text;
create unique index if not exists notification_logs_dedupe_idx on public.notification_logs(dedupe_key) where dedupe_key is not null;
create unique index if not exists students_document_unique on public.students(document) where document is not null and document<>'';
create table if not exists public.registration_submissions(id uuid primary key default gen_random_uuid(),link_id uuid not null references public.registration_links(id),branch_id uuid not null references public.branches(id),first_name text not null,last_name text not null,document text,birth_date date,phone text,email text,address text,guardian_name text,guardian_document text,guardian_relationship text,guardian_phone text,guardian_email text,payment_day int not null check(payment_day between 1 and 31),status text not null default 'pending' check(status in('pending','approved','rejected')),reviewed_by uuid references public.profiles(id),reviewed_at timestamptz,created_at timestamptz not null default now());
create table if not exists public.dashboard_widgets(id uuid primary key default gen_random_uuid(),profile_id uuid not null references public.profiles(id) on delete cascade,title text not null,metric text not null check(metric in('attendance','active_students','income','overdue','new_students')),chart_type text not null check(chart_type in('bar','line','doughnut','number')),filters jsonb not null default '{}',position int not null default 0,size text not null default 'medium' check(size in('small','medium','large')),color text not null default '#2867ee',active boolean not null default true,created_at timestamptz not null default now());
create index if not exists submissions_branch_idx on public.registration_submissions(branch_id,status);
create index if not exists widgets_profile_idx on public.dashboard_widgets(profile_id,position);
-- Vistas reales para API
drop view if exists public.payment_overview;
drop view if exists public.student_overview;
create or replace view public.student_overview with(security_invoker=true) as
select s.*,d.name as discipline_name,p.name as plan_name,p.price,
coalesce((select round(count(*) filter(where a.status in('present','late'))::numeric*100/nullif(count(*),0),1) from public.attendance a where a.student_id=s.id),0) as attendance_rate
from public.students s left join public.payment_plans p on p.id=s.plan_id left join public.disciplines d on d.id=p.discipline_id;
create or replace view public.payment_overview with(security_invoker=true) as
select i.*,s.branch_id,s.first_name,s.last_name,s.guardian_name,s.guardian_phone,
coalesce((select sum(p.amount) from public.payments p where p.invoice_id=i.id),0)::numeric(10,2) paid,
(i.amount-coalesce((select sum(p.amount) from public.payments p where p.invoice_id=i.id),0))::numeric(10,2) balance
from public.invoices i join public.students s on s.id=i.student_id;
-- Estado vencido calculado regularmente
create or replace function public.refresh_overdue_invoices() returns integer language plpgsql security definer set search_path=public as $$declare n integer;begin update invoices set status='overdue' where due_date<current_date and status in('pending','partial');get diagnostics n=row_count;return n;end$$;
revoke all on function public.refresh_overdue_invoices() from public,anon,authenticated;
-- Trigger de auditoria de actualización de facturas por pagos
create or replace function public.sync_invoice_status() returns trigger language plpgsql security definer set search_path=public as $$declare total numeric;due numeric;target_id uuid;begin target_id:=case when tg_op='DELETE' then old.invoice_id else new.invoice_id end;select amount into due from invoices where id=target_id for update;select coalesce(sum(amount),0) into total from payments where invoice_id=target_id;update invoices set status=case when total>=due then 'paid'::payment_status when total>0 then 'partial'::payment_status else 'pending'::payment_status end where id=target_id;return coalesce(new,old);end$$;
drop trigger if exists payment_sync_invoice on public.payments;create trigger payment_sync_invoice after insert or update or delete on public.payments for each row execute function public.sync_invoice_status();
-- RLS
alter table public.registration_submissions enable row level security;alter table public.dashboard_widgets enable row level security;
revoke all on public.registration_submissions,public.dashboard_widgets from anon;
grant select,insert,update,delete on public.dashboard_widgets to authenticated;
create policy widgets_own_select on public.dashboard_widgets for select to authenticated using(profile_id=(select auth.uid()));
create policy widgets_own_insert on public.dashboard_widgets for insert to authenticated with check(profile_id=(select auth.uid()) and public.is_admin());
create policy widgets_own_update on public.dashboard_widgets for update to authenticated using(profile_id=(select auth.uid()) and public.is_admin()) with check(profile_id=(select auth.uid()) and public.is_admin());
create policy widgets_own_delete on public.dashboard_widgets for delete to authenticated using(profile_id=(select auth.uid()) and public.is_admin());
-- Storage privado. Las cargas se realizan con URL firmada creada solo por backend.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('student-photos','student-photos',false,5242880,array['image/jpeg','image/png','image/webp']),
('payment-receipts','payment-receipts',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']),
('student-documents','student-documents',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Limpieza automática de intentos antiguos
create or replace function public.cleanup_login_attempts() returns integer language plpgsql security definer set search_path=public as $$declare n integer;begin delete from login_attempts where created_at<now()-interval '30 days';get diagnostics n=row_count;return n;end$$;
revoke all on function public.cleanup_login_attempts() from public,anon,authenticated;
commit;
