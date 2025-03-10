const {
  redis,
  closeConnection: closeRedisConnection,
} = require("../config/redis");
const { pool } = require("../config/db");
const {
  processExpiredReservations,
  processMessage,
} = require("../processors/reservationProcessor");

let connectionsClosing = false;

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

    if (event.Records && event.Records.length > 0) {
      console.log(`Recibidos ${event.Records.length} mensajes de SQS`);

      for (const record of event.Records) {
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
          console.error(
            `Error al procesar mensaje ${record.messageId}:`,
            error
          );
          results.push({
            messageId: record.messageId,
            error: error.message,
            stack: error.stack,
          });
        }
      }
    } else {
      console.warn("No hay mensajes para procesar en el evento");
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
        stack: error.stack,
      }),
    };
  } finally {
    try {
      // Evitar cerrar conexiones múltiples veces
      if (!connectionsClosing) {
        connectionsClosing = true;
        console.log("Cerrando conexiones...");

        try {
          // Cerrar conexión Redis
          if (redis && typeof closeRedisConnection === "function") {
            await closeRedisConnection();
            console.log("Conexión Redis cerrada correctamente");
          }
        } catch (redisError) {
          console.error("Error al cerrar conexión Redis:", redisError);
        }

        try {
          // Cerrar pool de DB solo si no se ha cerrado ya
          if (pool && typeof pool.end === "function" && !pool.ended) {
            // Marcar el pool como cerrado antes de cerrarlo para evitar llamadas múltiples
            pool.ended = true;
            await pool.end();
            console.log("Pool de base de datos cerrado correctamente");
          }
        } catch (dbError) {
          console.error("Error al cerrar pool de base de datos:", dbError);
        }
      }
    } catch (err) {
      console.error("Error general al cerrar conexiones:", err);
    }
  }
};
