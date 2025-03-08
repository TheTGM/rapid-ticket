const { StatusCodes } = require("http-status-codes");
const showModel = require("../models/showModel");
const { cacheAside } = require("../services/cacheService");

const getAllShows = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "id",
      sortOrder = "ASC",
    } = req.query;

    // Construir clave de caché basada en los parámetros
    const cacheKey = `shows:all:page=${page}:limit=${limit}:sort=${sortBy}:order=${sortOrder}`;

    //cache-aside
    const data = await cacheAside(
      cacheKey,
      () => showModel.getAllShows({ page, limit, sortBy, sortOrder }),
      900
    );

    return res.status(StatusCodes.OK).json({
      message: "Datos obtenidos con éxito",
      data,
    });
  } catch (error) {
    console.error("Error al obtener shows:", error);
    next(error);
  }
};

const getShowById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "ID de show inválido",
      });
    }

    const cacheKey = `shows:id=${id}`;

    //cache-aside
    const show = await cacheAside(
      cacheKey,
      () => showModel.getShowById(parseInt(id, 10)),
      3600
    );

    if (!show) {
      return res.status(StatusCodes.NOT_FOUND).json({
        message: "Show no encontrado",
      });
    }

    return res.status(StatusCodes.OK).json({
      message: "Show obtenido con éxito",
      data: show,
    });
  } catch (error) {
    console.error("Error al obtener show por ID:", error);
    next(error);
  }
};

module.exports = {
  getAllShows,
  getShowById
};
