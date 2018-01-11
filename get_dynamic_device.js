var mqtt = require('mqtt');
// var Math = require("Math");
var plotly = require('plotly')("danny98765432123456789", "Ede5PF6OJWVgqxHfu0jJ");
var client = mqtt.connect('mqtt://140.112.41.151', {
  username: 'api_server',
  password: 'iX7mB9D71AMeuY6H7r8vjwHv9F5eZq'
});
var mongoose = require('mongoose');
var coordinate = require('./model/coordinate');
mongoose.Promise = global.Promise
mongoose.connect('mongodb://localhost/iotplatform', {
  useMongoClient: true
});

function Anchor(name, x_label, y_label) {
  this.name = name;
  this.x_label = x_label;
  this.y_label = y_label;
  this.rssi = [0];
  this.dist;
  this.count = 0;
  this.timer;
}

var anchors = [
  new Anchor(1, 0, 0),
  new Anchor(2, 5, 0),
  new Anchor(3, 10, 0),
  new Anchor(4, 15, 0),
  new Anchor(5, 20, 0),
  new Anchor(6, 25, 0),
  new Anchor(7, 30, 0),
  new Anchor(8, 35, 0),
  new Anchor(9, 40, 0),
  new Anchor(10, 45, 0),
  new Anchor(11, 45, -5),
  new Anchor(12, 45, -10),
  new Anchor(13, 38, -5),
  new Anchor(14, 37, -8),
  new Anchor(15, 27, -8),
  new Anchor(17, 18, -8),
  new Anchor(20, 7, -8)

];
var A1_x = 0;
var A1_y = 0;
var A2_x = 5;
var A2_y = 0;
var A3_x = 10;
var A3_y = 0;
var A4_x = 15;
var A4_y = 0;
var A5_x = 20;
var A5_y = 0;
var A6_x = 25;
var A6_y = 0;
var A7_x = 30;
var A7_y = 0;
var A8_x = 35;
var A8_y = 0;
var A9_x = 40;
var A9_y = 0;



// var D6_x, D6_y;
// var D6_x_array = [],
// D6_y_array = [];
// var length = 3000;
var timeout = 500;

var array_01 = [0];
var array_02 = [0];
var array_03 = [0];
var array_04 = [0];
var array_05 = [0];
var array_06 = [0];
var array_07 = [0];
var array_08 = [0];
var array_09 = [0];
var A1_dist;
var A2_dist;
var A3_dist;
var A4_dist;
var A5_dist;
var A6_dist;
var A7_dist;
var A8_dist;
var A9_dist;
var Tag_x;
var Tag_y;
var count_01 = 0;
var count_02 = 0;
var count_03 = 0;
var count_04 = 0;
var count_05 = 0;
var count_06 = 0;
var count_07 = 0;
var count_08 = 0;
var count_09 = 0;
var timer_01;
var timer_02;
var timer_03;
var timer_04;
var timer_05;
var timer_06;
var timer_07;
var timer_08;
var timer_09;
var max_change = 50;
var max_nochange_time = 6;
var array_x = [];
var array_y = [];
// var prob = 1 / 4;
// var anchors = [01, 02, 03, 04, 05, 06, 07, 08, 09];
var rssi_decrease = 5;
var fresh_table = [];
var param = [];

// var b = Math.floor(Date.now() / 1000);

client.on('connect', function() {
  // client.subscribe('dcdc5e9b3ea46f1171c362a1b06f83b6_C');
  client.subscribe('#')
  // setInterval(function () {
  //   client.publish('dcdc5e9b3ea46f1171c362a1b06f83b6_C' , JSON.stringify({cmd:"broadcast",sensorType:"0",sensorData:77}));
  // }, 5000);
})

client.on('message', function(topic, message) {
  eval('var msg=' + message);
  // console.log(anchors);
  change_limit(anchors, msg);
  // change_limit('01', array_01, count_01, timer_01, msg);
  // change_limit('02', array_02, count_02, timer_02, msg);
  // change_limit('03', array_03, count_03, timer_03, msg);
  // change_limit('04', array_04, count_04, timer_04, msg);
  // change_limit('05', array_05, count_05, timer_05, msg);
  // change_limit('06', array_06, count_06, timer_06, msg);
  // change_limit('07', array_07, count_07, timer_07, msg);
  // change_limit('08', array_08, count_08, timer_08, msg);
  // change_limit('09', array_09, count_09, timer_09, msg);



})

