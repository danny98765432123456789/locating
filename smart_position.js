
// Branch: develop Find file Copy pathsmartxlab-cloud/app/app/position.js

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let redis;
const _        = require('underscore');
const mongoose = require('mongoose');
const crypto   = require('crypto');
const security = require('./security');
let md5      = require('md5');
const moment   = require('moment');
const redis_obj = require('redis');
const Q        = require('q');
const Promise  = require("bluebird");
const cronjob  = require('cron').CronJob;
const util     = require('util');

mongoose.Promise = require('bluebird');

const config   = require('./config');
const incoming = require('./incoming');
const on_prem  = require('./on_prem');


const winston_logger = require('./logger');
const { logger } = winston_logger;
const { profiler } = winston_logger;

const Gateway  = mongoose.model('Gateway');
const Device   = mongoose.model('Device');
const Stream   = mongoose.model('Stream');
const User     = mongoose.model('User');

const {deployment_env, redis_host, redisPort, profile_logging, api_mqtt_password} = config;
const {
  encryptionEnabled,
  position_cron_job,
  triangulationThreshold,
  back_track_sec,
  response_frequency_sec,
  weighting_factor,
  time_btw_tracking_announcements,
  wait_time_btw_device_mqtt
  } = config;

if (redis_host === "localhost") {
  redis = redis_obj.createClient();
} else {
  console.log("Position trying to connect to redis", redis_host, redisPort);
  redis = redis_obj.createClient(redisPort, redis_host);
}



// promisify redis interface
Promise.promisifyAll(redis);

const mqtt     = require('mqtt');

// Starts CRON right away.
const cron_job = position_cron_job;

// This is used for the Kalman filter
const anti_jitter_range = 0.3;

//client = mqtt.connect 'tcp://127.0.0.1:1883'
const client = mqtt.connect('mqtt://127.0.0.1', {username: "api_server", password: api_mqtt_password});

client.on('connect', () => logger.info('Cloud server MQTT client connected for positioning'));


// !--- MQTT Broadcast ---

// This is the function that lets gateways send out MQTT messages.
const publish = function(gateway, payload, wait) {

  let key;
  let topic = gateway.hashed_mac + "_C";

  if (encryptionEnabled) {
    md5 = crypto.createHash('md5');
    key = md5.update(gateway.private_key).digest('base64');
    payload = security.encrypt(key, payload);
  }

  //console.log "topic, payload", topic, payload
  return setTimeout(()=>

    client.publish(topic, payload, {qos: 0, retain: false}, function(){

      //console.log "prepare_payload topic", topic, "payload", payload
      //logger.info "prepare_payload topic", topic, "payload", payload

      topic = null;
      gateway = null;
      payload = null;
      md5 = null;
      return key = null;
    })


  , wait);
};

// To start looking for a node, this function broadcasts the request via the network.
// device_id is device id, command_type can be position or track.
const prepare_payload = function(user_id, device_id, command_type, callback) {

  //logger.info device_id, command_type
  device_id = new mongoose.Types.ObjectId(device_id);
  user_id = new mongoose.Types.ObjectId(user_id);

  //logger.info user_id, device_id, command_type, callback

  return Device.findOne({_id: device_id}, function(err, device) {

    if (device === null) {
      //logger.info 'No device to position'
      if (typeof callback === "function") {
        err = {
          code: 204,
          msg: 'Cannot find device to position'
        };
        return callback(err);
      }
      return;
    }
    //gatewayId = device.gateway

    return User.find({ancestors: user_id})
    .exec()
    .then(function(users) {
      const owners = _.map(users, u => u._id);
      owners.push(user_id);
      //logger.info owners
      return Gateway.find()
        .where('owner')
        .in(owners)
        .exec()
        .then(function(gateways) {

          let sensorData;
          if (!gateways.length) {
            logger.error('No gateway to send command to', user_id, device_id, command_type);
            if (typeof callback === "function") {
              err = {
                code: 204,
                msg: 'Cannot find gateway to send command to'
              };
              return callback(err);
            }
            return;
          }

          // Prepare the sensor data.

          // this converts the endianess
          const device_mac_reversed = String(device.mac).match(/.{1,2}/g).reverse().join("");
          const device_mac_reversed_number = parseInt(device_mac_reversed, 16);

          //logger.info device_id_arr
          //logger.info "converted:"+device_mac_reversed
          // sends out the query command.

          if (command_type === 'position') {

            sensorData = device_mac_reversed_number;

          } else if (command_type === 'track') {

            sensorData = device_mac_reversed_number + (65536 * 256 * response_frequency_sec) + 65536;

          } else if (command_type === 'stop') {

            sensorData = device_mac_reversed_number + (65536*2);
          }

          const payload = JSON.stringify({
            cmd: 'broadcast',
            sensorType: '0',
            sensorData
          });

          // Getting ready to publish

          const wait = 0;
          // Publish to each gateway under a user's account.
          _.each(gateways, gateway=> publish(gateway, payload, wait));

          if (typeof callback === "function") {
            return callback(null);
          }}).then(null, function(err) {
          if (typeof callback === "function") {
            return callback(err);
          }
      });}).then(null, function(err) {
      if (typeof callback === "function") {
        return callback(err);
      }
    });
  });
};


