const AWS = require('aws-sdk');

// Configurar AWS SDK
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

// Crear cliente SQS
const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

/**
 * Envía un mensaje a la cola SQS para procesamiento
 * @param {Object} messageBody - Cuerpo del mensaje a enviar
 * @param {string} messageType - Tipo de mensaje (ej: 'CREATE_RESERVATION')
 * @param {string} [deduplicationId] - ID para deduplicación (opcional, se genera uno si no se proporciona)
 * @returns {Promise<Object>} Respuesta de SQS
 */
const sendMessage = async (messageBody, messageType, deduplicationId = null) => {
  try {
    // Obtener URL de la cola de las variables de entorno
    const queueUrl = process.env.QUEUE_URL;
    
    if (!queueUrl) {
      throw new Error('URL de la cola SQS no configurada en variable de entorno QUEUE_URL');
    }
    
    console.log("[SQS] Enviando mensaje a:", queueUrl);
    console.log("[SQS] Tipo de mensaje:", messageType);
    
    // Asegurarse de que messageBody sea convertido a string JSON
    const messageBodyStr = typeof messageBody === 'string' 
      ? messageBody 
      : JSON.stringify(messageBody);
    
    console.log("[SQS] Cuerpo del mensaje (primeros 200 caracteres):", 
      messageBodyStr.substring(0, 200) + (messageBodyStr.length > 200 ? '...' : ''));
    
    // Preparar el mensaje
    const params = {
      MessageBody: messageBodyStr,
      QueueUrl: queueUrl,
    };
    
    console.log("[SQS] Parámetros de envío:", JSON.stringify({
      QueueUrl: queueUrl,
    }));
    
    // Enviar el mensaje
    const result = await sqs.sendMessage(params).promise();
    
    console.log(`[SQS] Mensaje enviado con éxito. MessageId: ${result.MessageId}`);
    return result;
  } catch (error) {
    console.error('[SQS] Error al enviar mensaje:', error);
    throw error;
  }
};

/**
 * Recibe y procesa mensajes de la cola SQS 
 * (esta función es útil para tests o procesamiento manual)
 * @param {number} maxMessages - Número máximo de mensajes a recibir
 * @returns {Promise<Array>} Mensajes recibidos
 */
const receiveMessages = async (maxMessages = 10) => {
  try {
    // Obtener URL de la cola de las variables de entorno
    const queueUrl = process.env.QUEUE_URL;
    
    if (!queueUrl) {
      throw new Error('URL de la cola SQS no configurada');
    }
    
    // Parámetros para recibir mensajes
    const params = {
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxMessages,
      VisibilityTimeout: 30,
      WaitTimeSeconds: 0
    };
    
    // Recibir mensajes
    const result = await sqs.receiveMessage(params).promise();
    
    if (!result.Messages || result.Messages.length === 0) {
      console.log('[SQS] No hay mensajes en la cola');
      return [];
    }
    
    console.log(`[SQS] Recibidos ${result.Messages.length} mensajes`);
    return result.Messages;
  } catch (error) {
    console.error('[SQS] Error al recibir mensajes:', error);
    throw error;
  }
};

/**
 * Elimina un mensaje de la cola después de procesarlo
 * @param {string} receiptHandle - Receipt handle del mensaje
 * @returns {Promise<Object>} Respuesta de SQS
 */
const deleteMessage = async (receiptHandle) => {
  try {
    // Obtener URL de la cola de las variables de entorno
    const queueUrl = process.env.QUEUE_URL;
    
    if (!queueUrl) {
      throw new Error('URL de la cola SQS no configurada');
    }
    
    // Parámetros para eliminar el mensaje
    const params = {
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle
    };
    
    // Eliminar el mensaje
    const result = await sqs.deleteMessage(params).promise();
    console.log('[SQS] Mensaje eliminado de la cola');
    
    return result;
  } catch (error) {
    console.error('[SQS] Error al eliminar mensaje:', error);
    throw error;
  }
};

module.exports = {
  sendMessage,
  receiveMessages,
  deleteMessage
};