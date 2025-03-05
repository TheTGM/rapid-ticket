const express = require("express");
const { StatusCodes } = require("http-status-codes");
const { Pool } = require("pg");
const api = express.Router();

// Configuración de la conexión a PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: "reservas_admin", // Asegúrate de que esta variable esté configurada
  password: "Reservas2025!", // Asegúrate de que esta variable esté configurada
});

// Endpoint existente
api.post("/testShow", async (req, res, next) => {
  try {
    return res.status(StatusCodes.OK).json({ message: "ok" });
  } catch (error) {
    console.error("error API test show: ", error);
    next(error);
  }
});

// Endpoint para inicializar la base de datos con el esquema completo
api.post("/initializeDatabase", async (req, res, next) => {
  try {
    const client = await pool.connect();

    try {
      // Inicio de la transacción
      await client.query("BEGIN");

      // Script completo del esquema (igual que en el código anterior)
      const schemaScript = `
      -- Esquema corregido de base de datos para RapidTicket
-- Creando secuencias específicas para cada tabla

-- Primero, crear los tipos ENUM
CREATE TYPE user_role AS ENUM ('admin', 'user');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE function_status AS ENUM ('scheduled', 'canceled', 'completed');
CREATE TYPE seat_status AS ENUM ('available', 'reserved', 'unavailable');
CREATE TYPE reservation_status AS ENUM ('pending', 'confirmed', 'canceled', 'failed');

-- Crear secuencias específicas
CREATE SEQUENCE users_id_seq START WITH 1;
CREATE SEQUENCE shows_id_seq START WITH 1;
CREATE SEQUENCE venues_id_seq START WITH 1;
CREATE SEQUENCE sections_id_seq START WITH 1;
CREATE SEQUENCE functions_id_seq START WITH 1;
CREATE SEQUENCE function_sections_id_seq START WITH 1;
CREATE SEQUENCE seats_id_seq START WITH 1;
CREATE SEQUENCE reservations_id_seq START WITH 1;
CREATE SEQUENCE reservation_items_id_seq START WITH 1;

-- Tabla Users con secuencia específica
CREATE TABLE Users (
  id INTEGER PRIMARY KEY DEFAULT nextval('users_id_seq'),
  username VARCHAR(50) NOT NULL UNIQUE,
  passwordHash VARCHAR(255) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  status user_status NOT NULL DEFAULT 'active',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla Shows con secuencia específica
CREATE TABLE Shows (
  id INTEGER PRIMARY KEY DEFAULT nextval('shows_id_seq'),
  name VARCHAR(100) NOT NULL,
  description TEXT,
  duration INT, -- duración en minutos
  imageUrl VARCHAR(255),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lugares con secuencia específica
CREATE TABLE Venues (
  id INTEGER PRIMARY KEY DEFAULT nextval('venues_id_seq'),
  name VARCHAR(100) NOT NULL,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(50) NOT NULL,
  state VARCHAR(50),
  country VARCHAR(50) NOT NULL DEFAULT 'Argentina',
  capacity INT,
  description TEXT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Secciones de lugares con secuencia específica
CREATE TABLE Sections (
  id INTEGER PRIMARY KEY DEFAULT nextval('sections_id_seq'),
  venueId INT NOT NULL,
  name VARCHAR(50) NOT NULL,
  description TEXT,
  capacity INT,
  hasNumberedSeats BOOLEAN NOT NULL DEFAULT false,
  FOREIGN KEY (venueId) REFERENCES Venues(id),
  CONSTRAINT unique_venue_section UNIQUE (venueId, name)
);

-- Funciones (instancias de shows en lugares) con secuencia específica
CREATE TABLE FunctionsTable (
  id INTEGER PRIMARY KEY DEFAULT nextval('functions_id_seq'),
  showId INT NOT NULL,
  venueId INT NOT NULL,
  functionDate DATE NOT NULL,
  functionTime TIME NOT NULL,
  status function_status NOT NULL DEFAULT 'scheduled',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (showId) REFERENCES Shows(id),
  FOREIGN KEY (venueId) REFERENCES Venues(id),
  CONSTRAINT unique_show_venue_datetime UNIQUE (showId, venueId, functionDate, functionTime)
);

-- Crear índices para la tabla FunctionsTable
CREATE INDEX idx_show_idx ON FunctionsTable (showId);
CREATE INDEX idx_venue_idx ON FunctionsTable (venueId);
CREATE INDEX idx_date_idx ON FunctionsTable (functionDate);
CREATE INDEX idx_status_idx ON FunctionsTable (status);
CREATE INDEX idx_show_date_idx ON FunctionsTable (showId, functionDate);

-- Secciones por función (con precios) con secuencia específica
CREATE TABLE FunctionSections (
  id INTEGER PRIMARY KEY DEFAULT nextval('function_sections_id_seq'),
  functionId INT NOT NULL,
  sectionId INT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  availableSeats INT,
  FOREIGN KEY (functionId) REFERENCES FunctionsTable(id),
  FOREIGN KEY (sectionId) REFERENCES Sections(id),
  CONSTRAINT unique_function_section UNIQUE (functionId, sectionId)
);

-- Butacas con secuencia específica
CREATE TABLE Seats (
  id INTEGER PRIMARY KEY DEFAULT nextval('seats_id_seq'),
  sectionId INT NOT NULL,
  row VARCHAR(10),
  number VARCHAR(10),
  status seat_status NOT NULL DEFAULT 'available',
  FOREIGN KEY (sectionId) REFERENCES Sections(id),
  CONSTRAINT unique_seat UNIQUE (sectionId, row, number)
);

-- Reservas con secuencia específica
CREATE TABLE Reservations (
  id INTEGER PRIMARY KEY DEFAULT nextval('reservations_id_seq'),
  userId INT,
  customerName VARCHAR(100) NOT NULL,
  customerDni VARCHAR(20) NOT NULL,
  contactEmail VARCHAR(100) NOT NULL,
  totalAmount DECIMAL(10, 2),
  status reservation_status NOT NULL DEFAULT 'pending',
  updateReason VARCHAR(255),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES Users(id)
);

-- Items de reserva con secuencia específica
CREATE TABLE ReservationItems (
  id INTEGER PRIMARY KEY DEFAULT nextval('reservation_items_id_seq'),
  reservationId INT NOT NULL,
  functionId INT NOT NULL,
  seatId INT NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  status reservation_status NOT NULL DEFAULT 'pending',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reservationId) REFERENCES Reservations(id),
  FOREIGN KEY (functionId) REFERENCES FunctionsTable(id),
  FOREIGN KEY (seatId) REFERENCES Seats(id),
  CONSTRAINT unique_reservation_seat UNIQUE (reservationId, seatId)
);
            `;

      // Ejecutar el script completo
      await client.query(schemaScript);

      // Finalizar la transacción
      await client.query("COMMIT");

      return res.status(StatusCodes.OK).json({
        message:
          "Base de datos inicializada correctamente con el esquema completo",
        success: true,
      });
    } catch (error) {
      // Revertir la transacción en caso de error
      await client.query("ROLLBACK");
      console.error("Error al inicializar la base de datos:", error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "Error al inicializar la base de datos",
        error: error.message,
        success: false,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error de conexión:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Error de conexión a la base de datos",
      error: error.message,
      success: false,
    });
  }
});

