const express = require('express');
const async = require('async');
const router = express.Router();
const mongoose = require('mongoose');

// Validation, sanitization, and encryption middleware
const bcrypt = require('bcryptjs');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const { Validator } = require('node-input-validator');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Image upload packages
const fs = require('fs');
const formidable =  require('formidable');
const crypto = require('crypto'); // to generate file name
const multer = require('multer');
const GridFsStorage = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');
const app = require('../app');


const User = require('../models/userSchema');
const Profile = require('../models/profileSchema');
const Post = require('../models/postSchema');
const Reaction = require('../models/reactionSchema');

const profileController = require('../controllers/profileController');

/* GET home page. */
router.get('/', function(req, res, next) {
  if (req.user) {
    res.redirect('/profile/' + req.user._id);
  } else {
    res.render('index', { user: req.user });
  }
});

// GET Google OAuth login
router.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email'] // Used to specify the data required by Google
}));

// The middleware receives the data from Google and runs the function on Strategy config
router.get('/auth/google/login', passport.authenticate('google'), (req, res, next) => {
  if (req.user) {
    next();
  } else {
    res.send("You must login");
  }
}, (req, res) => {
  res.redirect('/profile/' + req.user._id);
});

// Secret route
router.get('/secret', (req, res, next) => {
  if (req.user) {
    next();
  } else {
    res.send("You must login");
  }
}, (req, res) => {
  res.redirect('/profile/' + req.user._id);
});

// POST to login form
router.post('/log-in', 
  passport.authenticate('local', { failureRedirect: '/' }),
  (req, res) => {
    // passport authentication successful
    // req.user now contains authenticated user
    let profileUrl = '/profile/' + req.user._id;
    res.redirect(profileUrl);
  }
);

// GET logout page
router.get('/log-out', (req, res) => {
  req.logout();
  res.redirect('/');
});

// GET sign-up form
router.get('/sign-up', (req, res, next) => {
  res.render('sign-up-form');
});

// POST to sign-up form
router.post('/sign-up', (req, res, next) => {
  bcrypt.hash(req.body.password, 10, (err, hashedPassword) => {
    if (err) { return next(err); }
    const user = new User ({ // create new user with info from form
      first_name: req.body.first_name,
      first_name_lower: req.body.first_name.toLowerCase(),
      last_name: req.body.last_name,
      last_name_lower: req.body.last_name.toLowerCase(),
      username: req.body.username,
      username_lower: req.body.username.toLowerCase(),
      password: hashedPassword
    });

    async.waterfall([
      function(callback) {
        user.save(err => {  // save it to MongoDB database, then create profile doc
          if (err) { return next(err); }
        });
        callback(null, user);
      },
      function(savedUser, callback) {
        const profile = new Profile ({
          user: savedUser._id,
        });
        profile.save(err => {
          if (err) { return next(err); }
          callback(null, {savedUser, profile});
        });
      }
    ], (err, results) => {
      if (err) { return next(err); }
    
      req.login(results.savedUser, (err => {
        if (!err) {
          res.redirect(results.savedUser.url);
        }
      }));
        
    });
  });
});

// *************************** FEED  ********************************

// GET feed
router.get('/feed', (req, res, next) => {
  if (req.user) {
    async.parallel({
      user: function(callback) {
        User.findById(req.user._id)
        .populate('friends')
        .populate('posts')
        .exec(callback);
      },
      friends_list: function(callback) {
        User.find({'friends': req.user._id})
        .populate('posts')
        .exec(callback);
      }
    }, (err, results) => {
      if (err) { return next(err); }

      // SORT POSTS BY DATE BEFORE SENDING TO VIEW
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

      let friendPosts = [];
      
      for (const index in results.friends_list) {
        let friend = results.friends_list[index];

        // For each post by each friend, create new friend post object
        // to connect friend information to each post
        for (const index in friend.posts) {
          let post = friend.posts[index];
          
          const friendPostObj = {
            friendId: friend._id,
            friendFirstName: friend.first_name,
            friendFirstNameLower: friend.first_name_lower,
            friendLastName: friend.last_name,
            friendLastNameLower: friend.last_name_lower,
            friendFullname: friend.fullname,
            friendUrl: friend.url,
            post: post
          }
          // and add it to the array friendPosts
          friendPosts.push(friendPostObj);
        }
      }
      
      // Sort friendPosts by post date
      friendPosts.sort((friendPostObj1, friendPostObj2) => {
        if (friendPostObj1.post.date_last_updated < friendPostObj2.post.date_last_updated) {
          return 1;
        }
        if (friendPostObj1.post.date_last_updated.getTime() === friendPostObj2.post.date_last_updated.getTime()) {
          return 0;
        } else {
          return -1;
        }
      });

      // send Sorted array to view
      res.render('feed', { user: results.user, friendPosts: friendPosts });
    });
  } else {
    res.redirect('/');
  }
});

module.exports = router;
