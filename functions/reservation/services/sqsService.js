const AWS = require('aws-sdk');

AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1'
});

const sqs = new AWS.SQS({ apiVersion: '2012-11-05' });

const sendMessage = async (messageBody, messageType, deduplicationId = null) => {
  try {
    const queueUrl = process.env.QUEUE_URL;
    
    if (!queueUrl) {
      throw new Error('URL de la cola SQS no configurada');
    }
    
    const groupId = `group-${messageType}`;
    
    const dedupId = deduplicationId || 
      `${Date.now()}-${Buffer.from(JSON.stringify(messageBody)).toString('base64').substring(0, 8)}`;
    
    const params = {
      MessageBody: JSON.stringify({
        type: messageType,
        data: messageBody,
        timestamp: new Date().toISOString()
      }),
      QueueUrl: queueUrl,
      MessageGroupId: groupId,           // Requerido para colas FIFO
      MessageDeduplicationId: dedupId    // Requerido para colas FIFO sin ContentBasedDeduplication
    };
    
    console.log(`Enviando mensaje a SQS: ${messageType}`);
    const result = await sqs.sendMessage(params).promise();
    
    console.log(`Mensaje enviado a SQS con éxito. MessageId: ${result.MessageId}`);
    return result;
  } catch (error) {
    console.error('Error al enviar mensaje a SQS:', error);
    throw error;
  }
};

const receiveMessages = async (maxMessages = 10) => {
  try {
    const queueUrl = process.env.QUEUE_URL;
    
    if (!queueUrl) {
      throw new Error('URL de la cola SQS no configurada');
    }
    
    const params = {
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxMessages,
      VisibilityTimeout: 30,
      WaitTimeSeconds: 0
    };
    
    const result = await sqs.receiveMessage(params).promise();
    
    if (!result.Messages || result.Messages.length === 0) {
      console.log('No hay mensajes en la cola');
      return [];
    }
    
    console.log(`Recibidos ${result.Messages.length} mensajes`);
    return result.Messages;
  } catch (error) {
    console.error('Error al recibir mensajes de SQS:', error);
    throw error;
  }
};

const deleteMessage = async (receiptHandle) => {
  try {
    const queueUrl = process.env.QUEUE_URL;
    
    if (!queueUrl) {
      throw new Error('URL de la cola SQS no configurada');
    }
    
    const params = {
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle
    };
    
    const result = await sqs.deleteMessage(params).promise();
    console.log('Mensaje eliminado de la cola');
    
    return result;
  } catch (error) {
    console.error('Error al eliminar mensaje de SQS:', error);
    throw error;
  }
};

module.exports = {
  sendMessage,
  receiveMessages,
  deleteMessage
};