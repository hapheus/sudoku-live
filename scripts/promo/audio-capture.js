export function promoAudioInitScript() {
    return `(() => {
    if (window.__promoAudio) return;
    const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
    if (!NativeAudioContext) {
        window.__promoAudio = {
            start: async () => false,
            stop: async () => ({ base64: '', mimeType: 'audio/webm' }),
        };
        return;
    }

    const captureCtx = new NativeAudioContext();
    const captureDest = captureCtx.createMediaStreamDestination();
    const keepaliveOsc = captureCtx.createOscillator();
    const keepaliveGain = captureCtx.createGain();
    keepaliveGain.gain.value = 0;
    keepaliveOsc.connect(keepaliveGain);
    keepaliveGain.connect(captureDest);
    keepaliveOsc.start();

    const bridges = new WeakMap();
    const connectedNodes = new WeakSet();

    function getBridge(ctx) {
        if (!ctx || ctx === captureCtx) return null;
        if (bridges.has(ctx)) return bridges.get(ctx);
        try {
            const dest = ctx.createMediaStreamDestination();
            const source = captureCtx.createMediaStreamSource(dest.stream);
            source.connect(captureDest);
            bridges.set(ctx, dest);
            return dest;
        } catch {
            return null;
        }
    }

    const origConnect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function patchedConnect(destination, ...args) {
        const result = origConnect.call(this, destination, ...args);
        try {
            const ctx = this.context;
            if (ctx && destination === ctx.destination && ctx !== captureCtx && !connectedNodes.has(this)) {
                connectedNodes.add(this);
                const bridge = getBridge(ctx);
                if (bridge) {
                    origConnect.call(this, bridge);
                }
            }
        } catch {
            // Ignore non-audio nodes or closed contexts.
        }
        return result;
    };

    let activeRecorder = null;
    let recordedChunks = [];

    window.__promoAudio = {
        async start() {
            if (captureCtx.state === 'suspended') {
                await captureCtx.resume().catch(() => {});
            }
            recordedChunks = [];
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
            activeRecorder = new MediaRecorder(captureDest.stream, {
                mimeType,
                audioBitsPerSecond: 192000,
            });
            activeRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };
            activeRecorder.start(100);
            return true;
        },
        async stop() {
            if (!activeRecorder || activeRecorder.state === 'inactive') {
                return { base64: '', mimeType: 'audio/webm' };
            }
            const recorder = activeRecorder;
            activeRecorder = null;
            await new Promise((resolve) => {
                recorder.addEventListener('stop', resolve, { once: true });
                recorder.stop();
            });
            const blob = new Blob(recordedChunks, { type: recorder.mimeType || 'audio/webm' });
            const bytes = new Uint8Array(await blob.arrayBuffer());
            let binary = '';
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.length; i += chunkSize) {
                binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
            }
            return {
                base64: btoa(binary),
                mimeType: blob.type || 'audio/webm',
            };
        },
    };
})();`;
}

export function promoClockOffsetInitScript(secondsBeforeMidnight = 2.5) {
    return `(() => {
    const RealDate = Date;
    const realStart = RealDate.now();
    const target = new RealDate(2026, 10, 19, 23, 59, 60, 0).getTime() - ${Math.round(secondsBeforeMidnight * 1000)};
    const offset = target - realStart;

    class ShiftedDate extends RealDate {
        constructor(...args) {
            if (args.length === 0) {
                super(RealDate.now() + offset);
            } else {
                super(...args);
            }
        }
        static now() {
            return RealDate.now() + offset;
        }
    }

    ShiftedDate.UTC = RealDate.UTC;
    ShiftedDate.parse = RealDate.parse;
    window.Date = ShiftedDate;
})();`;
}
