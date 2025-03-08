const {
  redis,
  closeConnection: closeRedisConnection,
} = require("../config/redis");
const { pool } = require("../config/db");
const {
  processExpiredReservations,
  processMessage,
} = require("../processors/reservationProcessor");

// Variable para controlar si ya se han cerrado las conexiones
let connectionsClosing = false;

exports.handler = async (event, context) => {
  // Evitar que Lambda espere a que se cierren las conexiones de eventos
  context.callbackWaitsForEmptyEventLoop = false;

  console.log("Evento recibido:", JSON.stringify(event));

  try {
    // Procesamiento de evento programado de CloudWatch
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

    // Procesamiento de mensajes SQS
    const results = [];

    if (event.Records && event.Records.length > 0) {
      console.log(`Recibidos ${event.Records.length} mensajes de SQS`);

      for (const record of event.Records) {
        console.log(`Procesando mensaje con ID: ${record.messageId}`);

        try {
          // Procesar el mensaje (ahora con tolerancia a diferentes formatos)
          const result = await processMessage(record);
          results.push({
            messageId: record.messageId,
            result,
          });

          if (result.success) {
            console.log(`Mensaje ${record.messageId} procesado con éxito`);

            const sqsService = require("../services/sqsService");
            await sqsService.deleteMessage(record.receiptHandle);
            console.log(`Mensaje ${record.messageId} eliminado de la cola SQS`);
          } else {
            console.error(
              `Error al procesar mensaje ${record.messageId}:`,
              result.message
            );
          }

          if (!result.success) {
            console.error(
              `Error al procesar mensaje ${record.messageId}:`,
              result.message
            );

            // Obtener el número de intentos de este mensaje
            const receiveCount = parseInt(
              record.attributes.ApproximateReceiveCount,
              10
            );
            console.log(
              `Intento #${receiveCount} para mensaje ${record.messageId}`
            );

            // Después de 3 intentos, debemos eliminarlo manualmente para evitar bloqueos
            if (receiveCount >= 3) {
              console.log(
                `Eliminando mensaje fallido ${record.messageId} después de ${receiveCount} intentos`
              );
              const sqsService = require("../services/sqsService");
              await sqsService.deleteMessage(record.receiptHandle);
              console.log(
                `Mensaje fallido ${record.messageId} eliminado de la cola SQS`
              );
            }
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
