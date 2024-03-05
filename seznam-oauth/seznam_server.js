import Seznam from './namespace.js';
import { Meteor } from 'meteor/meteor';
import { OAuth } from 'meteor/oauth';
import { ServiceConfiguration } from 'meteor/service-configuration';
import { URLSearchParams } from 'meteor/url';

const hasOwn = Object.prototype.hasOwnProperty;

Seznam.knownScopes = [
  'identity',
  'contact-phone',
  'avatar',
  'adulthood'
];

OAuth.registerService('seznam', 2, null, async (query) => {
    const tokens = await getTokens(query);
    const identity = await getIdentity(tokens.access_token);
    const scopes = tokens.scopes;

    const serviceData = {
        id: tokens.oauth_user_id,
        username: identity.username,
        domain: identity.domain,
        email: tokens.account_name,
        accessToken: OAuth.sealSecret(tokens.access_token),
        tokenType: tokens.token_type,
        scopes: scopes,
        // Avatar scope
        avatar: identity.avatar_url,
        // Adulthood scope
        adulthood: identity.adulthood,
        // Contact-phone scope
        contactPhone: identity.contact_phone
    };

    if (hasOwn.call(tokens, "expires_in")) {
        serviceData.expiresIn = Date.now() + 1000 * parseInt(tokens.expires_in, 10);
    }
    Seznam.knownScopes.forEach(name => {
        if (hasOwn.call(identity, name))
            serviceData[name] = identity[name]
    });

    if (tokens.refresh_token) {
        serviceData.refreshToken = tokens.refresh_token;
    }

    return {
        serviceData,
        options: {
            profile: {
                name: identity.username
            }
        }
    }
});

let userAgent = "Meteor";
if (Meteor.release)
    userAgent += '/${Meteor.release}';

const getTokens = async (query) => {
    const config = await ServiceConfiguration.configurations.findOneAsync({service: 'seznam'});
    if (!config)
        throw new ServiceConfiguration.ConfigError();

    let request;

    try {
        const content = new URLSearchParams({
            grant_type: 'authorization_code',
            code: query.code,
            client_id: config.clientId,
            client_secret: OAuth.openSecret(config.secret),
            redirect_uri: OAuth._redirectUri('seznam', config),
            state: query.state
        })

        request = await fetch("https://login.szn.cz/api/v1/oauth/token", {
            method: "POST",
            headers: {
                Accept: 'application/json',
                "User-Agent": userAgent,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: content,
            redirect: 'follow',
            jar: false
        })
    } catch (err) {
        throw Object.assign(
            new Error(`Failed to complete OAuth handshake with Seznam. ${err.message}`),
            {response: err.response},
        );
    }

    const response = await request.json();

    if (response.error) { // if the http response was a json object with an error attribute
        throw new Error(`Failed to complete OAuth handshake with Seznam. ${response.error}`);
    } else {
        return response;
    }
};

const getIdentity = async (accessToken) => {
    let response

    try {
        response = await fetch("https://login.szn.cz/api/v1/user", {
            method: 'GET',
            headers: {
                "User-Agent": userAgent,
                "Authorization": "bearer " + accessToken,
                Accept: 'application/json'
            }
        })
    } catch (err) {
        throw Object.assign(
            new Error('Failed to fetch identity from Seznam. ${err.message}'),
            {response: err.response},
        );
    }
    return await response.json()
};

Seznam.retrieveCredential = (credentialToken, credentialSecret) => OAuth.retrieveCredential(credentialToken, credentialSecret);
