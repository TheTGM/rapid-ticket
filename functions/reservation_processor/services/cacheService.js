const { setCache, getCache } = require("../config/redis");

/**
 * Cache-Aside (Lazy Loading)
 */

const cacheAside = async (key, fetchFunction, ttl = 3600) => {
  try {
    const cachedData = await getCache(key);

    // Si los datos están en caché, los devuelve
    if (cachedData) {
      console.log(`Datos obtenidos de caché para: ${key}`);
      return cachedData;
    }

    // 2. Si no están en caché, los obtiene de la fuente original
    console.log(
      `Datos no encontrados en caché para: ${key}, obteniendo de fuente original`
    );
    const originalData = await fetchFunction();

    // 3. Guarda los datos en caché para futuros accesos
    if (originalData) {
      await setCache(key, originalData, ttl);
      console.log(`Datos guardados en caché para: ${key}`);
    }

    return originalData;
  } catch (error) {
    console.error(`Error en cacheAside para clave: ${key}`, error);

    return await fetchFunction();
  }
};

module.exports = {
  cacheAside,
};