setInterval(function() {
  // if (array_01.length != 0 && array_02.length != 0 && array_03.length != 0 && array_04.length != 0 && array_05.length != 0 && array_06.length != 0 && array_07.length != 0 && array_08.length != 0 && array_09.length != 0) {
  // console.log("Start to calculate the coordinate");
  fresh_table = refresh_fresh_table(anchors, fresh_table);
  // console.log(fresh_table);
  // fresh_table = refresh_fresh_table("01", array_01, fresh_table);
  // fresh_table = refresh_fresh_table("02", array_02, fresh_table);
  // fresh_table = refresh_fresh_table("03", array_03, fresh_table);
  // fresh_table = refresh_fresh_table("04", array_04, fresh_table);
  // fresh_table = refresh_fresh_table("05", array_05, fresh_table);
  // fresh_table = refresh_fresh_table("06", array_06, fresh_table);
  // fresh_table = refresh_fresh_table("07", array_07, fresh_table);
  // fresh_table = refresh_fresh_table("08", array_08, fresh_table);
  // fresh_table = refresh_fresh_table("09", array_09, fresh_table);
  var uni_table = new Set(fresh_table); // unique items
  console.log([...uni_table]);
  // console.log(fresh_table);
  calculation(anchors, [...uni_table]);
  // console.log(array_02);
  // console.log("123");
  // }
}, timeout);

function refresh_fresh_table(anchors, fresh_table) {
  for (var i = 0; i < anchors.length; i++) {
    if (anchors[i].rssi[anchors[i].rssi.length - 1] >= 30) {
      // for (var i =0; i<=anchor_value.length ;i++){
      //   if(anchor_value[i]==)
      // }
      fresh_table.push(anchors[i].name);
    } else {
      fresh_table.remByVal(anchors[i].name);
    }
    // var uni_table = new Set(fresh_table); // unique items
    // console.log([...uni_table]);
    // return uni_table;
    // fresh_table=[...fresh_table];

  }
  return fresh_table;
}

setInterval(function() {
  timer = Math.floor(Date.now() / 1000);
  // timeout_insert_zero(timer_01, array_01, max_nochange_time);
  // timeout_insert_zero(timer_02, array_02, max_nochange_time);
  // timeout_insert_zero(timer_03, array_03, max_nochange_time);
  // timeout_insert_zero(timer_04, array_04, max_nochange_time);
  // timeout_insert_zero(timer_05, array_05, max_nochange_time);
  // timeout_insert_zero(timer_06, array_06, max_nochange_time);
  // timeout_insert_zero(timer_07, array_07, max_nochange_time);
  // timeout_insert_zero(timer_08, array_08, max_nochange_time);
  // timeout_insert_zero(timer_09, array_09, max_nochange_time);
  timeout_insert_lower(anchors, max_nochange_time);
  // timeout_insert_lower(timer_01, array_01, max_nochange_time, timer);
  // timeout_insert_lower(timer_02, array_02, max_nochange_time, timer);
  // timeout_insert_lower(timer_03, array_03, max_nochange_time, timer);
  // timeout_insert_lower(timer_04, array_04, max_nochange_time, timer);
  // timeout_insert_lower(timer_05, array_05, max_nochange_time, timer);
  // timeout_insert_lower(timer_06, array_06, max_nochange_time, timer);
  // timeout_insert_lower(timer_07, array_07, max_nochange_time, timer);
  // timeout_insert_lower(timer_08, array_08, max_nochange_time, timer);
  // timeout_insert_lower(timer_09, array_09, max_nochange_time, timer);
}, 1000);
// change_limit('01', array_01, count_01, timer_01, msg);

function change_limit(anchors, msg) {


  for (var i = 0; i < anchors.length; i++) {
    // console.log(anchors);
    if (msg.cmd == 'log' && msg.deviceId == '4d' + anchors[i].name.toString().padLeft(2, '0') + '00000000000000000000' && msg.sensorType == 0) { //UIposition  broadcast  log   UIposition
      // count++;
      timer = Math.floor(Date.now() / 1000);
      // console.log("Interval: " + (a - b));
      // console.log("The " + count_01 + "nd time");
      // console.log("RSSI of 4D01 : " + hexToDec(ConvertBase.dec2hex(msg.data).slice(2, 4)));
      if (anchors[i].rssi.length >= 1 && hexToDec(ConvertBase.dec2hex(msg.data).slice(2, 4)) != 0) {
        if (hexToDec(ConvertBase.dec2hex(msg.data).slice(2, 4)) - anchors[i].rssi[anchors[i].rssi.length - 1] > max_change) {
          anchors[i].rssi.push(anchors[i].rssi[anchors[i].rssi.length - 1] + max_change);
          // console.log("larget");
        } else if (anchors[i].rssi[anchors[i].rssi.length - 1] - hexToDec(ConvertBase.dec2hex(msg.data).slice(2, 4)) > max_change) {
          anchors[i].rssi.push(anchors[i].rssi[anchors[i].rssi.length - 1] - max_change);
          // console.log("small");
        } else {
          anchors[i].rssi.push(hexToDec(ConvertBase.dec2hex(msg.data).slice(2, 4)));
          // console.log("suitable");
        }
      } else {
        anchors[i].rssi.push(hexToDec(ConvertBase.dec2hex(msg.data).slice(2, 4)));
      }
      // console.log(array_01[array_01.length - 1]);
      // b = a;
    }
  }
}

