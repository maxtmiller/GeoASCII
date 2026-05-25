// ==UserScript==
// @name         GeoASCII
// @description  Transforms GeoGuessr panoramas into a live, fully customizable ASCII text art display with native retro filter controls.
// @version      1.12.0
// @author       maxtmiller
// @match        https://www.geoguessr.com/*
// @run-at       document-start
// @license      MIT
// @icon         https://raw.githubusercontent.com/maxtmiller/GeoASCII/main/assets/geoascii-icon-32.png
// @namespace    https://github.com/maxtmiller/GeoASCII
// @grant        none
// @downloadURL  https://github.com/maxtmiller/GeoASCII/raw/main/geoascii.user.js
// @updateURL    https://github.com/maxtmiller/GeoASCII/raw/main/geoascii.meta.js
// @tag          geoguessr
// @tag          games
// @tag          ascii
// ==/UserScript==


// Default Baseline Configurations
const DEFAULT_RESOLUTION = 150;
const DEFAULT_CONTRAST = 1.0;
const DEFAULT_SATURATION = 1.0;
const DEFAULT_BRIGHTNESS = 1.0;
const DEFAULT_NOISE = 0;
const DEFAULT_BLUR = 0.0;
const DEFAULT_TINT_HEX = "#bc13fe";
const DEFAULT_PALETTE_SIZE = 10;
const DEFAULT_CMD_COLOURS = false;

let asciiEnabled = true;
let charResolution = DEFAULT_RESOLUTION;
let contrastSetting = DEFAULT_CONTRAST;
let saturationSetting = DEFAULT_SATURATION;
let brightnessSetting = DEFAULT_BRIGHTNESS;
let noiseSetting = DEFAULT_NOISE;
let blurSetting = DEFAULT_BLUR;
let paletteSizeSetting = DEFAULT_PALETTE_SIZE;

let resolutionSettingEnabled = true;
let paletteSettingEnabled = true;
let brightnessSettingEnabled = true;
let contrastSettingEnabled = true;
let saturationSettingEnabled = true;
let noiseSettingEnabled = true;
let blurSettingEnabled = true;

// Feature Toggles
let solidPixelMode = false;
let edgeDetectionMode = false;
let colorInversionMode = false;
let scanlineMode = false;
let thermalMode = false;
let tintMode = false;
let cmdColoursMode = DEFAULT_CMD_COLOURS;
let customTintHex = DEFAULT_TINT_HEX;

// --- Performance System ---
let cachedGameContainer = null;
let cachedWebGlCanvas = null;
let cachedIsGame = false;
let lifecycleCheckInterval = null;
let forceRender = true;
let renderQueued = false;
let cameraMoving = true;
let lastMovementTime = 0;
let userInteracting = false;
let interactionTimeout = null;
let mapInteractionUntil = 0;
let mapPointerDown = false;

const ACTIVE_FPS = 15;
const MOVEMENT_FPS = 30;
const IDLE_FPS = 2;
const CHANGE_CHECK_FPS = 20;
const MAP_PAUSE_AFTER_INTERACTION_MS = 2500;
const MAP_POINTER_RELEASE_PAUSE_MS = 900;
let currentFpsInterval = 1000 / ACTIVE_FPS;
let lastChangeCheckTime = 0;

const MASTER_PALETTE = '`,_!;|\\\"~^lr[](\\/L)>t<vTz?icf1{sIxYjJno}CZyVwmSXRqM$O9&NW0Q';
const MASTER_PALETTE_BASE = '@%#*+=-:. ';

let cachedPaletteSize = null;
let cachedPalette = "";

function getDynamicPalette() {
    const effectivePaletteSize = paletteSettingEnabled ? paletteSizeSetting : DEFAULT_PALETTE_SIZE;

    if (cachedPaletteSize === effectivePaletteSize) return cachedPalette;

    if (effectivePaletteSize >= MASTER_PALETTE.length) {
        cachedPaletteSize = effectivePaletteSize;
        cachedPalette = MASTER_PALETTE;
        return cachedPalette;
    }
    let result = "";
    const step = (MASTER_PALETTE.length - 1) / (effectivePaletteSize - 1);
    for (let i = 0; i < effectivePaletteSize; i++) {
        result += MASTER_PALETTE_BASE[i];
    }
    if (effectivePaletteSize > 10) {
        for (let i = 0; i < effectivePaletteSize - 10; i++) {
            const index = Math.round(i * step);
            result += MASTER_PALETTE[index];
        }
    }
    cachedPaletteSize = effectivePaletteSize;
    cachedPalette = result;
    return result;
}

let lastKnownWebGLWidth = 0;
let lastKnownWebGLHeight = 0;
let observedPanoramaContainer = null;
let containerMutationObserver = null;
let panelIsOpen = false;

// --- Core WebGL Interception Engine ---
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    if (type === 'webgl' || type === 'webgl2') {
        attributes = attributes || {};
        attributes.preserveDrawingBuffer = true;
        this.dataset.isInterceptedWebgl = "true";
    }
    return originalGetContext.call(this, type, attributes);
};

