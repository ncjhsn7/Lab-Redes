// client_interactive.js
const net = require('net');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
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

let buffer = Buffer.alloc(0);
let bytesSent = 0,
    bytesRecv = 0;

const socket = net.createConnection({
    host: HOST,
    port: PORT
}, () => {
    console.log(`[+] Conectado a ${HOST}:${PORT}`);
    prompt(); // inicia prompt interativo
});

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
    console.log('[-] Conexão encerrada');
    process.exit(0);
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
            break;
        case OP.OK:
            const msg = parseJson(frame.payload) || {};
            console.log('[OK]', msg.message || 'OK');
            break;
        case OP.ERROR:
            const err = parseJson(frame.payload) || {
                message: 'Erro desconhecido'
            };
            console.error('[ERRO]', err.message);
            break;
    }
    prompt(); // volta pro prompt depois de cada resposta
}

// ------------------------
// prompt interativo
// ------------------------
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function prompt() {
    rl.question('comando> ', (line) => {
        const [cmd, ...rest] = line.trim().split(' ');
        if (cmd === 'list') {
            send(OP.LIST);
        } else if (cmd === 'put') {
            const file = rest[0];
            if (!file || !fs.existsSync(file)) {
                console.error('Arquivo inválido');
                prompt();
                return;
            }
            const size = fs.statSync(file).size;
            const filename = path.basename(file);
            send(OP.PUT_META, jsonBuf({
                filename,
                size
            }));

            // envia depois de um pequeno atraso para esperar o OK
            socket.once('data', () => {
                const rs = fs.createReadStream(file, {
                    highWaterMark: 64 * 1024
                });
                rs.on('data', (chunk) => send(OP.DATA, chunk));
                rs.on('end', () => console.log('[i] Upload enviado'));
            });
        } else if (cmd === 'quit') {
            send(OP.QUIT);
            rl.close();
            socket.end();
        } else {
            console.log('Comando inválido. Use: list | put <arquivo> | quit');
            prompt();
        }
    });
}