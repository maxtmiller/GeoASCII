// ==UserScript==
// @name         GeoASCII
// @description  Transforms GeoGuessr panoramas into a live, fully customizable ASCII text art display with native retro filter controls.
// @version      1.8.0
// @author       maxtmiller
// @match        https://www.geoguessr.com/*
// @run-at       document-start
// @license      MIT
// @icon         https://raw.githubusercontent.com/maxtmiller/geo-ascii/main/assets/geoascii-icon.png
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
const DEFAULT_PALETTE_SIZE = 10; // Default to standard-ish size (~10 chars)

let asciiEnabled = true;
let charResolution = DEFAULT_RESOLUTION;
let contrastSetting = DEFAULT_CONTRAST;
let saturationSetting = DEFAULT_SATURATION;
let brightnessSetting = DEFAULT_BRIGHTNESS;
let noiseSetting = DEFAULT_NOISE;
let blurSetting = DEFAULT_BLUR;
let paletteSizeSetting = DEFAULT_PALETTE_SIZE; // Tracks character depth range

// Feature Toggles
let solidPixelMode = false;
let edgeDetectionMode = false;
let colorInversionMode = false;
let scanlineMode = false;
let thermalMode = false;
let tintMode = false;
let customTintHex = DEFAULT_TINT_HEX;

// The Absolute Master High-Definition Palette (68 characters)
const MASTER_PALETTE = '`,_!;|\\\"~^lr[](\\/L)>t<vTz?icf1{sIxYjJno}CZyVwmSXRqM$O9&NW0Q';
const MASTER_PALETTE_BASE = '@%#*+=-:. ';

/**
 * Dynamically generates a proportional sub-palette from the master ramp.
 * It samples evenly across the string to preserve an accurate gradient.
 */
function getDynamicPalette() {
    if (paletteSizeSetting >= MASTER_PALETTE.length) return MASTER_PALETTE;

    let result = "";
    const step = (MASTER_PALETTE.length - 1) / (paletteSizeSetting - 1);
    for (let i = 0; i < paletteSizeSetting; i++) {
        result += MASTER_PALETTE_BASE[i];
    }
    if (paletteSizeSetting > 10) {
        for (let i = 0; i < paletteSizeSetting - 10; i++) {
            const index = Math.round(i * step);
            result += MASTER_PALETTE[index];
        }
    }
    return result;
}

// For watching structural shifts across game loads
let lastKnownWebGLWidth = 0;
let lastKnownWebGLHeight = 0;


// --------- DON'T MODIFY ANYTHING BELOW THIS LINE -------- //

// --- Core WebGL Interception ---
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, attributes) {
    if (type === 'webgl' || type === 'webgl2') {
        attributes = attributes || {};
        attributes.preserveDrawingBuffer = true;
    }
    return originalGetContext.call(this, type, attributes);
};

// Inject Advanced Control UI Styles & Game Layout Tweaks
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

/* Fluid, responsive menu placement */
#ascii-control-panel {
    position: absolute;
    bottom: max(20px, 10vh);
    left: 20px;
    z-index: 99999;
    background: rgba(14, 5, 24, 0.95);
    border: 1px solid rgba(176, 38, 255, 0.3);
    border-radius: 14px;
    padding: 16px 8px 16px 16px; /* Reduced right padding to bring scrollbar closer to edge */
    color: #f3e8ff;
    width: min(265px, 45vw);
    max-height: 75vh;
    display: none;
    flex-direction: column;
    box-shadow: 0 12px 40px rgba(0,0,0,0.7);
    backdrop-filter: blur(6px);
    font-family: Neo Sans, sans-serif, Helvetica, Arial;
}

/* Scrollable container with padding safety layout buffer */
.ascii-panel-content {
    overflow-y: auto;
    overflow-x: hidden;
    flex-grow: 1;
    padding-right: 12px; /* Added padding width to prevent text blocking */
}

/* Custom minimal scrollbar styling pushed cleanly to the boundary */
.ascii-panel-content::-webkit-scrollbar {
    width: 4px;
}
.ascii-panel-content::-webkit-scrollbar-track {
    background: rgba(255, 255, 255, 0.02);
}
.ascii-panel-content::-webkit-scrollbar-thumb {
    background: rgba(176, 38, 255, 0.4);
    border-radius: 4px;
}

