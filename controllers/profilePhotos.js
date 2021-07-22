const express = require('express');
const path = require('path');
const async = require('async');
const router = express.Router();
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const unescape = require('./unescape');

// Image upload packages
const fs = require('fs');

// Validation, sanitization, and encryption middleware
const bcrypt = require('bcryptjs');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const { Validator } = require('node-input-validator');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);
const FileType = require('file-type');
const sanitizeFileName = require('sanitize-filename');


const User = require('../models/userSchema');
const Profile = require('../models/profileSchema');
const Post = require('../models/postSchema');
const Media = require('../models/mediaSchema');
const { populate } = require('../models/userSchema');


// GET profile -- photos tab
exports.getProfilePhotos = (req, res, next) => {
  if (req.user) {
      async.parallel({
          user: function(callback) {
              User.findById(req.params.id)
              .exec(callback);
          },
          
          profile: function(callback) {
              Profile.findOne({'user': req.params.id})
              .populate('profilePic')
              .populate('media')
              .exec(callback);
          }
          // FIND IMAGE DATA STORED IN MEDIA CHUNK AS DATA BINARY 
      }, (err, results) => {
          if (err) { return next(err); }
          
          res.render('profile', { currentUser: req.user, user: results.user, profile: results.profile, tab: "photos" });
      });
  } else {
      res.redirect('/');
  }
};

// GET add photos form
exports.getProfileMediaForm = (req, res, next) => {
  if (req.user) {
    async.parallel({
      user: function(callback) {
          User.findById(req.user._id)
          .populate('friends')
          .populate('posts')
          .exec(callback);
      },
      
      profile: function(callback) {
          Profile.findOne({'user': req.user._id})
          .populate('profilePic')
          .populate('media')
          .exec(callback);
      }
    }, (err, results) => {
      if (err) { return next(err); }
      
      res.render('profile', { newMediaForm: true, currentUser: req.user, user: results.user, profile: results.profile, tab: "photos" });
      });
  } else {
      res.redirect('/');
  }
};

// POST to add photo form
exports.postProfileMediaForm = (req, res, next) => {
  if (req.user) {

    async.waterfall([
      function(callback) {
        function createNewPicFiles () {
          let promises = [];
          for (let i=0; i < req.files.length; i++) {
            const newPic = new Media({ // generate new Media obj with pic info
              altText: req.files[i].originalname,
              img: {
                data: fs.readFileSync(req.files[i].path),
                contentType: req.files[i].mimetype
              }
            });

            // delete file from uploads folder
            fs.unlinkSync(req.files[i].path);

            promises.push(newPic.save());
          }
          return Promise.all(promises);  
        }
        
        createNewPicFiles().then(results => {
          let newPicIds = [];
          results.forEach(fileObj => {
              newPicIds.push(fileObj._id);
          });
          callback(null, newPicIds);
        }).catch(err => {
          return next(err);
        });
      },

      function(newPicIds, callback) {  // find current profile obj in Mongo DB
        console.log(newPicIds);
        Profile.findOne({'user': req.user._id}).exec((err, foundProfile) => {
          callback(null, foundProfile, newPicIds);
        });
      },

      function(currentProfile, newPicIds, callback) { // add array of new pic obj ids to current profile
        let updatedMedia = currentProfile.media.concat(newPicIds);
        let updatedProfile = new Profile ({
          user: currentProfile.user,
          profilePic: currentProfile.profilePic,
          bio: currentProfile.bio,
          media: updatedMedia,
          _id: currentProfile._id
        });

        Profile.findByIdAndUpdate(currentProfile._id, updatedProfile, { new: true }, function(err, newProfile){
          if (err) { return next(err); }
          callback(null, newProfile);
        });
      },

      function(updatedProfile, callback) {
        callback(null, updatedProfile);
      }
    ], (err, updatedProfile) => {
      if (err) { return next(err); }

      // reload profile page
      res.redirect('/profile/'+req.user._id + '/photos');
    });
    
  } else {
      res.redirect('/');
  }
};

// GET delete photos form
exports.getDeletePhotos = (req, res, next) => {
  if (req.user) {

    Profile.findOne({'user': req.params.id})
    .populate('user')
    .populate('media')
    .exec((err, theProfile) => {
      if (err) { return next(err); }
      res.render('delete-photos', { profile: theProfile });
    });
  } else {
    res.redirect('/');
  }
};

// POST delete photos form
exports.postDeletePhotos = (req, res, next) => {
  if (req.user) {
    let photoIDs = req.body.photoID;

    function processDeletePhoto(photoID, iterCallback) {
      // Series of async functions to remove photo from MongoDB
      async.waterfall([
          
        // Remove photo doc from MongoDB
        function(callback) {
          console.log("ID of photo to be removed: " + photoID);
          Media.findByIdAndRemove(photoID, err => {
            if (err) {return next(err); }
            console.log("Photo successfully removed from MongoDB");
            callback(null);
          });
        },

        // Find the profile where this media has been linked
        // pass that profile id on in callback function
        function(callback) {
          Profile.findOne({'media': photoID}, (err, theProfile) => {
            if (err) { return next(err); }
            console.log("Found profile to be updated for user " + theProfile.user);
            callback(null, theProfile);
          });
        },

        // Remove photoID from profile media array
        // Update profile doc in MongoDB
        function(theProfile, callback) {
          let profileMedia = theProfile.media;
          console.log("Profile photo IDs:");
          console.log(profileMedia);

          let photoIndex = profileMedia.findIndex(photo => photo._id.toString() === photoID.toString());
          console.log("Index of photo in profile media array " + photoIndex);

          if (photoIndex !== -1) {
            profileMedia.splice(photoIndex, 1);
          }

          Profile.findByIdAndUpdate(theProfile._id, {'media': profileMedia}, {new:true}, (err, updatedProfile) => {
            if (err) { return next(err); }

            console.log("Updated profile media:");
            console.log(updatedProfile.media);
            callback(null);
          });
        }

      ], (err, results) => {
        if (err) { return next(err); }
        iterCallback();
      });
    }

    // Only 1 Photo to delete
    if (!Array.isArray(photoIDs)) {
      console.log("Only 1 photo to delete. Converting to array.");

      let photoIDsAsList = [];
      photoIDsAsList.push(photoIDs);
      photoIDs = photoIDsAsList;

      console.log(photoIDs);
    } 
    
    async.forEachLimit(photoIDs, 1, processDeletePhoto, (err, results) => {
      if (err) { return next(err); }

      console.log("Delete photos loop completed");
      res.redirect(req.user.url + '/photos');
    });

  } else {
      res.redirect('/');
  }
};