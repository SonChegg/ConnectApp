const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeStorage } = require('electron');

const STORE_VERSION = 1;

function normalizePortValue(value, fallback, options = {}) {
  const numeric = Number(value);
  const allowZero = Boolean(options.allowZero);

  if (Number.isInteger(numeric) && numeric >= (allowZero ? 0 : 1) && numeric < 65536) {
    return numeric;
  }

  return fallback;
}

async function ensureJsonFile(filePath, defaultValue) {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(defaultValue, null, 2), 'utf8');
  }
}

async function readJson(filePath, defaultValue) {
  await ensureJsonFile(filePath, defaultValue);
  const raw = await fs.readFile(filePath, 'utf8');

  try {
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePort(value, fallback) {
  return normalizePortValue(value, fallback);
}

function normalizeOptionalPort(value, fallback = 0) {
  return normalizePortValue(value, fallback, { allowZero: true });
}

class AppStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.profilesFile = path.join(baseDir, 'profiles.json');
    this.forwardProfilesFile = path.join(baseDir, 'forward-profiles.json');
    this.credentialsFile = path.join(baseDir, 'credentials.json');
  }

  async init() {
    await ensureJsonFile(this.profilesFile, {
      version: STORE_VERSION,
      profiles: []
    });

    await ensureJsonFile(this.forwardProfilesFile, {
      version: STORE_VERSION,
      profiles: []
    });

    await ensureJsonFile(this.credentialsFile, {
      version: STORE_VERSION,
      items: {}
    });
  }

  async listProfiles() {
    const data = await readJson(this.profilesFile, {
      version: STORE_VERSION,
      profiles: []
    });

    return Array.isArray(data.profiles) ? data.profiles : [];
  }

  async getProfile(profileId) {
    const profiles = await this.listProfiles();
    return profiles.find((profile) => profile.id === profileId) || null;
  }

  async upsertProfile(input) {
    const profiles = await this.listProfiles();
    const now = new Date().toISOString();
    const profile = {
      id: input.id || crypto.randomUUID(),
      name: normalizeText(input.name),
      platform: input.platform === 'windows' ? 'windows' : 'linux',
      host: normalizeText(input.host),
      port: normalizePort(input.port, input.platform === 'windows' ? 3389 : 22),
      lastUsername: normalizeText(input.lastUsername),
      note: normalizeText(input.note),
      updatedAt: now
    };

    const existingIndex = profiles.findIndex((item) => item.id === profile.id);

    if (existingIndex === -1) {
      profiles.unshift({
        ...profile,
        createdAt: now
      });
    } else {
      profiles[existingIndex] = {
        ...profiles[existingIndex],
        ...profile
      };
    }

    await writeJson(this.profilesFile, {
      version: STORE_VERSION,
      profiles
    });

    return profile;
  }

  async updateProfileUsername(profileId, lastUsername) {
    const profiles = await this.listProfiles();
    const index = profiles.findIndex((item) => item.id === profileId);

    if (index === -1) {
      return null;
    }

    profiles[index] = {
      ...profiles[index],
      lastUsername: normalizeText(lastUsername),
      updatedAt: new Date().toISOString()
    };

    await writeJson(this.profilesFile, {
      version: STORE_VERSION,
      profiles
    });

    return profiles[index];
  }

  async deleteProfile(profileId) {
    const profiles = await this.listProfiles();
    const nextProfiles = profiles.filter((profile) => profile.id !== profileId);

    await writeJson(this.profilesFile, {
      version: STORE_VERSION,
      profiles: nextProfiles
    });
  }

  async listForwardProfiles() {
    const data = await readJson(this.forwardProfilesFile, {
      version: STORE_VERSION,
      profiles: []
    });

    return Array.isArray(data.profiles) ? data.profiles : [];
  }

  async getForwardProfile(profileId) {
    const profiles = await this.listForwardProfiles();
    return profiles.find((profile) => profile.id === profileId) || null;
  }

  async upsertForwardProfile(input) {
    const profiles = await this.listForwardProfiles();
    const now = new Date().toISOString();
    const profile = {
      id: input.id || crypto.randomUUID(),
      name: normalizeText(input.name),
      host: normalizeText(input.host),
      sshPort: normalizePort(input.sshPort, 22),
      username: normalizeText(input.username),
      localPort: normalizeOptionalPort(input.localPort, 0),
      remoteHost: normalizeText(input.remoteHost) || '127.0.0.1',
      remotePort: normalizePort(input.remotePort, 0),
      note: normalizeText(input.note),
      updatedAt: now
    };

    const existingIndex = profiles.findIndex((item) => item.id === profile.id);

    if (existingIndex === -1) {
      profiles.unshift({
        ...profile,
        createdAt: now
      });
    } else {
      profiles[existingIndex] = {
        ...profiles[existingIndex],
        ...profile
      };
    }

    await writeJson(this.forwardProfilesFile, {
      version: STORE_VERSION,
      profiles
    });

    return profiles.find((item) => item.id === profile.id) || profile;
  }

  async deleteForwardProfile(profileId) {
    const profiles = await this.listForwardProfiles();
    const nextProfiles = profiles.filter((profile) => profile.id !== profileId);

    await writeJson(this.forwardProfilesFile, {
      version: STORE_VERSION,
      profiles: nextProfiles
    });
  }

  makeCredentialKey(descriptor) {
    return [
      descriptor.platform === 'windows' ? 'windows' : 'linux',
      normalizeText(descriptor.host).toLowerCase(),
      String(normalizePort(descriptor.port, descriptor.platform === 'windows' ? 3389 : 22)),
      normalizeText(descriptor.username).toLowerCase()
    ].join('|');
  }

  encryptText(value) {
    if (safeStorage.isEncryptionAvailable()) {
      return {
        encrypted: true,
        value: safeStorage.encryptString(value).toString('base64')
      };
    }

    return {
      encrypted: false,
      value: Buffer.from(value, 'utf8').toString('base64')
    };
  }

  decryptText(record) {
    if (!record || typeof record.value !== 'string') {
      return '';
    }

    const buffer = Buffer.from(record.value, 'base64');

    if (record.encrypted && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buffer);
    }

    return buffer.toString('utf8');
  }

  async readCredentials() {
    return readJson(this.credentialsFile, {
      version: STORE_VERSION,
      items: {}
    });
  }

  async getCredential(descriptor) {
    const data = await this.readCredentials();
    const key = this.makeCredentialKey(descriptor);
    const item = data.items[key];

    if (!item) {
      return null;
    }

    return {
      key,
      platform: item.platform,
      host: item.host,
      port: item.port,
      username: item.username,
      password: this.decryptText(item.secret),
      updatedAt: item.updatedAt
    };
  }

  async hasCredential(descriptor) {
    const data = await this.readCredentials();
    const key = this.makeCredentialKey(descriptor);
    return Boolean(data.items[key]);
  }

  async saveCredential(descriptor) {
    const data = await this.readCredentials();
    const key = this.makeCredentialKey(descriptor);

    data.items[key] = {
      platform: descriptor.platform === 'windows' ? 'windows' : 'linux',
      host: normalizeText(descriptor.host),
      port: normalizePort(descriptor.port, descriptor.platform === 'windows' ? 3389 : 22),
      username: normalizeText(descriptor.username),
      secret: this.encryptText(String(descriptor.password || '')),
      updatedAt: new Date().toISOString()
    };

    await writeJson(this.credentialsFile, data);

    return key;
  }

  async listCredentials() {
    const data = await this.readCredentials();

    return Object.values(data.items).map((item) => ({
      platform: item.platform,
      host: item.host,
      port: item.port,
      username: item.username,
      password: this.decryptText(item.secret),
      updatedAt: item.updatedAt
    }));
  }

  async exportConfigSnapshot() {
    return {
      schema: 'connect-app-config',
      version: 1,
      exportedAt: new Date().toISOString(),
      profiles: await this.listProfiles(),
      forwardProfiles: await this.listForwardProfiles(),
      credentials: await this.listCredentials()
    };
  }

  async importConfigSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new Error('Файл конфига пустой или повреждён.');
    }

    const incomingProfiles = Array.isArray(snapshot.profiles) ? snapshot.profiles : [];
    const incomingForwardProfiles = Array.isArray(snapshot.forwardProfiles) ? snapshot.forwardProfiles : [];
    const incomingCredentials = Array.isArray(snapshot.credentials) ? snapshot.credentials : [];

    const currentProfiles = await this.listProfiles();
    const currentForwardProfiles = await this.listForwardProfiles();
    const currentCredentials = await this.readCredentials();

    const mergedProfiles = new Map(currentProfiles.map((profile) => [profile.id, profile]));
    const mergedForwardProfiles = new Map(currentForwardProfiles.map((profile) => [profile.id, profile]));
    const mergedCredentials = { ...currentCredentials.items };

    for (const input of incomingProfiles) {
      const now = new Date().toISOString();
      const id = normalizeText(input.id) || crypto.randomUUID();

      mergedProfiles.set(id, {
        id,
        name: normalizeText(input.name),
        platform: input.platform === 'windows' ? 'windows' : 'linux',
        host: normalizeText(input.host),
        port: normalizePort(input.port, input.platform === 'windows' ? 3389 : 22),
        lastUsername: normalizeText(input.lastUsername),
        note: normalizeText(input.note),
        createdAt: normalizeText(input.createdAt) || now,
        updatedAt: normalizeText(input.updatedAt) || now
      });
    }

    for (const input of incomingForwardProfiles) {
      const now = new Date().toISOString();
      const id = normalizeText(input.id) || crypto.randomUUID();

      mergedForwardProfiles.set(id, {
        id,
        name: normalizeText(input.name),
        host: normalizeText(input.host),
        sshPort: normalizePort(input.sshPort, 22),
        username: normalizeText(input.username),
        localPort: normalizeOptionalPort(input.localPort, 0),
        remoteHost: normalizeText(input.remoteHost) || '127.0.0.1',
        remotePort: normalizePort(input.remotePort, 0),
        note: normalizeText(input.note),
        createdAt: normalizeText(input.createdAt) || now,
        updatedAt: normalizeText(input.updatedAt) || now
      });
    }

    for (const input of incomingCredentials) {
      const descriptor = {
        platform: input.platform === 'windows' ? 'windows' : 'linux',
        host: normalizeText(input.host),
        port: normalizePort(input.port, input.platform === 'windows' ? 3389 : 22),
        username: normalizeText(input.username)
      };

      if (!descriptor.host || !descriptor.username) {
        continue;
      }

      const key = this.makeCredentialKey(descriptor);

      mergedCredentials[key] = {
        platform: descriptor.platform,
        host: descriptor.host,
        port: descriptor.port,
        username: descriptor.username,
        secret: this.encryptText(String(input.password || '')),
        updatedAt: normalizeText(input.updatedAt) || new Date().toISOString()
      };
    }

    await writeJson(this.profilesFile, {
      version: STORE_VERSION,
      profiles: Array.from(mergedProfiles.values())
    });

    await writeJson(this.forwardProfilesFile, {
      version: STORE_VERSION,
      profiles: Array.from(mergedForwardProfiles.values())
    });

    await writeJson(this.credentialsFile, {
      version: STORE_VERSION,
      items: mergedCredentials
    });

    return {
      profilesCount: mergedProfiles.size,
      forwardProfilesCount: mergedForwardProfiles.size,
      credentialsCount: Object.keys(mergedCredentials).length
    };
  }
}

module.exports = {
  AppStore,
  normalizePort,
  normalizeOptionalPort,
  normalizeText
};
