const express = require('express');
const router = express.Router();
const functionController = require('./controllers/functionController');

router.get('/getAllFunctions', functionController.getAllFunctions);

router.get('/getFunctionsByShow/show/:showId', functionController.getFunctionsByShow);

router.get('/getFunctionDetails/:id', functionController.getFunctionDetails);

router.get('/invalidateFunctions/invalidate-cache', functionController.invalidateFunctionsCache);

module.exports = router;