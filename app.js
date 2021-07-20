const express = require('express');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20');
const cookieSession = require('cookie-session');
const LocalStrategy = require('passport-local').Strategy;
const flash = require('connect-flash');
const createError = require('http-errors');
const path = require('path');
const async = require('async');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const fs = require('fs');
const mongoose = require('mongoose');
mongoose.set('useFindAndModify', false);
const Schema = mongoose.Schema;
require('dotenv').config();

// Image upload packages
const formidable =  require('formidable');
const crypto = require('crypto'); // to generate file name
const multer = require('multer');
const GridFsStorage = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');

const indexRouter = require('./routes/index');
const profileRouter = require('./routes/profile');

const User = require('./models/userSchema');
const Profile = require('./models/profileSchema');

const app = express();

// Set up the mongoose connection
const mongodb = `mongodb+srv://admin-lauren:${process.env.MONGODB_PASSWORD}@cluster0.jdtsv.mongodb.net/coucou?retryWrites=true&w=majority`;
mongoose.connect(mongodb, {useNewUrlParser: true, useUnifiedTopology: true});

// Get the default connection
const db = mongoose.connection;

// Bind connection to error event (to get notification of connection errors)
db.on('error', console.error.bind(console, 'MongoDB connection error: '));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Cookie Session configuration
app.use(cookieSession({
  maxAge: 24*60*60*1000, // One day in ms
  keys: [process.env.COOKIE_SESSION_KEY]
}));

app.use(session({ secret: process.env.SESSION_SECRET, resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(multer({ 
  dest: './uploads/', 
  rename: function(fieldname, filename){
    return filename;
  }
}).any());


// Configure LOCAL passport authentication strategy
passport.use(
  new LocalStrategy((username, password, done) => {
    User.findOne({ username: username }, (err, user) => {
      if (err) { return done(err); }
      if (!user) { 
        return done(null, false, { message: 'Incorrect username' });
      }
      bcrypt.compare(password, user.password, (err, res) => {
        if (res) {
          // passwords match, log user in
          return done(null, user);
        } else {
          // passwords don't match
          return done(null, false, { message: 'Incorrect password' });
        }
      });
    });
  })
);

// Configure GOOGLE passport authentication strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/auth/google/login'
}, 
(accessToken, refreshToken, profile, done) => {
   // done(null, user); // passes the profile data to serializeUser
   User.findOne({ oauthClient: 'google', username: profile.emails[0].value }, (err, user) => {
    if (err) { return done(err); }
    if (!user) { 
      console.log("Google user doesn't exist, creating now...");
      // create user
      bcrypt.hash(profile.id, 10, (err, hashedID) => {
        if (err) { return done(err); }

        async.waterfall([
          function(callback) {
            new User({
              first_name: profile.name.givenName,
              first_name_lower: profile.name.givenName.toLowerCase(),
              last_name: profile.name.familyName,
              last_name_lower: profile.name.familyName.toLowerCase(),
              username: profile.emails[0].value,
              username_lower: profile.emails[0].value.toLowerCase(),
              password: hashedID,
              oauthClient: 'google',
            }).save().then(newUser => callback(null, newUser));
          },

          function(newUser, callback) {
            const profile = new Profile ({
              user: newUser._id,
            });
            profile.save(err => {
              if (err) { return next(err); }
              callback(null, {newUser, profile});
            });
          }
        ], (err, results) => {
          if (err) { return done(err); }
          
          return done(null, results.newUser);
        });
        
      });
    } else {
      console.log("Google user exists, logging them in now...");
      bcrypt.compare(profile.id, user.password, (err, res) => {
        if (res) {
          // passwords match, log user in
          return done(null, user);
        } else {
          // passwords don't match
          return done(null, false, { message: 'ID cannot be authenticated' });
        }
      });
    }
  });
  
}));


// Functions to keep user logged in
passport.serializeUser(function (user, done) {
  done(null, user._id);
});

// Used to decode the received cookie and persist session
passport.deserializeUser(function (id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

app.use((req, res, next) => {
  res.locals.currentUser = req.user;
  next();
});

app.use('/', indexRouter);
app.use('/profile/', profileRouter);


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
