-- BMR alanı user_profiles tablosuna eklenir
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS bmr_kcal integer;

-- Sporsal aktivite logları tablosu
CREATE TABLE IF NOT EXISTS activity_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date          date NOT NULL DEFAULT CURRENT_DATE,
  activity_name text NOT NULL,
  duration_minutes integer,
  calories_burned integer NOT NULL,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_logs_owner" ON activity_logs
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Antrenman seansı kalori alanı
ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS calories_burned integer;

CREATE INDEX IF NOT EXISTS activity_logs_user_date ON activity_logs(user_id, date);
