const { StatusCodes } = require("http-status-codes");
const reservationModel = require("../models/reservationModel");
const { cacheAside } = require("../services/cacheService");
const { v4: uuidv4 } = require("uuid");
const sqsService = require("../services/sqsService");
const { query } = require("../config/db");

const createReservation = async (req, res, next) => {
  try {
    const { customerName, customerDni, contactEmail, functionId, seatIds } =
      req.body;

    const userId = req.user?.id || null;

    if (
      !customerName ||
      !customerDni ||
      !contactEmail ||
      !functionId ||
      !Array.isArray(seatIds) ||
      seatIds.length === 0
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Faltan datos obligatorios para la reserva",
        requiredFields: [
          "customerName",
          "customerDni",
          "contactEmail",
          "functionId",
          "seatIds",
        ],
      });
    }

    try {
      const preliminaryCheck =
        await reservationModel.checkSeatsAvailabilityPreliminary(
          functionId,
          seatIds
        );

      if (!preliminaryCheck.available) {
        return res.status(StatusCodes.CONFLICT).json({
          message: "Algunos asientos parecen no estar disponibles",
          data: {
            unavailableSeats: preliminaryCheck.unavailableSeats,
          },
        });
      }
    } catch (error) {
      console.error("Error en verificación preliminar:", error);
    }

    const temporaryReservationId = `temp-${uuidv4()}`;

    const reservationMessage = {
      temporaryReservationId,
      userId,
      customerName,
      customerDni,
      contactEmail,
      functionId,
      seatIds,
      timestamp: new Date().toISOString(),
    };

    await sqsService.sendMessage(
      reservationMessage,
      "CREATE_RESERVATION",
      `reservation-${temporaryReservationId}`
    );

    const ticketCode = generateTicketCode(temporaryReservationId);

    return res.status(StatusCodes.ACCEPTED).json({
      message: "Solicitud de reserva enviada para procesamiento",
      data: {
        temporaryReservationId,
        ticket: {
          code: ticketCode,
          status: "processing",
          expiresIn: "10 minutos (después de confirmación)",
        },
      },
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

const getUserReservations = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Usuario no autenticado",
      });
    }

    const cacheKey = `reservations:user=${userId}`;

    const cacheTTL = 300; // 5 minutos

    const reservations = await cacheAside(
      cacheKey,
      () => reservationModel.getReservationsByUserId(userId),
      cacheTTL
    );

    return res.status(StatusCodes.OK).json({
      message: "Reservas obtenidas con éxito",
      data: reservations,
    });
  } catch (error) {
    console.error("Error al obtener reservas del usuario:", error);
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

const createReservationTest = async (req, res, next) => {
  try {
    const respose = await query(
      `ALTER TABLE Reservations ADD COLUMN temporaryId VARCHAR(100);

-- Crear un índice para búsquedas eficientes por temporaryId
CREATE INDEX idx_reservations_temporary_id ON Reservations(temporaryId);`,
      [req.user.id]
    );
    const user = respose.rows[0];

    return res.status(StatusCodes.CREATED).json({
      message: "Reserva creada con éxito",
      data: {
        user,
      },
    });
  } catch (error) {
    console.error("Error al crear reserva:", error);
    next(error);
  }
};

module.exports = {
  createReservation,
  getReservation,
  confirmReservation,
  cancelReservation,
  getUserReservations,
  checkReservationTime,
  checkReservationStatus,
  createReservationTest,
};
