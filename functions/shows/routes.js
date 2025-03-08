const express = require('express');
const router = express.Router();
const showController = require('./controllers/showController');

router.get('/getAllShows', showController.getAllShows);

router.get('/getShowById/:id', showController.getShowById);

module.exports = router;