const express = require('express');
const router = express.Router();
const functionController = require('./controllers/functionController');

router.get('/', functionController.getAllFunctions);

router.get('/search', functionController.searchFunctions);

router.get('/stats', functionController.getFunctionsOccupancyStats);

router.get('/invalidate-cache', functionController.invalidateFunctionsCache);

router.get('/show/:showId', functionController.getFunctionsByShow);

router.get('/:id', functionController.getFunctionDetails);

module.exports = router;