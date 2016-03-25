var path = require('path');
var fs = require('fs');
var SongModel = require('../models/songModel');
var awsConfig = require('../config/aws.json');
var Promise = require('bluebird');

var AWS = require('aws-sdk');
AWS.config.update({
  'accessKeyId': awsConfig.accessKeyId,
  'secretAccessKey': awsConfig.secretAccessKey,
  'region': awsConfig.region
});
var s3 = new AWS.S3();
var bucketAddress = s3.endpoint.protocol + '//' + awsConfig.bucket + '.' + s3.endpoint.hostname + s3.endpoint.pathname;
console.log('s3 bucket address is : ' + bucketAddress);

var s3deleteAsync = Promise.promisify(s3.deleteObjects);


var addCompressedLink = function(req, res, next) {
  console.log('--- Add Compressed Link ---', req.body);
  var songID = req.body.songID;
  var compressedID = req.body.compressedID;

  SongModel.addCompressedLink(songID, compressedID);
};

var addSong = function(req, res, next) {
  var song = {};
  song.title = req.body.name || '';
  song.description = req.body.description || '';
  song.dateRecorded = req.body.lastModified || null;
  song.dateUploaded = Date.now(); //TODO: make a db entry for this data
  song.groupId = req.params.id;
  song.size = req.body.size;
  song.address = req.body.address;
  song.uniqueHash = req.body.uniqueHash;
  song.duration = req.body.duration || 300;

  SongModel.addSong(song)
  .then(function(song) {
    SongModel.requestFileCompression(song)
    .then(function(bool) {
      res.json(song);
    });
  })
  .catch(function(err) {
    next(err);
  });
};

// var getSongByFilename = function(req, res, next) {
//   var filename = req.params.filename;
//   var url = path.resolve(__dirname + '/../uploadInbox/' + filename);
//   res.sendFile(url);
// };

var s3delete = function(song) {
  // delete both original and compressed files from aws
  console.log('song address before replace: ' + song.address);
  console.log('song address after replace: ' + song.address.replace(bucketAddress, ''));
  
  
  var params = {
    Bucket: awsConfig.bucket, /* required */
    Delete: { /* required */
      Objects: [ /* required */
        {
          Key: song.address.replace(bucketAddress, ''), /* required */
        },
        {
          Key: song.compressedAddress.replace(bucketAddress, ''), /* required */
        }
      ],
    },
  };
  return new Promise(function (resolve, reject) {
    s3.deleteObjects(params, function(err, res) {
      if (err) {
        reject(error);
      } else {
        resolve(res);
      }
    });
  });
};


var deleteSong = function(req, res, next) {
  // Only deletes from the database. FILES ARE STILL ON S3!
  var songId = req.params.id;

  SongModel.getSong(songId)
  .then(function(song) {
    s3delete(song)
    .then(function(s3response) {
      console.log('s3 delete response is ' + JSON.stringify(s3response));
      song.destroy()
      .then(function() {
        res.json(song);
      });
    })
    .catch(function(err) {
      console.error(err);
      res.status(500).json('error deleting song from aws: ' + err);
    });
  })
  .catch(function(err) {
    next(err);
  });
};

module.exports = {
  addCompressedLink: addCompressedLink,
  addSong: addSong,
  // getSongByFilename: getSongByFilename,
  deleteSong: deleteSong
};
