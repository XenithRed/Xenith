import * as fs from 'fs'
import * as path from 'path'

const DB_PATH = path.join(process.cwd(), 'users.json')

export interface UserRecord {
  jid: string
  name: string
  firstSeen: string
  lastSeen: string
  messageCount: number
}

function loadDB(): Record<string, UserRecord> {
  try {
    if (fs.existsSync(DB_PATH)) {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'))
    }
  } catch {}
  return {}
}

function saveDB(db: Record<string, UserRecord>): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8')
}

export function registerUser(jid: string, name: string): UserRecord {
  const db = loadDB()
  const now = new Date().toISOString()

  if (db[jid]) {
    db[jid].lastSeen = now
    db[jid].messageCount += 1
    if (name && name !== 'Usuario') db[jid].name = name
  } else {
    db[jid] = { jid, name: name || 'Usuario', firstSeen: now, lastSeen: now, messageCount: 1 }
    console.log(`👤 Nuevo usuario: ${name} (${jid})`)
  }

  saveDB(db)
  return db[jid]
}

export function getAllUsers(): UserRecord[] {
  return Object.values(loadDB()).sort((a, b) =>
    new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
  )
}

export function getUserCount(): number {
  return Object.keys(loadDB()).length
}