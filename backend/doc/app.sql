-- LearnTogether SQLite schema (reference DDL for app/models.py).
--
-- Runtime DB is created/updated by SQLAlchemy Base.metadata.create_all() plus
-- lightweight ALTERs in app/db.py.init_db() for older databases.
--
-- For a fresh database you can apply this file with sqlite3, then run the app
-- (init_db is idempotent). Enable foreign keys per connection:
--   PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Tables (dependency order)
-- ---------------------------------------------------------------------------

CREATE TABLE attendance_imports (
	id INTEGER NOT NULL,
	created_at DATETIME NOT NULL,
	source_filename VARCHAR(255) NOT NULL,
	ocr_raw_text TEXT NOT NULL,
	status VARCHAR(20) NOT NULL,
	PRIMARY KEY (id)
);

-- At most one “real” row per nickname per local day is enforced in app code (crud.create_checkin), not by a DB unique constraint.
CREATE TABLE checkins (
	id INTEGER NOT NULL,
	created_at DATETIME NOT NULL,
	nickname VARCHAR(80) NOT NULL,
	is_real BOOLEAN NOT NULL,
	status VARCHAR(20) NOT NULL,
	checkin_date_local VARCHAR(10),
	PRIMARY KEY (id)
);

CREATE TABLE daily_heroes (
	id INTEGER NOT NULL,
	hero_date_local VARCHAR(10) NOT NULL,
	theme VARCHAR(200) NOT NULL,
	title VARCHAR(200) NOT NULL,
	subtitle VARCHAR(400) NOT NULL,
	image_filename VARCHAR(80) NOT NULL,
	created_at DATETIME NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE items (
	id INTEGER NOT NULL,
	title VARCHAR(200) NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE members (
	id INTEGER NOT NULL,
	created_at DATETIME NOT NULL,
	name VARCHAR(80) NOT NULL,
	role VARCHAR(80) NOT NULL,
	goal VARCHAR(80) NOT NULL,
	is_active BOOLEAN NOT NULL,
	PRIMARY KEY (id)
);

CREATE TABLE achievement_badges (
	id INTEGER NOT NULL,
	created_at DATETIME NOT NULL,
	nickname VARCHAR(120) NOT NULL,
	title VARCHAR(200) NOT NULL,
	earned_date_local VARCHAR(10) NOT NULL,
	member_id INTEGER,
	certificate_image_filename VARCHAR(255),
	PRIMARY KEY (id),
	FOREIGN KEY(member_id) REFERENCES members (id) ON DELETE SET NULL
);

CREATE TABLE attendance_import_items (
	id INTEGER NOT NULL,
	import_id INTEGER NOT NULL,
	name VARCHAR(120) NOT NULL,
	attendance_status VARCHAR(20) NOT NULL,
	confidence INTEGER NOT NULL,
	is_edited BOOLEAN NOT NULL,
	PRIMARY KEY (id),
	FOREIGN KEY(import_id) REFERENCES attendance_imports (id)
);

CREATE TABLE learning_goals (
	id INTEGER NOT NULL,
	created_at DATETIME NOT NULL,
	name VARCHAR(200) NOT NULL,
	progress INTEGER NOT NULL,
	total_units INTEGER NOT NULL,
	complete_units INTEGER NOT NULL,
	start_date DATE,
	deadline DATE,
	PRIMARY KEY (id)
);

-- ---------------------------------------------------------------------------
-- Indexes (match SQLAlchemy index=True / unique=True on columns)
-- ---------------------------------------------------------------------------

CREATE INDEX ix_attendance_imports_id ON attendance_imports (id);

CREATE INDEX ix_checkins_id ON checkins (id);

CREATE INDEX ix_daily_heroes_id ON daily_heroes (id);

CREATE UNIQUE INDEX ix_daily_heroes_hero_date_local ON daily_heroes (hero_date_local);

CREATE INDEX ix_items_id ON items (id);

CREATE INDEX ix_members_id ON members (id);

CREATE INDEX ix_achievement_badges_earned_date_local ON achievement_badges (earned_date_local);

CREATE INDEX ix_achievement_badges_nickname ON achievement_badges (nickname);

CREATE INDEX ix_achievement_badges_member_id ON achievement_badges (member_id);

CREATE INDEX ix_achievement_badges_id ON achievement_badges (id);

CREATE INDEX ix_attendance_import_items_id ON attendance_import_items (id);

CREATE INDEX ix_attendance_import_items_import_id ON attendance_import_items (import_id);

CREATE INDEX ix_learning_goals_id ON learning_goals (id);