// To start looking for a node, this function broadcasts the request via the network.
// device_id is device id, command_type can be position or track.
const prepare_multi_payload = function(user_id, device_mac_arr, command_type, callback) {

  //logger.info device_id, command_type
  user_id = new mongoose.Types.ObjectId(user_id);

  //logger.info user_id, device_id, command_type, callback

  return User.find({ancestors: user_id})
  .exec()
  .then(function(users) {
    const owners = _.map(users, u => u._id);
    owners.push(user_id);
    //logger.info owners

    // Only pings gateways that are shown alive in the last 5 minutes (300000 ms).
    const timestamp_unix_ms = moment().valueOf();
    const timestamp_alive = timestamp_unix_ms - 300000;

    return Gateway.find()
    .where('owner')
    .in(owners)
    .where('timestamp')
    .gt(timestamp_alive)
    .exec()
    .then(function(gateways) {

      //console.log("gateways", gateways);

      if (gateways.length == 0) {

        //console.log('No gateway to send command to, by user_id:', user_id);

        if (typeof callback === "function") {
          const err = {
            code: 204,
            msg: 'Cannot find gateway to send command to.'
          };
          return callback(err);
        }
        return;
      }

      // Prepare the sensor data.
      let wait = 0;

      _.each(device_mac_arr, function(device_mac){

        //console.log (device_id)
        // this converts the endianess
        let sensorData;
        const device_mac_reversed = String(device_mac).match(/.{1,2}/g).reverse().join("");

        //console.log device_mac_reversed, device_mac_reversed

        const device_mac_reversed_number = parseInt(device_mac_reversed, 16);

        //logger.info device_id_arr
        //logger.info "converted:"+device_mac_reversed
        // sends out the query command.

        if (command_type === 'position') {

          sensorData = device_mac_reversed_number;

        } else if (command_type === 'track') {

          sensorData = device_mac_reversed_number + (65536 * 256 * response_frequency_sec) + 65536;

        } else if (command_type === 'stop') {

          sensorData = device_mac_reversed_number + (65536*2);
        }

        const payload = JSON.stringify({
          cmd: 'broadcast',
          sensorType: '0',
          sensorData
        });

        wait = wait + wait_time_btw_device_mqtt;
        // Getting ready to publish
        // Publish to each gateway under a user's account.
        return _.each(gateways, gateway=> publish(gateway, payload, wait));
      });

      if (typeof callback === "function") {
        return callback(null);
      }
      })
      .then(null, function(err) {
      if (typeof callback === "function") {
        return callback(err);
      }
    });}).then(null, function(err) {
    if (typeof callback === "function") {
      return callback(err);
    }
  });
};

// This function prepares all tracked devices for MQTT broadcast
const collect_tracked_devices_for_mqtt = function(callback){

  // Find traccked devices.
  const device_groups = _.groupBy(devices_mobile, device=> device.user);

  //console.log "device_groups",  device_groups

  _.each(device_groups, function(device_group, user_id){

    const device_mac_arr = _.map(device_group, device=> device.mac.substring(0, 4));

    //console.log(device_mac_arr);

    return prepare_multi_payload(user_id, device_mac_arr, "track", function(err){
      if (err) {
        return logger.error(err);
      }
    });
  });

  if (typeof callback === "function") {
    return callback();
  }
};


// !--- Redis Access ---

//logger.info 'device_id_arr', device_id_arr
// A function used to access Redis, and returns the record information.
const access_redis = function(redis_hash_key, signal_obj_single){

  const deferred = Q.defer();

  redis.zrevrange(redis_hash_key, 0, -1, "withscores", function(err, res){

    //console.log res
    //console.log "redis_hash_key", redis_hash_key

    //signal_obj_single.test = redis_hash_key
    //console.log "signal_obj_single.count inside", signal_obj_single.count
    if (err) {
      deferred.reject(err);
    }

    if (res.length > 0) {

      let i = 0;

      while (i < res.length) {

        const single_record = {
          'anchor': res[i],
          'data': Number(res[i+1])
        };

        //console.log "single_record",single_record

        signal_obj_single.all_records.push(single_record);
        signal_obj_single.rssi_sum = signal_obj_single.rssi_sum + Number(res[i+1]);
        signal_obj_single.count++;
        signal_obj_single.anchor_arr.push(res[i]);

        i = i + 2;
      }
    }

    return deferred.resolve(signal_obj_single);
  });

  return deferred.promise;
};

      //console.log "signal_obj_single.count", signal_obj_single.count
      //console.log "signal_obj_single inside", signal_obj_single

// A recursive function to solve the async issues.
var recursive_redis_access = function(query_start_time, now_time, device_id_master, signal_obj_single, callback){

  if ((query_start_time === now_time) && (typeof(callback) === "function")) {

    callback(null, signal_obj_single);
    return signal_obj_single = null;

  } else {

    const redis_hash_key = `position:device:${device_id_master}:time:${query_start_time}`;

    //logger.info "redis_hash_key", redis_hash_key
//     logger.info "signal_obj_single", signal_obj_single

    const promise = access_redis(redis_hash_key, signal_obj_single);

    return promise.then(function(signal_obj_single){

      //console.log "device_id_master", device_id_master, "signal_obj_single", signal_obj_single

      query_start_time = query_start_time + 1000;
      return recursive_redis_access(query_start_time, now_time, device_id_master, signal_obj_single, callback);
    });
  }
};

// Instead of using recursion, we use Map to iterate through the array.
const promisified_redis_access = function(query_start_time, now_time, device_id_master, signal_obj_single, callback){

  // Build an array with times to query
  if (!query_start_time || !now_time) {
    logger.error("promisified_redis_access query_start_time or now_time is null");
    return;
  }

  const time_arr = [];
  let time_added = query_start_time;

  while (time_added <= now_time) {
    time_arr.push(time_added);
    time_added = time_added + 1000;
  }

  // Use Bluebird to map through this array
  //console.log 'Calling promise map on ' + time_arr
  return Promise.map(time_arr, function(query_time){
    const redis_hash_key = `position:device:${device_id_master}:time:${query_time}`;

    //console.log "redis_hash_key at promisified_redis_access", redis_hash_key

    //redis.zrevrange redis_hash_key, 0, -1, "withscores", (err, res)->
    //  console.log "redis.zrevrange", err, res

    //redis.zadd(redis_hash_key, 1, 2)

    return redis.zrevrangeAsync(redis_hash_key, 0, -1, "withscores");
  }).then(function(redis_results){
    //console.log 'Promise map returned', redis_results

    _.each(redis_results, function(res, key){

      //console.log('Redis key ' + key + ' has value ' + res);

      if (res.length > 0) {

        const splitted = _.groupBy(res, (v, i)=> {return i % 2});
        const anchors = splitted[0] || [];
        const data = _.map(splitted[1], v=> Number(v)) || [];

        //console.log 'Splitted ', splitted, anchors, data

        signal_obj_single.all_records = signal_obj_single.all_records.concat(_.map(anchors, (v, i) => ({anchor: v, data: data[i]})));
        signal_obj_single.rssi_sum += _.reduce(data, ((sum, d) =>{ return sum + d}), 0);
        signal_obj_single.count += data.length;
        return signal_obj_single.anchor_arr = signal_obj_single.anchor_arr.concat(anchors);
      }
    });

      //console.log 'Summarized ' + JSON.stringify(signal_obj_single)

    //console.log "signal_obj_single", signal_obj_single

    return callback(null, signal_obj_single);
  });
};

// Builds two arrays of devices that are mobile or anchors.
let devices_mobile = [];
let devices_anchor = [];

