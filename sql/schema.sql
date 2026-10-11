CREATE TABLE IF NOT EXISTS locations (id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(120) NOT NULL,county VARCHAR(120) NOT NULL,latitude DECIMAL(10,7),longitude DECIMAL(10,7),INDEX idx_location(county,name));
CREATE TABLE IF NOT EXISTS agents (id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(160) NOT NULL,agency_name VARCHAR(160),phone VARCHAR(40),whatsapp VARCHAR(40),bio TEXT,latitude DECIMAL(10,7),longitude DECIMAL(10,7),verification_status ENUM('unverified','pending','verified','rejected') NOT NULL DEFAULT 'unverified',is_published BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS agent_service_areas (agent_id INT NOT NULL,location_id INT NOT NULL,PRIMARY KEY(agent_id,location_id),FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE,FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS reviews (id INT AUTO_INCREMENT PRIMARY KEY,agent_id INT NOT NULL,rating TINYINT NOT NULL,comment TEXT,moderation_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE,CHECK(rating BETWEEN 1 AND 5));
CREATE TABLE IF NOT EXISTS advertisements (id INT AUTO_INCREMENT PRIMARY KEY,agent_id INT NOT NULL,headline VARCHAR(180) NOT NULL,description TEXT,image_url VARCHAR(500),target_url VARCHAR(500),status ENUM('draft','pending','approved','rejected') NOT NULL DEFAULT 'pending',starts_at DATETIME NOT NULL,ends_at DATETIME NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(agent_id) REFERENCES agents(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS advertisement_locations (advertisement_id INT NOT NULL,location_id INT NOT NULL,PRIMARY KEY(advertisement_id,location_id),FOREIGN KEY(advertisement_id) REFERENCES advertisements(id) ON DELETE CASCADE,FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE);
INSERT INTO locations(name,county,latitude,longitude)
SELECT seed.name,seed.county,seed.latitude,seed.longitude FROM (
  SELECT 'Kilimani' AS name,'Nairobi' AS county,-1.2921000 AS latitude,36.7820000 AS longitude
  UNION ALL SELECT 'Westlands','Nairobi',-1.2676000,36.8108000
  UNION ALL SELECT 'Kileleshwa','Nairobi',-1.2816000,36.7815000
  UNION ALL SELECT 'Parklands','Nairobi',-1.2600000,36.8170000
) seed WHERE NOT EXISTS (SELECT 1 FROM locations l WHERE l.name=seed.name AND l.county=seed.county);