// Inject Styles
const styleElement = document.createElement("style");
styleElement.innerHTML = `
#ascii-art-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: #05010a;
    overflow: hidden;
    z-index: 9;
    pointer-events: none;
    display: flex;
    justify-content: center;
    align-items: center;
}
#ascii-display-canvas {
    transform-origin: center center;
    image-rendering: pixelated;
}
#ascii-control-panel {
    position: absolute;
    bottom: max(20px, 10vh);
    left: 20px;
    z-index: 99999;
    background: rgba(14, 5, 24, 0.95);
    border: 1px solid rgba(176, 38, 255, 0.3);
    border-radius: 14px;
    padding: 16px 8px 16px 16px;
    color: #f3e8ff;
    width: min(340px, 60vw);
    max-height: 75vh;
    display: none;
    flex-direction: column;
    box-shadow: 0 12px 40px rgba(0,0,0,0.7);
    backdrop-filter: blur(6px);
    font-family: Neo Sans, sans-serif, Helvetica, Arial;
}
.ascii-panel-content {
    overflow-y: auto;
    overflow-x: hidden;
    flex-grow: 1;
    padding-right: 12px;
}
.ascii-panel-content::-webkit-scrollbar { width: 4px; }
.ascii-panel-content::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); }
.ascii-panel-content::-webkit-scrollbar-thumb { background: rgba(176, 38, 255, 0.4); border-radius: 4px; }
[class*="styles_friendChatButton__"] { width: auto !important; height: auto !important; display: inline-flex !important; flex-direction: column !important; align-items: flex-start !important; }
[class*="styles_friendChatButton__"] > :not(.native-ascii-btn) { order: 1 !important; }
.native-ascii-btn {
    order: 2 !important;
    background: rgba(0, 0, 0, 0.6) !important;
    color: #b026ff !important;
    border: 1px solid rgba(176, 38, 255, 0.4) !important;
    border-radius: 24px !important;
    min-width: 110px !important;
    height: 40px !important;
    font-weight: bold !important;
    font-size: 13px !important;
    text-transform: uppercase !important;
    letter-spacing: 0.8px !important;
    cursor: pointer !important;
    backdrop-filter: blur(4px) !important;
    box-shadow: 0 0 15px rgba(176, 38, 255, 0.3), inset 0 0 10px rgba(176, 38, 255, 0.1) !important;
    transition: all 0.2s ease-in-out !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 0 16px !important;
    margin: 4px 0 !important;
}
.native-ascii-btn:hover {
    background: rgba(0, 0, 0, 0.8) !important;
    color: #c55eff !important;
    border-color: rgba(176, 38, 255, 0.8) !important;
    box-shadow: 0 0 25px rgba(176, 38, 255, 0.6), inset 0 0 10px rgba(176, 38, 255, 0.2) !important;
}
.ascii-btn-row { display: flex; gap: 8px; margin-top: 12px; padding-right: 8px; }
.ascii-action-btn { flex: 1; background: rgba(176, 38, 255, 0.2); border: 1px solid rgba(176, 38, 255, 0.5); color: #f3e8ff; padding: 8px 4px; border-radius: 6px; font-weight: bold; font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase; cursor: pointer; transition: all 0.15s ease-in-out; }
.ascii-action-btn:hover { background: rgba(176, 38, 255, 0.4); border-color: #c55eff; box-shadow: 0 0 10px rgba(176, 38, 255, 0.4); }
.ascii-action-btn.reset-variant { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.2); }
.ascii-action-btn.reset-variant:hover { background: rgba(255, 255, 255, 0.15); border-color: rgba(255, 255, 255, 0.4); box-shadow: 0 0 10px rgba(255, 255, 255, 0.1); }
.panel-title { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 12px; color: #c55eff; border-bottom: 1px solid rgba(176, 38, 255, 0.2); padding-bottom: 5px; flex-shrink: 0; padding-right: 8px; }
.ascii-slider-group { margin-bottom: 10px; }
.ascii-slider-group label { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; letter-spacing: 0.5px; gap: 10px; }
.ascii-slider-control { display: flex; align-items: center; gap: 8px; }
.ascii-slider { width: 100%; accent-color: #b026ff; cursor: pointer; }
.ascii-slider-control .ascii-slider { flex: 1; min-width: 0; }
.ascii-toggle-group { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 11px; }
.ascii-checkbox { accent-color: #b026ff; cursor: pointer; width: 16px; height: 16px; }
.ascii-color-picker-wrapper { display: flex; align-items: center; gap: 8px; }
.ascii-color-picker { background: none; border: none; width: 28px; height: 24px; cursor: pointer; padding: 0; }
.ascii-details { margin-top: 12px; border-top: 1px solid rgba(176, 38, 255, 0.2); padding-top: 6px; }
.ascii-summary { font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #c55eff; cursor: pointer; padding: 6px 0; user-select: none; outline: none; display: flex; justify-content: space-between; align-items: center; }
.ascii-summary::-webkit-details-marker { display: none; }
.ascii-summary::after { content: '▼'; font-size: 9px; transition: transform 0.2s ease; color: rgba(176, 38, 255, 0.7); }
.ascii-details[open] .ascii-summary::after { transform: rotate(180deg); }
`;
document.head.appendChild(styleElement);

let asciiWrapper = null;
let displayCanvas = null;
let displayCtx = null;
let captureCanvas = document.createElement('canvas');
let captureCtx = captureCanvas.getContext('2d', { willReadFrequently: true });
let probeCanvas = document.createElement('canvas');
let probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true });
let previousFrameSignature = "";
const CMD_COLOURS = [
    [0, 0, 0],
    [0, 0, 128],
    [0, 128, 0],
    [0, 128, 128],
    [128, 0, 0],
    [128, 0, 128],
    [128, 128, 0],
    [192, 192, 192],
    [128, 128, 128],
    [0, 0, 255],
    [0, 255, 0],
    [0, 255, 255],
    [255, 0, 0],
    [255, 0, 255],
    [255, 255, 0],
    [255, 255, 255]
];
const cmdColourStringCache = CMD_COLOURS.map(([r, g, b]) => `rgb(${r},${g},${b})`);
const rgbStringCache = new Array(4096);

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 188, g: 19, b: 254 };
}

function commandPromptColourString(r, g, b) {
    let bestIndex = 0;
    let bestDistance = Infinity;

    for (let i = 0; i < CMD_COLOURS.length; i++) {
        const colour = CMD_COLOURS[i];
        const dr = r - colour[0];
        const dg = g - colour[1];
        const db = b - colour[2];
        const distance = dr * dr + dg * dg + db * db;

        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = i;
        }
    }

    return cmdColourStringCache[bestIndex];
}

