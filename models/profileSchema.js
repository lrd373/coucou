const express = require('express');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProfileSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    profilePic: { type: Schema.Types.ObjectId, ref: 'Media' },
    bio: { type: String },
    media: [{ type: Schema.Types.ObjectId, ref: 'Media' }]
});

ProfileSchema.virtual('url').get(function(){
    return ("/profile/"+this.user);
});

module.exports = mongoose.model('Profile', ProfileSchema);