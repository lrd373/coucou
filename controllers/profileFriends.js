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


// GET profile -- friends tab
exports.getProfileFriends = (req, res, next) => {
  if (req.user) {
      async.parallel({
          user: function(callback) {
              User.findById(req.params.id)
              .populate('friends')
              .exec(callback);
          },
          
          profile: function(callback) {
              Profile.findOne({'user': req.params.id})
              .populate('profilePic')
              .exec(callback);
          }

      }, (err, results) => {
          if (err) { return next(err); }

          // Sort friends by last name
          let profileUserFriends = results.user.friends;
          profileUserFriends.sort((friendObj1, friendObj2) => {
            if (friendObj1.last_name_lower > friendObj2.last_name_lower) {
              return 1;
            }
            if (friendObj1.last_name_lower === friendObj2.last_name_lower) {
              return 0;
            } else {
              return -1;
            }
          });

          // Update posts list on user whose profile will be displayed
          results.user.friends = profileUserFriends;
          
          res.render('profile', { currentUser: req.user, user: results.user, profile: results.profile, tab: "friends" });
      });
  } else {
      res.redirect('/');
  }
};


// GET add friend form
exports.getAddFriendForm = (req, res, next) => {
  if (req.user) {
      res.render('add-friend-form', { currentUser: req.user });
  } else {
      res.redirect('/');
  }
};

// POST search friend inputs
exports.postSearchFriend =  (req, res, next) => {

  if (req.user) {
    async.waterfall([

      // Find users in database based on form data
      function(callback) {
        // Username
        if (req.body.username) {
            User.find({$or: [
                {username_lower: req.body.username.toLowerCase()}, 
                {username: req.body.username},
                {username: req.body.username.toLowerCase()}
            ]}).exec((err, foundUsers) => {
                if (err) {return next(err); }
                if (foundUsers.length === 0) {
                  res.render('add-friend-form', {currentUser: req.user, errorMsg: 'Username not found'});
                }
                callback(null, foundUsers);
            });
    
        // First name and last name
        } else if (req.body.last_name && req.body.first_name) {
            User.find({ last_name_lower: req.body.last_name.toLowerCase(), first_name_lower: req.body.first_name.toLowerCase()})
            .exec((err, foundUsers) => {
              if (err) {return next(err); }
              if (foundUsers.length === 0) {
                  res.render('add-friend-form', {currentUser: req.user, errorMsg: 'First name and last name not found'});
              }
              callback(null, foundUsers);
            });
        
        // Just last name
        } else if (req.body.last_name) {
            User.find({ last_name_lower: req.body.last_name.toLowerCase()})
            .exec((err, foundUsers) => {
              if (err) {return next(err); }
              if (foundUsers.length === 0) {
                  res.render('add-friend-form', {currentUser: req.user, errorMsg: 'User last name not found'});
              }
              callback(null, foundUsers);
            });
    
        // Just first name
        } else if (req.body.first_name) {
            User.find({ first_name_lower: req.body.first_name.toLowerCase()})
            .exec((err, foundUsers) => {
              if (err) {return next(err); }
              if (foundUsers.length === 0) {
                  res.render('add-friend-form', {currentUser: req.user, errorMsg: 'User first name not found'});
              }
              callback(null, foundUsers);
            });
    
        // No search criteria were entered
        } else {
            res.render('add-friend-form', {currentUser: req.user, errorMsg: 'Please fill in at least one field'});
        }
      },

      // Find current logged in user in MongoDB
      function(foundUsers, callback) {
          if (req.user) {
            User.findById(req.user._id)
            .exec((err, currentUser) => {
              if (err) { return next(err); }
              callback(null, foundUsers, currentUser);
            });
          } else {
              res.redirect('/');
          }
      },

      // Check and clean found users:
      // exclude from possible new friend list: 
      // current friends of logged in user, current logged in user
      function(foundUsers, currentUser, callback) {
          let possibleFriends = foundUsers;
          console.log("All found possibilities:");
          console.log(possibleFriends);

          let currentUserFriends = currentUser.friends;
          console.log("Logged in user's existing friends list:");
          console.log(currentUserFriends);

          let errorMsg = "";

          for (const friend of possibleFriends) {
            let possibleFriendsIndex = possibleFriends.findIndex(
              friendObj => friendObj._id.toString() === friend._id.toString()
            ); 

            // if current user came up in search, 
            // excise from possible friend list
            if (friend._id.toString() === req.user._id.toString()) {
              console.log("Logged in user came up in search, removing from possible friends");
              // remove current user from possible friend list
              possibleFriends.splice(possibleFriendsIndex, 1);
              errorMsg = 'No one with that information was found.';
            }

            // if friend is found in current user's friend list,
            // excise from possible friend list
            let currentUserIndex = currentUserFriends.findIndex(id => id.toString() === friend._id.toString())
            if (currentUserIndex !== -1) {
              console.log("Someone who is already a friend came up in search, removing them from list:");
              console.log(friend);
              // remove friend from possible friend list
              possibleFriends.splice(possibleFriendsIndex, 1);
              errorMsg = "That user is already your friend.";
            }
          }

          // If search was able to find a user that was not the current user, 
          // nor already on the current user's friend list, 
          // reset the error message so that no confusing messaging appears
          if (possibleFriends.length > 0) {
            console.log("1 or more possible new friends were found, erasing error message");
            errorMsg = "";
          }

          callback(null, {possibleFriends, errorMsg});
      },
    ], (err, results) => {
      if (err) { return next(err); }

      res.render('add-friend-form', { currentUser: req.user, foundUsers: results.possibleFriends, errorMsg: results.errorMsg });
    });

  } else {
    res.redirect('/');
  }
};

