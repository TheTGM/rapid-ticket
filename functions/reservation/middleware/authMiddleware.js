const jwt = require("jsonwebtoken");
const { StatusCodes } = require("http-status-codes");

const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "No se ha proporcionado un token de autenticación",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "El token ha expirado, inicie sesión nuevamente",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        message: "Token inválido",
      });
    }

    console.error("Error en la verificación del token:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Error en la autenticación",
    });
  }
};

const verifyAdmin = (req, res, next) => {
  verifyToken(req, res, () => {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "Acceso denegado, se requiere rol de administrador",
      });
    }

    next();
  });
};

module.exports = {
  verifyToken,
  verifyAdmin,
};
