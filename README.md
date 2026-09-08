# VenVid

VenVid makes large video clips small enough to attach in Discord. You can preview a clip, choose which part to keep, lower its resolution, or remove its sound before uploading it.

Your original video stays unchanged. VenVid creates temporary working files and deletes them after preparing the attachment or when you cancel.

<p align="center">
  <img width="481" height="650" alt="image" src="https://github.com/user-attachments/assets/5e1b4cb8-5eea-4e43-b90a-bc8f4d5b59c3" />
</p>

## Start here

This guide starts with a computer that has no developer tools installed. You do not need to know how to write code.

VenVid is a **custom plugin for Vencord**, which is an add-on for the Discord desktop application. It is not a separate app or a Discord bot. Installing the normal Vencord download alone does not include VenVid: you need to create your own Vencord build with this plugin inside it. This is the installation method described by [Vencord's custom-plugin guide](https://docs.vencord.dev/installing/custom-plugins/).

Use the **Discord desktop app** for this guide. VenVid's video processing does not work in a browser tab or on a phone. Windows is the platform used for this project's local testing; the macOS and Ubuntu instructions below have not been tested end to end on fresh installations.

### Contents

- [1. Install Discord](#1-install-discord)
- [2. Install the setup tools](#2-install-the-setup-tools)
- [3. Download Vencord and VenVid](#3-download-vencord-and-venvid)
- [4. Build and connect Vencord to Discord](#4-build-and-connect-vencord-to-discord)
- [5. Turn on VenVid and send your first clip](#5-turn-on-venvid-and-send-your-first-clip)
- [Update VenVid later](#update-venvid-later)
- [Troubleshooting](#troubleshooting)
- [Disable or uninstall](#disable-or-uninstall)

### How to follow the commands

A **terminal** is a window where you type instructions for your computer. On Windows, this guide uses **PowerShell**. On macOS and Ubuntu, it uses **Terminal**.

Copy one command line, paste it into that window, and press **Enter**. Wait for the command to finish before running the next line. When it finishes, the window shows a new prompt where you can type again.

Copy only the text inside a command box. Keep the quotation marks. You do not need to replace your username in any of these commands.

If a command reports an error, stop at that step and check [Troubleshooting](#troubleshooting). Running the remaining commands usually will not fix a failed earlier step.

## 1. Install Discord

1. Open the [official Discord download page](https://discord.com/download) in your browser.
2. Choose the download for your computer.
3. Open the downloaded installer. On macOS, drag Discord into **Applications** if prompted. On Ubuntu, choose the **.deb** download and open it with your software installer.
4. Open Discord and sign in, or create an account.
5. Make sure you can see your chats, then fully quit Discord.

**Fully quit** means ending the app, not just closing its window:

- **Windows:** Near the clock at the bottom-right, click the small upward arrow if needed. Right-click the Discord icon and choose **Quit Discord**.
- **macOS:** With Discord selected, click **Discord → Quit Discord**, or press **Command + Q**.
- **Linux:** Use Discord's tray-menu **Quit** option if available.

If you already use a different Discord modification or a custom Vencord build, keep its settings and source folder. Do not overwrite that folder with this guide's fresh-install commands.

## 2. Install the setup tools

You will use these tools:

| Tool | What it does |
| --- | --- |
| Git | Downloads the Vencord and VenVid project folders and their updates. |
| Node.js | Runs the tools that prepare Vencord. Install the **24 LTS** version. |
| pnpm | Downloads the pieces Vencord needs and runs its build commands. |
| FFmpeg and FFprobe | Compress the video and read its details. They come together in the packages below. |

The `npx` tool comes with Node.js. The commands in this guide use it to run pnpm **11.9.0**, so you do not need to install pnpm separately. The `--yes` option lets it download that tool without an extra confirmation prompt. Windows commands use `npx.cmd` so they work with PowerShell's default script restrictions.

The version choices match the current [Vencord project requirements](https://github.com/Vendicated/Vencord/blob/main/package.json). See the [Node.js download page](https://nodejs.org/en/download) and [npx documentation](https://docs.npmjs.com/cli/v11/commands/npx/) for those tools.

**Open only the section for your operating system.**

<details>
<summary><strong>Windows — install the tools</strong></summary>

### Install Git and Node.js

1. Open [Git for Windows](https://git-scm.com/install/windows) and download the installer for your computer. Most Windows PCs use the **x64** version; use ARM64 if Windows **Settings → System → About → System type** says ARM.
2. Open the downloaded file and follow the installer. The default options are suitable, including making Git available from the command line.
3. Open the [Node.js download page](https://nodejs.org/en/download), select **24 LTS** and **Windows**, and download the **Windows Installer (.msi)** for your computer.
4. Run that installer with the default options. Keep **npm** and **Add to PATH** selected. If it offers an extra installation of tools for compiling native modules, you can leave that optional step unchecked for this guide.

### Install FFmpeg

1. Open the **Start** menu.
2. Type **PowerShell**.
3. Open **Windows PowerShell**. A normal window is enough; you do not need to start the whole setup as administrator.
4. Run:

```powershell
winget install --id Gyan.FFmpeg --exact
```

WinGet is Windows' app installation tool. Read any agreement or permission prompts and accept them if you want to continue.

If Windows says `winget` is not recognized, open **Microsoft Store**, search for **App Installer** by **Microsoft Corporation**, and install or update it. Then close PowerShell, open it again, and retry. Microsoft documents this in its [WinGet installation guide](https://learn.microsoft.com/en-us/windows/package-manager/winget/).

### Check the installations

Close **all** PowerShell and Windows Terminal windows, then open a new PowerShell window. This lets Windows find the newly installed tools.

Run these lines individually:

```powershell
git --version
node --version
npx.cmd --version
ffmpeg -version
ffprobe -version
```

Each command should print version information. The Node.js line should begin with `v24.`. FFmpeg and FFprobe print several lines; that is normal.

Keep this new PowerShell window open and continue to **Step 3**.

</details>

<details>
<summary><strong>macOS — install the tools</strong></summary>

### Install Node.js

Open the [Node.js download page](https://nodejs.org/en/download), select **24 LTS** and **macOS**, and download the **macOS Installer (.pkg)**. Open it and follow the installer.

### Install Homebrew, Git, and FFmpeg

Homebrew is a tool that installs software from Terminal.

1. Press **Command + Space**, type **Terminal**, and press **Enter**.
2. Open the [official Homebrew website](https://brew.sh/) and copy the command under **Install Homebrew** into Terminal.
3. Press **Enter** and follow its prompts. It may also install Apple's Command Line Tools.
4. If asked for your Mac login password, type it and press **Enter**. No dots or characters appear while you type a password in Terminal; this is normal.
5. At the end, follow Homebrew's printed **Next steps**. In particular, run any commands it gives you to add Homebrew to your shell environment.
6. Check that Homebrew is available:

```bash
brew --version
```

Then install Git and FFmpeg:

```bash
brew install git ffmpeg
```

The [Homebrew FFmpeg package](https://formulae.brew.sh/formula/ffmpeg) includes FFprobe.

### Check the installations

Close Terminal and open it again, then run:

```bash
git --version
node --version
npx --version
ffmpeg -version
ffprobe -version
```

Each command should print version information, and Node.js should begin with `v24.`. Keep Terminal open and continue to **Step 3**.

</details>

<details>
<summary><strong>Ubuntu Linux — install the tools</strong></summary>

These commands are for Ubuntu with its usual Bash terminal. Other Linux distributions use different package names or installers; do not copy Ubuntu's package commands into Fedora or Arch.

### Install Git and FFmpeg

Press **Ctrl + Alt + T** to open Terminal. Run:

```bash
sudo apt update
sudo apt install git curl ca-certificates ffmpeg
```

`sudo` asks Ubuntu to perform an administrator task. If prompted, type your computer login password and press **Enter**. The password is invisible while you type. If asked whether to continue, type `Y` and press **Enter**.

Ubuntu's [FFmpeg package](https://packages.ubuntu.com/noble/ffmpeg) provides the video tools.

### Install Node.js 24

Ubuntu's default Node.js package may be older than Vencord needs. Use **nvm**, a tool that installs Node.js for your own user account.

Run the installer command from the [official nvm instructions](https://github.com/nvm-sh/nvm#installing-and-updating):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.7/install.sh | bash
```

This downloads and runs nvm's setup script. When it finishes, close Terminal and open a new one. Then run:

```bash
nvm install 24
nvm alias default 24
```

### Check the installations

```bash
git --version
node --version
npx --version
ffmpeg -version
ffprobe -version
```

Each command should print version information, and Node.js should begin with `v24.`. Keep Terminal open and continue to **Step 3**.

</details>

## 3. Download Vencord and VenVid

These commands create a folder called **VenVidSetup** in your user folder. Inside it will be **Vencord**, with VenVid in the correct plugin folder.

Keep this folder after installation. You will use it to update or repair your custom build. Do not put it in a temporary folder or delete it after setup.

**Windows — PowerShell:**

```powershell
New-Item -ItemType Directory -Path "$env:USERPROFILE\VenVidSetup" -Force
Set-Location "$env:USERPROFILE\VenVidSetup"
git clone https://github.com/Vendicated/Vencord.git
Set-Location Vencord
git clone https://github.com/CaiCheng-Li/venVid.git src/userplugins/venVid
```

**macOS or Ubuntu — Terminal:**

```bash
mkdir -p "$HOME/VenVidSetup"
cd "$HOME/VenVidSetup"
git clone https://github.com/Vendicated/Vencord.git
cd Vencord
git clone https://github.com/CaiCheng-Li/venVid.git src/userplugins/venVid
```

`git clone` means “download this project into a new folder.” These public downloads do not require a GitHub account. Git creates the plugin's missing parent folders for you.

After both downloads finish, your folders should look like this:

```text
VenVidSetup/
└── Vencord/
    ├── package.json
    └── src/
        └── userplugins/
            └── venVid/
                ├── index.ts
                ├── native.ts
                └── README.md
```

There will be other files too. The important part is that `index.ts` sits directly inside `venVid`, not inside another nested copy of that folder.

If Git says the destination already exists, do not delete it. See [“Destination path already exists”](#destination-path-already-exists) below.

## 4. Build and connect Vencord to Discord

**Build** means turning the downloaded project files into something Discord can load. Run these commands from the **Vencord** folder, not from `src/userplugins/venVid`.

### Download the required pieces and build

Use the commands for your operating system. The first line returns you to the correct folder even if you opened a new terminal.

**Windows — PowerShell:**

```powershell
Set-Location "$env:USERPROFILE\VenVidSetup\Vencord"
npx.cmd --yes pnpm@11.9.0 install --frozen-lockfile
npx.cmd --yes pnpm@11.9.0 build
```

**macOS or Ubuntu — Terminal:**

```bash
cd "$HOME/VenVidSetup/Vencord"
npx --yes pnpm@11.9.0 install --frozen-lockfile
npx --yes pnpm@11.9.0 build
```

The first pnpm command downloads dependencies: the other software pieces Vencord needs. It may take a few minutes. The build command should finish with output files listed under `dist` and return to the prompt without an error.

### Connect this build to Discord

Make sure Discord is fully quit using the instructions in **Step 1**.

In the same terminal, run the command for your operating system:

**Windows:**

```powershell
npx.cmd --yes pnpm@11.9.0 inject
```

**macOS or Ubuntu:**

```bash
npx --yes pnpm@11.9.0 inject
```

This opens Vencord's installer for the build you just made. Follow its prompts to select your installed Discord app, usually **Discord Stable**, and install or patch it. In a text menu, use the keys shown on screen; a selection list commonly uses the arrow keys and **Enter**.

Wait for the installer to report success. If it cannot find Discord, open the desktop app once, sign in, fully quit it, and retry. Do not choose a random folder.

These build and installation steps follow the [official Vencord source-install guide](https://docs.vencord.dev/installing/). For a permissions error, follow the installer's specific instructions; do not rerun all download and build commands with administrator privileges.

## 5. Turn on VenVid and send your first clip

1. Open Discord.
2. Click the **gear icon** near your username to open **User Settings**.
3. Find the **Vencord** section in the settings list and open **Plugins**.
4. Search for **VenVid** and turn it on.
5. If Discord asks you to restart, fully quit and reopen it.

To try it:

1. Open the chat or channel where you want to send a video.
2. Drag a video file into the chat, or use Discord's **+** attachment button.
3. If the video exceeds that destination's upload limit, the **Compress Video** window opens. Smaller files continue through Discord normally.
4. Check **Destination** at the top. It currently shows the channel's numeric ID.
5. Drag along the timeline to preview different moments. Drag the blue handles to choose the part to keep, or type times into **Start** and **End**. Times are in seconds.
6. Optionally choose a lower **Resolution** or check **Remove audio**.
7. Click **Compress** and wait. VenVid processes the selection in two passes; it is normal to see “pass 1” followed by “pass 2.”
8. When **Final size** appears and **Attach Video** becomes available, click it. For several clips, use **Attach & Next** to prepare the next one.
9. Review the attachment in Discord, add your message if wanted, and press **Enter** to send it.

**Attach Video prepares the attachment; it does not send the message for you.**

A lower resolution can reduce visual detail. Removing audio makes the sent copy silent. Changing the trim or settings after compression means you must compress again.

### Your original and temporary files

- VenVid reads your original clip and leaves it unchanged.
- While processing, it stores a working copy, compressed output, and processing logs in a temporary folder.
- After compression, it loads the finished attachment into memory and deletes those temporary files before enabling **Attach Video**.
- Clicking **Cancel** stops the job and waits for the working copy, any partially compressed output, and logs to be removed.
- If deletion fails, the editor shows an error. Click **Cancel** again to retry.
- A computer crash or forced shutdown can interrupt cleanup; the normal completion and Cancel behavior above assumes the app can finish its cleanup.

The compressed file you see in Discord's message draft is the attachment being prepared for upload, not a second clip saved beside your original.

## Update VenVid later

Fully quit Discord first. Open a new terminal and run **one line at a time**, stopping if any line fails.

**Windows — PowerShell:**

```powershell
Set-Location "$env:USERPROFILE\VenVidSetup\Vencord"
git -C src/userplugins/venVid pull --ff-only
git pull --ff-only
npx.cmd --yes pnpm@11.9.0 install --frozen-lockfile
npx.cmd --yes pnpm@11.9.0 build
```

**macOS or Ubuntu — Terminal:**

```bash
cd "$HOME/VenVidSetup/Vencord"
git -C src/userplugins/venVid pull --ff-only
git pull --ff-only
npx --yes pnpm@11.9.0 install --frozen-lockfile
npx --yes pnpm@11.9.0 build
```

Reopen Discord after the build succeeds. A full quit and reopen is required for VenVid's background video-processing code; pressing **Ctrl + R** alone does not reload it.

If a Discord update removes Vencord, repeat **Connect this build to Discord** in Step 4 after rebuilding. If Git reports local changes or a conflict, keep your files and ask for help instead of deleting them or forcing the update.

## Troubleshooting

### A command is “not recognized” or “not found”

First close every terminal window and open a new one, then rerun the version checks in Step 2. If a check still fails, revisit the installation for that tool.

**PATH** is your computer's list of folders to search for commands. Installing a tool is not enough if your terminal or Discord cannot find it. After changing PATH, fully quit and reopen Discord too.

On macOS, follow Homebrew's printed **Next steps** if `brew` cannot be found. On Ubuntu, reopen Terminal after installing nvm before trying `nvm install 24`.

### PowerShell says scripts are disabled

Use `npx.cmd` exactly as shown in the Windows commands, rather than `npx`, `npm`, or `pnpm`. You do not need to change your computer's execution policy for this guide.

### “Destination path already exists”

The download folder already contains files, often from an earlier attempt.

Open your `VenVidSetup` folder in File Explorer or Finder. If `Vencord` contains `package.json` and `src/userplugins/venVid/index.ts` exists, continue with Step 4. If only the plugin is missing, return to the Vencord folder and run only the second `git clone` command from Step 3.

If the folder contains something else, keep it and ask for help before changing or deleting it.

### “No package.json” or “No importer manifest found”

The terminal is in the wrong folder. Run the first `Set-Location` or `cd` line from Step 4, then retry the failed command.

### Installation reports a Node.js or pnpm version error

Check `node --version`. These instructions use Node.js 24 LTS and pnpm 11.9.0; an old Node.js installation may still be selected in your terminal.

If an updated Vencord requires a different pnpm version, open `Vencord/package.json` in a text editor and find `"packageManager"`. Use the version after `pnpm@` in place of `11.9.0` in this guide's commands. Keep using pnpm to install Vencord's dependencies; do not substitute `npm install`.

### VenVid is missing from Plugins

Check that:

1. You are using the Discord desktop app.
2. The plugin's `index.ts` is directly in `Vencord/src/userplugins/venVid`.
3. The build in Step 4 completed without an error.
4. You ran the `inject` command from that same Vencord folder and selected the Discord app you actually use.
5. You fully quit and reopened Discord.

If the entire **Vencord** settings section is missing, revisit the installer step first.

### FFmpeg/FFprobe could not start, or an error mentions ENOENT

`ENOENT` often means the requested program or file could not be found.

Open a new terminal and run `ffmpeg -version` and `ffprobe -version`. If either fails, finish Step 2's video-tool installation. If both work but Discord still cannot find them, fully quit Discord and reopen it; restarting the computer can also refresh inherited environment settings.

On macOS, software opened from the Dock can have a different PATH from Terminal. If the checks work only in Terminal, fully quit Discord and launch it from that same Terminal to test:

```bash
/Applications/Discord.app/Contents/MacOS/Discord
```

### “The compressed video is not ready or exceeds the upload limit”

Fully quit Discord from its tray or app menu and reopen it, then retry. A newer editor can otherwise run alongside older background code that was loaded before an update.

If it still happens, follow **Update VenVid later** and restart again. If the updated error specifically says the output exceeds the limit, try a shorter selection or remove audio.

### Cancel reports that temporary files could not be removed

Wait a moment and click **Cancel** again. A temporary file may still be in use. Keep your original video; deleting it does not help this error.

### Still stuck?

[Open an issue in the VenVid repository](https://github.com/CaiCheng-Li/venVid/issues) and include:

- Your operating system.
- The numbered step where you got stuck.
- The command you ran and its exact error, or a screenshot.
- Whether you fully quit and reopened Discord.

Hide private chats, personal file paths, and other personal information in screenshots. You do not need to upload your private video just to report a setup problem.

## Disable or uninstall

To stop using VenVid, turn it off in **User Settings → Vencord → Plugins**. You can leave the project folder in place.

To remove your custom Vencord installation from Discord entirely, fully quit Discord, return to the Vencord folder from Step 4, and run the command for your system:

**Windows:**

```powershell
npx.cmd --yes pnpm@11.9.0 uninject
```

**macOS or Ubuntu:**

```bash
npx --yes pnpm@11.9.0 uninject
```

Follow the installer's uninstall prompts, then reopen Discord.

## For developers

The normal installation above puts the plugin directly inside Vencord. From the **Vencord root**, its native regression tests can be run with:

```bash
npx --yes pnpm@11.9.0 exec tsx --test src/userplugins/venVid/tests/native.test.ts
```

On Windows, use `npx.cmd` in place of `npx`.

For the separate-repository development layout, keep `venVid` beside `Vencord`, edit only the standalone plugin files, and run `& ../venVid/sync.ps1` from the Vencord root in PowerShell before building. In that layout, the test path is `../venVid/tests/native.test.ts`. FFmpeg and FFprobe are required for these tests.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
