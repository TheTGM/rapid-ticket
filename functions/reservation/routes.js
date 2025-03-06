const express = require("express");
const { StatusCodes } = require("http-status-codes");
const { Pool } = require("pg");
const { showReservationMiddleware } = require("./middleware/validationMiddleware");
const api = express.Router();

// Configuración de la conexión a PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
});

// Endpoint existente
api.post("/testShow", showReservationMiddleware, async (req, res, next) => {
  try {
    const { id } = req.body;
    return res.status(StatusCodes.OK).json({ message: "ok", showId: id });
  } catch (error) {
    console.error("error API test show: ", error);
    next(error);
  }
});


module.exports = api;