const populate_devices = function(){

  devices_mobile = [];
  devices_anchor = [];

  // Find all the mobile nodes that are being tracked.
  Device.find({
    is_mobile: true,
    is_tracked: true
  })
  .sort({user: 1})
  .exec()
  .then(function(devices_mobile_found) {
    devices_mobile = devices_mobile_found;
  });

  Device.find({
    "is_mobile": false,
    "latlng.lng": {
        $ne: null
      }
  })
  .sort({'mac' : 1})
  .exec()
  .then(function(devices_anchor_found) {
    //console.log("devices_anchor_found", devices_anchor_found);
    devices_anchor = devices_anchor_found;

  });

  return;
};

// To save one trip to MongoDB, search for a mobile node from devices_mobile.
const find_one_mobile = function(mac, callback){

  if (!mac) {
    var err = "find_one_mobile cannot locate a device with no mac".
    callback(err, null);
    return;
  }

  const mobile_device = _.findWhere(devices_mobile, {mac: mac});

  if (mobile_device === null) {
    callback(null, null);
    return;
  } else if (mobile_device) {
    callback(null, mobile_device);
    return;
  }
};

// Finds mobile devices that appear recently in the redis database.  Only search these for positioning.
const find_recent_mobile = function(callback){

  if (devices_mobile.length > 0) {

    let recent_mob_devices = [];

    return Promise.map(devices_mobile, function(device){

      const redis_mobile_device_list_key = `position:device:mobile:${device._id}`;

      //console.log "redis_mobile_device_list_key", redis_mobile_device_list_key

      return redis.getAsync(redis_mobile_device_list_key);
  }).then(function(redis_results){

      //console.log redis_results

      recent_mob_devices = [];

      recent_mob_devices = _.filter(devices_mobile, device=> {return _.contains(redis_results, device._id.toString())});

      //console.log "recent_mob_devices", recent_mob_devices.length
      return callback(null, recent_mob_devices);
    });
  }
};


// Computed position could be coming from on-premise PCs, or GPS watches.
const record_computed_position = function (deviceId, data, owner) {

  const cmd = "log";
  const sensorId = "300";
  const sensorType = 300;

  const signal_obj = {
    'id': deviceId,
    'plot': data[2],
    'latlng': {
      'lat': data[0],
      'lng': data[1]
            },
    'weight': 100
  }

  record_position(signal_obj);

};


// !--- Algorithms for Positioning and Tracking.

