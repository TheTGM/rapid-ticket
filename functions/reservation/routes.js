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
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
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

api.post("/testBd", async (req, res, next) => {
  try {
    const client = await pool.connect();
    try {
      const result = await client.query("SELECT * FROM Shows");
      console.log(result.rows);
      return res.status(StatusCodes.OK).json({ message: "ok", result:result.rows });  
    } finally {
      client.release();
    }
    return res.status(StatusCodes.OK).json({ message: "ok" });
  } catch (error) {
    console.error("error API create payment: ", error);
    next(error);
  }
});


module.exports = api;
