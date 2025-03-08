const express = require('express');
const router = express.Router();
const showController = require('./controllers/showController');

router.get('/getAllShows', showController.getAllShows);

router.get('/:id', showController.getShowById);

router.get('/:id/functions', showController.getShowFunctions);

module.exports = router;