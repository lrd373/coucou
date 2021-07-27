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

// GET profile edit form
exports.getProfileBioEdit = (req, res) => {
    if (req.user) {
        Profile.findOne({'user': req.user._id})
        .exec((err, profile) => {
            if (err) { return next(err); }
            res.render('edit-bio-form', { profile: profile, currentUser: req.user });
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
          res.render('edit-bio-form', { profile: profile, inputs: req.body, errors: errors.array(), currentUser: req.user });
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
            res.render('profile', { newProfilePic: true, currentUser: req.user, user: results.user, profile: results.profile});
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