// Endpoint para cargar datos de prueba
api.post("/loadTestData", async (req, res, next) => {
  try {
    const client = await pool.connect();

    try {
      // Inicio de la transacción
      await client.query("BEGIN");

      // Script para cargar datos de prueba
      const testDataScript = `
                -- Datos de ejemplo para RapidTicket
-- 2. Insertar Shows
INSERT INTO Shows (name, description, duration, imageUrl)
VALUES 
  ('El Fantasma de la Ópera', 'El clásico musical de Andrew Lloyd Webber sobre un misterioso genio enmascarado que habita en las catacumbas de la Ópera de París.', 150, 'https://example.com/images/phantom.jpg'),
  ('Cats', 'El famoso musical basado en los poemas de T.S. Eliot sobre una tribu de gatos.', 140, 'https://example.com/images/cats.jpg'),
  ('Hamlet', 'La obra maestra de Shakespeare sobre el príncipe de Dinamarca.', 180, 'https://example.com/images/hamlet.jpg'),
  ('Concierto Sinfónica', 'Un viaje a través de las mejores piezas de la música clásica.', 120, 'https://example.com/images/symphony.jpg'),
  ('Stand-up Comedy Night', 'Una noche de risas con los mejores comediantes locales.', 90, 'https://example.com/images/standup.jpg'),
  ('Ballet Clásico', 'Presentación de las piezas más emblemáticas del ballet clásico.', 130, 'https://example.com/images/ballet.jpg');

-- 3. Insertar Venues (Lugares)
INSERT INTO Venues (name, address, city, state, country, capacity, description)
VALUES 
  ('Teatro Colón', 'Cerrito 628', 'Buenos Aires', 'CABA', 'Argentina', 2500, 'El teatro de ópera más importante de Argentina y uno de los más reconocidos del mundo.'),
  ('Teatro Gran Rex', 'Av. Corrientes 857', 'Buenos Aires', 'CABA', 'Argentina', 3000, 'Uno de los teatros más emblemáticos de Buenos Aires.'),
  ('La Trastienda Club', 'Balcarce 460', 'Buenos Aires', 'CABA', 'Argentina', 800, 'Popular espacio para shows y conciertos.'),
  ('Teatro Maipo', 'Esmeralda 443', 'Buenos Aires', 'CABA', 'Argentina', 700, 'Teatro histórico dedicado a la comedia musical y el varieté.'),
  ('Teatro Ópera', 'Av. Corrientes 860', 'Buenos Aires', 'CABA', 'Argentina', 2000, 'Histórico teatro con excelente acústica para espectáculos musicales.');

-- 4. Insertar Secciones (después de tener Venues)
INSERT INTO Sections (venueId, name, description, capacity, hasNumberedSeats)
VALUES 
  (1, 'Platea Baja', 'Sección principal en planta baja', 800, true),
  (1, 'Platea Alta', 'Sección en primer piso con buena visibilidad', 600, true),
  (1, 'Palcos', 'Palcos laterales con vista privilegiada', 400, true),
  (1, 'Paraíso', 'Sección más económica en el nivel superior', 700, false),
  
  (2, 'Platea', 'Sección principal', 1500, true),
  (2, 'Palcos VIP', 'Palcos con servicio exclusivo', 300, true),
  (2, 'Balcón', 'Sección elevada con buena vista', 1200, true),
  
  (3, 'General', 'Área general sin asientos asignados', 500, false),
  (3, 'VIP', 'Área con mesas y atención personalizada', 300, true),
  
  (4, 'Platea', 'Sección principal', 400, true),
  (4, 'Palcos', 'Palcos laterales', 200, true),
  (4, 'Galería', 'Sección superior', 100, true),
  
  (5, 'Platea Baja', 'Sección principal en planta baja', 1000, true),
  (5, 'Platea Alta', 'Sección en primer piso', 600, true),
  (5, 'Palcos', 'Palcos con vista privilegiada', 400, true);

-- 5. Insertar Funciones (después de tener Shows y Venues)
INSERT INTO FunctionsTable (showId, venueId, functionDate, functionTime, status)
VALUES 
  -- El Fantasma de la Ópera en Teatro Colón
  (1, 1, '2025-04-15', '20:00:00', 'scheduled'),
  (1, 1, '2025-04-16', '20:00:00', 'scheduled'),
  (1, 1, '2025-04-17', '20:00:00', 'scheduled'),
  
  -- Cats en Teatro Gran Rex
  (2, 2, '2025-03-20', '21:00:00', 'scheduled'),
  (2, 2, '2025-03-21', '21:00:00', 'scheduled'),
  (2, 2, '2025-03-22', '18:00:00', 'scheduled'),
  (2, 2, '2025-03-22', '21:00:00', 'scheduled'),
  
  -- Hamlet en Teatro Maipo
  (3, 4, '2025-04-05', '20:30:00', 'scheduled'),
  (3, 4, '2025-04-06', '19:00:00', 'scheduled'),
  
  -- Concierto Sinfónica en Teatro Colón
  (4, 1, '2025-03-10', '20:00:00', 'scheduled'),
  
  -- Stand-up Comedy Night en La Trastienda
  (5, 3, '2025-03-07', '22:00:00', 'scheduled'),
  (5, 3, '2025-03-08', '22:00:00', 'scheduled'),
  
  -- Ballet Clásico en Teatro Ópera
  (6, 5, '2025-04-25', '20:00:00', 'scheduled'),
  (6, 5, '2025-04-26', '20:00:00', 'scheduled'),
  (6, 5, '2025-04-27', '19:00:00', 'scheduled');

-- 6. Insertar Secciones de Funciones con Precios (después de tener Funciones y Secciones)
-- El Fantasma de la Ópera en Teatro Colón
INSERT INTO FunctionSections (functionId, sectionId, price, availableSeats)
VALUES 
  (1, 1, 5000.00, 800), -- Platea Baja
  (1, 2, 3500.00, 600), -- Platea Alta
  (1, 3, 6000.00, 400), -- Palcos
  (1, 4, 2000.00, 700), -- Paraíso
  
  (2, 1, 5000.00, 800),
  (2, 2, 3500.00, 600),
  (2, 3, 6000.00, 400),
  (2, 4, 2000.00, 700),
  
  (3, 1, 5000.00, 800),
  (3, 2, 3500.00, 600),
  (3, 3, 6000.00, 400),
  (3, 4, 2000.00, 700);

-- Cats en Teatro Gran Rex
INSERT INTO FunctionSections (functionId, sectionId, price, availableSeats)
VALUES 
  (4, 5, 4500.00, 1500), -- Platea
  (4, 6, 7000.00, 300),  -- Palcos VIP
  (4, 7, 3000.00, 1200), -- Balcón
  
  (5, 5, 4500.00, 1500),
  (5, 6, 7000.00, 300),
  (5, 7, 3000.00, 1200),
  
  (6, 5, 4800.00, 1500),
  (6, 6, 7500.00, 300),
  (6, 7, 3200.00, 1200),
  
  (7, 5, 4800.00, 1500),
  (7, 6, 7500.00, 300),
  (7, 7, 3200.00, 1200);

-- Hamlet en Teatro Maipo
INSERT INTO FunctionSections (functionId, sectionId, price, availableSeats)
VALUES 
  (8, 10, 3800.00, 400), -- Platea
  (8, 11, 4500.00, 200), -- Palcos
  (8, 12, 2500.00, 100), -- Galería
  
  (9, 10, 3800.00, 400),
  (9, 11, 4500.00, 200),
  (9, 12, 2500.00, 100);

-- Concierto Sinfónica en Teatro Colón
INSERT INTO FunctionSections (functionId, sectionId, price, availableSeats)
VALUES 
  (10, 1, 4200.00, 800), -- Platea Baja
  (10, 2, 3000.00, 600), -- Platea Alta
  (10, 3, 5000.00, 400), -- Palcos
  (10, 4, 1800.00, 700); -- Paraíso

-- Stand-up Comedy Night en La Trastienda
INSERT INTO FunctionSections (functionId, sectionId, price, availableSeats)
VALUES 
  (11, 8, 2500.00, 500), -- General
  (11, 9, 3800.00, 300), -- VIP
  
  (12, 8, 2500.00, 500),
  (12, 9, 3800.00, 300);

-- Ballet Clásico en Teatro Ópera
INSERT INTO FunctionSections (functionId, sectionId, price, availableSeats)
VALUES 
  (13, 13, 4500.00, 1000), -- Platea Baja
  (13, 14, 3200.00, 600),  -- Platea Alta
  (13, 15, 5500.00, 400),  -- Palcos
  
  (14, 13, 4500.00, 1000),
  (14, 14, 3200.00, 600),
  (14, 15, 5500.00, 400),
  
  (15, 13, 4500.00, 1000),
  (15, 14, 3200.00, 600),
  (15, 15, 5500.00, 400);

-- 7. Insertar Butacas (después de tener Secciones)
-- Platea Baja Teatro Colón (primeras 5 filas, 20 asientos por fila)
DO $$
DECLARE
  r VARCHAR;
  n INTEGER;
BEGIN
  FOREACH r IN ARRAY ARRAY['A', 'B', 'C', 'D', 'E']
  LOOP
    FOR n IN 1..20 LOOP
      INSERT INTO Seats (sectionId, row, number, status)
      VALUES (1, r, n::VARCHAR, 'available');
    END LOOP;
  END LOOP;
END $$;

-- Platea Teatro Gran Rex (primeras 5 filas, 25 asientos por fila)
DO $$
DECLARE
  r VARCHAR;
  n INTEGER;
BEGIN
  FOREACH r IN ARRAY ARRAY['A', 'B', 'C', 'D', 'E']
  LOOP
    FOR n IN 1..25 LOOP
      INSERT INTO Seats (sectionId, row, number, status)
      VALUES (5, r, n::VARCHAR, 'available');
    END LOOP;
  END LOOP;
END $$;

-- VIP La Trastienda (5 filas, 10 asientos por fila)
DO $$
DECLARE
  r VARCHAR;
  n INTEGER;
BEGIN
  FOREACH r IN ARRAY ARRAY['A', 'B', 'C', 'D', 'E']
  LOOP
    FOR n IN 1..10 LOOP
      INSERT INTO Seats (sectionId, row, number, status)
      VALUES (9, r, n::VARCHAR, 'available');
    END LOOP;
  END LOOP;
END $$;

-- Asientos específicos para ejemplos de reservas
INSERT INTO Seats (id, sectionId, row, number, status)
VALUES 
  (301, 13, 'A', '1', 'reserved'),
  (302, 13, 'A', '2', 'reserved'),
  (201, 9, 'A', '1', 'reserved'),
  (50, 3, 'A', '10', 'available'),
  (51, 3, 'A', '11', 'available'),
  (52, 3, 'A', '12', 'available')
ON CONFLICT (id) DO NOTHING;

-- 8. Insertar Reservas
INSERT INTO Reservations (userId, customerName, customerDni, contactEmail, totalAmount, status)
VALUES 
  (2, 'Juan Pérez', '28456123', 'juan.perez@email.com', 10000.00, 'confirmed'),
  (4, 'María López', '30123456', 'cliente1@email.com', 7000.00, 'confirmed'),
  (5, 'Carlos Rodríguez', '25678912', 'cliente2@email.com', 9000.00, 'pending'),
  (NULL, 'Ana González', '33789456', 'ana.gonzalez@email.com', 5000.00, 'confirmed'),
  (NULL, 'Roberto Sánchez', '20147852', 'roberto@email.com', 15000.00, 'canceled');

-- 9. Insertar Items de Reserva (después de tener Reservas, Funciones y Asientos)
-- Reserva 1: Juan Pérez - 2 entradas para El Fantasma de la Ópera
INSERT INTO ReservationItems (reservationId, functionId, seatId, price, status)
VALUES 
  (1, 1, 1, 5000.00, 'confirmed'), -- Asiento A1 de Platea Baja
  (1, 1, 2, 5000.00, 'confirmed'); -- Asiento A2 de Platea Baja

-- Reserva 2: María López - 2 entradas para Cats
-- Aseguramos que los asientos existan
INSERT INTO Seats (id, sectionId, row, number, status)
VALUES 
  (101, 5, 'A', '1', 'reserved'),
  (102, 5, 'A', '2', 'reserved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO ReservationItems (reservationId, functionId, seatId, price, status)
VALUES 
  (2, 4, 101, 3500.00, 'confirmed'), -- Asiento A1 de Teatro Gran Rex
  (2, 4, 102, 3500.00, 'confirmed'); -- Asiento A2 de Teatro Gran Rex

-- Reserva 3: Carlos Rodríguez - 2 entradas para Ballet Clásico
INSERT INTO ReservationItems (reservationId, functionId, seatId, price, status)
VALUES 
  (3, 13, 301, 4500.00, 'pending'), -- Asiento A1 de Teatro Ópera
  (3, 13, 302, 4500.00, 'pending'); -- Asiento A2 de Teatro Ópera

-- Reserva 4: Ana González - 1 entrada para Stand-up Comedy
INSERT INTO ReservationItems (reservationId, functionId, seatId, price, status)
VALUES 
  (4, 11, 201, 5000.00, 'confirmed'); -- Asiento A1 en La Trastienda VIP

-- Reserva 5: Roberto Sánchez - 3 entradas para Concierto Sinfónica (cancelada)
INSERT INTO ReservationItems (reservationId, functionId, seatId, price, status)
VALUES 
  (5, 10, 50, 5000.00, 'canceled'), -- Asiento A10 de Palcos Teatro Colón
  (5, 10, 51, 5000.00, 'canceled'), -- Asiento A11 de Palcos Teatro Colón
  (5, 10, 52, 5000.00, 'canceled'); -- Asiento A12 de Palcos Teatro Colón

-- 10. Actualizar algunos asientos a reservados
UPDATE Seats SET status = 'reserved' WHERE id IN (1, 2, 101, 102, 201, 301, 302);
            `;

      // Ejecutar el script de datos de prueba
      await client.query(testDataScript);

      // Finalizar la transacción
      await client.query("COMMIT");

      return res.status(StatusCodes.OK).json({
        message: "Datos de prueba cargados correctamente",
        success: true,
      });
    } catch (error) {
      // Revertir la transacción en caso de error
      await client.query("ROLLBACK");
      console.error("Error al cargar datos de prueba:", error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "Error al cargar datos de prueba",
        error: error.message,
        success: false,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error de conexión:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Error de conexión a la base de datos",
      error: error.message,
      success: false,
    });
  }
});

