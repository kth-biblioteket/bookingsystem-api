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
        return res.render('pages/login',{logindata: {"status":"ok", "message":"No token"}})

    if (req.headers['x-access-token'] || req.cookies.jwt) {
        jwt.verify(token, process.env.SECRET, async function (err, decoded) {
            if (err) {
                res.clearCookie("jwt")
                res.status(401).send({ auth: false, message: 'Failed to authenticate token, ' + err.message });
            }

            //Hämta kthuguser-data och kontrollera grupptillhörighet
            req.userprincipalname = decoded.id;
            kthaccount= req.userprincipalname.split('@')[0];
            let response
            try {
                response = await axios.get('http://' + process.env.LDAPAPIPATH + 'account/' + kthaccount + '?token=' + process.env.LDAPAPIKEYREAD, req.body)
            } catch(err) {
                res.status(400).send({ auth: false, message: 'General error' + err.message });
            }
            if (response.data.ugusers) {
                if (response.data.ugusers[0].kthPAGroupMembership) {
                    
                    let authorized = false;
                    let authorizedgroupsarray = process.env.AUTHORIZEDGROUPS.split(';')
                    for (i=0 ; i < authorizedgroupsarray.length; i++) {
                        if (response.data.ugusers[0].kthPAGroupMembership.indexOf(authorizedgroupsarray[i]) !== -1) {
                            authorized = true;
                            break;
                        }
                    }
                    
                    if (authorized) {
                        req.token = jwt.sign({ id: req.userprincipalname }, process.env.SECRET, {
                            expiresIn: "7d"
                        });
                        next();
                    } else {
                        res.clearCookie("jwt")
                        res.render('pages/login',{logindata: {"status":"error", "message":"Not authorized"}})
                    }
    
                } else {
                    res.clearCookie("jwt")
                    res.render('pages/login',{logindata: {"status":"error", "message":"No groups in UG"}})
                }
            } else {
                res.clearCookie("jwt")
                res.render('pages/login',{logindata: {"status":"error", "message":"No user found"}})
            }
        });
    } else {
        if (token != process.env.APIKEY) {
            res.clearCookie("jwt")
            res.json({ success: false, message: 'Failed to authenticate token.' });
        } else {
            next();
        }
    }
}

module.exports = verifyToken;