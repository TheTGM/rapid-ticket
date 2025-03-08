const { StatusCodes } = require("http-status-codes");
const reservationModel = require("../models/reservationModel");
const { cacheAside } = require("../services/cacheService");
const { v4: uuidv4 } = require("uuid");
const sqsService = require("../services/sqsService");
const { query, pool } = require("../config/db");
const e = require("express");

const createReservation = async (req, res, next) => {
  try {
    console.log("Iniciando proceso de reserva, body:", JSON.stringify(req.body));
    
    // Obtener datos de la solicitud
    const { 
      customerName, 
      customerDni, 
      contactEmail, 
      functionId, 
      seatIds 
    } = req.body;
    
    // Obtener el ID de usuario si está autenticado
    const userId = req.user?.id || null;
    
    // Validaciones básicas
    if (!customerName || !customerDni || !contactEmail || !functionId || !Array.isArray(seatIds) || seatIds.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Faltan datos obligatorios para la reserva",
        requiredFields: ["customerName", "customerDni", "contactEmail", "functionId", "seatIds"]
      });
    }
    
    // Verificación preliminar de disponibilidad
    try {
      console.log(`Realizando verificación preliminar para función ${functionId}, asientos: ${seatIds.join(',')}`);
      const preliminaryCheck = await reservationModel.checkSeatsAvailabilityPreliminary(
        functionId, 
        seatIds
      );
      
      if (!preliminaryCheck.available) {
        console.log("Verificación preliminar: asientos no disponibles", preliminaryCheck.unavailableSeats);
        return res.status(StatusCodes.CONFLICT).json({
          message: "Algunos asientos parecen no estar disponibles",
          data: {
            unavailableSeats: preliminaryCheck.unavailableSeats
          }
        });
      }
      
      console.log("Verificación preliminar exitosa: todos los asientos disponibles");
    } catch (error) {
      console.error("Error en verificación preliminar:", error);
      // Continuamos aunque falle la verificación preliminar
    }
    
    // Generar un ID único para la reserva temporal
    const temporaryReservationId = `temp-${uuidv4()}`;
    console.log("ID temporal generado:", temporaryReservationId);
    
    // Datos de la reserva
    const reservationData = {
      temporaryReservationId,
      userId,
      customerName,
      customerDni,
      contactEmail,
      functionId,
      seatIds,
      timestamp: new Date().toISOString()
    };
    
    // Este es el formato correcto que espera el procesador
    const messageObject = {
      type: 'CREATE_RESERVATION',
      data: reservationData,
      timestamp: new Date().toISOString()
    };
    
    console.log("Enviando mensaje a SQS:", JSON.stringify(messageObject, null, 2));
    
    // Registrar en BD que estamos procesando esta reserva (opcional)
    try {
      await reservationModel.updateProcessingStatus(temporaryReservationId, 'processing');
    } catch (dbError) {
      console.warn("No se pudo registrar estado de procesamiento:", dbError.message);
    }
    
    // Enviar a la cola SQS
    try {
      const sqsResult = await sqsService.sendMessage(
        messageObject, // Este objeto será convertido a JSON string en sendMessage
        'CREATE_RESERVATION',
        `reservation-${temporaryReservationId}`
      );
      
      console.log("Mensaje enviado a SQS con éxito, MessageId:", sqsResult.MessageId);
    } catch (sqsError) {
      console.error("Error al enviar mensaje a SQS:", sqsError);
      
      // Si falla el envío a SQS, devolver error
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: "Error al procesar la solicitud de reserva",
        error: sqsError.message
      });
    }
    
    // Generar ticket de reserva con código único temporal
    const ticketCode = generateTicketCode(temporaryReservationId);
    
    console.log(`Reserva ${temporaryReservationId} enviada para procesamiento, ticket: ${ticketCode}`);
    
    return res.status(StatusCodes.ACCEPTED).json({
      message: "Solicitud de reserva enviada para procesamiento",
      data: {
        temporaryReservationId,
        ticket: {
          code: ticketCode,
          status: 'processing',
          expiresIn: "10 minutos (después de confirmación)"
        }
      }
    });
  } catch (error) {
    console.error("Error al crear solicitud de reserva:", error);
    next(error);
  }
};

const checkReservationStatus = async (req, res, next) => {
  try {
    const { temporaryId } = req.params;

    if (!temporaryId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Se requiere ID temporal de reserva",
      });
    }

    const reservation = await reservationModel.findReservationByTemporaryId(
      temporaryId
    );

    if (!reservation) {
      const isProcessing = await reservationModel.isReservationInProcessing(
        temporaryId
      );

      if (isProcessing) {
        return res.status(StatusCodes.ACCEPTED).json({
          message: "La reserva aún está siendo procesada",
          status: "processing",
        });
      }

      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Reserva no encontrada o expirada",
        status: "not_found",
      });
    }

    return res.status(StatusCodes.OK).json({
      message: "Estado de reserva recuperado",
      data: {
        reservationId: reservation.id,
        status: reservation.status,
        createdAt: reservation.createdAt,
      },
    });
  } catch (error) {
    console.error("Error al verificar estado de reserva:", error);
    next(error);
  }
};