function quantizedRgbString(r, g, b) {
    const rq = Math.max(0, Math.min(15, r >> 4));
    const gq = Math.max(0, Math.min(15, g >> 4));
    const bq = Math.max(0, Math.min(15, b >> 4));
    const key = (rq << 8) | (gq << 4) | bq;
    let value = rgbStringCache[key];

    if (!value) {
        value = `rgb(${rq * 17},${gq * 17},${bq * 17})`;
        rgbStringCache[key] = value;
    }

    return value;
}

function renderColourString(r, g, b) {
    return cmdColoursMode
        ? commandPromptColourString(r, g, b)
        : quantizedRgbString(r, g, b);
}

function effectiveResolution() {
    return resolutionSettingEnabled ? charResolution : DEFAULT_RESOLUTION;
}

function effectiveBrightness() {
    return brightnessSettingEnabled ? brightnessSetting : DEFAULT_BRIGHTNESS;
}

function effectiveContrast() {
    return contrastSettingEnabled ? contrastSetting : DEFAULT_CONTRAST;
}

function effectiveSaturation() {
    return saturationSettingEnabled ? saturationSetting : DEFAULT_SATURATION;
}

function effectiveNoise() {
    return noiseSettingEnabled ? noiseSetting : DEFAULT_NOISE;
}

function effectiveBlur() {
    return blurSettingEnabled ? blurSetting : DEFAULT_BLUR;
}

function markRendererDirty() {
    forceRender = true;
    previousFrameSignature = "";
}

function isVisibleElement(element) {
    if (!element) return false;

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
        rect.width > 20 &&
        rect.height > 20 &&
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0.05
    );
}

function isResultsScreenActive() {
    return !!(
        document.querySelector('[data-qa="result-layout"]') ||
        document.querySelector('[data-qa="round-result"]') ||
        document.querySelector('[data-qa="final-results"]') ||
        document.querySelector('[class*="result-layout"]') ||
        document.querySelector('[class*="game-summary"]')
    );
}

function isGuessMapElement(element) {
    if (!element || element.closest('#ascii-control-panel') || element.closest('.native-ascii-btn')) {
        return false;
    }

    const mapElement = element.closest([
        '[data-qa="guess-map"]',
        '[data-qa="guess-map-canvas"]',
        '[data-qa="guess-map__canvas"]',
        '[class*="guess-map"]',
        '[class*="guessMap"]',
        '[class*="mapboxgl-map"]',
        '.mapboxgl-canvas',
        '.leaflet-container'
    ].join(','));

    if (!mapElement || !isVisibleElement(mapElement)) return false;
    if (cachedGameContainer && cachedGameContainer.contains(mapElement)) return false;

    return true;
}

function markMapInteraction(event) {
    if (isGuessMapElement(event.target)) {
        mapInteractionUntil = performance.now() + MAP_PAUSE_AFTER_INTERACTION_MS;
    }
}

function isMapInteractionActive() {
    return mapPointerDown || performance.now() < mapInteractionUntil;
}

function beginMapPointer(event) {
    if (!isGuessMapElement(event.target)) return;

    mapPointerDown = true;
    markMapInteraction(event);
}

function endMapPointer() {
    if (!mapPointerDown) return;

    mapPointerDown = false;
    mapInteractionUntil = performance.now() + MAP_POINTER_RELEASE_PAUSE_MS;
}

function beginInteraction(event) {
    userInteracting = true;
    cameraMoving = true;
    lastMovementTime = performance.now();
    if (event) markMapInteraction(event);

    clearTimeout(interactionTimeout);
    interactionTimeout = setTimeout(() => {
        userInteracting = false;
    }, 160);
}

function frameSignatureChanged(webGlCanvas) {
    if (!probeCtx || !webGlCanvas) return true;

    const probeWidth = 24;
    const probeHeight = 14;

    if (probeCanvas.width !== probeWidth || probeCanvas.height !== probeHeight) {
        probeCanvas.width = probeWidth;
        probeCanvas.height = probeHeight;
    }

    try {
        probeCtx.drawImage(webGlCanvas, 0, 0, probeWidth, probeHeight);
        const sample = probeCtx.getImageData(0, 0, probeWidth, probeHeight).data;
        let signature = "";

        for (let i = 0; i < sample.length; i += 32) {
            signature += String.fromCharCode(
                sample[i] >> 3,
                sample[i + 1] >> 3,
                sample[i + 2] >> 3
            );
        }

        const changed = signature !== previousFrameSignature;
        previousFrameSignature = signature;
        return changed;
    } catch (e) {
        return true;
    }
}

function generateGaussianNoise(stdDev) {
    if (stdDev === 0) return 0;
    let u1 = Math.random();
    let u2 = Math.random();
    if(u1 === 0) u1 = 0.0001;
    let randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.sin(2.0 * Math.PI * u2);
    return randStdNormal * stdDev;
}

function clearAndForceResizeBuffers() {
    captureCanvas.width = 0;
    captureCanvas.height = 0;
    previousFrameSignature = "";
    forceRender = true;
}

function clearDisplayedAsciiFrame() {
    if (!displayCanvas || !displayCtx) return;

    displayCtx.setTransform(1, 0, 0, 1, 0, 0);
    displayCtx.fillStyle = '#05010a';
    displayCtx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
}

