# canbox-developer

The Canbox developer tool app — it gives Canbox app developers workflows such as debugging from a source directory and packaging for distribution.

[简体中文](./README_zh-CN.md)

## Features

### Debug launch from a source directory

Load a local source directory (pick its package.json) and launch it directly for debugging with `electron -r injection.js {sourceDir} --app-id={name} --no-sandbox`. Apps under development are not installed into `{Users}/apps/`; they run straight from the source directory.

`NODE_ENV=development` is set automatically on launch, so the app's main.js can decide between `loadURL` (dev server) and `loadFile` (build output).

### Packaging and distribution

#### Role and positioning

Packaging for distribution is essentially **archiving the `app.asar` already produced by the app's build process into a zip that follows the platform's standard layout**, so it can circulate and be installed uniformly within the platform. It only performs standard compression: it does not build, does not produce an asar, and does not upload anything to any remote service.

The resulting zip is the **only standard input** for installing a Canbox app: no matter which channel it reaches the user through, it is ultimately extracted and installed by canbox-manager's import logic. The value of packaging is turning a "build artifact" into a "standard artifact the platform can recognize", and it provides two independent distribution channels.

#### Two distribution channels

| Dimension            | Repository distribution                                                    | Package distribution (local import)                       |
| -------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| **Artifact source**  | GitHub/Gitee Release assets in a remote repository                         | A zip produced locally or by CI                           |
| **Repository need**  | Must be publicly accessible (manager probes metadata over HTTP raw and downloads the zip from the Release) | No repository needed; the zip is delivered directly       |
| **User action**      | Add a repo URL in canbox-manager → click "Install"; manager downloads the Release zip and imports it | Click "Import App" in canbox-manager → pick a local zip   |
| **Version updates**  | Manager detects a new Release version, prompts for update, one-click pull   | The user must obtain the new zip and import it again      |
| **Visibility**       | Repo metadata (package.json, README, logo) is publicly readable            | Only the zip is delivered; the source repo can stay private |
| **Best for**         | Open-source/public apps that should be discoverable and installable by platform users | Internal tools, private apps, targeted distribution        |

**Key distinction**: the repository "install" action is itself downloading a standard zip and running the import flow, so the final install path is identical for both channels (both extract to `apps/{appId}/`). The only difference is **how the zip reaches the user** — pulled from a public repo's Release, or imported as a local file. Consequently, when distributing through a repository, the developer still needs to produce the zip with package distribution first, then upload it to the repo's Release.

#### A special role of package distribution: privacy-sensitive scenarios

For apps that have privacy/security requirements and do not want to publish their source repository, package distribution is the only suitable channel:

- **The repository can stay private**: there is no need to push code to a public repo, nor to publish Release assets
- **Only the archived artifact is delivered**: users receive `app.asar` (an Electron asar archive) without exposing the source file structure and raw JS directly
- **Targeted distribution**: the zip can be delivered to specific users through any private channel (intranet, email, cloud drive) without going through a public repository

> Note: asar is an archive format, not encryption. Scenarios with stronger security requirements still need app-level protections such as code obfuscation and native compilation. Package distribution solves the "do not publish the repository" privacy distribution problem; it does not replace app-level code protection.

#### Workflow

1. The developer packages in a terminal with any Electron packaging tool (electron-builder, electron-forge, etc.) → produces a `resources/` directory (`app.asar` plus possibly `app.asar.unpacked/`)
2. In developer, click "Package for distribution" → select the `resources/` directory
3. developer extracts `package.json` and `logo.png` from the source directory automatically
4. It zips everything in the standard layout and outputs `{id}-{version}[-{platform}-{arch}].zip`

**Standard zip layout:**
```
{id}-{version}[-{platform}-{arch}].zip
├── app.asar                  # app code + JS dependencies
├── app.asar.unpacked/        # native modules (optional)
├── package.json              # app metadata
└── logo.png                  # app icon
```

**Note**: developer only performs standard compression; it does not build the asar for the app. Building the asar is the app developer's own job, done with any Electron packaging tool (electron-builder, electron-forge, etc.).

## Launching

```bash
npm install
npm run dev      # Vite dev server (port 5102)
npm run start    # electron -r canbox-core/injection.js . --app-id=canbox-developer --no-sandbox
npm run build    # Vite build
```

## Project structure

```
canbox-developer/
├── package.json          # name=canbox-developer, main=main.js
├── main.js               # main process + developer-specific IPC handlers
├── preload.js            # contextBridge (core API black box + developer API)
├── index.html            # HTML entry
├── vite.config.mjs       # Vite build config
├── .canbox-app           # Canbox app marker
├── README.md             # English README
├── README_zh-CN.md       # Chinese README
├── docs/APP_DEV.md       # app development guide
└── src/
    ├── main.js           # Vue 3 entry
    ├── App.vue           # main layout
    ├── router/router.js  # route config
    └── views/
        ├── ProjectsView.vue   # project list page
        └── SettingsView.vue   # settings page
```

## Tech stack

Electron / Vue 3 / Pinia / Vue Router / Element Plus / Vite / adm-zip

## License

Apache-2.0
