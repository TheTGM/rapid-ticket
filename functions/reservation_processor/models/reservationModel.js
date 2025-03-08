const checkSeatsAvailabilityPreliminary = async (functionId, seatIds) => {
  // Importar el pool directamente para hacer la consulta
  const { pool } = require("../config/db");

  // Validaciones básicas
  if (!functionId || !Array.isArray(seatIds) || seatIds.length === 0) {
    throw new Error("Parámetros inválidos para verificar disponibilidad");
  }

  // Consulta para verificar si hay asientos ya reservados
  const sql = `
    SELECT 
      s.id as seatId,
      s.status,
      EXISTS (
        SELECT 1 FROM ReservationItems ri 
        WHERE ri.seatId = s.id 
        AND ri.functionId = $1 
        AND ri.status IN ('pending', 'confirmed')
      ) as isReserved
    FROM 
      Seats s
    WHERE 
      s.id = ANY($2)
  `;

  try {
    const result = await pool.query(sql, [functionId, seatIds]);

    // Verificar si todos los asientos están disponibles
    const unavailableSeats = result.rows.filter(
      (seat) => seat.status !== "available" || seat.isreserved
    );

    if (unavailableSeats.length > 0) {
      // Retornar los IDs de asientos no disponibles
      return {
        available: false,
        unavailableSeats: unavailableSeats.map((s) => s.seatid),
      };
    }

    return {
      available: true,
      unavailableSeats: [],
    };
  } catch (error) {
    console.error("Error en verificación preliminar:", error);
    throw error;
  }
};

const findReservationByTemporaryId = async (temporaryId) => {
  const sql = `
      SELECT 
        id, 
        userId, 
        customerName, 
        customerDni, 
        contactEmail, 
        totalAmount, 
        status, 
        temporaryId,
        createdAt, 
        updatedAt
      FROM 
        Reservations
      WHERE 
        temporaryId = $1
      LIMIT 1
    `;

  const result = await query(sql, [temporaryId]);

  return result.rows.length > 0 ? result.rows[0] : null;
};

const isReservationInProcessing = async (temporaryId) => {
  const twoMinutesAgo = new Date();
  twoMinutesAgo.setMinutes(twoMinutesAgo.getMinutes() - 2);

  const sql = `
      SELECT 1
      FROM ReservationProcessing
      WHERE temporaryId = $1 AND createdAt > $2
      LIMIT 1
    `;

  try {
    const result = await query(sql, [temporaryId, twoMinutesAgo]);
    return result.rows.length > 0;
  } catch (error) {
    console.error("Error al verificar procesamiento:", error);

    return false;
  }
};

const recordFailedReservationAttempt = async (data) => {
  const { pool } = require('../config/db');
  const { temporaryId, reason, unavailableSeats } = data;
  
  // Verificar si la tabla existe
  try {
    const tableCheckSql = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'reservationattempts'
      );
    `;
    
    const tableResult = await pool.query(tableCheckSql);
    const tableExists = tableResult.rows[0].exists;
    
    if (!tableExists) {
      console.warn('Tabla ReservationAttempts no existe, creándola...');
      
      // Crear la tabla si no existe
      const createTableSql = `
        CREATE TABLE IF NOT EXISTS ReservationAttempts (
          id SERIAL PRIMARY KEY,
          temporaryId VARCHAR(100) NOT NULL,
          status VARCHAR(50) NOT NULL,
          reason TEXT,
          details JSONB,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;
      
      await pool.query(createTableSql);
    }
    
    // Insertar el registro de intento fallido
    const sql = `
      INSERT INTO ReservationAttempts (
        temporaryId,
        status,
        reason,
        details,
        createdAt
      ) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      RETURNING id
    `;
    
    const details = {
      unavailableSeats: unavailableSeats || [],
      timestamp: new Date().toISOString()
    };
    
    const result = await pool.query(sql, [
      temporaryId,
      'failed',
      reason,
      JSON.stringify(details)
    ]);
    
    return result.rows[0];
  } catch (error) {
    console.error('Error al registrar intento fallido:', error);
    
    // No propagamos el error para evitar que falle el procesamiento principal
    return { error: error.message };
  }
};

const checkSeatsAvailability = async (client, functionId, seatIds) => {
  // Validaciones básicas
  if (!functionId || !Array.isArray(seatIds) || seatIds.length === 0) {
    throw new Error("Parámetros inválidos para verificar disponibilidad");
  }

  if (!client || typeof client.query !== "function") {
    throw new Error("Cliente de base de datos inválido");
  }

  // Consulta para verificar si hay asientos ya reservados
  const sql = `
    SELECT 
      s.id as seatId,
      s.status,
      EXISTS (
        SELECT 1 FROM ReservationItems ri 
        WHERE ri.seatId = s.id 
        AND ri.functionId = $1 
        AND ri.status IN ('pending', 'confirmed')
      ) as isReserved
    FROM 
      Seats s
    WHERE 
      s.id = ANY($2)
  `;

  const result = await client.query(sql, [functionId, seatIds]);

  // Verificar si todos los asientos están disponibles
  const unavailableSeats = result.rows.filter(
    (seat) => seat.status !== "available" || seat.isreserved
  );

  if (unavailableSeats.length > 0) {
    // Retornar los IDs de asientos no disponibles
    return {
      available: false,
      unavailableSeats: unavailableSeats.map((s) => s.seatid),
    };
  }

  return {
    available: true,
    unavailableSeats: [],
  };
};

const getSeatPrices = async (client, functionId, seatIds) => {
  if (!client || typeof client.query !== 'function') {
    throw new Error('Cliente de base de datos inválido');
  }
  
  const sql = `
    SELECT 
      s.id as seatId,
      fs.price
    FROM 
      Seats s
    JOIN 
      Sections sec ON s.sectionId = sec.id
    JOIN 
      FunctionSections fs ON fs.sectionId = sec.id AND fs.functionId = $1
    WHERE 
      s.id = ANY($2)
  `;
  
  const result = await client.query(sql, [functionId, seatIds]);
  
  // Crear mapa de precios por asiento
  const prices = {};
  let totalPrice = 0;
  
  result.rows.forEach(row => {
    prices[row.seatid] = parseFloat(row.price);
    totalPrice += parseFloat(row.price);
  });
  
  return {
    seatPrices: prices,
    totalPrice
  };
};

module.exports = {
  checkSeatsAvailabilityPreliminary,
  findReservationByTemporaryId,
  isReservationInProcessing,
  recordFailedReservationAttempt,
  checkSeatsAvailability,
  getSeatPrices
};
