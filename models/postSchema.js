const express = require('express');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { DateTime } = require('luxon');

const PostSchema = new Schema({
    text: { type: String, required: true },
    date_created: { type: Date },
    date_last_updated: { type: Date },
    media: [{ type: Schema.Types.ObjectId, ref: 'Media' }]
    // add reaction array
});

PostSchema.virtual('date_created_local').get(function(){
    return (DateTime.fromJSDate(this.date_created).toLocaleString());
});

PostSchema.virtual('date_last_updated_local').get(function(){
    return (DateTime.fromJSDate(this.date_last_updated).toLocaleString(DateTime.DATE_FULL));
});


module.exports = mongoose.model('Post', PostSchema);