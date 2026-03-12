const state = {
  platform: '',
  profiles: [],
  forwardProfiles: [],
  forwards: [],
  programs: {
    items: [],
    hasBundledFxSoundPreset: false,
    bundledFxSoundPresetPath: '',
    fxSoundPresetTargetDir: ''
  },
  installBusy: new Set(),
  installAllBusy: false
};

const elements = {};
let toastTimer = null;

function byId(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;

  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 4200);
}

function closeDialog(dialogId) {
  const dialog = byId(dialogId);

  if (dialog.open) {
    dialog.close();
  }
}

function openDialog(dialogId) {
  byId(dialogId).showModal();
}

function getProfileById(profileId) {
  return state.profiles.find((profile) => profile.id === profileId) || null;
}

function getActiveForwardForProfile(profileId) {
  return state.forwards.find((forward) => forward.forwardProfileId === profileId) || null;
}

function buildForwardUrl(localPort) {
  return `http://127.0.0.1:${localPort}`;
}

function renderPlatformHint() {
  if (state.platform === 'win32') {
    elements.platformHint.textContent = 'Windows mode';
    elements.fxSoundHint.textContent = '';
    return;
  }

  elements.platformHint.textContent = 'Dev preview';
  elements.fxSoundHint.textContent = 'Сейчас открыта не Windows-среда. UI доступен, но RDP, Windows Terminal и тихие установщики можно проверить только на Windows.';
}

