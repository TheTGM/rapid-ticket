const { v4: uuidv4 } = require('uuid');
const { StatusCodes } = require('http-status-codes');
const reservationModel = require('../models/reservationModel');
const { query, pool } = require('../config/db');
const { clearCache } = require('../services/cacheService');

/**
 * Procesador de mensajes SQS para reservas
 * @param {Object} event - Evento de Lambda con mensajes SQS
 * @returns {Object} - Resultado del procesamiento
 */
exports.handler = async (event) => {
  console.log('Evento recibido:', JSON.stringify(event));
  
  // Resultados del procesamiento
  const results = {
    batchItemFailures: [],
    processingResults: []
  };
  
  // Procesar cada mensaje en el batch
  for (const record of event.Records) {
    try {
      console.log(`Procesando mensaje: ${record.messageId}`);
      
      // Parsear el cuerpo del mensaje
      const messageBody = JSON.parse(record.body);
      const messageType = messageBody.MessageAttributes?.messageType?.StringValue || messageBody.type;
      const messageData = typeof messageBody.Message === 'string' ? JSON.parse(messageBody.Message) : messageBody.data;
      
      console.log(`Tipo de mensaje: ${messageType}`);
      console.log(`Datos del mensaje:`, JSON.stringify(messageData));
      
      let processingResult;
      
      // Ejecutar la función correspondiente según el tipo de mensaje
      switch (messageType) {
        case 'CREATE_RESERVATION':
          processingResult = await processCreateReservation(messageData);
          break;
        case 'CONFIRM_RESERVATION':
          processingResult = await processConfirmReservation(messageData);
          break;
        case 'CANCEL_RESERVATION':
          processingResult = await processCancelReservation(messageData);
          break;
        case 'EXPIRE_RESERVATION':
          processingResult = await processExpireReservation(messageData);
          break;
        default:
          throw new Error(`Tipo de mensaje desconocido: ${messageType}`);
      }
      
      console.log(`Procesamiento exitoso para mensaje ${record.messageId}:`, JSON.stringify(processingResult));
      results.processingResults.push({
        messageId: record.messageId,
        success: true,
        result: processingResult
      });
      
    } catch (error) {
      console.error(`Error al procesar mensaje ${record.messageId}:`, error);
      
      // Agregar a la lista de fallos para que SQS vuelva a intentar
      results.batchItemFailures.push({
        itemIdentifier: record.messageId
      });
      
      results.processingResults.push({
        messageId: record.messageId,
        success: false,
        error: error.message
      });
    }
  }
  
  return results;
};

/**
 * Procesa la creación de una nueva reserva
 * @param {Object} data - Datos de la reserva
 * @returns {Object} - Resultado del procesamiento
 */
async function processCreateReservation(data) {
  console.log('Procesando creación de reserva:', JSON.stringify(data));
  
  const client = await pool.connect();
  
  try {
    // Iniciar transacción
    await client.query('BEGIN');
    
    const {
      temporaryReservationId,
      userId,
      customerName,
      customerDni,
      contactEmail,
      functionId,
      seatIds
    } = data;
    
    // Verificar disponibilidad de asientos
    const availabilityResult = await reservationModel.checkSeatsAvailability(
      functionId,
      seatIds,
      client
    );
    
    if (!availabilityResult.available) {
      throw new Error(`Asientos no disponibles: ${availabilityResult.unavailableSeats.join(', ')}`);
    }
    
    // Reservar asientos
    const reservationId = await reservationModel.createReservation(
      {
        userId,
        temporaryId: temporaryReservationId,
        customerName,
        customerDni,
        contactEmail,
        functionId,
        seatIds,
        status: 'pending'
      },
      client
    );
    
    // Eliminar marca de procesamiento
    await reservationModel.removeProcessingStatus(temporaryReservationId, client);
    
    // Establecer tiempo límite para confirmar la reserva (10 minutos)
    await reservationModel.setReservationTimeLimit(reservationId, 10, client);
    
    // Confirmar transacción
    await client.query('COMMIT');
    
    return {
      success: true,
      reservationId,
      temporaryReservationId,
      status: 'pending',
      timeLimit: '10 minutos'
    };
    
  } catch (error) {
    // Revertir transacción en caso de error
    await client.query('ROLLBACK');
    console.error('Error al procesar creación de reserva:', error);
    throw error;
  } finally {
    // Liberar cliente
    client.release();
  }
}

/**
 * Procesa la confirmación de una reserva
 * @param {Object} data - Datos de la confirmación
 * @returns {Object} - Resultado del procesamiento
 */