// POST to add friend route
exports.postAddFriend = (req, res, next) => {
  if (req.user) {

    function processAddFriend(friendId, iterCallback) {

      async.waterfall([

        // Find friend in MongoDB
        function(callback) {
          User.findById(friendId).exec((err, friendDoc) => {
            if (err) { return next(err); }
            console.log("Found friend in MongoDB");
            callback(null, friendDoc);
          });
        }, 

        // Add current user to friend's friend list
        function(friendDoc, callback) {
          let friendFriends = friendDoc.friends;
          console.log("The friend's friend list");
          console.log(friendFriends);
          let currentUserIndex = friendFriends.findIndex(id => id.toString() === req.user._id.toString());
          if (currentUserIndex === -1) {
            friendFriends.push(req.user._id);
          }
          const updatedFriend = new User({
            first_name: friendDoc.first_name,
            first_name_lower: friendDoc.first_name_lower,
            last_name: friendDoc.last_name,
            last_name_lower: friendDoc.last_name_lower,
            username: friendDoc.username,
            password: friendDoc.password,
            posts: friendDoc.posts,
            friends: friendFriends,
            reactions: friendDoc.reactions,
            _id: friendDoc._id
          });
          User.findByIdAndUpdate(friendDoc._id, updatedFriend, {new: true}, (err, updatedFriendDoc) => {
            if (err) { return next(err); }
            console.log("Friend's account is now updated:");
            console.log(updatedFriendDoc.friends);
            callback(null, updatedFriendDoc);
          });
        },

        // add friend to current logged in user's friends list
        function(updatedFriendDoc, callback) {
          let currentFriendsList = req.user.friends;
          console.log("Logged in user's previous friends list");
          console.log(currentFriendsList);

          let friendIndex = currentFriendsList.findIndex(id => id.toString() === updatedFriendDoc._id.toString());
          console.log("Location of friend in logged in user's list: " + friendIndex);

          if (friendIndex === -1) {
            currentFriendsList.push(updatedFriendDoc._id);
          }
          
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
          User.findByIdAndUpdate(req.user._id, updatedUser, {new: true}, (err, theUser) => {
            if (err) { return next(err); }
            console.log("Current user is now updated:");
            console.log(theUser.friends);
            callback(null, theUser);
          });
        }
      ], (err, results) => {
        if (err) { return next(err); }
        iterCallback();
      });
    }
      
    let potentialFriends = req.body.potentialFriendId;
    console.log("Potential friends submitted by form");
    console.log(potentialFriends);

    // Only 1 friend to add -> convert potentialFriends to array
    if (!Array.isArray(potentialFriends)) {
      console.log("Only one friend to add. Converting form data to array:");
      
      let potentialFriendsAsList = [];
      potentialFriendsAsList.push(potentialFriends);
      potentialFriends = potentialFriendsAsList;
      
      console.log(potentialFriends);
    }

    async.forEachLimit(potentialFriends, 1, processAddFriend, (err) => {
      if (err) { return next(err); }
      console.log("Process add friend loop completed");
      res.redirect(req.user.url + '/friends/');
    });

  } else {
    res.redirect('/');
  }
};

