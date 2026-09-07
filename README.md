# VenVid

VenVid is a Vencord plugin that intercepts oversized video uploads, offering an intuitive UI to compress, trim, and change the resolution of your videos right inside Discord before they are sent. 

## Features
- **Upload Interception**: Automatically detects when you drag & drop, paste, or select oversized video files.
- **In-App Video Editor**: A compact UI that lets you preview the video, trim start/end times, and see live file size estimates.
- **Compression Settings**: Remove audio, set target resolutions, and let the integrated FFmpeg encoder optimize the bitrate to seamlessly fit into your current channel's exact upload limit.
- **Batch Processing**: When uploading multiple oversized videos at once, the editor will step you through each one sequentially.

## Installation Instructions

VenVid must be built directly into your Vencord installation.

1. **Clone this repository** into your Vencord `src/userplugins` folder (make sure the folder is named `venVid`):
   ```bash
   cd path/to/Vencord/src/userplugins
   git clone https://github.com/CaiCheng-Li/venVid.git
   ```
2. **Rebuild Vencord** so that the native FFmpeg processing elements are bundled into Vencord's main process:
   ```bash
   cd path/to/Vencord
   pnpm build
   ```
3. **Restart Discord Completely**: Since this plugin adds native background processing logic, a simple soft reload (Ctrl+R) is NOT enough.
   - Right click the Discord icon in your System Tray and select **Quit**.
   - Re-open Discord.
4. Open your Vencord Settings in Discord, go to the **Plugins** tab, and enable **VenVid**.

## Prerequisites
- **FFmpeg & FFprobe**: These tools must be installed on your system and accessible via your system's `PATH`.

## License
GPL-3.0-or-later; see [LICENSE](LICENSE).
