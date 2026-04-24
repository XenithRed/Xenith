export interface UserRecord {
    jid: string;
    name: string;
    firstSeen: string;
    lastSeen: string;
    messageCount: number;
}
export declare function registerUser(jid: string, name: string): UserRecord;
export declare function getAllUsers(): UserRecord[];
export declare function getUserCount(): number;
//# sourceMappingURL=users.d.ts.map