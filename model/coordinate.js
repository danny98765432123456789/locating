var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var coordinate = new  mongoose.Schema({
  x: String,
  y: String,
  timestamp: Number
}, {
  versionKey: false
});

module.exports = mongoose.model('coordinate', coordinate);
