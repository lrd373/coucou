const express = require('express');
const async = require('async');
const router = express.Router();
const bcrypt = require('bcryptjs');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const { Validator } = require('node-input-validator');
const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);


const User = require('../models/userSchema');
const Profile = require('../models/profileSchema');
const Post = require('../models/postSchema');
const Reaction = require('../models/reactionSchema');

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
      console.log(results);
      const profileUrl = '/profile/' + results.savedUser._id;
      res.redirect(profileUrl); 
      }
    );
  });
});

// Home page Profile redirect
router.get('/profile', (req, res) => {
  if (req.user) {
    res.redirect('/profile/' + req.user._id);
  } else {
    res.redirect('/');
  }
});

// GET profile page
router.get('/profile/:id', (req, res, next) => {
  if (req.user) {
    async.parallel({
      user: function(callback) {
        User.findById(req.params.id)
        .populate('friends')
        .populate('posts')
        .exec(callback);
      },
      profile: function(callback) {
        Profile.findOne({'user': req.params.id}).exec(callback);
      }
    }, (err, results) => {
      if (err) { return next(err); }
      res.render('profile', {currentUser: req.user, user: results.user, profile: results.profile});
    });
  } else {
    res.redirect('/');
  }
  
});

// GET profile edit form
router.get('/profile-edit', (req, res) => {
  if (req.user) {
    Profile.findOne({'user': req.user._id}).exec((err, profile) => {
      if (err) { return next(err); }
      res.render('profile-form', { profile: profile });
    }); 
  } else {
    res.redirect('/');
  }
});

// POST to profile edit form
router.post('/profile-edit', (req, res, next) => {

  if (req.user) {
    // Sanitize inputs
    const cleanBio = DOMPurify.sanitize(req.body.bio);

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
          _id: profileData._id,
          bio: cleanBio
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
  } else {
    res.redirect('/');
  }
  
});

// GET new post form
router.get('/create-post', (req, res, next) => {
  if (req.user) {
    async.parallel({
      user: function(callback) {
        User.findById(req.user._id)
        .populate('friends')
        .populate('posts')
        .exec(callback);
      },
      profile: function(callback) {
        Profile.findOne({'user': req.user._id}).exec(callback);
      }
    }, (err, results) => {
      if (err) { return next(err); }
      res.render('profile', {newPostForm: true, user: results.user, profile: results.profile});
    });
  } else {
    res.redirect('/');
  }
});

// POST -- create new post
router.post('/create-post', (req, res, next) => {
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
});



// GET feed
router.get('/feed', (req, res, next) => {
  if (req.user) {
    async.parallel({
      user: function(callback) {
        User.findById(req.user._id)
        .populate('friends', 'posts')
        .exec(callback);
      },
      friends_list: function(callback) {
        User.find({'friends': req.user._id})
        .populate('posts')
        .exec(callback);
      }
    }, (err, results) => {
      if (err) { return next(err); }
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
    User.find({username: req.body.username}).exec((err, foundUsers) => {
      if (err) {return next(err); }
      res.render('add-friend-form', { foundUsers: foundUsers });
    });

  // First name and last name
  } else if (req.body.last_name && req.body.first_name) {
    User.find({ last_name_lower: req.body.last_name, first_name_lower: req.body.first_name})
    .exec((err, foundUsers) => {
      if (err) {return next(err); }
      res.render('add-friend-form', { foundUsers: foundUsers });
    });
  
  // Just last name
  } else if (req.body.last_name) {
    User.find({ last_name_lower: req.body.last_name})
    .exec((err, foundUsers) => {
      if (err) {return next(err); }
      res.render('add-friend-form', { foundUsers: foundUsers });
    });

  // Just first name
  } else if (req.body.first_name) {
    User.find({ first_name_lower: req.body.first_name})
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