function timeout_insert_lower(anchors, max_nochange_time, rssi_decrease) {
  for (var i = 0; i < anchors.length; i++) {
    if (Math.floor(Date.now() / 1000) > (anchors[i].timer[anchors[i].timer.length -1] + max_nochange_time)) {
      if (anchors[i].rssi[anchors[i].rssi.length - 1] >= 5) {
        anchors[i].rssi.push(anchors[i].rssi[anchors[i].rssi.length - 1] - rssi_decrease);
        // console.log("timeout");
        // console.log("Now: "+Math.floor(Date.now() / 1000));
        // console.log(timer);
      }
    }
  }
}

// function timeout_insert_zero(timer, max_nochange_time, anchor_value) {
//   if (Math.floor(Date.now() / 1000) > timer + max_nochange_time ) {
//     anchor_value.push(0.00000001);
//   }
// }



function move_limit(i, anchors) {
  if (anchors[i].rssi.length >= 4) {
    return (1 / 10) * anchors[i].rssi[anchors[i].rssi.length - 1] + (1 / 10) * anchors[i].rssi[anchors[i].rssi.length - 1] + (2 / 10) * anchors[i].rssi[anchors[i].rssi.length - 1] + (6 / 10) * Math.pow(10, ((205 - anchors[i].rssi[anchors[i].rssi.length - 1]) / 40));
  } else {
    return Math.pow(10, ((205 - anchors[i].rssi[anchors[i].rssi.length - 1]) / 40));
  }
}


