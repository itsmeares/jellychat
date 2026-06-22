(function () {
    'use strict';

    if (window.__JELLYCHAT_LOADED__ === true) {
        if (window.console && typeof window.console.info === 'function') {
            window.console.info('[JellyChat] duplicate script ignored');
        }
        return;
    }

    window.__JELLYCHAT_LOADED__ = true;
    window.JellyChatDebug = {
        loaded: true,
        mounted: false,
        mountCount: 0,
        listenerCount: 0,
        intervalCount: 0,
        currentGroupId: '',
        apiMode: 'events',
        lastSequence: 0,
        eventCount: 0,
        supportedEventTypes: [
            'chat.message',
            'reaction.emoji',
            'playback.play',
            'playback.pause',
            'playback.seek',
            'system.notice'
        ],
        lastEventPollAt: null,
        lastEventPostAt: null,
        inputFocused: false,
        submitCount: 0,
        keydownListenerCount: 0,
        composerMountCount: 0,
        lastFocusReason: '',
        messageCount: 0,
        groupCount: 0,
        groupingWindowMs: 5 * 60 * 1000,
        lastGroupedAt: null,
        layoutMode: 'normal-docked',
        isVideoRoute: false,
        isFullscreen: false,
        drawerOpen: false,
        triggerPlacement: 'normal',
        drawerWidth: 340,
        fullscreenPlayerSurfaceSelector: '',
        fullscreenPlayerSurfaceTag: '',
        fullscreenPlayerSurfaceId: '',
        fullscreenPlayerSurfaceClass: '',
        videoReservedWidth: 0,
        videoElementFound: false,
        controlsElementFound: false,
        videoParentChain: '',
        controlsParentChain: '',
        lastLayoutUpdateAt: null,
        lastFullscreenLayoutAt: null,
        fullscreenElementTag: '',
        fullscreenHostTag: '',
        fullscreenHostId: '',
        fullscreenHostClass: '',
        rootParentTag: '',
        rootParentClass: '',
        rootMoveCount: 0,
        lastFullscreenChangeAt: null,
        controlsOverlapAvoided: false,
        lastError: null
    };

    if (window.console && typeof window.console.info === 'function') {
        window.console.info('[JellyChat] script loaded');
    }

    const debugState = window.JellyChatDebug;
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
    const fullscreenSurfaceAttribute = 'data-jellychat-fullscreen-surface';
    const fullscreenSurfaceClass = 'jellychat-fullscreen-player-surface';
    const positionedSurfaceClass = 'jellychat-positioned-surface';
    const refreshIntervalMs = 2000;
    const groupingWindowMs = 5 * 60 * 1000;
    const drawerWidthPx = 340;
    const mobileLayoutMaxWidthPx = 899;
    const supportedEventTypes = debugState.supportedEventTypes.slice();
    let refreshInProgress = false;
    let sendInProgress = false;
    let eventFetchInProgress = false;
    let historyMessages = [];
    let lastEventGroupId = '';
    let lastSequence = 0;
    let lastLayoutMode = '';
    let lastFullscreenHost = null;
    let lastFullscreenLayoutSignature = '';
    let fullscreenLayoutSurfaces = [];
    let activeMountHost = null;
    let normalMountHost = null;
    let layoutResizeTimer = 0;
    let composerInputElement = null;
    let composerFormElement = null;
    let currentSyncPlayContext = {
        inGroup: false,
        groupId: '',
        groupName: '',
        unavailable: true
    };

    function bindEvent(target, type, handler, options) {
        if (!target || typeof target.addEventListener !== 'function') {
            return;
        }

        target.addEventListener(type, handler, options);
        debugState.listenerCount += 1;
    }

    function recordError(error) {
        debugState.lastError = summarizeError(error);
    }

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
        if (details instanceof Error) {
            recordError(details);
        } else if (details && details.error) {
            recordError(details.error);
        }
    }

    function ensureStyles() {
        if (document.getElementById(styleId)) {
            return;
        }

        const style = document.createElement('style');
        style.id = styleId;
        style.setAttribute('data-jellychat-style', 'true');
        style.textContent = [
            ':root { --jellychat-drawer-width: 340px; }',
            'body.jellychat-drawer-open.jellychat-docked:not(.jellychat-fullscreen):not(.jellychat-video-route) { padding-right: var(--jellychat-drawer-width); box-sizing: border-box; }',
            'body.jellychat-video-route.jellychat-drawer-open.jellychat-docked { overflow-x: hidden; }',
            'html.jellychat-drawer-open.jellychat-docked.jellychat-video-route:not(.jellychat-mobile):not(.jellychat-fullscreen) .' + fullscreenSurfaceClass + ' { width: calc(100% - var(--jellychat-drawer-width)) !important; max-width: calc(100% - var(--jellychat-drawer-width)) !important; min-width: 0 !important; box-sizing: border-box !important; }',
            'html.jellychat-drawer-open.jellychat-docked.jellychat-video-route:not(.jellychat-mobile):not(.jellychat-fullscreen) .' + fullscreenSurfaceClass + '.' + positionedSurfaceClass + ' { right: var(--jellychat-drawer-width) !important; width: auto !important; max-width: none !important; }',
            'html.jellychat-drawer-open.jellychat-docked.jellychat-video-route:not(.jellychat-mobile):not(.jellychat-fullscreen) .' + fullscreenSurfaceClass + ' video { max-width: 100% !important; }',
            '.jellychat-fullscreen-host { --jellychat-drawer-width: 340px; box-sizing: border-box; }',
            '.jellychat-fullscreen-host.jellychat-fullscreen-docked { position: relative !important; overflow: hidden !important; }',
            '.jellychat-fullscreen-host.jellychat-fullscreen-docked .' + fullscreenSurfaceClass + ' { width: calc(100% - var(--jellychat-drawer-width)) !important; max-width: calc(100% - var(--jellychat-drawer-width)) !important; min-width: 0 !important; box-sizing: border-box !important; }',
            '.jellychat-fullscreen-host.jellychat-fullscreen-docked .' + fullscreenSurfaceClass + '.' + positionedSurfaceClass + ' { right: var(--jellychat-drawer-width) !important; width: auto !important; max-width: none !important; }',
            '.jellychat-fullscreen-host.jellychat-fullscreen-docked .' + fullscreenSurfaceClass + ' video { max-width: 100% !important; }',
            '#' + floatingHostId + ' { position: fixed; right: 1rem; bottom: 1rem; z-index: 2147483600; display: flex; align-items: flex-end; gap: 0.5rem; pointer-events: none; }',
            'body.jellychat-video-route #' + floatingHostId + ' { top: 4.5rem; right: 0.75rem; bottom: auto; }',
            '.jellychat-fullscreen-host #' + floatingHostId + ' { top: max(1rem, env(safe-area-inset-top)) !important; right: max(0.75rem, env(safe-area-inset-right)) !important; bottom: auto !important; z-index: 2147483600; }',
            'body.jellychat-mobile #' + floatingHostId + ' { right: 0.75rem; bottom: 0.75rem; top: auto; }',
            '.jellychat-fullscreen-host.jellychat-mobile #' + floatingHostId + ' { top: max(1rem, env(safe-area-inset-top)) !important; right: max(0.75rem, env(safe-area-inset-right)) !important; bottom: auto !important; }',
            '.' + markerClass + ' { pointer-events: auto; display: inline-flex; align-items: center; justify-content: center; width: 2.75rem; height: 2.75rem; padding: 0; border-radius: 0.65rem; border: 1px solid rgba(255, 255, 255, 0.22); background: rgba(18, 20, 24, 0.86); color: #fff; cursor: pointer; box-shadow: 0 6px 14px rgba(0, 0, 0, 0.24); }',
            'body.jellychat-video-route .' + markerClass + ', .jellychat-fullscreen-host .' + markerClass + ' { border-radius: 0.65rem 0 0 0.65rem; }',
            '.' + markerClass + ':hover, .' + markerClass + ':focus-visible { background: rgba(30, 34, 40, 0.94); border-color: rgba(255, 255, 255, 0.38); }',
            '.' + markerClass + '[aria-expanded="true"] { color: #00a4dc; border-color: rgba(0, 164, 220, 0.65); }',
            '#' + drawerId + ' { position: fixed; top: 0; right: 0; bottom: 0; z-index: 2147483601; display: flex; width: min(var(--jellychat-drawer-width), calc(100vw - 1rem)); max-width: 100vw; box-sizing: border-box; flex-direction: column; background: #101317; color: #f6f8fb; border-left: 1px solid rgba(255, 255, 255, 0.12); box-shadow: -16px 0 28px rgba(0, 0, 0, 0.38); transform: translateX(105%); transition: transform 190ms cubic-bezier(0.22, 1, 0.36, 1); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }',
            '#' + drawerId + '.is-open { transform: translateX(0); }',
            'body.jellychat-mobile #' + drawerId + ' { width: min(24rem, 100vw); }',
            '.jellychat-fullscreen-host #' + drawerId + ' { z-index: 2147483601; }',
            '.jellychat-fullscreen-host.jellychat-fullscreen-docked #' + drawerId + ' { position: absolute; top: 0; right: 0; bottom: 0; width: var(--jellychat-drawer-width); }',
            '.jellychat-fullscreen-host.jellychat-mobile #' + drawerId + ' { top: 0; bottom: max(4.75rem, env(safe-area-inset-bottom)); width: min(22rem, calc(100vw - 0.75rem)); }',
            '.syncPlayChatHeader { display: flex; align-items: center; justify-content: space-between; min-height: 3.5rem; padding: 0.85rem 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }',
            '.syncPlayChatHeader h2 { margin: 0; font-size: 1rem; line-height: 1.25rem; font-weight: 650; letter-spacing: 0; color: #fff; }',
            '#' + closeButtonId + ' { display: inline-flex; align-items: center; justify-content: center; width: 2.15rem; height: 2.15rem; padding: 0; border: 0; border-radius: 0.45rem; background: transparent; color: #d8dee8; cursor: pointer; font-size: 1.6rem; line-height: 1; }',
            '#' + closeButtonId + ':hover, #' + closeButtonId + ':focus-visible { background: rgba(255, 255, 255, 0.08); color: #fff; }',
            '#' + statusId + ' { margin: 0.8rem 1rem 0; padding: 0.6rem 0.7rem; border-radius: 0.5rem; background: rgba(255, 255, 255, 0.06); color: #cbd4df; font-size: 0.86rem; line-height: 1.25rem; }',
            '#' + statusId + '.is-active { background: rgba(0, 164, 220, 0.16); color: #d8f4ff; }',
            '#' + messagesId + ' { flex: 1 1 auto; overflow-y: auto; min-height: 0; padding: 1rem; }',
            '.syncPlayChatEmptyState { display: flex; min-height: 100%; align-items: center; justify-content: center; text-align: center; color: #aeb8c6; font-size: 0.92rem; line-height: 1.35rem; }',
            '.syncPlayChatMessageGroup { margin: 0 0 0.85rem; }',
            '.syncPlayChatMessageMeta { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; margin-bottom: 0.34rem; color: #b9c4d2; font-size: 0.76rem; line-height: 1rem; }',
            '.syncPlayChatMessageAuthor { color: #e8edf4; font-weight: 650; }',
            '.syncPlayChatMessageStack { display: flex; flex-direction: column; gap: 0.28rem; }',
            '.syncPlayChatMessage { padding: 0.52rem 0.65rem; border-radius: 0.55rem; background: rgba(255, 255, 255, 0.07); color: #f6f8fb; overflow-wrap: anywhere; }',
            '.syncPlayChatMessageBody { white-space: pre-wrap; font-size: 0.93rem; line-height: 1.35rem; }',
            '#' + formId + ' { display: flex; gap: 0.55rem; padding: 0.8rem 1rem 1rem; border-top: 1px solid rgba(255, 255, 255, 0.1); background: #101317; }',
            '#' + inputId + ' { flex: 1 1 auto; min-width: 0; min-height: 2.35rem; max-height: 7.5rem; box-sizing: border-box; resize: none; overflow-x: hidden; overflow-y: auto; padding: 0.52rem 0.65rem; border-radius: 0.5rem; border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.07); color: #fff; line-height: 1.25rem; font: inherit; font-size: 0.92rem; }',
            '#' + inputId + '::placeholder { color: #b5bfcc; opacity: 1; }',
            '#' + inputId + ':focus { outline: 2px solid rgba(0, 164, 220, 0.85); outline-offset: 1px; border-color: rgba(0, 164, 220, 0.85); }',
            '#' + inputId + ':disabled { opacity: 0.66; cursor: not-allowed; }',
            '#' + sendButtonId + ' { flex: 0 0 auto; min-width: 4.4rem; min-height: 2.35rem; padding: 0.48rem 0.75rem; border: 1px solid rgba(0, 164, 220, 0.55); border-radius: 0.5rem; background: #00a4dc; color: #001018; cursor: pointer; font: inherit; font-size: 0.9rem; font-weight: 650; }',
            '#' + sendButtonId + ':hover, #' + sendButtonId + ':focus-visible { background: #18b7ed; }',
            '#' + sendButtonId + ':disabled { border-color: rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.1); color: #aeb8c6; cursor: not-allowed; }',
            '@media (max-width: 56.1875rem) { body.jellychat-drawer-open.jellychat-docked { padding-right: 0; } #' + drawerId + ' { width: min(100vw, 24rem); } #' + floatingHostId + ' { right: 0.75rem; bottom: 0.75rem; top: auto; } }',
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
        host.setAttribute('data-jellychat-host', 'true');
        getActiveMountHost().appendChild(host);
        return host;
    }

    function setElementText(element, value) {
        if (element && element.textContent !== value) {
            element.textContent = value;
        }
    }

    function getElementTagName(element) {
        if (!element || !element.tagName) {
            return '';
        }

        return element.tagName.toLowerCase();
    }

    function getElementClassName(element) {
        if (!element || typeof element.className !== 'string') {
            return '';
        }

        return element.className;
    }

    function getElementId(element) {
        if (!element || typeof element.id !== 'string') {
            return '';
        }

        return element.id;
    }

    function getNormalMountHost() {
        if (!normalMountHost || !normalMountHost.isConnected) {
            normalMountHost = document.body;
        }

        return normalMountHost;
    }

    function getFullscreenHost() {
        return document.fullscreenElement || null;
    }

    function getActiveMountHost() {
        return getFullscreenHost() || getNormalMountHost();
    }

    function setElementClass(element, name, isEnabled) {
        if (element && element.classList) {
            element.classList.toggle(name, !!isEnabled);
        }
    }

    function clearFullscreenHostClasses(element) {
        if (!element || !element.classList) {
            return;
        }

        element.classList.remove(
            'jellychat-fullscreen-host',
            'jellychat-fullscreen-docked',
            'jellychat-drawer-open',
            'jellychat-docked',
            'jellychat-mobile'
        );
        element.style.removeProperty('--jellychat-drawer-width');
    }

    function isJellyChatElement(element) {
        if (!element || element.nodeType !== 1) {
            return false;
        }

        return element.id === floatingHostId
            || element.id === drawerId
            || element.id === styleId
            || element.hasAttribute('data-jellychat-host')
            || element.hasAttribute('data-jellychat-root')
            || element.hasAttribute('data-jellychat-button');
    }

    function isWithinJellyChatElement(element) {
        let current = element;
        while (current && current.nodeType === 1) {
            if (isJellyChatElement(current)) {
                return true;
            }

            current = current.parentElement;
        }

        return false;
    }

    function isSkippableSurfaceElement(element) {
        if (!element || element.nodeType !== 1 || isWithinJellyChatElement(element)) {
            return true;
        }

        const tagName = getElementTagName(element);
        return tagName === 'script'
            || tagName === 'style'
            || tagName === 'link'
            || tagName === 'button'
            || tagName === 'input'
            || tagName === 'textarea'
            || tagName === 'select'
            || tagName === 'svg';
    }

    function elementMatches(element, selector) {
        if (!element || typeof element.matches !== 'function') {
            return false;
        }

        try {
            return element.matches(selector);
        } catch (err) {
            return false;
        }
    }

    function getDirectChildUnderHost(element, host) {
        let current = element;
        while (current && current.parentElement && current.parentElement !== host) {
            current = current.parentElement;
        }

        return current && current.parentElement === host ? current : null;
    }

    function elementLooksLikeTopControllerOnly(element) {
        if (!element || getElementTagName(element) === 'video') {
            return false;
        }

        const className = getElementClassName(element).toLowerCase();
        const id = getElementId(element).toLowerCase();
        const label = className + ' ' + id;

        return !element.querySelector('video')
            && /(header|top|titlebar|toolbar|appbar|topbar)/i.test(label)
            && !/(bottom|progress|timeline|seek|transport)/i.test(label);
    }

    function elementLooksLikePlayerSurface(element) {
        if (!element || isSkippableSurfaceElement(element)) {
            return false;
        }

        if (elementLooksLikeTopControllerOnly(element)) {
            return false;
        }

        const className = getElementClassName(element);
        const id = getElementId(element);
        if (/video|player|osd|fullscreen|htmlvideoplayer|nowplaying/i.test(className + ' ' + id)) {
            return true;
        }

        return !!(element.querySelector && (
            element.querySelector('video')
            || element.querySelector('.videoOsdBottom')
            || element.querySelector('.osdControls')
            || element.querySelector('[class*="videoOsd"]')
            || element.querySelector('[class*="VideoOsd"]')
            || element.querySelector('[class*="videoPlayer"]')
            || element.querySelector('[class*="VideoPlayer"]')
        ));
    }

    function getElementRect(element) {
        if (!element || typeof element.getBoundingClientRect !== 'function') {
            return null;
        }

        try {
            return element.getBoundingClientRect();
        } catch (err) {
            return null;
        }
    }

    function describeElementSelector(element) {
        if (!element) {
            return '';
        }

        if (element.id) {
            return '#' + element.id;
        }

        const className = getElementClassName(element).trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.');
        return getElementTagName(element) + (className ? '.' + className : '');
    }

    function describeParentChain(element, host) {
        if (!element) {
            return '';
        }

        const chain = [];
        let current = element;
        while (current && current.nodeType === 1 && chain.length < 14) {
            chain.push(describeElementSelector(current));
            if (current === host) {
                break;
            }

            current = current.parentElement;
        }

        return chain.join(' <- ');
    }

    function uniqueElements(elements) {
        const unique = [];
        elements.forEach(function (element) {
            if (element && unique.indexOf(element) === -1) {
                unique.push(element);
            }
        });

        return unique;
    }

    function querySelectorList(root, selectors) {
        const matches = [];
        if (!root || !root.querySelectorAll) {
            return matches;
        }

        selectors.forEach(function (selector) {
            try {
                root.querySelectorAll(selector).forEach(function (element) {
                    if (!isWithinJellyChatElement(element)) {
                        matches.push(element);
                    }
                });
            } catch (err) {
                // Ignore selectors that a Jellyfin client browser does not understand.
            }
        });

        return uniqueElements(matches);
    }

    function findFullscreenVideoElement(host) {
        if (!host) {
            return null;
        }

        const videos = [];
        if (getElementTagName(host) === 'video') {
            videos.push(host);
        }

        if (host.querySelectorAll) {
            host.querySelectorAll('video').forEach(function (video) {
                if (!isWithinJellyChatElement(video)) {
                    videos.push(video);
                }
            });
        }

        return uniqueElements(videos).sort(function (first, second) {
            const firstRect = getElementRect(first);
            const secondRect = getElementRect(second);
            const firstArea = firstRect ? firstRect.width * firstRect.height : 0;
            const secondArea = secondRect ? secondRect.width * secondRect.height : 0;
            return secondArea - firstArea;
        })[0] || null;
    }

    function getFullscreenControlsSelectors() {
        return [
            '.videoOsdBottom',
            '.videoOsdBottom-maincontrols',
            '.videoOsdBottomControls',
            '.videoOsdControls',
            '.osdControls',
            '.osdControlsBottom',
            '.playbackControls',
            '.playerControls',
            '.nowPlayingBar',
            '.progressContainer',
            '[class*="videoOsdBottom"]',
            '[class*="VideoOsdBottom"]',
            '[class*="videoOsdControls"]',
            '[class*="VideoOsdControls"]',
            '[class*="osdControls"]',
            '[class*="OsdControls"]',
            '[class*="playbackControls"]',
            '[class*="PlaybackControls"]',
            '[class*="playerControls"]',
            '[class*="PlayerControls"]',
            '[class*="progress"]',
            '[class*="Progress"]',
            '[class*="timeline"]',
            '[class*="Timeline"]',
            '[role="slider"]',
            '[role="progressbar"]',
            'input[type="range"]',
            'progress'
        ];
    }

    function getControlCandidateScore(element, host) {
        if (!element || isSkippableSurfaceElement(element) || getElementTagName(element) === 'video') {
            return -1000;
        }

        const className = getElementClassName(element).toLowerCase();
        const id = getElementId(element).toLowerCase();
        const label = className + ' ' + id;
        let score = 0;

        if (/bottom/.test(label)) {
            score += 28;
        }

        if (/osd/.test(label)) {
            score += 18;
        }

        if (/control|transport|playback|button/.test(label)) {
            score += 14;
        }

        if (/progress|timeline|seek|slider/.test(label)) {
            score += 12;
        }

        if (/player|nowplaying/.test(label)) {
            score += 5;
        }

        if (/header|top|titlebar|toolbar|appbar|topbar/.test(label) && !/bottom/.test(label)) {
            score -= 30;
        }

        if (element.querySelector && element.querySelector('video')) {
            score -= 24;
        }

        if (element.querySelector && element.querySelector('button,[role="button"],input[type="range"],[role="slider"],progress,[aria-valuenow]')) {
            score += 10;
        }

        if (elementMatches(element, '[role="slider"],[role="progressbar"],input[type="range"],progress')) {
            score += 10;
        }

        const rect = getElementRect(element);
        const hostRect = getElementRect(host);
        if (rect && hostRect && rect.width > 0 && rect.height > 0) {
            if (rect.width >= hostRect.width * 0.35) {
                score += 8;
            }

            if (rect.top + (rect.height / 2) >= hostRect.top + (hostRect.height * 0.5)) {
                score += 14;
            }

            if (rect.bottom >= hostRect.bottom - Math.max(96, hostRect.height * 0.22)) {
                score += 8;
            }

            if (rect.height <= hostRect.height * 0.45) {
                score += 4;
            }
        }

        return score;
    }

    function findFullscreenControlsElement(host) {
        if (!host) {
            return null;
        }

        let candidates = querySelectorList(host, getFullscreenControlsSelectors());
        if (candidates.length === 0 && host.querySelectorAll) {
            candidates = Array.prototype.slice.call(host.querySelectorAll('div,section,nav,form,[role="slider"],[role="progressbar"]')).filter(function (element) {
                if (isWithinJellyChatElement(element)) {
                    return false;
                }

                const label = (getElementClassName(element) + ' ' + getElementId(element)).toLowerCase();
                return /bottom|osd|control|transport|playback|progress|timeline|seek|slider|nowplaying/.test(label)
                    || !!(element.querySelector && element.querySelector('button,[role="button"],input[type="range"],[role="slider"],progress,[aria-valuenow]'));
            });
        }

        let bestElement = null;
        let bestScore = -1000;
        candidates.forEach(function (candidate) {
            const score = getControlCandidateScore(candidate, host);
            if (score > bestScore) {
                bestScore = score;
                bestElement = candidate;
            }
        });

        return bestScore > 0 ? bestElement : null;
    }

    function getLowestCommonAncestor(first, second, host) {
        if (!first || !second || !host || !host.contains(first) || !host.contains(second)) {
            return null;
        }

        const firstAncestors = [];
        let current = first;
        while (current && current.nodeType === 1) {
            firstAncestors.push(current);
            if (current === host) {
                break;
            }

            current = current.parentElement;
        }

        current = second;
        while (current && current.nodeType === 1) {
            if (firstAncestors.indexOf(current) !== -1) {
                return current;
            }

            if (current === host) {
                break;
            }

            current = current.parentElement;
        }

        return null;
    }

    function isUsableFullscreenPlayerSurface(element, host, videoElement, controlsElement) {
        if (!element || element === host || isSkippableSurfaceElement(element) || getElementTagName(element) === 'video') {
            return false;
        }

        if (elementLooksLikeTopControllerOnly(element)) {
            return false;
        }

        if (videoElement && !element.contains(videoElement)) {
            return false;
        }

        if (controlsElement && !element.contains(controlsElement)) {
            return false;
        }

        return true;
    }

    function getFallbackFullscreenSurfaces(host, videoElement, controlsElement) {
        if (!host) {
            return [];
        }

        const surfaces = [];
        [videoElement, controlsElement].forEach(function (element) {
            const directChild = getDirectChildUnderHost(element, host);
            if (directChild && directChild !== host && !isSkippableSurfaceElement(directChild) && !elementLooksLikeTopControllerOnly(directChild)) {
                surfaces.push(directChild);
            }
        });

        const uniqueSurfaces = uniqueElements(surfaces);
        if (uniqueSurfaces.length > 0) {
            return uniqueSurfaces;
        }

        if (!host.children) {
            return [];
        }

        const directChildren = Array.prototype.slice.call(host.children).filter(function (element) {
            return !isSkippableSurfaceElement(element) && !elementLooksLikeTopControllerOnly(element);
        });

        const likelySurfaces = directChildren.filter(elementLooksLikePlayerSurface);
        if (likelySurfaces.length > 0) {
            return likelySurfaces;
        }

        if (directChildren.length === 1) {
            return directChildren;
        }

        return directChildren.filter(function (element) {
            const rect = getElementRect(element);
            return rect && rect.width > 160 && rect.height > 120;
        });
    }

    function inspectFullscreenPlayerSurface(host) {
        const videoElement = findFullscreenVideoElement(host);
        const controlsElement = findFullscreenControlsElement(host);
        let surface = null;

        if (videoElement && controlsElement) {
            const commonAncestor = getLowestCommonAncestor(videoElement, controlsElement, host);
            if (isUsableFullscreenPlayerSurface(commonAncestor, host, videoElement, controlsElement)) {
                surface = commonAncestor;
            }
        }

        return {
            videoElement: videoElement,
            controlsElement: controlsElement,
            surface: surface,
            fallbackSurfaces: surface ? [] : getFallbackFullscreenSurfaces(host, videoElement, controlsElement)
        };
    }

    function getFullscreenPlayerSurface(host) {
        return inspectFullscreenPlayerSurface(host).surface;
    }

    function markFullscreenSurface(element) {
        if (!element || isWithinJellyChatElement(element)) {
            return;
        }

        element.setAttribute(fullscreenSurfaceAttribute, 'true');
        element.classList.add(fullscreenSurfaceClass);
        const position = window.getComputedStyle ? window.getComputedStyle(element).position : '';
        element.classList.toggle(positionedSurfaceClass, position === 'absolute' || position === 'fixed' || position === 'sticky');
    }

    function clearFullscreenDockedLayout() {
        const knownSurfaces = fullscreenLayoutSurfaces.slice();
        if (document.querySelectorAll) {
            document.querySelectorAll('[' + fullscreenSurfaceAttribute + '], .' + fullscreenSurfaceClass).forEach(function (element) {
                if (knownSurfaces.indexOf(element) === -1) {
                    knownSurfaces.push(element);
                }
            });
        }

        knownSurfaces.forEach(function (element) {
            if (!element || !element.removeAttribute) {
                return;
            }

            element.removeAttribute(fullscreenSurfaceAttribute);
            if (element.classList) {
                element.classList.remove(fullscreenSurfaceClass, positionedSurfaceClass);
            }
        });

        fullscreenLayoutSurfaces = [];
    }

    function updateFullscreenSurfaceDebug(host, detection, surfaces, shouldDock) {
        const primarySurface = surfaces[0] || null;

        debugState.fullscreenHostTag = getElementTagName(host);
        debugState.fullscreenHostId = getElementId(host);
        debugState.fullscreenHostClass = getElementClassName(host);
        debugState.videoElementFound = !!(detection && detection.videoElement);
        debugState.controlsElementFound = !!(detection && detection.controlsElement);
        debugState.videoParentChain = detection ? describeParentChain(detection.videoElement, host) : '';
        debugState.controlsParentChain = detection ? describeParentChain(detection.controlsElement, host) : '';
        debugState.fullscreenPlayerSurfaceSelector = surfaces.map(describeElementSelector).join(', ');
        debugState.fullscreenPlayerSurfaceTag = getElementTagName(primarySurface);
        debugState.fullscreenPlayerSurfaceId = getElementId(primarySurface);
        debugState.fullscreenPlayerSurfaceClass = getElementClassName(primarySurface);
        debugState.videoReservedWidth = shouldDock && surfaces.length > 0 ? drawerWidthPx : 0;
    }

    function logFullscreenSurfaceDebug(host, detection, surfaces, shouldDock) {
        if (!host) {
            lastFullscreenLayoutSignature = '';
            return;
        }

        const signature = [
            shouldDock ? 'dock' : 'overlay',
            describeElementSelector(host),
            detection && detection.videoElement ? describeElementSelector(detection.videoElement) : '',
            detection && detection.controlsElement ? describeElementSelector(detection.controlsElement) : '',
            surfaces.map(describeElementSelector).join(',')
        ].join('|');

        if (signature === lastFullscreenLayoutSignature) {
            return;
        }

        lastFullscreenLayoutSignature = signature;
        logDebug('Fullscreen player surface detection', {
            shouldDock: shouldDock,
            host: describeElementSelector(host),
            hostClass: getElementClassName(host),
            videoElementFound: !!(detection && detection.videoElement),
            controlsElementFound: !!(detection && detection.controlsElement),
            videoParentChain: detection ? describeParentChain(detection.videoElement, host) : '',
            controlsParentChain: detection ? describeParentChain(detection.controlsElement, host) : '',
            chosenPlayerSurface: surfaces.map(describeElementSelector).join(', ')
        });
    }

    function applyFullscreenDockedLayout(host, shouldDock) {
        clearFullscreenDockedLayout();

        if (!host) {
            updateFullscreenSurfaceDebug(null, null, [], false);
            return [];
        }

        const detection = inspectFullscreenPlayerSurface(host);
        const primarySurface = detection.surface;
        const surfaces = shouldDock ? uniqueElements([primarySurface].concat(detection.fallbackSurfaces)) : [];

        surfaces.forEach(markFullscreenSurface);
        fullscreenLayoutSurfaces = surfaces;
        updateFullscreenSurfaceDebug(host, detection, surfaces, shouldDock);
        logFullscreenSurfaceDebug(host, detection, surfaces, shouldDock);

        if (shouldDock) {
            debugState.lastFullscreenLayoutAt = new Date().toISOString();
        }

        return surfaces;
    }

    function updateMountDebug(parent) {
        debugState.rootParentTag = getElementTagName(parent);
        debugState.rootParentClass = getElementClassName(parent);
    }

    function moveJellyChatRootToHost(host) {
        if (!host) {
            return;
        }

        const floatingHost = document.getElementById(floatingHostId);
        const drawer = document.getElementById(drawerId);
        let moved = false;

        if (floatingHost && floatingHost.parentElement !== host) {
            host.appendChild(floatingHost);
            moved = true;
        }

        if (drawer && drawer.parentElement !== host) {
            host.appendChild(drawer);
            moved = true;
        }

        activeMountHost = host;
        updateMountDebug(drawer ? drawer.parentElement : (floatingHost ? floatingHost.parentElement : host));

        if (moved) {
            debugState.rootMoveCount += 1;
            logDebug('JellyChat mount moved', {
                hostTag: getElementTagName(host),
                hostClass: getElementClassName(host)
            });
        }
    }

    function createButton() {
        const button = document.createElement('button');
        button.id = buttonId;
        button.type = 'button';
        button.className = 'emby-button ' + markerClass;
        button.setAttribute('data-jellychat-button', 'true');
        button.setAttribute('aria-label', 'SyncPlay chat');
        button.setAttribute('aria-controls', drawerId);
        button.setAttribute('aria-expanded', 'false');
        button.title = 'SyncPlay chat';
        button.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 4h16v11H8l-4 4V4z"/></svg>';
        bindEvent(button, 'click', function () {
            toggleDrawer();
        });
        return button;
    }

    function getOrCreateDrawer() {
        ensureStyles();

        const existingDrawers = document.querySelectorAll('[data-jellychat-root]');
        if (existingDrawers.length > 1) {
            for (let i = 1; i < existingDrawers.length; i += 1) {
                existingDrawers[i].remove();
            }
        }

        let drawer = existingDrawers[0] || document.getElementById(drawerId);
        if (drawer) {
            drawer.setAttribute('data-jellychat-root', 'true');
            composerFormElement = document.getElementById(formId);
            composerInputElement = document.getElementById(inputId);
            debugState.mounted = true;
            if (debugState.mountCount === 0) {
                debugState.mountCount = 1;
            }
            return drawer;
        }

        drawer = document.createElement('aside');
        drawer.id = drawerId;
        drawer.setAttribute('data-jellychat-root', 'true');
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
        bindEvent(closeButton, 'click', function () {
            closeDrawer();
        });

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
        composerFormElement = form;

        const input = document.createElement('textarea');
        input.id = inputId;
        input.rows = 1;
        input.placeholder = 'Join a SyncPlay group to chat';
        input.setAttribute('aria-label', 'SyncPlay chat message');
        input.wrap = 'soft';
        composerInputElement = input;

        const sendButton = document.createElement('button');
        sendButton.id = sendButtonId;
        sendButton.type = 'submit';
        sendButton.textContent = 'Send';

        bindEvent(form, 'submit', function (event) {
            event.preventDefault();
            debugState.submitCount += 1;
            sendComposerMessage();
        });

        bindEvent(input, 'keydown', function (event) {
            event.stopPropagation();
            debugState.keydownListenerCount = 1;

            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                if (composerFormElement && typeof composerFormElement.requestSubmit === 'function') {
                    composerFormElement.requestSubmit();
                } else {
                    debugState.submitCount += 1;
                    sendComposerMessage();
                }
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                closeDrawer();
            }
        });

        bindEvent(input, 'keyup', function (event) {
            event.stopPropagation();
        });

        bindEvent(input, 'input', function () {
            autoResizeComposerInput();
        });

        bindEvent(input, 'focus', function () {
            debugState.inputFocused = true;
        });

        bindEvent(input, 'blur', function () {
            debugState.inputFocused = false;
        });

        form.appendChild(input);
        form.appendChild(sendButton);

        drawer.appendChild(header);
        drawer.appendChild(status);
        drawer.appendChild(messages);
        drawer.appendChild(form);
        getActiveMountHost().appendChild(drawer);
        debugState.mounted = true;
        debugState.mountCount += 1;
        debugState.composerMountCount += 1;
        debugState.keydownListenerCount = 1;
        if (window.console && typeof window.console.info === 'function') {
            window.console.info('[JellyChat] drawer mounted');
        }

        renderSyncPlayStatus();
        return drawer;
    }

    function autoResizeComposerInput() {
        const input = getComposerInput();
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
        const input = getComposerInput();
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

    function getComposerInput() {
        if (composerInputElement && composerInputElement.isConnected) {
            return composerInputElement;
        }

        composerInputElement = document.getElementById(inputId);
        return composerInputElement;
    }

    function isInteractiveElement(element) {
        if (!element || element === document.body || element === document.documentElement) {
            return false;
        }

        const tagName = (element.tagName || '').toLowerCase();
        return tagName === 'input'
            || tagName === 'textarea'
            || tagName === 'select'
            || tagName === 'button'
            || tagName === 'a'
            || element.isContentEditable;
    }

    function hasActiveTextSelection() {
        if (!window.getSelection) {
            return false;
        }

        const selection = window.getSelection();
        return !!(selection && selection.type === 'Range' && String(selection).length > 0);
    }

    function canFocusComposer(reason) {
        const input = getComposerInput();
        if (!input || input.disabled || !currentSyncPlayContext.inGroup || !isDrawerOpen()) {
            return false;
        }

        if (hasActiveTextSelection()) {
            return false;
        }

        const activeElement = document.activeElement;
        if (activeElement === input) {
            return true;
        }

        if (reason === 'drawer-open' || reason === 'send-success') {
            return true;
        }

        const closeButton = document.getElementById(closeButtonId);
        return !isInteractiveElement(activeElement) || activeElement === closeButton;
    }

    function focusComposer(reason) {
        const focus = function () {
            if (!canFocusComposer(reason)) {
                return;
            }

            const input = getComposerInput();
            try {
                input.focus({ preventScroll: true });
            } catch (err) {
                input.focus();
            }

            debugState.inputFocused = document.activeElement === input;
            debugState.lastFocusReason = reason;
            autoResizeComposerInput();
        };

        if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(focus);
        } else {
            window.setTimeout(focus, 0);
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
        moveJellyChatRootToHost(getActiveMountHost());
        drawer.classList.add('is-open');
        drawer.setAttribute('aria-hidden', 'false');
        if ('inert' in drawer) {
            drawer.inert = false;
        }
        updateEntryButtonExpanded(true);
        updateLayout('drawer-open');
        renderSyncPlayStatus();
        pollSyncPlayChat();
        focusComposer('drawer-open');
    }

    function closeDrawer(skipLayoutUpdate) {
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
        if (!skipLayoutUpdate) {
            updateLayout('drawer-close');
        }
    }

    function toggleDrawer() {
        const drawer = getOrCreateDrawer();
        if (drawer.classList.contains('is-open')) {
            closeDrawer();
            return;
        }

        openDrawer();
    }

    function isDrawerOpen() {
        const drawer = document.getElementById(drawerId);
        return !!(drawer && drawer.classList.contains('is-open'));
    }

    function getFullscreenElementTag() {
        return getElementTagName(getFullscreenHost());
    }

    function isFullscreen() {
        return !!document.fullscreenElement;
    }

    function isMobileLayout() {
        return window.innerWidth <= mobileLayoutMaxWidthPx;
    }

    function detectVideoRoute() {
        const routeText = String(window.location.pathname || '') + ' ' + String(window.location.hash || '');
        if (/video|playback|nowplaying|livetv/i.test(routeText)) {
            return true;
        }

        return !!(document.querySelector('video')
            || document.querySelector('.videoOsdBottom')
            || document.querySelector('.osdControls')
            || document.querySelector('[class*="videoOsd"]')
            || document.querySelector('[class*="VideoOsd"]')
            || document.querySelector('[class*="videoPlayer"]')
            || document.querySelector('[class*="VideoPlayer"]'));
    }

    function setBodyClass(name, isEnabled) {
        if (!document.body) {
            return;
        }

        document.body.classList.toggle(name, !!isEnabled);
    }

    function setDocumentElementClass(name, isEnabled) {
        if (!document.documentElement) {
            return;
        }

        document.documentElement.classList.toggle(name, !!isEnabled);
    }

    function setLayoutClass(name, isEnabled) {
        setBodyClass(name, isEnabled);
        setDocumentElementClass(name, isEnabled);
    }

    function resolveLayoutMode(isDrawerOpenValue, isMobile, fullscreenActive) {
        if (fullscreenActive) {
            return isDrawerOpenValue && !isMobile ? 'fullscreen-docked' : 'fullscreen-overlay';
        }

        if (isMobile) {
            return 'mobile';
        }

        if (isDrawerOpenValue) {
            return 'normal-docked';
        }

        return 'normal-docked';
    }

    function isDockedLayoutMode(layoutMode, drawerOpen) {
        return !!drawerOpen && (layoutMode === 'normal-docked' || layoutMode === 'fullscreen-docked');
    }

    function updateFullscreenHostClasses(host, drawerOpen, layoutMode, isMobile) {
        if (lastFullscreenHost && lastFullscreenHost !== host) {
            clearFullscreenHostClasses(lastFullscreenHost);
        }

        lastFullscreenHost = host || null;

        if (!host) {
            return;
        }

        setElementClass(host, 'jellychat-fullscreen-host', true);
        setElementClass(host, 'jellychat-drawer-open', drawerOpen);
        setElementClass(host, 'jellychat-fullscreen-docked', layoutMode === 'fullscreen-docked' && drawerOpen);
        setElementClass(host, 'jellychat-docked', isDockedLayoutMode(layoutMode, drawerOpen));
        setElementClass(host, 'jellychat-mobile', isMobile);
        host.style.setProperty('--jellychat-drawer-width', drawerWidthPx + 'px');
    }

    function updateLayout(reason) {
        if (!document.body) {
            return;
        }

        const fullscreenHost = getFullscreenHost();
        const fullscreenActive = !!fullscreenHost;
        const targetHost = fullscreenHost || getNormalMountHost();
        moveJellyChatRootToHost(targetHost);

        const drawerOpen = isDrawerOpen();
        const videoRoute = detectVideoRoute();
        const mobile = isMobileLayout();
        const layoutMode = resolveLayoutMode(drawerOpen, mobile, fullscreenActive);
        const dockedLayout = isDockedLayoutMode(layoutMode, drawerOpen);
        const triggerPlacement = fullscreenActive ? 'fullscreen-safe' : (mobile ? 'mobile' : (videoRoute ? 'video-safe' : 'normal'));
        const playerSurfaceHost = fullscreenHost || (videoRoute ? document.body : null);
        const shouldDockPlayerSurface = dockedLayout && drawerOpen && videoRoute && !mobile;

        document.body.style.setProperty('--jellychat-drawer-width', drawerWidthPx + 'px');
        document.documentElement.style.setProperty('--jellychat-drawer-width', drawerWidthPx + 'px');
        updateFullscreenHostClasses(fullscreenHost, drawerOpen, layoutMode, mobile);
        const playerSurfaces = applyFullscreenDockedLayout(playerSurfaceHost, shouldDockPlayerSurface);
        setLayoutClass('jellychat-drawer-open', drawerOpen);
        setLayoutClass('jellychat-video-route', videoRoute);
        setLayoutClass('jellychat-docked', dockedLayout);
        setLayoutClass('jellychat-mobile', layoutMode === 'mobile' || (fullscreenActive && mobile));
        setLayoutClass('jellychat-fullscreen', fullscreenActive);

        if (reason === 'fullscreenchange') {
            debugState.lastFullscreenChangeAt = new Date().toISOString();
        }

        debugState.layoutMode = layoutMode;
        debugState.isVideoRoute = videoRoute;
        debugState.isFullscreen = fullscreenActive;
        debugState.drawerOpen = drawerOpen;
        debugState.triggerPlacement = triggerPlacement;
        debugState.drawerWidth = drawerWidthPx;
        debugState.lastLayoutUpdateAt = new Date().toISOString();
        debugState.fullscreenElementTag = getFullscreenElementTag();
        debugState.fullscreenHostTag = getElementTagName(fullscreenHost);
        debugState.fullscreenHostId = getElementId(fullscreenHost);
        debugState.fullscreenHostClass = getElementClassName(fullscreenHost);
        debugState.controlsOverlapAvoided = !drawerOpen
            || (shouldDockPlayerSurface && playerSurfaces.length > 0)
            || (layoutMode === 'fullscreen-overlay' && mobile)
            || (!fullscreenActive && dockedLayout)
            || layoutMode === 'mobile'
            || !videoRoute;
        updateMountDebug(targetHost);

        if (lastLayoutMode !== layoutMode) {
            logDebug('Layout mode changed', {
                mode: layoutMode,
                reason: reason,
                videoRoute: videoRoute,
                drawerOpen: drawerOpen
            });
            lastLayoutMode = layoutMode;
        }

    }

    function scheduleLayoutUpdate(reason) {
        if (layoutResizeTimer) {
            window.clearTimeout(layoutResizeTimer);
        }

        layoutResizeTimer = window.setTimeout(function () {
            layoutResizeTimer = 0;
            updateLayout(reason);
        }, 80);
    }

    function installRouteWatcher() {
        if (window.__JELLYCHAT_HISTORY_PATCHED__) {
            return;
        }

        const originalPushState = window.history && window.history.pushState;
        const originalReplaceState = window.history && window.history.replaceState;
        const emitRouteChange = function () {
            window.dispatchEvent(new Event('jellychat-routechange'));
        };

        if (typeof originalPushState === 'function') {
            window.history.pushState = function () {
                const result = originalPushState.apply(this, arguments);
                emitRouteChange();
                return result;
            };
        }

        if (typeof originalReplaceState === 'function') {
            window.history.replaceState = function () {
                const result = originalReplaceState.apply(this, arguments);
                emitRouteChange();
                return result;
            };
        }

        window.__JELLYCHAT_HISTORY_PATCHED__ = true;
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

    function isUsableDisplayName(value) {
        if (typeof value !== 'string') {
            return false;
        }

        const trimmed = value.trim();
        return trimmed.length > 0
            && trimmed.toLowerCase() !== 'true'
            && trimmed.toLowerCase() !== 'false';
    }

    function getMessageValue(message, pascalName, camelName) {
        if (!message || typeof message !== 'object') {
            return '';
        }

        if (message[pascalName] !== undefined && message[pascalName] !== null) {
            return message[pascalName];
        }

        if (message[camelName] !== undefined && message[camelName] !== null) {
            return message[camelName];
        }

        return '';
    }

    function normalizeRoomEvent(roomEvent) {
        const type = String(getMessageValue(roomEvent, 'Type', 'type') || '');
        const sequence = Number(getMessageValue(roomEvent, 'Sequence', 'sequence') || 0);
        return {
            id: String(getMessageValue(roomEvent, 'Id', 'id') || ''),
            sequence: Number.isFinite(sequence) ? sequence : 0,
            groupId: String(getMessageValue(roomEvent, 'GroupId', 'groupId') || ''),
            type: type,
            userId: String(getMessageValue(roomEvent, 'UserId', 'userId') || ''),
            userName: String(getMessageValue(roomEvent, 'UserName', 'userName') || ''),
            sessionId: String(getMessageValue(roomEvent, 'SessionId', 'sessionId') || ''),
            createdAtUtc: String(getMessageValue(roomEvent, 'CreatedAtUtc', 'createdAtUtc') || ''),
            text: String(getMessageValue(roomEvent, 'Text', 'text') || ''),
            emoji: String(getMessageValue(roomEvent, 'Emoji', 'emoji') || ''),
            playbackAction: String(getMessageValue(roomEvent, 'PlaybackAction', 'playbackAction') || ''),
            fromPositionTicks: getMessageValue(roomEvent, 'FromPositionTicks', 'fromPositionTicks'),
            toPositionTicks: getMessageValue(roomEvent, 'ToPositionTicks', 'toPositionTicks'),
            itemId: String(getMessageValue(roomEvent, 'ItemId', 'itemId') || ''),
            itemName: String(getMessageValue(roomEvent, 'ItemName', 'itemName') || ''),
            clientEventId: String(getMessageValue(roomEvent, 'ClientEventId', 'clientEventId') || '')
        };
    }

    function normalizeChatMessage(roomEvent) {
        const event = normalizeRoomEvent(roomEvent);
        if (event.type !== 'chat.message') {
            return null;
        }

        const userName = event.userName;
        return {
            id: event.id,
            sequence: event.sequence,
            groupId: event.groupId,
            userId: event.userId,
            userName: isUsableDisplayName(userName) ? String(userName).trim() : 'Someone',
            text: event.text,
            createdAtUtc: event.createdAtUtc
        };
    }

    function normalizeEventsResponse(response) {
        if (Array.isArray(response)) {
            return response.map(normalizeRoomEvent).filter(function (roomEvent) {
                return roomEvent.id && roomEvent.sequence > 0 && supportedEventTypes.indexOf(roomEvent.type) !== -1;
            });
        }

        if (response && Array.isArray(response.Items)) {
            return normalizeEventsResponse(response.Items);
        }

        if (response && Array.isArray(response.items)) {
            return normalizeEventsResponse(response.items);
        }

        return [];
    }

    function getChatMessagesFromEvents(events) {
        return events.map(normalizeChatMessage).filter(function (message) {
            return message && message.id && message.text;
        });
    }

    function formatMessageTime(message) {
        if (!message.createdAtUtc) {
            return '';
        }

        const createdAt = new Date(message.createdAtUtc);
        if (Number.isNaN(createdAt.getTime())) {
            return '';
        }

        return createdAt.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getMessageTime(message) {
        const createdAt = new Date(message.createdAtUtc);
        const ticks = createdAt.getTime();
        return Number.isNaN(ticks) ? 0 : ticks;
    }

    function getMessageSenderKey(message) {
        if (message.userId) {
            return 'id:' + message.userId;
        }

        return 'name:' + message.userName;
    }

    function groupMessages(messages, windowMs) {
        const sortedMessages = messages.slice().sort(function (left, right) {
            return getMessageTime(left) - getMessageTime(right);
        });
        const groups = [];

        sortedMessages.forEach(function (message) {
            const previousGroup = groups.length > 0 ? groups[groups.length - 1] : null;
            const previousMessage = previousGroup && previousGroup.messages.length > 0
                ? previousGroup.messages[previousGroup.messages.length - 1]
                : null;
            const senderKey = getMessageSenderKey(message);
            const messageTime = getMessageTime(message);
            const previousMessageTime = previousMessage ? getMessageTime(previousMessage) : 0;
            const shouldStartGroup = !previousMessage
                || previousGroup.senderKey !== senderKey
                || Math.abs(messageTime - previousMessageTime) > windowMs;

            if (shouldStartGroup) {
                groups.push({
                    key: message.id,
                    senderKey: senderKey,
                    userName: message.userName,
                    createdAtUtc: message.createdAtUtc,
                    messages: [message]
                });
                return;
            }

            previousGroup.messages.push(message);
        });

        debugState.messageCount = sortedMessages.length;
        debugState.groupCount = groups.length;
        debugState.groupingWindowMs = windowMs;
        debugState.lastGroupedAt = new Date().toISOString();
        return groups;
    }

    function isMessagesNearBottom(messages) {
        return messages.scrollHeight - messages.scrollTop - messages.clientHeight < 48;
    }

    function renderHistoryMessages() {
        getOrCreateDrawer();

        const messages = document.getElementById(messagesId);
        if (!messages) {
            return;
        }

        const shouldStickToBottom = historyMessages.length === 0 || isMessagesNearBottom(messages);
        const existing = messages.querySelectorAll('.syncPlayChatMessageGroup, .syncPlayChatMessage');
        existing.forEach(function (message) {
            message.remove();
        });

        const groups = groupMessages(historyMessages, groupingWindowMs);
        groups.forEach(function (group) {
            const groupNode = document.createElement('div');
            groupNode.className = 'syncPlayChatMessageGroup';
            groupNode.setAttribute('data-jellychat-group-key', group.key);

            const meta = document.createElement('div');
            meta.className = 'syncPlayChatMessageMeta';

            const authorNode = document.createElement('span');
            authorNode.className = 'syncPlayChatMessageAuthor';
            authorNode.textContent = group.userName;

            const timeNode = document.createElement('span');
            timeNode.textContent = formatMessageTime(group);

            const stack = document.createElement('div');
            stack.className = 'syncPlayChatMessageStack';

            meta.appendChild(authorNode);
            meta.appendChild(timeNode);
            groupNode.appendChild(meta);

            group.messages.forEach(function (chatMessage) {
                const message = document.createElement('div');
                message.className = 'syncPlayChatMessage';
                message.setAttribute('data-jellychat-message-key', chatMessage.id);

                const body = document.createElement('div');
                body.className = 'syncPlayChatMessageBody';
                body.textContent = chatMessage.text;

                message.appendChild(body);
                stack.appendChild(message);
            });

            groupNode.appendChild(stack);
            messages.appendChild(groupNode);
        });

        renderEmptyState();
        if (shouldStickToBottom) {
            messages.scrollTop = messages.scrollHeight;
        }
    }

    function mergeHistoryMessages(messages) {
        const byId = {};
        historyMessages.forEach(function (message) {
            if (message.id) {
                byId[message.id] = message;
            }
        });

        messages.forEach(function (message) {
            if (message.id) {
                byId[message.id] = message;
            }
        });

        historyMessages = Object.keys(byId)
            .map(function (id) { return byId[id]; })
            .sort(function (left, right) {
                const leftSequence = Number(left.sequence || 0);
                const rightSequence = Number(right.sequence || 0);
                if (leftSequence !== rightSequence) {
                    return leftSequence - rightSequence;
                }

                return String(left.createdAtUtc).localeCompare(String(right.createdAtUtc));
            });

        if (historyMessages.length > 100) {
            historyMessages = historyMessages.slice(historyMessages.length - 100);
        }

        lastSequence = historyMessages.reduce(function (maxSequence, message) {
            return Math.max(maxSequence, Number(message.sequence || 0));
        }, lastSequence);
        debugState.lastSequence = lastSequence;
        renderHistoryMessages();
    }

    function updateLastSequenceFromEvents(events) {
        events.forEach(function (roomEvent) {
            lastSequence = Math.max(lastSequence, Number(roomEvent.sequence || 0));
        });
        debugState.lastSequence = lastSequence;
        debugState.eventCount += events.length;
    }

    async function fetchChatEvents(forceFull) {
        if (eventFetchInProgress || !currentSyncPlayContext.inGroup || !currentSyncPlayContext.groupId) {
            return;
        }

        let shouldFetchFull = !!forceFull;
        if (lastEventGroupId !== currentSyncPlayContext.groupId) {
            lastEventGroupId = currentSyncPlayContext.groupId;
            lastSequence = 0;
            debugState.lastSequence = 0;
            historyMessages = [];
            shouldFetchFull = true;
        }

        eventFetchInProgress = true;

        try {
            let path = 'JellyChat/Events?groupId=' + encodeURIComponent(currentSyncPlayContext.groupId) + '&limit=100';
            if (!shouldFetchFull && lastSequence > 0) {
                path += '&afterSequence=' + encodeURIComponent(String(lastSequence));
            }

            const response = await fetchJson(path);
            debugState.lastEventPollAt = new Date().toISOString();
            const events = normalizeEventsResponse(response);
            updateLastSequenceFromEvents(events);
            const messages = getChatMessagesFromEvents(events);
            if (shouldFetchFull) {
                historyMessages = [];
            }

            if (messages.length > 0 || shouldFetchFull) {
                mergeHistoryMessages(messages);
            } else {
                renderEmptyState();
            }
        } catch (err) {
            logDebug('Failed to fetch JellyChat events', err);
        } finally {
            eventFetchInProgress = false;
        }
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
        const wasInGroup = currentSyncPlayContext.inGroup;
        const nextGroupId = (context && typeof context.groupId === 'string') ? context.groupId : '';
        const groupChanged = nextGroupId !== currentSyncPlayContext.groupId;
        currentSyncPlayContext = {
            inGroup: !!(context && context.inGroup),
            groupId: nextGroupId,
            groupName: (context && typeof context.groupName === 'string') ? context.groupName : '',
            unavailable: !!(context && context.unavailable)
        };

        debugState.currentGroupId = currentSyncPlayContext.groupId;
        if (!currentSyncPlayContext.inGroup || groupChanged) {
            historyMessages = [];
            lastSequence = 0;
            lastEventGroupId = currentSyncPlayContext.groupId;
            debugState.lastSequence = 0;
            renderHistoryMessages();
        }

        renderSyncPlayStatus();
        if (!wasInGroup && currentSyncPlayContext.inGroup && isDrawerOpen()) {
            focusComposer('group-joined');
        }
    }

    function getComposerMessageText() {
        const input = getComposerInput();
        if (!input) {
            return '';
        }

        return (input.value || '').trim();
    }

    function clearComposerInput() {
        const input = getComposerInput();
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
        const existingButtons = document.querySelectorAll('[data-jellychat-button], .' + markerClass);
        if (existingButtons.length > 0) {
            existingButtons[0].setAttribute('data-jellychat-button', 'true');
        }

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

    function createClientEventId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }

        return String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    }

    async function sendMessageViaServer(text, senderSessionId, groupId, participants) {
        const response = await postJson('JellyChat/Events', {
            GroupId: groupId || '',
            SenderSessionId: senderSessionId || '',
            Type: 'chat.message',
            Text: text,
            ClientEventId: createClientEventId(),
            ParticipantsCsv: (participants || []).join(',')
        }, true);
        debugState.lastEventPostAt = new Date().toISOString();

        let normalized = response;
        if (typeof normalized === 'string') {
            try {
                normalized = JSON.parse(normalized);
            } catch (parseError) {
                logDebug('Failed to parse JellyChat event response JSON', {
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
            logDebug('Unexpected JellyChat event response shape', { response: response, normalized: normalized });
            return null;
        }

        const event = normalizeRoomEvent(normalized);
        updateLastSequenceFromEvents([event]);
        return normalizeChatMessage(normalized);
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
        let shouldFocusAfterSend = false;
        setComposerBusy(true);

        try {
            const sessions = await fetchSessions();
            const groupsResponse = await fetchJson('SyncPlay/List');
            const groups = normalizeGroupsResponse(groupsResponse);
            const currentSession = getCurrentSession(sessions);

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
                trimmedText,
                currentSession && currentSession.Id,
                preferredGroupId,
                participantsForSend);

            logDebug('Sync chat send result', result);

            if (result && result.id) {
                mergeHistoryMessages([result]);
                clearComposerInput();
                shouldFocusAfterSend = true;
            } else {
                logDebug('Failed to send SyncPlay chat message.');
            }
        } catch (err) {
            logDebug('Failed to send SyncPlay chat message', err);
        } finally {
            sendInProgress = false;
            setComposerBusy(false);
            if (shouldFocusAfterSend) {
                focusComposer('send-success');
            }
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

    async function pollSyncPlayChat() {
        await refreshSyncPlayState();
        if (currentSyncPlayContext.inGroup && (isDrawerOpen() || currentSyncPlayContext.groupId)) {
            await fetchChatEvents(false);
        }
    }

    function addButton() {
        const floatingHost = getFloatingHost();
        removeExtraButtons();

        if (!floatingHost) {
            return;
        }

        getOrCreateDrawer();

        const existingButton = document.querySelector('[data-jellychat-button]');
        if (existingButton) {
            existingButton.setAttribute('data-jellychat-button', 'true');
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

        installRouteWatcher();
        addButton();
        updateLayout('start');
        pollSyncPlayChat();

        if (window.__JELLYCHAT_REFRESH_INTERVAL_ID__ === undefined || window.__JELLYCHAT_REFRESH_INTERVAL_ID__ === null) {
            window.__JELLYCHAT_REFRESH_INTERVAL_ID__ = window.setInterval(pollSyncPlayChat, refreshIntervalMs);
            debugState.intervalCount = 1;
        } else {
            debugState.intervalCount = 1;
        }

        if (!window.__JELLYCHAT_LISTENERS_BOUND__) {
            bindEvent(window, 'focus', pollSyncPlayChat);
            bindEvent(document, 'visibilitychange', function () {
                if (!document.hidden) {
                    pollSyncPlayChat();
                }
            });
            bindEvent(window, 'resize', function () {
                scheduleLayoutUpdate('resize');
            });
            bindEvent(document, 'fullscreenchange', function () {
                updateLayout('fullscreenchange');
                if (isDrawerOpen()) {
                    focusComposer('fullscreenchange');
                }
            });
            bindEvent(window, 'hashchange', function () {
                scheduleLayoutUpdate('hashchange');
            });
            bindEvent(window, 'popstate', function () {
                scheduleLayoutUpdate('popstate');
            });
            bindEvent(window, 'jellychat-routechange', function () {
                scheduleLayoutUpdate('routechange');
            });
            window.__JELLYCHAT_LISTENERS_BOUND__ = true;
        }
    }

    if (document.readyState === 'loading') {
        bindEvent(document, 'DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
