const DEFAULT_HISTORY_LIMIT = 180;

export class ClientPrediction {
  constructor(historyLimit = DEFAULT_HISTORY_LIMIT) {
    this.historyLimit = historyLimit;
    this.history = new Map();
    this.lastAcknowledgedSeq = 0;
  }

  record(seq, position) {
    if (!Number.isFinite(seq)) return;
    this.history.set(seq, clonePosition(position));

    while (this.history.size > this.historyLimit) {
      this.history.delete(this.history.keys().next().value);
    }
  }

  reconcile(seq, authoritativePosition, currentPosition) {
    if (!Number.isFinite(seq) || seq <= this.lastAcknowledgedSeq) return null;

    const predictedPosition = this.history.get(seq);
    this.lastAcknowledgedSeq = seq;
    this.discardAcknowledged(seq);
    if (!predictedPosition) return null;

    const correction = {
      x: authoritativePosition.x - predictedPosition.x,
      y: authoritativePosition.y - predictedPosition.y,
      z: authoritativePosition.z - predictedPosition.z
    };

    // Later predictions were produced from the corrected position, so shift
    // their history too. This prevents repeated acknowledgements overcorrecting.
    for (const position of this.history.values()) {
      position.x += correction.x;
      position.y += correction.y;
      position.z += correction.z;
    }

    return {
      position: {
        x: currentPosition.x + correction.x,
        y: currentPosition.y + correction.y,
        z: currentPosition.z + correction.z
      },
      correction,
      error: Math.hypot(correction.x, correction.y, correction.z)
    };
  }

  reset(seq = 0) {
    this.history.clear();
    this.lastAcknowledgedSeq = Number.isFinite(seq) ? seq : 0;
  }

  discardAcknowledged(seq) {
    for (const key of this.history.keys()) {
      if (key <= seq) this.history.delete(key);
    }
  }
}

function clonePosition(position) {
  return { x: position.x, y: position.y, z: position.z };
}
