(function () {
    'use strict';

    const buttonId = 'syncPlayChatButton';
    const markerClass = 'syncPlayChatButton';
    const floatingHostId = 'syncPlayChatFloatingHost';
    const styleId = 'syncPlayChatStyle';
    const drawerId = 'syncPlayChatDrawer';
    const titleId = 'syncPlayChatTitle';
    const closeButtonId = 'syncPlayChatCloseButton';
    const statusId = 'syncPlayChatStatus';
    const messagesId = 'syncPlayChatMessages';
    const emptyStateId = 'syncPlayChatEmptyState';
    const formId = 'syncPlayChatForm';
    const inputId = 'syncPlayChatInput';
    const sendButtonId = 'syncPlayChatSendButton';
    const refreshIntervalMs = 5000;
    let refreshInProgress = false;
    let sendInProgress = false;
    let currentSyncPlayContext = {
        inGroup: false,
        groupId: '',
        groupName: '',
        unavailable: true
    };

    function normalizeId(value) {
        if (value === null || value === undefined) {
            return '';
        }

        return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function logDebug(message, details) {
        if (!window || !window.console || typeof window.console.log !== 'function') {
            return;
        }

        if (details === undefined) {
            window.console.log('[SyncPlayChat]', message);
            return;
        }

        window.console.log('[SyncPlayChat]', message, details);
    }

    function ensureStyles() {
        if (document.getElementById(styleId)) {
            return;
        }

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = [
            '#' + floatingHostId + ' { position: fixed; right: 1rem; bottom: 1rem; z-index: 99999; display: flex; align-items: flex-end; gap: 0.5rem; pointer-events: none; }',
            '.' + markerClass + ' { pointer-events: auto; display: inline-flex; align-items: center; justify-content: center; width: 2.75rem; height: 2.75rem; padding: 0; border-radius: 0.65rem; border: 1px solid rgba(255, 255, 255, 0.22); background: rgba(18, 20, 24, 0.86); color: #fff; cursor: pointer; box-shadow: 0 6px 14px rgba(0, 0, 0, 0.24); }',
            '.' + markerClass + ':hover, .' + markerClass + ':focus-visible { background: rgba(30, 34, 40, 0.94); border-color: rgba(255, 255, 255, 0.38); }',
            '.' + markerClass + '[aria-expanded="true"] { color: #00a4dc; border-color: rgba(0, 164, 220, 0.65); }',
            '#' + drawerId + ' { position: fixed; top: 0; right: 0; bottom: 0; z-index: 100000; display: flex; width: min(24rem, calc(100vw - 1rem)); max-width: 100vw; box-sizing: border-box; flex-direction: column; background: #101317; color: #f6f8fb; border-left: 1px solid rgba(255, 255, 255, 0.12); box-shadow: -16px 0 28px rgba(0, 0, 0, 0.38); transform: translateX(105%); transition: transform 190ms cubic-bezier(0.22, 1, 0.36, 1); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }',
            '#' + drawerId + '.is-open { transform: translateX(0); }',
            '.syncPlayChatHeader { display: flex; align-items: center; justify-content: space-between; min-height: 3.5rem; padding: 0.85rem 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }',
            '.syncPlayChatHeader h2 { margin: 0; font-size: 1rem; line-height: 1.25rem; font-weight: 650; letter-spacing: 0; color: #fff; }',
            '#' + closeButtonId + ' { display: inline-flex; align-items: center; justify-content: center; width: 2.15rem; height: 2.15rem; padding: 0; border: 0; border-radius: 0.45rem; background: transparent; color: #d8dee8; cursor: pointer; font-size: 1.6rem; line-height: 1; }',
            '#' + closeButtonId + ':hover, #' + closeButtonId + ':focus-visible { background: rgba(255, 255, 255, 0.08); color: #fff; }',
            '#' + statusId + ' { margin: 0.8rem 1rem 0; padding: 0.6rem 0.7rem; border-radius: 0.5rem; background: rgba(255, 255, 255, 0.06); color: #cbd4df; font-size: 0.86rem; line-height: 1.25rem; }',
            '#' + statusId + '.is-active { background: rgba(0, 164, 220, 0.16); color: #d8f4ff; }',
            '#' + messagesId + ' { flex: 1 1 auto; overflow-y: auto; min-height: 0; padding: 1rem; }',
            '.syncPlayChatEmptyState { display: flex; min-height: 100%; align-items: center; justify-content: center; text-align: center; color: #aeb8c6; font-size: 0.92rem; line-height: 1.35rem; }',
            '.syncPlayChatMessage { margin: 0 0 0.75rem; padding: 0.65rem 0.7rem; border-radius: 0.55rem; background: rgba(255, 255, 255, 0.07); color: #f6f8fb; overflow-wrap: anywhere; }',
            '.syncPlayChatMessageMeta { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.3rem; color: #b9c4d2; font-size: 0.76rem; line-height: 1rem; }',
            '.syncPlayChatMessageAuthor { color: #e8edf4; font-weight: 650; }',
            '.syncPlayChatMessageBody { white-space: pre-wrap; font-size: 0.93rem; line-height: 1.35rem; }',
            '#' + formId + ' { display: flex; gap: 0.55rem; padding: 0.8rem 1rem 1rem; border-top: 1px solid rgba(255, 255, 255, 0.1); background: #101317; }',
            '#' + inputId + ' { flex: 1 1 auto; min-width: 0; min-height: 2.35rem; max-height: 7.5rem; box-sizing: border-box; resize: none; overflow-x: hidden; overflow-y: auto; padding: 0.52rem 0.65rem; border-radius: 0.5rem; border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.07); color: #fff; line-height: 1.25rem; font: inherit; font-size: 0.92rem; }',
            '#' + inputId + '::placeholder { color: #b5bfcc; opacity: 1; }',
            '#' + inputId + ':focus { outline: 2px solid rgba(0, 164, 220, 0.85); outline-offset: 1px; border-color: rgba(0, 164, 220, 0.85); }',
            '#' + inputId + ':disabled { opacity: 0.66; cursor: not-allowed; }',
            '#' + sendButtonId + ' { flex: 0 0 auto; min-width: 4.4rem; min-height: 2.35rem; padding: 0.48rem 0.75rem; border: 1px solid rgba(0, 164, 220, 0.55); border-radius: 0.5rem; background: #00a4dc; color: #001018; cursor: pointer; font: inherit; font-size: 0.9rem; font-weight: 650; }',
            '#' + sendButtonId + ':hover, #' + sendButtonId + ':focus-visible { background: #18b7ed; }',
            '#' + sendButtonId + ':disabled { border-color: rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.1); color: #aeb8c6; cursor: not-allowed; }',
            '@media (max-width: 40rem) { #' + drawerId + ' { width: min(100vw, 22rem); } #' + floatingHostId + ' { right: 0.75rem; bottom: 0.75rem; } }',
            '@media (prefers-reduced-motion: reduce) { #' + drawerId + ' { transition: none; } }'
        ].join('\n');

        document.head.appendChild(style);
    }

    function getFloatingHost() {
        ensureStyles();

        let host = document.getElementById(floatingHostId);
        if (host) {
            return host;
        }

        host = document.createElement('div');
        host.id = floatingHostId;
        document.body.appendChild(host);
        return host;
    }

    function setElementText(element, value) {
        if (element && element.textContent !== value) {
            element.textContent = value;
        }
    }

    function createButton() {
        const button = document.createElement('button');
        button.id = buttonId;
        button.type = 'button';
        button.className = 'emby-button ' + markerClass;
        button.setAttribute('aria-label', 'SyncPlay chat');
        button.setAttribute('aria-controls', drawerId);
        button.setAttribute('aria-expanded', 'false');
        button.title = 'SyncPlay chat';
        button.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 4h16v11H8l-4 4V4z"/></svg>';
        button.addEventListener('click', function () {
            toggleDrawer();
        });
        return button;
    }

    function getOrCreateDrawer() {
        ensureStyles();

        let drawer = document.getElementById(drawerId);
        if (drawer) {
            return drawer;
        }

        drawer = document.createElement('aside');
        drawer.id = drawerId;
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-modal', 'false');
        drawer.setAttribute('aria-labelledby', titleId);
        drawer.setAttribute('aria-hidden', 'true');
        if ('inert' in drawer) {
            drawer.inert = true;
        }

        const header = document.createElement('div');
        header.className = 'syncPlayChatHeader';

        const title = document.createElement('h2');
        title.id = titleId;
        title.textContent = 'SyncPlay Chat';

        const closeButton = document.createElement('button');
        closeButton.id = closeButtonId;
        closeButton.type = 'button';
        closeButton.setAttribute('aria-label', 'Close SyncPlay chat');
        closeButton.innerHTML = '&times;';
        closeButton.addEventListener('click', closeDrawer);

        header.appendChild(title);
        header.appendChild(closeButton);

        const status = document.createElement('div');
        status.id = statusId;

        const messages = document.createElement('div');
        messages.id = messagesId;
        messages.setAttribute('role', 'log');
        messages.setAttribute('aria-live', 'polite');
        messages.setAttribute('aria-relevant', 'additions');

        const emptyState = document.createElement('div');
        emptyState.id = emptyStateId;
        emptyState.className = 'syncPlayChatEmptyState';
        messages.appendChild(emptyState);

        const form = document.createElement('form');
        form.id = formId;
        form.setAttribute('autocomplete', 'off');

        const input = document.createElement('textarea');
        input.id = inputId;
        input.rows = 1;
        input.placeholder = 'Join a SyncPlay group to chat';
        input.setAttribute('aria-label', 'SyncPlay chat message');
        input.wrap = 'soft';

        const sendButton = document.createElement('button');
        sendButton.id = sendButtonId;
        sendButton.type = 'submit';
        sendButton.textContent = 'Send';

        form.addEventListener('submit', function (event) {
            event.preventDefault();
            sendComposerMessage();
        });

        input.addEventListener('keydown', function (event) {
            event.stopPropagation();

            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                sendComposerMessage();
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                closeDrawer();
            }
        });

        input.addEventListener('keyup', function (event) {
            event.stopPropagation();
        });

        input.addEventListener('input', function () {
            autoResizeComposerInput();
        });

        form.appendChild(input);
        form.appendChild(sendButton);

        drawer.appendChild(header);
        drawer.appendChild(status);
        drawer.appendChild(messages);
        drawer.appendChild(form);
        document.body.appendChild(drawer);

        renderSyncPlayStatus();
        return drawer;
    }

    function autoResizeComposerInput() {
        const input = document.getElementById(inputId);
        if (!input) {
            return;
        }

        input.style.height = 'auto';
        const minHeightPx = 32;
        const maxHeightPx = 112;
        const nextHeight = Math.max(minHeightPx, Math.min(maxHeightPx, input.scrollHeight));
        input.style.height = String(nextHeight) + 'px';
    }

    function setComposerBusy(isBusy) {
        const input = document.getElementById(inputId);
        const sendButton = document.getElementById(sendButtonId);
        const isDisabled = isBusy || !currentSyncPlayContext.inGroup;

        if (input) {
            input.disabled = isDisabled;
            input.placeholder = currentSyncPlayContext.inGroup ? 'Type a message' : 'Join a SyncPlay group to chat';
        }

        if (sendButton) {
            sendButton.disabled = isDisabled;
            sendButton.textContent = isBusy ? 'Sending...' : 'Send';
        }
    }

    function updateEntryButtonExpanded(isExpanded) {
        const button = document.getElementById(buttonId);
        if (button) {
            button.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
        }
    }

    function openDrawer() {
        const drawer = getOrCreateDrawer();
        drawer.classList.add('is-open');
        drawer.setAttribute('aria-hidden', 'false');
        if ('inert' in drawer) {
            drawer.inert = false;
        }
        updateEntryButtonExpanded(true);
        renderSyncPlayStatus();
        refreshSyncPlayState();

        window.setTimeout(function () {
            const input = document.getElementById(inputId);
            const closeButton = document.getElementById(closeButtonId);
            const focusTarget = currentSyncPlayContext.inGroup ? input : closeButton;
            if (focusTarget && typeof focusTarget.focus === 'function') {
                focusTarget.focus();
            }

            autoResizeComposerInput();
        }, 0);
    }

    function closeDrawer() {
        const drawer = document.getElementById(drawerId);
        if (!drawer) {
            return;
        }

        drawer.classList.remove('is-open');
        drawer.setAttribute('aria-hidden', 'true');
        if ('inert' in drawer) {
            drawer.inert = true;
        }
        updateEntryButtonExpanded(false);
    }

    function toggleDrawer() {
        const drawer = getOrCreateDrawer();
        if (drawer.classList.contains('is-open')) {
            closeDrawer();
            return;
        }

        openDrawer();
    }

    function getCurrentGroupLabel() {
        if (currentSyncPlayContext.groupName) {
            return currentSyncPlayContext.groupName;
        }

        if (currentSyncPlayContext.groupId) {
            return 'Group ' + currentSyncPlayContext.groupId.slice(0, 8);
        }

        return 'Current group';
    }

    function renderEmptyState() {
        const messages = document.getElementById(messagesId);
        const emptyState = document.getElementById(emptyStateId);
        if (!messages || !emptyState) {
            return;
        }

        const hasMessages = !!messages.querySelector('.syncPlayChatMessage');
        const emptyText = currentSyncPlayContext.inGroup ? 'No messages yet.' : 'Join or create a SyncPlay group to send chat messages.';
        setElementText(emptyState, emptyText);
        emptyState.style.display = hasMessages ? 'none' : 'flex';
    }

    function renderSyncPlayStatus() {
        const status = document.getElementById(statusId);
        if (status) {
            if (currentSyncPlayContext.inGroup) {
                setElementText(status, 'In SyncPlay group: ' + getCurrentGroupLabel());
                status.classList.add('is-active');
            } else {
                setElementText(status, 'Not in a SyncPlay group');
                status.classList.remove('is-active');
            }
        }

        setComposerBusy(sendInProgress);
        renderEmptyState();
    }

    function setCurrentSyncPlayContext(context) {
        currentSyncPlayContext = {
            inGroup: !!(context && context.inGroup),
            groupId: (context && typeof context.groupId === 'string') ? context.groupId : '',
            groupName: (context && typeof context.groupName === 'string') ? context.groupName : '',
            unavailable: !!(context && context.unavailable)
        };
        renderSyncPlayStatus();
    }

    function appendLocalMessage(author, text) {
        getOrCreateDrawer();

        const messages = document.getElementById(messagesId);
        if (!messages) {
            return;
        }

        const message = document.createElement('div');
        message.className = 'syncPlayChatMessage';

        const meta = document.createElement('div');
        meta.className = 'syncPlayChatMessageMeta';

        const authorNode = document.createElement('span');
        authorNode.className = 'syncPlayChatMessageAuthor';
        authorNode.textContent = author || 'You';

        const timeNode = document.createElement('span');
        timeNode.textContent = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        const body = document.createElement('div');
        body.className = 'syncPlayChatMessageBody';
        body.textContent = text;

        meta.appendChild(authorNode);
        meta.appendChild(timeNode);
        message.appendChild(meta);
        message.appendChild(body);
        messages.appendChild(message);
        renderEmptyState();
        messages.scrollTop = messages.scrollHeight;
    }

    function getComposerMessageText() {
        const input = document.getElementById(inputId);
        if (!input) {
            return '';
        }

        return (input.value || '').trim();
    }

    function clearComposerInput() {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = '';
            autoResizeComposerInput();
        }
    }

    function sendComposerMessage() {
        const text = getComposerMessageText();
        if (!text) {
            return;
        }

        if (!currentSyncPlayContext.inGroup) {
            logDebug('Send blocked because the current session is not in a SyncPlay group.');
            renderSyncPlayStatus();
            return;
        }

        onChatButtonClick(text);
    }

    function extractSyncPlayGroupId(session) {
        const playState = session && session.PlayState;
        const groupId = (session && session.PlayState && session.PlayState.SyncPlayGroupId)
            || (session && session.PlayState && session.PlayState.SyncPlayGroup)
            || (session && session.SyncPlayGroupId)
            || (session && session.SyncPlayGroup)
            || (session && session.SyncPlayGroup && session.SyncPlayGroup.Id)
            || (playState && playState.SyncPlayGroup && playState.SyncPlayGroup.Id)
            || (playState && playState.SyncPlayInfo && playState.SyncPlayInfo.GroupId)
            || (session && session.AdditionalData && session.AdditionalData.SyncPlayGroupId)
            || '';

        return typeof groupId === 'string' ? groupId : '';
    }

    function removeExtraButtons() {
        const existingButtons = document.querySelectorAll('.' + markerClass);
        if (existingButtons.length > 1) {
            for (let i = 1; i < existingButtons.length; i += 1) {
                existingButtons[i].remove();
            }
        }
    }

    function getCurrentUserId() {
        if (!window.ApiClient) {
            return '';
        }

        if (typeof window.ApiClient.getCurrentUserId === 'function') {
            return window.ApiClient.getCurrentUserId() || '';
        }

        if (typeof window.ApiClient.userId === 'function') {
            return window.ApiClient.userId() || '';
        }

        if (typeof window.ApiClient._userId === 'string') {
            return window.ApiClient._userId;
        }

        if (window.ApiClient._serverInfo && typeof window.ApiClient._serverInfo.UserId === 'string') {
            return window.ApiClient._serverInfo.UserId;
        }

        return '';
    }

    function getCurrentUserIds() {
        const raw = getCurrentUserId();
        const ids = [];

        if (raw) {
            ids.push(raw);
        }

        const normalized = normalizeId(raw);
        if (normalized && ids.indexOf(normalized) === -1) {
            ids.push(normalized);
        }

        return ids;
    }

    function getCurrentUserName() {
        if (!window.ApiClient) {
            return '';
        }

        const serverInfo = window.ApiClient._serverInfo;
        if (serverInfo && typeof serverInfo.UserName === 'string' && serverInfo.UserName.length > 0) {
            return serverInfo.UserName;
        }

        if (window.Dashboard && window.Dashboard.getCurrentUser) {
            const currentUser = window.Dashboard.getCurrentUser();
            if (currentUser && typeof currentUser.Name === 'string' && currentUser.Name.length > 0) {
                return currentUser.Name;
            }
        }

        return '';
    }

    function getCurrentDeviceId() {
        if (!window.ApiClient) {
            return '';
        }

        if (typeof window.ApiClient.deviceId === 'function') {
            return window.ApiClient.deviceId() || '';
        }

        if (typeof window.ApiClient._deviceId === 'string') {
            return window.ApiClient._deviceId;
        }

        return '';
    }

    function hasSyncPlayGroup(session) {
        return extractSyncPlayGroupId(session).length > 0;
    }

    function collectStringValues(value, output) {
        if (value === null || value === undefined) {
            return;
        }

        if (typeof value === 'string') {
            output.push(value);
            return;
        }

        if (Array.isArray(value)) {
            value.forEach(function (item) {
                collectStringValues(item, output);
            });
            return;
        }

        if (typeof value === 'object') {
            Object.keys(value).forEach(function (key) {
                collectStringValues(value[key], output);
            });
        }
    }

    function normalizeSessionsResponse(response) {
        if (Array.isArray(response)) {
            return response;
        }

        if (response && Array.isArray(response.Items)) {
            return response.Items;
        }

        if (response && Array.isArray(response.Sessions)) {
            return response.Sessions;
        }

        return [];
    }

    function normalizeGroupsResponse(response) {
        if (Array.isArray(response)) {
            return response;
        }

        if (response && Array.isArray(response.Groups)) {
            return response.Groups;
        }

        if (response && Array.isArray(response.Items)) {
            return response.Items;
        }

        return [];
    }

    function objectContainsString(value, expectedLowerValue) {
        if (!value || !expectedLowerValue) {
            return false;
        }

        if (typeof value === 'string') {
            const normalizedActual = normalizeId(value);
            const normalizedExpected = normalizeId(expectedLowerValue);

            if (!normalizedActual || !normalizedExpected) {
                return false;
            }

            return normalizedActual === normalizedExpected;
        }

        if (Array.isArray(value)) {
            return value.some(function (item) {
                return objectContainsString(item, expectedLowerValue);
            });
        }

        if (typeof value === 'object') {
            return Object.keys(value).some(function (key) {
                return objectContainsString(value[key], expectedLowerValue);
            });
        }

        return false;
    }

    function buildSessionsPaths() {
        const userIds = getCurrentUserIds();
        const paths = ['Sessions'];

        userIds.forEach(function (id) {
            const path = 'Sessions?UserId=' + encodeURIComponent(id);
            if (paths.indexOf(path) === -1) {
                paths.push(path);
            }
        });

        return paths;
    }

    async function fetchJson(path) {
        if (!window.ApiClient) {
            return null;
        }

        const normalizedPath = typeof path === 'string' && path.charAt(0) === '/' ? path.slice(1) : path;
        const url = typeof window.ApiClient.getUrl === 'function'
            ? window.ApiClient.getUrl(normalizedPath)
            : normalizedPath;

        if (typeof window.ApiClient.ajax === 'function') {
            return window.ApiClient.ajax({
                type: 'GET',
                url: url,
                dataType: 'json'
            });
        }

        if (typeof window.ApiClient.getJSON === 'function') {
            return window.ApiClient.getJSON(url);
        }

        return null;
    }

    async function postJson(path, data, expectJsonResponse) {
        if (!window.ApiClient) {
            return null;
        }

        const normalizedPath = typeof path === 'string' && path.charAt(0) === '/' ? path.slice(1) : path;
        const url = typeof window.ApiClient.getUrl === 'function'
            ? window.ApiClient.getUrl(normalizedPath)
            : normalizedPath;

        if (typeof window.ApiClient.ajax === 'function') {
            const request = {
                type: 'POST',
                url: url,
                contentType: 'application/json; charset=utf-8',
                data: JSON.stringify(data || {})
            };

            if (expectJsonResponse) {
                request.dataType = 'json';
            }

            return window.ApiClient.ajax(request);
        }

        if (typeof window.fetch === 'function') {
            const response = await window.fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify(data || {})
            });

            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            if (expectJsonResponse) {
                return response.json();
            }

            return null;
        }

        return null;
    }

    function matchesCurrentUser(session) {
        const currentUserIds = getCurrentUserIds();
        if (!currentUserIds.length) {
            return true;
        }

        const sessionUserId = (session && session.UserId) || (session && session.User && session.User.Id) || '';
        const normalizedSessionUserId = normalizeId(sessionUserId);
        return currentUserIds.some(function (id) {
            return normalizeId(id) === normalizedSessionUserId;
        });
    }

    function getCurrentSessionIds(sessions) {
        return sessions
            .filter(matchesCurrentUser)
            .map(function (session) { return session && session.Id; })
            .filter(function (id) { return typeof id === 'string' && id.length > 0; });
    }

    function getCurrentSession(sessions) {
        const currentDeviceId = normalizeId(getCurrentDeviceId());
        const matchingUserSessions = sessions.filter(matchesCurrentUser);

        if (currentDeviceId) {
            const exactDeviceSession = matchingUserSessions.find(function (session) {
                return normalizeId(session && session.DeviceId) === currentDeviceId;
            });

            if (exactDeviceSession) {
                return exactDeviceSession;
            }
        }

        return matchingUserSessions.length > 0 ? matchingUserSessions[0] : null;
    }

    function mapKnownSessionIds(sessions) {
        const map = {};
        sessions.forEach(function (session) {
            const sessionId = session && session.Id;
            if (typeof sessionId === 'string' && sessionId.length > 0) {
                map[normalizeId(sessionId)] = sessionId;
            }
        });

        return map;
    }

    function filterSessionIdsToKnownSessions(sessionIds, sessions) {
        const knownSessionIds = mapKnownSessionIds(sessions);
        const filtered = [];

        sessionIds.forEach(function (id) {
            const knownId = knownSessionIds[normalizeId(id)];
            if (knownId && filtered.indexOf(knownId) === -1) {
                filtered.push(knownId);
            }
        });

        return filtered;
    }

    function summarizeError(error) {
        if (!error) {
            return 'Unknown error';
        }

        if (typeof error === 'string') {
            return error;
        }

        if (error.message) {
            return error.message;
        }

        if (error.status || error.statusText) {
            return 'HTTP ' + (error.status || 'unknown') + ' ' + (error.statusText || '').trim();
        }

        if (error.responseJSON) {
            try {
                return JSON.stringify(error.responseJSON);
            } catch (jsonErr) {
                return 'Response JSON serialization failed';
            }
        }

        if (error.responseText) {
            return String(error.responseText).slice(0, 500);
        }

        try {
            return JSON.stringify(error).slice(0, 500);
        } catch (jsonErr) {
            return 'Unserializable error object';
        }
    }

    function isLikelySessionId(value) {
        if (typeof value !== 'string') {
            return false;
        }

        const trimmed = value.trim();
        return /^[a-f0-9]{32}$/i.test(trimmed) || /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(trimmed);
    }

    function resolveSyncPlayGroupId(group) {
        const direct = (group && group.Id)
            || (group && group.GroupId)
            || (group && group.Group && group.Group.Id)
            || (group && group.GroupInfo && group.GroupInfo.Id)
            || '';

        if (typeof direct === 'string' && direct.length > 0) {
            return direct;
        }

        const values = [];
        collectStringValues(group, values);
        const possibleGroupId = values.find(function (value) {
            return isLikelySessionId(value);
        });

        return possibleGroupId || '';
    }

    function resolveSyncPlayGroupName(group) {
        const direct = (group && group.GroupName)
            || (group && group.Name)
            || (group && group.DisplayName)
            || (group && group.Group && group.Group.GroupName)
            || (group && group.Group && group.Group.Name)
            || (group && group.GroupInfo && group.GroupInfo.GroupName)
            || (group && group.GroupInfo && group.GroupInfo.Name)
            || '';

        return typeof direct === 'string' ? direct : '';
    }

    function extractLikelySessionIdsFromGroup(group) {
        const fromSessionKeys = [];

        function walk(value) {
            if (value === null || value === undefined) {
                return;
            }

            if (Array.isArray(value)) {
                value.forEach(walk);
                return;
            }

            if (typeof value !== 'object') {
                return;
            }

            Object.keys(value).forEach(function (key) {
                const child = value[key];
                const normalizedKey = normalizeId(key);
                if ((normalizedKey === 'sessionid' || normalizedKey.indexOf('sessionid') !== -1) && typeof child === 'string' && child.length > 0) {
                    fromSessionKeys.push(child);
                }
                walk(child);
            });
        }

        walk(group);

        const values = [];
        collectStringValues(group, values);

        const unique = [];
        fromSessionKeys.forEach(function (value) {
            if (typeof value !== 'string' || value.length === 0) {
                return;
            }

            if (unique.indexOf(value) === -1) {
                unique.push(value);
            }
        });

        values.forEach(function (value) {
            if (!isLikelySessionId(value)) {
                return;
            }

            if (unique.indexOf(value) === -1) {
                unique.push(value);
            }
        });

        return unique;
    }

    async function fetchSyncPlayGroupDetails(groups) {
        const detailGroups = [];

        for (let i = 0; i < groups.length; i += 1) {
            const group = groups[i];
            const groupId = resolveSyncPlayGroupId(group);
            if (!groupId) {
                continue;
            }

            try {
                const details = await fetchJson('SyncPlay/' + encodeURIComponent(groupId));
                if (details) {
                    detailGroups.push(details);
                }
            } catch (err) {
                logDebug('Failed to fetch SyncPlay group details', { groupId: groupId, error: err });
            }
        }

        return detailGroups;
    }

    function getGroupIdsForCurrentUserSessions(sessions) {
        const groupIds = [];
        sessions
            .filter(matchesCurrentUser)
            .forEach(function (session) {
                const groupId = extractSyncPlayGroupId(session);
                if (groupId && groupIds.indexOf(groupId) === -1) {
                    groupIds.push(groupId);
                }
            });

        return groupIds;
    }

    function findSessionIdsByGroupIds(sessions, groupIds) {
        if (!groupIds.length) {
            return [];
        }

        const normalizedGroupIds = groupIds.map(normalizeId).filter(Boolean);
        return sessions
            .filter(function (session) {
                const sessionGroupId = normalizeId(extractSyncPlayGroupId(session));
                return normalizedGroupIds.indexOf(sessionGroupId) !== -1;
            })
            .map(function (session) { return session && session.Id; })
            .filter(function (id) { return typeof id === 'string' && id.length > 0; });
    }

    function findSessionIdsInGroupPayload(groups, sessions) {
        if (!groups.length || !sessions.length) {
            return [];
        }

        const normalizedSessionIds = {};
        sessions.forEach(function (session) {
            const sessionId = session && session.Id;
            if (typeof sessionId === 'string' && sessionId.length > 0) {
                normalizedSessionIds[normalizeId(sessionId)] = sessionId;
            }
        });

        const matchingIds = [];

        groups.forEach(function (group) {
            if (!groupsContainCurrentUser([group], sessions)) {
                return;
            }

            const values = [];
            collectStringValues(group, values);
            values.forEach(function (value) {
                const normalizedValue = normalizeId(value);
                const sessionId = normalizedSessionIds[normalizedValue];
                if (sessionId && matchingIds.indexOf(sessionId) === -1) {
                    matchingIds.push(sessionId);
                }
            });
        });

        return matchingIds;
    }

    function findGroupsByGroupIds(groups, groupIds) {
        if (!groups.length || !groupIds.length) {
            return [];
        }

        const normalizedGroupIds = groupIds.map(normalizeId).filter(Boolean);
        return groups.filter(function (group) {
            return normalizedGroupIds.indexOf(normalizeId(resolveSyncPlayGroupId(group))) !== -1;
        });
    }

    function mergeSessionsUnique(primary, secondary) {
        const map = {};

        (primary || []).forEach(function (session) {
            const id = session && session.Id;
            if (typeof id === 'string' && id.length > 0) {
                map[id] = session;
            }
        });

        (secondary || []).forEach(function (session) {
            const id = session && session.Id;
            if (typeof id === 'string' && id.length > 0 && !map[id]) {
                map[id] = session;
            }
        });

        return Object.keys(map).map(function (id) {
            return map[id];
        });
    }

    function extractParticipantTokens(groups) {
        const userIds = [];
        const userNames = [];

        groups.forEach(function (group) {
            if (!group || !Array.isArray(group.Participants)) {
                return;
            }

            group.Participants.forEach(function (participant) {
                if (typeof participant === 'string' && participant.length > 0) {
                    if (isLikelySessionId(participant)) {
                        if (userIds.indexOf(participant) === -1) {
                            userIds.push(participant);
                        }
                        return;
                    }

                    if (userNames.indexOf(participant) === -1) {
                        userNames.push(participant);
                    }
                    return;
                }

                if (!participant || typeof participant !== 'object') {
                    return;
                }

                const participantUserId = participant.UserId || (participant.User && participant.User.Id) || '';
                if (typeof participantUserId === 'string' && participantUserId.length > 0 && userIds.indexOf(participantUserId) === -1) {
                    userIds.push(participantUserId);
                }

                const participantUserName = participant.UserName || (participant.User && participant.User.Name) || '';
                if (typeof participantUserName === 'string' && participantUserName.length > 0 && userNames.indexOf(participantUserName) === -1) {
                    userNames.push(participantUserName);
                }
            });
        });

        return {
            userIds: userIds,
            userNames: userNames
        };
    }

    async function fetchSessionsForUserIds(userIds) {
        const sessionsById = {};

        for (let i = 0; i < userIds.length; i += 1) {
            const userId = userIds[i];
            if (!userId) {
                continue;
            }

            try {
                const response = await fetchJson('Sessions?UserId=' + encodeURIComponent(userId));
                const sessions = normalizeSessionsResponse(response);
                sessions.forEach(function (session) {
                    const sessionId = session && session.Id;
                    if (typeof sessionId === 'string' && sessionId.length > 0) {
                        sessionsById[sessionId] = session;
                    }
                });
            } catch (err) {
                logDebug('Failed to fetch participant sessions by user ID', { userId: userId, error: err });
            }
        }

        return Object.keys(sessionsById).map(function (id) {
            return sessionsById[id];
        });
    }

    function buildCurrentIdentityTokens(sessions) {
        const tokens = [];

        getCurrentUserIds().forEach(function (id) {
            if (id && tokens.indexOf(id) === -1) {
                tokens.push(id);
            }
        });

        const currentUserName = getCurrentUserName();
        if (currentUserName && tokens.indexOf(currentUserName) === -1) {
            tokens.push(currentUserName);
        }

        getCurrentSessionIds(sessions).forEach(function (sessionId) {
            if (sessionId && tokens.indexOf(sessionId) === -1) {
                tokens.push(sessionId);
            }
        });

        sessions
            .filter(matchesCurrentUser)
            .forEach(function (session) {
                const userName = (session && session.UserName)
                    || (session && session.User && session.User.Name)
                    || '';
                if (userName && tokens.indexOf(userName) === -1) {
                    tokens.push(userName);
                }
            });

        return tokens;
    }

    function payloadContainsAnyIdentity(payload, identityTokens) {
        if (!payload || !identityTokens.length) {
            return false;
        }

        return identityTokens.some(function (token) {
            return objectContainsString(payload, token);
        });
    }

    function hasIntersection(left, right) {
        if (!left.length || !right.length) {
            return false;
        }

        const rightLookup = {};
        right.forEach(function (value) {
            rightLookup[normalizeId(value)] = true;
        });

        return left.some(function (value) {
            return !!rightLookup[normalizeId(value)];
        });
    }

    async function isCurrentUserInGroupsViaDetails(groups, sessions) {
        const localSessionIds = getCurrentSessionIds(sessions);
        const identityTokens = buildCurrentIdentityTokens(sessions);
        if (!localSessionIds.length || !groups.length) {
            return false;
        }

        const groupIds = getGroupIdsForCurrentUserSessions(sessions);
        const scopedGroups = findGroupsByGroupIds(groups, groupIds);
        const groupsForLookup = scopedGroups.length > 0 ? scopedGroups : groups;
        const groupDetailPayloads = await fetchSyncPlayGroupDetails(groupsForLookup);

        const sessionIdsFromGroupDetails = [];
        let matchedIdentityInDetails = false;
        groupDetailPayloads.forEach(function (groupDetail) {
            if (!matchedIdentityInDetails && payloadContainsAnyIdentity(groupDetail, identityTokens)) {
                matchedIdentityInDetails = true;
            }

            extractLikelySessionIdsFromGroup(groupDetail).forEach(function (id) {
                if (sessionIdsFromGroupDetails.indexOf(id) === -1) {
                    sessionIdsFromGroupDetails.push(id);
                }
            });
        });

        const knownSessionIds = filterSessionIdsToKnownSessions(sessionIdsFromGroupDetails, sessions);
        if (hasIntersection(localSessionIds, knownSessionIds)) {
            return true;
        }

        return matchedIdentityInDetails;
    }

    function showLocalToast(text, title) {
        if (window.toastr && typeof window.toastr.info === 'function') {
            window.toastr.info(text, title || 'SyncPlay Chat');
            return;
        }

        if (window.Dashboard && typeof window.Dashboard.alert === 'function') {
            window.Dashboard.alert({
                title: title || 'SyncPlay Chat',
                message: text
            });
            return;
        }

        logDebug('Toast fallback', { title: title || 'SyncPlay Chat', text: text });
    }

    function extractParticipantsFromGroups(groups) {
        const participants = [];

        groups.forEach(function (group) {
            const groupParticipants = group && group.Participants;
            if (!Array.isArray(groupParticipants)) {
                return;
            }

            groupParticipants.forEach(function (participant) {
                if (typeof participant === 'string' && participant.length > 0 && participants.indexOf(participant) === -1) {
                    participants.push(participant);
                    return;
                }

                if (participant && typeof participant === 'object') {
                    const userName = participant.UserName || (participant.User && participant.User.Name) || '';
                    const deviceName = participant.DeviceName || participant.Device || '';

                    if (typeof userName === 'string' && userName.length > 0 && participants.indexOf(userName) === -1) {
                        participants.push(userName);
                    }

                    if (typeof deviceName === 'string' && deviceName.length > 0 && participants.indexOf(deviceName) === -1) {
                        participants.push(deviceName);
                    }
                }
            });
        });

        return participants;
    }

    async function sendMessageViaServer(text, senderSessionId, groupId, participants) {
        const response = await postJson('SyncPlayChat/Send', {
            GroupId: groupId || '',
            SenderSessionId: senderSessionId || '',
            Header: 'SyncPlay Chat',
            Text: text,
            TimeoutMs: 4000,
            ParticipantsCsv: (participants || []).join(',')
        }, true);

        let normalized = response;
        if (typeof normalized === 'string') {
            try {
                normalized = JSON.parse(normalized);
            } catch (parseError) {
                logDebug('Failed to parse server chat send response JSON', {
                    response: response,
                    error: parseError
                });
                normalized = null;
            }
        }

        if (normalized && typeof normalized === 'object' && normalized.responseJSON && typeof normalized.responseJSON === 'object') {
            normalized = normalized.responseJSON;
        }

        if (!normalized || typeof normalized !== 'object') {
            logDebug('Unexpected server chat send response shape', { response: response, normalized: normalized });
            return {
                attempted: 0,
                sent: 0,
                failed: 0
            };
        }

        return {
            attempted: Number(normalized.Attempted) || 0,
            sent: Number(normalized.Sent) || 0,
            failed: Number(normalized.Failed) || 0
        };
    }

    async function onChatButtonClick(chatText) {
        if (sendInProgress) {
            return;
        }

        const trimmedText = typeof chatText === 'string' ? chatText.trim() : '';
        if (!trimmedText) {
            return;
        }

        sendInProgress = true;
        setComposerBusy(true);

        try {
            const sessions = await fetchSessions();
            const groupsResponse = await fetchJson('SyncPlay/List');
            const groups = normalizeGroupsResponse(groupsResponse);

            const currentSession = getCurrentSession(sessions);
            const senderName = (currentSession && currentSession.UserName)
                || (currentSession && currentSession.User && currentSession.User.Name)
                || getCurrentUserName()
                || 'Someone';
            const messageText = senderName + ': ' + trimmedText;

            const groupIds = getGroupIdsForCurrentUserSessions(sessions);
            const groupsBySessionGroupIds = findGroupsByGroupIds(groups, groupIds);
            const relevantGroups = groups.filter(function (group) {
                return groupsContainCurrentUser([group], sessions);
            });
            let groupsForDetailLookup = [];

            if (groupsBySessionGroupIds.length > 0) {
                groupsForDetailLookup = groupsBySessionGroupIds;
            } else if (relevantGroups.length > 0) {
                groupsForDetailLookup = relevantGroups;
            } else if (groups.length === 1) {
                groupsForDetailLookup = [groups[0]];
            }

            const participantsForSend = extractParticipantsFromGroups(groupsForDetailLookup.length > 0 ? groupsForDetailLookup : groups);
            let result;
            const preferredGroupId = groupIds.length > 0 ? groupIds[0] : resolveSyncPlayGroupId(groupsForDetailLookup[0] || groups[0]);
            result = await sendMessageViaServer(
                messageText,
                currentSession && currentSession.Id,
                preferredGroupId,
                participantsForSend);

            logDebug('Sync chat send result', result);

            if (result && result.sent > 0) {
                appendLocalMessage(senderName, trimmedText);
                clearComposerInput();
            } else {
                showLocalToast('Failed to send SyncPlay chat message.');
            }
        } catch (err) {
            logDebug('Failed to send SyncPlay chat message', err);
            showLocalToast('Failed to send SyncPlay chat message.');
        } finally {
            sendInProgress = false;
            setComposerBusy(false);
        }
    }

    function groupsContainCurrentUser(groups, sessions) {
        const identityTokens = buildCurrentIdentityTokens(sessions);
        if (identityTokens.length === 0) {
            return false;
        }

        return groups.some(function (group) {
            return payloadContainsAnyIdentity(group, identityTokens);
        });
    }

    async function fetchSessions() {
        const paths = buildSessionsPaths();
        const sessionsById = {};
        const sessionsWithoutId = [];

        for (let i = 0; i < paths.length; i += 1) {
            const path = paths[i];
            try {
                const response = await fetchJson(path);
                const sessions = normalizeSessionsResponse(response);
                sessions.forEach(function (session) {
                    const sessionId = session && session.Id;
                    if (typeof sessionId === 'string' && sessionId.length > 0) {
                        sessionsById[sessionId] = session;
                        return;
                    }

                    sessionsWithoutId.push(session);
                });
            } catch (err) {
                logDebug('Failed to fetch sessions path', { path: path, error: err });
            }
        }

        const dedupedSessions = Object.keys(sessionsById).map(function (id) {
            return sessionsById[id];
        });

        if (dedupedSessions.length === 0 && sessionsWithoutId.length > 0) {
            return sessionsWithoutId;
        }

        return dedupedSessions;
    }

    async function resolveCurrentSyncPlayContext() {
        if (!window.ApiClient) {
            return {
                inGroup: false,
                groupId: '',
                groupName: '',
                unavailable: true
            };
        }

        const sessions = await fetchSessions();
        const matchingUserSessions = sessions.filter(matchesCurrentUser);
        if (matchingUserSessions.length === 0) {
            return {
                inGroup: false,
                groupId: '',
                groupName: '',
                unavailable: false
            };
        }

        const groupIds = getGroupIdsForCurrentUserSessions(sessions);
        let groups = [];
        let groupsUnavailable = false;

        try {
            const groupsResponse = await fetchJson('SyncPlay/List');
            groups = normalizeGroupsResponse(groupsResponse);
        } catch (err) {
            groupsUnavailable = true;
            logDebug('SyncPlay list request failed', err);
        }

        if (groupIds.length > 0 || matchingUserSessions.some(hasSyncPlayGroup)) {
            const preferredGroupId = groupIds.length > 0 ? groupIds[0] : '';
            const groupsBySessionGroupIds = findGroupsByGroupIds(groups, groupIds);
            const matchingGroup = groupsBySessionGroupIds[0] || null;
            return {
                inGroup: true,
                groupId: preferredGroupId || resolveSyncPlayGroupId(matchingGroup),
                groupName: resolveSyncPlayGroupName(matchingGroup),
                unavailable: false
            };
        }

        if (groups.length > 0) {
            const relevantGroups = groups.filter(function (group) {
                return groupsContainCurrentUser([group], sessions);
            });
            const matchingGroup = relevantGroups[0] || null;

            if (matchingGroup) {
                return {
                    inGroup: true,
                    groupId: resolveSyncPlayGroupId(matchingGroup),
                    groupName: resolveSyncPlayGroupName(matchingGroup),
                    unavailable: false
                };
            }

            if (await isCurrentUserInGroupsViaDetails(groups, sessions)) {
                const fallbackGroup = groups.length === 1 ? groups[0] : null;
                return {
                    inGroup: true,
                    groupId: resolveSyncPlayGroupId(fallbackGroup),
                    groupName: resolveSyncPlayGroupName(fallbackGroup),
                    unavailable: false
                };
            }
        }

        logDebug('Current user not in any SyncPlay group', {
            matchingUserSessions: matchingUserSessions.length
        });
        return {
            inGroup: false,
            groupId: '',
            groupName: '',
            unavailable: groupsUnavailable
        };
    }

    async function refreshSyncPlayState() {
        if (refreshInProgress) {
            return;
        }

        refreshInProgress = true;

        try {
            setCurrentSyncPlayContext(await resolveCurrentSyncPlayContext());
        } catch (err) {
            logDebug('Failed to refresh SyncPlay state', err);
            setCurrentSyncPlayContext({
                inGroup: false,
                groupId: '',
                groupName: '',
                unavailable: true
            });
            return;
        } finally {
            refreshInProgress = false;
            addButton();
        }
    }

    function addButton() {
        const floatingHost = getFloatingHost();
        removeExtraButtons();

        if (!floatingHost) {
            return;
        }

        getOrCreateDrawer();

        if (floatingHost.querySelector('.' + markerClass)) {
            renderSyncPlayStatus();
            return;
        }

        floatingHost.appendChild(createButton());
        renderSyncPlayStatus();
    }

    function start() {
        if (!document.body) {
            return;
        }

        window.__syncPlayChatLoaded = true;

        const observer = new MutationObserver(addButton);
        observer.observe(document.body, { childList: true, subtree: true });

        addButton();
        refreshSyncPlayState();
        window.setInterval(refreshSyncPlayState, refreshIntervalMs);
        window.addEventListener('focus', refreshSyncPlayState);
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) {
                refreshSyncPlayState();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
