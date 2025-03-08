const express = require('express');
const router = express.Router();
const reservationController = require('./controllers/reservationController');
const authMiddleware = require('./middleware/authMiddleware');

router.post('/createReservation', reservationController.createReservation);

router.get('/getReservation/status/:temporaryId', reservationController.checkReservationStatus);

router.get('/getReservation/:id', authMiddleware.verifyToken, reservationController.getReservation);

router.put('/putReservation/:id/confirm', authMiddleware.verifyToken, reservationController.confirmReservation);

router.put('/putReservation/:id/cancel', authMiddleware.verifyToken, reservationController.cancelReservation);

router.get('/getUserReservations/user/me', authMiddleware.verifyToken, reservationController.getUserReservations);

router.get('/getReservation/:id/time', reservationController.checkReservationTime);

module.exports = router;