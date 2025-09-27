// server.js
// Servidor TCP concorrente para LIST/PUT/QUIT com armazenamento em server_storage/

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

const HOST = getArg('host', '0.0.0.0');
const PORT = Number(getArg('port', '9000'));
const STORAGE = path.resolve(__dirname, 'server_storage');
if (!fs.existsSync(STORAGE)) fs.mkdirSync(STORAGE, {
    recursive: true
});

function uniquePath(dir, filename) {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let candidate = path.join(dir, filename);
    let i = 0;
    while (fs.existsSync(candidate)) {
        i += 1;
        candidate = path.join(dir, `${base}(${i})${ext}`);
    }
    return candidate;
}

const server = net.createServer((socket) => {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[+] Conexão de ${remote}`);

    let buffer = Buffer.alloc(0);
    let upload = null;

    socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const {
            frames,
            rest
        } = decodeFrames(buffer);
        buffer = rest;

        for (const frame of frames) {
            try {
                switch (frame.op) {
                    case OP.LIST: {
                        const files = fs.readdirSync(STORAGE).filter(f => fs.statSync(path.join(STORAGE, f)).isFile());
                        socket.write(encodeFrame(OP.LISTING, jsonBuf({
                            files
                        })));
                        break;
                    }
                    case OP.PUT_META: {
                        if (upload) {
                            socket.write(encodeFrame(OP.ERROR, jsonBuf({
                                message: 'Upload já em andamento'
                            })));
                            break;
                        }
                        const meta = parseJson(frame.payload);
                        if (!meta || typeof meta.filename !== 'string' || typeof meta.size !== 'number') {
                            socket.write(encodeFrame(OP.ERROR, jsonBuf({
                                message: 'PUT_META inválido'
                            })));
                            break;
                        }
                        const finalPath = uniquePath(STORAGE, path.basename(meta.filename));
                        const tempPath = finalPath + '.part';
                        const stream = fs.createWriteStream(tempPath);
                        upload = {
                            expected: meta.size,
                            received: 0,
                            stream,
                            tempPath,
                            finalPath
                        };
                        stream.on('error', () => {
                            socket.write(encodeFrame(OP.ERROR, jsonBuf({
                                message: 'Falha ao gravar arquivo'
                            })));
                            cleanupUpload(true);
                        });
                        socket.write(encodeFrame(OP.OK, jsonBuf({
                            message: 'OK para enviar DATA'
                        })));
                        break;
                    }
                    case OP.DATA: {
                        if (!upload) {
                            socket.write(encodeFrame(OP.ERROR, jsonBuf({
                                message: 'DATA sem PUT_META'
                            })));
                            break;
                        }
                        upload.stream.write(frame.payload);
                        upload.received += frame.payload.length;
                        if (upload.received > upload.expected) {
                            socket.write(encodeFrame(OP.ERROR, jsonBuf({
                                message: 'Excedeu tamanho esperado'
                            })));
                            cleanupUpload(true);
                            break;
                        }
                        if (upload.received === upload.expected) {
                            upload.stream.end(() => {
                                try {
                                    fs.renameSync(upload.tempPath, upload.finalPath);
                                    socket.write(encodeFrame(OP.OK, jsonBuf({
                                        message: 'Upload concluído',
                                        path: path.basename(upload.finalPath)
                                    })));
                                } catch {
                                    socket.write(encodeFrame(OP.ERROR, jsonBuf({
                                        message: 'Falha ao finalizar arquivo'
                                    })));
                                }
                                cleanupUpload(false);
                            });
                        }
                        break;
                    }
                    case OP.QUIT: {
                        socket.write(encodeFrame(OP.OK, jsonBuf({
                            message: 'Tchau'
                        })));
                        socket.end();
                        break;
                    }
                    default:
                        socket.write(encodeFrame(OP.ERROR, jsonBuf({
                            message: `OP desconhecida: 0x${frame.op.toString(16)}`
                        })));
                }
            } catch {
                socket.write(encodeFrame(OP.ERROR, jsonBuf({
                    message: 'Erro interno do servidor'
                })));
            }
        }
    });

    function cleanupUpload(removeTemp) {
        if (!upload) return;
        try {
            upload.stream.destroy();
        } catch {}
        if (removeTemp) {
            try {
                if (fs.existsSync(upload.tempPath)) fs.unlinkSync(upload.tempPath);
            } catch {}
        }
        upload = null;
    }

    socket.on('close', () => cleanupUpload(true));
});

server.listen(PORT, HOST, () => {
    console.log(`Servidor escutando em ${HOST}:${PORT}`);
});