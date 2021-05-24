const express = require('express');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MediaSchema = new Schema({
    type: { type: String, require: true },
    src: { type: String, required: true },
    caption: { type:String }
});

module.exports = mongoose.model('Media', MediaSchema);