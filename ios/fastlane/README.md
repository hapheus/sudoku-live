fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios sync_web

```sh
[bundle exec] fastlane ios sync_web
```

Build Vite web bundle and sync Capacitor iOS assets

### ios register_app

```sh
[bundle exec] fastlane ios register_app
```

Register Bundle ID and create App Store Connect app entry if missing

### ios archive

```sh
[bundle exec] fastlane ios archive
```

Build and export a signed App Store IPA locally (without uploading)

### ios beta

```sh
[bundle exec] fastlane ios beta
```

Build, bump build number, and upload to TestFlight (Internal Testing)

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
