const { StatusCodes } = require("http-status-codes");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const showReservationSchema = require("../schema/show_reservation.json");

const schemaValidator = new Ajv();
addFormats(schemaValidator, { mode: "fast", formats: ["date", "date-time"] });
// for date time validation   timestamp: "2023-10-12T14:30:00Z", // ISO 8601 format

const showReservationValidator = schemaValidator.compile(showReservationSchema);

let validationMiddleware = (validator, request, response, next) => {
  const requestPayload = request.body;
  console.info("requestBody", requestPayload);
  const validPayload = validator(request.body);
  if (!validPayload) {
    console.error("invalid payload", validPayload);
    response.status(StatusCodes.BAD_REQUEST).json({
      data: {
        message: validator.errors[0].message,
      },
    });
  } else next();
};

let showReservationMiddleware = (request, response, next) => {
  return validationMiddleware(
    showReservationValidator,
    request,
    response,
    next
  );
};

module.exports = { showReservationMiddleware };
