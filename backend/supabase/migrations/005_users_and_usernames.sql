-- Migración 005: Usuarios y permisos con username

-- 1. Añadir columnas a profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- 2. Índice único para username (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
ON public.profiles (LOWER(username));

-- 3. Check constraint para formato de username
ALTER TABLE public.profiles
ADD CONSTRAINT check_username_format
CHECK (
  username IS NULL OR
  username ~ '^[a-z0-9._-]{4,32}$'
);

-- 4. Función para crear perfil automáticamente al crear usuario
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, role, status, username, full_name, branch_id, student_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    COALESCE(NEW.raw_user_meta_data->>'status', 'active'),
    NEW.raw_user_meta_data->>'username',
    NEW.raw_user_meta_data->>'full_name',
    (NEW.raw_user_meta_data->>'branch_id')::UUID,
    (NEW.raw_user_meta_data->>'student_id')::UUID
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Trigger para creación automática de perfil
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Políticas RLS para profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Política: Usuarios pueden ver su propio perfil
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Política: Admins pueden ver todos los perfiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- Política: Admins pueden actualizar perfiles
DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles"
ON public.profiles FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- 7. Poblar usernames para usuarios existentes
DO $$
DECLARE
  user_record RECORD;
  base_username TEXT;
  final_username TEXT;
  counter INTEGER;
BEGIN
  FOR user_record IN
    SELECT au.id, au.email, p.id as profile_id
    FROM auth.users au
    JOIN public.profiles p ON p.id = au.id
    WHERE p.username IS NULL
  LOOP
    -- Extraer username del email (antes del @)
    base_username := SPLIT_PART(user_record.email, '@', 1);
    -- Limpiar y normalizar
    base_username := LOWER(REGEXP_REPLACE(base_username, '[^a-z0-9._-]', '', 'g'));
    -- Asegurar que cumple con la longitud
    IF LENGTH(base_username) < 4 THEN
      base_username := base_username || '0';
    END IF;
    IF LENGTH(base_username) > 32 THEN
      base_username := LEFT(base_username, 32);
    END IF;

    -- Verificar si ya existe y generar uno único
    counter := 0;
    final_username := base_username;
    WHILE EXISTS (
      SELECT 1 FROM public.profiles
      WHERE LOWER(username) = LOWER(final_username)
      AND id != user_record.profile_id
    ) LOOP
      counter := counter + 1;
      final_username := base_username || counter;
    END LOOP;

    -- Actualizar
    UPDATE public.profiles
    SET username = final_username
    WHERE id = user_record.profile_id;
  END LOOP;
END;
$$;

-- 8. Asegurar que todos los perfiles tienen username
ALTER TABLE public.profiles
ALTER COLUMN username SET NOT NULL;