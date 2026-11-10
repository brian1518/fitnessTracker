ALTER TABLE exercises ADD COLUMN owner_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE exercises DROP CONSTRAINT exercises_name_key;
CREATE UNIQUE INDEX exercises_public_name ON exercises(lower(name)) WHERE owner_id IS NULL;
CREATE UNIQUE INDEX exercises_private_name ON exercises(owner_id,lower(name)) WHERE owner_id IS NOT NULL;
CREATE TABLE recommendations (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 exercise_id TEXT NOT NULL REFERENCES exercises(id),
 data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,exercise_id)
);
CREATE TABLE imported_sets (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 fingerprint TEXT NOT NULL,
 workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL,
 PRIMARY KEY(user_id,fingerprint)
);