// GET delete friend form
exports.getDeleteFriends = (req, res, next) => {
  if (req.user) {
    async.parallel({
        user: function(callback) {
            User.findById(req.params.id)
            .populate('friends')
            .exec(callback);
        },
        
        profile: function(callback) {
            Profile.findOne({'user': req.params.id})
            .populate('profilePic')
            .exec(callback);
        } 
    }, (err, results) => {
      if (err) { return next(err); }

      // Sort friends by last name
      let profileUserFriends = results.user.friends;
      profileUserFriends.sort((friendObj1, friendObj2) => {
        if (friendObj1.last_name_lower > friendObj2.last_name_lower) {
          return 1;
        }
        if (friendObj1.last_name_lower === friendObj2.last_name_lower) {
          return 0;
        } else {
          return -1;
        }
      });

      // Update posts list on user whose profile will be displayed
      results.user.friends = profileUserFriends;
      
      res.render('profile', { deleteFriends: true, currentUser: req.user, user: results.user, profile: results.profile, tab: "friends" });
    });
  } else {
      res.redirect('/');
  }
};

// POST to delete friend form
exports.postDeleteFriends = (req, res, next) => {
  if (req.user) {
    let friendIDs = req.body.friendID;

    function processDeleteFriend (friendToDelete, iterCallback) {
      async.waterfall([
  
        // Remove friend from logged in user 
        function(callback) {
          let userFriends = req.user.friends;
          console.log("User Friends list: " + userFriends);

          let friendIndex = userFriends.findIndex(userFriend => userFriend.toString() === friendToDelete.toString());
          console.log("Index of friend to delete: " + friendIndex);

          if (friendIndex !== -1) {
              userFriends.splice(friendIndex, 1);
          }

          // Find and update user
          User.findByIdAndUpdate(req.user._id, {'friends': userFriends}, {new: true}, function(err, theUser) {
              if (err) { return next(err); }
              console.log("User's updated friends list:");
              console.log(theUser.friends);
              return callback(null);
          });
        },

        // Find info on friend to be deleted in MongoDB
        function(callback) {
            User.findById(friendToDelete).exec((err, theFriend) => {
                if (err) { return next(err); }
                console.log("Found friend's record in MongoDB");
                return callback(null, theFriend);
            });
        },

        // Remove logged in user from friend's MongoDB doc
        function(theFriend, callback) {
          let friendsFriends = theFriend.friends;
          console.log("The friend's list of friends");
          console.log(friendsFriends);

          let loggedUserIndex = friendsFriends.findIndex(friendID => friendID.toString() === req.user._id.toString());
          console.log("Index of logged in user in the friend's friend list " + loggedUserIndex);

          if (loggedUserIndex !== -1) {
              friendsFriends.splice(loggedUserIndex, 1);
          }
          

          // Find and update friend doc
          User.findByIdAndUpdate(theFriend._id, {'friends': friendsFriends}, {new:true}, function(err, theUpdatedFriend) {
              if (err) { return next(err); }
              console.log("Updated friend's friend list");
              console.log(theUpdatedFriend.friends);
              return callback(null, theUpdatedFriend);
          });
        }

      ], (err, results) => {
        if (err) { return next(err); }
        iterCallback();
      });
    }

    // There is only 1 friend to delete
    if (!Array.isArray(friendIDs)) {
      console.log("Found only 1 friend to delete. Converting ID to array.");

      let friendIDsAsList = [];
      friendIDsAsList.push(friendIDs);
      friendIDs = friendIDsAsList;

      console.log(friendIDs);
    }
    
    async.forEachLimit(friendIDs, 1, processDeleteFriend, (err, results) => {
      if (err) { return next(err); }
      
      console.log("Delete friend loop completed");
      res.redirect(req.user.url + "/friends");
    });  
    
  } else {
    res.redirect('/');
  }
};