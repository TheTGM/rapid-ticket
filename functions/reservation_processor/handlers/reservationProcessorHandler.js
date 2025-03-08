const { closeConnection: closeRedisConnection } = require("../config/redis");
const { pool } = require("../config/db");
const { processExpiredReservations, processMessage } = require("../processors/reservationProcessor");

exports.handler = async (event, context) => {
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
        console.log("Contenido del registro:", JSON.stringify(record, null, 2));
        
        try {
          // Verificar que el mensaje tenga un cuerpo válido
          if (!record.body && !record.Body) {
            console.error("El mensaje no tiene cuerpo:", record);
            results.push({
              messageId: record.messageId,
              result: {
                success: false,
                message: "Mensaje sin cuerpo"
              }
            });
            continue;
          }
          
          // SQS puede enviar la propiedad como 'body' o 'Body' dependiendo de la configuración
          const messageToProcess = {
            messageId: record.messageId,
            Body: record.body || record.Body
          };
          
          console.log("Procesando mensaje:", JSON.stringify(messageToProcess, null, 2));
          
          const result = await processMessage(messageToProcess);
          results.push({
            messageId: record.messageId,
            result
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
            stack: error.stack
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
        stack: error.stack
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