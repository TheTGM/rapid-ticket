const { Pool } = require("pg");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const api = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = "24h"; // Expiración del token: 24 horas
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
});

api.post("/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          message: "Usuario y contraseña son requeridos",
        }),
      };
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT id, username, "passwordHash", email, name, role, status FROM "Users" WHERE username = $1',
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ message: "Credenciales inválidas" });
      }

      const user = result.rows[0];

      if (user.status !== "active") {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ message: "Cuenta inactiva o suspendida" }),
        };
      }

      const passwordMatch = await bcrypt.compare(password, user.passwordHash);
      if (!passwordMatch) {
        return res.status(401).json({ message: "Credenciales inválidas" });
      }

      const token = jwt.sign(
        {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          role: user.role,
        },
        JWT_SECRET,
        {
          expiresIn: TOKEN_EXPIRY,
        }
      );

      return res.status(200).json({ token });
    } catch (error) {
      console.error("Error API login: ", error);
      next(error);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error API login: ", error);
    next(error);
  }
});

module.exports = api;