function randomizeShaders() {
    charResolution = Math.floor(Math.random() * (300 - 80 + 1)) + 80;
    paletteSizeSetting = Math.floor(Math.random() * (MASTER_PALETTE.length - 4 + 1)) + 4;
    brightnessSetting = parseFloat((Math.random() * (1.4 - 0.6) + 0.6).toFixed(2));
    contrastSetting = parseFloat((Math.random() * (2.2 - 0.6) + 0.6).toFixed(1));
    saturationSetting = parseFloat((Math.random() * (2.5 - 0.0) + 0.0).toFixed(1));
    noiseSetting = Math.floor(Math.random() * 5) * 10;
    blurSetting = parseFloat((Math.random() * 1.5).toFixed(1));
    resolutionSettingEnabled = true;
    paletteSettingEnabled = true;
    brightnessSettingEnabled = true;
    contrastSettingEnabled = true;
    saturationSettingEnabled = true;
    noiseSettingEnabled = true;
    blurSettingEnabled = true;

    const modeRoll = Math.random();
    solidPixelMode = modeRoll > 0.80;
    edgeDetectionMode = modeRoll > 0.60 && modeRoll <= 0.80;
    thermalMode = modeRoll > 0.40 && modeRoll <= 0.60;
    colorInversionMode = Math.random() > 0.85;
    scanlineMode = Math.random() > 0.40;
    tintMode = Math.random() > 0.50 || thermalMode === false;
    cmdColoursMode = Math.random() > 0.5;
    customTintHex = "#" + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');

    syncGlobalVariablesToUi();
    clearAndForceResizeBuffers();
    markRendererDirty();
}

function resetShaders() {
    charResolution = DEFAULT_RESOLUTION;
    paletteSizeSetting = DEFAULT_PALETTE_SIZE;
    contrastSetting = DEFAULT_CONTRAST;
    saturationSetting = DEFAULT_SATURATION;
    brightnessSetting = DEFAULT_BRIGHTNESS;
    noiseSetting = DEFAULT_NOISE;
    blurSetting = DEFAULT_BLUR;
    resolutionSettingEnabled = true;
    paletteSettingEnabled = true;
    brightnessSettingEnabled = true;
    contrastSettingEnabled = true;
    saturationSettingEnabled = true;
    noiseSettingEnabled = true;
    blurSettingEnabled = true;
    solidPixelMode = false;
    edgeDetectionMode = false;
    colorInversionMode = false;
    scanlineMode = false;
    thermalMode = false;
    tintMode = false;
    cmdColoursMode = DEFAULT_CMD_COLOURS;
    customTintHex = DEFAULT_TINT_HEX;

    syncGlobalVariablesToUi();
    clearAndForceResizeBuffers();
    markRendererDirty();
}

function syncGlobalVariablesToUi() {
    if (!document.getElementById('ascii-control-panel')) return;
    document.getElementById('res-enable').checked = resolutionSettingEnabled;
    document.getElementById('res-slider').value = charResolution;
    document.getElementById('res-slider').disabled = !resolutionSettingEnabled;
    document.getElementById('res-val').innerText = effectiveResolution();
    document.getElementById('palette-enable').checked = paletteSettingEnabled;
    document.getElementById('palette-slider').value = paletteSizeSetting;
    document.getElementById('palette-slider').disabled = !paletteSettingEnabled;
    document.getElementById('palette-val').innerText = (paletteSettingEnabled ? paletteSizeSetting : DEFAULT_PALETTE_SIZE) + " Chars";
    document.getElementById('brightness-enable').checked = brightnessSettingEnabled;
    document.getElementById('brightness-slider').value = brightnessSetting;
    document.getElementById('brightness-slider').disabled = !brightnessSettingEnabled;
    document.getElementById('brightness-val').innerText = Math.round(effectiveBrightness() * 100) + "%";
    document.getElementById('contrast-enable').checked = contrastSettingEnabled;
    document.getElementById('contrast-slider').value = contrastSetting;
    document.getElementById('contrast-slider').disabled = !contrastSettingEnabled;
    document.getElementById('contrast-val').innerText = effectiveContrast().toFixed(1);
    document.getElementById('sat-enable').checked = saturationSettingEnabled;
    document.getElementById('sat-slider').value = saturationSetting;
    document.getElementById('sat-slider').disabled = !saturationSettingEnabled;
    document.getElementById('sat-val').innerText = effectiveSaturation().toFixed(1);
    document.getElementById('noise-enable').checked = noiseSettingEnabled;
    document.getElementById('noise-slider').value = noiseSetting;
    document.getElementById('noise-slider').disabled = !noiseSettingEnabled;
    document.getElementById('noise-val').innerText = effectiveNoise();
    document.getElementById('blur-enable').checked = blurSettingEnabled;
    document.getElementById('blur-slider').value = blurSetting;
    document.getElementById('blur-slider').disabled = !blurSettingEnabled;
    document.getElementById('blur-val').innerText = effectiveBlur().toFixed(1) + "px";
    document.getElementById('solid-toggle').checked = solidPixelMode;
    document.getElementById('edge-toggle').checked = edgeDetectionMode;
    document.getElementById('invert-toggle').checked = colorInversionMode;
    document.getElementById('scanline-toggle').checked = scanlineMode;
    document.getElementById('thermal-toggle').checked = thermalMode;
    document.getElementById('cmd-colours-toggle').checked = cmdColoursMode;
    document.getElementById('tint-toggle').checked = tintMode;
    document.getElementById('tint-picker').value = customTintHex;
}

