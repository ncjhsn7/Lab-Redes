// client.js
// Cliente CLI com comandos: list | put <arquivo> | quit
// Gera logs por conexão em client_logs/

const net = require('net');
const fs = require('fs');
const path = require('path');
const {
    OP,
    encodeFrame,
    decodeFrames,
    jsonBuf,
    parseJson
} = require('./protocol');

const args = process.argv.slice(2);

function getArg(name, def) {
    const idx = args.findIndex(a => a === `--${name}`);
    if (idx >= 0 && idx < args.length - 1) return args[idx + 1];
    return def;
}

const HOST = getArg('host', '127.0.0.1');
const PORT = Number(getArg('port', '9000'));
const CMD = args.find(a => ['list', 'put', 'quit'].includes(a)) || 'list';
const FILE = args[args.indexOf('put') + 1];

const LOG_DIR = path.resolve(__dirname, 'client_logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, {
    recursive: true
});

function startConnection() {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({
            host: HOST,
            port: PORT
        }, () => resolve(socket));
        socket.on('error', reject);
    });
}

async function main() {
    const startTs = Date.now();
    let bytesSent = 0;
    let bytesRecv = 0;

    const socket = await startConnection();
    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
        bytesRecv += chunk.length;
        buffer = Buffer.concat([buffer, chunk]);
        const {
            frames,
            rest
        } = decodeFrames(buffer);
        buffer = rest;
        for (const f of frames) handleFrame(f);
    });

    socket.on('close', () => {
        const endTs = Date.now();
        const durationSec = (endTs - startTs) / 1000;
        const throughput = durationSec > 0 ? (bytesSent / durationSec) : 0;
        const log = {
            command: CMD,
            file: FILE || null,
            bytesSent,
            bytesReceived: bytesRecv,
            durationSec,
            throughputBytesPerSec: Math.round(throughput)
        };
        const fname = path.join(LOG_DIR, `log_${Date.now()}.json`);
        fs.writeFileSync(fname, JSON.stringify(log, null, 2));
        console.log(`[i] Log salvo em ${fname}`);
    });

    function send(op, payload) {
        const buf = encodeFrame(op, payload);
        bytesSent += buf.length;
        socket.write(buf);
    }

    function handleFrame(frame) {
        switch (frame.op) {
            case OP.LISTING:
                const data = parseJson(frame.payload) || {
                    files: []
                };
                console.log('Arquivos no servidor:');
                for (const f of data.files) console.log(' -', f);
                socket.end();
                break;
            case OP.OK:
                const msg = parseJson(frame.payload) || {};
                if (CMD === 'put' && state.waitOkForData) {
                    state.waitOkForData = false;
                    streamFileData();
                } else if (CMD === 'put' && state.uploadInProgress && msg.message === 'Upload concluído') {
                    console.log(`[OK] ${msg.message} → ${msg.path}`);
                    socket.end();
                } else if (CMD === 'quit') {
                    console.log('[OK] Sessão encerrada');
                    socket.end();
                } else {
                    console.log('[OK]', msg.message || 'OK');
                    socket.end();
                }
                break;
            case OP.ERROR:
                const err = parseJson(frame.payload) || {
                    message: 'Erro desconhecido'
                };
                console.error('[ERRO]', err.message);
                socket.end();
                break;
        }
    }

    const state = {
        waitOkForData: false,
        uploadInProgress: false
    };

    if (CMD === 'list') {
        send(OP.LIST);
    } else if (CMD === 'quit') {
        send(OP.QUIT);
    } else if (CMD === 'put') {
        if (!FILE) return console.error('Uso: put <caminho/arquivo>');
        if (!fs.existsSync(FILE)) return console.error('Arquivo inexistente:', FILE);
        const size = fs.statSync(FILE).size;
        const filename = path.basename(FILE);
        send(OP.PUT_META, jsonBuf({
            filename,
            size
        }));
        state.waitOkForData = true;

        function streamFileData() {
            state.uploadInProgress = true;
            const rs = fs.createReadStream(FILE, {
                highWaterMark: 64 * 1024
            });
            rs.on('data', (chunk) => send(OP.DATA, chunk));
        }
    }
}

main();