// The core calculation algorithm
const algorithm = function(all_records, rssi_mean, callback) {

  // Finds the highest RSSI record
  let device_id_arr = [];
  let lowest_rssi_record = all_records[0];
  // diff_sum = 0
  let all_records_unique = [];

  //logger.info "all_records", all_records

  // Make sure that all_records are unique.  If not unique, puts more weight on the newer data.
  for (var record of Array.from(all_records)) {

    //logger.info "record", record

    let unique = true;

    for (let uniq_record of Array.from(all_records_unique)) {
      if (String(record.anchor) === String(uniq_record.anchor)) {
        unique = false;
        uniq_record.data = (uniq_record.data * (1/4)) + (record.data * (3/4));
        if (uniq_record.data < lowest_rssi_record.data) {
          lowest_rssi_record = uniq_record;
        }
      }
    }

    if (unique === true) {
      all_records_unique.push(record);
      device_id_arr.push(record.anchor);
      if (record.data < lowest_rssi_record.data) {
        lowest_rssi_record = record;
      }
    }
  }


  //logger.info 'all_records_unique', all_records_unique

  // Calculating standard deviation stdev
  // stdev = Math.pow((diff_sum / all_records_unique.length), 0.5)

  // Calculating standard stadard deviation
  // stdstdev = stdev / rssi_mean

  // This is the K, dependent on stdstdev
  const stdstdev_weighting = 0;

  // Collapse the all_records_unique


//   logger.info 'stdev: ', stdev, ', stdstdev: ', stdstdev
//   logger.info 'device_id_arr: ', device_id_arr

  //To do, select only devices that belong to user.
  return Device.find({
    mac: {
      $in: device_id_arr
    }
  })
  .exec()
  .then(function(devices) {

    let fixed_node, highest_rssi_lat, highest_rssi_lng, sum_weighting, weighted_sum_lat, weighted_sum_lng;
    if (!devices.length) {
      if (typeof callback === "function") {
        const err = {
          code: 404,
          msg: 'Cannot find anything in Devices'
        };
        return callback(err, null);
      }
      return;
    }

    //console.log 'devices: ', devices

    let weighting_arr = [];
    let weighting_denominator = 0;
    let count = 0;
    let sum_lng = 0;
    let sum_lat = 0;

    for (let device of Array.from(devices)) {

      fixed_node = {
        device_id: device._id,
        mac: device.mac,
        plot: device.plot,
        rssi: 0,
        weight: 0,
        lng: device.latlng.lng,
        lat: device.latlng.lat
      };

      // Calculates the weighting of anchors
      for (record of Array.from(all_records_unique)) {
        if (String(record.anchor) === String(device.mac)) {

          fixed_node.rssi = record.data;

          if (all_records_unique.length === 1) {
            fixed_node.weight = 1;
          } else {
            fixed_node.weight = Math.pow(Math.abs(record.data - lowest_rssi_record.data), (weighting_factor + stdstdev_weighting));
          }
        }
      }

          //weighting_denominator = weighting_denominator + fixed_node.weight

      weighting_arr.push(fixed_node);
    }

    // work out the plot the node is on.

    // Group the weighting arrays by plot.
    let weighting_arr_groups = _.groupBy(weighting_arr, fixed_node=>{return String(fixed_node.plot)});

    //logger.info "weighting_arr_groups", weighting_arr_groups

    let weighted_plots = [];

    // Go through each weighting array group and sum up the weights.
    _.each(weighting_arr_groups, function(weighting_arr_group, key){

      let sum_weight = 0;

      _.each(weighting_arr_group, fixed_node=> sum_weight = sum_weight + fixed_node.weight);

      const weighted_plot = {
        plot: key,
        weight: sum_weight
      };

      return weighted_plots.push(weighted_plot);
    });

    // Use the top node's map.
    // This decides which floor/plot the node is on.
    let heaviest_fixed_node = _.max(weighted_plots, weighted_plot => {return weighted_plot.weight});

    //logger.info 'heaviest_fixed_node', heaviest_fixed_node, 'weighted_plots', weighted_plots

    let trimmed_weighting_array = [];

    for (fixed_node of Array.from(weighting_arr)) {

      //logger.info 'fixed_node', fixed_node

      if ((fixed_node.plot === !null) || (String(fixed_node.plot) === String(heaviest_fixed_node.plot))) {
        // reject nodes that are not on the right map.

        highest_rssi_lng = fixed_node.lng;
        highest_rssi_lat = fixed_node.lat;
        //logger.info 'highest_rssi_lng:', highest_rssi_lng, ', highest_rssi_lat:', highest_rssi_lat

        count++;
        sum_lng = sum_lng + fixed_node.lng;
        sum_lat = sum_lat + fixed_node.lat;

        trimmed_weighting_array.push(fixed_node);
      }
    }

    //logger.info 'all_records_unique', all_records_unique
    //logger.info 'weighting_arr', weighting_arr, "trimmed_weighting_array", trimmed_weighting_array

    let lng_avg = sum_lng / count;
    let lat_avg = sum_lat / count;

    if ((highest_rssi_lng !== 0) && (highest_rssi_lng !== undefined)) {

      // generating some randomness
      const random_lng = ((highest_rssi_lng - lng_avg) * (Math.random() * (1/4))) - (1/8);
      const random_lat = ((highest_rssi_lat - lat_avg) * (Math.random() * (1/4))) - (1/8);

      //random_lng = random_lat = 0

      //logger.info 'random_lng', random_lng

      weighted_sum_lng = 0;
      weighted_sum_lat = 0;
      sum_weighting = 0;

      // Now, multiply every fixed node's weight to its coordinate and add them up.
      for (fixed_node of Array.from(trimmed_weighting_array)) {

        weighted_sum_lng = weighted_sum_lng + (fixed_node.weight * fixed_node.lng);
        weighted_sum_lat = weighted_sum_lat + (fixed_node.weight * fixed_node.lat);

        //logger.info 'fixed_node.weight: ', fixed_node.weight

        sum_weighting = sum_weighting + fixed_node.weight;
      }


      //logger.info 'sum_weighting: ', sum_weighting

      lng_avg = (weighted_sum_lng/sum_weighting) + random_lng;
      lat_avg = (weighted_sum_lat/sum_weighting) + random_lat;
    }

//             if number_of_usable_records > 1
//
//               lng_avg = ((lng_avg + highest_rssi_lng) / 2) + random_lng
//               lat_avg = ((lat_avg + highest_rssi_lat) / 2 ) + random_lat
//
//             else if number_of_usable_records == 1
//               lng_avg = ((3/4)*highest_rssi_lng) + ((1/4)*lng_avg) + random_lng
//               lat_avg = ((3/4)*highest_rssi_lat) + ((1/4)*lat_avg) + random_lat
//
//             else
//               lng_avg = lng_avg + random_lng
//               lat_avg = lat_avg + random_lat

    let timestamp_unix_ms = moment().valueOf();

    const latlng = {
      plot: heaviest_fixed_node.plot,
      timestamp: timestamp_unix_ms,
      lng: lng_avg,
      lat: lat_avg
    };

    //console.log "latlng", latlng

    //logger.info 'latlng', latlng

    // CLEAN UP
    device_id_arr = null;
    lowest_rssi_record = null;
    heaviest_fixed_node = null;
    timestamp_unix_ms = null;
    all_records_unique = null;
    devices = null;
    weighting_arr = null;
    weighting_denominator = null;
    count = null;
    sum_lng = null;
    sum_lat = null;
    weighted_sum_lng = null;
    weighted_sum_lat = null;
    sum_weighting = null;
    trimmed_weighting_array = null;
    lng_avg = null;
    lat_avg = null;
    weighted_plots = null;
    const weighted_plot = null;
    weighting_arr_groups = null;
    fixed_node = null;
    highest_rssi_lng = null;
    highest_rssi_lat = null;
    const key = null;
    const sum_weight = null;

    if (typeof callback === "function") {
      return callback(null, latlng);
    }
    }).then(null, function(err) {
    logger.error("Algorithm error");
    if (typeof callback === "function") {
      return callback(err, null);
    }
  });
};

const position = function(device_id, query_start_time, callback) {

  let promises;
  let from_time_second = moment(query_start_time, 'x').startOf('second').valueOf();
  const now_time_second = moment().startOf('second').valueOf();

//   console.log "time", from_time_second, now_time_second

  // Redis only keeps track of times less than 10 seconds.
  if ((now_time_second - from_time_second) > 10000) {
    from_time_second = now_time_second - 10000;
  }

  // To capture anchors
  const anchor_arr = [];

  const signal_obj_single = {
    id: device_id,
    all_records: [],
    rssi_sum: 0,
    count: 0,
    rssi_mean: 0,
    plot: "", // this field is calculated.  Only anchors have assigned plots.
    latlng: {}, // this field is calculated.
    anchor_arr: []
  };

  // find data from query_start_time
  while (from_time_second <= now_time_second) {

    const redis_hash_key = `position:device:${device_id}:time:${from_time_second}`;

    //console.log "redis_hash_key position", redis_hash_key

    promises = access_redis(redis_hash_key, signal_obj_single);

    from_time_second = from_time_second + 1000;
  }

  return Q.all(promises)
    .then(function(signal_obj_single){

      //logger.info "signal_obj_single", signal_obj_single

      if (signal_obj_single.count <= 0) {

        // Nothing found.
        if (typeof callback === "function") {
          const err = {
            code: 404,
            msg: "There is no record in the stream"
          };
          return callback(err, null);
        }
        return;

      } else { // signal_obj_single.count > 0

        signal_obj_single.rssi_mean = signal_obj_single.rssi_sum / signal_obj_single.count;

        //logger.info "signal_obj_single", signal_obj_single

        return algorithm(signal_obj_single.all_records, signal_obj_single.rssi_mean, function(err, latlng) {

          if (err) {
            if (typeof callback === "function") {
              return callback(err, null);
            }
            return;
          } else {
            if (typeof callback === "function") {
              return callback(null, latlng);
            }
            return;
          }
        });
      }
  });
};

