const { Pool } = require("pg");
const express = require("express");
const { StatusCodes } = require("http-status-codes");
const { getAllShows } = require("../../model/entities/shows");
const api = express.Router();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
});

api.get("/getAllShows", async (req, res, next) => {
  try {
    const showsPayload = req.body;
    console.info("body: ", showsPayload);

    const client = await pool.connect();
    try {
      const response = await getAllShows(client);
      console.log("response: ", response);
    } catch (error) {
      console.error("Error en consulta de shows: ", error);
      return res.status(500).json({
        message: "Error en el servidor",
        error: error.message,
      });
    } finally {
      client.release();
    }

    return res.status(StatusCodes.OK).send({ message: "ok" });
  } catch (error) {
    console.error("error API create payment: ", error);
    next(error);
  }
});

module.exports = api;
