const { StatusCodes } = require("http-status-codes");

const errorHandler = (err, req, res, next) => {
  console.error("Error: ", err);

  // Error de la base de datos
  if (err.code && (err.code.startsWith("22") || err.code.startsWith("23"))) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "Error en los datos enviados",
      error:
        process.env.NODE_ENV === "production"
          ? "Error en la validación de datos"
          : err.message,
    });
  }

  // Error de validación
  if (err.name === "ValidationError") {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "Error de validación",
      error: err.message,
    });
  }

  // Error de autenticación
  if (err.name === "UnauthorizedError") {
    return res.status(StatusCodes.UNAUTHORIZED).json({
      message: "No autorizado",
      error: "Acceso denegado",
    });
  }

  // Error por defecto
  return res.status(err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR).json({
    message: "Error en el servidor",
    error:
      process.env.NODE_ENV === "production"
        ? "Ocurrió un error inesperado"
        : err.message,
  });
};

module.exports = errorHandler;
