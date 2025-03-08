const { query } = require("../config/db");

const getAllActiveFunctions = async (options = {}) => {
  const {
    page = 1,
    limit = 10,
    sortBy = "functionDate",
    sortOrder = "ASC",
    startDate = null,
    endDate = null,
    minPrice = null,
    maxPrice = null,
    showId = null,
    venueId = null,
  } = options;

  const validSortColumns = [
    "id",
    "functionDate",
    "functionTime",
    "showId",
    "venueId",
  ];
  const validSortOrders = ["ASC", "DESC"];

  const sanitizedSortBy = validSortColumns.includes(sortBy)
    ? sortBy
    : "functionDate";
  const sanitizedSortOrder = validSortOrders.includes(sortOrder.toUpperCase())
    ? sortOrder.toUpperCase()
    : "ASC";

  const offset = (page - 1) * limit;

  let sql = `
    WITH MinPrices AS (
      SELECT 
        functionId, 
        MIN(price) as minPrice,
        MAX(price) as maxPrice
      FROM 
        FunctionSections
      GROUP BY 
        functionId
    )
    SELECT 
      f.id, 
      f.showId, 
      f.venueId, 
      f.functionDate, 
      f.functionTime, 
      f.status,
      s.name as showName,
      s.description as showDescription,
      s.imageUrl as showImageUrl,
      v.name as venueName,
      v.address as venueAddress,
      v.city as venueCity,
      mp.minPrice,
      mp.maxPrice
    FROM 
      FunctionsTable f
    JOIN 
      Shows s ON f.showId = s.id
    JOIN 
      Venues v ON f.venueId = v.id
    LEFT JOIN
      MinPrices mp ON f.id = mp.functionId
    WHERE 
      f.status = 'scheduled'
  `;

  const queryParams = [];
  let paramCounter = 1;

  if (startDate) {
    sql += ` AND f.functionDate >= $${paramCounter}`;
    queryParams.push(startDate);
    paramCounter++;
  }

  if (endDate) {
    sql += ` AND f.functionDate <= $${paramCounter}`;
    queryParams.push(endDate);
    paramCounter++;
  }

  if (showId) {
    sql += ` AND f.showId = $${paramCounter}`;
    queryParams.push(showId);
    paramCounter++;
  }

  if (venueId) {
    sql += ` AND f.venueId = $${paramCounter}`;
    queryParams.push(venueId);
    paramCounter++;
  }

  if (minPrice !== null) {
    sql += ` AND mp.minPrice >= $${paramCounter}`;
    queryParams.push(minPrice);
    paramCounter++;
  }

  if (maxPrice !== null) {
    sql += ` AND mp.minPrice <= $${paramCounter}`;
    queryParams.push(maxPrice);
    paramCounter++;
  }

  const countSql = `SELECT COUNT(*) FROM (${sql}) as counted`;
  const countResult = await query(countSql, queryParams);
  const totalFunctions = parseInt(countResult.rows[0].count, 10);

  sql += ` ORDER BY f.${sanitizedSortBy} ${sanitizedSortOrder} LIMIT $${paramCounter} OFFSET $${
    paramCounter + 1
  }`;
  queryParams.push(limit, offset);

  const result = await query(sql, queryParams);

  return {
    functions: result.rows,
    pagination: {
      total: totalFunctions,
      page,
      limit,
      pages: Math.ceil(totalFunctions / limit),
    },
  };
};