/* Custom Overrides for the Intercepted Grid Container */
[class*="styles_friendChatButton__"] {
    width: auto !important;
    height: auto !important;
    display: inline-flex !important;
    flex-direction: column !important;
    align-items: flex-start !important;
}

/* Force native children (like the friend elements) to explicitly stack FIRST */
[class*="styles_friendChatButton__"] > :not(.native-ascii-btn) {
    order: 1 !important;
}

/* Restyled Injected Native Button Variant - forced to stay at the very bottom */
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
    -webkit-backdrop-filter: blur(4px) !important;
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

/* Row wrapper for action utilities adjusted to match offset width */
.ascii-btn-row {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    padding-right: 8px;
}

/* Utility UI Buttons inside container */
.ascii-action-btn {
    flex: 1;
    background: rgba(176, 38, 255, 0.2);
    border: 1px solid rgba(176, 38, 255, 0.5);
    color: #f3e8ff;
    padding: 8px 4px;
    border-radius: 6px;
    font-weight: bold;
    font-size: 10px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    cursor: pointer;
    transition: all 0.15s ease-in-out;
}
.ascii-action-btn:hover {
    background: rgba(176, 38, 255, 0.4);
    border-color: #c55eff;
    box-shadow: 0 0 10px rgba(176, 38, 255, 0.4);
}
.ascii-action-btn.reset-variant {
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.2);
}
.ascii-action-btn.reset-variant:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.4);
    box-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
}

.panel-title {
    font-size: 13px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 12px;
    color: #c55eff;
    border-bottom: 1px solid rgba(176, 38, 255, 0.2);
    padding-bottom: 5px;
    flex-shrink: 0;
    padding-right: 8px;
}
.ascii-slider-group {
    margin-bottom: 10px;
}
.ascii-slider-group label {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    margin-bottom: 4px;
    letter-spacing: 0.5px;
}
.ascii-slider {
    width: 100%;
    accent-color: #b026ff;
    cursor: pointer;
}
.ascii-toggle-group {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
    font-size: 11px;
}
.ascii-checkbox {
    accent-color: #b026ff;
    cursor: pointer;
    width: 16px;
    height: 16px;
}
.ascii-color-picker-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
}
.ascii-color-picker {
    background: none;
    border: none;
    width: 28px;
    height: 24px;
    cursor: pointer;
    padding: 0;
}

