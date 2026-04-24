import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import * as dotenv from 'dotenv'
import qrcode from 'qrcode-terminal'
import { generateImage, generateText, analyzeImage, acceptVisionLicense, buildSystemPrompt, Message } from './ai'
import { registerUser, getAllUsers, getUserCount } from './users'

dotenv.config()

const logger = pino({ level: 'silent' })

const conversations = new Map<string, Message[]>()
const MAX_HISTORY = 20

function getHistory(jid: string, userName: string): Message[] {
  if (!conversations.has(jid)) {
    conversations.set(jid, [{ role: 'system', content: buildSystemPrompt(userName) }])
  }
  return conversations.get(jid)!
}

function addToHistory(jid: string, userName: string, role: 'user' | 'assistant', content: string): void {
  const history = getHistory(jid, userName)
  history.push({ role, content })

  if (history.length > MAX_HISTORY + 1) {
    const systemMsg = history[0]
    const trimmed = history.slice(-(MAX_HISTORY))
    conversations.set(jid, [systemMsg, ...trimmed])
  }
}

const HELP_MESSAGE = `*Xenith AI*

*Comandos:*
- Texto normal → respuesta con IA
- \`/image <descripción>\` → genera imagen
- Envía una foto → analiza la imagen (el caption es la pregunta)
- \`/reset\` → borra tu historial
- \`/stats\` → estadísticas de usuarios

_Powered by Soblend Development Studio_`

async function connectToWhatsApp(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')
  const { version, isLatest } = await fetchLatestBaileysVersion()

  await acceptVisionLicense()

  console.log(`\n🚀 Iniciando Xenith AI v${version.join('.')} ${isLatest ? '(latest)' : ''}`)

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    generateHighQualityLinkPreview: false,
    browser: ['Xenith AI', 'Chrome', '1.0.0'],
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log('\n📱 Escanea el QR:\n')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const reason = DisconnectReason[statusCode as unknown as keyof typeof DisconnectReason] || statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      console.log(`❌ Conexión cerrada. Motivo: ${reason}`)
      if (shouldReconnect) {
        console.log('🔄 Reconectando...')
        connectToWhatsApp()
      } else {
        console.log('🚫 Sesión cerrada. Elimina auth_info_baileys y reinicia.')
        process.exit(1)
      }
    } else if (connection === 'open') {
      console.log(`\n✅ Xenith AI conectado! Usuarios registrados: ${getUserCount()}\n`)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue
      if (msg.key.remoteJid === 'status@broadcast') continue

      const jid = msg.key.remoteJid!
      const msgContent = msg.message
      const isImage = !!(msgContent.imageMessage)
      const text = msgContent.conversation || msgContent.extendedTextMessage?.text || ''
      const imageCaption = msgContent.imageMessage?.caption || ''

      if (!text.trim() && !isImage) continue

      const user = registerUser(jid, msg.pushName || 'Usuario')
      const userName = user.name

      console.log(`📩 [${new Date().toLocaleTimeString()}] ${userName} (#${user.messageCount}): ${isImage ? '[imagen]' + (imageCaption ? ` "${imageCaption}"` : '') : text.substring(0, 80)}`)

      await sock.readMessages([msg.key]).catch(() => {})
      await sock.sendPresenceUpdate('composing', jid).catch(() => {})

      try {
        if (text.trim().toLowerCase() === '/help' || text.trim().toLowerCase() === '/ayuda') {
          await sock.sendMessage(jid, { text: HELP_MESSAGE }, { quoted: msg })
          continue
        }

        if (text.trim().toLowerCase() === '/reset') {
          conversations.delete(jid)
          await sock.sendMessage(jid, {
            text: `🗑️ Historial borrado. Empezamos de cero, ${userName}.`
          }, { quoted: msg })
          continue
        }

        if (text.trim().toLowerCase() === '/stats') {
          const users = getAllUsers()
          const total = getUserCount()
          const top5 = users.slice(0, 5).map((u, i) =>
            `${i + 1}. ${u.name} — ${u.messageCount} msgs`
          ).join('\n')
          await sock.sendMessage(jid, {
            text: `📊 *Xenith AI Stats*\n\n👥 Usuarios totales: ${total}\n\n*Top 5 activos:*\n${top5}`
          }, { quoted: msg })
          continue
        }

        if (isImage) {
          console.log(`🔍 Analizando imagen de ${userName}...`)
          await sock.sendMessage(jid, { text: '🔍 Analizando imagen...' })
          const imageBuffer = await downloadMediaMessage(msg, 'buffer', {}) as Buffer
          const question = imageCaption.trim() || 'Describe detalladamente lo que ves en esta imagen.'
          const analysis = await analyzeImage(imageBuffer, question)
          addToHistory(jid, userName, 'user', `[${userName} envió una imagen${imageCaption ? ` con el mensaje: "${imageCaption}"` : ''}]`)
          addToHistory(jid, userName, 'assistant', analysis)
          await sock.sendMessage(jid, { text: analysis }, { quoted: msg })
          console.log(`✅ Análisis enviado`)
          continue
        }

        if (text.toLowerCase().startsWith('/image ')) {
          const prompt = text.slice(7).trim()
          if (!prompt) {
            await sock.sendMessage(jid, {
              text: '⚠️ Incluye una descripción. Ejemplo: `/image un dragón azul en el espacio`'
            }, { quoted: msg })
            continue
          }
          console.log(`🎨 Generando imagen: "${prompt}"`)
          await sock.sendMessage(jid, { text: '🎨 Generando imagen...' })
          const imageBuffer = await generateImage(prompt)
          await sock.sendMessage(jid, {
            image: imageBuffer,
            caption: `✨ *${prompt}*\n_Xenith AI_`,
            mimetype: 'image/png',
          }, { quoted: msg })
          console.log(`✅ Imagen enviada`)
          continue
        }

        addToHistory(jid, userName, 'user', text)
        console.log(`💬 Respondiendo a ${userName}... (${getHistory(jid, userName).length - 1} msgs)`)
        const responseText = await generateText(getHistory(jid, userName))
        addToHistory(jid, userName, 'assistant', responseText)
        await sock.sendMessage(jid, { text: responseText }, { quoted: msg })
        console.log(`✅ Listo`)

      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error)
        console.error(`❌ Error: ${errMsg}`)
        await sock.sendMessage(jid, {
          text: '❌ Error al procesar tu solicitud. Intenta de nuevo.'
        })
      } finally {
        await sock.sendPresenceUpdate('available', jid).catch(() => {})
      }
    }
  })

  process.on('uncaughtException', (err) => console.error('❌ Uncaught:', err))
  process.on('unhandledRejection', (reason) => console.error('❌ Unhandled:', reason))
}

connectToWhatsApp().catch((err) => {
  console.error('❌ Error fatal:', err)
  process.exit(1)
})