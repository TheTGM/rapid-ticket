const Redis = require("ioredis");

const redisConfig = {
  host: process.env.CACHE_ENDPOINT,
  port: process.env.CACHE_PORT || 6379,

  // Opciones específicas para entorno serverless/Lambda
  connectTimeout: 5000,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,

  // Configuración para mantener conexión activa
  // Importante para entornos Lambda para reducir latencia
  keepAlive: 300,

  // Estrategia de reconexión para ambiente de producción
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    console.log(
      `Reintentando conexión a Redis (${times}). Próximo intento en ${delay}ms`
    );
    return delay;
  },
};

// Crear cliente Redis
let redis;

const getRedisClient = () => {
  if (!redis) {
    console.log("Inicializando conexión a Redis en:", redisConfig.host);
    redis = new Redis(redisConfig);

    redis.on("connect", () => {
      console.log("Conectado a Redis ElastiCache");
    });

    redis.on("error", (err) => {
      console.error("Error en la conexión a Redis ElastiCache:", err);
      // En Lambda es importante no dejar la conexión en estado pendiente
      if (redis && redis.status === "reconnecting") {
        console.log("Restableciendo conexión a Redis");
        redis.disconnect();
        redis = null;
      }
    });

    redis.on("reconnecting", () => {
      console.log("Reconectando a Redis...");
    });

    redis.on("close", () => {
      console.log("Conexión a Redis cerrada");
    });
  }

  return redis;
};

// Función para setear un valor en caché
const setCache = async (key, value, ttl = 3600) => {
  try {
    const client = getRedisClient();
    const stringValue =
      typeof value === "object" ? JSON.stringify(value) : String(value);

    await client.set(key, stringValue, "EX", ttl);

    return true;
  } catch (error) {
    console.error("Error al guardar en caché:", error);
    return false;
  }
};

// Función para traer un valor de caché
const getCache = async (key) => {
  try {
    const client = getRedisClient();
    const cachedValue = await client.get(key);

    if (!cachedValue) return null;

    // Intentamos parsear el valor como JSON
    try {
      return JSON.parse(cachedValue);
    } catch (e) {
      // Si no es JSON, devolvemos el string directamente
      return cachedValue;
    }
  } catch (error) {
    console.error("Error al obtener de caché:", error);
    return null;
  }
};

// Función para invalidar un valor en caché
const invalidateCache = async (key) => {
  try {
    const client = getRedisClient();
    await client.del(key);
    return true;
  } catch (error) {
    console.error("Error al invalidar caché:", error);
    return false;
  }
};

// Función para invalidar múltiples claves con un patrón
const invalidateCachePattern = async (pattern) => {
  try {
    const client = getRedisClient();
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
      console.log(`Invalidadas ${keys.length} claves con patrón: ${pattern}`);
    }
    return true;
  } catch (error) {
    console.error("Error al invalidar caché por patrón:", error);
    return false;
  }
};

// Para Lambda, ayuda a cerrar conexiones correctamente
const closeConnection = async () => {
  if (redis) {
    await redis.quit();
    redis = null;
    console.log("Conexión Redis cerrada correctamente");
  }
};

module.exports = {
  getRedisClient,
  setCache,
  getCache,
  invalidateCache,
  invalidateCachePattern,
  closeConnection,
};