function createUiPanel() {
    let panel = document.getElementById('ascii-control-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'ascii-control-panel';
        panel.innerHTML = `
            <div class="panel-title">🎛️ Master Controls</div>
            <div class="ascii-panel-content">
                <div class="ascii-toggle-group" style="margin-bottom: 12px; background: rgba(176,38,255,0.15); padding: 8px; border-radius: 6px;">
                    <span style="font-weight: bold; color: #c55eff;">Enable ASCII Shaders</span>
                    <input type="checkbox" id="master-ascii-toggle" class="ascii-checkbox" ${asciiEnabled ? 'checked' : ''}>
                </div>
                <div class="ascii-slider-group">
                    <label><span>Resolution</span><span id="res-val">${effectiveResolution()}</span></label>
                    <div class="ascii-slider-control"><input type="checkbox" id="res-enable" class="ascii-checkbox" ${resolutionSettingEnabled ? 'checked' : ''}><input type="range" id="res-slider" class="ascii-slider" min="50" max="350" value="${charResolution}"></div>
                </div>
                <div class="ascii-slider-group">
                    <label><span>Palette Details</span><span id="palette-val">${paletteSettingEnabled ? paletteSizeSetting : DEFAULT_PALETTE_SIZE} Chars</span></label>
                    <div class="ascii-slider-control"><input type="checkbox" id="palette-enable" class="ascii-checkbox" ${paletteSettingEnabled ? 'checked' : ''}><input type="range" id="palette-slider" class="ascii-slider" min="4" max="${MASTER_PALETTE.length}" step="1" value="${paletteSizeSetting}"></div>
                </div>
                <div class="ascii-slider-group">
                    <label><span>Brightness</span><span id="brightness-val">${Math.round(effectiveBrightness() * 100)}%</span></label>
                    <div class="ascii-slider-control"><input type="checkbox" id="brightness-enable" class="ascii-checkbox" ${brightnessSettingEnabled ? 'checked' : ''}><input type="range" id="brightness-slider" class="ascii-slider" min="0.5" max="1.5" step="0.05" value="${brightnessSetting}"></div>
                </div>
                <div class="ascii-slider-group">
                    <label><span>Contrast</span><span id="contrast-val">${effectiveContrast().toFixed(1)}</span></label>
                    <div class="ascii-slider-control"><input type="checkbox" id="contrast-enable" class="ascii-checkbox" ${contrastSettingEnabled ? 'checked' : ''}><input type="range" id="contrast-slider" class="ascii-slider" min="0.5" max="2.5" step="0.1" value="${contrastSetting}"></div>
                </div>
                <div class="ascii-slider-group">
                    <label><span>Saturation</span><span id="sat-val">${effectiveSaturation().toFixed(1)}</span></label>
                    <div class="ascii-slider-control"><input type="checkbox" id="sat-enable" class="ascii-checkbox" ${saturationSettingEnabled ? 'checked' : ''}><input type="range" id="sat-slider" class="ascii-slider" min="0.0" max="3.0" step="0.1" value="${saturationSetting}"></div>
                </div>
                <div class="ascii-slider-group">
                    <label><span>Gaussian Noise</span><span id="noise-val">${effectiveNoise()}</span></label>
                    <div class="ascii-slider-control"><input type="checkbox" id="noise-enable" class="ascii-checkbox" ${noiseSettingEnabled ? 'checked' : ''}><input type="range" id="noise-slider" class="ascii-slider" min="0" max="80" step="5" value="${noiseSetting}"></div>
                </div>
                <div class="ascii-slider-group">
                    <label><span>Pre-Blur</span><span id="blur-val">${effectiveBlur().toFixed(1) + "px"}</span></label>
                    <div class="ascii-slider-control"><input type="checkbox" id="blur-enable" class="ascii-checkbox" ${blurSettingEnabled ? 'checked' : ''}><input type="range" id="blur-slider" class="ascii-slider" min="0" max="5" step="0.1" value="${blurSetting}"></div>
                </div>
                <details class="ascii-details">
                    <summary class="ascii-summary">Extra Settings</summary>
                    <div class="ascii-toggle-group"><span>Solid Pixels (█)</span><input type="checkbox" id="solid-toggle" class="ascii-checkbox"></div>
                    <div class="ascii-toggle-group"><span>Edge Detection</span><input type="checkbox" id="edge-toggle" class="ascii-checkbox"></div>
                    <div class="ascii-toggle-group"><span>Invert Colors</span><input type="checkbox" id="invert-toggle" class="ascii-checkbox"></div>
                    <div class="ascii-toggle-group"><span>CRT Scanlines</span><input type="checkbox" id="scanline-toggle" class="ascii-checkbox"></div>
                    <div class="ascii-toggle-group"><span>Thermal / Heatmap</span><input type="checkbox" id="thermal-toggle" class="ascii-checkbox"></div>
                    <div class="ascii-toggle-group"><span>CMD Colours</span><input type="checkbox" id="cmd-colours-toggle" class="ascii-checkbox" ${cmdColoursMode ? 'checked' : ''}></div>
                    <div class="ascii-toggle-group">
                        <span>Color Tint Mode</span>
                        <div class="ascii-color-picker-wrapper">
                            <input type="color" id="tint-picker" class="ascii-color-picker" value="${customTintHex}">
                            <input type="checkbox" id="tint-toggle" class="ascii-checkbox">
                        </div>
                    </div>
                </details>
            </div>
            <div class="ascii-btn-row">
                <button type="button" id="ascii-random-btn" class="ascii-action-btn">🎲 Random</button>
                <button type="button" id="ascii-reset-btn" class="ascii-action-btn reset-variant">🔄 Reset</button>
            </div>
        `;
        document.body.appendChild(panel);
        panel.addEventListener('input', markRendererDirty, { passive: true });
        panel.addEventListener('change', markRendererDirty, { passive: true });

        // Events
        document.getElementById('master-ascii-toggle').addEventListener('change', (e) => { asciiEnabled = e.target.checked; if (asciiEnabled) clearAndForceResizeBuffers(); });
        document.getElementById('res-enable').addEventListener('change', (e) => { resolutionSettingEnabled = e.target.checked; syncGlobalVariablesToUi(); clearAndForceResizeBuffers(); });
        document.getElementById('palette-enable').addEventListener('change', (e) => { paletteSettingEnabled = e.target.checked; syncGlobalVariablesToUi(); clearAndForceResizeBuffers(); });
        document.getElementById('brightness-enable').addEventListener('change', (e) => { brightnessSettingEnabled = e.target.checked; syncGlobalVariablesToUi(); });
        document.getElementById('contrast-enable').addEventListener('change', (e) => { contrastSettingEnabled = e.target.checked; syncGlobalVariablesToUi(); });
        document.getElementById('sat-enable').addEventListener('change', (e) => { saturationSettingEnabled = e.target.checked; syncGlobalVariablesToUi(); });
        document.getElementById('noise-enable').addEventListener('change', (e) => { noiseSettingEnabled = e.target.checked; syncGlobalVariablesToUi(); });
        document.getElementById('blur-enable').addEventListener('change', (e) => { blurSettingEnabled = e.target.checked; syncGlobalVariablesToUi(); });
        document.getElementById('res-slider').addEventListener('input', (e) => { charResolution = parseInt(e.target.value); document.getElementById('res-val').innerText = effectiveResolution(); });
        document.getElementById('palette-slider').addEventListener('input', (e) => { paletteSizeSetting = parseInt(e.target.value); document.getElementById('palette-val').innerText = (paletteSettingEnabled ? paletteSizeSetting : DEFAULT_PALETTE_SIZE) + " Chars"; });
        document.getElementById('brightness-slider').addEventListener('input', (e) => { brightnessSetting = parseFloat(e.target.value); document.getElementById('brightness-val').innerText = Math.round(effectiveBrightness() * 100) + "%"; });
        document.getElementById('contrast-slider').addEventListener('input', (e) => { contrastSetting = parseFloat(e.target.value); document.getElementById('contrast-val').innerText = effectiveContrast().toFixed(1); });
        document.getElementById('sat-slider').addEventListener('input', (e) => { saturationSetting = parseFloat(e.target.value); document.getElementById('sat-val').innerText = effectiveSaturation().toFixed(1); });
        document.getElementById('noise-slider').addEventListener('input', (e) => { noiseSetting = parseInt(e.target.value); document.getElementById('noise-val').innerText = effectiveNoise(); });
        document.getElementById('blur-slider').addEventListener('input', (e) => { blurSetting = parseFloat(e.target.value); document.getElementById('blur-val').innerText = effectiveBlur().toFixed(1) + "px"; });
        document.getElementById('solid-toggle').addEventListener('change', (e) => { solidPixelMode = e.target.checked; });
        document.getElementById('edge-toggle').addEventListener('change', (e) => { edgeDetectionMode = e.target.checked; });
        document.getElementById('invert-toggle').addEventListener('change', (e) => { colorInversionMode = e.target.checked; });
        document.getElementById('scanline-toggle').addEventListener('change', (e) => { scanlineMode = e.target.checked; });
        document.getElementById('thermal-toggle').addEventListener('change', (e) => { thermalMode = e.target.checked; });
        document.getElementById('cmd-colours-toggle').addEventListener('change', (e) => { cmdColoursMode = e.target.checked; });
        document.getElementById('tint-toggle').addEventListener('change', (e) => { tintMode = e.target.checked; });
        document.getElementById('tint-picker').addEventListener('input', (e) => { customTintHex = e.target.value; });
        document.getElementById('ascii-random-btn').addEventListener('click', randomizeShaders);
        document.getElementById('ascii-reset-btn').addEventListener('click', resetShaders);
    }

    const targetChatButtonWrapper = document.querySelector('[class*="styles_friendChatButton__"]');
    if (targetChatButtonWrapper) {
        let customButton = targetChatButtonWrapper.querySelector('.native-ascii-btn');
        if (!customButton) {
            customButton = document.createElement('button');
            customButton.className = 'native-ascii-btn';
            customButton.innerText = panelIsOpen ? '❌ CLOSE' : 'ASCII Shaders';

            customButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                panelIsOpen = !panelIsOpen;
                if (panel) {
                    if (panelIsOpen) {
                        panel.style.display = 'flex';
                        customButton.innerText = '❌ CLOSE';
                    } else {
                        panel.style.display = 'none';
                        customButton.innerText = 'ASCII Shaders';
                    }
                }
            });
            targetChatButtonWrapper.appendChild(customButton);
        }
    }
}