/* Collapsible Dropdown Menu Styles */
.ascii-details {
    margin-top: 12px;
    border-top: 1px solid rgba(176, 38, 255, 0.2);
    padding-top: 6px;
}
.ascii-summary {
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #c55eff;
    cursor: pointer;
    padding: 6px 0;
    user-select: none;
    outline: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.ascii-summary::-webkit-details-marker {
    display: none;
}
.ascii-summary::after {
    content: '▼';
    font-size: 9px;
    transition: transform 0.2s ease;
    color: rgba(176, 38, 255, 0.7);
}
.ascii-details[open] .ascii-summary::after {
    transform: rotate(180deg);
}
`;

document.head.appendChild(styleElement);

let asciiWrapper = null;
let displayCanvas = null;
let displayCtx = null;
let captureCanvas = document.createElement('canvas');
let captureCtx = captureCanvas.getContext('2d');

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 188, g: 19, b: 254 };
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
}

function randomizeShaders() {
    charResolution = Math.floor(Math.random() * (300 - 80 + 1)) + 80;
    paletteSizeSetting = Math.floor(Math.random() * (MASTER_PALETTE.length - 4 + 1)) + 4;
    brightnessSetting = parseFloat((Math.random() * (1.4 - 0.6) + 0.6).toFixed(2));
    contrastSetting = parseFloat((Math.random() * (2.2 - 0.6) + 0.6).toFixed(1));
    saturationSetting = parseFloat((Math.random() * (2.5 - 0.0) + 0.0).toFixed(1));
    noiseSetting = Math.floor(Math.random() * 5) * 10;
    blurSetting = parseFloat((Math.random() * 1.5).toFixed(1));

    const modeRoll = Math.random();
    solidPixelMode = modeRoll > 0.80;
    edgeDetectionMode = modeRoll > 0.60 && modeRoll <= 0.80;
    thermalMode = modeRoll > 0.40 && modeRoll <= 0.60;

    colorInversionMode = Math.random() > 0.85;
    scanlineMode = Math.random() > 0.40;
    tintMode = Math.random() > 0.50 || thermalMode === false;

    customTintHex = "#" + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');

    syncGlobalVariablesToUi();
    clearAndForceResizeBuffers();
}

function resetShaders() {
    charResolution = DEFAULT_RESOLUTION;
    paletteSizeSetting = DEFAULT_PALETTE_SIZE;
    contrastSetting = DEFAULT_CONTRAST;
    saturationSetting = DEFAULT_SATURATION;
    brightnessSetting = DEFAULT_BRIGHTNESS;
    noiseSetting = DEFAULT_NOISE;
    blurSetting = DEFAULT_BLUR;

    solidPixelMode = false;
    edgeDetectionMode = false;
    colorInversionMode = false;
    scanlineMode = false;
    thermalMode = false;
    tintMode = false;
    customTintHex = DEFAULT_TINT_HEX;

    syncGlobalVariablesToUi();
    clearAndForceResizeBuffers();
}

function syncGlobalVariablesToUi() {
    if (!document.getElementById('ascii-control-panel')) return;

    document.getElementById('res-slider').value = charResolution;
    document.getElementById('res-val').innerText = charResolution;

    document.getElementById('palette-slider').value = paletteSizeSetting;
    document.getElementById('palette-val').innerText = paletteSizeSetting + " Chars";

    document.getElementById('brightness-slider').value = brightnessSetting;
    document.getElementById('brightness-val').innerText = Math.round(brightnessSetting * 100) + "%";

    document.getElementById('contrast-slider').value = contrastSetting;
    document.getElementById('contrast-val').innerText = contrastSetting.toFixed(1);

    document.getElementById('sat-slider').value = saturationSetting;
    document.getElementById('sat-val').innerText = saturationSetting.toFixed(1);

    document.getElementById('noise-slider').value = noiseSetting;
    document.getElementById('noise-val').innerText = noiseSetting;

    document.getElementById('blur-slider').value = blurSetting;
    document.getElementById('blur-val').innerText = blurSetting.toFixed(1) + "px";

    document.getElementById('solid-toggle').checked = solidPixelMode;
    document.getElementById('edge-toggle').checked = edgeDetectionMode;
    document.getElementById('invert-toggle').checked = colorInversionMode;
    document.getElementById('scanline-toggle').checked = scanlineMode;
    document.getElementById('thermal-toggle').checked = thermalMode;
    document.getElementById('tint-toggle').checked = tintMode;
    document.getElementById('tint-picker').value = customTintHex;
}

function createUiPanel() {
    if (!document.getElementById('ascii-control-panel')) {
        const panel = document.createElement('div');
        panel.id = 'ascii-control-panel';
        panel.innerHTML = `
            <div class="panel-title">🎛️ Master Controls</div>

            <div class="ascii-panel-content">
                <div class="ascii-toggle-group" style="margin-bottom: 12px; background: rgba(176,38,255,0.15); padding: 8px; border-radius: 6px;">
                    <span style="font-weight: bold; color: #c55eff;">Enable ASCII Shaders</span>
                    <input type="checkbox" id="master-ascii-toggle" class="ascii-checkbox" ${asciiEnabled ? 'checked' : ''}>
                </div>

                <div class="ascii-slider-group">
                    <label><span>Resolution</span><span id="res-val">${charResolution}</span></label>
                    <input type="range" id="res-slider" class="ascii-slider" min="50" max="350" value="${charResolution}">
                </div>
                <div class="ascii-slider-group">
                    <label><span>Palette Details</span><span id="palette-val">${paletteSizeSetting} Chars</span></label>
                    <input type="range" id="palette-slider" class="ascii-slider" min="4" max="${MASTER_PALETTE.length}" step="1" value="${paletteSizeSetting}">
                </div>
                <div class="ascii-slider-group">
                    <label><span>Brightness</span><span id="brightness-val">${Math.round(brightnessSetting * 100)}%</span></label>
                    <input type="range" id="brightness-slider" class="ascii-slider" min="0.5" max="1.5" step="0.05" value="${brightnessSetting}">
                </div>
                <div class="ascii-slider-group">
                    <label><span>Contrast</span><span id="contrast-val">${contrastSetting.toFixed(1)}</span></label>
                    <input type="range" id="contrast-slider" class="ascii-slider" min="0.5" max="2.5" step="0.1" value="${contrastSetting}">
                </div>
                <div class="ascii-slider-group">
                    <label><span>Saturation</span><span id="sat-val">${saturationSetting.toFixed(1)}</span></label>
                    <input type="range" id="sat-slider" class="ascii-slider" min="0.0" max="3.0" step="0.1" value="${saturationSetting}">
                </div>
                <div class="ascii-slider-group">
                    <label><span>Gaussian Noise</span><span id="noise-val">${noiseSetting}</span></label>
                    <input type="range" id="noise-slider" class="ascii-slider" min="0" max="80" step="5" value="${noiseSetting}">
                </div>
                <div class="ascii-slider-group">
                    <label><span>Pre-Blur</span><span id="blur-val">${blurSetting.toFixed(1)}px</span></label>
                    <input type="range" id="blur-slider" class="ascii-slider" min="0" max="5" step="0.1" value="${blurSetting}">
                </div>

                <details class="ascii-details">
                    <summary class="ascii-summary">Extra Settings</summary>
                    <div class="ascii-toggle-group">
                        <span>Solid Pixels (█)</span>
                        <input type="checkbox" id="solid-toggle" class="ascii-checkbox">
                    </div>
                    <div class="ascii-toggle-group">
                        <span>Edge Detection</span>
                        <input type="checkbox" id="edge-toggle" class="ascii-checkbox">
                    </div>
                    <div class="ascii-toggle-group">
                        <span>Invert Colors</span>
                        <input type="checkbox" id="invert-toggle" class="ascii-checkbox">
                    </div>
                    <div class="ascii-toggle-group">
                        <span>CRT Scanlines</span>
                        <input type="checkbox" id="scanline-toggle" class="ascii-checkbox">
                    </div>
                    <div class="ascii-toggle-group">
                        <span>Thermal / Heatmap</span>
                        <input type="checkbox" id="thermal-toggle" class="ascii-checkbox">
                    </div>
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

        // UI Event Hookups
        document.getElementById('master-ascii-toggle').addEventListener('change', (e) => { asciiEnabled = e.target.checked; if (asciiEnabled) clearAndForceResizeBuffers(); });
        document.getElementById('res-slider').addEventListener('input', (e) => { charResolution = parseInt(e.target.value); document.getElementById('res-val').innerText = charResolution; });
        document.getElementById('palette-slider').addEventListener('input', (e) => { paletteSizeSetting = parseInt(e.target.value); document.getElementById('palette-val').innerText = paletteSizeSetting + " Chars"; });
        document.getElementById('brightness-slider').addEventListener('input', (e) => { brightnessSetting = parseFloat(e.target.value); document.getElementById('brightness-val').innerText = Math.round(brightnessSetting * 100) + "%"; });
        document.getElementById('contrast-slider').addEventListener('input', (e) => { contrastSetting = parseFloat(e.target.value); document.getElementById('contrast-val').innerText = contrastSetting.toFixed(1); });
        document.getElementById('sat-slider').addEventListener('input', (e) => { saturationSetting = parseFloat(e.target.value); document.getElementById('sat-val').innerText = saturationSetting.toFixed(1); });
        document.getElementById('noise-slider').addEventListener('input', (e) => { noiseSetting = parseInt(e.target.value); document.getElementById('noise-val').innerText = noiseSetting; });
        document.getElementById('blur-slider').addEventListener('input', (e) => { blurSetting = parseFloat(e.target.value); document.getElementById('blur-val').innerText = blurSetting.toFixed(1) + "px"; });
        document.getElementById('solid-toggle').addEventListener('change', (e) => { solidPixelMode = e.target.checked; });
        document.getElementById('edge-toggle').addEventListener('change', (e) => { edgeDetectionMode = e.target.checked; });
        document.getElementById('invert-toggle').addEventListener('change', (e) => { colorInversionMode = e.target.checked; });
        document.getElementById('scanline-toggle').addEventListener('change', (e) => { scanlineMode = e.target.checked; });
        document.getElementById('thermal-toggle').addEventListener('change', (e) => { thermalMode = e.target.checked; });
        document.getElementById('tint-toggle').addEventListener('change', (e) => { tintMode = e.target.checked; });
        document.getElementById('tint-picker').addEventListener('input', (e) => { customTintHex = e.target.value; });

        // Action Button Triggers
        document.getElementById('ascii-random-btn').addEventListener('click', randomizeShaders);
        document.getElementById('ascii-reset-btn').addEventListener('click', resetShaders);
    }

    const targetChatButtonWrapper = document.querySelector('[class*="styles_friendChatButton__"]');
    if (targetChatButtonWrapper && !targetChatButtonWrapper.querySelector('.native-ascii-btn')) {
        const customButton = document.createElement('button');
        customButton.className = 'native-ascii-btn';
        customButton.innerText = 'ASCII Shaders';

        customButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const panel = document.getElementById('ascii-control-panel');
            if (panel) {
                if (panel.style.display === 'flex') {
                    panel.style.display = 'none';
                    customButton.innerText = 'ASCII Shaders';
                } else {
                    panel.style.display = 'flex';
                    customButton.innerText = '❌ CLOSE';
                }
            }
        });

        targetChatButtonWrapper.appendChild(customButton);
    }
}