const track = function(device_id_arr, callback) {

  // Use 3 seconds in this continuous tracking mode.
  let now_time;
  if ((back_track_sec === undefined) || (back_track_sec === 0) || (back_track_sec === null)) {
    back_track_sec = 4;
  }

  // console.log "now_time", now_time

  if ((now_time === undefined) || (now_time === null) || (now_time === 0) || _.isNaN(now_time)) {
    now_time = moment().startOf('second').valueOf();
  }

  const query_start_time = ((now_time) - (1000 * back_track_sec));


  //logger.info 'query_start_time', query_start_time, 'from_time_hour', from_time_hour

  //mongoose.set('debug', true)
  //this holds all the data in a device_id: format
  const signal_obj = {};

  //logger.info 'device_id_arr', device_id_arr

  //build the device_id object of arrays.
  return device_id_arr.forEach(function(device_id_master){

    const anchor_arr = [];
    let signal_obj_single = null;
    signal_obj_single = {
      // storing records of above threshold RSSI records for triangulation
      all_records: [],
      rssi_sum: 0,
      count: 0,
      name: "",
      id: "",
      rssi_mean: 0,
      latlng: {}
    };

    return recursive_redis_access(query_start_time, now_time, device_id_master, signal_obj_single, function(err, signal_obj_single){

      if (signal_obj_single.count > 0) {
        signal_obj_single.rssi_mean = signal_obj_single.rssi_sum / signal_obj_single.count;
        signal_obj[device_id_master] = signal_obj_single;
      }

      //logger.info "records.length", records.length

        //logger.info "628"

      if (_.size(signal_obj) > 0) {
        //logger.info 'position: signal_obj', signal_obj
        const signal_obj_keys = _.keys(signal_obj);

        //logger.info "signal_obj_keys", signal_obj_keys

        const signal_obj_length = signal_obj_keys.length;
        const i = 0;

        // Using recursion to crawl through the tree.

        var recursive_fcn = function(signal_obj, signal_obj_keys, signal_obj_length, i, callback) {

          if ((i === signal_obj_length) && (typeof callback === "function")) {
            //logger.info 'device_id_arr: ', device_id_arr
            //logger.info 'position: signal_obj', signal_obj
            return callback(null, signal_obj);
          }

          const { all_records } = signal_obj[signal_obj_keys[i]];

          // Get the highest rssi record.
          if (signal_obj[signal_obj_keys[i]].count > 0) {

            const rssi_mean = signal_obj[signal_obj_keys[i]].rssi_sum / signal_obj[signal_obj_keys[i]].count;

            //logger.info 'all_records', all_records, 'rssi_mean', rssi_mean

            return algorithm(all_records, rssi_mean, function(err, latlng) {

              if (err) {
                if (typeof callback === "function") {
                  return callback(err, null);
                }
                return;
              }

              signal_obj[signal_obj_keys[i]].latlng = latlng;

              //logger.info 'signal_obj[signal_obj_keys[i]].latlng', signal_obj[signal_obj_keys[i]].latlng

              //if isNaN(latlng.lng)
                //logger.info "NaN all_records: "
                //logger.info signal_obj[signal_obj_keys[i]].all_records

              const time_hour = moment().startOf('hour');
              const time_min = moment().minutes();
              const time_sec = moment().seconds();

              const setModifier = { $set : {}};

              setModifier.$set['latest.timestamp'] = moment();
              setModifier.$set['latest.data'] = signal_obj[signal_obj_keys[i]].latlng;
              setModifier.$set[`timestamp_data.${time_min}.${time_sec}.latlng.lng`] = signal_obj[signal_obj_keys[i]].latlng.lng;
              setModifier.$set[`timestamp_data.${time_min}.${time_sec}.latlng.lat`] = signal_obj[signal_obj_keys[i]].latlng.lat;
              setModifier.$set[`timestamp_data.${time_min}.${time_sec}.plot`] = signal_obj[signal_obj_keys[i]].latlng.plot;

              //logger.info 'timestamp_data.'+time_min+'.'+time_sec+'.latlng.lng'+signal_obj[device_id].latlng.lng

              //logger.info "latlng.lng", signal_obj[device_id].latlng.lng, "lat", signal_obj[device_id].latlng.lat

              device_id_master = new mongoose.Types.ObjectId(device_id_master);

              //mongoose.set('debug', true)
              // Save the coordinate data back into time series stream
              Stream.update(
                //find record items
                {'timestamp_hour': time_hour,
                'device': signal_obj_keys[i],
                'cmd': 'log',
                'sensor._id': '0',
                'sensor.function_type': 0
                },
                setModifier,
                {upsert: true}
              ).exec()
              .then(stream=> logger.info('Position written back to stream', stream)).then(null, err=> logger.info('err', err));

              signal_obj[signal_obj_keys[i]].all_records = [];
              // logger.info 'latlng', latlng
              // resets some fields to save bandwidth

              i++;

              return recursive_fcn(signal_obj, signal_obj_keys, signal_obj_length, i, callback);
            });
          }
        };

        return recursive_fcn(signal_obj, signal_obj_keys, signal_obj_length, i, callback);
      }
    });
  });
};