function createAsciiOverlay(gameContainer) {
    if (document.getElementById('ascii-art-canvas')) return;

    asciiWrapper = document.createElement('div');
    asciiWrapper.id = 'ascii-art-canvas';

    displayCanvas = document.createElement('canvas');
    displayCanvas.id = 'ascii-display-canvas';
    displayCtx = displayCanvas.getContext('2d');

    asciiWrapper.appendChild(displayCanvas);
    gameContainer.appendChild(asciiWrapper);

    // REMOVED createUiPanel() FROM HERE TO PREVENT FRAMERATE OVERRIDES
}

function processPanoramaToAscii() {
    if (!asciiEnabled) {
        removeAsciiCanvasOnly();
        return;
    }

    const gameContainer = cachedGameContainer || document.querySelector('[data-qa=panorama]');
    if (!gameContainer) return;

    let webGlCanvas = cachedWebGlCanvas ||
                      gameContainer.querySelector('.widget-scene-canvas') ||
                      gameContainer.querySelector('canvas[data-is-intercepted-webgl="true"]');

    if (!webGlCanvas) return;
    if (webGlCanvas.width <= 300 || webGlCanvas.height <= 150) return;

    if (webGlCanvas.width !== lastKnownWebGLWidth || webGlCanvas.height !== lastKnownWebGLHeight) {
        lastKnownWebGLWidth = webGlCanvas.width;
        lastKnownWebGLHeight = webGlCanvas.height;
        clearDisplayedAsciiFrame();
        clearAndForceResizeBuffers();
    }

    if (isMapInteractionActive()) {
        currentFpsInterval = 1000 / IDLE_FPS;
        return;
    }

    createAsciiOverlay(gameContainer);

    const now = performance.now();
    const currentNoise = effectiveNoise();
    const needsAnimatedFrame = currentNoise > 0;
    let frameChanged = forceRender || needsAnimatedFrame;

    if (!frameChanged && now - lastChangeCheckTime >= 1000 / CHANGE_CHECK_FPS) {
        lastChangeCheckTime = now;
        frameChanged = frameSignatureChanged(webGlCanvas);
    }

    if (frameChanged) {
        cameraMoving = true;
        lastMovementTime = now;
    } else if (now - lastMovementTime > 180 && !userInteracting) {
        cameraMoving = false;
    }

    if (cameraMoving || userInteracting) {
        currentFpsInterval = 1000 / MOVEMENT_FPS;
    } else if (needsAnimatedFrame) {
        currentFpsInterval = 1000 / ACTIVE_FPS;
    } else {
        currentFpsInterval = 1000 / IDLE_FPS;
    }

    if (!frameChanged && !forceRender && !needsAnimatedFrame) {
        return;
    }

    const targetWidth = effectiveResolution();
    const canvasAspect = webGlCanvas.height / webGlCanvas.width;
    const targetHeight = Math.round(targetWidth * canvasAspect * 1.35);

    if (
        !targetWidth ||
        !targetHeight ||
        targetWidth < 2 ||
        targetHeight < 2 ||
        !isFinite(targetWidth) ||
        !isFinite(targetHeight)
    ) {
        return;
    }

    if (captureCanvas.width !== targetWidth || captureCanvas.height !== targetHeight) {
        captureCanvas.width = targetWidth;
        captureCanvas.height = targetHeight;
        displayCanvas.width = targetWidth * 7;
        displayCanvas.height = targetHeight * 10;
    }

    try {
        captureCtx.clearRect(0, 0, targetWidth, targetHeight);
        const currentBlur = effectiveBlur();
        if (currentBlur > 0) { captureCtx.filter = `blur(${currentBlur}px)`; } else { captureCtx.filter = 'none'; }
        captureCtx.drawImage(webGlCanvas, 0, 0, targetWidth, targetHeight);
        captureCtx.filter = 'none';

        const imgData = captureCtx.getImageData(0, 0, targetWidth, targetHeight);
        const data = imgData.data;
        forceRender = false;

        displayCtx.fillStyle = '#05010a';
        displayCtx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);
        displayCtx.font = "bold 11px 'Courier New', Courier, monospace";
        displayCtx.textBaseline = "top";

        const cellWidth = 7;
        const cellHeight = 10;
        const tintRgb = hexToRgb(customTintHex);
        const currentPalette = getDynamicPalette();
        const currentBrightness = effectiveBrightness();
        const currentContrast = effectiveContrast();
        const currentSaturation = effectiveSaturation();

        for (let y = 0; y < targetHeight; y++) {
            const isScanlineRow = scanlineMode && (y % 2 === 0);
            for (let x = 0; x < targetWidth; x++) {
                const i = (y * targetWidth + x) * 4;
                let r = data[i]; let g = data[i+1]; let b = data[i+2];

                if (currentBrightness !== 1.0) { r *= currentBrightness; g *= currentBrightness; b *= currentBrightness; }
                if (colorInversionMode) { r = 255 - r; g = 255 - g; b = 255 - b; }
                if (currentContrast !== 1.0) {
                    r = ((r - 128) * currentContrast) + 128;
                    g = ((g - 128) * currentContrast) + 128;
                    b = ((b - 128) * currentContrast) + 128;
                }
                if (currentSaturation !== 1.0) {
                    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                    r = gray + (r - gray) * currentSaturation; g = gray + (g - gray) * currentSaturation; b = gray + (b - gray) * currentSaturation;
                }
                if (currentNoise > 0) { const noise = generateGaussianNoise(currentNoise); r += noise; g += noise; b += noise; }

                r = Math.min(255, Math.max(0, r)); g = Math.min(255, Math.max(0, g)); b = Math.min(255, Math.max(0, b));

                let isEdge = false;
                if (edgeDetectionMode && x > 0 && y > 0 && x < targetWidth - 1 && y < targetHeight - 1) {
                    const idxRight = i + 4; const idxDown = i + (targetWidth * 4);
                    const currentBrightness = 0.299 * r + 0.587 * g + 0.114 * b;
                    const rightBrightness = 0.299 * data[idxRight] + 0.587 * data[idxRight+1] + 0.114 * data[idxRight+2];
                    const downBrightness = 0.299 * data[idxDown] + 0.587 * data[idxDown+1] + 0.114 * data[idxDown+2];
                    if (Math.abs(currentBrightness - rightBrightness) > 30 || Math.abs(currentBrightness - downBrightness) > 30) isEdge = true;
                }

                const finalBrightness = 0.299 * r + 0.587 * g + 0.114 * b;
                let charIndex = Math.floor((finalBrightness / 255) * (currentPalette.length - 1));
                let char = currentPalette[(currentPalette.length - 1) - charIndex];

                if (edgeDetectionMode) { char = isEdge ? '*' : ' '; }
                else if (solidPixelMode) { char = char !== ' ' ? '█' : ' '; }

                if (thermalMode && char !== ' ') {
                    const normalized = finalBrightness / 255;
                    if (normalized < 0.25) { r = 0; g = 0; b = 255 * (normalized / 0.25); }
                    else if (normalized < 0.5) { r = 255 * ((normalized - 0.25) / 0.25); g = 0; b = 255; }
                    else if (normalized < 0.75) { r = 255; g = 255 * ((normalized - 0.5) / 0.25); b = 0; }
                    else { r = 255; g = 255 * ((1.0 - normalized) / 0.25); b = 255 * ((normalized - 0.75) / 0.25); }
                }

                if (tintMode && !thermalMode && char !== ' ') {
                    const scalar = finalBrightness / 255;
                    r = tintRgb.r * scalar; g = tintRgb.g * scalar; b = tintRgb.b * scalar;
                }

                if (char !== ' ') {
                    if (isScanlineRow) { displayCtx.fillStyle = renderColourString(r * 0.25, g * 0.25, b * 0.25); }
                    else { displayCtx.fillStyle = renderColourString(r, g, b); }
                    displayCtx.fillText(char, x * cellWidth, y * cellHeight);
                }
            }
        }
        const scaleX = window.innerWidth / displayCanvas.width;
        const scaleY = window.innerHeight / displayCanvas.height;
        displayCanvas.style.transform = `scale(${scaleX * 1.005}, ${scaleY * 1.005})`;
    } catch (e) {}
}

