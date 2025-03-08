const express = require('express');
const router = express.Router();
const functionController = require('./controllers/functionController');

router.get('/getAllFunctions', functionController.getAllFunctions);

router.get('/getFunctions/search', functionController.searchFunctions);

router.get('/getFunctionsOccupancyStats', functionController.getFunctionsOccupancyStats);

router.get('/invalidateFunctions/invalidate-cache', functionController.invalidateFunctionsCache);

router.get('/getFunctionsByShow/show/:showId', functionController.getFunctionsByShow);

router.get('/getFunctionDetails/:id', functionController.getFunctionDetails);

module.exports = router;