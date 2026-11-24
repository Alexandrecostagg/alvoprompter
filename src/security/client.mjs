const binary = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const text = buffer => btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function passkeysSupported() {
  return Boolean(globalThis.isSecureContext && globalThis.PublicKeyCredential && globalThis.navigator?.credentials);
}
export async function conditionalPasskeysSupported() {
  if (!passkeysSupported()) return false;
  try {
    if (PublicKeyCredential.getClientCapabilities) return Boolean((await PublicKeyCredential.getClientCapabilities()).conditionalGet);
    return Boolean(await PublicKeyCredential.isConditionalMediationAvailable?.());
  } catch { return false; }
}
function creationOptions(options) {
  if (PublicKeyCredential.parseCreationOptionsFromJSON) return PublicKeyCredential.parseCreationOptionsFromJSON(options);
  return { ...options, challenge: binary(options.challenge), user: { ...options.user, id: binary(options.user.id) },
    excludeCredentials: (options.excludeCredentials || []).map(c => ({ ...c, id: binary(c.id) })) };
}
function requestOptions(options) {
  if (PublicKeyCredential.parseRequestOptionsFromJSON) return PublicKeyCredential.parseRequestOptionsFromJSON(options);
  return { ...options, challenge: binary(options.challenge),
    allowCredentials: (options.allowCredentials || []).map(c => ({ ...c, id: binary(c.id) })) };
}
function serialize(credential) {
  if (!credential) throw new Error('Nenhuma chave foi selecionada.');
  if (credential.toJSON) return credential.toJSON();
  const response = { clientDataJSON: text(credential.response.clientDataJSON) };
  for (const field of ['attestationObject', 'authenticatorData', 'signature', 'userHandle']) {
    const value = credential.response[field];
    if (value) response[field] = text(value);
  }
  if (credential.response.getTransports) response.transports = credential.response.getTransports();
  return { id: credential.id, rawId: text(credential.rawId), type: credential.type, response,
    authenticatorAttachment: credential.authenticatorAttachment,
    clientExtensionResults: credential.getClientExtensionResults() };
}
export function createPasskeyClient({ endpoint = '/auth/passkeys', headers = async () => ({}) } = {}) {
  async function api(path, data, method = 'POST') {
    const response = await fetch(endpoint + path, { method, credentials: 'same-origin', redirect: 'error',
      headers: { ...await headers(), ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method !== 'GET' ? { body: JSON.stringify(data || {}) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || result.erro || 'Não foi possível usar a chave de acesso.');
    return result;
  }
  return {
    available: () => api('/config', null, 'GET').then(r => Boolean(r.enabled && r.origins?.includes(location.origin))).catch(() => false),
    async register({ password, label } = {}) {
      if (!passkeysSupported()) throw new Error('Este dispositivo não oferece chaves de acesso neste endereço.');
      const start = await api('/registration/options', { password });
      const credential = await navigator.credentials.create({ publicKey: creationOptions(start.options) });
      return api('/registration/verify', { challengeId: start.challengeId, credential: serialize(credential), password, label });
    },
    async authenticate({ conditional = false, signal } = {}) {
      if (!passkeysSupported()) throw new Error('Este dispositivo não oferece chaves de acesso neste endereço.');
      const start = await api('/authentication/options');
      const credential = await navigator.credentials.get({ publicKey: requestOptions(start.options),
        mediation: conditional ? 'conditional' : 'optional', signal });
      return api('/authentication/verify', { challengeId: start.challengeId, credential: serialize(credential) });
    },
    list: () => api('/credentials', null, 'GET'),
    remove: (id, password) => api('/credentials/remove', { id, password }),
  };
}