function calculation(anchors, fresh_table) {
  // console.log(anchors);
  for (var i = 0; i < anchors.length; i++) {
    // console.log(fresh_table);
    // A1_dist = A3_dist = A4_dist = A5_dist = A6_dist = A7_dist = A8_dist = A9_dist = 999999999;
    // A2_dist = 999999999;
    anchors[i].dist = 999999999;
    for (var ii = 0; ii < fresh_table.length; ii++) {
      if (fresh_table[ii] == anchors[i].name) {
        anchors[i].dist = move_limit(i, anchors);
        // console.log(anchors[i].dist);
      }
      // if (fresh_table[i] === '01') {
      //   A1_dist = move_limit(array_01);
      // }
      // if (fresh_table[i] === '02') {
      //   A2_dist = move_limit(array_02);
      // }
      // if (fresh_table[i] === '03') {
      //   A3_dist = move_limit(array_03);
      //   // console.log(A3_dist);
      // }
      // if (fresh_table[i] === '04') {
      //   A4_dist = move_limit(array_04);
      // }
      // if (fresh_table[i] === '05') {
      //   A5_dist = move_limit(array_05);
      // }
      // if (fresh_table[i] === '06') {
      //   A6_dist = move_limit(array_06);
      // }
      // if (fresh_table[i] === '07') {
      //   A7_dist = move_limit(array_07);
      // }
      // if (fresh_table[i] === '08') {
      //   A8_dist = move_limit(array_08);
      // }
      // if (fresh_table[i] === '09') {
      //   A9_dist = move_limit(array_09);
      // }
    }
  }
  // A1_dist = move_limit(array_01);
  // A2_dist = move_limit(array_02);
  // A3_dist = move_limit(array_03);
  // A4_dist = move_limit(array_04);
  // A5_dist = move_limit(array_05);
  // A6_dist = move_limit(array_06);
  // A7_dist = move_limit(array_07);
  // A8_dist = move_limit(array_08);
  // A9_dist = move_limit(array_09);
  // A1_dist = anchors[0].dist;
  // A2_dist = anchors[1].dist;
  // A3_dist = anchors[2].dist;
  // A4_dist = anchors[3].dist;
  // A5_dist = anchors[4].dist;
  // A6_dist = anchors[5].dist;
  // A7_dist = anchors[6].dist;
  // A8_dist = anchors[7].dist;
  // A9_dist = anchors[8].dist;
  var x_up = 0;
  var x_down = 0;
  var y_up = 0;
  var y_down = 0;
  // Use the reciprocal of the distance to represent the proportion
  for (var w = 0; w < anchors.length; w++) {
    // x_up = x_down = y_up = y_down = 0;

    x_up += (anchors[w].x_label) * (1 / anchors[w].dist);
    x_down += (1 / anchors[w].dist);
    // console.log(anchors[w].dist+"123"+anchors[w].x_label,anchors[w].y_label);
    y_up += (anchors[w].y_label) * (1 / anchors[w].dist);
    y_down += (1 / anchors[w].dist);


  }
  // tag_x = ((1 / A1_dist) * 0 + (1 / A2_dist) * 5 + (1 / A3_dist) * 10 + (1 / A4_dist) * 15 + (1 / A5_dist) * 20 + (1 / A6_dist) * 25 + (1 / A7_dist) * 30 + (1 / A8_dist) * 35 + (1 / A9_dist) * 40) / ((1 / A1_dist) + (1 / A2_dist) + (1 / A3_dist) + (1 / A4_dist) + (1 / A5_dist) + (1 / A6_dist) + (1 / A7_dist) + (1 / A8_dist) + (1 / A9_dist));
  // tag_y = ((1 / A1_dist) * 0 + (1 / A2_dist) * 0 + (1 / A3_dist) * 0 + (1 / A4_dist) * 0 + (1 / A5_dist) * 0 + (1 / A6_dist) * 0 + (1 / A7_dist) * 0 + (1 / A8_dist) * 0 + (1 / A9_dist) * 0) / ((1 / A1_dist) + (1 / A2_dist) + (1 / A3_dist) + (1 / A4_dist) + (1 / A5_dist) + (1 / A6_dist) + (1 / A7_dist) + (1 / A8_dist) + (1 / A9_dist));

  tag_x = x_up / x_down;
  tag_y = y_up / y_down;
  // console.log(tag_x);
  // tag_y = ((1 / A1_dist) * A1_y  + (1 / A5_dist) * A5_y + (1 / A3_dist) * A3_y) / ((1 / A1_dist) + (1 / A5_dist) + (1 / A3_dist));
  // console.log(tag_x);
  array_y.push(tag_y);
  if (array_x.length >= 1) {
    if (tag_x - array_x[array_x.length - 1] > 2) {
      array_x.push(array_x[array_x.length - 1] + 2);
      // console.log("larget");
    } else if (array_x[array_x.length - 1] - tag_x > 2) {
      array_x.push(array_x[array_x.length - 1] - 2);
      // console.log("small");
    } else {
      array_x.push(tag_x);
      // console.log("suitable");
    }
  } else {
    array_x.push(tag_x);
  }
  console.log("4D00 is on: ( " + array_x[array_x.length - 1].toFixed(2) + " , " + tag_y.toFixed(2) + " )");

  var final_x = array_x[array_x.length - 1].toFixed(2);
  var final_y = tag_y.toFixed(2);
  var json = {
    x: final_x,
    y: final_y,
    timestamp: +new Date()
  }
  newjson = new coordinate(json);
  // console.log(jsonCMD);
  newjson.save(function(err) {
    if (!err) {
      // console.log("Success!");
    } else {
      console.log(err);
    }
  });

  // D6_y_array.push(D6_y);
  // D6_x_array.push(D6_x);
  // console.log(D6_x_array);
  // }
  // draw(tag_x, tag_y);
};

String.prototype.padLeft = function(len, char) {
  return this.length < len ? char + this : this
}
Array.prototype.remByVal = function(val) {
  for (var i = 0; i < this.length; i++) {
    if (this[i] === val) {
      this.splice(i, 1);
      i--;
    }
  }
  return this;
}

var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
var ARGUMENT_NAMES = /([^\s,]+)/g;

function getParamNames(func) {
  var fnStr = func.toString().replace(STRIP_COMMENTS, '');
  var result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
  if (result === null)
    result = [];
  return result;
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

//draw
// function draw(tag_x, tag_y) {
//
//   var trace1 = {
//     x: tag_x,
//     y: tag_y,
//     mode: "markers",
//     type: "scatter"
//   };
//   var trace2 = {
//     x: [A1_x, A2_x, A5_x, A3_x],
//     y: [A1_y, A2_y, A5_y, A3_y],
//     mode: "markers",
//     type: "scatter",
//     marker: {
//       color: "rgb(164, 194, 244)",
//       size: 12,
//       line: {
//         color: "white",
//         width: 0.5
//       }
//     }
//   };
//   var data = [trace1, trace2];
//   var graphOptions = {
//     filename: "basic-line",
//     fileopt: "overwrite"
//   };
//   plotly.plot(data, graphOptions, function(err, msg) {
//     console.log(msg);
//   });
//   // sleep.sleep(20);
// };
