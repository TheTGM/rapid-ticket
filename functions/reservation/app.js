const serverlessExpress = require("@codegenie/serverless-express");
const express = require("express");
const cors = require("cors");
const app = express();
const api = require("./routes");

app.use(cors({ origin: "*" }));
app.use(express.json());

app.use("", api);

app.use(function (error, req, res, next) {
  if (error instanceof Object) {
    if (error.code) {
      res.status(error.code).json({
        error: { message: error.message },
      });
    } else {
      res.status(500).json({
        error: { ...error },
      });
    }
  } else {
    res.status(500).json({
      error: { message: error },
    });
  }
});

module.exports.handler = serverlessExpress({ app });
