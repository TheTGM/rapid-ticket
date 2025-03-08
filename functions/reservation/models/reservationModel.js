const { query } = require("../config/db");

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
  const { temporaryId, reason, unavailableSeats } = data;

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
};

module.exports = {
  checkSeatsAvailabilityPreliminary,
  findReservationByTemporaryId,
  isReservationInProcessing,
  recordFailedReservationAttempt,
};
