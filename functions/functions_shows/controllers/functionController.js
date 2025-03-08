const { StatusCodes } = require("http-status-codes");
const functionModel = require("../models/functionModel");
const { cacheAside } = require("../services/cacheService");
const { invalidateCachePattern } = require("../config/redis");

const getAllFunctions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "functionDate",
      sortOrder = "ASC",
      startDate,
      endDate,
      minPrice,
      maxPrice,
      showId,
      venueId,
    } = req.query;

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sortBy,
      sortOrder: sortOrder.toUpperCase(),
      startDate: startDate || null,
      endDate: endDate || null,
      minPrice: minPrice ? parseFloat(minPrice) : null,
      maxPrice: maxPrice ? parseFloat(maxPrice) : null,
      showId: showId ? parseInt(showId, 10) : null,
      venueId: venueId ? parseInt(venueId, 10) : null,
    };

    const cacheKey =
      `functions:all:page=${options.page}:limit=${options.limit}:sort=${options.sortBy}:order=${options.sortOrder}` +
      (options.startDate ? `:startDate=${options.startDate}` : "") +
      (options.endDate ? `:endDate=${options.endDate}` : "") +
      (options.minPrice ? `:minPrice=${options.minPrice}` : "") +
      (options.maxPrice ? `:maxPrice=${options.maxPrice}` : "") +
      (options.showId ? `:showId=${options.showId}` : "") +
      (options.venueId ? `:venueId=${options.venueId}` : "");

    const cacheTTL = 300; // 5 minutos

    //cache-aside
    const data = await cacheAside(
      cacheKey,
      () => functionModel.getAllActiveFunctions(options),
      cacheTTL
    );

    return res.status(StatusCodes.OK).json({
      message: "Funciones obtenidas con éxito",
      data,
    });
  } catch (error) {
    console.error("Error al obtener funciones:", error);
    next(error);
  }
};

const getFunctionDetails = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "ID de función inválido",
      });
    }

    const cacheKey = `functions:details:id=${id}`;

    const cacheTTL = 60; // 1 minuto

    const functionDetails = await cacheAside(
      cacheKey,
      () => functionModel.getFunctionDetails(parseInt(id, 10)),
      cacheTTL
    );

    if (!functionDetails) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Función no encontrada",
      });
    }

    return res.status(StatusCodes.OK).json({
      message: "Detalles de función obtenidos con éxito",
      data: functionDetails,
    });
  } catch (error) {
    console.error("Error al obtener detalles de función:", error);
    next(error);
  }
};

const getFunctionsByShow = async (req, res, next) => {
  try {
    const { showId } = req.params;

    const {
      page = 1,
      limit = 10,
      sortBy = "functionDate",
      sortOrder = "ASC",
      startDate,
      endDate,
      minPrice,
      maxPrice,
    } = req.query;

    if (!showId || isNaN(parseInt(showId, 10))) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "ID de show inválido",
      });
    }

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sortBy,
      sortOrder: sortOrder.toUpperCase(),
      startDate: startDate || null,
      endDate: endDate || null,
      minPrice: minPrice ? parseFloat(minPrice) : null,
      maxPrice: maxPrice ? parseFloat(maxPrice) : null,
    };

    const cacheKey =
      `functions:show=${showId}:page=${options.page}:limit=${options.limit}:sort=${options.sortBy}:order=${options.sortOrder}` +
      (options.startDate ? `:startDate=${options.startDate}` : "") +
      (options.endDate ? `:endDate=${options.endDate}` : "") +
      (options.minPrice ? `:minPrice=${options.minPrice}` : "") +
      (options.maxPrice ? `:maxPrice=${options.maxPrice}` : "");

    const cacheTTL = 300; // 5 minutos

    //cache-aside
    const functions = await cacheAside(
      cacheKey,
      () => functionModel.getFunctionsByShow(parseInt(showId, 10), options),
      cacheTTL
    );

    return res.status(StatusCodes.OK).json({
      message: "Funciones del show obtenidas con éxito",
      data: functions,
    });
  } catch (error) {
    console.error("Error al obtener funciones del show:", error);
    next(error);
  }
};

const invalidateFunctionsCache = async (req, res, next) => {
  try {
    await invalidateCachePattern("functions:*");

    return res.status(StatusCodes.OK).json({
      message: "Caché de funciones invalidado con éxito",
    });
  } catch (error) {
    console.error("Error al invalidar caché:", error);
    next(error);
  }
};

module.exports = {
  getAllFunctions,
  getFunctionDetails,
  getFunctionsByShow,
  invalidateFunctionsCache,
};
