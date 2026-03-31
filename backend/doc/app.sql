-- checkins definition

CREATE TABLE checkins (
	id INTEGER NOT NULL, 
	created_at DATETIME NOT NULL, 
	nickname VARCHAR(80) NOT NULL, 
	is_real BOOLEAN NOT NULL, 
    checkin_date_local TEXT, 
	PRIMARY KEY (id)
);

CREATE INDEX ix_checkins_id ON checkins (id);
CREATE UNIQUE INDEX idx_checkins_name_local_date
ON checkins(nickname, checkin_date_local);