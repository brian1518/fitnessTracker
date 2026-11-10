UPDATE exercises SET equipment='pullup-bar' WHERE id='pull-up' AND owner_id IS NULL;
UPDATE exercises SET equipment='dip-bars' WHERE id='dips' AND owner_id IS NULL;
INSERT INTO exercises(id,name,muscle,equipment) VALUES('floor-reverse-fly','Prone Reverse Fly','back','bodyweight') ON CONFLICT(id) DO NOTHING;
