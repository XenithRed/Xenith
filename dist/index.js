"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const pino_1 = __importDefault(require("pino"));
const dotenv = __importStar(require("dotenv"));
const qrcode_terminal_1 = __importDefault(require("qrcode-terminal"));
const ai_1 = require("./ai");
const users_1 = require("./users");
dotenv.config();
const logger = (0, pino_1.default)({ level: 'silent' });
const conversations = new Map();
const MAX_HISTORY = 20;
function getHistory(jid, userName) {
    if (!conversations.has(jid)) {
        conversations.set(jid, [{ role: 'system', content: (0, ai_1.buildSystemPrompt)(userName) }]);
    }
    return conversations.get(jid);
}
function addToHistory(jid, userName, role, content) {
    const history = getHistory(jid, userName);
    history.push({ role, content });
    if (history.length > MAX_HISTORY + 1) {
        const systemMsg = history[0];
        const trimmed = history.slice(-(MAX_HISTORY));
        conversations.set(jid, [systemMsg, ...trimmed]);
    }
}
const HELP_MESSAGE = `🤖 *Xenith AI*

*Comandos:*
- Texto normal → respuesta con IA
- \`/image <descripción>\` → genera imagen
- Envía una foto → analiza la imagen (el caption es la pregunta)
- \`/reset\` → borra tu historial
- \`/stats\` → estadísticas de usuarios

_Powered by Cloudflare Workers AI_`;
async function connectToWhatsApp() {
    const { state, saveCreds } = await (0, baileys_1.useMultiFileAuthState)('auth_info_baileys');
    const { version, isLatest } = await (0, baileys_1.fetchLatestBaileysVersion)();
    await (0, ai_1.acceptVisionLicense)();
    console.log(`\n🚀 Iniciando Xenith AI v${version.join('.')} ${isLatest ? '(latest)' : ''}`);
    const sock = (0, baileys_1.default)({
        version,
        logger,
        auth: {
            creds: state.creds,
            keys: (0, baileys_1.makeCacheableSignalKeyStore)(state.keys, logger),
        },
        generateHighQualityLinkPreview: false,
        browser: ['Xenith AI', 'Chrome', '1.0.0'],
    });
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('\n📱 Escanea el QR:\n');
            qrcode_terminal_1.default.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reason = baileys_1.DisconnectReason[statusCode] || statusCode;
            const shouldReconnect = statusCode !== baileys_1.DisconnectReason.loggedOut;
            console.log(`❌ Conexión cerrada. Motivo: ${reason}`);
            if (shouldReconnect) {
                console.log('🔄 Reconectando...');
                connectToWhatsApp();
            }
            else {
                console.log('🚫 Sesión cerrada. Elimina auth_info_baileys y reinicia.');
                process.exit(1);
            }
        }
        else if (connection === 'open') {
            console.log(`\n✅ Xenith AI conectado! Usuarios registrados: ${(0, users_1.getUserCount)()}\n`);
        }
    });
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify')
            return;
        for (const msg of messages) {
            if (!msg.message || msg.key.fromMe)
                continue;
            if (msg.key.remoteJid === 'status@broadcast')
                continue;
            const jid = msg.key.remoteJid;
            const msgContent = msg.message;
            const isImage = !!(msgContent.imageMessage);
            const text = msgContent.conversation || msgContent.extendedTextMessage?.text || '';
            const imageCaption = msgContent.imageMessage?.caption || '';
            if (!text.trim() && !isImage)
                continue;
            const user = (0, users_1.registerUser)(jid, msg.pushName || 'Usuario');
            const userName = user.name;
            console.log(`📩 [${new Date().toLocaleTimeString()}] ${userName} (#${user.messageCount}): ${isImage ? '[imagen]' + (imageCaption ? ` "${imageCaption}"` : '') : text.substring(0, 80)}`);
            await sock.readMessages([msg.key]).catch(() => { });
            await sock.sendPresenceUpdate('composing', jid).catch(() => { });
            try {
                if (text.trim().toLowerCase() === '/help' || text.trim().toLowerCase() === '/ayuda') {
                    await sock.sendMessage(jid, { text: HELP_MESSAGE }, { quoted: msg });
                    continue;
                }
                if (text.trim().toLowerCase() === '/reset') {
                    conversations.delete(jid);
                    await sock.sendMessage(jid, {
                        text: `🗑️ Historial borrado. Empezamos de cero, ${userName}.`
                    }, { quoted: msg });
                    continue;
                }
                if (text.trim().toLowerCase() === '/stats') {
                    const users = (0, users_1.getAllUsers)();
                    const total = (0, users_1.getUserCount)();
                    const top5 = users.slice(0, 5).map((u, i) => `${i + 1}. ${u.name} — ${u.messageCount} msgs`).join('\n');
                    await sock.sendMessage(jid, {
                        text: `📊 *Xenith AI Stats*\n\n👥 Usuarios totales: ${total}\n\n*Top 5 activos:*\n${top5}`
                    }, { quoted: msg });
                    continue;
                }
                if (isImage) {
                    console.log(`🔍 Analizando imagen de ${userName}...`);
                    await sock.sendMessage(jid, { text: '🔍 Analizando imagen...' });
                    const imageBuffer = await (0, baileys_1.downloadMediaMessage)(msg, 'buffer', {});
                    const question = imageCaption.trim() || 'Describe detalladamente lo que ves en esta imagen.';
                    const analysis = await (0, ai_1.analyzeImage)(imageBuffer, question);
                    addToHistory(jid, userName, 'user', `[${userName} envió una imagen${imageCaption ? ` con el mensaje: "${imageCaption}"` : ''}]`);
                    addToHistory(jid, userName, 'assistant', analysis);
                    await sock.sendMessage(jid, { text: analysis }, { quoted: msg });
                    console.log(`✅ Análisis enviado`);
                    continue;
                }
                if (text.toLowerCase().startsWith('/image ')) {
                    const prompt = text.slice(7).trim();
                    if (!prompt) {
                        await sock.sendMessage(jid, {
                            text: '⚠️ Incluye una descripción. Ejemplo: `/image un dragón azul en el espacio`'
                        }, { quoted: msg });
                        continue;
                    }
                    console.log(`🎨 Generando imagen: "${prompt}"`);
                    await sock.sendMessage(jid, { text: '🎨 Generando imagen...' });
                    const imageBuffer = await (0, ai_1.generateImage)(prompt);
                    await sock.sendMessage(jid, {
                        image: imageBuffer,
                        caption: `✨ *${prompt}*\n_Xenith AI_`,
                        mimetype: 'image/png',
                    }, { quoted: msg });
                    console.log(`✅ Imagen enviada`);
                    continue;
                }
                addToHistory(jid, userName, 'user', text);
                console.log(`💬 Respondiendo a ${userName}... (${getHistory(jid, userName).length - 1} msgs)`);
                const responseText = await (0, ai_1.generateText)(getHistory(jid, userName));
                addToHistory(jid, userName, 'assistant', responseText);
                await sock.sendMessage(jid, { text: responseText }, { quoted: msg });
                console.log(`✅ Listo`);
            }
            catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                console.error(`❌ Error: ${errMsg}`);
                await sock.sendMessage(jid, {
                    text: '❌ Error al procesar tu solicitud. Intenta de nuevo.'
                });
            }
            finally {
                await sock.sendPresenceUpdate('available', jid).catch(() => { });
            }
        }
    });
    process.on('uncaughtException', (err) => console.error('❌ Uncaught:', err));
    process.on('unhandledRejection', (reason) => console.error('❌ Unhandled:', reason));
}
connectToWhatsApp().catch((err) => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map