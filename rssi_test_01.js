var mqtt = require('mqtt');
// var client = mqtt.connect('mqtt://52.74.97.41', {
var client = mqtt.connect('mqtt://140.112.41.151', {
  username: 'api_server',
  password: 'iX7mB9D71AMeuY6H7r8vjwHv9F5eZq'
});
var timer;
// When the connection is established
client.on('connect', function() {

  // client.subscribe('dcdc5e9b3ea46f1171c362a1b06f83b6_C');
  client.subscribe('#')

  // setInterval(function () {
  //   client.publish('dcdc5e9b3ea46f1171c362a1b06f83b6_C' , JSON.stringify({cmd:"broadcast",sensorType:"0",sensorData:77}));
  // }, 5000);

})
var count = 0;
var array_01 = [];
var max_change = 50;
var b = Math.floor(Date.now() / 1000);
var max_nochange_time = 5;
// When we received messages from MQTT brokers
client.on('message', function(topic, message) {
  eval('var msg=' + message);
  if (msg.cmd == 'log' && msg.deviceId == '4d0100000000000000000000' && msg.sensorType == 0) { //UIposition  broadcast  log   UIposition
    count++;

    var a = Math.floor(Date.now() / 1000);
    timer = Math.floor(Date.now() / 1000);
    // console.log("Topic: " + topic.toString());
    // console.log("Message: " + '{"cmd":"broadcast","sensorType":' + msg.sensorType + ',"sensorData":' + msg.sensorData + '}' + "\n");
    // console.log("Message: " + '{"cmd":"broadcast","sensorType":' + msg.sensorType + ',"sensorData":' + ConvertBase.dec2hex(msg.sensorData) + '}' + "\n");
    // console.log("Message: " + '{"cmd":"log"' + ',"deviceId":' + msg.deviceId+ ',"sensorId":' + msg.sensorId+ '"sensorType":' + msg.sensorType   + ',"sensorType":' + msg.sensorType + ',"data":' + ConvertBase.dec2hex(msg.data).slice(2,4)+ '}' + "\n");
    // console.log(msg.toString());
    // console.log(msg);

    // console.log("Interval time: "+ (a-b)+" sec");
    // console.log("The "+count+"nd time");
    // console.log("RSSI of 4D01 : "+hexToDec(ConvertBase.dec2hex(msg.data).slice(2,4)) );
    if (array_01.length >= 1) {
      if (hexToDec(ConvertBase.dec2hex(msg.data).slice(2, 4)) - array_01[array_01.length - 1] > max_change) {
        array_01.push(array_01[array_01.length - 1] + max_change);
        // console.log("larget");
      } else if (array_01[array_01.length - 1] - hexToDec(ConvertBase.dec2hex(msg.data).slice(2, 4)) > max_change) {
        array_01.push(array_01[array_01.length - 1] - max_change);
        // console.log("small");
      } else {
        array_01.push(hexToDec(ConvertBase.dec2hex(msg.data).slice(2, 4)));
        // console.log("suitable");
      }
    } else {
      array_01.push(hexToDec(ConvertBase.dec2hex(msg.data).slice(2, 4)));
    }
    b = a;
    // console.log(hexToDec(ConvertBase.dec2hex(msg.data).slice(2, 4)));
    // console.log(array_01[array_01.length -1]);
  }

  // console.log("Topic: " + topic.toString());
  // console.log("Message: " + message.toString() + "\n");


})

setInterval(function () {
  timeout_insert_zero(timer,max_nochange_time,array_01 )
  console.log(array_01[array_01.length-1]);
}, 1000);
// for (var i = 0 ; i<=6 ; i++){
//   setTimeout(function () {
//     console.log('\n-----------------------------------\n');
//   }, i*1000);
// }
// setInterval(function () {
//   console.log("---------------------");
// }, 1000);
function timeout_insert_zero(timer, max_nochange_time, anchor_value ) {
  if (Math.floor(Date.now() / 1000) > (timer + max_nochange_time)) {
    anchor_value.push(anchor_value[anchor_value.length-1]-5);
    // console.log("timeout");

    // console.log("Now: "+Math.floor(Date.now() / 1000));
    // console.log(timer);
  }
}

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
  return hex.toLowerCase().split('').reduce((result, ch) =>
    result * 16 + '0123456789abcdefgh'.indexOf(ch), 0);
}

// decimal to hexadecimal
ConvertBase.dec2hex = function(num) {
  return ConvertBase(num).from(10).to(16);
};
