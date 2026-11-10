CREATE TABLE users (
 id UUID PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE auth_sessions (
 token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 csrf TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
CREATE TABLE profiles (
 user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 data JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE exercises (
 id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, muscle TEXT NOT NULL,
 equipment TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'compound'
);
CREATE TABLE plans (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL, data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX plans_user ON plans(user_id);
CREATE TABLE workouts (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL, date DATE, fatigue INTEGER NOT NULL DEFAULT 0 CHECK(fatigue BETWEEN 0 AND 10),
 pain BOOLEAN NOT NULL DEFAULT false, notes TEXT NOT NULL DEFAULT '',
 completed BOOLEAN NOT NULL DEFAULT true, version INTEGER NOT NULL DEFAULT 1,
 import_key TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id, import_key)
);
CREATE INDEX workouts_user_date ON workouts(user_id,date DESC);
CREATE TABLE workout_exercises (
 id UUID PRIMARY KEY, workout_id UUID NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
 exercise_id TEXT NOT NULL REFERENCES exercises(id), position INTEGER NOT NULL,
 notes TEXT NOT NULL DEFAULT '', target_min INTEGER NOT NULL DEFAULT 8,
 target_max INTEGER NOT NULL DEFAULT 12, increment NUMERIC NOT NULL DEFAULT 2.5,
 rest_seconds INTEGER NOT NULL DEFAULT 120 CHECK(rest_seconds BETWEEN 0 AND 900),
 CHECK(target_min BETWEEN 1 AND 50 AND target_max BETWEEN target_min AND 50),
 CHECK(increment BETWEEN 0 AND 100)
);
CREATE INDEX workout_exercises_workout ON workout_exercises(workout_id);
CREATE TABLE workout_sets (
 id UUID PRIMARY KEY, workout_exercise_id UUID NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
 position INTEGER NOT NULL, weight NUMERIC NOT NULL CHECK(weight BETWEEN 0 AND 1500),
 reps INTEGER NOT NULL CHECK(reps BETWEEN 1 AND 500),
 kind TEXT NOT NULL CHECK(kind IN ('warmup','working')),
 rpe NUMERIC CHECK(rpe BETWEEN 1 AND 10), rir NUMERIC CHECK(rir BETWEEN 0 AND 10)
);
CREATE INDEX workout_sets_exercise ON workout_sets(workout_exercise_id);
CREATE TABLE goals (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('strength','bodyweight','frequency')),
 exercise_id TEXT REFERENCES exercises(id), target NUMERIC NOT NULL CHECK(target > 0 AND target <= 1500),
 deadline DATE, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX goals_user ON goals(user_id);
CREATE TABLE body_records (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 date DATE NOT NULL, weight NUMERIC NOT NULL CHECK(weight BETWEEN 20 AND 500),
 waist NUMERIC CHECK(waist BETWEEN 20 AND 300), notes TEXT NOT NULL DEFAULT '',
 UNIQUE(user_id,date)
);
CREATE TABLE ai_messages (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 question TEXT NOT NULL, answer JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_user ON ai_messages(user_id,created_at DESC);
CREATE TABLE ai_usage (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, date DATE NOT NULL DEFAULT CURRENT_DATE,
 requests INTEGER NOT NULL DEFAULT 0, tokens INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id,date)
);
CREATE VIEW personal_records AS
 SELECT w.user_id, e.exercise_id, max(s.weight) AS max_weight,
 max(CASE WHEN s.reps <= 10 AND s.weight > 0 THEN s.weight * (1 + s.reps / 30.0) END) AS estimated_1rm
 FROM workouts w JOIN workout_exercises e ON e.workout_id=w.id
 JOIN workout_sets s ON s.workout_exercise_id=e.id
 WHERE w.completed AND s.kind='working' GROUP BY w.user_id,e.exercise_id;
