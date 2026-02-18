export function createInitialState() {
  return {
    trimmedCanvas: null,
    hasImage: false,
    isPlaying: false,
    isRecording: false,
    animId: null,
    posX: 0,
    posY: 0,
    velX: 1.2,
    velY: 0.8,
    time: 0,
    pingPong: false,
    colorTime: 0,
    recordStartTime: 0,
    customPalette: ["#ff00ff", "#00ffff", "#ffb703", "#00ff66", "#ff006e"],
    inputMode: "image",
    processRequestId: 0,
    loopFrameCount: 0,
    loopTotalFrames: 0,
    isWarmingUp: false,
  };
}