// This is CRON based track.
const bulktrack = function(now_time, back_track_sec, callback) {

  // This Function does not take a user id, as this tracks all the nodes that are being tracked in the system.

  // Use 3 minutes in this continuous tracking mode.
  if ((back_track_sec === undefined) || (back_track_sec === 0) || (back_track_sec === null)) {
    back_track_sec = 10;
  }

  // console.log "now_time", now_time

  if ((now_time === undefined) || (now_time === null) || (now_time === 0) || _.isNaN(now_time)) {
    now_time = moment().startOf('second').valueOf();
  }

  let query_start_time = ((now_time) - (1000 * back_track_sec));

  // console.log 'query_start_time', query_start_time, 'from_time_hour', from_time_hour
  // mongoose.set('debug', true)

  // this holds all the data in a device_id: format
  const signal_obj = {};
  back_track_sec = null;

  // To capture mobile nodes with no data.
  // missing_mobile_nodes = []

  // console.log "devices_mobile", devices_mobile
  // console.log "devices_anchor", devices_anchor

  return find_recent_mobile(function(err, recent_mob_devices){

    if (err || (recent_mob_devices.length <= 0)) {
      // This means that there are no devices set to being mobile in the database, so nothing to track.

      if (typeof callback === "function") {
        err = {
          code: 404,
          msg: 'There are no mobile nodes to track (devices_mobile.length <= 0).'
        };
        return callback(err, null);
      }
      return;
    }

    // There are mobile devices set to track in the database.

    //build the device_id object of arrays.
    return recent_mob_devices.forEach(function(device){

      const device_id_master = String(device._id);

      //console.log "device_id_master", device_id_master

      // To capture anchors
      let signal_obj_single = null;
      signal_obj_single = {
        all_records: [],
        rssi_sum: 0,
        count: 0,
        anchor_arr: []
      };

      return promisified_redis_access(query_start_time, now_time, device_id_master, signal_obj_single, function(err, signal_obj_single){

        query_start_time = null;
        now_time = null;

        //logger.info "signal_obj_single done", signal_obj_single

        signal_obj[device_id_master] = {
          id: device_id_master,
          name: device.name,
          owner: device.user,
          all_records: signal_obj_single.all_records,
          all_records_uniq: [],
          rssi_sum: signal_obj_single.rssi_sum,
          count: signal_obj_single.count,
          rssi_mean: 0,
          plot: "", // this field is calculated.  Only anchors have assigned plots.
          latlng: {} // this field is calculated.
        };

        signal_obj_single = null;

        //logger.info "signal_obj[device_id_master]", device_id_master, signal_obj[device_id_master]
        //console.log("1153 signal_obj[device_id_master]", device_id_master, signal_obj[device_id_master]);

        if (signal_obj[device_id_master].count <= 0) {
          // It means that this device has not been heard by the anchors in the past few seconds.

          // capture nodes with no data.
          //missing_mobile_nodes.push(device)
          // remove where signal object has no data to report.
          logger.info("signal_obj deleted as no data received", device_id_master);

          delete signal_obj[device_id_master];

          if (typeof callback === "function") {
            err = {
              code: 204,
              msg: 'Does not have any information for Device to find (signal_obj[device_id_master].count <= 0).'
            };
            return callback(err, null);
          }

        } else {
          // It means that this mobile device was heard by at least one anchor.

          let matching_anchor, weight;
          signal_obj[device_id_master].rssi_mean = signal_obj[device_id_master].rssi_sum / signal_obj[device_id_master].count;

          //logger.info "signal_obj[device_id_master].count", signal_obj[device_id_master].count
          //logger.info "signal_obj[device_id_master]", signal_obj[device_id_master]

          // We will find all the devices from all the mobile nodes that are being tracked.
          // This gets an array of all the device_ids that are being tracked.

          let lowest_rssi_record = signal_obj[device_id_master].all_records[0];
          // diff_sum = 0
          let all_records_unique = [];

          //console.log("signal_obj", signal_obj);
          //console.log signal_obj[device_id].all_records

          signal_obj[device_id_master].all_records.forEach(function(record){
            // Make sure that all_records are unique.

            //console.log "record", record
            let unique = true;


            _.map(all_records_unique, (uniq_record)=>{

              if (String(record.anchor) === String(uniq_record.anchor)) {
                unique = false;
                // If this data entry is not unique, we need to do historical averaging.
                // We put 1/4 weight on older data.
                // If we need to lengthen the amount of time, the historical data would be weighted less (exponentially).
                uniq_record.data = (uniq_record.data * (1/4)) + (record.data * (3/4));
                if (uniq_record.data < lowest_rssi_record.data) {
                  lowest_rssi_record = uniq_record;
                }
              }
            });

            if (unique === true) {
              all_records_unique.push(record);
              if (record.data < lowest_rssi_record.data) {
                lowest_rssi_record = record;
              }
            }

            return unique = null;
          });

            //logger.info 'device_id_arr', device_id_arr
            // diff_sum = diff_sum + Math.pow((record.data - signal_obj[device_id].rssi_mean), 2)

          signal_obj[device_id_master].all_records_uniq = all_records_unique;

          //console.log "all_records_unique", all_records_unique

          //console.log("1230 signal_obj[device_id_master]", signal_obj[device_id_master]);

          // logger.info "all_records_unique", all_records_unique

          // logger.info 'device_id', device_id, 'all_records_unique', all_records_unique, "lowest_rssi_record.data", lowest_rssi_record.data

          // Calculating standard deviation stdev
          // stdev = Math.pow((diff_sum / all_records_unique.length), 0.5)
          // logger.info 'stdev', stdev

          // Calculating standard stadard deviation
          // stdstdev = stdev / signal_obj[device_id].rssi_mean
          // logger.info 'stdstdev', stdstdev

          // This is the K, dependent on stdstdev
          const stdstdev_weighting = 0;
          let weighting_arr = [];

          //logger.info "signal_obj 0", signal_obj[device_id_master]

          //console.log "all_records_unique", all_records_unique

          _.map(all_records_unique, (record)=>{
            // Now, go through the unique records, and maps it into an anchor array.
            // We may have a situation where some anchors without associated devices show up.
            // This step would remove those anchors, as they would have no latlng.

            //logger.info "record", record

            // If there is only one unique anchor data, weight should be just 1.
            if (all_records_unique.length <= 1) {
              weight = 1;
            } else {
              // This power function adds weights to the strongest anchors.
              weight = Math.pow(Math.abs(record.data - lowest_rssi_record.data), (weighting_factor + stdstdev_weighting));
            }

              // We may have a problem here: lowest rssi record may be on a different floor/ plot.

            matching_anchor = null;

            //console.log "devices_anchor", devices_anchor

            //console.log "record.anchor", record.anchor

            //console.log("1275 devices_anchor", devices_anchor);
            //console.log("1275 device_id_master", device_id_master, "device.mac", device.mac, "record.anchor", record.anchor );

            matching_anchor = _.find(devices_anchor, (device_anchor)=> {
              //console.log("1279 device_id_master", device_id_master, "1279 device_anchor.mac", device_anchor.mac, "record.anchor", record.anchor);
              return String(device_anchor.mac) === String(record.anchor);
            });

            if (matching_anchor) {

              const weighted_record = {
                weight,
                rssi: record.data,
                anchor: matching_anchor
              };

              //console.log("matching_anchor", matching_anchor);

              weighting_arr.push(weighted_record);
            }

            return;

          });


          // Get the first device that matches the anchor on record.

          //console.log("1293 weighting_arr", weighting_arr);

          matching_anchor = null;
          lowest_rssi_record = null;
          weight = null;
          all_records_unique = null;

          if (weighting_arr.length > 0) {

            //console.log "weighting_arr", weighting_arr

            // We need to find the plot that the node is on, and then reject all signals from other nodes
            // This also helps us find the highest RSSI record with a coordinate.
            let heaviest_weighted_record = _.max(weighting_arr, (weighted_record)=>{return weighted_record.weight});



            //logger.info "heaviest_weighted_record", heaviest_weighted_record

            const heaviest_weighted_plot = heaviest_weighted_record.anchor.plot;
            const highest_rssi_lng = heaviest_weighted_record.anchor.latlng.lng;
            const highest_rssi_lat = heaviest_weighted_record.anchor.latlng.lat;

            //console.log "heaviest", heaviest_weighted_record.anchor.device

            //console.log "weighting_arr", weighting_arr
            //console.log "highest_rssi_record.anchor", highest_rssi_record.anchor

            let weighted_sum_lng = 0;
            let weighted_sum_lat = 0;
            let sum_weighting = 0;
            heaviest_weighted_record = null;

            _.map(weighting_arr, (record)=>{
              //console.log "weight", record.weight, "device", record.anchor.device

              if ((record !== null) && (String(record.anchor.plot) === String(heaviest_weighted_plot)) && (record.weight > 0)) {

                //console.log "record.anchor._id filtered", record.anchor._id

                // Now, multiply every fixed node's weight to its coordinate and add them up.
                weighted_sum_lng = weighted_sum_lng + (record.weight * record.anchor.latlng.lng);
                weighted_sum_lat = weighted_sum_lat + (record.weight * record.anchor.latlng.lat);

                // logger.info 'weight: ', weight, "matching_anchor.latlng.lng", matching_anchor.latlng.lng

                //if matching_anchor.latlng.lng is null
                  //logger.info "null x anchor: ", record.anchor
                  //logger.info "anchors: ", anchors

                sum_weighting = sum_weighting + record.weight;

                return;
              }
            });

                // Find the latlng of the highest record
                //console.log "record.anchor.device", record.anchor.device
                //console.log "highest_rssi_record.anchor", highest_rssi_record.anchor
                //console.log "record.anchor.latlng.lng", record.anchor.latlng.lng

                //console.log "record.anchor.device", record.anchor.device, highest_rssi_record.anchor

  //                     if String(record.anchor.device) == String(highest_rssi_record.anchor)
  //                       highest_rssi_lng = record.anchor.latlng.lng
  //                       highest_rssi_lat = record.anchor.latlng.lat

              //else
                //console.log "record.weight", record.weight, "record.anchor.device", record.anchor.device
                //console.log "record", record
            //console.log("sum_weighting", signal_obj[device_id_master].name, sum_weighting);

            if (sum_weighting === 0) {

              logger.info('sum_weighting', sum_weighting);
              //logger.info 'weighting_arr', weighting_arr

            } else if (sum_weighting > 0) {

              // Start calcualting position.

              //console.log "weighted_sum_lng", weighted_sum_lng
              //console.log 'sum_weighting', sum_weighting
              //console.log 'weighting_arr', weighting_arr


              let lng_avg = (weighted_sum_lng/sum_weighting);
              let lat_avg = (weighted_sum_lat/sum_weighting);

              weighted_sum_lng = null;
              weighted_sum_lat = null;

              let random_factor_for_lng = (Math.random() * (1/4)) - (1/8);
              let random_factor_for_lat = (Math.random() * (1/4)) - (1/8);

              //console.log "random_factor_for_lng", random_factor_for_lng

              // generating some randomness
              let random_lng = (highest_rssi_lng - lng_avg) * random_factor_for_lng;
              let random_lat = (highest_rssi_lat - lat_avg) * random_factor_for_lat;

              // Here we may have a problem, where if there is only one anchor, there is no randomness.
              // Therefore, we need to introduce some randomness.
              if ((highest_rssi_lng - lng_avg) === 0) {
                random_lng = lng_avg * 0.01 * Math.random();
                random_lat = lat_avg * 0.01 * Math.random();
              }

              //console.log "highest_rssi_lng", highest_rssi_lng, "lng_avg", lng_avg

              // random_lng = random_lat = 0
              //logger.info 'random_lng', random_lng

              lng_avg = lng_avg + random_lng;
              lat_avg = lat_avg + random_lat;

              let latlng = {
                lng: lng_avg,
                lat: lat_avg
              };

              const last_lng = null;
              const last_lat = null;
              const last_weight = null;
              const last_plot = null;

              //console.log latlng

              //console.log "latlng", latlng
              //console.log "heaviest_weighted_plot", heaviest_weighted_plot

              //logger.info "signal_obj 1", signal_obj[device_id_master]

              //logger.info "lng", lng_avg, "lat", lat_avg
              signal_obj[device_id_master].plot = heaviest_weighted_plot;
              signal_obj[device_id_master].latlng = latlng;
              signal_obj[device_id_master].weight = sum_weighting;

              //logger.info "signal_obj 2", signal_obj[device_id_master]

              // Clears all records to save memory
              signal_obj[device_id_master].all_records = [];

              //logger.info time_hour, device_id
              //logger.info 'signal_obj', signal_obj

              lng_avg = null;
              lat_avg = null;
              random_lng = null;
              random_lat = null;
              random_factor_for_lng = null;
              random_factor_for_lat = null;
              sum_weighting = null;
              latlng = null;
              //console.log("signal_obj[device_id_master] 1439", signal_obj[device_id_master]);

              if (typeof callback === "function") {
                //console.log("signal_obj in bulktrack", signal_obj);
                callback(null, signal_obj[device_id_master]);
                //delete signal_obj[device_id_master];
                return;
              }
            }

            return weighting_arr = [];

          } else {
            // if (weighting_arr.length <= 0)
            if (typeof callback === "function") {
              err = {
                code: 404,
                msg: 'Does not have any information for Device to find (weighting_arr.length <= 0).'
              };
              return callback(err, null);
            }
            return;
          }
        }
      });
    });
  });
};


