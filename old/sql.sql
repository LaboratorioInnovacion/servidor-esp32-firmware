-- Tabla para dispositivos
CREATE TABLE devices (
  mac TEXT PRIMARY KEY,
  name TEXT,
  status TEXT,
  version TEXT,
  last_seen TIMESTAMP
);

-- Tabla para mediciones (por ejemplo, para almacenar uptime del heartbeat)
CREATE TABLE measurements (
  id SERIAL PRIMARY KEY,
  mac TEXT REFERENCES devices(mac),
  time TIMESTAMP,
  uptime INTEGER
);