function createAsciiOverlay() {
    if (document.getElementById('ascii-art-canvas')) return;

    asciiWrapper = document.createElement('div');
    asciiWrapper.id = 'ascii-art-canvas';

    displayCanvas = document.createElement('canvas');
    displayCanvas.id = 'ascii-display-canvas';
    displayCtx = displayCanvas.getContext('2d');

    asciiWrapper.appendChild(displayCanvas);

    const gameContainer = document.querySelector('[data-qa=panorama]');
    if (gameContainer) {
        gameContainer.appendChild(asciiWrapper);
        createUiPanel();
    }
}

function processPanoramaToAscii() {
    if (!asciiEnabled) {
        removeAsciiCanvasOnly();
        return;
    }

    const webGlCanvas = document.querySelector('.widget-scene-canvas');
    if (!webGlCanvas) return;

    if (webGlCanvas.width !== lastKnownWebGLWidth || webGlCanvas.height !== lastKnownWebGLHeight || webGlCanvas.width === 0) {
        lastKnownWebGLWidth = webGlCanvas.width;
        lastKnownWebGLHeight = webGlCanvas.height;
        clearAndForceResizeBuffers();
    }

    createAsciiOverlay();

    const targetWidth = charResolution;
    const canvasAspect = webGlCanvas.height / webGlCanvas.width;
    const targetHeight = Math.round(targetWidth * canvasAspect * 1.35);

    if (captureCanvas.width !== targetWidth || captureCanvas.height !== targetHeight) {
        captureCanvas.width = targetWidth;
        captureCanvas.height = targetHeight;
        displayCanvas.width = targetWidth * 7;
        displayCanvas.height = targetHeight * 10;
    }

    try {
        captureCtx.clearRect(0, 0, targetWidth, targetHeight);

        if (blurSetting > 0) {
            captureCtx.filter = `blur(${blurSetting}px)`;
        } else {
            captureCtx.filter = 'none';
        }

        captureCtx.drawImage(webGlCanvas, 0, 0, targetWidth, targetHeight);
        captureCtx.filter = 'none';

        const imgData = captureCtx.getImageData(0, 0, targetWidth, targetHeight);
        const data = imgData.data;

        displayCtx.fillStyle = '#05010a';
        displayCtx.fillRect(0, 0, displayCanvas.width, displayCanvas.height);

        displayCtx.font = "bold 11px 'Courier New', Courier, monospace";
        displayCtx.textBaseline = "top";

        const cellWidth = 7;
        const cellHeight = 10;
        const tintRgb = hexToRgb(customTintHex);

        // Compute our customized sub-palette for this frame
        const currentPalette = getDynamicPalette();

        for (let y = 0; y < targetHeight; y++) {
            const isScanlineRow = scanlineMode && (y % 2 === 0);

            for (let x = 0; x < targetWidth; x++) {
                const i = (y * targetWidth + x) * 4;

                let r = data[i];
                let g = data[i+1];
                let b = data[i+2];

                if (brightnessSetting !== 1.0) {
                    r *= brightnessSetting; g *= brightnessSetting; b *= brightnessSetting;
                }

                if (colorInversionMode) {
                    r = 255 - r; g = 255 - g; b = 255 - b;
                }

                if (contrastSetting !== 1.0) {
                    r = ((r - 128) * contrastSetting) + 128;
                    g = ((g - 128) * contrastSetting) + 128;
                    b = ((b - 128) * contrastSetting) + 128;
                }

                if (saturationSetting !== 1.0) {
                    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                    r = gray + (r - gray) * saturationSetting;
                    g = gray + (g - gray) * saturationSetting;
                    b = gray + (b - gray) * saturationSetting;
                }

                if (noiseSetting > 0) {
                    const noise = generateGaussianNoise(noiseSetting);
                    r += noise; g += noise; b += noise;
                }

                r = Math.min(255, Math.max(0, r));
                g = Math.min(255, Math.max(0, g));
                b = Math.min(255, Math.max(0, b));

                let isEdge = false;
                if (edgeDetectionMode && x > 0 && y > 0 && x < targetWidth - 1 && y < targetHeight - 1) {
                    const idxRight = i + 4;
                    const idxDown = i + (targetWidth * 4);
                    const currentBrightness = 0.299 * r + 0.587 * g + 0.114 * b;
                    const rightBrightness = 0.299 * data[idxRight] + 0.587 * data[idxRight+1] + 0.114 * data[idxRight+2];
                    const downBrightness = 0.299 * data[idxDown] + 0.587 * data[idxDown+1] + 0.114 * data[idxDown+2];

                    if (Math.abs(currentBrightness - rightBrightness) > 30 || Math.abs(currentBrightness - downBrightness) > 30) {
                        isEdge = true;
                    }
                }

                const finalBrightness = 0.299 * r + 0.587 * g + 0.114 * b;
                let charIndex = Math.floor((finalBrightness / 255) * (currentPalette.length - 1));
                let char = currentPalette[(currentPalette.length - 1) - charIndex];

                if (edgeDetectionMode) {
                    char = isEdge ? '*' : ' ';
                } else if (solidPixelMode) {
                    char = char !== ' ' ? '█' : ' ';
                }

                if (thermalMode && char !== ' ') {
                    const normalized = finalBrightness / 255;
                    if (normalized < 0.25) {
                        r = 0; g = 0; b = 255 * (normalized / 0.25);
                    } else if (normalized < 0.5) {
                        r = 255 * ((normalized - 0.25) / 0.25); g = 0; b = 255;
                    } else if (normalized < 0.75) {
                        r = 255; g = 255 * ((normalized - 0.5) / 0.25); b = 0;
                    } else {
                        r = 255; g = 255 * ((1.0 - normalized) / 0.25); b = 255 * ((normalized - 0.75) / 0.25);
                    }
                }

                if (tintMode && !thermalMode && char !== ' ') {
                    const scalar = finalBrightness / 255;
                    r = tintRgb.r * scalar;
                    g = tintRgb.g * scalar;
                    b = tintRgb.b * scalar;
                }

                if (char !== ' ') {
                    if (isScanlineRow) {
                        displayCtx.fillStyle = `rgb(${Math.round(r * 0.25)},${Math.round(g * 0.25)},${Math.round(b * 0.25)})`;
                    } else {
                        displayCtx.fillStyle = `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
                    }
                    displayCtx.fillText(char, x * cellWidth, y * cellHeight);
                }
            }
        }

        const scaleX = window.innerWidth / displayCanvas.width;
        const scaleY = window.innerHeight / displayCanvas.height;
        displayCanvas.style.transform = `scale(${scaleX * 1.005}, ${scaleY * 1.005})`;

    } catch (e) {
        // Safe catch
    }
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

let lastFrameTime = 0;
const fpsInterval = 1000 / 15;

function liveRenderLoop(timestamp) {
    const isGame = location.pathname.includes('/game/') ||
                   location.pathname.includes('/duels/') ||
                   location.pathname.includes('/challenge/') ||
                   location.pathname.includes('/battle-royale/') ||
                   location.pathname.includes('/multiplayer/') ||
                   location.pathname.includes('/singleplayer/');

    if (isGame) {
        createUiPanel();
        if (asciiEnabled) {
            const elapsed = timestamp - lastFrameTime;
            if (elapsed > fpsInterval) {
                lastFrameTime = timestamp - (elapsed % fpsInterval);
                processPanoramaToAscii();
            }
        } else {
            removeAsciiCanvasOnly();
        }
    } else {
        if (lastKnownWebGLWidth !== 0 || lastKnownWebGLHeight !== 0) {
            lastKnownWebGLWidth = 0;
            lastKnownWebGLHeight = 0;
            clearAndForceResizeBuffers();
        }
        removeFullUiOverlay();
    }
    requestAnimationFrame(liveRenderLoop);
}

// Kick off engine loops cleanly
requestAnimationFrame(liveRenderLoop);