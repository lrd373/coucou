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


// *************************** PROFILE  ********************************

// Home page Profile redirect
router.get('/', profileController.homePageRedirect);

// GET default profile page
router.get('/:id', profileController.getProfilePage);

// GET posts tab
router.get('/:id/posts', profileController.getProfilePosts);

// GET default friends tab
router.get('/:id/friends', profileController.getProfileFriends);

// GET friends tab with new friend form
router.get('/:id/friends/add-friend-form', profileController.profileAddFriendForm);

// POST friends tab search by friend details
router.post('/:id/friends/search-friend', profileController.profileSearchFriend);

// POST friends tab with new friend form
router.post('/:id/friends/add-friend', profileController.profileAddFriend);

// GET profile -- photos tab
router.get('/:id/photos', profileController.getProfilePhotos);

// GET profile edit form
router.get('/profile-bio-edit', profileController.getProfileBioEdit);

// POST to profile edit form
router.post('/profile-bio-edit', profileController.postToProfileBioEdit);

// GET edit profile pic page
router.get('/:id/edit-profile-picture', profileController.getProfilePicEdit);

// POST edit profile pic page
router.post('/:id/edit-profile-picture', profileController.postProfilePicEdit);

// GET new post form
router.get('/:id/create-post', profileController.getNewPostForm);

// POST -- create new post
router.post('/:id/create-post', profileController.postNewPostForm);

// GET new profile media form
router.get('/:id/add-profile-media', profileController.getProfileMediaForm);

// POST to new profile media form
router.post('/:id/add-profile-media', profileController.postProfileMediaForm);

module.exports = router;