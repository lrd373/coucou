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


// GET profile posts tab
exports.getProfilePosts = (req, res, next) => {
  if (req.user) {
      async.parallel({
          user: function(callback) {
              User.findById(req.params.id)
              .populate('posts')
              .exec(callback);
          },
          
          profile: function(callback) {
              Profile.findOne({'user': req.params.id})
              .populate('profilePic')
              .exec(callback);
          }
          // FIND IMAGE DATA STORED IN MEDIA CHUNK AS DATA BINARY 
      }, (err, results) => {
          if (err) { return next(err); }

          // Sort posts by date last updated
          let profileUserPosts = results.user.posts;
          profileUserPosts.sort((postObj1, postObj2) => {
            if (postObj1.date_last_updated < postObj2.date_last_updated) {
              return 1;
            }
            if (postObj1.date_last_updated.getTime() === postObj2.date_last_updated.getTime()) {
              return 0;
            } else {
              return -1;
            }
          });

          // Update posts list on user whose profile will be displayed
          results.user.posts = profileUserPosts;
          
          res.render('profile', { currentUser: req.user, user: results.user, profile: results.profile, tab: "posts" });
      });
  } else {
      res.redirect('/');
  }
};

// GET new post form
exports.getNewPostForm = (req, res, next) => {
  if (req.user) {
      async.parallel({
          user: function(callback) {
              User.findById(req.user._id)
              .exec(callback);
          },
          profile: function(callback) {
              Profile.findOne({'user': req.user._id})
              .populate('profilePic')
              .exec(callback);
          }
      }, (err, results) => {
          if (err) { return next(err); }
          res.render('profile', {newPostForm: true, user: results.user, profile: results.profile, tab: 'posts'});
      });
  } else {
      res.redirect('/');
  }
};

// POST -- create new post
exports.postNewPostForm = (req, res, next) => {
  if (req.user) {
      // Sanitize text input (** MEDIA TO COME)
      const cleanMsg = DOMPurify.sanitize(req.body.text);

      // Create new post obj & save to Posts collection
      const newPost = new Post({
        text: cleanMsg,
        date_created: new Date(),
        date_last_updated: new Date(),
        media: []
      });

      newPost.save(err => {
        if (err) {return next(err); }
      });

      // Create updated user object with new post information
      let postsList = req.user.posts;
      postsList.push(newPost);
      
      // Find and update user
      User.findByIdAndUpdate(req.user._id, {'posts': postsList}, {new: true}, function(err, theUser) {
          if (err) { return next(err); }
          res.redirect(theUser.url);
      });
  } else {
      res.redirect('/');
  }
};

// GET delete posts form
exports.getDeletePosts = (req, res, next) => {
  if (req.user) {
      async.parallel({
          user: function(callback) {
              User.findById(req.params.id)
              .populate('posts')
              .exec(callback);
          },
          
          profile: function(callback) {
              Profile.findOne({'user': req.params.id})
              .populate('profilePic')
              .exec(callback);
          } 
      }, (err, results) => {
          if (err) { return next(err); }

          // Sort posts by date last updated
          let profileUserPosts = results.user.posts;
          profileUserPosts.sort((postObj1, postObj2) => {
            if (postObj1.date_last_updated < postObj2.date_last_updated) {
              return 1;
            }
            if (postObj1.date_last_updated.getTime() === postObj2.date_last_updated.getTime()) {
              return 0;
            } else {
              return -1;
            }
          });

          results.user.posts = profileUserPosts;
          
          res.render('profile', { deletePosts: true, currentUser: req.user, user: results.user, profile: results.profile, tab: "posts" });
      });
  } else {
      res.redirect('/');
  }
};


// POST delete posts form
exports.postDeletePosts = (req, res, next) => {
  if (req.user) {
    let postIDs = req.body.postID;

    function processDeletePost (currentPostToDelete, iterCallback) {
        async.waterfall([

            // Remove post from user 
            function(callback) {
                let userPosts = req.user.posts;

                let postIndex = userPosts.findIndex(userPost => userPost.toString() === currentPostToDelete.toString());

                if (postIndex !== -1) {
                    userPosts.splice(postIndex, 1);
                }

                // Find and update user
                User.findByIdAndUpdate(req.user._id, {'posts': userPosts}, {new: true}, function(err, theUser) {
                    if (err) { return next(err); }
                    callback(null);
                });
            },

            // Delete post obj from MongoDB
            function(callback) {
               Post.findByIdAndRemove(currentPostToDelete, err => {
                  if (err) { return next(err); }
                  console.log("Post " + currentPostToDelete + " successfully deleted.");
                  callback(null);
               });
            }
        ], (err, results) => {
            if (err) { return next(err); }
            iterCallback();
        });
    }

    // There is only one post to delete:
    if (!Array.isArray(postIDs)) {
      console.log("Only 1 post to delete. Converting ID to array.");

      let postIDsAsList = [];
      postIDsAsList.push(postIDs);
      postIDs = postIDsAsList;

      console.log(postIDs);
    } 
    
    async.forEachLimit(postIDs, 1, processDeletePost, (err, results) => {
        if (err) { return next(err); }

        console.log("Delete post loop completed");
        res.redirect(req.user.url + "/posts");
    });
  
  } else {
    res.redirect('/');
  }
};
