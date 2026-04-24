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
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerUser = registerUser;
exports.getAllUsers = getAllUsers;
exports.getUserCount = getUserCount;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const DB_PATH = path.join(process.cwd(), 'users.json');
function loadDB() {
    try {
        if (fs.existsSync(DB_PATH)) {
            return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
        }
    }
    catch { }
    return {};
}
function saveDB(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}
function registerUser(jid, name) {
    const db = loadDB();
    const now = new Date().toISOString();
    if (db[jid]) {
        db[jid].lastSeen = now;
        db[jid].messageCount += 1;
        if (name && name !== 'Usuario')
            db[jid].name = name;
    }
    else {
        db[jid] = { jid, name: name || 'Usuario', firstSeen: now, lastSeen: now, messageCount: 1 };
        console.log(`👤 Nuevo usuario: ${name} (${jid})`);
    }
    saveDB(db);
    return db[jid];
}
function getAllUsers() {
    return Object.values(loadDB()).sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
}
function getUserCount() {
    return Object.keys(loadDB()).length;
}
//# sourceMappingURL=users.js.map