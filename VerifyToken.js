const jwt = require("jsonwebtoken");
var jwkToPem = require('jwk-to-pem');
const axios = require('axios');

function verifyToken(req, res, next) {
    let token = req.body.apikey
        || req.query.apikey
        || req.headers['x-access-token']
        || req.headers['authorization']
        || req.headers['kth-ug-token']
        || req.cookies.jwt

    if (!token)
        return res.json('No token')

    if (req.headers['x-access-token'] || req.cookies.jwt) {
        jwt.verify(token, process.env.SECRET, async function (err, decoded) {
            if (err) {
                res.clearCookie("jwt")
                res.status(401).send({ auth: false, message: 'Failed to authenticate token, ' + err.message });
            } else {
                next()
            }
        });
    } else {
        if (token != process.env.API_KEY_WRITE) {
            res.clearCookie("jwt")
            res.json({ success: false, message: 'Failed to authenticate token.' });
        } else {
            next();
        }
    }
}

module.exports = verifyToken;