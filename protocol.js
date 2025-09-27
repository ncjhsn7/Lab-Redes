// protocol.js
// Utilitários de framing (1 byte op + 4 bytes len + payload) e helpers.

const OP = {
    LIST: 0x01,
    PUT_META: 0x02,
    QUIT: 0x03,
    DATA: 0x11,
    OK: 0x10,
    ERROR: 0x7f,
    LISTING: 0x12,
};

function encodeFrame(op, payload) {
    const data = Buffer.isBuffer(payload) ?
        payload :
        payload == null ?
        Buffer.alloc(0) :
        Buffer.from(payload);
    const buf = Buffer.alloc(1 + 4 + data.length);
    buf.writeUInt8(op, 0);
    buf.writeUInt32BE(data.length, 1);
    data.copy(buf, 5);
    return buf;
}

function decodeFrames(buffer) {
    // Retorna { frames: Array<{op, payload:Buffer}>, rest:Buffer }
    const frames = [];
    let offset = 0;
    while (buffer.length - offset >= 5) {
        const op = buffer.readUInt8(offset);
        const len = buffer.readUInt32BE(offset + 1);
        const total = 5 + len;
        if (buffer.length - offset < total) break;
        const payload = buffer.slice(offset + 5, offset + 5 + len);
        frames.push({
            op,
            payload
        });
        offset += total;
    }
    const rest = buffer.slice(offset);
    return {
        frames,
        rest
    };
}

function jsonBuf(payload) {
    return Buffer.from(JSON.stringify(payload));
}

function parseJson(buf) {
    try {
        return JSON.parse(buf.toString('utf8'));
    } catch {
        return null;
    }
}

module.exports = {
    OP,
    encodeFrame,
    decodeFrames,
    jsonBuf,
    parseJson
};