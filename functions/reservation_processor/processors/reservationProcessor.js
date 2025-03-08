const { pool } = require("../config/db");
const reservationModel = require("../models/reservationModel");
const { invalidateCachePattern } = require("../config/redis");

// Función de utilidad para ejecutar consultas parametrizadas
const query = async (text, params = []) => {
  const result = await pool.query(text, params);
  return result;
};

const processCreateReservation = async (messageData) => {
  console.log(
    "Procesando creación de reserva:",
    messageData.temporaryReservationId
  );

  const {
    temporaryReservationId,
    userId,
    customerName,
    customerDni,
    contactEmail,
    functionId,
    seatIds,
  } = messageData;

  try {
    // Obtener cliente del pool para transacción
    const client = await pool.connect();

    try {
      // Iniciar transacción
      await client.query("BEGIN");

      // Resto del código con transacción
      const availabilityCheck = await reservationModel.checkSeatsAvailability(
        client,
        functionId,
        seatIds
      );

      if (!availabilityCheck.available) {
        await client.query("ROLLBACK");

        await reservationModel.recordFailedReservationAttempt({
          temporaryId: temporaryReservationId,
          reason: "Asientos no disponibles",
          unavailableSeats: availabilityCheck.unavailableSeats,
        });

        return {
          success: false,
          temporaryReservationId,
          message: "Algunos asientos ya no están disponibles",
          details: {
            unavailableSeats: availabilityCheck.unavailableSeats,
          },
        };
      }

      const { seatPrices, totalPrice } = await reservationModel.getSeatPrices(
        client,
        functionId,
        seatIds
      );

      const insertReservationSql = `
        INSERT INTO Reservations (
          userId, 
          customerName, 
          customerDni, 
          contactEmail, 
          totalAmount, 
          status, 
          createdAt,
          temporaryId
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
        RETURNING id, status, createdAt
      `;

      const reservationResult = await client.query(insertReservationSql, [
        userId || null,
        customerName,
        customerDni,
        contactEmail,
        totalPrice,
        "pending",
        temporaryReservationId,
      ]);

      const reservationId = reservationResult.rows[0].id;

      const insertItemPromises = seatIds.map((seatId) => {
        const price = seatPrices[seatId];

        const insertItemSql = `
          INSERT INTO ReservationItems (
            reservationId, 
            functionId, 
            seatId, 
            price, 
            status, 
            createdAt
          ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          RETURNING id
        `;

        return client.query(insertItemSql, [
          reservationId,
          functionId,
          seatId,
          price,
          "pending",
        ]);
      });

      await Promise.all(insertItemPromises);

      const updateSeatsPromises = seatIds.map((seatId) => {
        const updateSeatSql = `
          UPDATE Seats 
          SET status = 'reserved' 
          WHERE id = $1
        `;

        return client.query(updateSeatSql, [seatId]);
      });

      await Promise.all(updateSeatsPromises);

      const updateFunctionSectionsSql = `
        UPDATE FunctionSections fs
        SET availableSeats = availableSeats - 1
        FROM Seats s
        WHERE s.id = ANY($1)
        AND s.sectionId = fs.sectionId
        AND fs.functionId = $2
      `;

      await client.query(updateFunctionSectionsSql, [seatIds, functionId]);

      await client.query("COMMIT");

      await invalidateCachePattern(`functions:*`);

      console.log(`Reserva creada con éxito. ID: ${reservationId}`);

      return {
        success: true,
        temporaryReservationId,
        reservationId,
        message: "Reserva creada con éxito",
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      // Liberar cliente
      client.release();
    }
  } catch (error) {
    console.error("Error al procesar creación de reserva:", error);

    await reservationModel.recordFailedReservationAttempt({
      temporaryId: temporaryReservationId,
      reason: `Error: ${error.message}`,
    });

    return {
      success: false,
      temporaryReservationId,
      message: "Error al procesar la reserva",
      error: error.message,
    };
  }
};

const processConfirmReservation = async (messageData) => {
  console.log("Procesando confirmación de reserva:", messageData.reservationId);

  try {
    const { reservationId } = messageData;

    const updatedReservation = await reservationModel.updateReservationStatus(
      reservationId,
      "confirmed",
      "Confirmada por el cliente"
    );

    await invalidateCachePattern(`reservations:*`);

    return {
      success: true,
      reservationId,
      message: "Reserva confirmada con éxito",
    };
  } catch (error) {
    console.error("Error al procesar confirmación de reserva:", error);

    return {
      success: false,
      reservationId: messageData.reservationId,
      message: "Error al confirmar la reserva",
      error: error.message,
    };
  }
};

const processCancelReservation = async (messageData) => {
  console.log("Procesando cancelación de reserva:", messageData.reservationId);

  try {
    const { reservationId, reason } = messageData;

    const updatedReservation = await reservationModel.updateReservationStatus(
      reservationId,
      "canceled",
      reason || "Cancelada por el cliente"
    );

    await invalidateCachePattern(`reservations:*`);
    await invalidateCachePattern(`functions:*`);

    return {
      success: true,
      reservationId,
      message: "Reserva cancelada con éxito",
    };
  } catch (error) {
    console.error("Error al procesar cancelación de reserva:", error);

    return {
      success: false,
      reservationId: messageData.reservationId,
      message: "Error al cancelar la reserva",
      error: error.message,
    };
  }
};

const processExpireReservation = async (messageData) => {
  console.log("Procesando expiración de reserva:", messageData.reservationId);

  try {
    const { reservationId, reason } = messageData;

    const updatedReservation = await reservationModel.updateReservationStatus(
      reservationId,
      "failed",
      reason || "Tiempo de reserva expirado"
    );

    await invalidateCachePattern(`reservations:*`);
    await invalidateCachePattern(`functions:*`);

    return {
      success: true,
      reservationId,
      message: "Reserva marcada como expirada con éxito",
    };
  } catch (error) {
    console.error("Error al procesar expiración de reserva:", error);

    return {
      success: false,
      reservationId: messageData.reservationId,
      message: "Error al marcar la reserva como expirada",
      error: error.message,
    };
  }
};

const processMessage = async (message) => {
  try {
    // Verificar que el mensaje sea válido
    if (!message) {
      console.error("Mensaje inválido (undefined)");
      return {
        success: false,
        message: "Mensaje inválido (undefined)",
      };
    }

    // Verificar que el cuerpo del mensaje esté definido
    const messageBody = message.Body || message.body;
    if (!messageBody) {
      console.error("Cuerpo del mensaje inválido:", message);
      return {
        success: false,
        message: "Cuerpo del mensaje es undefined o null",
      };
    }

    // Log del cuerpo del mensaje para diagnóstico
    console.log("Cuerpo del mensaje a procesar:", messageBody);

    let parsedMessage;
    try {
      // Si ya es un objeto, usarlo directamente
      if (typeof messageBody === 'object' && messageBody !== null) {
        parsedMessage = messageBody;
      } else {
        // Intentar parsear como JSON
        parsedMessage = JSON.parse(messageBody);
      }
    } catch (parseError) {
      console.error("Error al parsear el cuerpo del mensaje:", parseError);
      console.error("Contenido del cuerpo:", messageBody);
      return {
        success: false,
        message: `Error de formato JSON: ${parseError.message}`,
      };
    }

    // Verificar estructura del mensaje parseado
    if (!parsedMessage || !parsedMessage.type) {
      console.error("Formato de mensaje inválido:", parsedMessage);
      return {
        success: false,
        message: "Formato de mensaje inválido: falta el campo 'type'",
      };
    }

    const { type, data } = parsedMessage;
    console.log(`Procesando mensaje tipo: ${type}`);

    // Verificar que los datos estén presentes
    if (!data) {
      console.error(`Mensaje de tipo ${type} sin datos`);
      return {
        success: false,
        message: `Mensaje de tipo ${type} no contiene datos`,
      };
    }

    // Procesar según el tipo de mensaje
    switch (type) {
      case "CREATE_RESERVATION":
        return await processCreateReservation(data);

      case "CONFIRM_RESERVATION":
        return await processConfirmReservation(data);

      case "CANCEL_RESERVATION":
        return await processCancelReservation(data);

      case "EXPIRE_RESERVATION":
        return await processExpireReservation(data);

      default:
        console.warn(`Tipo de mensaje desconocido: ${type}`);
        return {
          success: false,
          message: `Tipo de mensaje desconocido: ${type}`,
        };
    }
  } catch (error) {
    console.error("Error al procesar mensaje:", error);

    return {
      success: false,
      message: "Error al procesar mensaje",
      error: error.message,
      stack: error.stack,
    };
  }
};

const processExpiredReservations = async () => {
  console.log("Iniciando procesamiento de reservas expiradas...");

  try {
    const sql = `
      SELECT 
        id
      FROM 
        Reservations
      WHERE 
        status = 'pending' AND
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - createdAt)) > 600
    `;

    const result = await pool.query(sql);

    if (result.rows.length === 0) {
      console.log("No se encontraron reservas expiradas");
      return {
        processedCount: 0,
        status: "completed",
      };
    }

    console.log(
      `Se encontraron ${result.rows.length} reservas expiradas para procesar`
    );

    const processPromises = result.rows.map(async (row) => {
      try {
        const reservationId = row.id;
        console.log(`Procesando reserva expirada ID: ${reservationId}`);

        await reservationModel.updateReservationStatus(
          reservationId,
          "failed",
          "Reserva expirada automáticamente"
        );

        return {
          reservationId,
          status: "success",
        };
      } catch (error) {
        console.error(`Error al procesar reserva ID ${row.id}:`, error);
        return {
          reservationId: row.id,
          status: "error",
          message: error.message,
        };
      }
    });

    const results = await Promise.all(processPromises);

    await invalidateCachePattern("functions:*");
    await invalidateCachePattern("reservations:*");

    const successCount = results.filter((r) => r.status === "success").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    console.log(
      `Procesamiento finalizado. Éxitos: ${successCount}, Errores: ${errorCount}`
    );

    return {
      processedCount: results.length,
      successCount,
      errorCount,
      details: results,
      status: "completed",
    };
  } catch (error) {
    console.error("Error en el procesamiento de reservas expiradas:", error);
    throw error;
  }
};

module.exports = {
  processMessage,
  processCreateReservation,
  processConfirmReservation,
  processCancelReservation,
  processExpireReservation,
  processExpiredReservations,
};