const getReservation = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "ID de reserva inválido",
      });
    }

    const cacheKey = `reservations:id=${id}`;

    const cacheTTL = 60; // 1 minuto

    const reservation = await cacheAside(
      cacheKey,
      () => reservationModel.getReservationById(parseInt(id, 10)),
      cacheTTL
    );

    if (!reservation) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Reserva no encontrada",
      });
    }

    const isAdmin = req.user?.role === "admin";
    const isOwner = req.user?.id === reservation.userid;

    if (!isAdmin && !isOwner) {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "No tiene permiso para ver esta reserva",
      });
    }

    let timeLimit = null;
    if (reservation.status === "pending") {
      timeLimit = await reservationModel.checkReservationTimeLimit(
        reservation.id
      );
    }

    return res.status(StatusCodes.OK).json({
      message: "Reserva obtenida con éxito",
      data: {
        reservation,
        timeLimit,
      },
    });
  } catch (error) {
    console.error("Error al obtener reserva:", error);
    next(error);
  }
};

const confirmReservation = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "ID de reserva inválido",
      });
    }

    const originalReservation = await reservationModel.getReservationById(
      parseInt(id, 10)
    );

    if (!originalReservation) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Reserva no encontrada",
      });
    }

    if (originalReservation.status !== "pending") {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: `No se puede confirmar una reserva en estado ${originalReservation.status}`,
        currentStatus: originalReservation.status,
      });
    }

    const timeLimit = await reservationModel.checkReservationTimeLimit(
      originalReservation.id
    );
    if (timeLimit?.isExpired) {
      await sqsService.sendMessage(
        {
          reservationId: originalReservation.id,
          reason: "Tiempo de reserva expirado",
        },
        "EXPIRE_RESERVATION"
      );

      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "La reserva ha expirado y no puede ser confirmada",
        timeLimit,
      });
    }
    await sqsService.sendMessage(
      { reservationId: originalReservation.id },
      "CONFIRM_RESERVATION"
    );

    return res.status(StatusCodes.ACCEPTED).json({
      message: "Solicitud de confirmación enviada",
      data: {
        reservationId: originalReservation.id,
        status: "confirming",
      },
    });
  } catch (error) {
    console.error("Error al confirmar reserva:", error);
    next(error);
  }
};

const cancelReservation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "ID de reserva inválido",
      });
    }

    const originalReservation = await reservationModel.getReservationById(
      parseInt(id, 10)
    );

    if (!originalReservation) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Reserva no encontrada",
      });
    }

    if (
      originalReservation.status !== "pending" &&
      originalReservation.status !== "confirmed"
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: `No se puede cancelar una reserva en estado ${originalReservation.status}`,
        currentStatus: originalReservation.status,
      });
    }

    await sqsService.sendMessage(
      {
        reservationId: originalReservation.id,
        reason: reason || "Cancelada por el cliente",
      },
      "CANCEL_RESERVATION"
    );

    return res.status(StatusCodes.ACCEPTED).json({
      message: "Solicitud de cancelación enviada",
      data: {
        reservationId: originalReservation.id,
        status: "canceling",
      },
    });
  } catch (error) {
    console.error("Error al cancelar reserva:", error);
    next(error);
  }
};

const checkReservationTime = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "ID de reserva inválido",
      });
    }

    const timeLimit = await reservationModel.checkReservationTimeLimit(
      parseInt(id, 10)
    );

    if (!timeLimit) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Reserva no encontrada o no está pendiente",
      });
    }

    if (timeLimit.isExpired) {
      await sqsService.sendMessage(
        {
          reservationId: parseInt(id, 10),
          reason: "Tiempo de reserva expirado",
        },
        "EXPIRE_RESERVATION"
      );
    }

    return res.status(StatusCodes.OK).json({
      message: "Información de tiempo obtenida con éxito",
      data: timeLimit,
    });
  } catch (error) {
    console.error("Error al verificar tiempo de reserva:", error);
    next(error);
  }
};

const generateTicketCode = (reservationId) => {
  const timestamp = new Date().getTime().toString(36).toUpperCase();
  const random = uuidv4().substring(0, 8).toUpperCase();
  const id = String(reservationId).padStart(6, "0");

  return `TKT-${timestamp}-${random}-${id}`;
};

module.exports = {
  createReservation,
  getReservation,
  confirmReservation,
  cancelReservation,
  checkReservationTime,
  checkReservationStatus,
};
