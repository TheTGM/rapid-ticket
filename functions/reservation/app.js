const serverlessExpress = require("@codegenie/serverless-express");
const express = require("express");
const cors = require("cors");
const app = express();
const helmet = require("helmet");
const errorHandler = require("./middleware/validationMiddleware");

const api = require("./routes");

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use("", api);

// Ruta para manejar 404
app.use((req, res) => {
  res.status(StatusCodes.NOT_FOUND).json({
    message: "Recurso no encontrado",
  });
});

// Middleware para manejo de errores
app.use(errorHandler);

module.exports.handler = serverlessExpress({ app });
