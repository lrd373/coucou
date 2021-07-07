const express = require('express');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MediaSchema = new Schema({
    altText: { type: String },
    img: { data: Buffer, contentType: String }
});

module.exports = mongoose.model('Media', MediaSchema);