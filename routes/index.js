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

// POST to login form
router.post('/log-in', 
  passport.authenticate('local', { failureRedirect: '/'}),
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
        
    }
    );
  });
});

// Home page Profile redirect
router.get('/profile', profileController.homePageRedirect);

// *************************** PROFILE  ********************************

// GET profile page
router.get('/profile/:id', profileController.getProfilePage);

// GET profile edit form
router.get('/profile-bio-edit', profileController.getProfileBioEdit);

// POST to profile edit form
router.post('/profile-bio-edit', profileController.postToProfileBioEdit);

// GET edit profile pic page
router.get('/edit-profile-picture', profileController.getProfilePicEdit);

// POST edit profile pic page
router.post('/edit-profile-picture', profileController.postProfilePicEdit);

// GET new post form
router.get('/create-post', profileController.getNewPostForm);

// POST -- create new post
router.post('/create-post', profileController.postNewPostForm);

// GET new profile media form
router.get('/add-profile-media', profileController.getProfileMediaForm);

// POST to new profile media form
router.post('/add-profile-media', profileController.postProfileMediaForm);

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
      
      res.render('feed', { user: results.user, friends: results.friends_list });
    });
  } else {
    res.redirect('/');
  }
});


// GET add friend form
router.get('/add-friend', (req, res, next) => {
  res.render('add-friend-form');
});

// POST add friend form -- SEARCH for friend accounts
router.post('/search-friend', (req, res, next) => {
  // Username
  if (req.body.username) {
    User.find({username_lower: req.body.username.toLowerCase()}).exec((err, foundUsers) => {
      if (err) {return next(err); }
      res.render('add-friend-form', { foundUsers: foundUsers });
    });

  // First name and last name
  } else if (req.body.last_name && req.body.first_name) {
    User.find({ last_name_lower: req.body.last_name.toLowerCase(), first_name_lower: req.body.first_name.toLowerCase()})
    .exec((err, foundUsers) => {
      if (err) {return next(err); }
      res.render('add-friend-form', { foundUsers: foundUsers });
    });
  
  // Just last name
  } else if (req.body.last_name) {
    User.find({ last_name_lower: req.body.last_name.toLowerCase()})
    .exec((err, foundUsers) => {
      if (err) {return next(err); }
      res.render('add-friend-form', { foundUsers: foundUsers });
    });

  // Just first name
  } else if (req.body.first_name) {
    User.find({ first_name_lower: req.body.first_name.toLowerCase()})
    .exec((err, foundUsers) => {
      if (err) {return next(err); }
      res.render('add-friend-form', { foundUsers: foundUsers });
    });

  // No search criteria were entered
  } else {
    res.render('add-friend-form', {errorMsg: 'Please fill in at least one field'});
  }

});

// POST add friend form -- add friends
router.post('/add-friend', (req, res, next) => {
  if (req.user) {
    
    for (let foundUser in req.body) {

      // add current logged in user to userData friends list
      async.waterfall([
        function(callback) {
          User.findById(req.body[foundUser]).exec((err, userData) => {
            if (err) { return next(err); }
            callback(null, userData);
          });
        }, 
        function(userData, callback) {
          let foundUserFriends = userData.friends;
          foundUserFriends.push(req.user._id);
          const updatedFoundUser = new User({
            first_name: userData.first_name,
            first_name_lower: userData.first_name_lower,
            last_name: userData.last_name,
            last_name_lower: userData.last_name_lower,
            username: userData.username,
            password: userData.password,
            posts: userData.posts,
            friends: foundUserFriends,
            reactions: userData.reactions,
            _id: userData._id
          });
          User.findByIdAndUpdate(userData._id, updatedFoundUser, function(err, foundUser) {
            if (err) { return next(err); }
          });
        }
      ], function(err) {
        if (err) {return next(err);}
      });


      // add userData to current logged in user's friends list
      let currentFriendsList = req.user.friends;
      currentFriendsList.push(req.body[foundUser]);
      const updatedUser = new User({
        first_name: req.user.first_name,
        first_name_lower: req.user.first_name_lower,
        last_name: req.user.last_name,
        last_name_lower: req.user.last_name_lower,
        username: req.user.username,
        password: req.user.password,
        posts: req.user.posts,
        friends: currentFriendsList,
        reactions: req.user.reactions,
        _id: req.user._id
      });
      User.findByIdAndUpdate(req.user._id, updatedUser, function(err, theUser) {
        if (err) { return next(err); }
        res.redirect('/profile/'+theUser._id);
      });
    }
  } else {
    res.redirect('/');
  }
});

module.exports = router;
