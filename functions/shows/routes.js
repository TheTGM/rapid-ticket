const express = require('express');
const { StatusCodes } = require('http-status-codes');
const api = express.Router();


api.get('/testShow', async (req, res, next) => {
    try {
        return res.status(StatusCodes.OK).json({ message: "ok" });
    } catch (error) {
        console.error("error API create payment: ", error);
        next(error);
    }
});