// Endpoint para verificar la estructura de las tablas
api.get("/verifyTables", async (req, res, next) => {
  try {
    const client = await pool.connect();

    try {
      const tablesQuery = `
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name;
            `;

      const result = await client.query(tablesQuery);

      return res.status(StatusCodes.OK).json({
        message: "Tablas en la base de datos",
        tables: result.rows,
        count: result.rowCount,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error al verificar tablas:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Error al verificar tablas",
      error: error.message,
    });
  }
});

// Endpoint para verificar los datos en una tabla específica
api.get("/tableData/:tableName", async (req, res, next) => {
  try {
    const { tableName } = req.params;
    // Validar el nombre de la tabla para evitar inyección SQL
    const validTableNames = [
      "Users",
      "Shows",
      "Venues",
      "Sections",
      "FunctionsTable",
      "FunctionSections",
      "Seats",
      "Reservations",
      "ReservationItems",
    ];

    if (!validTableNames.includes(tableName)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Nombre de tabla no válido",
        success: false,
      });
    }

    const client = await pool.connect();

    try {
      const dataQuery = `SELECT * FROM ${tableName} ORDER BY id LIMIT 100;`;
      const result = await client.query(dataQuery);

      return res.status(StatusCodes.OK).json({
        message: `Datos de la tabla ${tableName}`,
        data: result.rows,
        count: result.rowCount,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Error al obtener datos de la tabla:`, error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: `Error al obtener datos de la tabla`,
      error: error.message,
    });
  }
});

// Endpoint para verificar las secuencias y sus valores actuales
api.get("/checkSequences", async (req, res, next) => {
  try {
    const client = await pool.connect();

    try {
      const sequencesQuery = `
                SELECT 
                    sequence_name, 
                    last_value, 
                    start_value, 
                    increment_by, 
                    max_value, 
                    min_value, 
                    cache_value 
                FROM 
                    pg_sequences 
                WHERE 
                    schemaname = 'public' 
                ORDER BY 
                    sequence_name;
            `;

      const result = await client.query(sequencesQuery);

      return res.status(StatusCodes.OK).json({
        message: "Secuencias en la base de datos",
        sequences: result.rows,
        count: result.rowCount,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error al verificar secuencias:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Error al verificar secuencias",
      error: error.message,
    });
  }
});

// Endpoint para verificar los IDs mínimos y máximos de cada tabla
api.get("/checkTableIds", async (req, res, next) => {
  try {
    const client = await pool.connect();

    try {
      const tablesQuery = `
                SELECT 'Users' AS tabla, MIN(id) AS min_id, MAX(id) AS max_id, COUNT(*) as count FROM Users
                UNION ALL
                SELECT 'Shows' AS tabla, MIN(id) AS min_id, MAX(id) AS max_id, COUNT(*) as count FROM Shows
                UNION ALL
                SELECT 'Venues' AS tabla, MIN(id) AS min_id, MAX(id) AS max_id, COUNT(*) as count FROM Venues
                UNION ALL
                SELECT 'Sections' AS tabla, MIN(id) AS min_id, MAX(id) AS max_id, COUNT(*) as count FROM Sections
                UNION ALL
                SELECT 'FunctionsTable' AS tabla, MIN(id) AS min_id, MAX(id) AS max_id, COUNT(*) as count FROM FunctionsTable;
            `;

      const result = await client.query(tablesQuery);

      return res.status(StatusCodes.OK).json({
        message: "IDs de las tablas",
        tableIds: result.rows,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error al verificar IDs de tablas:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Error al verificar IDs de tablas",
      error: error.message,
    });
  }
});

// Endpoint para inicializar la base de datos con el esquema completo
api.post("/deleteDatabase", async (req, res, next) => {
  try {
    const client = await pool.connect();

    try {
      // Inicio de la transacción
      await client.query("BEGIN");

      // Script completo del esquema (igual que en el código anterior)
      const schemaScript = `
-- Script para eliminar todos los datos de la base de datos RapidTicket
-- IMPORTANTE: Este script elimina TODOS los datos pero mantiene la estructura de tablas

-- Desactivar temporalmente las restricciones de clave foránea para poder eliminar datos sin problemas
SET session_replication_role = 'replica';

-- Truncar todas las tablas en orden inverso (debido a las dependencias de clave foránea)
TRUNCATE TABLE ReservationItems CASCADE;
TRUNCATE TABLE Reservations CASCADE;
TRUNCATE TABLE Seats CASCADE;
TRUNCATE TABLE FunctionSections CASCADE;
TRUNCATE TABLE FunctionsTable CASCADE;
TRUNCATE TABLE Sections CASCADE;
TRUNCATE TABLE Venues CASCADE;
TRUNCATE TABLE Shows CASCADE;
TRUNCATE TABLE Users CASCADE;

-- Restablecer las restricciones de clave foránea
SET session_replication_role = 'origin';

-- Reiniciar las secuencias para que empiecen de nuevo en 1
ALTER SEQUENCE users_id_seq RESTART WITH 1;
ALTER SEQUENCE shows_id_seq RESTART WITH 1;
ALTER SEQUENCE venues_id_seq RESTART WITH 1;
ALTER SEQUENCE sections_id_seq RESTART WITH 1;
ALTER SEQUENCE functions_id_seq RESTART WITH 1;
ALTER SEQUENCE function_sections_id_seq RESTART WITH 1;
ALTER SEQUENCE seats_id_seq RESTART WITH 1;
ALTER SEQUENCE reservations_id_seq RESTART WITH 1;
ALTER SEQUENCE reservation_items_id_seq RESTART WITH 1;

-- Verificar que todas las tablas estén vacías
SELECT 'Users' AS tabla, COUNT(*) AS registros FROM Users
UNION ALL
SELECT 'Shows' AS tabla, COUNT(*) AS registros FROM Shows
UNION ALL
SELECT 'Venues' AS tabla, COUNT(*) AS registros FROM Venues
UNION ALL
SELECT 'Sections' AS tabla, COUNT(*) AS registros FROM Sections
UNION ALL
SELECT 'FunctionsTable' AS tabla, COUNT(*) AS registros FROM FunctionsTable
UNION ALL
SELECT 'FunctionSections' AS tabla, COUNT(*) AS registros FROM FunctionSections
UNION ALL
SELECT 'Seats' AS tabla, COUNT(*) AS registros FROM Seats
UNION ALL
SELECT 'Reservations' AS tabla, COUNT(*) AS registros FROM Reservations
UNION ALL
SELECT 'ReservationItems' AS tabla, COUNT(*) AS registros FROM ReservationItems;
            `;

      // Ejecutar el script completo
      await client.query(schemaScript);

      // Finalizar la transacción
      await client.query("COMMIT");

      return res.status(StatusCodes.OK).json({
        message:
          "Base de datos inicializada correctamente con el esquema completo",
        success: true,
      });
    } catch (error) {
      // Revertir la transacción en caso de error
      await client.query("ROLLBACK");
      console.error("Error al inicializar la base de datos:", error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "Error al inicializar la base de datos",
        error: error.message,
        success: false,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error de conexión:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Error de conexión a la base de datos",
      error: error.message,
      success: false,
    });
  }
});

module.exports = api;
