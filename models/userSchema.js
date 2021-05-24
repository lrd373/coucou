const express = require('express');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    first_name: { type: String, required: true },
    first_name_lower: { type: String },
    last_name: { type: String, required: true },
    last_name_lower: { type: String },
    username: { type: String, required: true },
    password: { type: String, required: true },
    posts: [{ type: Schema.Types.ObjectId, ref: 'Post' }],
    friends: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    reactions: [{ type: Schema.Types.ObjectId, ref: 'Reaction' }]
});

UserSchema.virtual('fullname').get(function(){
    return (this.first_name + " " + this.last_name);
});

UserSchema.virtual('url').get(function() {
    return ('/profile/'+this._id);
});

module.exports = mongoose.model('User', UserSchema);