// THis is the compound function that records the position for both local or computed position.

const record_position = function(signal_obj){

  const timestamp_unix_ms = moment().valueOf();
  let time_hour = moment().startOf('hour');
  let time_min = moment().minutes();
  let time_sec = moment().seconds();

  //logger.info "signal_obj.length", signal_obj.length
  //console.log("signal_obj in cron", signal_obj);

  // Populate latest data into device.
  Device.findOne({_id: signal_obj.id}, function(err, device) {

    //console.log "signal_obj", signal_obj
    // Here, we push the data update into the Device.
    let data;
    let latest_data_arr = [];
    // Populate latest data into device.
    if ((device.latest_data !== undefined) && (device.latest_data.length > 0)) {
      latest_data_arr = device.latest_data;
      // Go through each data file, and update to the latest one.
      for (let i = 0; i < latest_data_arr.length; i++) {
        data = latest_data_arr[i];
        if (String(data.sensor_id) === String("0")) {
          latest_data_arr[i].timestamp = timestamp_unix_ms;
          latest_data_arr[i].data = {
            plot: signal_obj.plot,
            latlng: {
              lat: signal_obj.latlng.lat,
              lng: signal_obj.latlng.lng
            }
          };
        }
      }

    } else {
      let updated_data = {
        sensor_id: "0",
        sensor_type: 0,
        timestamp: timestamp_unix_ms,
        data: {
          plot: signal_obj.plot,
          latlng: {
            lat: signal_obj.latlng.lat,
            lng: signal_obj.latlng.lng
          }
        }
      };
      latest_data_arr.push(updated_data);

      updated_data = null;
    }

    // Update the sensor data as if the panic button was not pressed.  Only every 20 seconds.
    if (time_counter === 4) {
      incoming.sensorUpdate("log", device.mac, "206", 206, 0, device.user, "device", null);
    }

    return Device.update({"_id": device._id},{$set: {
      "timestamp": timestamp_unix_ms,
      "latest_data": latest_data_arr
    }})
    .exec()
    .then(null, function(){
      latest_data_arr = null;
      return device = null;
    });
  });

  // Move the loop content outside the loop to ensure that the callbacks are executed in the loop.

  let setModifier = { $set : {}};

  setModifier.$set['latest.timestamp'] = timestamp_unix_ms;
  setModifier.$set['latest.data.lng'] = signal_obj.latlng.lng;
  setModifier.$set['latest.data.lat'] = signal_obj.latlng.lat;
  setModifier.$set['latest.data.weight'] = signal_obj.weight;
  setModifier.$set['latest.data.plot'] = signal_obj.plot;

  setModifier.$set[`timestamp_data.${time_min}.${time_sec}.latlng.lng`] = signal_obj.latlng.lng;
  setModifier.$set[`timestamp_data.${time_min}.${time_sec}.latlng.lat`] = signal_obj.latlng.lat;
  setModifier.$set[`timestamp_data.${time_min}.${time_sec}.plot`] = signal_obj.plot;
  //logger.info 'timestamp_data.'+time_min+'.'+time_sec+'.latlng.lng'+signal_obj.latlng.lng

  //logger.info "latlng.lng", signal_obj.latlng.lng, "lat", signal_obj.latlng.lat

  const device_id = new mongoose.Types.ObjectId(signal_obj.id);

  //mongoose.set('debug', true)
  // Save the coordinate data back into time series stream
  Stream.update(
    //find record items
    {'timestamp_hour': time_hour,
    'device': device_id,
    'cmd': 'log',
    'sensor._id': '0',
    'sensor.function_type': 0
    },
    setModifier,
    {upsert: true}
  )
  .exec()
  .then(function(stream){
    logger.info('stream', stream);
    setModifier = null;
    return;
  })
  .then(null, function(err){
    logger.warn(err);
    time_hour = null;
    time_min = null;
    time_sec = null;
    return;
  });

  // Now publish in clear text to a device topic.
  const topic = signal_obj.owner + "/" + device_id + "_D";
  //logger.info topic

  // sends out the device added command.
  let payload = JSON.stringify({
    cmd: 'UIposition',
    device_id,
    name: signal_obj.name,
    plot: signal_obj.plot,
    timestamp: timestamp_unix_ms,
    sensor: {
      _id: "0",
      function_type: 0
    },
    latlng: {
      lng: signal_obj.latlng.lng,
      lat: signal_obj.latlng.lat
    }
  });

  //         if encryptionEnabled
  //           md5 = crypto.createHash 'md5'
  //           key = md5.update(gateway.private_key).digest('base64')
  //           payload = security.encrypt key, payload

  client.publish(topic, payload, {qos: 0, retain: false}, function() {
    //console.log("mqtt published topic", topic, "payload", payload);
    //logger.info("mqtt published topic", topic, "payload", payload);
    //logger.info "payload", payload
    payload = null;
  });

  return;

}





          //latlng = null
          //sum_weighting = null

