# VenVid

VenVid is a Vencord plugin that intercepts oversized video uploads, offering an intuitive UI to compress, trim, and change the resolution of your videos right inside Discord before they are sent.

<p align="center">
  <img width="481" height="650" alt="image" src="https://github.com/user-attachments/assets/5e1b4cb8-5eea-4e43-b90a-bc8f4d5b59c3" />
</p>

## Features
- **Upload Interception**: Automatically detects when you drag & drop, paste, or select oversized video files.
- **In-App Video Editor**: A compact UI that lets you preview the video, trim start/end times, and see live file size estimates.
- **Compression Settings**: Remove audio, set target resolutions, and let the integrated FFmpeg encoder optimize the bitrate to seamlessly fit into your current channel's exact upload limit.
- **Batch Processing**: When uploading multiple oversized videos at once, the editor will step you through each one sequentially.

## Installation

### 1. Install FFmpeg & FFprobe

VenVid uses FFmpeg and FFprobe to compress and analyze video. Both must be installed and available in your system's `PATH`.

<details>
<summary><strong>Windows</strong></summary>

**Option A — winget (recommended)**
```powershell
winget install Gyan.FFmpeg
```
This installs FFmpeg and FFprobe and adds them to your `PATH` automatically.

**Option B — Manual install**
1. Download the latest **ffmpeg-release-full** build from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/) (the `ffmpeg-release-full.7z` archive).
2. Extract the archive to a permanent location, e.g. `C:\ffmpeg`.
3. Add the `bin` folder to your system `PATH`:
   - Open **Start** → search **"Edit the system environment variables"** → click **Environment Variables**.
   - Under **System variables**, select `Path` → **Edit** → **New** → enter `C:\ffmpeg\bin`.
   - Click **OK** on all dialogs.
4. Open a **new** terminal and verify:
   ```powershell
   ffmpeg -version
   ffprobe -version
   ```

</details>

<details>
<summary><strong>macOS</strong></summary>

```bash
brew install ffmpeg
```
Verify with:
```bash
ffmpeg -version && ffprobe -version
```

</details>

<details>
<summary><strong>Linux</strong></summary>

**Debian / Ubuntu:**
```bash
sudo apt update && sudo apt install ffmpeg
```

**Fedora:**
```bash
sudo dnf install ffmpeg
```

**Arch:**
```bash
sudo pacman -S ffmpeg
```

Verify with:
```bash
ffmpeg -version && ffprobe -version
```

</details>

### 2. Clone VenVid into Vencord

Clone this repository into your Vencord `src/userplugins` folder (make sure the folder is named `venVid`):
```bash
cd path/to/Vencord/src/userplugins
git clone https://github.com/CaiCheng-Li/venVid.git
```

### 3. Rebuild Vencord

Rebuild so that the native FFmpeg processing elements are bundled into Vencord's main process:
```bash
cd path/to/Vencord
pnpm build
```

### 4. Restart Discord

Since this plugin adds native background processing logic, a simple soft reload (Ctrl+R) is **not** enough.
- Right-click the Discord icon in your System Tray and select **Quit**.
- Re-open Discord.

### 5. Enable the plugin

Open your Vencord Settings in Discord, go to the **Plugins** tab, and enable **VenVid**.

## License
GPL-3.0-or-later; see [LICENSE](LICENSE).

## Preview and temporary files

Drag anywhere on the timeline to scrub; drag the blue handles to trim. Focus a timeline control and use the arrow keys for 0.1-second adjustments, Shift for 1-second adjustments, or Home/End to reach an endpoint.

The estimated size appears above the preview, below Destination, and changes to the final size after compression. Changing the trim or compression settings clears the previous result so the attached video matches the displayed settings.

Compression works on a temporary staged copy. Once encoding finishes, VenVid loads the result into memory and deletes the staged input, encoded file, and pass logs before enabling Attach. The original clip is never overwritten. Cancel stops processing immediately and waits for the staged input, partial compressed output, and pass logs to be deleted before closing the editor. If cleanup fails, the editor stays open with an error and Cancel retries the deletion. Unexpected editor removal also triggers cleanup.

## Development checks

From the Vencord checkout root, run the native regression checks with `pnpm exec tsx --test ../venVid/tests/native.test.ts` when using this workspace's standalone repository layout. These checks require FFmpeg and FFprobe and cover encoding, cancellation, temporary-file cleanup, and original-file preservation.
