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

const mongodb = `mongodb+srv://admin-lauren:${process.env.MONGODB_PASSWORD}@cluster0.jdtsv.mongodb.net/coucou?retryWrites=true&w=majority`;

// Get the default connection
const db = mongoose.connection;

// Home page Profile redirect
exports.homePageRedirect = (req, res) => {
    if (req.user) {
        res.redirect('/profile/' + req.user._id);
      } else {
        res.redirect('/');
      }
};
  
// GET profile page
exports.getProfilePage = (req, res, next) => {
    if (req.user) {
        res.redirect('/profile/'+ req.params.id + "/posts");
    } else {
        res.redirect('/');
    }
};

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

// GET profile edit form
exports.getProfileBioEdit = (req, res) => {
    if (req.user) {
        Profile.findOne({'user': req.user._id})
        .exec((err, profile) => {
            if (err) { return next(err); }
            res.render('edit-bio-form', { profile: profile });
        }); 
    } else {
        res.redirect('/');
    }
};

// POST to profile edit form
exports.postToProfileBioEdit = [
  // Sanitize input
  body('bio')
  .trim()
  .optional({ checkFalsy: true })
  .matches(/[À-ÿa-z0-9 .,!"'-]|\r\n|\r|\n/gmi)
  .escape(),

  // Replace escaped HTML entities with characters
  unescape('&#38;', '&'),
  unescape('&#x26;', '&'),
  unescape('&amp;', '&'),

  unescape('&#34;', '"'),
  unescape('&ldquo;', '"'),
  unescape('&rdquo;', '"'),
  unescape('&#8220; ', '"'),
  unescape('&#8221;', '"'),

  unescape('&#39;', "'"),
  unescape('&#x27;', "'"),
  unescape('&lsquo;', "'"),
  unescape('&rsquo;', "'"),
  unescape('&#8216;', "'"),
  unescape('&#8217;', "'"),

  unescape('&lt;', '<'),
  unescape('&gt;', '>'),

  (req, res, next) => {

    if (req.user) {

      const errors = validationResult(req);

      // There were errors in the request body! Oh no!
      // Re-render the form with sanitized values filling in inputs
      if (!errors.isEmpty()) {
        Profile.findOne({'user': req.user._id})
        .exec((err, profile) => {
          if (err) { return next(err); }
          res.render('edit-bio-form', { profile: profile, inputs: req.body, errors: errors.array() });
        });
      }

      // No errors in request body, you're good to go!
      else {
        // Find and update Profile object
        async.waterfall([
          function(callback) {
              Profile.findOne({'user': req.user._id}).exec((err, profileData) => {
              if (err) {return next(err); }
              callback(null, profileData);
              });
          },
          function(profileData, callback) {

              const updatedProfile = new Profile({
              media: profileData.media,
              user: profileData.user,
              profilePic: profileData.profilePic,
              _id: profileData._id,
              bio: req.body.bio
              });

              Profile.findByIdAndUpdate(profileData._id, updatedProfile, { new: true }, function(err, theProfile) {
              if (err) { return next(err); }
              callback(null, theProfile);
              });
          }
        ], function(err, updatedProfile) {
          if (err) { return next(err); }
          res.redirect('/profile/'+req.user._id);
        });
      }

    // NO LOGGED IN USER
    } else {
        res.redirect('/');
    }
}];

// GET edit profile pic form
exports.getProfilePicEdit = (req, res, next) => {
    if (req.user) {
        async.parallel({
            user: function(callback) {
                User.findById(req.user._id)
                .populate('posts')
                .exec(callback);
            },
            profile: function(callback) {
                Profile.findOne({'user': req.user._id})
                .populate('profilePic')
                .exec(callback);
            }
        }, (err, results) => {
            if (err) { return next(err); }
            res.render('profile', { newProfilePic: true, user: results.user, profile: results.profile});
        });
    } else {
        res.redirect('/');
    }
};

// POST edit profile pic page
exports.postProfilePicEdit = [
    (req, res, next) => {

        const newPic = new Media({
            altText: "Profile Picture",
            img: {
                data: fs.readFileSync(req.files[0].path),
                contentType: req.files[0].mimetype
            }
        });

        // delete photo from serverside uploads folder
        fs.unlinkSync(req.files[0].path);

        async.waterfall([

            function(callback) { // save pic file to Mongo DB
                newPic.save((err, thePic) => {
                    if (err) { return next(err); }

                    callback(null, thePic);
                });
            },

            function(newProfilePic, callback) {  // find current profile obj in Mongo DB
                let newPicId = newProfilePic._id;
                Profile.findOne({'user': req.user._id}).exec((err, foundProfile) => {
                    callback(null, foundProfile, newPicId);
                });
            },

            function(currentProfile, newPicId, callback) { // remove previous profile pic from MongoDB
                let oldProfilePicId = currentProfile.profilePic;

                Media.findByIdAndRemove(oldProfilePicId, err => {
                    if (err) { return next(err); }
                    callback(null, currentProfile, newPicId);
                });
            },

            function(currentProfile, newPicId, callback) {
                let updatedProfile = new Profile ({ // save profile with ref to new profile pic obj id
                    user: currentProfile.user,
                    profilePic: newPicId,
                    bio: currentProfile.bio,
                    media: currentProfile.media,
                    _id: currentProfile._id
                });

                Profile.findByIdAndUpdate(currentProfile._id, updatedProfile, { new: true }, function(err, newProfile){
                    if (err) { return next(err); }
                    callback(null, newProfile);
                });
            }

        ], (err, newProfile) => {
            if (err) { return next(err); }

            // reload profile page
            res.redirect('/profile/'+req.user._id + "/posts");
        });
    
    // Security risks
    // sanitize file name (npm sanitize-filename)
}];


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
}

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
}