const { query } = require("../config/db");

/**
 * Verifica disponibilidad de asientos de forma preliminar
 */
const checkSeatsAvailabilityPreliminary = async (functionId, seatIds) => {
  if (!functionId || !Array.isArray(seatIds) || seatIds.length === 0) {
    throw new Error("Parámetros inválidos para verificar disponibilidad");
  }

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

  const result = await query(sql, [functionId, seatIds]);

  const unavailableSeats = result.rows.filter(
    (seat) => seat.status !== "available" || seat.isreserved
  );

  if (unavailableSeats.length > 0) {
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

/**
 * Busca una reserva por su ID temporal
 */
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

/**
 * Verifica si una reserva está en procesamiento
 */
const isReservationInProcessing = async (temporaryId) => {
  try {
    // Primero verificar si la tabla existe
    const tableCheckSql = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'reservationprocessing'
      );
    `;
    
    const tableResult = await query(tableCheckSql);
    const tableExists = tableResult.rows[0].exists;
    
    if (!tableExists) {
      console.warn('Tabla ReservationProcessing no existe, creándola...');
      
      const createTableSql = `
        CREATE TABLE IF NOT EXISTS ReservationProcessing (
          id SERIAL PRIMARY KEY,
          temporaryId VARCHAR(100) NOT NULL UNIQUE,
          status VARCHAR(50) NOT NULL,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;
      
      await query(createTableSql);
      return false; // Si acabamos de crear la tabla, no hay registros
    }
    
    // Si la tabla existe, buscar el registro
    const twoMinutesAgo = new Date();
    twoMinutesAgo.setMinutes(twoMinutesAgo.getMinutes() - 2);

    const sql = `
      SELECT 1
      FROM ReservationProcessing
      WHERE temporaryId = $1 AND createdAt > $2
      LIMIT 1
    `;

    const result = await query(sql, [temporaryId, twoMinutesAgo]);
    return result.rows.length > 0;
  } catch (error) {
    console.error("Error al verificar procesamiento:", error);
    return false;
  }
};

/**
 * Registra un intento fallido de reserva
 */
const recordFailedReservationAttempt = async (data) => {
  const { temporaryId, reason, unavailableSeats } = data;

  try {
    // Verificar si la tabla existe
    const tableCheckSql = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'reservationattempts'
      );
    `;
    
    const tableResult = await query(tableCheckSql);
    const tableExists = tableResult.rows[0].exists;
    
    if (!tableExists) {
      console.warn('Tabla ReservationAttempts no existe, creándola...');
      
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
      
      await query(createTableSql);
    }

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
      timestamp: new Date().toISOString(),
    };

    const result = await query(sql, [
      temporaryId,
      "failed",
      reason,
      JSON.stringify(details),
    ]);

    return result.rows[0];
  } catch (error) {
    console.error("Error al registrar intento fallido:", error);
    return { error: error.message };
  }
};

/**
 * Actualiza el estado de procesamiento de una reserva
 * @param {string} temporaryId - ID temporal
 * @param {string} status - Estado ('processing', 'completed', 'failed')
 */
const updateProcessingStatus = async (temporaryId, status) => {
  try {
    // Verificar si la tabla existe
    const tableCheckSql = `
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'reservationprocessing'
      );
    `;
    
    const tableResult = await query(tableCheckSql);
    const tableExists = tableResult.rows[0].exists;
    
    if (!tableExists) {
      console.warn('Tabla ReservationProcessing no existe, creándola...');
      
      const createTableSql = `
        CREATE TABLE IF NOT EXISTS ReservationProcessing (
          id SERIAL PRIMARY KEY,
          temporaryId VARCHAR(100) NOT NULL UNIQUE,
          status VARCHAR(50) NOT NULL,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;
      
      await query(createTableSql);
    }
    
    const sql = `
      INSERT INTO ReservationProcessing (
        temporaryId, 
        status, 
        createdAt, 
        updatedAt
      ) 
      VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (temporaryId) 
      DO UPDATE SET 
        status = $2,
        updatedAt = CURRENT_TIMESTAMP
      RETURNING id
    `;
    
    const result = await query(sql, [temporaryId, status]);
    
    return result.rows[0];
  } catch (error) {
    console.error('Error al actualizar estado de procesamiento:', error);
    return { error: error.message };
  }
};

/**
 * Obtiene una reserva por su ID
 */