const getFunctionDetails = async (functionId) => {
  if (!functionId || isNaN(parseInt(functionId, 10))) {
    throw new Error("ID de función inválido");
  }

  const functionSql = `
    SELECT 
      f.id, 
      f.showId, 
      f.venueId, 
      f.functionDate, 
      f.functionTime, 
      f.status,
      s.name as showName,
      s.description as showDescription,
      s.imageUrl as showImageUrl,
      s.duration as showDuration,
      v.name as venueName,
      v.address as venueAddress,
      v.city as venueCity,
      v.state as venueState,
      v.country as venueCountry,
      v.capacity as venueCapacity
    FROM 
      FunctionsTable f
    JOIN 
      Shows s ON f.showId = s.id
    JOIN 
      Venues v ON f.venueId = v.id
    WHERE 
      f.id = $1
  `;

  const functionResult = await query(functionSql, [functionId]);

  if (functionResult.rows.length === 0) {
    return null;
  }

  const functionDetails = functionResult.rows[0];

  console.log("functionDetails", functionDetails);

  const sectionsSql = `
    SELECT 
      fs.id as functionSectionId,
      fs.sectionId,
      fs.price,
      fs.availableSeats,
      s.name as sectionName,
      s.description as sectionDescription,
      s.capacity as sectionCapacity,
      s.hasNumberedSeats
    FROM 
      FunctionSections fs
    JOIN 
      Sections s ON fs.sectionId = s.id
    WHERE 
      fs.functionId = $1
  `;

  const sectionsResult = await query(sectionsSql, [functionId]);

  const seatsSql = `
    SELECT 
      st.id as seatId,
      st.sectionId,
      st.row,
      st.number,
      st.status,
      (
        SELECT COUNT(*) FROM ReservationItems ri 
        WHERE ri.seatId = st.id 
        AND ri.functionId = $1 
        AND ri.status != 'canceled'
      ) > 0 as isReserved
    FROM 
      Seats st
    JOIN 
      Sections s ON st.sectionId = s.id
    WHERE 
      s.venueId = $2
    ORDER BY 
      st.sectionId, st.row, st.number
  `;

  const seatsResult = await query(seatsSql, [
    functionId,
    functionDetails.venueId,
  ]);

  console.log("seatsResult.rows", seatsResult.rows);

  const sectionMap = {};

  sectionsResult.rows.forEach((section) => {
    sectionMap[section.sectionid] = {
      ...section,
      seats: [],
    };
  });

  seatsResult.rows.forEach((seat) => {
    if (sectionMap[seat.sectionid]) {
      sectionMap[seat.sectionid].seats.push(seat);
    }
  });

  functionDetails.sections = Object.values(sectionMap);

  let totalSeats = 0;
  let reservedSeats = 0;

  functionDetails.sections.forEach((section) => {
    section.reservedSeats = section.seats.filter(
      (seat) => seat.isreserved
    ).length;
    section.availableSeats = section.seats.length - section.reservedSeats;

    totalSeats += section.seats.length;
    reservedSeats += section.reservedSeats;
  });

  functionDetails.occupancyStats = {
    totalSeats,
    reservedSeats,
    availableSeats: totalSeats - reservedSeats,
    occupancyPercentage:
      totalSeats > 0 ? Math.round((reservedSeats / totalSeats) * 100) : 0,
  };

  return functionDetails;
};

const getFunctionsByShow = async (showId, options = {}) => {
  const queryOptions = {
    ...options,
    showId,
  };

  return await getAllActiveFunctions(queryOptions);
};

const searchFunctions = async (filters = {}, options = {}) => {
  const queryOptions = {
    ...options,
    ...filters,
  };

  return await getAllActiveFunctions(queryOptions);
};

const getFunctionsOccupancyStats = async () => {
  const sql = `
    WITH SeatCounts AS (
      SELECT 
        ri.functionId,
        COUNT(*) as reservedSeats
      FROM 
        ReservationItems ri
      WHERE 
        ri.status = 'confirmed'
      GROUP BY 
        ri.functionId
    ),
    FunctionCapacity AS (
      SELECT 
        fs.functionId,
        SUM(s.capacity) as totalCapacity
      FROM 
        FunctionSections fs
      JOIN 
        Sections s ON fs.sectionId = s.id
      GROUP BY 
        fs.functionId
    )
    SELECT 
      f.id,
      f.showId,
      s.name as showName,
      f.functionDate,
      f.functionTime,
      v.name as venueName,
      COALESCE(fc.totalCapacity, 0) as totalCapacity,
      COALESCE(sc.reservedSeats, 0) as reservedSeats,
      CASE 
        WHEN fc.totalCapacity > 0 THEN 
          ROUND((COALESCE(sc.reservedSeats, 0)::NUMERIC / fc.totalCapacity) * 100, 2)
        ELSE 0
      END as occupancyPercentage
    FROM 
      FunctionsTable f
    JOIN 
      Shows s ON f.showId = s.id
    JOIN 
      Venues v ON f.venueId = v.id
    LEFT JOIN 
      FunctionCapacity fc ON f.id = fc.functionId
    LEFT JOIN 
      SeatCounts sc ON f.id = sc.functionId
    WHERE 
      f.status = 'scheduled' AND
      f.functionDate >= CURRENT_DATE
    ORDER BY 
      f.functionDate, f.functionTime
  `;

  const result = await query(sql);

  return result.rows;
};

module.exports = {
  getAllActiveFunctions,
  getFunctionDetails,
  getFunctionsByShow,
  searchFunctions,
  getFunctionsOccupancyStats,
};
