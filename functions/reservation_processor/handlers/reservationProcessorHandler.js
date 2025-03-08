
const { closeConnection: closeRedisConnection } = require("../config/redis");
const { pool } = require("../config/db");
const sqsService = require("../services/sqsService");
const { processExpiredReservations, processMessage } = require("../processors/reservationProcessor");

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  console.log("Evento recibido:", JSON.stringify(event));

  try {
    if (event.source === "aws.events") {
      console.log("Procesando evento programado de CloudWatch");

      const result = await processExpiredReservations();

      return {
        statusCode: 200,
        body: JSON.stringify({
          message: "Procesamiento programado completado con éxito",
          data: result,
        }),
      };
    }

    const results = [];
    console.log("event.Records", event.Records);
    for (const record of event.Records || []) {
      record = JSON.parse(record);
      console.log(`Procesando mensaje con ID: ${record.messageId}`);

      try {
        const result = await processMessage(record);
        results.push({
          messageId: record.messageId,
          result,
        });

        if (result.success) {
          console.log(`Mensaje ${record.messageId} procesado con éxito`);
        } else {
          console.error(
            `Error al procesar mensaje ${record.messageId}:`,
            result.message
          );
        }
      } catch (error) {
        console.error(`Error al procesar mensaje ${record.messageId}:`, error);
        results.push({
          messageId: record.messageId,
          error: error.message,
        });

      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Procesamiento completado",
        results,
      }),
    };
  } catch (error) {
    console.error("Error en el handler de procesamiento:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error en el procesamiento",
        error: error.message,
      }),
    };
  } finally {
    try {
      // Cerrar conexiones
      await closeRedisConnection();
      await pool.end();
    } catch (err) {
      console.error("Error al cerrar conexiones:", err);
    }
  }
};
