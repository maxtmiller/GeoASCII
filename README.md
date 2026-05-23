# GeoASCII

![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black) ![Tampermonkey](https://img.shields.io/badge/Tampermonkey-008000?style=flat) ![WebGL](https://img.shields.io/badge/WebGL-990000?style=flat&logo=webgl&logoColor=white)

**Transforms GeoGuessr panoramas into a live, fully customizable ASCII text art display with native retro filter controls.**

---

## Preview

<img width="1710" height="986" alt="Screenshot 2026-05-23 at 1 13 31 in the morning" src="https://github.com/user-attachments/assets/a9da60a3-e811-4968-b7fa-3c13e06570b5" />

## Features

* **Master Rendering Sliders:** On-the-fly adjustment controls for resolution density, character palette depth, brightness, contrast, and color saturation.
* **Atmospheric Modifiers:** Smooth out text or add grit using the custom canvas pre-blur slider and Gaussian noise injector.
* **Visual Overhauls:** Toggle between solid retro blocks (**█**), edge-detection outlines (`*`), or color inversion.
* **CRT Scanlines:** Drops alternate row luminosity to perfectly mimic a vintage cathode-ray monitor.
* **Thermal Shading & Tinting:** Re-map luminance to a vibrant heat-map spectrum, or use the native hexadecimal color picker for custom monochromatic overlays.


* **Quick Utilities:** Instantly roll completely unique parameter configurations with the **Random (🎲)** tool, or instantly clear your workspace with the **Reset (🔄)** button.


## Setup

### 1. Enable Developer Mode in Your Browser

Modern browsers require **Developer Mode** to be active before userscript managers can run scripts effectively.

* Go to your browser's **Extensions** settings menu (e.g., `chrome://extensions` or `edge://extensions`).
* Toggle the **Developer mode** switch in the top-right corner to **On**.

### 2. Install & Activate the Script

* **Install a Manager:** Add a userscript manager extension like [Tampermonkey](https://www.tampermonkey.net/) to your browser.
* **Install the Script:** Head over to the [GeoASCII GreasyFork page](https://greasyfork.org/en/scripts/579392-geoascii) and click **"Install this script"**.
* **Verify It's On:** Open your Tampermonkey Dashboard and **ensure the GeoASCII script is toggled to Enabled**.

### 3. Play GeoGuessr

Load into a match and click the new **ASCII Shaders** button inside your sidebar menu to open the master control panel!

> 💡 **Tip:** Press `F12` to open your browser's **Developer Tools** console if you want to inspect performance, frame rates, or engine dimensions.
