var mqtt = require('mqtt');
// var client = mqtt.connect('mqtt://52.74.97.41', {
var client = mqtt.connect('mqtt://140.112.41.151', {
  username: 'api_server',
  password: 'iX7mB9D71AMeuY6H7r8vjwHv9F5eZq'
});

// When the connection is established
client.on('connect', function() {

  // client.subscribe('dcdc5e9b3ea46f1171c362a1b06f83b6_C');
  client.subscribe('#')

// setInterval(function () {
//   client.publish('dcdc5e9b3ea46f1171c362a1b06f83b6_C' , JSON.stringify({cmd:"broadcast",sensorType:"0",sensorData:77}));
// }, 5000);

})

// When we received messages from MQTT brokers
client.on('message', function(topic, message) {
  eval('var msg=' + message);
  if (msg.cmd == 'log' && msg.deviceId == '4d0500000000000000000000' ) {  //UIposition  broadcast  log   UIposition
    // console.log("Topic: " + topic.toString());
    // console.log("Message: " + '{"cmd":"broadcast","sensorType":' + msg.sensorType + ',"sensorData":' + msg.sensorData + '}' + "\n");
    // console.log("Message: " + '{"cmd":"broadcast","sensorType":' + msg.sensorType + ',"sensorData":' + ConvertBase.dec2hex(msg.sensorData) + '}' + "\n");
    console.log("Message: " + '{"cmd":"log"' + ',"deviceId":' + msg.deviceId+ ',"sensorId":' + msg.sensorId+ '"sensorType":' + msg.sensorType   + ',"sensorType":' + msg.sensorType + ',"data":' + ConvertBase.dec2hex(msg.data)+ '}' + "\n");
    // console.log(msg.toString());
    // console.log(msg);

    // console.log("RSSI of 4D02 : "+hexToDec(ConvertBase.dec2hex(msg.data).slice(2,4)) );
  }

  // console.log("Topic: " + topic.toString());
  // console.log("Message: " + message.toString() + "\n");


})

var ConvertBase = function(num) {
  return {
    from: function(baseFrom) {
      return {
        to: function(baseTo) {
          return parseInt(num, baseFrom).toString(baseTo);
        }
      };
    }
  };
};
function hexToDec(hex) {
    return hex.toLowerCase().split('').reduce( (result, ch) =>
        result * 16 + '0123456789abcdefgh'.indexOf(ch), 0);
}

// decimal to hexadecimal
ConvertBase.dec2hex = function(num) {
  return ConvertBase(num).from(10).to(16);
};
