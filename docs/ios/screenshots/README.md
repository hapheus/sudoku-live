# App Store screenshots

The [v1.14.1 image set](v1.14.1/) contains English RGB PNG captures from native iOS and iPadOS 27.2 simulators. Each of the six configurations includes Setup, Game, Settings and Watch in light and dark. Gameplay shows a 9×9 puzzle with candidate notes. Watch shows active sessions from a private local broker.

| Simulator | Display and orientation | Resolution |
| --- | --- | --- |
| [iPhone 18 Pro](v1.14.1/01-iphone-18-pro/) | Portrait | 1206 × 2622 |
| [iPad Pro 12.9-inch (6th generation)](v1.14.1/02-ipad-pro-129/) | Portrait | 2048 × 2732 |
| [iPhone Duo](v1.14.1/03-duo-closed-portrait/) | Outer display, portrait | 1398 × 2034 |
| [iPhone Duo](v1.14.1/04-duo-closed-landscape/) | Outer display, landscape | 2034 × 1398 |
| [iPhone Duo](v1.14.1/05-duo-open-portrait/) | Inner display, portrait | 2007 × 2853 |
| [iPhone Duo](v1.14.1/06-duo-open-landscape/) | Inner display, landscape | 2853 × 2007 |

The [Fist Bump image](v1.14.1/05-fist-bump-preview/fist-bump-dark.png) is a staged preview of the animation for internal selection.

## Generate a new set

Use macOS with Xcode, the appropriate iOS simulator runtime, and the project Node 22 environment.

```bash
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
npm run ios:devices
npm run ios:screenshots -- <simulator-udid>
```

The command builds a separate Simulator app and writes eight native JPEG captures in a new subfolder under `ios/App/build/screenshots/`. Choose a simulator UDID from the device list. The release app and its data use a separate bundle ID. The capture app stays installed on the Simulator for reuse.

Choose the orientation in Device Hub before running the command. On iPhone Duo, select the folded or unfolded position as well. The script uses the display and orientation reported by the running app. Run it once per pose. Use a full-screen Simulator window on the selected display.

Use `--lang de` for German or `--out <directory>` to change the output location. To capture Watch with live demo games, start a private loopback Centrifugo broker and at least one local game, then pass its WebSocket URL.

```bash
npm run ios:screenshots -- <simulator-udid> --lang de \
  --ws-url ws://127.0.0.1:8081/connection/websocket
```

Review the generated set before copying selected images into a versioned folder. See [Apple's screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/) for accepted sizes and screenshot limits.
