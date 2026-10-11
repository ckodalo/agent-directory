SET XACT_ABORT ON;
BEGIN TRANSACTION;

IF OBJECT_ID('dbo.locations', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.locations (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(120) NOT NULL,
    county NVARCHAR(120) NOT NULL,
    latitude DECIMAL(10,7), longitude DECIMAL(10,7)
  );
  CREATE INDEX idx_location ON dbo.locations(county,name);
END;

IF OBJECT_ID('dbo.agents', 'U') IS NULL
  CREATE TABLE dbo.agents (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(160) NOT NULL, agency_name NVARCHAR(160),
    phone NVARCHAR(40), whatsapp NVARCHAR(40), bio NVARCHAR(MAX),
    latitude DECIMAL(10,7), longitude DECIMAL(10,7),
    verification_status VARCHAR(20) NOT NULL DEFAULT 'unverified'
      CHECK (verification_status IN ('unverified','pending','verified','rejected')),
    is_published BIT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
  );

IF OBJECT_ID('dbo.agent_service_areas', 'U') IS NULL
  CREATE TABLE dbo.agent_service_areas (
    agent_id INT NOT NULL REFERENCES dbo.agents(id) ON DELETE CASCADE,
    location_id INT NOT NULL REFERENCES dbo.locations(id) ON DELETE CASCADE,
    PRIMARY KEY(agent_id,location_id)
  );

IF OBJECT_ID('dbo.reviews', 'U') IS NULL
  CREATE TABLE dbo.reviews (
    id INT IDENTITY(1,1) PRIMARY KEY,
    agent_id INT NOT NULL REFERENCES dbo.agents(id) ON DELETE CASCADE,
    rating TINYINT NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment NVARCHAR(MAX),
    moderation_status VARCHAR(20) NOT NULL DEFAULT 'pending'
      CHECK (moderation_status IN ('pending','approved','rejected')),
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
  );

IF OBJECT_ID('dbo.advertisements', 'U') IS NULL
  CREATE TABLE dbo.advertisements (
    id INT IDENTITY(1,1) PRIMARY KEY,
    agent_id INT NOT NULL REFERENCES dbo.agents(id) ON DELETE CASCADE,
    headline NVARCHAR(180) NOT NULL, description NVARCHAR(MAX),
    image_url NVARCHAR(500), target_url NVARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft','pending','approved','rejected')),
    starts_at DATETIME2 NOT NULL, ends_at DATETIME2 NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME()
  );

IF OBJECT_ID('dbo.advertisement_locations', 'U') IS NULL
  CREATE TABLE dbo.advertisement_locations (
    advertisement_id INT NOT NULL REFERENCES dbo.advertisements(id) ON DELETE CASCADE,
    location_id INT NOT NULL REFERENCES dbo.locations(id) ON DELETE CASCADE,
    PRIMARY KEY(advertisement_id,location_id)
  );

INSERT INTO dbo.locations(name,county,latitude,longitude)
SELECT seed.name,seed.county,seed.latitude,seed.longitude FROM (VALUES
  ('Kilimani','Nairobi',-1.2921000,36.7820000),
  ('Westlands','Nairobi',-1.2676000,36.8108000),
  ('Kileleshwa','Nairobi',-1.2816000,36.7815000),
  ('Parklands','Nairobi',-1.2600000,36.8170000)
) seed(name,county,latitude,longitude)
WHERE NOT EXISTS (SELECT 1 FROM dbo.locations l WHERE l.name=seed.name AND l.county=seed.county);

COMMIT;
