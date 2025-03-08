const { Pool } = require("pg");

const dbConfig = {
  user: process.env.DB_USERNAME,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  max: 10, // Máximo de conexiones
  idleTimeoutMillis: 30000, // Tiempo máximo que una conexión puede estar inactiva
  connectionTimeoutMillis: 5000, // Tiempo máximo para establecer una conexión
};

const pool = new Pool(dbConfig);

// Evento para monitoreo de conexiones
pool.on("error", (err) => {
  console.error("Error inesperado en el cliente de PostgreSQL", err);
});

const query = async (text, params = []) => {
  const start = Date.now();
  const client = await pool.connect();

  try {
    const result = await client.query(text, params);
    const duration = Date.now() - start;

    console.log({
      query: text,
      params,
      duration,
      rowCount: result.rowCount,
    });

    return result;
  } finally {
    client.release();
  }
};

module.exports = {
  pool,
  query,
};
