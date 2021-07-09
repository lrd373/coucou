const express = require('express');
const path = require('path');
const async = require('async');
const router = express.Router();
const mongoose = require('mongoose');

// Image upload packages
const fs = require('fs');
const formidable =  require('formidable');
const crypto = require('crypto'); // to generate file name
const multer = require('multer');
const GridFsStorage = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');
const app = require('../app');

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

// GET profile -- posts tab
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
            
            res.render('profile', { currentUser: req.user, user: results.user, profile: results.profile, tab: "posts" });
        });
    } else {
        res.redirect('/');
    }
};

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
            // FIND IMAGE DATA STORED IN MEDIA CHUNK AS DATA BINARY 
        }, (err, results) => {
            if (err) { return next(err); }
            
            res.render('profile', { currentUser: req.user, user: results.user, profile: results.profile, tab: "friends" });
        });
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

// GET profile edit form
exports.getProfileBioEdit = (req, res) => {
    if (req.user) {
        Profile.findOne({'user': req.user._id})
        .populate('profilePic')
        .populate('media')
        .exec((err, profile) => {
            if (err) { return next(err); }
            res.render('profile-form', { profile: profile });
        }); 
    } else {
        res.redirect('/');
    }
};

// POST to profile edit form
exports.postToProfileBioEdit = (req, res, next) => {

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
                profilePic: profileData.profilePic,
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
};

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
                contentType: 'image/png'
            }
        });

        async.waterfall([

            function(callback) { // save pic file to Mongo DB
                newPic.save((err, thePic) => {
                    if (err) { return next(err); }

                    callback(null, thePic);
                });
            },

            function(profilePic, callback) {  // find current profile obj in Mongo DB
                let picId = profilePic._id;
                Profile.findOne({'user': req.user._id}).exec((err, foundProfile) => {
                    callback(null, foundProfile, picId);
                });
            },

            function(currentProfile, picId, callback) {
                let updatedProfile = new Profile ({
                    user: currentProfile.user,
                    profilePic: picId,
                    bio: currentProfile.bio,
                    media: currentProfile.media,
                    _id: currentProfile._id
                });

                Profile.findByIdAndUpdate(currentProfile._id, updatedProfile, { new: true }, function(err, newProfile){
                    if (err) { return next(err); }
                    callback(null, newProfile);
                });
            },

            function(updatedProfile, callback) {
                // delete file from uploads folder
                callback(null, updatedProfile);
            }
        ], (err, updatedProfile) => {
            if (err) { return next(err); }

            // reload profile page
            res.redirect('/profile/'+req.user._id);
        });
    
    // Any other security risks??
    // sanitize file name (npm sanitize-filename)
}];


// GET new post form
exports.getNewPostForm = (req, res, next) => {
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
            res.render('profile', {newPostForm: true, user: results.user, profile: results.profile});
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
            
            res.render('profile', { newMediaForm: true, currentUser: req.user, user: results.user, profile: results.profile });
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
                // delete file from uploads folder
                callback(null, updatedProfile);
            }
        ], (err, updatedProfile) => {
            if (err) { return next(err); }

            // reload profile page
            res.redirect('/profile/'+req.user._id);
        });
        
    } else {
        res.redirect('/');
    }
}

exports.profileAddFriendForm = (req, res, next) => {
    if (req.user) {
        res.render('add-friend-form');
    } else {
        res.redirect('/');
    }
}

exports.profileSearchFriend =  (req, res, next) => {
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
  }

exports.profileAddFriend = (req, res, next) => {
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
          res.redirect('/profile/'+ theUser._id + "/friends/");
        });
      }
    } else {
      res.redirect('/');
    }
  }