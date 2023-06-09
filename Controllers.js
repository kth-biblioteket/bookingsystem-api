require('dotenv').config()

const eventModel = require('./Models');

const axios = require('axios')
const fs = require("fs");
const path = require('path');


async function readEntry(req, res) {
    try {
        let result = await eventModel.readEntry(req.params.system, req.params.id)
        res.send(result)
    } catch (err) {
        res.send("error: " + err)
    }
}

function substrInBetween(whole_str, str1, str2) {
    if (whole_str.indexOf(str1) === -1 || whole_str.indexOf(str2) === -1) {
        return undefined;
    }
    return whole_str.substring(
        whole_str.indexOf(str1) + str1.length,
        whole_str.indexOf(str2)
    );
}

function truncate(str, max, suffix) {
    return str.length < max ? str : `${str.substr(0, str.substr(0, max - suffix.length).lastIndexOf(' '))}${suffix}`;
}

module.exports = {
    readEntry,
    substrInBetween,
    truncate
};