function renderProfiles() {
  if (state.profiles.length === 0) {
    elements.profilesGrid.innerHTML = `
      <div class="empty-state">
        <div>
          <p class="hint-card__title">Пока нет профилей</p>
          <p class="subtle">Нажми "Добавить профиль", сохрани Linux или Windows сервер, и он появится здесь отдельной плашкой.</p>
        </div>
      </div>
    `;
    return;
  }

  elements.profilesGrid.innerHTML = state.profiles.map((profile) => {
    const badgeClass = profile.platform === 'windows' ? 'badge--windows' : 'badge--linux';
    const badgeText = profile.platform === 'windows' ? 'Windows / RDP' : 'Linux / SSH';
    const connectLabel = profile.hasSavedCredential ? 'Открыть консоль' : 'Подключиться';

    return `
      <article class="profile-card" data-profile-id="${escapeHtml(profile.id)}">
        <div class="profile-card__head">
          <span class="badge ${badgeClass}">${badgeText}</span>
          <button class="icon-button" data-action="delete-profile" data-profile-id="${escapeHtml(profile.id)}">Удалить</button>
        </div>

        <div>
          <h3>${escapeHtml(profile.name)}</h3>
          <p class="subtle">${escapeHtml(profile.host)}:${escapeHtml(profile.port)}</p>
        </div>

        <div class="meta-list">
          <span><strong>Логин:</strong> ${escapeHtml(profile.lastUsername || 'не задан')}</span>
          <span><strong>Пароль:</strong> ${profile.hasSavedCredential ? 'сохранён' : 'не сохранён'}</span>
          <span><strong>Заметка:</strong> ${escapeHtml(profile.note || 'нет')}</span>
        </div>

        <div class="profile-card__actions">
          <div class="profile-card__button-row">
            <button class="button button--primary" data-action="connect-profile" data-profile-id="${escapeHtml(profile.id)}">${connectLabel}</button>
            <button class="button" data-action="edit-profile" data-profile-id="${escapeHtml(profile.id)}">Редактировать</button>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderForwards() {
  const temporaryForwards = state.forwards.filter((forward) => !forward.forwardProfileId);

  if (temporaryForwards.length === 0) {
    elements.forwardList.innerHTML = `
      <div class="empty-state">
        <div>
          <p class="hint-card__title">Временных пробросов нет</p>
          <p class="subtle">Сохранённые пробросы ниже не пропадают после остановки. Здесь показываются только временные туннели без сохранения в конфиг.</p>
        </div>
      </div>
    `;
    return;
  }

  elements.forwardList.innerHTML = temporaryForwards.map((forward) => `
    <article class="forward-card">
      <div class="forward-card__head">
        <div>
          <h3>${escapeHtml(forward.name)}</h3>
          <p class="subtle">${escapeHtml(forward.username)}@${escapeHtml(forward.host)}:${escapeHtml(forward.sshPort)}</p>
        </div>
        <button class="button" data-action="stop-forward" data-forward-id="${escapeHtml(forward.id)}">Остановить</button>
      </div>

      <div class="meta-list">
        <span><strong>Локально:</strong> 127.0.0.1:${escapeHtml(forward.localPort)}</span>
        <span><strong>Удалённо:</strong> ${escapeHtml(forward.remoteHost)}:${escapeHtml(forward.remotePort)}</span>
      </div>

      <div class="profile-card__button-row">
        <button class="button" data-action="open-forward-link" data-forward-url="${escapeHtml(buildForwardUrl(forward.localPort))}">Открыть в браузере</button>
      </div>
    </article>
  `).join('');
}

function renderForwardProfiles() {
  if (state.forwardProfiles.length === 0) {
    elements.forwardPresetList.innerHTML = `
      <div class="empty-state">
        <div>
          <p class="hint-card__title">Шаблонов пока нет</p>
          <p class="subtle">Создай проброс и оставь галочку сохранения в конфиг, чтобы этот маршрут можно было запускать повторно.</p>
        </div>
      </div>
    `;
    return;
  }

  elements.forwardPresetList.innerHTML = state.forwardProfiles.map((profile) => {
    const activeForward = getActiveForwardForProfile(profile.id);
    const isActive = Boolean(activeForward);
    const localPort = isActive ? activeForward.localPort : profile.localPort;
    const openUrl = localPort ? buildForwardUrl(localPort) : '';

    return `
      <article class="forward-card">
        <div class="forward-card__head">
          <div>
            <h3>${escapeHtml(profile.name)}</h3>
            <p class="subtle">${escapeHtml(profile.username)}@${escapeHtml(profile.host)}:${escapeHtml(profile.sshPort)}</p>
          </div>
          <span class="badge ${isActive ? 'badge--linux' : ''}">${isActive ? 'Активен' : 'Остановлен'}</span>
        </div>

        <div class="meta-list">
          <span><strong>Маршрут:</strong> 127.0.0.1:${escapeHtml(localPort || 0)} -> ${escapeHtml(profile.remoteHost)}:${escapeHtml(profile.remotePort)}</span>
          <span><strong>Ссылка:</strong> ${isActive ? escapeHtml(openUrl) : 'станет доступна после запуска'}</span>
          <span><strong>Заметка:</strong> ${escapeHtml(profile.note || 'нет')}</span>
        </div>

        <div class="profile-card__button-row">
          <button class="button button--primary" data-action="${isActive ? 'stop-forward-profile' : 'start-forward-profile'}" data-forward-profile-id="${escapeHtml(profile.id)}" data-forward-id="${escapeHtml(activeForward ? activeForward.id : '')}">
            ${isActive ? 'Остановить' : 'Прокинуть'}
          </button>
          <button class="button" data-action="edit-forward-profile" data-forward-profile-id="${escapeHtml(profile.id)}">Изменить</button>
          <button class="button" data-action="delete-forward-profile" data-forward-profile-id="${escapeHtml(profile.id)}">Удалить</button>
          ${isActive ? `<button class="button" data-action="open-forward-link" data-forward-url="${escapeHtml(openUrl)}">Открыть в браузере</button>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

function renderPrograms() {
  elements.programsList.innerHTML = state.programs.items.map((program) => {
    const busy = state.installAllBusy || state.installBusy.has(program.id);

    return `
      <article class="program-card">
        <div class="program-card__meta">
          <h3>${escapeHtml(program.name)}</h3>
        </div>

        <div class="program-card__actions">
          <span class="badge">${program.kind.toUpperCase()}</span>
          <button class="button button--primary" data-action="install-program" data-program-id="${escapeHtml(program.id)}" ${busy ? 'disabled' : ''}>
            ${busy ? 'Работает...' : escapeHtml(program.actionLabel)}
          </button>
        </div>
      </article>
    `;
  }).join('');

  elements.fxSoundTargetPath.textContent = `Папка назначения: ${state.programs.fxSoundPresetTargetDir}`;
  elements.bundledPresetPath.textContent = state.programs.hasBundledFxSoundPreset
    ? `Встроенный файл найден: ${state.programs.bundledFxSoundPresetPath}`
    : `Если хочешь встроенный пресет в сборке, положи файл сюда: ${state.programs.bundledFxSoundPresetPath}`;

  elements.installBundledPresetButton.disabled = !state.programs.hasBundledFxSoundPreset;
  elements.installAllProgramsButton.disabled = state.installAllBusy;
}

function renderForwardProfileOptions() {
  const linuxProfiles = state.profiles.filter((profile) => profile.platform === 'linux');

  elements.forwardProfileSelect.innerHTML = [
    '<option value="">Без профиля</option>',
    ...linuxProfiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)} (${escapeHtml(profile.host)})</option>`)
  ].join('');
}

function syncForwardProfile(profileId) {
  const profile = getProfileById(profileId);

  if (!profile) {
    return;
  }

  elements.forwardHost.value = profile.host;
  elements.forwardSshPort.value = String(profile.port || 22);
  elements.forwardUsername.value = profile.lastUsername || '';
}

function openProfileModal(profile = null) {
  elements.profileDialogTitle.textContent = profile ? 'Редактирование профиля' : 'Новый профиль';
  elements.profileId.value = profile ? profile.id : '';
  elements.profileName.value = profile ? profile.name : '';
  elements.profilePlatform.value = profile ? profile.platform : 'linux';
  elements.profilePort.value = profile ? String(profile.port) : '22';
  elements.profileHost.value = profile ? profile.host : '';
  elements.profileUsername.value = profile ? (profile.lastUsername || '') : '';
  elements.profileNote.value = profile ? (profile.note || '') : '';
  openDialog('profileDialog');
}

function openConnectModal(profileId) {
  const profile = getProfileById(profileId);

  if (!profile) {
    return;
  }

  elements.connectProfileId.value = profile.id;
  elements.connectTitle.textContent = profile.name;
  elements.connectDescription.textContent = `${profile.platform === 'windows' ? 'Windows / RDP' : 'Linux / SSH'} • ${profile.host}:${profile.port}`;
  elements.connectUsername.value = profile.lastUsername || '';
  elements.connectPassword.value = '';
  elements.connectRemember.checked = true;
  openDialog('connectDialog');
}

function getForwardProfileById(profileId) {
  return state.forwardProfiles.find((profile) => profile.id === profileId) || null;
}

function openForwardModal(profile = null) {
  elements.forwardForm.reset();
  elements.forwardDialogTitle.textContent = profile ? 'Изменить проброс' : 'Проброс порта';
  elements.forwardPresetId.value = profile ? profile.id : '';
  elements.forwardName.value = profile ? profile.name : '';
  elements.forwardHost.value = profile ? profile.host : '';
  elements.forwardSshPort.value = profile ? String(profile.sshPort || 22) : '22';
  elements.forwardUsername.value = profile ? profile.username : '';
  elements.forwardLocalPort.value = profile ? String(profile.localPort || 0) : '';
  elements.forwardRemoteHost.value = profile ? profile.remoteHost : '127.0.0.1';
  elements.forwardRemotePort.value = profile ? String(profile.remotePort || '') : '';
  elements.forwardPassword.value = '';
  elements.forwardRemember.checked = true;
  elements.forwardSaveToConfig.checked = true;
  elements.forwardProfileSelect.value = '';
  renderForwardProfileOptions();
  openDialog('forwardDialog');
}

function applyBootstrapState(payload) {
  state.platform = payload.platform;
  state.profiles = payload.profiles;
  state.forwardProfiles = payload.forwardProfiles;
  state.forwards = payload.forwards;
  state.programs = payload.programs;
  renderPlatformHint();
  renderProfiles();
  renderForwards();
  renderForwardProfiles();
  renderPrograms();
  renderForwardProfileOptions();
}

async function refreshAppState() {
  const payload = await window.connectApp.bootstrap();
  applyBootstrapState(payload);
}

async function handleProfileSubmit(event) {
  event.preventDefault();

  try {
    await window.connectApp.saveProfile({
      id: elements.profileId.value,
      name: elements.profileName.value,
      platform: elements.profilePlatform.value,
      host: elements.profileHost.value,
      port: elements.profilePort.value,
      lastUsername: elements.profileUsername.value,
      note: elements.profileNote.value
    });

    await refreshAppState();
    closeDialog('profileDialog');
    showToast('Профиль сохранён.');
  } catch (error) {
    showToast(error.message);
  }
}

async function handleQuickConnect(profileId) {
  const profile = getProfileById(profileId);

  if (!profile) {
    return;
  }

  if (!profile.hasSavedCredential || !profile.lastUsername) {
    openConnectModal(profileId);
    return;
  }

  try {
    const result = await window.connectApp.connectProfile({
      profileId,
      username: profile.lastUsername,
      password: '',
      remember: false
    });

    await refreshAppState();
    showToast(result.message || 'Подключение запущено.');
  } catch (error) {
    if (error.message.includes('Пароль не найден') || error.message.includes('Логин не заполнено')) {
      await refreshAppState();
      openConnectModal(profileId);
      showToast('Сохранённая учётка недоступна. Введите логин и пароль заново.');
      return;
    }

    showToast(error.message);
  }
}

async function handleConnectSubmit(event) {
  event.preventDefault();

  try {
    const result = await window.connectApp.connectProfile({
      profileId: elements.connectProfileId.value,
      username: elements.connectUsername.value,
      password: elements.connectPassword.value,
      remember: elements.connectRemember.checked
    });

    const profile = getProfileById(elements.connectProfileId.value);

    if (profile) {
      profile.lastUsername = elements.connectUsername.value.trim();
    }

    await refreshAppState();
    closeDialog('connectDialog');
    showToast(result.message || 'Подключение запущено.');
  } catch (error) {
    showToast(error.message);
  }
}

async function handleForwardSubmit(event) {
  event.preventDefault();

  try {
    const result = await window.connectApp.startForward({
      id: elements.forwardPresetId.value,
      name: elements.forwardName.value,
      host: elements.forwardHost.value,
      sshPort: elements.forwardSshPort.value,
      username: elements.forwardUsername.value,
      localPort: elements.forwardLocalPort.value,
      remoteHost: elements.forwardRemoteHost.value,
      remotePort: elements.forwardRemotePort.value,
      password: elements.forwardPassword.value,
      remember: elements.forwardRemember.checked,
      saveToConfig: elements.forwardSaveToConfig.checked
    });

    await refreshAppState();
    showToast(result.message);
    closeDialog('forwardDialog');
  } catch (error) {
    showToast(error.message);
  }
}

async function handleStopForward(forwardId) {
  if (!forwardId) {
    await refreshAppState();
    showToast('Активный проброс не найден.');
    return;
  }

  try {
    const result = await window.connectApp.stopForward(forwardId);

    if (!result.stopped) {
      await refreshAppState();
      showToast('Проброс уже остановлен или не найден.');
      return;
    }

    await refreshAppState();
    showToast('Проброс остановлен.');
  } catch (error) {
    showToast(error.message);
  }
}

async function openForwardUrl(url) {
  try {
    await window.connectApp.openExternal(url);
  } catch (error) {
    showToast(error.message);
  }
}

async function handleInstallProgram(programId) {
  state.installBusy.add(programId);
  renderPrograms();

  try {
    const result = await window.connectApp.installProgram(programId);
    showToast(result.message);
  } catch (error) {
    showToast(error.message);
  } finally {
    state.installBusy.delete(programId);
    renderPrograms();
  }
}

async function handleInstallAllPrograms() {
  state.installAllBusy = true;
  renderPrograms();

  try {
    const result = await window.connectApp.installAllPrograms();
    showToast(result.message);
  } catch (error) {
    showToast(error.message);
  } finally {
    state.installAllBusy = false;
    renderPrograms();
  }
}

async function handleDeleteProfile(profileId) {
  const profile = getProfileById(profileId);

  if (!profile) {
    return;
  }

  const confirmed = window.confirm(`Удалить профиль "${profile.name}"?`);

  if (!confirmed) {
    return;
  }

  try {
    await window.connectApp.deleteProfile(profileId);
    await refreshAppState();
    showToast('Профиль удалён.');
  } catch (error) {
    showToast(error.message);
  }
}

async function handleDeleteForwardProfile(profileId) {
  const profile = getForwardProfileById(profileId);

  if (!profile) {
    return;
  }

  const confirmed = window.confirm(`Удалить профиль проброса "${profile.name}"?`);

  if (!confirmed) {
    return;
  }

  try {
    await window.connectApp.deleteForwardProfile(profileId);
    await refreshAppState();
    showToast('Профиль проброса удалён.');
  } catch (error) {
    showToast(error.message);
  }
}

function wireStaticEvents() {
  elements.addProfileButton.addEventListener('click', () => openProfileModal());
  elements.forwardButton.addEventListener('click', () => openForwardModal());
  elements.programsButton.addEventListener('click', () => openDialog('programsDialog'));
  elements.exportConfigButton.addEventListener('click', async () => {
    try {
      const result = await window.connectApp.exportConfig();

      if (result.cancelled) {
        return;
      }

      showToast(`${result.message} Файл: ${result.path}`);
    } catch (error) {
      showToast(error.message);
    }
  });
  elements.importConfigButton.addEventListener('click', async () => {
    try {
      const result = await window.connectApp.importConfig();

      if (result.cancelled) {
        return;
      }

      applyBootstrapState(result.state);
      showToast(result.message);
    } catch (error) {
      showToast(error.message);
    }
  });

  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', () => closeDialog(button.dataset.closeModal));
  });

  elements.profilePlatform.addEventListener('change', () => {
    if (!elements.profilePort.value || elements.profilePort.value === '22' || elements.profilePort.value === '3389') {
      elements.profilePort.value = elements.profilePlatform.value === 'windows' ? '3389' : '22';
    }
  });

  elements.forwardProfileSelect.addEventListener('change', () => {
    syncForwardProfile(elements.forwardProfileSelect.value);
  });

  elements.profileForm.addEventListener('submit', handleProfileSubmit);
  elements.connectForm.addEventListener('submit', handleConnectSubmit);
  elements.forwardForm.addEventListener('submit', handleForwardSubmit);

  elements.profilesGrid.addEventListener('click', (event) => {
    const actionTarget = event.target.closest('[data-action]');

    if (actionTarget) {
      const profileId = actionTarget.dataset.profileId;

      if (actionTarget.dataset.action === 'connect-profile') {
        handleQuickConnect(profileId);
      }

      if (actionTarget.dataset.action === 'edit-profile') {
        openProfileModal(getProfileById(profileId));
      }

      if (actionTarget.dataset.action === 'delete-profile') {
        handleDeleteProfile(profileId);
      }

      return;
    }
  });

  elements.forwardList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');

    if (!button) {
      return;
    }

    if (button.dataset.action === 'open-forward-link') {
      await openForwardUrl(button.dataset.forwardUrl);
      return;
    }

    if (button.dataset.action === 'stop-forward') {
      await handleStopForward(button.dataset.forwardId);
    }
  });

  elements.programsList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action="install-program"]');

    if (!button) {
      return;
    }

    handleInstallProgram(button.dataset.programId);
  });

  elements.forwardPresetList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');

    if (!button) {
      return;
    }

    const profileId = button.dataset.forwardProfileId;

    if (button.dataset.action === 'edit-forward-profile') {
      openForwardModal(getForwardProfileById(profileId));
      return;
    }

    if (button.dataset.action === 'delete-forward-profile') {
      await handleDeleteForwardProfile(profileId);
      return;
    }

    if (button.dataset.action === 'start-forward-profile') {
      try {
        const result = await window.connectApp.startSavedForward(profileId);
        showToast(result.message);
      } catch (error) {
        showToast(error.message);
      }
      return;
    }

    if (button.dataset.action === 'stop-forward-profile') {
      await handleStopForward(button.dataset.forwardId);
      return;
    }

    if (button.dataset.action === 'open-forward-link') {
      await openForwardUrl(button.dataset.forwardUrl);
    }
  });

  elements.copyHiddifyButton.addEventListener('click', async () => {
    try {
      const result = await window.connectApp.copyHiddifyConfig();
      showToast(result.message);
    } catch (error) {
      showToast(error.message);
    }
  });

  elements.importFxSoundButton.addEventListener('click', async () => {
    try {
      const result = await window.connectApp.importFxSoundPreset();

      if (result.cancelled) {
        return;
      }

      showToast(result.message);
    } catch (error) {
      showToast(error.message);
    }
  });

  elements.installBundledPresetButton.addEventListener('click', async () => {
    try {
      const result = await window.connectApp.installBundledFxSoundPreset();
      showToast(result.message);
    } catch (error) {
      showToast(error.message);
    }
  });

  elements.installAllProgramsButton.addEventListener('click', async () => {
    await handleInstallAllPrograms();
  });
}