async function processConfirmReservation(data) {
  console.log('Procesando confirmación de reserva:', JSON.stringify(data));
  
  const { reservationId } = data;
  const client = await pool.connect();
  
  try {
    // Iniciar transacción
    await client.query('BEGIN');
    
    // Obtener información de la reserva
    const reservation = await reservationModel.getReservationById(reservationId, client);
    
    if (!reservation) {
      throw new Error(`Reserva ${reservationId} no encontrada`);
    }
    
    if (reservation.status !== 'pending') {
      throw new Error(`No se puede confirmar reserva en estado: ${reservation.status}`);
    }
    
    // Verificar si la reserva ha expirado
    const timeLimit = await reservationModel.checkReservationTimeLimit(reservationId, client);
    if (timeLimit?.isExpired) {
      throw new Error('La reserva ha expirado y no puede ser confirmada');
    }
    
    // Actualizar estado a confirmado
    await reservationModel.updateReservationStatus(reservationId, 'confirmed', client);
    
    // Confirmar transacción
    await client.query('COMMIT');
    
    // Limpiar caché
    await clearCache(`reservations:id=${reservationId}`);
    
    return {
      success: true,
      reservationId,
      status: 'confirmed'
    };
    
  } catch (error) {
    // Revertir transacción en caso de error
    await client.query('ROLLBACK');
    console.error('Error al procesar confirmación de reserva:', error);
    throw error;
  } finally {
    // Liberar cliente
    client.release();
  }
}

/**
 * Procesa la cancelación de una reserva
 * @param {Object} data - Datos de la cancelación
 * @returns {Object} - Resultado del procesamiento
 */
async function processCancelReservation(data) {
  console.log('Procesando cancelación de reserva:', JSON.stringify(data));
  
  const { reservationId, reason } = data;
  const client = await pool.connect();
  
  try {
    // Iniciar transacción
    await client.query('BEGIN');
    
    // Obtener información de la reserva
    const reservation = await reservationModel.getReservationById(reservationId, client);
    
    if (!reservation) {
      throw new Error(`Reserva ${reservationId} no encontrada`);
    }
    
    if (reservation.status !== 'pending' && reservation.status !== 'confirmed') {
      throw new Error(`No se puede cancelar reserva en estado: ${reservation.status}`);
    }
    
    // Actualizar estado a cancelado
    await reservationModel.updateReservationStatus(reservationId, 'cancelled', client);
    
    // Registrar razón de cancelación
    await reservationModel.updateReservationCancellationReason(reservationId, reason, client);
    
    // Liberar asientos
    await reservationModel.releaseReservedSeats(reservationId, client);
    
    // Confirmar transacción
    await client.query('COMMIT');
    
    // Limpiar caché
    await clearCache(`reservations:id=${reservationId}`);

    
    return {
      success: true,
      reservationId,
      status: 'cancelled',
      reason
    };
    
  } catch (error) {
    // Revertir transacción en caso de error
    await client.query('ROLLBACK');
    console.error('Error al procesar cancelación de reserva:', error);
    throw error;
  } finally {
    // Liberar cliente
    client.release();
  }
}

/**
 * Procesa la expiración de una reserva
 * @param {Object} data - Datos de la expiración
 * @returns {Object} - Resultado del procesamiento
 */
async function processExpireReservation(data) {
  console.log('Procesando expiración de reserva:', JSON.stringify(data));
  
  const { reservationId, reason } = data;
  const client = await pool.connect();
  
  try {
    // Iniciar transacción
    await client.query('BEGIN');
    
    // Obtener información de la reserva
    const reservation = await reservationModel.getReservationById(reservationId, client);
    
    if (!reservation) {
      throw new Error(`Reserva ${reservationId} no encontrada`);
    }
    
    if (reservation.status !== 'pending') {
      throw new Error(`No se puede expirar reserva en estado: ${reservation.status}`);
    }
    
    // Actualizar estado a expirado
    await reservationModel.updateReservationStatus(reservationId, 'expired', client);
    
    // Registrar razón de expiración
    await reservationModel.updateReservationCancellationReason(
      reservationId, 
      reason || 'Tiempo de reserva expirado', 
      client
    );
    
    // Liberar asientos
    await reservationModel.releaseReservedSeats(reservationId, client);
    
    // Confirmar transacción
    await client.query('COMMIT');
    
    // Limpiar caché
    await clearCache(`reservations:id=${reservationId}`);

    
    return {
      success: true,
      reservationId,
      status: 'expired'
    };
    
  } catch (error) {
    // Revertir transacción en caso de error
    await client.query('ROLLBACK');
    console.error('Error al procesar expiración de reserva:', error);
    throw error;
  } finally {
    // Liberar cliente
    client.release();
  }
}

/**
 * Genera un código de ticket único
 * @param {string|number} reservationId - ID de la reserva
 * @returns {string} - Código de ticket generado
 */
function generateTicketCode(reservationId) {
  const timestamp = new Date().getTime().toString(36).toUpperCase();
  const random = uuidv4().substring(0, 8).toUpperCase();
  const id = String(reservationId).padStart(6, "0");

  return `TKT-${timestamp}-${random}-${id}`;
}