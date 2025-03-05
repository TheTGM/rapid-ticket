const express = require("express");
const { StatusCodes } = require("http-status-codes");
const { Pool } = require("pg");
const api = express.Router();

// Configuración de la conexión a PostgreSQL
const pool = new Pool({
  host: "reservas-prod-rdsinstance-ujrhyb8iq5p1.cvu40ei68oeo.us-east-1.rds.amazonaws.com",
  port: 5432,
  database: "reservas_prod",
  user: "reservas_admin", // Asegúrate de que esta variable esté configurada
  password: "Nacionallds123$", // Asegúrate de que esta variable esté configurada
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
                -- Primero, crear los tipos ENUM
                CREATE TYPE IF NOT EXISTS user_role AS ENUM ('admin', 'user');
                CREATE TYPE IF NOT EXISTS user_status AS ENUM ('active', 'inactive', 'suspended');
                CREATE TYPE IF NOT EXISTS function_status AS ENUM ('scheduled', 'canceled', 'completed');
                CREATE TYPE IF NOT EXISTS seat_status AS ENUM ('available', 'reserved', 'unavailable');
                CREATE TYPE IF NOT EXISTS reservation_status AS ENUM ('pending', 'confirmed', 'canceled', 'failed');

                -- Crear secuencias específicas si no existen
                CREATE SEQUENCE IF NOT EXISTS users_id_seq START WITH 1;
                CREATE SEQUENCE IF NOT EXISTS shows_id_seq START WITH 1;
                CREATE SEQUENCE IF NOT EXISTS venues_id_seq START WITH 1;
                CREATE SEQUENCE IF NOT EXISTS sections_id_seq START WITH 1;
                CREATE SEQUENCE IF NOT EXISTS functions_id_seq START WITH 1;
                CREATE SEQUENCE IF NOT EXISTS function_sections_id_seq START WITH 1;
                CREATE SEQUENCE IF NOT EXISTS seats_id_seq START WITH 1;
                CREATE SEQUENCE IF NOT EXISTS reservations_id_seq START WITH 1;
                CREATE SEQUENCE IF NOT EXISTS reservation_items_id_seq START WITH 1;

                -- Tabla Users con secuencia específica
                CREATE TABLE IF NOT EXISTS Users (
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
                CREATE TABLE IF NOT EXISTS Shows (
                  id INTEGER PRIMARY KEY DEFAULT nextval('shows_id_seq'),
                  name VARCHAR(100) NOT NULL,
                  description TEXT,
                  duration INT, -- duración en minutos
                  imageUrl VARCHAR(255),
                  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );

                -- Lugares con secuencia específica
                CREATE TABLE IF NOT EXISTS Venues (
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
                CREATE TABLE IF NOT EXISTS Sections (
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
                CREATE TABLE IF NOT EXISTS FunctionsTable (
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
                CREATE INDEX IF NOT EXISTS idx_show_idx ON FunctionsTable (showId);
                CREATE INDEX IF NOT EXISTS idx_venue_idx ON FunctionsTable (venueId);
                CREATE INDEX IF NOT EXISTS idx_date_idx ON FunctionsTable (functionDate);
                CREATE INDEX IF NOT EXISTS idx_status_idx ON FunctionsTable (status);
                CREATE INDEX IF NOT EXISTS idx_show_date_idx ON FunctionsTable (showId, functionDate);

                -- Secciones por función (con precios) con secuencia específica
                CREATE TABLE IF NOT EXISTS FunctionSections (
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
                CREATE TABLE IF NOT EXISTS Seats (
                  id INTEGER PRIMARY KEY DEFAULT nextval('seats_id_seq'),
                  sectionId INT NOT NULL,
                  row VARCHAR(10),
                  number VARCHAR(10),
                  status seat_status NOT NULL DEFAULT 'available',
                  FOREIGN KEY (sectionId) REFERENCES Sections(id),
                  CONSTRAINT unique_seat UNIQUE (sectionId, row, number)
                );

                -- Reservas con secuencia específica
                CREATE TABLE IF NOT EXISTS Reservations (
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
                CREATE TABLE IF NOT EXISTS ReservationItems (
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
                -- Insertar Usuarios (usando users_id_seq)
                INSERT INTO Users (username, passwordHash, email, name, role, status)
                VALUES 
                  ('admin', '$2a$10$XUHoT1JMOjnHm6aJEJ4hDe5GF5FwfJKyOdS5Fl7gU5Ut5S.E8JPqa', 'admin@rapidticket.com', 'Administrador Sistema', 'admin', 'active'),
                  ('usuario1', '$2a$10$KlJ.VvNQUwM0dIBs7UW.2eBYfuXsZD9pNvUGn9uZJ9zWi6rOnE3V2', 'usuario1@email.com', 'Usuario Ejemplo', 'user', 'active'),
                  ('operador1', '$2a$10$MnF8oXU16WZrLbfQ3fOYa.5KlQb52R.Oob5mGAQ.UZ.MHx9W4b7ky', 'operador1@rapidticket.com', 'Operador Teatro', 'user', 'active')
                ON CONFLICT (username) DO NOTHING;

                -- Insertar Shows (usando shows_id_seq)
                INSERT INTO Shows (name, description, duration, imageUrl)
                VALUES 
                  ('El Fantasma de la Ópera', 'El clásico musical de Andrew Lloyd Webber.', 150, 'https://example.com/images/phantom.jpg'),
                  ('Cats', 'El famoso musical basado en los poemas de T.S. Eliot.', 140, 'https://example.com/images/cats.jpg'),
                  ('Hamlet', 'La obra maestra de Shakespeare.', 180, 'https://example.com/images/hamlet.jpg')
                ON CONFLICT DO NOTHING;

                -- Insertar Venues (usando venues_id_seq)
                INSERT INTO Venues (name, address, city, state, country, capacity, description)
                VALUES 
                  ('Teatro Colón', 'Cerrito 628', 'Buenos Aires', 'CABA', 'Argentina', 2500, 'El teatro de ópera más importante de Argentina.'),
                  ('Teatro Gran Rex', 'Av. Corrientes 857', 'Buenos Aires', 'CABA', 'Argentina', 3000, 'Teatro emblemático de Buenos Aires.')
                ON CONFLICT DO NOTHING;

                -- Insertar Secciones (usando sections_id_seq)
                INSERT INTO Sections (venueId, name, description, capacity, hasNumberedSeats)
                VALUES 
                  (1, 'Platea Baja', 'Sección principal en planta baja', 800, true),
                  (1, 'Platea Alta', 'Sección en primer piso', 600, true),
                  (2, 'Platea', 'Sección principal', 1500, true),
                  (2, 'Palcos VIP', 'Palcos con servicio exclusivo', 300, true)
                ON CONFLICT DO NOTHING;

                -- Insertar Funciones (usando functions_id_seq)
                INSERT INTO FunctionsTable (showId, venueId, functionDate, functionTime, status)
                VALUES 
                  (1, 1, '2025-04-15', '20:00:00', 'scheduled'),
                  (2, 2, '2025-03-20', '21:00:00', 'scheduled'),
                  (3, 1, '2025-05-10', '19:00:00', 'scheduled')
                ON CONFLICT DO NOTHING;
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

module.exports = api;
