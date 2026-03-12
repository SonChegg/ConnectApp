const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeStorage } = require('electron');

const STORE_VERSION = 1;

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
  const numeric = Number(value);

  if (Number.isInteger(numeric) && numeric > 0 && numeric < 65536) {
    return numeric;
  }

  return fallback;
}

class AppStore {
  constructor(baseDir) {
    this.baseDir = baseDir;
    this.profilesFile = path.join(baseDir, 'profiles.json');
    this.credentialsFile = path.join(baseDir, 'credentials.json');
  }

  async init() {
    await ensureJsonFile(this.profilesFile, {
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
}

module.exports = {
  AppStore,
  normalizePort,
  normalizeText
};