async function init() {
  elements.addProfileButton = byId('addProfileButton');
  elements.forwardButton = byId('forwardButton');
  elements.programsButton = byId('programsButton');
  elements.exportConfigButton = byId('exportConfigButton');
  elements.importConfigButton = byId('importConfigButton');
  elements.profilesGrid = byId('profilesGrid');
  elements.forwardList = byId('forwardList');
  elements.forwardPresetList = byId('forwardPresetList');
  elements.platformHint = byId('platformHint');
  elements.fxSoundHint = byId('fxSoundHint');
  elements.profileDialogTitle = byId('profileDialogTitle');
  elements.profileForm = byId('profileForm');
  elements.profileId = byId('profileId');
  elements.profileName = byId('profileName');
  elements.profilePlatform = byId('profilePlatform');
  elements.profilePort = byId('profilePort');
  elements.profileHost = byId('profileHost');
  elements.profileUsername = byId('profileUsername');
  elements.profileNote = byId('profileNote');
  elements.connectForm = byId('connectForm');
  elements.connectProfileId = byId('connectProfileId');
  elements.connectTitle = byId('connectTitle');
  elements.connectDescription = byId('connectDescription');
  elements.connectUsername = byId('connectUsername');
  elements.connectPassword = byId('connectPassword');
  elements.connectRemember = byId('connectRemember');
  elements.forwardForm = byId('forwardForm');
  elements.forwardDialogTitle = byId('forwardDialogTitle');
  elements.forwardPresetId = byId('forwardPresetId');
  elements.forwardName = byId('forwardName');
  elements.forwardProfileSelect = byId('forwardProfileSelect');
  elements.forwardHost = byId('forwardHost');
  elements.forwardSshPort = byId('forwardSshPort');
  elements.forwardUsername = byId('forwardUsername');
  elements.forwardLocalPort = byId('forwardLocalPort');
  elements.forwardRemoteHost = byId('forwardRemoteHost');
  elements.forwardRemotePort = byId('forwardRemotePort');
  elements.forwardPassword = byId('forwardPassword');
  elements.forwardRemember = byId('forwardRemember');
  elements.forwardSaveToConfig = byId('forwardSaveToConfig');
  elements.programsList = byId('programsList');
  elements.installAllProgramsButton = byId('installAllProgramsButton');
  elements.copyHiddifyButton = byId('copyHiddifyButton');
  elements.importFxSoundButton = byId('importFxSoundButton');
  elements.installBundledPresetButton = byId('installBundledPresetButton');
  elements.fxSoundTargetPath = byId('fxSoundTargetPath');
  elements.bundledPresetPath = byId('bundledPresetPath');
  elements.toast = byId('toast');

  wireStaticEvents();
  await refreshAppState();

  window.connectApp.onForwardsChanged((forwards) => {
    state.forwards = forwards;
    renderForwards();
    renderForwardProfiles();
  });
}

window.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    showToast(error.message);
  });
});
