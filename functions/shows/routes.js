const express = require('express');
const router = express.Router();
const showController = require('./controllers/showController');

router.get('/getAllShows', showController.getAllShows);

router.get('getShowById/:id', showController.getShowById);

router.get('getShowFunctions/:id/functions', showController.getShowFunctions);

module.exports = router;