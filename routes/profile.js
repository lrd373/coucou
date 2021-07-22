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
const profilePostsController = require('../controllers/profilePosts');
const profileFriendsController = require('../controllers/profileFriends');
const profilePhotosController = require('../controllers/profilePhotos');


// *************************** PROFILE  ********************************

// Home page Profile redirect
router.get('/', profileController.homePageRedirect);

// GET default profile page
router.get('/:id', profileController.getProfilePage);


    // *************************** HEADER EDITS  ******************************

    // GET bio edit form
    router.get('/:id/edit-profile-bio', profileController.getProfileBioEdit);

    // POST to bio edit form
    router.post('/:id/edit-profile-bio', profileController.postToProfileBioEdit);

    // GET edit profile pic page
    router.get('/:id/edit-profile-picture', profileController.getProfilePicEdit);

    // POST edit profile pic page
    router.post('/:id/edit-profile-picture', profileController.postProfilePicEdit);


    // *************************** POSTS TAB  ********************************

    // GET posts tab
    router.get('/:id/posts', profilePostsController.getProfilePosts);

    // GET new post form
    router.get('/:id/posts/create-post', profilePostsController.getNewPostForm);

    // POST -- create new post
    router.post('/:id/posts/create-post', profilePostsController.postNewPostForm);

    // GET delete posts tab
    router.get('/:id/posts/delete-posts', profilePostsController.getDeletePosts);

    // POST delete posts
    router.post('/:id/posts/delete-posts', profilePostsController.postDeletePosts);


    // *************************** FRIENDS TAB  ********************************

    // GET default friends tab
    router.get('/:id/friends', profileFriendsController.getProfileFriends);

    // GET friends tab with new friend form
    router.get('/:id/friends/add-friend-form', profileFriendsController.getAddFriendForm);

    // POST friends tab search by friend details
    router.post('/:id/friends/search-friend', profileFriendsController.postSearchFriend);

    // POST friends tab with new friend form
    router.post('/:id/friends/add-friend', profileFriendsController.postAddFriend);

    // GET delete friends
    router.get('/:id/friends/remove-friends', profileFriendsController.getDeleteFriends);

    // POST delete friends
    router.post('/:id/friends/remove-friends', profileFriendsController.postDeleteFriends);


    // *************************** PHOTOS TAB  ********************************

    // GET profile photos tab
    router.get('/:id/photos', profileController.getProfilePhotos);

    // GET new profile media form
    router.get('/:id/photos/add-photos', profileController.getProfileMediaForm);

    // POST to new profile media form
    router.post('/:id/photos/add-photos', profileController.postProfileMediaForm);

    // GET delete photo form
    router.get('/:id/photos/delete-photos', profileController.getDeletePhotos);

    // POST delete photo form
    router.post('/:id/photos/delete-photos', profileController.postDeletePhotos);


module.exports = router;