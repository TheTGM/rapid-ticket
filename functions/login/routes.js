const { Pool } = require("pg");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const api = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = "24h";
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
      return res.status(400).json({
        message: "Usuario y contraseña son requeridos",
      });
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        "SELECT id, username, passwordhash, email, name, role, status FROM users WHERE username = $1",
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ message: "Credenciales inválidas" });
      }

      const user = result.rows[0];
      console.log("user: ", user);

      if (user.status !== "active") {
        return res.status(403).json({
          message: "Cuenta inactiva o suspendida",
        });
      }

      if (!user.passwordhash) {
        console.error(
          "Error: passwordhash es undefined para el usuario:",
          username
        );
        return res.status(500).json({
          message: "Error en la autenticación. Contacte al administrador.",
        });
      }

      const passwordMatch = await bcrypt.compare(password, user.passwordhash);
      if (!passwordMatch) {
        return res.status(401).json({ message: "Credenciales inválidas" });
      }

      const token = jwt.sign(
        {
          sub: user.id,
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

      return res.status(200).json({
        token: "Bearer " + token,
      });
    } catch (error) {
      console.error("Error en consulta de login: ", error);
      return res.status(500).json({
        message: "Error en el servidor",
        error: error.message,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Error general en API login: ", error);
    return res.status(500).json({
      message: "Error interno del servidor",
      error: error.message,
    });
  }
});

api.post("/registerTest", async (req, res, next) => {
  const testUser = {
    username: "admin123",
    password: "Admin123!", // En producción, usar una contraseña más segura
    email: "admin@example.com",
    name: "Admin User",
    role: "admin",
  };
  try {
    const client = await pool.connect();
    try {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(testUser.password, salt);

      const checkResult = await client.query(
        "SELECT id FROM Users WHERE username = $1",
        [testUser.username]
      );
      if (checkResult.rows.length > 0) {
        console.log(`El usuario '${testUser.username}' ya existe.`);
        return;
      }
      await client.query(
        "INSERT INTO Users (username, passwordHash, email, name, role, status) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          testUser.username,
          passwordHash,
          testUser.email,
          testUser.name,
          testUser.role,
          "active",
        ]
      );
      return res.status(200).json({ message: "ok" });
    } catch (error) {
      console.error("error API create payment: ", error);
      next(error);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("error API create payment: ", error);
    next(error);
  }
});

module.exports = api;