function removeAsciiCanvasOnly() {
    const existingCanvas = document.getElementById('ascii-art-canvas');
    if (existingCanvas) existingCanvas.remove();
}

function removeFullUiOverlay() {
    removeAsciiCanvasOnly();
    const container = document.getElementById('ascii-control-panel');
    if (container) container.remove();
}

function setupPanoramaMutationObserver(targetContainer) {
    if (observedPanoramaContainer === targetContainer) return;
    if (containerMutationObserver) containerMutationObserver.disconnect();

    observedPanoramaContainer = targetContainer;
    containerMutationObserver = new MutationObserver((mutations) => {
        for (let mutation of mutations) {
            if (mutation.type === 'childList') {
                const ownOverlayChanged =
                    [...mutation.addedNodes].some(n => n.id === 'ascii-art-canvas') ||
                    [...mutation.removedNodes].some(n => n.id === 'ascii-art-canvas');

                if (ownOverlayChanged) continue;

                lastKnownWebGLWidth = 0; lastKnownWebGLHeight = 0;
                clearDisplayedAsciiFrame();
                clearAndForceResizeBuffers();
                requestImmediateRender();
                break;
            }
        }
    });
    containerMutationObserver.observe(targetContainer, { childList: true, subtree: true });
}

let lastFrameTime = 0;

