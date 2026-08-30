-- Ejecuta este archivo solo después de habilitar Supabase Cron.
-- Hora programada: 07:10 UTC, equivalente a 02:10 en Lima.

select cron.unschedule(jobid)
from cron.job
where jobname = 'ara-fight-refresh-renewals';

select cron.schedule(
  'ara-fight-refresh-renewals',
  '10 7 * * *',
  $$select public.refresh_renewal_billing();$$
);
