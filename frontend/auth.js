/* Cognito managed login using the authorization-code flow with PKCE. */
(() => {
  'use strict';
  const cfg = window.GATHER_CONFIG || {};
  const domain = String(cfg.cognitoDomain || '').replace(/\/$/, '');
  const clientId = String(cfg.cognitoClientId || '');
  const prefix = 'gather.auth.' + clientId + '.';
  const tokenKey = prefix + 'tokens', flowKey = prefix + 'flow';
  const redirectUri = window.location.origin + '/';
  let refreshInFlight = null;
  const read = key => { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } };
  const write = (key, value) => sessionStorage.setItem(key, JSON.stringify(value));
  const base64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const random = size => base64url(crypto.getRandomValues(new Uint8Array(size)));
  const configured = Boolean(cfg.apiUrl && domain && clientId);

  async function exchange(params) {
    const result = await fetch(domain + '/oauth2/token', {method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'}, body:new URLSearchParams(params)});
    const data = await result.json().catch(() => ({}));
    if (!result.ok || !data.access_token || !Number.isFinite(Number(data.expires_in))) throw Error('Sign-in could not be completed. Please try again.');
    const previous = read(tokenKey) || {};
    write(tokenKey, {accessToken:data.access_token, refreshToken:data.refresh_token || (params.grant_type === 'refresh_token' ? previous.refreshToken : '') || '', expiresAt:Date.now()+Number(data.expires_in)*1000});
    return data.access_token;
  }

  async function completeRedirect() {
    const params = new URLSearchParams(location.search);
    if (!params.has('code') && !params.has('error')) return;
    // Remove the code from the address bar, including on failure.
    history.replaceState(null, '', redirectUri);
    const flow = read(flowKey);
    sessionStorage.removeItem(flowKey);
    if (params.has('error')) throw Error('Sign-in was cancelled or could not be completed.');
    if (!flow || !flow.verifier || params.get('state') !== flow.state) throw Error('Sign-in session expired. Please try again.');
    await exchange({grant_type:'authorization_code',client_id:clientId,code:params.get('code'),redirect_uri:redirectUri,code_verifier:flow.verifier});
  }

  async function signIn() {
    if (!configured) throw Error('AWS sign-in is not configured.');
    const verifier = random(48), state = random(24);
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    write(flowKey, {verifier, state});
    const query = new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirectUri,scope:'openid email',state,code_challenge_method:'S256',code_challenge:challenge});
    location.assign(domain + '/oauth2/authorize?' + query);
  }

  async function accessToken() {
    const tokens = read(tokenKey);
    if (!tokens || !tokens.accessToken) return null;
    if (tokens.expiresAt > Date.now() + 60000) return tokens.accessToken;
    if (!tokens.refreshToken) { sessionStorage.removeItem(tokenKey); return null; }
    if (!refreshInFlight) {
      refreshInFlight = exchange({grant_type:'refresh_token',client_id:clientId,refresh_token:tokens.refreshToken})
        .catch(() => { sessionStorage.removeItem(tokenKey); return null; }).finally(() => { refreshInFlight = null; });
    }
    return refreshInFlight;
  }

  function signOut() {
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(flowKey);
    const query = new URLSearchParams({client_id:clientId,logout_uri:redirectUri});
    location.assign(domain + '/logout?' + query);
  }
  window.GatherAuth = {configured,completeRedirect,signIn,accessToken,signOut};
})();
