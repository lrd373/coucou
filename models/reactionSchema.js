const express = require('express');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ReactionSchema = new Schema({
    type: { type: String, required: true },
    post: { type: Schema.Types.ObjectId }
});

module.exports = mongoose.model('Reaction', ReactionSchema);