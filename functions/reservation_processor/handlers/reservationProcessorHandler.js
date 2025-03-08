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
        console.log(`INICIO: Procesando mensaje ID: ${record.messageId}, GroupId: ${record.attributes.MessageGroupId || 'N/A'}, ApproximateReceiveCount: ${record.attributes.ApproximateReceiveCount || '1'}`);
        
        try {
          // Obtener el cliente SQS al inicio
          const sqsService = require("../services/sqsService");
          
          // Procesar el mensaje
          const result = await processMessage(record);
          
          results.push({
            messageId: record.messageId,
            result,
          });

          console.log(`FIN: Mensaje ${record.messageId} procesado. Resultado: ${result.success ? 'SUCCESS' : 'FAILURE'}`);
          
          // IMPORTANTE: Siempre eliminar el mensaje SQS, incluso en caso de fallo
          try {
            await sqsService.deleteMessage(record.receiptHandle);
            console.log(`Mensaje ${record.messageId} eliminado de la cola SQS`);
          } catch (deleteError) {
            console.error(`ERROR crítico al eliminar mensaje ${record.messageId}:`, deleteError);
          }
          
          // Si falló y necesitamos reintentar, enviamos un nuevo mensaje
          if (!result.success) {
            const receiveCount = parseInt(record.attributes.ApproximateReceiveCount || '1', 10);
            
            // Si no hemos excedido el máximo de reintentos, creamos un nuevo mensaje
            if (receiveCount < 3) {
              // Extraer el contenido original y crear un nuevo mensaje para reintento
              let messageBody;
              try {
                messageBody = typeof record.body === 'string' ? JSON.parse(record.body) : record.body;
              } catch (parseError) {
                console.error(`Error al parsear body del mensaje para reintento:`, parseError);
                messageBody = { 
                  type: 'RETRY_MESSAGE',
                  data: record.body,
                  originalMessageId: record.messageId
                };
              }
              
              // Añadir información de reintento
              messageBody.retryCount = receiveCount;
              messageBody.retryTimestamp = new Date().toISOString();
              messageBody.originalMessageId = record.messageId;
              
              // Generar un ID de deduplicación único para el reintento
              const retryDeduplicationId = `retry-${record.messageId}-${Date.now()}`;
              
              // Enviar como un nuevo mensaje a la cola
              await sqsService.sendMessage(
                messageBody,
                messageBody.type || 'RETRY_MESSAGE',
                retryDeduplicationId
              );
              
              console.log(`Reintento #${receiveCount} creado para mensaje ${record.messageId}`);
            } else {
              console.log(`Mensaje ${record.messageId} abandonado después de ${receiveCount} intentos`);
              // Aquí podrías implementar un registro en base de datos o alguna alerta
            }
          }
        } catch (error) {
          console.error(`Error grave al procesar mensaje ${record.messageId}:`, error);
          
          results.push({
            messageId: record.messageId,
            error: error.message,
            stack: error.stack,
          });
          
          // CRÍTICO: Siempre eliminar el mensaje para evitar bloqueos
          try {
            const sqsService = require("../services/sqsService");
            await sqsService.deleteMessage(record.receiptHandle);
            console.log(`Mensaje ${record.messageId} eliminado de la cola SQS después de error fatal`);
          } catch (deleteError) {
            console.error(`ERROR CRÍTICO: No se pudo eliminar mensaje ${record.messageId}:`, deleteError);
          }
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