const getReservationById = async (reservationId) => {
  try {
    // 1. Obtener datos básicos de la reserva
    const reservationSql = `
      SELECT 
        r.id,
        r.userId,
        r.customerName,
        r.customerDni,
        r.contactEmail,
        r.totalAmount,
        r.status,
        r.temporaryId,
        r.updateReason,
        r.createdAt,
        r.updatedAt
      FROM 
        Reservations r
      WHERE 
        r.id = $1
    `;
    
    const reservationResult = await query(reservationSql, [reservationId]);
    
    if (reservationResult.rows.length === 0) {
      return null;
    }
    
    const reservation = reservationResult.rows[0];
    
    // 2. Obtener los items de la reserva con detalles
    const itemsSql = `
      SELECT 
        ri.id,
        ri.functionId,
        ri.seatId,
        ri.price,
        ri.status,
        ri.createdAt,
        ri.updatedAt,
        f.functionDate,
        f.functionTime,
        s.name as showName,
        v.name as venueName,
        seat.row as seatRow,
        seat.number as seatNumber,
        sec.name as sectionName
      FROM 
        ReservationItems ri
      JOIN 
        FunctionsTable f ON ri.functionId = f.id
      JOIN 
        Shows s ON f.showId = s.id
      JOIN 
        Venues v ON f.venueId = v.id
      JOIN 
        Seats seat ON ri.seatId = seat.id
      JOIN 
        Sections sec ON seat.sectionId = sec.id
      WHERE 
        ri.reservationId = $1
      ORDER BY 
        sec.id, seat.row, seat.number
    `;
    
    const itemsResult = await query(itemsSql, [reservationId]);
    
    // Agregar los items a la reserva
    reservation.items = itemsResult.rows;
    
    // 3. Agregar información de resumen
    reservation.summary = {
      totalItems: reservation.items.length,
      itemsByStatus: {}
    };
    
    // Contar items por estado
    reservation.items.forEach(item => {
      const status = item.status;
      if (!reservation.summary.itemsByStatus[status]) {
        reservation.summary.itemsByStatus[status] = 0;
      }
      reservation.summary.itemsByStatus[status]++;
    });
    
    return reservation;
  } catch (error) {
    console.error('Error al obtener reserva por ID:', error);
    throw error;
  }
};

/**
 * Verifica si hay un tiempo límite para una reserva
 */
const checkReservationTimeLimit = async (reservationId) => {
  const sql = `
    SELECT 
      r.id,
      r.status,
      r.createdAt,
      EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - r.createdAt)) as secondsElapsed
    FROM 
      Reservations r
    WHERE 
      r.id = $1 AND
      r.status = 'pending'
  `;

  const result = await query(sql, [reservationId]);

  if (result.rows.length === 0) {
    return null;
  }

  const reservationInfo = result.rows[0];
  const timeLimit = 600; // 10 minutos (en segundos)
  const secondsElapsed = parseInt(reservationInfo.secondselapsed, 10);
  const timeRemaining = timeLimit - secondsElapsed;

  return {
    reservationId,
    secondsElapsed,
    timeLimit,
    timeRemaining,
    isExpired: timeRemaining <= 0
  };
};

/**
 * Actualiza el estado de una reserva
 */
const updateReservationStatus = async (reservationId, newStatus, updateReason = null) => {
  try {
    // Validar estados permitidos
    const allowedStatuses = ['confirmed', 'canceled', 'failed'];
    if (!allowedStatuses.includes(newStatus)) {
      throw new Error(`Estado inválido: ${newStatus}`);
    }
    
    // Iniciar una transacción
    const client = await require('../config/db').pool.connect();
    
    try {
      // 1. Actualizar el estado de la reserva
      await client.query('BEGIN');
      
      const updateReservationSql = `
        UPDATE Reservations
        SET status = $1, updateReason = $2, updatedAt = CURRENT_TIMESTAMP
        WHERE id = $3
        RETURNING id, status
      `;
      
      await client.query(updateReservationSql, [newStatus, updateReason, reservationId]);
      
      // 2. Actualizar el estado de todos los items de la reserva
      const updateItemsSql = `
        UPDATE ReservationItems
        SET status = $1, updatedAt = CURRENT_TIMESTAMP
        WHERE reservationId = $2
        RETURNING id, seatId, functionId
      `;
      
      const itemsResult = await client.query(updateItemsSql, [newStatus, reservationId]);
      
      // 3. Si se cancela o falla, restaurar disponibilidad de asientos
      if (newStatus === 'canceled' || newStatus === 'failed') {
        // Restaurar estado de asientos a 'available'
        const seatIds = itemsResult.rows.map(item => item.seatid);
        const functionId = itemsResult.rows[0]?.functionid;
        
        if (seatIds.length > 0) {
          const updateSeatsPromises = seatIds.map(seatId => {
            const updateSeatSql = `
              UPDATE Seats 
              SET status = 'available' 
              WHERE id = $1
            `;
            
            return client.query(updateSeatSql, [seatId]);
          });
          
          await Promise.all(updateSeatsPromises);
          
          // Actualizar contador de asientos disponibles
          if (functionId) {
            const updateFunctionSectionsSql = `
              UPDATE FunctionSections fs
              SET availableSeats = availableSeats + 1
              FROM Seats s
              WHERE s.id = ANY($1)
              AND s.sectionId = fs.sectionId
              AND fs.functionId = $2
            `;
            
            await client.query(updateFunctionSectionsSql, [seatIds, functionId]);
          }
        }
      }
      
      // Hacer commit de la transacción
      await client.query('COMMIT');
      
      // Obtener la reserva actualizada
      return await getReservationById(reservationId);
      
    } catch (error) {
      // Hacer rollback en caso de error
      await client.query('ROLLBACK');
      throw error;
    } finally {
      // Liberar el cliente
      client.release();
    }
  } catch (error) {
    console.error('Error al actualizar estado de reserva:', error);
    throw error;
  }
};

module.exports = {
  checkSeatsAvailabilityPreliminary,
  findReservationByTemporaryId,
  isReservationInProcessing,
  recordFailedReservationAttempt,
  updateProcessingStatus,
  getReservationById,
  checkReservationTimeLimit,
  updateReservationStatus,
};