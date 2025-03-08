const { query } = require("../config/db");

const getAllShows = async (options = {}) => {
  const { page = 1, limit = 10, sortBy = "id", sortOrder = "ASC" } = options;

  // Validar los parámetros para prevenir SQL injection
  const validSortColumns = ["id", "name", "createdAt", "updatedAt"];
  const validSortOrders = ["ASC", "DESC"];

  const sanitizedSortBy = validSortColumns.includes(sortBy) ? sortBy : "id";
  const sanitizedSortOrder = validSortOrders.includes(sortOrder.toUpperCase())
    ? sortOrder.toUpperCase()
    : "ASC";

  const offset = (page - 1) * limit;

  const sql = `
    SELECT 
      id, 
      name, 
      description, 
      duration, 
      imageUrl, 
      createdAt, 
      updatedAt
    FROM 
      Shows
    ORDER BY 
      ${sanitizedSortBy} ${sanitizedSortOrder}
    LIMIT $1 OFFSET $2
  `;

  const params = [limit, offset];

  const result = await query(sql, params);

  const countResult = await query("SELECT COUNT(*) FROM Shows");
  const totalShows = parseInt(countResult.rows[0].count, 10);

  return {
    shows: result.rows,
    pagination: {
      total: totalShows,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(totalShows / limit),
    },
  };
};

const getShowById = async (id) => {
  const sql = `
    SELECT 
      id, 
      name, 
      description, 
      duration, 
      imageUrl, 
      createdAt, 
      updatedAt
    FROM 
      Shows
    WHERE 
      id = $1
  `;

  const result = await query(sql, [id]);

  return result.rows[0] || null;
};

const getShowFunctions = async (showId) => {
  const sql = `
    SELECT 
      f.id, 
      f.showId, 
      f.venueId, 
      f.functionDate, 
      f.functionTime, 
      f.status,
      v.name as venueName,
      v.address as venueAddress
    FROM 
      FunctionsTable f
    JOIN 
      Venues v ON f.venueId = v.id
    WHERE 
      f.showId = $1 AND 
      f.status = 'scheduled' AND
      f.functionDate >= CURRENT_DATE
    ORDER BY 
      f.functionDate ASC, 
      f.functionTime ASC
  `;

  const result = await query(sql, [showId]);

  return result.rows;
};

module.exports = {
  getAllShows,
  getShowById,
  getShowFunctions,
};