function isGameRoute() {
    return location.pathname.includes('/game/') ||
           location.pathname.includes('/duels/') ||
           location.pathname.includes('/challenge/') ||
           location.pathname.includes('/battle-royale/') ||
           location.pathname.includes('/multiplayer/') ||
           location.pathname.includes('/singleplayer/');
}

function updateCachedElements() {
    cachedIsGame = isGameRoute();

    if (!cachedIsGame) {
        cachedGameContainer = null;
        cachedWebGlCanvas = null;
        return;
    }

    cachedGameContainer = document.querySelector('[data-qa=panorama]');
    cachedWebGlCanvas = cachedGameContainer
        ? cachedGameContainer.querySelector('.widget-scene-canvas') ||
          cachedGameContainer.querySelector('canvas[data-is-intercepted-webgl="true"]')
        : null;
}

function updateUiVisibility() {
    if (!cachedGameContainer) return;

    setupPanoramaMutationObserver(cachedGameContainer);
    createUiPanel();

    const panel = document.getElementById('ascii-control-panel');
    const existingButton = document.querySelector('.native-ascii-btn');
    const isResultsScreen = isResultsScreenActive();

    const panoramaReady =
        cachedWebGlCanvas &&
        cachedWebGlCanvas.width > 300 &&
        cachedWebGlCanvas.height > 150;

    const shouldShowUi =
        !!cachedGameContainer &&
        !!existingButton &&
        panoramaReady &&
        !isResultsScreen;

    if (existingButton) {
        existingButton.style.display = shouldShowUi ? 'flex' : 'none';
    }

    if (panel) {
        panel.style.display = panelIsOpen && shouldShowUi ? 'flex' : 'none';
    }
}

function startLifecyclePolling() {
    if (lifecycleCheckInterval) clearInterval(lifecycleCheckInterval);

    lifecycleCheckInterval = setInterval(() => {
        updateCachedElements();

        if (!cachedIsGame) {
            if (lastKnownWebGLWidth !== 0 || lastKnownWebGLHeight !== 0) {
                lastKnownWebGLWidth = 0;
                lastKnownWebGLHeight = 0;
                clearAndForceResizeBuffers();
            }

            if (containerMutationObserver) {
                containerMutationObserver.disconnect();
                containerMutationObserver = null;
                observedPanoramaContainer = null;
            }

            removeFullUiOverlay();
            return;
        }

        updateUiVisibility();

        if (cachedGameContainer && cachedWebGlCanvas && !document.getElementById('ascii-art-canvas')) {
            forceRender = true;
            requestImmediateRender();
        }
    }, 250);
}

function requestImmediateRender() {
    forceRender = true;

    if (renderQueued) return;

    renderQueued = true;
    requestAnimationFrame(() => {
        renderQueued = false;
        processPanoramaToAscii();
    });
}

function liveRenderLoop(timestamp) {
    requestAnimationFrame(liveRenderLoop);

    if (document.hidden) return;

    if (!asciiEnabled) {
        removeAsciiCanvasOnly();
        return;
    }

    if (!cachedIsGame || !cachedGameContainer || !cachedWebGlCanvas) return;

    const elapsed = timestamp - lastFrameTime;
    if (elapsed < currentFpsInterval) return;

    lastFrameTime = timestamp - (elapsed % currentFpsInterval);
    processPanoramaToAscii();
}

window.addEventListener('mousemove', beginInteraction, { passive: true });
window.addEventListener('mousedown', beginInteraction, { passive: true });
window.addEventListener('pointermove', beginInteraction, { passive: true });
window.addEventListener('touchmove', beginInteraction, { passive: true });
window.addEventListener('wheel', beginInteraction, { passive: true });
window.addEventListener('pointerdown', beginMapPointer, { passive: true });
window.addEventListener('pointerup', endMapPointer, { passive: true });
window.addEventListener('pointercancel', endMapPointer, { passive: true });
window.addEventListener('touchstart', beginMapPointer, { passive: true });
window.addEventListener('touchend', endMapPointer, { passive: true });

startLifecyclePolling();
updateCachedElements();
requestAnimationFrame(liveRenderLoop);