//     if typeof callback is "function"
//       console.log "signal_obj inside", signal_obj
//       return callback(null, signal_obj)
//       signal_obj = null

// used for doing a bulk MQTT ping every 30 seconds.
let time_counter = 0;

// ! -- Cron Job
// for analysing positions.
const job = new cronjob('0,5,10,15,20,25,30,35,40,45,50,55 * * * * *', function(res) {

//     redis.zadd(redis_hash_key, 1, 2)
//     redis.zadd(redis_hash_key, 3, 4)


//     # sends out the device added command.
//     payload = JSON.stringify
//       cmd: 'position'
//       name: "test"
//       coordinate:
//         lng: 1.2
//         lat: 1.4
//
//     client.publish "150000000000000000000000_D", payload, {qos: 0, retain: false}, () ->
//       logger.info "publish"
//       return

    //console.log moment().format()
    // logger.info moment().format()

    // This is to log the memory usage of the program.
    if (profile_logging === 1) {
      profiler.info((util.inspect(process.memoryUsage())));
    }

    // I think this is to forcefully get the gateways to broadcast
    // tracking messages to overcome the crashing of the nodes.
    // If set to 0, there will be no broadcast.
    if (time_counter >= time_btw_tracking_announcements) {
      if (time_btw_tracking_announcements > 0) {
        collect_tracked_devices_for_mqtt(null);
      }
      time_counter = 0;
    }

    time_counter++;

    //position.populate_devices

    return bulktrack(null, null, function(err, signal_obj){

      if (err) {
        if (err.code) {
          logger.warn(err.msg);
        } else {
          logger.error(err);
        }
        return;
      } else {

        record_position(signal_obj);

        // Send the computed position to the remote server.
        on_prem.update_remote("log", device_id, "300", 300, [signal_obj.latlng.lat, signal_obj.latlng.lng, signal_obj.plot]);

      }
    });
  }

  , null, false, 'America/Los_Angeles');

// Start cron job automatically
if (cron_job === true) {
  job.start();
}

module.exports = {
  cron_job_toggle: cron_job,
  prepare_payload,
  prepare_multi_payload,
  find_one_mobile,
  position,
  track,
  populate_devices,
  bulktrack,
  job
};
