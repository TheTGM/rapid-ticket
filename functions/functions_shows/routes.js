const express = require('express');
const { StatusCodes } = require('http-status-codes');
const { showFunctionsShowsMiddleware } = require('./middleware/validationMiddleware');
const api = express.Router();


api.post('/testShow', showFunctionsShowsMiddleware, async (req, res, next) => {
    try {
        return res.status(StatusCodes.OK).json({ message: "ok" });
    } catch (error) {
        console.error("error API create payment: ", error);
        next(error);
    }
});

module.exports = api;