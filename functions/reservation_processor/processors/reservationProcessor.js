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
  console.log(
    "Procesando confirmación de reserva:",
    JSON.stringify(messageData, null, 2)
  );

  try {
    // Extraer el ID de reserva (puede estar en diferentes formatos de mensaje)
    let reservationId;

    if (typeof messageData === "object") {
      // Caso 1: Formato estándar con propiedad data
      if (messageData.data && messageData.data.reservationId) {
        reservationId = messageData.data.reservationId;
      }
      // Caso 2: Formato directo con reservationId en el objeto principal
      else if (messageData.reservationId) {
        reservationId = messageData.reservationId;
      }
      // Caso 3: Si es un número directamente
      else if (typeof messageData === "number") {
        reservationId = messageData;
      }
      // Caso 4: Si no hay reservationId en una estructura conocida
      else {
        throw new Error(
          "No se encontró reservationId en el mensaje: " +
            JSON.stringify(messageData)
        );
      }
    } else if (
      typeof messageData === "string" &&
      !isNaN(parseInt(messageData, 10))
    ) {
      // Caso 5: Si es un string numérico
      reservationId = parseInt(messageData, 10);
    } else {
      throw new Error("Formato de datos no compatible: " + typeof messageData);
    }

    console.log(`ID de reserva extraído: ${reservationId}`);

    // Actualizar el estado de la reserva
    const updatedReservation = await reservationModel.updateReservationStatus(
      reservationId,
      "confirmed",
      "Confirmada por el cliente"
    );

    // Invalidar caché
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
      reservationId: messageData.reservationId || "desconocido",
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
    console.log("Procesando mensaje:", JSON.stringify(message, null, 2));

    // Verificar que el mensaje sea válido
    if (!message) {
      console.error("Mensaje inválido (undefined)");
      return {
        success: false,
        message: "Mensaje inválido (undefined)",
      };
    }

    // Verificar si hay cuerpo del mensaje o si el mensaje ya es el contenido
    let messageBody;

    // Caso 1: El mensaje tiene una propiedad Body o body
    if (message.Body || message.body) {
      const rawBody = message.Body || message.body;
      console.log("Mensaje tiene propiedad Body. Tipo:", typeof rawBody);

      // Convertir a objeto si es string
      if (typeof rawBody === "string") {
        try {
          messageBody = JSON.parse(rawBody);
        } catch (parseError) {
          console.error("Error al parsear el cuerpo del mensaje:", parseError);
          // Si no se puede parsear, tratarlo como mensaje directo
          messageBody = { type: "DIRECT", data: { rawMessage: rawBody } };
        }
      } else if (typeof rawBody === "object") {
        messageBody = rawBody;
      } else {
        return {
          success: false,
          message: `Formato de cuerpo de mensaje no soportado: ${typeof rawBody}`,
        };
      }
    }
    // Caso 2: El mensaje mismo es el contenido
    else {
      console.log(
        "Mensaje no tiene propiedad Body. Asumiendo que el mensaje es el contenido"
      );
      messageBody = message;
    }

    console.log(
      "Contenido del mensaje procesado:",
      JSON.stringify(messageBody, null, 2)
    );

    // MANEJAR MENSAJES SIN ESTRUCTURA ESTÁNDAR
    // Si el mensaje no tiene la estructura esperada pero tiene un reservationId,
    // inferimos que es un mensaje de confirmación
    if (!messageBody.type && messageBody.reservationId) {
      console.log(
        "Mensaje sin tipo pero con reservationId. Asumiendo CONFIRM_RESERVATION"
      );

      // Tratar como mensaje de confirmación
      return await processConfirmReservation(messageBody);
    }

    // Si aún no hay un tipo definido, verificar otras propiedades para inferir el tipo
    if (!messageBody.type) {
      if (messageBody.temporaryReservationId) {
        console.log(
          "Mensaje sin tipo pero con temporaryReservationId. Asumiendo CREATE_RESERVATION"
        );
        return await processCreateReservation(messageBody);
      } else if (messageBody.reason && messageBody.reservationId) {
        if (messageBody.reason.includes("expirado")) {
          console.log(
            "Mensaje sin tipo pero con razón de expiración. Asumiendo EXPIRE_RESERVATION"
          );
          return await processExpireReservation(messageBody);
        } else {
          console.log(
            "Mensaje sin tipo pero con razón de cancelación. Asumiendo CANCEL_RESERVATION"
          );
          return await processCancelReservation(messageBody);
        }
      } else {
        console.error("No se pudo determinar el tipo de mensaje:", messageBody);
        return {
          success: false,
          message:
            "Formato de mensaje desconocido: no se pudo determinar el tipo",
        };
      }
    }

    // PROCESAMIENTO ESTÁNDAR PARA MENSAJES CON ESTRUCTURA CORRECTA
    const { type, data } = messageBody;
    console.log(`Procesando mensaje tipo: ${type}`);

    // Para mensajes con estructura estándar, verificar que los datos estén presentes
    if (type && !data) {
      // Si hay tipo pero no hay datos, usar el cuerpo completo como datos
      console.log(
        "Mensaje tiene tipo pero no datos. Usando el cuerpo completo como datos"
      );

      // Extraer todo excepto 'type' como datos
      const { type: _, ...extractedData } = messageBody;

      switch (type) {
        case "CREATE_RESERVATION":
          return await processCreateReservation(extractedData);

        case "CONFIRM_RESERVATION":
          return await processConfirmReservation(extractedData);

        case "CANCEL_RESERVATION":
          return await processCancelReservation(extractedData);

        case "EXPIRE_RESERVATION":
          return await processExpireReservation(extractedData);

        default:
          console.warn(`Tipo de mensaje desconocido: ${type}`);
          return {
            success: false,
            message: `Tipo de mensaje desconocido: ${type}`,
          };
      }
    } else if (type && data) {
      // Procesar según el tipo de mensaje (estructura estándar)
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
    } else {
      console.error("Formato de mensaje inválido:", messageBody);
      return {
        success: false,
        message: "Formato de mensaje inválido: estructura no reconocida",
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
