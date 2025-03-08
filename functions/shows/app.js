const serverlessExpress = require("@codegenie/serverless-express");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const errorHandler = require("./middleware/errorHandler");

const app = express();

const api = require("./routes");

// Middlewares
app.use(helmet());
app.use(cors());
app.use(express.json());

// Lambda main route
app.use("", api);

app.use((req, res) => {
  res.status(StatusCodes.NOT_FOUND).json({
    message: "Recurso no encontrado",
  });
});

// Middlewares
app.use(errorHandler);

module.exports.handler = serverlessExpress({ app });
